import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// 1.1.0 (IE-4, docs/import-export-plan.md §5b, §7c): the MoneyStats-layout
// ledger export in the app's language, its saved settings, and the round
// trip: export → import on an empty install gives the same accounts,
// balances, transfers, categories, tags and payment state, in every
// language and setting combination.
const executeFile = (path) => {
  const content = readFileSync(resolve(__dirname, '../../src', path), 'utf8');
  const fn = new Function('window', 'localStorage', 'crypto', content);
  fn(global.window, global.window.localStorage, global.window.crypto);
};

let mem;
let bootNo = 0;
const boot = (lang = 'it') => {
  let uid = 0;
  const prefix = 'x' + (++bootNo) + '-';
  mem = new Map();
  const ls = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: vi.fn((k, v) => { mem.set(k, String(v)); }), removeItem: (k) => { mem.delete(k); } };
  global.window = { crypto: { randomUUID: () => prefix + (++uid) }, localStorage: ls };
  global.localStorage = ls;
  ['db.js', 'i18n.js', 'i18n/en.js', 'i18n/fr.js', 'i18n/it.js', 'i18n/es.js', 'i18n/pt.js',
    'loan-engine.js', 'store.js', 'export.js', 'import.js'].forEach(executeFile);
  window.Store.init();
  window.Store.dispatch('SET_CURRENCY', 'EUR');
  window.Store.dispatch('SET_LANGUAGE', lang);
};

const S = () => window.Store;
const E = () => window.StackdExport;
const I = () => window.StackdImport;
const acc = (name) => S().getState().accounts.find(a => a.name === name);
const add = (account, date, type, amount, extra = {}) => S().dispatch('ADD_TRANSACTION', Object.assign({
  type, amount, accountId: acc(account).id, categoryId: '', date, comment: '' }, extra));

// A small install with every case the format has to carry.
const seed = () => {
  S().dispatch('ADD_ACCOUNT', { name: 'Cash', openingBalance: 313.6, openingDate: '2021-11-01', currency: 'EUR' });
  S().dispatch('ADD_ACCOUNT', { name: 'Bank', openingBalance: 1000, openingDate: '2021-11-01', currency: 'EUR' });
  S().dispatch('ADD_ACCOUNT', { name: 'Card', openingBalance: -84, openingDate: '2021-11-01', currency: 'EUR' });
  S().dispatch('ADD_ACCOUNT', { name: 'Zero', openingBalance: 0, openingDate: '2022-03-01', currency: 'EUR' });
  S().dispatch('ADD_ACCOUNT', { name: 'Revolut', openingBalance: 0, openingDate: '2021-11-01', currency: 'USD' });
  add('Bank', '2021-11-13', 'expense', 25.33, { categoryId: 'cat_shopping', comment: 'Vetri; "protezione"', tags: ['elettronica', 'regali-mia'] });
  add('Cash', '2021-11-15', 'expense', 2.5, { categoryId: 'cat_dining' });
  add('Bank', '2021-11-22', 'expense', 12, { categoryId: 'cat_rent', isPaid: false });
  add('Bank', '2021-12-15', 'income', 2363.58, { categoryId: 'cat_salary', comment: 'Stipendio\nnovembre' });
  add('Zero', '2022-02-15', 'expense', 5, { categoryId: 'cat_other' }); // before its opening
  add('Zero', '2022-03-05', 'expense', 3, { categoryId: 'cat_other' });
  add('Bank', '2099-02-28', 'expense', 3.5, { categoryId: 'cat_shopping' }); // planned
  S().dispatch('ADD_TRANSFER', { amount: 50, expenseAccountId: acc('Bank').id, incomeAccountId: acc('Cash').id, date: '2021-11-14', note: '' });
  S().dispatch('ADD_TRANSFER', { amount: 84, expenseAccountId: acc('Bank').id, incomeAccountId: acc('Card').id, date: '2021-11-15', note: 'saldo carta' });
  S().dispatch('ADD_TRANSFER', { amount: 110, expenseAccountId: acc('Revolut').id, incomeAccountId: acc('Bank').id, receivedAmount: 100, date: '2021-12-12', note: 'fx' });
};

