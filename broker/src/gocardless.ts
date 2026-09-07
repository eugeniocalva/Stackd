// GoCardless Bank Account Data client. Holds the ONE aggregator secret pair
// (wrangler secrets), caches the 24h access token in the SystemDO + per
// isolate, and never logs a response body — transaction JSON only transits.
import type { Env, Config } from './env';
import { SystemClient } from './durable-objects';

export class GcError extends Error {
  constructor(public status: number, public code: string, message?: string) {
    super(message || code);
  }
}

export interface GcInstitution {
  id: string;
  name: string;
  bic?: string;
  logo?: string;
  countries?: string[];
  transaction_total_days?: string | number;
  max_access_valid_for_days?: string | number;
}

export interface GcRequisition {
  id: string;
  status: string;
  link?: string;
  accounts?: string[];
  institution_id?: string;
  agreement?: string;
  reference?: string;
}

type FetchImpl = (input: string, init?: RequestInit) => Promise<Response>;

interface TokenMemo {
  access: string;
  expiresAt: number;
}

const TOKEN_SKEW_MS = 60 * 1000;
const BREAKER_PAUSE_MS = 10 * 60 * 1000;

export class GoCardless {
  // Per-isolate memo; the SystemDO is the shared source of truth.
  private static memo: TokenMemo | null = null;
  static resetMemo(): void {
    GoCardless.memo = null;
  }

  private system: SystemClient;

  constructor(
    private env: Env,
    private cfg: Config,
    private fetchImpl: FetchImpl,
    private now: () => number = () => Date.now()
  ) {
    this.system = new SystemClient(env);
  }

  private async accessToken(force = false): Promise<string> {
    const t = this.now();
    if (!force && GoCardless.memo && GoCardless.memo.expiresAt > t + TOKEN_SKEW_MS) return GoCardless.memo.access;
    if (!force) {
      const shared = await this.system.getToken();
      if (shared && shared.expiresAt > t + TOKEN_SKEW_MS) {
        GoCardless.memo = shared;
        return shared.access;
      }
    }
    if (!this.env.GC_SECRET_ID || !this.env.GC_SECRET_KEY) throw new GcError(503, 'aggregator_not_configured');
    const res = await this.fetchImpl(`${this.cfg.gcBaseUrl}/token/new/`, {
      method: 'POST',
      headers: { accept: 'application/json', 'content-type': 'application/json' },
      body: JSON.stringify({ secret_id: this.env.GC_SECRET_ID, secret_key: this.env.GC_SECRET_KEY })
    });
    if (!res.ok) throw new GcError(502, 'aggregator_auth_failed');
    const data = (await res.json()) as { access: string; access_expires: number };
    const memo = { access: data.access, expiresAt: t + Number(data.access_expires || 86400) * 1000 };
    GoCardless.memo = memo;
    await this.system.putToken(memo);
    return memo.access;
  }

  private async checkBreaker(): Promise<void> {
    const b = await this.system.getBreaker();
    if (b.pausedUntil && b.pausedUntil > this.now()) throw new GcError(503, 'aggregator_paused');
  }

  async request<T>(path: string, init: RequestInit = {}, retry = true): Promise<T | null> {
    await this.checkBreaker();
    const token = await this.accessToken();
    const headers = new Headers(init.headers || {});
    headers.set('accept', 'application/json');
    headers.set('authorization', `Bearer ${token}`);
    if (init.body) headers.set('content-type', 'application/json');
    const res = await this.fetchImpl(`${this.cfg.gcBaseUrl}${path}`, { ...init, headers });
    if (res.status === 401 && retry) {
      await this.accessToken(true);
      return this.request<T>(path, init, false);
    }
    if (res.status === 429) {
      // Per-account daily limits are the bank's, not ours: surface them.
      // Anything else is the aggregator quota → pause every caller for a while.
      if (path.startsWith('/accounts/')) throw new GcError(429, 'account_rate_limited');
      await this.system.setBreaker(this.now() + BREAKER_PAUSE_MS);
      throw new GcError(503, 'aggregator_rate_limited');
    }
    if (res.status === 404) throw new GcError(404, 'aggregator_not_found');
    if (!res.ok) throw new GcError(502, `aggregator_error_${res.status}`);
    if (res.status === 204) return null;
    return (await res.json()) as T;
  }

  institutions(country: string): Promise<GcInstitution[]> {
    return this.request<GcInstitution[]>(`/institutions/?country=${encodeURIComponent(country)}`).then(r => r || []);
  }

  createAgreement(p: { institutionId: string; historyDays: number; validityDays: number }): Promise<{ id: string }> {
    return this.request<{ id: string }>('/agreements/enduser/', {
      method: 'POST',
      body: JSON.stringify({
        institution_id: p.institutionId,
        max_historical_days: p.historyDays,
        access_valid_for_days: p.validityDays,
        access_scope: ['balances', 'details', 'transactions']
      })
    }) as Promise<{ id: string }>;
  }

  createRequisition(p: { redirect: string; institutionId: string; agreementId: string; reference: string; userLanguage: string }): Promise<GcRequisition> {
    return this.request<GcRequisition>('/requisitions/', {
      method: 'POST',
      body: JSON.stringify({
        redirect: p.redirect,
        institution_id: p.institutionId,
        agreement: p.agreementId,
        reference: p.reference,
        user_language: p.userLanguage
      })
    }) as Promise<GcRequisition>;
  }

  getRequisition(id: string): Promise<GcRequisition> {
    return this.request<GcRequisition>(`/requisitions/${encodeURIComponent(id)}/`) as Promise<GcRequisition>;
  }

  async deleteRequisition(id: string): Promise<void> {
    try {
      await this.request(`/requisitions/${encodeURIComponent(id)}/`, { method: 'DELETE' });
    } catch (e) {
      if (e instanceof GcError && e.status === 404) return; // already gone
      throw e;
    }
  }

  accountDetails(id: string): Promise<{ account: { iban?: string; currency?: string; name?: string; product?: string } }> {
    return this.request(`/accounts/${encodeURIComponent(id)}/details/`) as Promise<{ account: { iban?: string; currency?: string; name?: string; product?: string } }>;
  }

  balances(id: string): Promise<unknown> {
    return this.request(`/accounts/${encodeURIComponent(id)}/balances/`);
  }

  transactions(id: string, dateFrom?: string, dateTo?: string): Promise<unknown> {
    const q = new URLSearchParams();
    if (dateFrom) q.set('date_from', dateFrom);
    if (dateTo) q.set('date_to', dateTo);
    const qs = q.toString();
    return this.request(`/accounts/${encodeURIComponent(id)}/transactions/${qs ? '?' + qs : ''}`);
  }
}