const catName = (id) => (S().getState().categories.find(c => c.id === id) || {}).name || '';
const accName = (id) => (S().getState().accounts.find(a => a.id === id) || {}).name || '';
// What must survive the round trip.
const picture = () => {
  const st = S().getState();
  const accounts = st.accounts.map(a => ({
    name: a.name, currency: a.currency,
    balance: Math.round(S().getAccountBalance(a.id) * 100) / 100 || 0,
    opening: S().getAccountOpeningDate(a.id)
  })).sort((a, b) => a.name.localeCompare(b.name));
  const rows = st.transactions.filter(t => t.type !== 'opening_balance').map(t => {
    const partner = t.transferRef ? st.transactions.find(x => x.transferRef === t.transferRef && x !== t) : null;
    return [accName(t.accountId), t.date, t.type, Math.round(t.amount * 100), catName(t.categoryId),
      String(t.comment || '').replace(/\s*\n\s*/g, ' '), (t.tags || []).join(','), t.isPaid !== false,
      partner ? accName(partner.accountId) : ''].join('|');
  }).sort();
  return { accounts, rows };
};

const importText = (text) => {
  let out = null;
  let err = null;
  I().importText(text, { mode: 'commit' }, (r) => { out = r; }, (e) => { err = e; });
  if (err) throw err;
  return out;
};

describe('The ledger file (1.1.0 IE-4)', () => {
  beforeEach(() => { boot('it'); seed(); });

  it('Italian: the header is MoneyStats\' own, byte for byte, and its defaults are MoneyStats\'', () => {
    const b = E().buildLedger(S().getState());
    expect(b.text.split('\r\n')[0]).toBe('"Conto";"Data";"Ammontare";"Valuta";"Saldo";"Valuta";"Titolo";"Ricevente";"Uso";"Categoria";"Commento";"Hashtags";"Ammontare";"Valuta";"Tasso di cambio";"Stato del pagamento";"Marchio"');
    expect(b.prefs).toEqual({ format: 'csv', delimiter: ';', dateFormat: 'dd/MM/yyyy', decimal: 'comma', quoteAll: true, bom: true });
    expect(b.fileName).toMatch(/^Stackd_export_\d{14}\.csv$/);
  });

  it('English, Portuguese: MoneyStats\' headers; English defaults to , and MM/dd/yyyy', () => {
    S().dispatch('SET_LANGUAGE', 'en');
    const en = E().buildLedger(S().getState());
    expect(en.text.split('\r\n')[0]).toBe('"Account","Date","Amount","Currency","Account balance","Currency","Title","Receiver","Usage","Category","Comment","Tags","Amount","Currency","Exchange rate","Payment status","Mark"');
    expect(en.prefs).toMatchObject({ delimiter: ',', dateFormat: 'MM/dd/yyyy', decimal: 'dot' });
    S().dispatch('SET_LANGUAGE', 'pt');
    expect(E().buildLedger(S().getState()).text.split('\r\n')[0]).toBe('"Conta";"Data";"Montante";"Moeda";"Saldo";"Moeda";"Título";"Recebedor";"Uso";"Categoria";"Comentário";"Hashtags";"Montante";"Moeda";"Taxa de câmbio";"Status do pagamento";"Marca"');
  });

  it('balance rows first, then entries by date, a transfer\'s incoming leg first', () => {
    const lines = E().buildLedger(S().getState()).text.split('\r\n');
    expect(lines.slice(1, 6).map(l => l.split(";")[0])).toEqual(['"Bank"', '"Card"', '"Cash"', '"Revolut"', '"Zero"']); // the app's account order
    expect(lines[3]).toBe('"Cash";"01/11/2021";"0,00";"EUR";"313,60";"EUR";"Saldo";"";"";"";"";"";"0,00";"EUR";"1,00";"pagato";""');
    expect(lines.slice(1, 6).every(l => l.includes('"Saldo"'))).toBe(true);
    const i = lines.findIndex(l => l.includes('"14/11/2021"'));
    expect(lines[i]).toBe('"Cash";"14/11/2021";"50,00";"EUR";"0,00";"EUR";"Trasferimento";"";"";"Trasferimento";"";"";"50,00";"EUR";"1,00";"pagato";""');
    expect(lines[i + 1]).toContain('"Bank";"14/11/2021";"-50,00"');
  });

  it('cells: signed amounts, unpaid, tags, one-line notes, quotes; cross-currency counterpart', () => {
    const t = E().buildLedger(S().getState()).text;
    expect(t).toContain('"Bank";"13/11/2021";"-25,33";"EUR";"0,00";"EUR";"Shopping";"";"";"Shopping";"Vetri; ""protezione""";"elettronica | regali-mia";"-25,33";"EUR";"1,00";"pagato";""');
    expect(t).toContain('"Bank";"22/11/2021";"-12,00";"EUR";"0,00";"EUR";"Rent";"";"";"Rent";"";"";"-12,00";"EUR";"1,00";"non pagato";""');
    expect(t).toContain('"Stipendio novembre"');
    expect(t).toContain('"Bank";"12/12/2021";"100,00";"EUR";"0,00";"EUR";"Trasferimento";"";"";"Trasferimento";"fx";"";"-110,00";"USD";"1,1000";"pagato";""');
    expect(t).toContain('"Revolut";"12/12/2021";"-110,00";"USD";"0,00";"USD";"Trasferimento";"";"";"Trasferimento";"fx";"";"100,00";"EUR";"0,9091";"pagato";""');
  });

  it('settings: TXT is Tab and LF, unquoted; other dates and decimals', () => {
    const b = E().buildLedger(S().getState(), { format: 'txt', dateFormat: 'yyyy-MM-dd', decimal: 'dot' });
    expect(b.fileName).toMatch(/\.txt$/);
    expect(b.text.includes('\r')).toBe(false);
    expect(b.text.split('\n')[3]).toBe('Cash\t2021-11-01\t0.00\tEUR\t313.60\tEUR\tSaldo\t\t\t\t\t\t0.00\tEUR\t1.00\tpagato\t');
    const plain = E().buildLedger(S().getState(), { quoteAll: false, delimiter: ',' }).text;
    expect(plain.split('\r\n')[3]).toBe('Cash,01/11/2021,"0,00",EUR,"313,60",EUR,Saldo,,,,,,"0,00",EUR,"1,00",pagato,');
  });

  it('planned payments can be left out; a period keeps only its months', () => {
    expect(E().buildLedger(S().getState()).text).toContain('28/02/2099');
    expect(E().buildLedger(S().getState(), { includePlanned: false }).text).not.toContain('28/02/2099');
    const dec = E().buildLedger(S().getState(), { period: { start: '2021-12-01', end: '2021-12-31' } }).text.split('\r\n');
    expect(dec.filter(l => l.includes('/11/2021'))).toEqual([]);
  });

  it('a later period starts with each account\'s counted balance the day before', () => {
    const lines = E().buildLedger(S().getState(), { period: { start: '2021-12-01', end: '2021-12-31' } }).text.split('\r\n');
    const bank = lines.find(l => l.startsWith('"Bank";"01/12/2021";"0,00"'));
    expect(bank).toContain('"Saldo"');
    expect(bank).toContain('"' + '840,67' + '"'); // 1000 - 25.33 - 50 - 84 (the unpaid 12 is not counted)
  });

  it('an account opening after the period still gets its balance row when the period holds earlier entries', () => {
    const lines = E().buildLedger(S().getState(), { period: { start: '2022-02-01', end: '2022-02-28' } }).text.split('\r\n');
    expect(lines.find(l => l.startsWith('"Zero";"01/03/2022";"0,00"'))).toBeTruthy();
  });

  it('exportLedger delivers with the BOM setting and the file type', async () => {
    const calls = [];
    E()._download = (name, text, type, o) => { calls.push({ name, type, bom: o.bom, head: text.slice(0, 7) }); return Promise.resolve(true); };
    await E().exportLedger(S().getState(), { bom: false, format: 'txt' });
    await E().exportLedger(S().getState());
    expect(calls[0]).toMatchObject({ type: 'text/plain;charset=utf-8;', bom: false });
    expect(calls[0].name).toMatch(/\.txt$/);
    expect(calls[1]).toMatchObject({ type: 'text/csv;charset=utf-8;', bom: true, head: '"Conto"' });
  });
});

describe('Export settings are saved (1.1.0 IE-4)', () => {
  beforeEach(() => boot('fr'));

  it('SET_EXPORT_PREFS keeps known values, persists, reloads and is cleared by a reset', () => {
    expect(S().getExportPrefs()).toMatchObject({ delimiter: ';', dateFormat: 'dd/MM/yyyy', decimal: 'comma' });
    S().dispatch('SET_EXPORT_PREFS', { dateFormat: 'dd.MM.yyyy', delimiter: '|', bom: false });
    expect(S().getExportPrefs()).toMatchObject({ dateFormat: 'dd.MM.yyyy', delimiter: ';', bom: false });
    expect(JSON.parse(mem.get('stackd_v1_exportPrefs')).dateFormat).toBe('dd.MM.yyyy');
    S().state.exportPrefs = null;
    expect(S()._reloadSlice('exportPrefs')).toBe(true);
    expect(S().getExportPrefs().dateFormat).toBe('dd.MM.yyyy');
    S().dispatch('RESET_APP');
    expect(S().state.exportPrefs).toBeNull();
    expect(mem.has('stackd_v1_exportPrefs')).toBe(false);
  });
});

describe('Round trip: export → import on an empty install (1.1.0 IE-4)', () => {
  const FORMATS = ['dd/MM/yyyy', 'dd-MM-yyyy', 'dd.MM.yyyy', 'MM/dd/yyyy', 'yyyy-MM-dd'];
  ['en', 'fr', 'it', 'es', 'pt'].forEach((lang, li) => {
    FORMATS.forEach((dateFormat, fi) => {
      const k = li * FORMATS.length + fi;
      const prefs = { dateFormat, decimal: k % 2 ? 'comma' : 'dot', format: k % 3 === 0 ? 'txt' : 'csv',
        delimiter: [';', ',', '\t'][k % 3], quoteAll: k % 4 !== 1 };
      it(`${lang} · ${JSON.stringify(prefs)}`, () => {
        boot(lang);
        seed();
        const want = picture();
        const text = E().buildLedger(S().getState(), prefs).text;
        boot(lang);
        const r = importText(text);
        expect(r.kind).toBe('ledger');
        expect(r.skippedCount).toBe(0);
        expect(picture()).toEqual(want);
      });
    });
  });

  it('a file whose dates are all ambiguous reads in this install\'s saved export order', () => {
    boot('en');
    S().dispatch('ADD_ACCOUNT', { name: 'Cash', openingBalance: 10, openingDate: '2026-01-02', currency: 'EUR' });
    add('Cash', '2026-03-04', 'expense', 1, { categoryId: 'cat_other' });
    S().dispatch('SET_EXPORT_PREFS', { dateFormat: 'MM/dd/yyyy' });
    const text = E().buildLedger(S().getState()).text;
    const want = picture();
    const prefs = S().state.exportPrefs;
    boot('en');
    S().dispatch('SET_EXPORT_PREFS', prefs);
    importText(text);
    expect(picture()).toEqual(want);
  });

  it('a partial period re-imports with the right balances at its end', () => {
    boot('it');
    seed();
    const end = '2021-12-31';
    const want = Object.fromEntries(S().getState().accounts.map(a => [a.name, Math.round(S().getBalanceAtDate(end, [a.id]) * 100) / 100]));
    const text = E().buildLedger(S().getState(), { period: { start: '2021-12-01', end } }).text;
    boot('it');
    importText(text);
    S().getState().accounts.forEach(a => {
      expect(Math.round(S().getBalanceAtDate(end, [a.id]) * 100) / 100, a.name).toBe(want[a.name]);
    });
  });
});
