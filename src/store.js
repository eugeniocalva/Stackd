// store.js - Pub/Sub State Manager
const DEFAULT_CATEGORIES = [
  { id: 'cat_balance', name: 'Adjustment', icon: 'scale', isDefault: true, typeHint: 'both', color: '#64748b' },
  { id: 'cat_debt', name: 'Loan Payment', icon: 'landmark', isDefault: true, typeHint: 'expense', color: '#6366f1' },
  { id: 'cat_dining', name: 'Dining Out', icon: 'utensils', isDefault: true, typeHint: 'expense', color: '#f59e0b' },
  { id: 'cat_entertainment', name: 'Entertainment', icon: 'clapperboard', isDefault: true, typeHint: 'expense', color: '#8b5cf6' },
  { id: 'cat_freelance', name: 'Freelance', icon: 'laptop', isDefault: true, typeHint: 'income', color: '#6366f1' },
  { id: 'cat_groceries', name: 'Groceries', icon: 'shopping-cart', isDefault: true, typeHint: 'expense', color: '#10b981' },
  { id: 'cat_health', name: 'Health', icon: 'hospital', isDefault: true, typeHint: 'expense', color: '#ef4444' },
  { id: 'cat_investments', name: 'Investments', icon: 'trending-up', isDefault: true, typeHint: 'income', color: '#00c9a7' },
  { id: 'cat_other', name: 'Other', icon: 'package', isDefault: true, typeHint: 'both', color: '#64748b' },
  { id: 'cat_rent', name: 'Rent', icon: 'home', isDefault: true, typeHint: 'expense', color: '#3b82f6' },
  { id: 'cat_salary', name: 'Salary', icon: 'hand-coins', isDefault: true, typeHint: 'income', color: '#10b981' },
  { id: 'cat_shopping', name: 'Shopping', icon: 'shopping-bag', isDefault: true, typeHint: 'expense', color: '#ec4899' },
  { id: 'cat_transport', name: 'Transport', icon: 'car', isDefault: true, typeHint: 'expense', color: '#06b6d4' },
  { id: 'cat_utilities', name: 'Utilities', icon: 'zap', isDefault: true, typeHint: 'expense', color: '#eab308' }
];

window.Store = {
  // v0.65: every color holds >=3:1 (WCAG graphics) against both card surfaces
  // (#ffffff light, #161e2e dark) — used for chart lines, icon glyphs, accents.
  // v0.89 P8d: the account "type" is a closed enum, and the ENGLISH value is
  // what gets stored on the record (and exported) — only its label is
  // localized, by stable value. Anything unrecognised (older/imported data)
  // falls through to the raw stored string rather than showing a bare key.
  ACCOUNT_TYPES: ['Bank', 'Debit card', 'Cash', 'Savings', 'Credit card', 'Investment', 'Wallet', 'Account'],

  accountTypeLabel(value) {
    if (!value) return window.I18n ? window.I18n.t('accType.Account') : 'Account';
    if (!this.ACCOUNT_TYPES.includes(value) || !window.I18n) return value;
    return window.I18n.t('accType.' + value);
  },

  ACCOUNT_COLORS: [
    '#E60023', // 01 Monster Red     (4.8 / 3.5)
    '#EA580C', // 02 Pure Orange     (3.6 / 4.7)
    '#B8860B', // 03 Antique Gold    (3.3 / 5.1)
    '#61980B', // 04 High-Vis Lime   (3.5 / 4.8)
    '#248A3D', // 05 TR Green        (4.4 / 3.8)
    '#0D9488', // 06 Deep Mint       (3.7 / 4.5)
    '#0284C7', // 07 Sky Blue        (4.1 / 4.1)
    '#0075EB', // 08 Revolut Blue    (4.4 / 3.8)
    '#5A5FEF', // 09 Electric Blue   (4.9 / 3.4)
    '#7B61FF', // 10 Royal Purple    (4.2 / 4.0)
    '#CC00FF', // 11 Magenta Pop     (4.2 / 4.0)
    '#FF2D55', // 12 Shocking Pink   (3.7 / 4.6)
    '#64748B', // 13 Graphite        (4.8 / 3.5)
    '#78716C', // 14 Warm Stone      (4.8 / 3.5)
  ],
  // Pre-v0.65 palette values remap to their same-hue replacement so existing
  // accounts keep their identity instead of being reassigned by index.
  LEGACY_ACCOUNT_COLOR_MAP: {
    '#FF9500': '#EA580C', // Pure Orange
    '#FFD600': '#B8860B', // Neon Gold
    '#32D74B': '#61980B', // High-Vis Lime
    '#00C9A7': '#0D9488', // Deep Mint
    '#00B3FF': '#0284C7', // Sky Blue
    '#1326FD': '#5A5FEF', // Electric Blue
    '#374151': '#64748B', // Graphite
    '#161618': '#78716C', // Obsidian Black -> Warm Stone
  },

  // 1.0.2 (BUG-24): markup-safety validators. Account colours and icons are
  // ENUMERATIONS written unescaped into style="" and data-lucide="" (~30
  // sites), and ids into data-id/value attributes, so the write paths validate
  // them (and a boot heal repairs what 1.0-1.0.1 imports stored). Free text
  // (names, tags, types, notes) is never rewritten: it is escaped at render
  // through I18n.esc.
  //
  // A colour is a palette swatch (the only thing the form can produce); legacy
  // hues map 1:1, case-insensitively. Anything else returns null, and the
  // caller keeps its fallback -- the same rule the boot migration in init()
  // already enforces, applied on write instead of one start later.
  normalizeAccountColor(value) {
    const c = String(value == null ? '' : value).trim().toUpperCase();
    if (this.LEGACY_ACCOUNT_COLOR_MAP[c]) return this.LEGACY_ACCOUNT_COLOR_MAP[c];
    return this.ACCOUNT_COLORS.includes(c) ? c : null;
  },

  // A Lucide name or a legacy emoji (main.js EMOJI_MAP): never whitespace, a
  // quote, a bracket, an ampersand, a backslash, a backtick or '='.
  isSafeIcon(value) {
    return typeof value === 'string' && /^[^\s<>"'&\\`=]{1,40}$/.test(value);
  },

  // Generated ids are UUIDs or 'cat_x'; an id read from a file must look the
  // same, or it is replaced (callers generate a fresh one). Returns the
  // TRIMMED id when safe, otherwise null.
  safeId(value) {
    const s = String(value == null ? '' : value).trim();
    return /^[A-Za-z0-9_.:-]{1,64}$/.test(s) ? s : null;
  },

  // An id cell read from a file: kept when safe, otherwise mapped to a
  // STABLE safe id ('f-' + 64-bit FNV-1a-style hash of the trimmed cell), so
  // every file that names the same id (SeriesId <-> LinkedSeriesId, AccountId
  // <-> the accounts file's id, a re-imported Id) still meets on the same
  // value. '' / null / undefined -> null.
  fileId(value) {
    const s = String(value == null ? '' : value).trim();
    if (!s) return null;
    const safe = this.safeId(s);
    if (safe) return safe;
    let h1 = 0x811c9dc5, h2 = 0x9747b28c;
    for (let i = 0; i < s.length; i++) {
      const c = s.charCodeAt(i);
      h1 = Math.imul(h1 ^ c, 0x01000193);
      h2 = Math.imul(h2 ^ c, 0x5bd1e995);
    }
    return 'f-' + (h1 >>> 0).toString(16).padStart(8, '0') + (h2 >>> 0).toString(16).padStart(8, '0');
  },

  // 1.0.2 (BUG-24): boot heal for icons stored before 1.0.2 (colours are
  // healed by the account migration in init()). Only values that could
  // never be an icon are replaced -- they rendered as a blank box anyway.
  // Idempotent; saves only the slice it changed. Returns whether it did.
  _healMarkupFields() {
    const { accs, cats } = this._sanitizeMarkupFields();
    if (accs) window.StackdDB.save('accounts', this.state.accounts);
    if (cats) window.StackdDB.save('categories', this.state.categories);
    return accs || cats;
  },

  // 1.0.2 (BUG-24): the in-memory half of the heal -- never saves. Also run
  // whenever accounts/categories are read back from disk (a change or a boot
  // rolled back at the quota, another tab's write), so memory never holds an
  // unsafe icon or colour even while disk still does: the icon sinks write
  // data-lucide="..." unescaped. 'which' limits it to one slice.
  _sanitizeMarkupFields(which) {
    let accs = false, cats = false;
    if (which !== 'categories') {
      (this.state.accounts || []).forEach((a, i) => {
        if (!a) return;
        if (!this.isSafeIcon(a.icon)) { a.icon = 'wallet'; accs = true; }
        const color = this.normalizeAccountColor(a.color) || this.ACCOUNT_COLORS[i % this.ACCOUNT_COLORS.length];
        if (a.color !== color) { a.color = color; accs = true; }
      });
    }
    if (which !== 'accounts') {
      (this.state.categories || []).forEach(c => { if (c && !this.isSafeIcon(c.icon)) { c.icon = 'pin'; cats = true; } });
    }
    return { accs, cats };
  },
  state: {
    accounts: [],
    categories: [],
    transactions: [],
    budgets: [],
    currency: 'USD',
    activeView: 'dashboard',
    activeMonthFilter: '', // Will hold 'YYYY-MM' (Legacy)
    activePeriod: {
      type: 'month', // 'today', 'week', 'month', 'year'
      value: '' // 'YYYY-MM-DD' anchor
    },
    // v0.85: the half-built activeTagFilter/SET_TAG_FILTER pair was removed —
    // real tag filtering now lives in historyFilters.tags (getFilteredTransactions).
    language: 'en',
    historySortOrder: 'desc', // 'asc' or 'desc'
    defaultAccountId: '', // v0.53
    enableTimeInput: false,
    isSelectionMode: false,
    selectedTransactionIds: [],



    // Page-specific Filters (v0.55)
    historyFilters: {
      period: { type: 'month', value: '', start: '', end: '' },
      types: [],
      accounts: [],
      categories: [],
      // v0.85: tag filter. Empty = match all; '__untagged__' is the sentinel
      // for transactions carrying no tags (see getFilteredTransactions).
      tags: [],
      sortOrder: 'asc'  // Default: Oldest First
    },
    analyticsFilters: {
      period: { type: 'month', value: '', start: '', end: '' },
      types: [],
      accounts: [],
      categories: [],
      tags: [],
      sortOrder: 'desc'
    },
    expandedGraphFilters: {
      interval: 'monthly', // 'weekly', 'monthly', 'quarter'
      accounts: [],
      categories: []
    },

    // ── Loans (v0.71 Phase 2, docs/debt-rebuild-plan.md §5) ─────────────────
    // v2 record shape:
    // {
    //   id: string,                  -- UUID
    //   name: string,                -- e.g. 'Car Loan'
    //   kind: 'sim' | 'active',      -- saved simulation vs tracked loan
    //   config: object,              -- LoanEngine input config (source of truth)
    //   linkedSeriesId: string|null, -- recurring-expense series (set in Phase 4)
    //   createdAt: string,
    //   updatedAt: string|null
    // }
    // Legacy v1 fields (amount, tan, durationMonths, startDate, endDate,
    // monthlyPayment, totalReimbursement) are retained on migrated/legacy-added
    // records until Phase 3 replaces the old DebtView.
    loans: [],
    // v0.71 Phase 3: transient simulator hand-off (form → results); never persisted
    debtSim: null,
    // v0.71 Phase 4: armed loan→series link {loanId, seriesId}. ADD_TRANSACTION
    // consumes it when the matching recurring series is actually created, so a
    // loan is only marked as tracked if the user goes through with the form.
    pendingLoanLink: null,
    theme: 'system', // 'system', 'light', 'dark'
    activeTheme: 'light', // 'light' or 'dark'
    analyticsBalanceMode: 'today', // v0.64 - 'today' | 'end': hero balance basis when the period extends past today

    // ── Home dashboard widgets (v0.72, docs/home-widgets-plan.md §3) ────────
    // Record shape: { id, type, size: 'small'|'large', config: {}, createdAt }.
    // Array order IS display order. Rendering is driven entirely by
    // window.Widgets.registry[type]; unknown types render a placeholder card
    // rather than throwing, so a downgrade never bricks the dashboard.
    homeWidgets: [],
    // Transient edit affordance (remove/reorder chrome); never persisted, same
    // as isSelectionMode — it must not survive a reload or a tab switch.
    widgetEditMode: false,

    // ── Bank import presets (v0.99, docs/bank-import-plan.md §3) ────────────
    // Record shape: { id, signature, mapping, createdAt, updatedAt }.
    // signature = the file's squashed header labels joined with '|', so a
    // returning bank layout is recognised and its column mapping pre-applied.
    // Capped at 20 (evict smallest updatedAt) in SAVE_IMPORT_PRESET.
    importPresets: [],
    // v1.01: ordered category rules for imported rows — {id, match (lowercase
    // substring), categoryId, createdAt}. First match wins; newest rules sit
    // at the front (ADD_IMPORT_RULE prepends and dedupes by match).
    importRules: [],
    // v1.05 Bank Connect (docs/bank-connect-ux-plan.md B2). `bankConnect` =
    // per-device prefs + cached entitlement (see _bankConnectDefaults);
    // `bankConnections` = {ref, institutionId, institutionName, logo,
    // accounts: [{bankAccountId, stackdAccountId, ibanTail, currency}],
    // connectedAt, lastFetchAt, expiresAt, historyLimitDays, status}.
    // Opaque ids only. Both slices are per-device and deliberately OUTSIDE
    // the CSV backup; the device token itself never enters state.
    bankConnect: null,
    bankConnections: [],
    pro: null, // v1.13: Stack'd Pro entitlement (see _proDefaults)

    initialized: false
  },

  listeners: [],

  // v1.05: fresh defaults every call — callers merge, never mutate a shared object.
  _bankConnectDefaults() {
    return {
      enabled: false,          // D-C10: the network consent switch
      consentAt: null,
      consentVersion: null,    // en 'terms.updatedDate' at consent time
      historyDays: 90,         // D-C8 default; 0 = institution maximum
      validityDays: 180,
      importFrom: null,        // one-shot override for the next fetch
      pendingRef: null,        // requisition awaiting the App Link return
      pendingInstitution: null,
      pendingReplaceRef: null, // v1.08 B4: the expired connection a reconnect replaces
      ownerId: null,           // opaque broker owner id (support id tail)
      entitlement: { active: false, expiresAt: null }
    };
  },

  _loadBankConnect() {
    const d = this._bankConnectDefaults();
    const saved = window.StackdDB.load('bankConnect', null);
    if (!saved || typeof saved !== 'object') return d;
    return Object.assign(d, saved, { entitlement: Object.assign(d.entitlement, saved.entitlement || {}) });
  },

  // v1.13 Stack'd Pro (docs/pro-unlock.md): the one-time unlock, decided by
  // the app store and cached here. Separate from bankConnect.entitlement,
  // which the broker owns and clears on disable.
  _proDefaults() {
    return { active: false, productId: null, platform: null, purchasedAt: null, transactionId: null };
  },

  _loadPro() {
    const d = this._proDefaults();
    const saved = window.StackdDB.load('pro', null);
    return saved && typeof saved === 'object' ? Object.assign(d, saved) : d;
  },

  // 1.0.2 (BUG-34, D-U7-10): the boot (seeds, migrations, heals, the
  // recurring pass) is one change too — a boot save that does not fit puts
  // memory back to what is on disk before the first render, and the launch
  // variant of the storage sheet explains it. Returns false in that case.
  _booting: false,
  init() {
    this._booting = true;
    try {
      return this.batch(() => this._initState());
    } finally {
      this._booting = false;
    }
  },

  _initState() {
    this.state.accounts = window.StackdDB.load('accounts', []);
    this.state.categories = window.StackdDB.load('categories', []);
    this.state.transactions = window.StackdDB.load('transactions', []);
    this.state.budgets = window.StackdDB.load('budgets', []);
    this.state.loans = window.StackdDB.load('loans', []);
    this.state.currency = window.StackdDB.load('currency', 'USD');
    this.state.language = window.StackdDB.load('language', 'en');
    // v0.86 P8a: keep the i18n engine in sync with the persisted language.
    // Guarded because a few unit test chains load store.js without i18n.js.
    if (window.I18n) window.I18n.setLang(this.state.language);
    this.state.historySortOrder = window.StackdDB.load('historySortOrder', 'desc');
    this.state.defaultAccountId = window.StackdDB.load('defaultAccountId', '');
    this.state.theme = window.StackdDB.load('theme', 'system');
    this.state.enableTimeInput = window.StackdDB.load('enableTimeInput', false);
    this.state.analyticsBalanceMode = window.StackdDB.load('analyticsBalanceMode', 'today');
    // v0.72 Phase 5: Recent Activities left the dashboard when the widget area
    // shipped, so a user who has NEVER configured widgets (key absent — distinct
    // from a deliberately-emptied []) gets a Latest-transactions widget seeded
    // once, keeping recent movement visible after the upgrade. Idempotent: the
    // seed itself persists the key, so this branch can never run twice.
    if (localStorage.getItem(window.StackdDB.PREFIX + 'homeWidgets') === null) {
      this.state.homeWidgets = this._defaultHomeWidgets();
      window.StackdDB.save('homeWidgets', this.state.homeWidgets);
    } else {
      this.state.homeWidgets = window.StackdDB.load('homeWidgets', []);
    }
    this.state.importPresets = window.StackdDB.load('importPresets', []); // v0.99
    this.state.importRules = window.StackdDB.load('importRules', []); // v1.01
    this.state.bankConnect = this._loadBankConnect(); // v1.05
    this.state.bankConnections = window.StackdDB.load('bankConnections', []); // v1.05
    this.state.pro = this._loadPro(); // v1.13
    this.applyTheme();
    this.initThemeListener();
    // Restore persisted history sort preference (default: asc = Oldest First)
    this.state.historyFilters.sortOrder = window.StackdDB.load('historyFilterSortOrder', 'asc');
    this.state.expandedGraphFilters = window.StackdDB.load('expandedGraphFilters', {
      interval: 'monthly',
      accounts: [],
      categories: []
    });


    if (this.state.categories.length === 0) {
      this.state.categories = [...DEFAULT_CATEGORIES];
      window.StackdDB.save('categories', this.state.categories);
    }

    let accountsChanged = false;
    this.state.accounts.forEach((acc, index) => {
      // 1. Color Migration (legacy hues remap 1:1, unknowns assigned by index)
      if (acc.color && this.LEGACY_ACCOUNT_COLOR_MAP[acc.color]) {
        acc.color = this.LEGACY_ACCOUNT_COLOR_MAP[acc.color];
        accountsChanged = true;
      } else if (!acc.color || !this.ACCOUNT_COLORS.includes(acc.color)) {
        acc.color = this.ACCOUNT_COLORS[index % this.ACCOUNT_COLORS.length];
        accountsChanged = true;
      }
      // 2. Icon & Type Migration (v0.53)
      if (!acc.icon || !acc.type) {
        const name = (acc.name || '').toLowerCase();
        if (name.includes('cash')) {
          acc.icon = acc.icon || 'banknote';
          acc.type = acc.type || 'Cash';
        } else if (name.includes('card') || name.includes('visa') || name.includes('revolut') || name.includes('debit')) {
          acc.icon = acc.icon || 'credit-card';
          acc.type = acc.type || 'Debit card';
        } else if (name.includes('bank') || name.includes('savings') || name.includes('checking')) {
          acc.icon = acc.icon || 'landmark';
          acc.type = acc.type || 'Bank';
        } else {
          acc.icon = acc.icon || 'wallet';
          acc.type = acc.type || 'Account';
        }
        accountsChanged = true;
      }
      // 3. v1.02: per-account currency (docs/bank-import-plan.md §6a) —
      // pre-existing accounts adopt the primary currency, idempotently.
      if (!acc.currency) {
        acc.currency = this.state.currency;
        accountsChanged = true;
      }
    });

    if (accountsChanged) {
      window.StackdDB.save('accounts', this.state.accounts);
    }
    this._healMarkupFields(); // 1.0.2 (BUG-24)

    // v0.71 Phase 4: one-time seed of the 'Loan Payment' category for existing
    // installs. Flag-guarded so it is never resurrected once the user deletes it.
    if (!window.StackdDB.load('catDebtSeeded', false)) {
      if (!this.state.categories.some(c => c.id === 'cat_debt')) {
        const def = DEFAULT_CATEGORIES.find(c => c.id === 'cat_debt');
        if (def) {
          this.state.categories.push({ ...def });
          window.StackdDB.save('categories', this.state.categories);
        }
      }
      window.StackdDB.save('catDebtSeeded', true);
    }

    // v0.71 Phase 2: wrap legacy v1 loan records with a LoanEngine config.
    // Idempotent — records that already carry a config are left untouched.
    let loansChanged = false;
    this.state.loans.forEach((loan) => {
      if (!loan.config) {
        loan.kind = loan.kind === 'sim' ? 'sim' : 'active';
        loan.config = this._loanConfigFromLegacy(loan);
        loan.linkedSeriesId = loan.linkedSeriesId || null;
        loansChanged = true;
      }
    });
    if (loansChanged) {
      window.StackdDB.save('loans', this.state.loans);
    }

    // Initialize filters
    const today = new Date();
    // 1.0.1 (BUG-19) local date, not toISOString(): in UTC+ zones the first
    // hours of the 1st used to boot History/Analytics on the previous month.
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    const monthStr = todayStr.substring(0, 7) + '-01';
    
    this.state.activeMonthFilter = todayStr.substring(0, 7);
    this.state.activePeriod = {
      type: 'month',
      value: monthStr
    };

    // Initialize Page Filters (v0.55)
    this.state.historyFilters.period.value = monthStr;
    this.state.analyticsFilters.period.value = monthStr;
    this._liveDay = todayStr; // 1.0.2 (BUG-69) the local day both periods were last reconciled on
    
    // v0.29 Migration: Deprecate 'balance_adjustment' type
    let migrationChanged = false;
    this.state.transactions.forEach(t => {
      // Convert Manual Balance Adjustments to regular Income/Expense
      if (t.type === 'balance_adjustment') {
        t.type = 'income';
        migrationChanged = true;
      }
      if (t.isAdjustment) {
        delete t.isAdjustment;
        migrationChanged = true;
      }
      if (!t.time) {
        if (t.createdAt && t.createdAt.includes('T')) {
          const timePart = t.createdAt.split('T')[1];
          t.time = timePart ? timePart.substring(0, 8) : this._getSystemTimeString();
        } else {
          t.time = this._getSystemTimeString();
        }
        migrationChanged = true;
      }
    });
    
    // Rename 'Balance' category if it exists in state
    const balCat = this.state.categories.find(c => c.id === 'cat_balance');
    if (balCat && balCat.name === 'Balance') {
      balCat.name = 'Adjustment';
      migrationChanged = true;
    }

    if (migrationChanged) {
      window.StackdDB.save('transactions', this.state.transactions);
      window.StackdDB.save('categories', this.state.categories);
    }

    // v0.51: Emoji to Lucide Migration (Legacy WebView Compatibility)
    const ICON_MIGRATION_MAP = {
      // Finance
      '💰': 'banknote', '💸': 'banknote', '💳': 'credit-card', '🏦': 'landmark', '💹': 'trending-up', '📉': 'trending-down',
      // Food & Drink
      '🍽️': 'utensils', '🍴': 'utensils', '🍔': 'utensils', '🍕': 'pizza', '🍳': 'utensils', '🍱': 'utensils', '🍦': 'ice-cream', '🥑': 'leaf', '☕': 'coffee', '🥤': 'cup-soda', '🍺': 'beer', '🍰': 'cake',
      // Transport
      '🚗': 'car', '🚌': 'bus', '🚇': 'train', '✈️': 'plane', '🛳️': 'ship', '🚲': 'bike', '⛽': 'fuel', '📌': 'map-pin',
      // Home & Utilities
      '🏠': 'home', '💡': 'zap', '🚿': 'droplets', '📶': 'wifi', '📺': 'tv', '❄️': 'refrigerator',
      // Lifestyle
      '🎭': 'clapperboard', '🎬': 'clapperboard', '🎵': 'music', '🎟️': 'ticket', '🎮': 'gamepad-2', '📷': 'camera', '🎨': 'palette', '💼': 'briefcase', '📔': 'book', '📱': 'smartphone',
      // Shopping
      '🛍️': 'shopping-bag', '🛒': 'shopping-cart', '🏷️': 'tag', '🎁': 'gift', '👕': 'shirt', '⌚': 'watch',
      // Health
      '🏥': 'hospital', '🏨': 'building', '🏫': 'school', '🎓': 'graduation-cap', '🩺': 'activity', '💊': 'pill', '💪': 'dumbbell', '👶': 'baby', '❤️': 'heart',
      // Other
      '📍': 'pin', '📦': 'package', '⭐': 'star', '🔖': 'bookmark', '🔔': 'bell', '🚩': 'flag', '❓': 'help-circle', '🌐': 'globe', '🐕': 'dog', '🐈': 'cat', '🍀': 'clover', '💻': 'laptop'
    };

    let categoriesMigrated = false;
    this.state.categories.forEach(cat => {
      if (ICON_MIGRATION_MAP[cat.icon]) {
        cat.icon = ICON_MIGRATION_MAP[cat.icon];
        categoriesMigrated = true;
      }
    });

    if (categoriesMigrated) {
      window.StackdDB.save('categories', this.state.categories);
    }

    let emojiMigrationCount = 0;
    this.state.categories.forEach(cat => {
      if (cat.icon && (cat.icon.length <= 2 || ICON_MIGRATION_MAP[cat.icon])) {
        const mapped = ICON_MIGRATION_MAP[cat.icon] || 'tag';
        if (cat.icon !== mapped) {
          cat.icon = mapped;
          emojiMigrationCount++;
        }
      }
    });

    if (emojiMigrationCount > 0) {
      window.StackdDB.save('categories', this.state.categories);
    }

    // v0.59: Icon normalization — map icons removed from the new curated set
    // v0.66: 'pin' entry dropped — 'pin' is now a pickable Symbols icon and the
    // remap would silently rewrite a deliberate user choice on every reload.
    const V059_ICON_REMAP = {
      'clover': 'leaf',          // 'clover' removed from main set; leaf is the closest equivalent
      'building': 'hospital',    // 'building' moved to health context
    };
    let v059Changed = false;
    this.state.categories.forEach(cat => {
      if (cat.icon && V059_ICON_REMAP[cat.icon]) {
        cat.icon = V059_ICON_REMAP[cat.icon];
        v059Changed = true;
      }
    });
    if (v059Changed) {
      window.StackdDB.save('categories', this.state.categories);
    }

    // v0.66: the account/category icon split moved 'wallet' to the account-only
    // set; retarget the untouched Salary seed so its icon stays re-selectable
    // in the category picker. Customized icons are left alone.
    let v066Changed = false;
    this.state.categories.forEach(cat => {
      if (cat.id === 'cat_salary' && cat.icon === 'wallet') {
        cat.icon = 'hand-coins';
        v066Changed = true;
      }
    });
    if (v066Changed) {
      window.StackdDB.save('categories', this.state.categories);
    }

    // v0.98: heal poisoned generator state BEFORE the first generation pass —
    // a second armed member in a series doubles the chain on every pass.
    // 1.0.1 (BUG-14): unlink orphaned transfer legs first, so an armed orphan
    // tail generates plain rows instead of new orphan legs.
    this._healOrphanTransferLegs();
    this._healRecurrenceGenerators();
    // 1.0.2 (BUG-29): installs that deleted an account on 1.0/1.0.1 still
    // hold its id in the saved Home view, widget scopes, default wallet and
    // bank mappings. Skipped when there are rows but no accounts: only an
    // unreadable accounts key gives that state (DELETE_ACCOUNT removes the
    // account's rows, a reset removes all), and pruning then would wipe every
    // reference for good, file mirror included.
    if (this.state.accounts.length > 0 || this.state.transactions.length === 0) this._pruneAccountRefs();
    this._healConvertedOpeningBalances(); // 1.0.2 (BUG-25)
    // 1.0.2 (BUG-26): every member carries its series' real schedule
    if (this._healSeriesSchedules()) window.StackdDB.save('transactions', this.state.transactions);
    // 1.0.3 (BUG-51, D4): month-end / 29 Feb chains 1.0.2 let drift, future payments only
    if (this._healSeriesAnchors()) window.StackdDB.save('transactions', this.state.transactions);
    this._healRestoredImportKeys(); // 1.0.2 (BUG-32)
    this._healMultilineNotes(); // 1.0.2 (R1)
    this._processRecurringTransactions();

    // ── Cross-Tab Synchronization ──────────────────────────────────────────
    // Listen to localStorage changes made natively by other tabs to ensure
    // zero-refresh sync for the global state.
    if (typeof window.addEventListener === 'function') {
      window.addEventListener('storage', async (e) => {
        if (!e.key || !e.key.startsWith('stackd_')) return;

        let changed = false;

        // Sync Plain Data
        if (e.key === 'stackd_v1_accounts') {
          this.state.accounts = window.StackdDB.load('accounts', []);
          this._sanitizeMarkupFields('accounts'); // 1.0.2 (BUG-24): memory only
          this._pruneAccountRefs({ sessionOnly: true }); // 1.0.2 (BUG-29): this tab's History/Analytics filters
          changed = true;
        }
        if (e.key === 'stackd_v1_categories') { this.state.categories = window.StackdDB.load('categories', []); this._sanitizeMarkupFields('categories'); changed = true; } // 1.0.2 (BUG-24)
        if (e.key === 'stackd_v1_transactions') { this.state.transactions = window.StackdDB.load('transactions', []); changed = true; }
        if (e.key === 'stackd_v1_budgets') { this.state.budgets = window.StackdDB.load('budgets', []); changed = true; }
        if (e.key === 'stackd_v1_loans') { this.state.loans = window.StackdDB.load('loans', []); changed = true; }
        if (e.key === 'stackd_v1_currency') { this.state.currency = window.StackdDB.load('currency', 'USD'); changed = true; }
        if (e.key === 'stackd_v1_language') { this.state.language = window.StackdDB.load('language', 'en'); if (window.I18n) window.I18n.setLang(this.state.language); changed = true; } // v0.86 P8a
        if (e.key === 'stackd_v1_enableTimeInput') { this.state.enableTimeInput = window.StackdDB.load('enableTimeInput', false); changed = true; }
        if (e.key === 'stackd_v1_homeWidgets') { this.state.homeWidgets = window.StackdDB.load('homeWidgets', []); changed = true; } // v0.72
        if (e.key === 'stackd_v1_importPresets') { this.state.importPresets = window.StackdDB.load('importPresets', []); changed = true; } // v0.99
        if (e.key === 'stackd_v1_importRules') { this.state.importRules = window.StackdDB.load('importRules', []); changed = true; } // v1.01
        if (e.key === 'stackd_v1_bankConnect') { this.state.bankConnect = this._loadBankConnect(); changed = true; } // v1.05
        if (e.key === 'stackd_v1_bankConnections') { this.state.bankConnections = window.StackdDB.load('bankConnections', []); changed = true; } // v1.05
        if (e.key === 'stackd_v1_pro') { this.state.pro = this._loadPro(); changed = true; } // v1.13
        if (e.key === 'stackd_v1_expandedGraphFilters') { this.state.expandedGraphFilters = window.StackdDB.load('expandedGraphFilters', { interval: 'monthly', accounts: [], categories: [] }); changed = true; } // 1.0.2 (BUG-29)
        if (e.key === 'stackd_v1_defaultAccountId') { this.state.defaultAccountId = window.StackdDB.load('defaultAccountId', ''); changed = true; } // 1.0.2 (BUG-29)
        if (e.key === 'stackd_v1_theme') {
          this.state.theme = window.StackdDB.load('theme', 'system');
          this.applyTheme();
          changed = true;
        }
        


        if (changed) {
          this._sortData();
          this.emit();
        }
      });
    }

    this._sortData();
    this.state.initialized = true;
    this.emit();
  },

  _sortData() {
    this.state.accounts.sort((a, b) => this.compareAlpha(a, b));
    this.state.categories.sort((a, b) => this.compareAlpha(a, b));
    // v0.93: boot + cross-tab sync replace whole slices — invalidate the
    // memoized indexes here too (dispatch already does).
    this._openingIdx = null;
    this._budgetSpendIdx = null;
    this._importKeyIdx = null; // v0.99
    this._primaryIdx = null; // v1.02
  },

  // ── Theme State Management & Detection ────────────────────────────────────
  getSystemTheme() {
    if (typeof window !== 'undefined' && window.matchMedia) {
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    return 'light';
  },

  resolveActiveTheme(themePref) {
    const pref = themePref || this.state.theme || 'system';
    if (pref === 'system') {
      return this.getSystemTheme();
    }
    return pref === 'dark' ? 'dark' : 'light';
  },

  applyTheme() {
    const active = this.resolveActiveTheme(this.state.theme);
    this.state.activeTheme = active;
    if (typeof document !== 'undefined' && document.documentElement) {
      document.documentElement.setAttribute('data-theme', active);
      if (active === 'dark') {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
    }
    this._applySystemBarsStyle(active);
    return active;
  },

  // v1.14: at targetSdk 36 the app draws under the status and gesture bars,
  // so the system-bar icons sit on OUR background and have to follow the
  // app's theme rather than the device's — a user on a light app theme with
  // the phone in dark mode would otherwise get white icons on white.
  // SystemBars is bundled with @capacitor/core 8; DARK means light icons for
  // a dark background, LIGHT means dark icons for a light one. Absent on the
  // web build, and never allowed to break a theme change.
  _applySystemBarsStyle(active) {
    try {
      const bars = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.SystemBars;
      if (bars && typeof bars.setStyle === 'function') {
        const result = bars.setStyle({ style: active === 'dark' ? 'DARK' : 'LIGHT' });
        if (result && typeof result.catch === 'function') result.catch(() => {});
      }
    } catch (e) { /* no plugin (web), or the bridge is not up yet */ }
  },

  _themeMediaQuery: null,
  _themeMediaListener: null,

  initThemeListener() {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    if (this._themeMediaQuery) return; // Listener already registered

    try {
      this._themeMediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      this._themeMediaListener = () => {
        if (this.state.theme === 'system') {
          this.applyTheme();
          this.emit();
        }
      };

      if (typeof this._themeMediaQuery.addEventListener === 'function') {
        this._themeMediaQuery.addEventListener('change', this._themeMediaListener);
      } else if (typeof this._themeMediaQuery.addListener === 'function') {
        this._themeMediaQuery.addListener(this._themeMediaListener);
      }
    } catch (err) {
      console.warn('Failed to initialize theme matchMedia listener:', err);
    }
  },

  compareAlpha(a, b) {
    return (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base', numeric: true });
  },

  // 1.0.1 (BUG-11): read helper for the category forms' uniqueness check.
  // Trimmed + case-insensitive, across ALL types — every by-name path (CSV
  // transactions/budgets/rules, import lookups) ignores typeHint. UI-only, like
  // the Pro gates: ADD_CATEGORY/UPDATE_CATEGORY stay ungated for imports/tests.
  findCategoryByName(name, exceptId) {
    const key = String(name == null ? '' : name).trim().toLowerCase();
    if (!key) return null;
    return (this.state.categories || []).find(c =>
      c.id !== exceptId && String(c.name == null ? '' : c.name).trim().toLowerCase() === key
    ) || null;
  },

  // 1.0.2 (BUG-30): same rule for accounts — trimmed, case-insensitive,
  // across every currency and type, because backups name an account by its
  // name. UI-only like findCategoryByName: ADD_ACCOUNT/UPDATE_ACCOUNT stay
  // ungated (imports, tests, Bank Connect).
  findAccountByName(name, exceptId) {
    const key = String(name == null ? '' : name).trim().toLowerCase();
    if (!key) return null;
    return (this.state.accounts || []).find(a =>
      a.id !== exceptId && String(a.name == null ? '' : a.name).trim().toLowerCase() === key
    ) || null;
  },

  _getSystemTimeString() {
    const now = new Date();
    const hh = String(now.getHours()).padStart(2, '0');
    const mm = String(now.getMinutes()).padStart(2, '0');
    const ss = String(now.getSeconds()).padStart(2, '0');
    return `${hh}:${mm}:${ss}`;
  },

  _getTransactionTimestamp(tx) {
    if (tx.date) {
      const timePart = tx.time || '00:00:00';
      return `${tx.date}T${timePart}`;
    }
    return tx.createdAt || '';
  },

  _sortTransactions() {
    const isAsc = this.state.historySortOrder === 'asc';
    const dir = isAsc ? 1 : -1;
    this.state.transactions.sort((a, b) => {
      const tsA = this._getTransactionTimestamp(a);
      const tsB = this._getTransactionTimestamp(b);
      if (tsA !== tsB) {
        return dir * tsA.localeCompare(tsB);
      }
      const createdA = a.createdAt || '';
      const createdB = b.createdAt || '';
      if (createdA !== createdB) {
        return dir * createdA.localeCompare(createdB);
      }
      return dir * a.id.localeCompare(b.id);
    });
  },

  // v0.67: single home for the 60-month recurrence window cap (was duplicated
  // in the ADD paths and entirely missing from the UPDATE paths, so extending
  // endDate via an edit could materialize decades of occurrences). Mutates and
  // returns rec. Local-time formatting on purpose — see _calculateNextRecurrenceDate.
  _clampRecurrenceEndDate(rec, fallbackStartDate) {
    if (!rec || !rec.endDate) return rec;
    const startRef = rec.startDate || fallbackStartDate;
    if (!startRef) return rec;
    const capStart = new Date(startRef + 'T00:00:00');
    const capEnd   = new Date(rec.endDate + 'T00:00:00');
    if (isNaN(capStart) || isNaN(capEnd)) return rec;
    const capMonths = (capEnd.getFullYear() - capStart.getFullYear()) * 12
                    + (capEnd.getMonth()   - capStart.getMonth());
    if (capMonths > 60) {
      // 1.0.3 (BUG-159): month arithmetic, clamped — setMonth(+60) on 29 Feb
      // overflowed to 1 Mar
      rec.endDate = this._calculateNextRecurrenceDate(startRef, 60, 'months');
    }
    return rec;
  },

  // 1.0.3 (BUG-51 / BUG-159): optional anchorDay — months and years land on
  // min(anchorDay, days in the target month), so a series started on the
  // 31st comes back to the 31st after a short month instead of keeping the
  // clamped day for good. Without an anchor the base date's own day is the
  // anchor (the 1.0.2 behaviour for months; years now clamp 29 Feb → 28 Feb
  // instead of overflowing to 1 Mar). Integer month arithmetic that mirrors
  // LoanEngine.addMonthsClamped (inline: the store loads without
  // loan-engine.js); negative steps are fine.
  _calculateNextRecurrenceDate(baseDateStr, interval, freq, anchorDay) {
    // v0.67: parse and format in LOCAL time anchored at noon. The old
    // UTC-parse + toISOString round-trip slipped one day backwards every
    // time a DST boundary was crossed, so monthly series drifted (15th ->
    // 14th -> 13th ...) one day per year.
    const [by, bm, bd] = String(baseDateStr).split('-').map(Number);
    if (!by || !bm || !bd) return undefined;
    if (freq === 'months' || freq === 'years') {
      const n = Number(interval) * (freq === 'years' ? 12 : 1);
      if (!Number.isFinite(n)) return undefined;
      const m0 = (bm - 1) + n;
      const y = by + Math.floor(m0 / 12);
      const m = ((m0 % 12) + 12) % 12 + 1;
      const dim = new Date(y, m, 0).getDate();
      const day = Math.min(Number(anchorDay) || bd, dim);
      return `${y}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }
    const d = new Date(by, bm - 1, bd, 12, 0, 0);
    if (freq === 'days') d.setDate(d.getDate() + interval);
    else if (freq === 'weeks') d.setDate(d.getDate() + (interval * 7));

    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  },

  // 1.0.3 (BUG-51): the day a chain steps from. recurrence.anchorDay when the
  // chain carries one; a 1.0.2 chain (no anchorDay) reads its startDate's day
  // when `date` is a month-end shorter than it (31 Oct → 30 Nov → 31 Dec),
  // else the date's own day (a chain that already drifted to the 28th stays
  // there until _healSeriesAnchors proves it).
  _anchorDayOf(rec, date) {
    if (rec && Number(rec.anchorDay) > 0) return Number(rec.anchorDay);
    const [y, m, d] = String(date || '').split('-').map(Number);
    if (!y || !m || !d) return undefined;
    const sd = rec && rec.startDate ? Number(String(rec.startDate).slice(8, 10)) : 0;
    if (sd > d && d === new Date(y, m, 0).getDate()) return sd;
    return d;
  },

  // 1.0.3 (BUG-51): the occurrence after `date` in a chain with recurrence `rec`
  // — the one stepper every chain walker uses (generation, regeneration,
  // _moveSeriesEnd, the loan sync plan, the gap mapping).
  _nextSeriesDate(date, rec) {
    if (!rec) return undefined;
    return this._calculateNextRecurrenceDate(date, Number(rec.interval), rec.frequency, this._anchorDayOf(rec, date));
  },

  // 1.0.3 (BUG-139, D1): a chain's slots from `from` up to `limit` (both
  // included), stepped with a FIXED anchor day.
  _seriesSlots(from, rec, anchorDay, limit) {
    const out = [from];
    let d = from;
    while (out.length < 1000) {
      d = this._calculateNextRecurrenceDate(d, Number(rec.interval), rec.frequency, anchorDay);
      if (!d || d > limit) break;
      out.push(d);
    }
    return out;
  },

  // 1.0.3 (BUG-139, D1): the empty slots of a series after `editedTx` — the
  // payments deleted (or unlinked) with 'Only this' — as slot indices
  // (slot 0 = the edited payment), read from the chain itself, so nothing is
  // stored and a CSV round trip keeps them. The old chain's slots are stepped
  // with its anchor up to the series end; every later payment (one per
  // transfer pair) takes its NEAREST slot, so a payment moved with 'Only
  // this' or a 1.0.2 chain drifted to the 28th still matches. Any doubt — a
  // slot holding two payments, a payment nearest to the edited one — gives
  // [] (the 1.0.2 behaviour: a full rebuild).
  _seriesGaps(seriesId, editedTx, sched) {
    if (!seriesId || !editedTx || !editedTx.date || !sched) return [];
    if (sched.frequency !== 'days' && sched.frequency !== 'weeks' && sched.frequency !== 'months' && sched.frequency !== 'years') return [];
    const limit = sched.endDate || sched.lastDate;
    if (!limit || limit <= editedTx.date) return [];
    const rec = { ...(editedTx.recurrence || {}), interval: sched.interval, frequency: sched.frequency };
    const slots = this._seriesSlots(editedTx.date, rec, this._anchorDayOf(editedTx.recurrence, editedTx.date), limit);
    if (slots.length < 2) return [];
    const dayNo = (s) => {
      const [y, m, d] = s.split('-').map(Number);
      return Date.UTC(y, m - 1, d) / 86400000; // a day count, never formatted
    };
    const slotNos = slots.map(dayNo);
    const fill = slots.map((s, k) => (k === 0 ? 1 : 0));
    const seen = new Set();
    for (const t of this.state.transactions) {
      if (!t.recurrence || t.recurrence.seriesId !== seriesId || t.id === editedTx.id) continue;
      if (editedTx.transferRef && t.transferRef === editedTx.transferRef) continue;
      if (!(t.date > editedTx.date)) continue;
      if (t.transferRef) {
        if (seen.has(t.transferRef)) continue;
        seen.add(t.transferRef);
      }
      const n = dayNo(t.date);
      let best = 0;
      slotNos.forEach((s, k) => { if (Math.abs(n - s) < Math.abs(n - slotNos[best])) best = k; });
      if (++fill[best] > 1) return [];
    }
    const gaps = [];
    fill.forEach((f, k) => { if (!f) gaps.push(k); });
    return gaps;
  },

  // 1.0.3 (BUG-139, D1): how many payments of this series a rebuild from
  // `txId` would bring back — the scope sheet's gapNote, shown when an
  // interval/frequency change cannot keep the gaps.
  seriesGapCount(seriesId, txId) {
    const tx = this.state.transactions.find(t => t.id === txId);
    return tx ? this._seriesGaps(seriesId, tx, this.getSeriesSchedule(seriesId)).length : 0;
  },

  // 1.0.3 (BUG-139, D1): after a rebuild from `editedId`, remove the members
  // sitting on the gap slots (slot k of the new chain = slot k of the old
  // one), stepped exactly as the processing pass generated them. Never the
  // armed member (nor its pair). Returns true when something was removed;
  // the caller syncs the schedule and saves.
  _dropSeriesGaps(seriesId, editedId, gaps) {
    if (!gaps || !gaps.length) return false;
    const edited = this.state.transactions.find(t => t.id === editedId);
    if (!edited || !edited.recurrence || edited.recurrence.seriesId !== seriesId) return false;
    const want = new Set();
    let d = edited.date;
    const last = Math.max(...gaps);
    for (let k = 1; k <= last && d; k++) {
      d = this._nextSeriesDate(d, edited.recurrence);
      if (d && gaps.includes(k)) want.add(d);
    }
    const inSeries = (t) => t.recurrence && t.recurrence.seriesId === seriesId;
    const armedRefs = new Set(this.state.transactions
      .filter(t => inSeries(t) && t.recurrence.nextDate && t.transferRef).map(t => t.transferRef));
    const doomed = this.state.transactions.filter(t => inSeries(t) && want.has(t.date) && t.id !== edited.id &&
      !(edited.transferRef && t.transferRef === edited.transferRef) &&
      !t.recurrence.nextDate && !(t.transferRef && armedRefs.has(t.transferRef)));
    if (!doomed.length) return false;
    this._removeSeriesMembers(doomed);
    return true;
  },

  // 1.0.2 (BUG-25): before 1.0.2, an untouched save of an opening balance from
  // History stored it as income (+|amount|, cat_balance, comment 'Opening
  // Balance', the literal ADD_/UPDATE_ACCOUNT store, never translated). A user
  // who then tapped Expense stored an expense. Restore the type ONLY where no
  // balance moves: the account has no opening_balance row, exactly one such
  // candidate, and no other row dated before it or undated ('' sorts first and
  // would drop out). An income keeps its amount; an expense becomes negative.
  // Both count as before. The sign lost by the income conversion is not guessed:
  // Edit Account shows the amount with its Positive/Negative toggle.
  // Idempotent (a healed row is an opening_balance, so its account is skipped
  // next boot); saves the transactions slice only when it healed something.
  _healConvertedOpeningBalances() {
    const txs = this.state.transactions;
    const hasOb = new Set();
    const cands = Object.create(null);
    txs.forEach(t => {
      if (!t.accountId) return;
      if (t.type === 'opening_balance') hasOb.add(t.accountId);
      else if ((t.type === 'income' || t.type === 'expense') && t.categoryId === 'cat_balance'
        && t.comment === 'Opening Balance' && !t.transferRef && !t.recurrence && t.isPaid !== false) {
        (cands[t.accountId] = cands[t.accountId] || []).push(t);
      }
    });
    let now = null;
    Object.keys(cands).forEach(id => {
      const c = cands[id];
      if (hasOb.has(id) || c.length !== 1 || !c[0].date) return;
      const row = c[0];
      if (txs.some(t => t.accountId === id && t !== row && (!t.date || t.date < row.date))) return;
      if (row.type === 'expense') row.amount = -Math.abs(row.amount);
      row.type = 'opening_balance';
      row.updatedAt = now || (now = new Date().toISOString());
    });
    if (now) {
      this._openingIdx = null;
      this._budgetSpendIdx = null;
      window.StackdDB.save('transactions', txs);
    }
  },

  // 1.0.1 (BUG-14): a transfer leg whose counterpart is gone is not a transfer.
  // Before 1.0.1, DELETE_ACCOUNT left the other account's leg holding a
  // transferRef that pointed at nothing (shown as a transfer, hidden from
  // analytics, and — when armed — spawning a NEW orphan leg per generation
  // pass). Same rule as import.js _relinkTransfers: drop the ref, keep the
  // row (categoryId stays ''). No note (the account name is gone) and no
  // generator handover. Runs at boot BEFORE _processRecurringTransactions;
  // saves only when something was healed.
  _healOrphanTransferLegs() {
    const counts = Object.create(null);
    this.state.transactions.forEach(t => {
      if (t.transferRef) counts[t.transferRef] = (counts[t.transferRef] || 0) + 1;
    });
    let healed = false;
    let now;
    this.state.transactions.forEach(t => {
      if (t.transferRef && counts[t.transferRef] < 2) {
        t.transferRef = null;
        t.updatedAt = now || (now = new Date().toISOString());
        healed = true;
      }
    });
    if (healed) window.StackdDB.save('transactions', this.state.transactions);
  },

  // 1.0.2 (BUG-29): every slice that names accounts by id. Readers treat an
  // empty list as "all accounts", so a list left holding only a deleted id
  // matched nothing (Home and scoped widgets read €0.00, History showed a
  // raw-id chip). Drops every id that no longer names an account and saves
  // only what changed; dropping an id only widens a selection back towards
  // "all", it never hides a live account. { sessionOnly: true } (cross-tab)
  // touches only the never-saved History/Analytics filters: the tab that
  // deleted saves the persisted slices itself. Non-array slices (a corrupt
  // key) are left alone rather than crash boot.
  _pruneAccountRefs(opts) {
    const known = new Set((this.state.accounts || []).map(a => a && a.id));
    const stale = (ids) => Array.isArray(ids) && ids.some(id => !known.has(id));
    const live = (ids) => ids.filter(id => known.has(id));
    ['historyFilters', 'analyticsFilters'].forEach(key => {
      const f = this.state[key];
      if (f && stale(f.accounts)) this.state[key] = { ...f, accounts: live(f.accounts) };
    });
    if (opts && opts.sessionOnly) return;
    const eg = this.state.expandedGraphFilters;
    if (eg && stale(eg.accounts)) {
      this.state.expandedGraphFilters = { ...eg, accounts: live(eg.accounts) };
      window.StackdDB.save('expandedGraphFilters', this.state.expandedGraphFilters);
    }
    const ws = this.state.homeWidgets;
    if (Array.isArray(ws) && ws.some(w => w && w.config && stale(w.config.accountIds))) {
      this.state.homeWidgets = ws.map(w => (w && w.config && stale(w.config.accountIds))
        ? { ...w, config: { ...w.config, accountIds: live(w.config.accountIds) } } : w);
      window.StackdDB.save('homeWidgets', this.state.homeWidgets);
    }
    const def = this.state.defaultAccountId;
    if (def && !known.has(def)) {
      // D-U5-1: the first primary-currency account by name (the test
      // _ensureForeignIdx uses, inlined: at boot the memo may predate this
      // state), else the first by name, else ''.
      const byName = (this.state.accounts || []).slice().sort((a, b) => this.compareAlpha(a, b));
      const pick = byName.find(a => !a.currency || a.currency === this.state.currency) || byName[0];
      this.state.defaultAccountId = pick ? pick.id : '';
      window.StackdDB.save('defaultAccountId', this.state.defaultAccountId);
    }
    const dead = (m) => m && m.stackdAccountId && !known.has(m.stackdAccountId);
    const hasDead = (c) => c && Array.isArray(c.accounts) && c.accounts.some(dead);
    const cs = this.state.bankConnections;
    if (Array.isArray(cs) && cs.some(hasDead)) { // D-U5-8
      this.state.bankConnections = cs.map(c => hasDead(c)
        ? { ...c, accounts: c.accounts.map(m => dead(m) ? { ...m, stackdAccountId: null } : m) } : c);
      window.StackdDB.save('bankConnections', this.state.bankConnections);
    }
  },

  // v0.98: enforce the one-armed-tail invariant on stored data. Exactly one
  // member per series (the chain tail) may carry recurrence.nextDate; a second
  // armed member — poison left behind by the pre-v0.67 duplicate-chain bug or
  // a pre-v0.68 CSV import — materializes a duplicate parallel chain on every
  // generation pass. Mirrors import.js _relinkSeries: keep the latest-dated
  // armed member, on a date tie prefer the expense leg (the only side of a
  // recurring transfer that is ever the generator). Runs at boot, before the
  // first generation pass; saves only when something was actually healed.
  _healRecurrenceGenerators() {
    const bySeries = {};
    this.state.transactions.forEach(t => {
      if (!t.recurrence || !t.recurrence.seriesId || !t.recurrence.nextDate) return;
      (bySeries[t.recurrence.seriesId] = bySeries[t.recurrence.seriesId] || []).push(t);
    });
    let healed = false;
    Object.keys(bySeries).forEach(sid => {
      const armed = bySeries[sid];
      if (armed.length <= 1) return;
      armed.sort((a, b) => (a.date === b.date)
        ? (a.type === 'expense' ? 1 : 0) - (b.type === 'expense' ? 1 : 0)
        : a.date.localeCompare(b.date));
      armed.slice(0, -1).forEach(t => {
        t.recurrence = { ...t.recurrence };
        delete t.recurrence.nextDate;
      });
      healed = true;
    });
    if (healed) window.StackdDB.save('transactions', this.state.transactions);
  },

  // 1.0.2 (BUG-26): endDate / interval / frequency are SERIES-level values.
  // Members carry copies, but only the armed member's copy is real (it alone
  // bounds generation in _processRecurringTransactions); a series with no
  // armed member was stopped and ends ON its last payment (the SYNC 'finish'
  // rule). Every path that ends a series early used to leave the old end on
  // the payments it kept, and a later 'This and future' / 'All' edit re-armed
  // from that stale copy and brought the deleted payments back.
  // { endDate, interval, frequency, live, lastDate } — null for no members.
  // A stopped series ends on its last payment, but a payment 'Only this'
  // moved past the end (it keeps the series end as its copy, D-U3-2a) counts
  // at that copy, not at its own date — so the move never extends the series.
  // Each member contributes min(date, its endDate copy): stale 1.0/1.0.1
  // copies are LATER than the dates, so the heal still lands on the last
  // payment. lastDate is the latest member inside the window.
  _scheduleOf(members) {
    let armed = null;
    let last = null;
    let stopEnd = null;
    members.forEach(t => {
      if (!t.recurrence) return;
      if (t.recurrence.nextDate && (!armed || t.date > armed.date)) armed = t;
      if (!last || t.date > last.date || (t.date === last.date && t.type === 'expense')) last = t;
      const own = (t.recurrence.endDate && t.recurrence.endDate < t.date) ? t.recurrence.endDate : t.date;
      if (!stopEnd || own > stopEnd) stopEnd = own;
    });
    if (!last) return null;
    const r = (armed || last).recurrence;
    const endDate = armed ? r.endDate : stopEnd;
    let lastIn = null;
    members.forEach(t => {
      if (t.recurrence && (!endDate || t.date <= endDate) && (!lastIn || t.date > lastIn)) lastIn = t.date;
    });
    return {
      endDate,
      interval: r.interval,
      frequency: r.frequency,
      live: !!armed,
      lastDate: lastIn || last.date
    };
  },

  // 1.0.2 (BUG-26): the schedule of a series (read-only), or null.
  getSeriesSchedule(seriesId) {
    if (!seriesId) return null;
    return this._scheduleOf(this.state.transactions.filter(t => t.recurrence && t.recurrence.seriesId === seriesId));
  },

  // 1.0.2 (BUG-26): write a schedule onto every member (both legs, past ones
  // too). Metadata only — no updatedAt bump. Mutates; returns true when a
  // member changed (the caller saves).
  _stampSchedule(members, s) {
    const K = ['endDate', 'interval', 'frequency'];
    let changed = false;
    members.forEach(t => {
      if (!t.recurrence) return;
      const next = { ...t.recurrence };
      K.forEach(k => { if (s[k] != null) next[k] = s[k]; });
      if (K.some(k => String(next[k]) !== String(t.recurrence[k]))) {
        t.recurrence = next;
        changed = true;
      }
    });
    return changed;
  },

  // 1.0.2 (BUG-26): bring one series' members in line with its schedule.
  // Returns true when something changed (the caller saves).
  _syncSeriesSchedule(seriesId) {
    if (!seriesId) return false;
    const members = this.state.transactions.filter(t => t.recurrence && t.recurrence.seriesId === seriesId);
    const s = this._scheduleOf(members);
    return s ? this._stampSchedule(members, s) : false;
  },

  // 1.0.2 (BUG-26): UPDATE_TRANSACTION / UPDATE_TRANSFER — a value the form
  // left out is the series'; without a 'This and future' / 'All' scope the
  // series values always win, so 'Only this' never reschedules (D-U3-2a).
  _resolveSeriesRec(rec, sched, scoped) {
    const out = { ...rec };
    ['endDate', 'interval', 'frequency'].forEach(k => {
      if (sched[k] != null && (out[k] == null || !scoped)) out[k] = sched[k];
    });
    return out;
  },

  // 1.0.2 (BUG-26): boot + restore repair — stale endDate/interval/frequency
  // copies left by 1.0/1.0.1 on the members a shortened series kept. One O(T)
  // pass; never adds, removes or re-arms a row, never touches an amount, a
  // date or the paid flag. Idempotent; returns true when it healed something
  // (the caller saves).
  _healSeriesSchedules() {
    const by = {};
    this.state.transactions.forEach(t => {
      const sid = t.recurrence && t.recurrence.seriesId;
      if (sid) (by[sid] = by[sid] || []).push(t);
    });
    let healed = false;
    Object.keys(by).forEach(sid => {
      const s = this._scheduleOf(by[sid]);
      if (s && this._stampSchedule(by[sid], s)) healed = true;
    });
    return healed;
  },

  // 1.0.3 (BUG-51): the 1.0.2 stepper, kept ONLY to prove that a stored chain
  // is exactly what it generated (_healSeriesAnchors). Each date was stepped
  // from the previous one and a clamped day was kept for good; years did not
  // clamp (29 Feb + 1y → 1 Mar).
  _legacyNextRecurrenceDate(baseDateStr, interval, freq) {
    const [by, bm, bd] = String(baseDateStr).split('-').map(Number);
    if (!by || !bm || !bd) return undefined;
    const d = new Date(by, bm - 1, bd, 12, 0, 0);
    if (freq === 'months') {
      d.setMonth(d.getMonth() + interval);
      if (d.getDate() !== bd) d.setDate(0);
    } else if (freq === 'years') d.setFullYear(d.getFullYear() + interval);
    else return undefined;
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  },

  // 1.0.3 (BUG-51, D4): boot + restore repair of chains 1.0.2 let drift — a
  // monthly series started on the 29th–31st sits on the 28th for good, a
  // yearly one from 29 Feb on 1 Mar. Only series with no anchorDay whose
  // start is a 29th–31st (monthly) or 29 Feb (yearly), and only when EVERY
  // member (both legs) is a date of the 1.0.2 sequence replayed from the
  // series start (gaps allowed): anything else (a payment moved by hand, a
  // 'This and future' re-date, another interval) is left as it is. Members
  // dated after today move to the anchored slot of the same index (never
  // past the series end, never to today or earlier); past dates never move.
  // The armed tail's nextDate follows its slot, and every member is stamped
  // with anchorDay, which makes the heal idempotent. Returns true when it
  // changed something (the caller saves).
  _healSeriesAnchors() {
    const by = {};
    this.state.transactions.forEach(t => {
      const sid = t.recurrence && t.recurrence.seriesId;
      if (sid) (by[sid] = by[sid] || []).push(t);
    });
    const today = this._todayYMD();
    let healed = false;
    let moved = false;
    Object.keys(by).forEach(sid => {
      const ms = by[sid];
      if (ms.some(t => t.recurrence.anchorDay)) return;
      const s = this._scheduleOf(ms);
      const interval = s ? Number(s.interval) : NaN;
      if (!s || !Number.isInteger(interval) || interval < 1) return;
      const armed = ms.find(t => t.recurrence.nextDate);
      const first = ms.reduce((a, t) => (!a || t.date < a.date ? t : a), null);
      const start = (armed && armed.recurrence.startDate) || first.recurrence.startDate || first.date;
      const day = Number(String(start).slice(8, 10));
      if (s.frequency === 'months') { if (!(day >= 29)) return; }
      else if (s.frequency !== 'years' || String(start).slice(5) !== '02-29') return;
      // the proof: the 1.0.2 sequence from the start holds every member
      const last = ms.reduce((a, t) => (t.date > a ? t.date : a), '');
      const index = new Map();
      for (let d = start, k = 0; d && d <= last && k < 1000; d = this._legacyNextRecurrenceDate(d, interval, s.frequency), k++) {
        index.set(d, k);
      }
      if (ms.some(t => !index.has(t.date))) return;
      const slot = (k) => this._calculateNextRecurrenceDate(start, k * interval, s.frequency, day);
      const refDates = new Map();
      ms.forEach(t => {
        const k = index.get(t.date);
        const target = slot(k);
        const end = t.recurrence.endDate;
        if (t.date > today && target && target !== t.date && target > today && (!end || target <= end)) {
          t.date = target;
          if (t.transferRef) refDates.set(t.transferRef, target);
          moved = true;
        }
        const rec = { ...t.recurrence, anchorDay: day };
        if (rec.nextDate) rec.nextDate = slot(k + 1);
        t.recurrence = rec;
      });
      // a pair's leg outside the series (no recurrence) follows its partner
      if (refDates.size) {
        this.state.transactions.forEach(t => {
          if (t.transferRef && refDates.has(t.transferRef) && !(t.recurrence && t.recurrence.seriesId === sid)) t.date = refDates.get(t.transferRef);
        });
      }
      healed = true;
    });
    if (moved) {
      this._sortTransactions();
      this._budgetSpendIdx = null;
    }
    return healed;
  },

  _processRecurringTransactions() {
    let changed = false;
    
    // Safety break
    let iterations = 0;
    
    // We must process continuously because a transaction might need to generate MULTIPLE times
    // (e.g. user hasn't logged in for 3 months, a monthly tx needs 3 generations)
    let processing = true;
    while(processing && iterations < 1000) {
      processing = false;
      iterations++;
      
      const generators = this.state.transactions.filter(t => 
        t.recurrence && t.recurrence.nextDate && 
        t.recurrence.nextDate <= t.recurrence.endDate
      );
      
      if (generators.length > 0) {
        generators.forEach(gen => {
          // v0.67: re-check at execution time — a transfer counterpart processed
          // earlier in this same pass may share (or have already consumed) this
          // generator's recurrence. The old code read a stripped nextDate and
          // crashed with "Invalid time value", killing recurring transfers.
          if (!gen.recurrence || !gen.recurrence.nextDate) return;

          const nextD = gen.recurrence.nextDate;
          const nextNextD = this._nextSeriesDate(nextD, gen.recurrence); // 1.0.3 (BUG-51): the chain's anchor day (clones copy it)
          if (!nextNextD) { delete gen.recurrence.nextDate; return; }

          // v0.67: collision guard — if this series already has a transaction on
          // the target date (e.g. data poisoned by the old duplicate-chain bug),
          // skip creating another one but keep advancing the chain.
          const seriesId = gen.recurrence.seriesId;
          const collision = seriesId && this.state.transactions.some(t =>
            t.id !== gen.id && t.recurrence && t.recurrence.seriesId === seriesId && t.date === nextD
          );
          if (collision) {
            gen.recurrence.nextDate = nextNextD;
            processing = true;
            changed = true;
            return;
          }

          // Create new generated transaction
          const generatedTx = {
             ...gen,
             id: window.StackdDB.generateId(),
             date: nextD,
             time: gen.time || this._getSystemTimeString(),
             createdAt: new Date().toISOString(),
             tags: gen.recurrence.propagateTags === false ? [] : (gen.tags ? [...gen.tags] : []),
             recurrence: {
                ...gen.recurrence,
                nextDate: nextNextD
             }
          };
          // v0.82: never inherit the seed's paid state. An unpaid seed would
          // otherwise stamp isPaid:false on the whole materialized chain and
          // silently blank the Upcoming widget, computeUpcomingImpact and the
          // EOM forecast (all skip isPaid === false). Members are marked
          // unpaid per-occurrence, by hand.
          delete generatedTx.isPaid;
          // 1.0.1 (BUG-07 review 7): nor a bank identity — importKey/bankRef
          // belong to the ONE booking a matched row absorbed. A clone carrying
          // them can never be linked to its own bank row (the next import adds
          // it a second time) and breaks the one-key-per-row dedup.
          delete generatedTx.importKey;
          delete generatedTx.bankRef;
          delete generatedTx.amountEdited; // 1.0.2 (BUG-74): a clone is not a hand edit

          // If transfer, handle ref regenerations
          if (generatedTx.transferRef) {
             generatedTx.transferRef = window.StackdDB.generateId();
             // Find counterpart and duplicate it
             const cp = this.state.transactions.find(t => t.transferRef === gen.transferRef && t.id !== gen.id);
             if (cp) {
                // v0.67: the generated counterpart deliberately carries NO nextDate —
                // exactly one leg per pair is the live generator, otherwise both legs
                // generate and the series doubles every pass.
                const cpRecurrence = cp.recurrence ? { ...cp.recurrence } : (gen.recurrence ? { ...gen.recurrence } : undefined);
                if (cpRecurrence) delete cpRecurrence.nextDate;
                const cpGen = {
                   ...cp,
                   id: window.StackdDB.generateId(),
                   date: nextD,
                   time: cp.time || generatedTx.time || this._getSystemTimeString(),
                   createdAt: new Date().toISOString(),
                   transferRef: generatedTx.transferRef,
                   tags: (cp.recurrence && cp.recurrence.propagateTags === false) ? [] : (cp.tags ? [...cp.tags] : []),
                   recurrence: cpRecurrence
                };
                delete cpGen.isPaid; // v0.82: same rule as generatedTx above
                delete cpGen.importKey; // 1.0.1: nor a bank identity
                delete cpGen.bankRef;
                delete cpGen.amountEdited; // 1.0.2 (BUG-74)
                this.state.transactions.push(cpGen);
                // Strip the old counterpart's own nextDate (if it had one) so it
                // can never act as a second generator for the same pair.
                if (cp.recurrence && cp.recurrence.nextDate) delete cp.recurrence.nextDate;
             }
          }

          this.state.transactions.push(generatedTx);

          // Strip *only nextDate* from the OLD generator so it stops generating
          delete gen.recurrence.nextDate;
          processing = true;
          changed = true;
        });
      }
    }
    
    if (changed) {
      this._sortTransactions();
      this._importKeyIdx = null;
      window.StackdDB.save('transactions', this.state.transactions);
    }
  },

  // --- Period Helpers (v0.52) ---
  
  // 1.0.2 (BUG-28) THE local calendar-day formatter: a Date, epoch ms or ISO
  // timestamp -> 'YYYY-MM-DD' in the device zone. No argument = now (same as
  // _todayYMD()); null, undefined, '' or an invalid value -> '' (a missing
  // timestamp never silently becomes 1970 or today: guard at the call site).
  // A bare 'YYYY-MM-DD' is already a local day and comes back unchanged (Date
  // would parse it as UTC midnight). Never toISOString().split('T')[0]: that
  // is the UTC day, yesterday in UTC+ zones until 01:00/02:00 and tomorrow in
  // UTC- zones every evening. Shift a 'YYYY-MM-DD' with
  // _calculateNextRecurrenceDate (noon-anchored; negative steps are fine).
  _localYMD(value) {
    if (arguments.length === 0) value = new Date();
    if (value == null || value === '') return '';
    if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
    const d = value instanceof Date ? value : new Date(value);
    if (isNaN(d)) return '';
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  },

  // 1.0.2 (BUG-69) A History/Analytics period that showed the CURRENT day,
  // week, month or year follows the calendar: once the local date has moved
  // past it (app left open across midnight, resumed the next morning) it
  // rolls to the period containing today. A period the user moved away from
  // (‹ ›, a donut/tag drill-down) or a custom range is a choice and stays.
  // `_liveDay` = the local day of the last reconcile (boot, then every
  // SET_VIEW / ROLL_PERIODS / filter action; transient, never persisted).
  // `keepPage` ('history' | 'analytics') is skipped: the action is about to
  // set that page's period from what is on screen, and is then judged against
  // today's calendar. Writes no StackdDB slice. Returns the pages whose period
  // moved (['history', 'analytics'] subset; [] when none), so a caller
  // re-renders only when the page ON SCREEN moved (round-1 review).
  _rollLivePeriods(keepPage) {
    const today = this._todayYMD();
    const prevDay = this._liveDay;
    this._liveDay = today;
    if (!prevDay || prevDay === today) return [];
    const rolled = [];
    [['history', 'historyFilters'], ['analytics', 'analyticsFilters']].forEach(([page, key]) => {
      if (page === keepPage) return;
      const p = this.state[key] && this.state[key].period;
      if (!p || p.type === 'custom' || !p.value) return;
      if (!this.isDateInPeriod(prevDay, p) || this.isDateInPeriod(today, p)) return;
      const value = p.type === 'month' ? today.slice(0, 7) + '-01'          // boot-style anchors:
        : (p.type === 'year' ? today.slice(0, 4) + '-01-01' : today);       // never a 29th-31st
      this.state[key] = { ...this.state[key], period: { ...p, value } };
      rolled.push(page);
    });
    return rolled;
  },

  // 1.0.2 (BUG-69) the filter page a view renders from: History reads only
  // historyFilters, Analytics only analyticsFilters; any other view neither.
  _livePageOf(view) {
    return view === 'transactions' ? 'history' : (view === 'analytics' ? 'analytics' : null);
  },

  _getPeriodBounds(type, anchorDateStr) {
    // v0.93: pure function, memoized — hot callers used to re-derive identical
    // bounds thousands of times per render. Key space stays tiny (period type ×
    // anchors the user actually visits). Callers must not mutate the result.
    const cacheKey = type + '|' + anchorDateStr;
    if (!this._periodBoundsCache) this._periodBoundsCache = Object.create(null);
    const cached = this._periodBoundsCache[cacheKey];
    if (cached) return cached;
    const d = new Date(anchorDateStr + 'T00:00:00');
    let start, end;

    switch (type) {
      case 'custom':
        // For custom, anchorDateStr might be empty, we look at the period object specifically.
        // But here we rely on the period having start/end set already.
        return (this._periodBoundsCache[cacheKey] = { start: '', end: '' }); // Should be overridden by the caller or handled separately
      case 'today':
        start = new Date(d);
        end = new Date(d);
        break;
      case 'week': {
        const day = d.getDay(); // 0 is Sunday, 1 is Monday
        const diff = d.getDate() - day + (day === 0 ? -6 : 1);
        start = new Date(d.setDate(diff));
        end = new Date(start);
        end.setDate(start.getDate() + 6);
        break;
      }
      case 'month':
        start = new Date(d.getFullYear(), d.getMonth(), 1);
        end = new Date(d.getFullYear(), d.getMonth() + 1, 0);
        break;
      case 'year':
        start = new Date(d.getFullYear(), 0, 1);
        end = new Date(d.getFullYear(), 11, 31);
        break;
      default:
        start = new Date(d.getFullYear(), d.getMonth(), 1);
        end = new Date(d.getFullYear(), d.getMonth() + 1, 0);
    }

    const fmt = (dt) => `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
    return (this._periodBoundsCache[cacheKey] = {
      start: fmt(start),
      end: fmt(end)
    });
  },

  // 1.0.1 (BUG-19) A 'YYYY-MM-DD' range label that is never ambiguous about
  // the year: different years → year on both sides; one year other than the
  // current one → year once, at the end; current year → month + day only.
  // Noon-anchored local parse (no UTC drift), en dash, Store.getLocale().
  _formatRangeLabel(start, end) {
    const loc = this.getLocale();
    const fmt = (s, opts) => new Date(s + 'T12:00:00').toLocaleDateString(loc, opts);
    const md  = { month: 'short', day: 'numeric' };
    const mdy = { month: 'short', day: 'numeric', year: 'numeric' };
    const sY = String(start).slice(0, 4);
    const eY = String(end).slice(0, 4);
    if (sY !== eY) return `${fmt(start, mdy)} – ${fmt(end, mdy)}`;
    if (sY !== String(new Date().getFullYear())) return `${fmt(start, md)} – ${fmt(end, mdy)}`;
    return `${fmt(start, md)} – ${fmt(end, md)}`;
  },

  _getPeriodLabel(period) {
    if (!period) return '';
    const { type, value, start, end } = period;

    if (type === 'custom') {
      if (!start || !end) return window.I18n.t('period.customRange');
      return this._formatRangeLabel(start, end); // 1.0.1 (BUG-19)
    }

    const d = new Date(value + 'T00:00:00');
    const bounds = this._getPeriodBounds(type, value);
    const startDt = new Date(bounds.start + 'T00:00:00');
    const endDt = new Date(bounds.end + 'T00:00:00');

    const today = new Date();
    today.setHours(0,0,0,0);
    // 1.0.1 (BUG-19) local 'YYYY-MM-DD', never toISOString(): local midnight
    // is the PREVIOUS UTC day in UTC+ zones, so 'Today' read as yesterday.
    const fmtLocal = (dt) => `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
    const todayStr = fmtLocal(today);

    switch (type) {
      case 'today': {
        if (bounds.start === todayStr) return window.I18n.t('period.today');
        const yest = new Date(today); yest.setDate(yest.getDate() - 1);
        if (bounds.start === fmtLocal(yest)) return window.I18n.t('period.yesterday');
        return d.toLocaleDateString(this.getLocale(), { month: 'short', day: 'numeric', year: 'numeric' });
      }

      case 'week':
        if (today >= startDt && today <= endDt) return window.I18n.t('period.thisWeek');
        return this._formatRangeLabel(bounds.start, bounds.end); // 1.0.1 (BUG-19)
 
      case 'month':
        if (today.getFullYear() === d.getFullYear() && today.getMonth() === d.getMonth()) return window.I18n.t('period.thisMonth');
        return d.toLocaleDateString(this.getLocale(), { month: 'long', year: 'numeric' });
 
      case 'year':
        if (today.getFullYear() === d.getFullYear()) return window.I18n.t('period.thisYear');
        return d.getFullYear().toString();
    }
    return '';
  },

  isDateInPeriod(dateStr, period) {
    if (!period) return true;
    if (period.type === 'custom') {
      return dateStr >= period.start && dateStr <= period.end;
    }
    const bounds = this._getPeriodBounds(period.type, period.value);
    return dateStr >= bounds.start && dateStr <= bounds.end;
  },

  // v0.64 - overrideFilters lets callers evaluate a different period (e.g. clamped-to-today
  // or previous-period comparisons) without touching the persisted page filters.
  getFilteredTransactions(pageKey, overrideFilters = null) {
    const filters = overrideFilters || (pageKey === 'history' ? this.state.historyFilters : this.state.analyticsFilters);
    const { period, types, accounts, categories, sortOrder } = filters;
    // v0.85: additive and guarded — older/persisted filter objects predate the
    // key, so a missing tags array must mean "match everything", never
    // "match nothing" (this function feeds History, Analytics and widgets).
    const tagFilter = Array.isArray(filters.tags) ? filters.tags : [];

    // v0.93: period bounds hoisted out of the per-transaction loop — they were
    // re-derived per row via isDateInPeriod (3 Date allocations + 2 formats
    // each). Same comparison semantics, incl. custom periods with empty bounds.
    const bounds = !period ? null
      : (period.type === 'custom'
        ? { start: period.start, end: period.end }
        : this._getPeriodBounds(period.type, period.value));

    // v1.02: analytics is aggregate math — an empty account filter means
    // primary-currency accounts only; 1.0.2 (BUG-36): an explicit list that
    // mixes currencies keeps only the accounts aggregateSelection resolves.
    // History (a ledger, not a sum) deliberately keeps every account visible.
    const inAggregate = pageKey === 'analytics' ? this.aggregatePredicate(accounts) : null;

    return this.state.transactions.filter(tx => {
      if (pageKey === 'analytics') {
        if (tx.isPaid === false) return false; // Exclude unpaid transactions from analytics
        if (tx.type !== 'expense' && tx.type !== 'income') return false;
        if (tx.transferRef) return false; // Exclude linked transfers
        if (tx.categoryId === 'cat_balance') return false; // Exclude adjustments (initial balances)
      }

      if (bounds && (tx.date < bounds.start || tx.date > bounds.end)) return false;
      if (types.length > 0 && !types.includes(tx.type)) return false;
      if (accounts.length > 0 && !accounts.includes(tx.accountId)) return false;
      if (inAggregate && !inAggregate(tx.accountId)) return false;
      const matchCategory = categories.length === 0 ||
                            categories.includes(tx.categoryId) ||
                            (categories.includes('uncategorized') && !tx.categoryId);
      if (!matchCategory) return false;
      const txTags = Array.isArray(tx.tags) ? tx.tags : [];
      const matchTag = tagFilter.length === 0 ||
                       txTags.some(t => tagFilter.includes(t)) ||
                       (tagFilter.includes('__untagged__') && txTags.length === 0);
      if (!matchTag) return false;
      // v0.93: memoized opening-date check runs last — cheap rejections first.
      return !this._isTxBeforeOpeningDate(tx);
    }).sort((a, b) => {
      const dir = sortOrder === 'asc' ? 1 : -1;
      const tsA = this._getTransactionTimestamp(a);
      const tsB = this._getTransactionTimestamp(b);
      if (tsA !== tsB) {
        return dir * tsA.localeCompare(tsB);
      }
      const createdA = a.createdAt || '';
      const createdB = b.createdAt || '';
      if (createdA !== createdB) {
        return dir * createdA.localeCompare(createdB);
      }
      return dir * a.id.localeCompare(b.id);
    });
  },

  /**
   * Returns a period object for the respective previous interval.
   * e.g. If current is Week (Apr 10-16), returns Week (Apr 3-9).
   */
  _getPreviousPeriod(period) {
    const { type, value, start, end } = period;
    const fmt = (dt) => `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;

    if (type === 'custom') {
      const sDt = new Date(start + 'T00:00:00');
      const eDt = new Date(end + 'T00:00:00');
      const diffDays = Math.round((eDt - sDt) / (1000 * 60 * 60 * 24)) + 1; // 1.0.2 (BUG-67) a DST change makes one day 23/25 h
      
      const prevEnd = new Date(sDt);
      prevEnd.setDate(prevEnd.getDate() - 1);
      const prevStart = new Date(prevEnd);
      prevStart.setDate(prevStart.getDate() - diffDays + 1);
      
      return { type: 'custom', start: fmt(prevStart), end: fmt(prevEnd), value: '' };
    }

    const d = new Date(value + 'T00:00:00');
    switch (type) {
      case 'today':
        d.setDate(d.getDate() - 1);
        break;
      case 'week':
        d.setDate(d.getDate() - 7);
        break;
      case 'month':
        d.setMonth(d.getMonth() - 1);
        break;
      case 'year':
        d.setFullYear(d.getFullYear() - 1);
        break;
    }
    return { type, value: fmt(d) };
  },

  // v0.72 Phase 5: the widget set a fresh (or fully reset) install starts with.
  // One 'latest' widget — the successor of the old Recent Activities section.
  _defaultHomeWidgets() {
    return [{
      id: window.StackdDB.generateId(),
      type: 'latest',
      size: 'large',
      config: {},
      createdAt: new Date().toISOString()
    }];
  },

  getState() { return this.state; },

  subscribe(callback) {
    this.listeners.push(callback);
    return () => { this.listeners = this.listeners.filter(cb => cb !== callback); };
  },

  // v0.93: emits coalesce — N dispatches in one tick produce ONE listener pass
  // on the next microtask (state itself still mutates synchronously). Chained
  // navigations (e.g. wallet tile → filter dispatches + SET_VIEW) used to
  // re-render the heavy outgoing view once per dispatch. Boot passes
  // { sync: true } because the splash-dismissal sequence in main.js relies on
  // the first render having happened when emit() returns.
  emit(opts) {
    if (opts && opts.sync) {
      this._emitQueued = false;
      this.listeners.forEach(cb => cb(this.state));
      return;
    }
    if (this._emitQueued) return;
    this._emitQueued = true;
    const flush = () => {
      if (!this._emitQueued) return; // a sync flush already ran this tick
      this._emitQueued = false;
      this.listeners.forEach(cb => cb(this.state));
    };
    if (typeof queueMicrotask === 'function') queueMicrotask(flush);
    else Promise.resolve().then(flush);
  },

  // ── Changes are all-or-nothing (1.0.2, BUG-34) ──────────────────────────
  // Every dispatch is one journaled change (StackdDB.begin/end). When a save
  // does not fit (or the reducer throws) every key the change wrote is put
  // back, the touched slices are reloaded from disk so memory equals disk
  // again, one deferred "Storage is full" sheet is shown and dispatch
  // returns false. Store.batch(fn) makes a multi-dispatch flow one change;
  // nested scopes join the outer one. A flow that reports the failure itself
  // claims it with takeSaveFailure() before the sheet's timer fires.
  dispatch(action, payload) {
    return this.batch(() => this._reduce(action, payload));
  },

  batch(fn) {
    const db = window.StackdDB;
    if (!db || typeof db.begin !== 'function') { fn(); return true; } // unit-test doubles
    db.begin();
    let threw = false;
    let thrown = null;
    try {
      fn();
    } catch (error) {
      threw = true;
      thrown = error;
      db.abort(error || new Error('change aborted'));
    }
    const ok = this._settleChange(db.end());
    if (threw) throw thrown;
    return ok;
  },

  _settleChange(j) {
    const db = window.StackdDB;
    if (!j) return !(db._journal && db._journal.failed); // nested: the outer scope settles
    if (!j.failed) return true;
    j.touched.forEach((key) => {
      try {
        if (!this._reloadSlice(key)) console.error('Store: no reload for', key);
      } catch (error) {
        console.error('Store: reload failed for', key, error);
      }
    });
    if (j.touched.size) { this._sortData(); this.emit(); } // memory = disk again
    this._announceSaveFailure(j.failed);
    return false;
  },

  // Must list EVERY persisted key, with init's own defaults and seeds, so a
  // rolled-back change leaves memory equal to disk (storageFull.test.js scans
  // store.js/main.js for StackdDB.save/remove keys and fails on a missing one).
  _reloadSlice(key) {
    const L = (k, d) => window.StackdDB.load(k, d);
    const s = this.state;
    switch (key) {
      case 'accounts':
        s.accounts = L('accounts', []);
        this._sanitizeMarkupFields('accounts'); // 1.0.2 (BUG-24): disk may predate the heal
        return true;
      case 'transactions': case 'budgets': case 'loans':
      case 'importPresets': case 'importRules': case 'bankConnections':
        s[key] = L(key, []);
        return true;
      case 'categories': // as init: an empty store gets the defaults
        s.categories = L('categories', []);
        if (!s.categories.length) s.categories = [...DEFAULT_CATEGORIES];
        this._sanitizeMarkupFields('categories'); // 1.0.2 (BUG-24)
        return true;
      case 'homeWidgets': // as init: an ABSENT key means the seed
        s.homeWidgets = localStorage.getItem(window.StackdDB.PREFIX + 'homeWidgets') === null
          ? this._defaultHomeWidgets()
          : L('homeWidgets', []);
        return true;
      case 'currency': s.currency = L('currency', 'USD'); return true;
      case 'language':
        s.language = L('language', 'en');
        if (window.I18n) window.I18n.setLang(s.language);
        return true;
      case 'theme': s.theme = L('theme', 'system'); this.applyTheme(); return true;
      case 'enableTimeInput': s.enableTimeInput = L('enableTimeInput', false); return true;
      case 'historySortOrder': s.historySortOrder = L('historySortOrder', 'desc'); return true;
      case 'historyFilterSortOrder': s.historyFilters.sortOrder = L('historyFilterSortOrder', 'asc'); return true;
      case 'defaultAccountId': s.defaultAccountId = L('defaultAccountId', ''); return true;
      case 'analyticsBalanceMode': s.analyticsBalanceMode = L('analyticsBalanceMode', 'today'); return true;
      case 'expandedGraphFilters':
        s.expandedGraphFilters = L('expandedGraphFilters', { interval: 'monthly', accounts: [], categories: [] });
        return true;
      case 'bankConnect': s.bankConnect = this._loadBankConnect(); return true;
      case 'pro': s.pro = this._loadPro(); return true;
      case 'catDebtSeeded': case 'setup_done': return true; // flags with no state
      default: return false;
    }
  },

  _saveFailure: null,

  // Claim the pending failure: the caller reports it, so the sheet is skipped.
  takeSaveFailure() {
    const f = this._saveFailure;
    this._saveFailure = null;
    return f;
  },

  _announceSaveFailure(error) {
    const prev = this._saveFailure;
    this._saveFailure = {
      quota: window.StackdDB.isQuotaError(error) || !!(prev && prev.quota),
      boot: !!this._booting || !!(prev && prev.boot)
    };
    if (prev) return; // one sheet per burst
    let waits = 0;
    const show = () => { // after this change's render; a caller may have claimed it
      // A Components.Modal closed around the failed change (factory reset,
      // loan promote, any onSave) clears all of #modal-container 300 ms
      // later: show the sheet once that teardown has run, or it is wiped.
      if (this._saveFailure && waits < 4 && typeof document !== 'undefined' &&
          document.querySelector('#active-modal:not(.open)')) {
        waits += 1;
        setTimeout(show, 350);
        return;
      }
      const f = this.takeSaveFailure();
      const C = window.Components;
      const I = window.I18n;
      if (!f || !C || !C.NoticeSheet || !I) return;
      C.NoticeSheet.show({
        id: 'storage-full-modal',
        tone: 'error',
        title: I.t(f.quota ? 'storage.fullTitle' : 'storage.failedTitle'),
        body: I.t(f.quota ? (f.boot ? 'storage.bootBody' : 'storage.fullBody') : 'storage.failedBody')
      });
    };
    setTimeout(show, 0);
  },

  _reduce(action, payload) {
    // v0.93: any mutation may touch transactions/accounts — drop the memoized
    // indexes; they rebuild lazily in one O(T) pass on next use.
    this._openingIdx = null;
    this._budgetSpendIdx = null;
    this._importKeyIdx = null; // v0.99
    this._primaryIdx = null; // v1.02
    let changed = false;

    switch (action) {
      case 'ADD_ACCOUNT': {
        const existingCount = this.state.accounts.length;
        const newAccount = {
          id: this.safeId(payload.id) || window.StackdDB.generateId(), // 1.0.2 (BUG-24)
          name: payload.name,
          color: this.normalizeAccountColor(payload.color) || this.ACCOUNT_COLORS[existingCount % this.ACCOUNT_COLORS.length],
          icon: this.isSafeIcon(payload.icon) ? payload.icon : 'wallet',
          type: payload.type || 'Account',
          currency: payload.currency || this.state.currency, // v1.02: plan §6
          createdAt: new Date().toISOString()
        };
        this.state.accounts.push(newAccount);
        this._sortData();
        window.StackdDB.save('accounts', this.state.accounts);
        // Auto-create opening balance transaction (default time to 00:00) if non-zero opening balance or opening date is provided
        const obAmount = parseFloat(payload.openingBalance) || 0;
        if (obAmount !== 0 || payload.openingDate !== undefined) {
          this.state.transactions.push({
            id: window.StackdDB.generateId(),
            type: 'opening_balance',
            amount: obAmount,
            accountId: newAccount.id,
            categoryId: 'cat_balance',
            date: payload.openingDate || this._todayYMD(), // 1.0.2 (BUG-38): createdAt is now; use its LOCAL day
            time: '00:00',
            comment: 'Opening Balance',
            createdAt: new Date().toISOString()
          });
          window.StackdDB.save('transactions', this.state.transactions);
        }
        if (this.state.accounts.length === 1 && !this.state.defaultAccountId) {
          this.state.defaultAccountId = newAccount.id;
          // v0.71: must go through StackdDB — a raw setItem writes an unquoted
          // UUID that JSON.parse then rejects on the next load, silently
          // dropping the default account (and logging an error every boot).
          window.StackdDB.save('defaultAccountId', newAccount.id);
        }
        changed = true;
        break;
      }

      case 'UPDATE_ACCOUNT': {
        const accountIndex = this.state.accounts.findIndex(a => a.id === payload.id);
        if (accountIndex !== -1) {
          if (payload.name !== undefined) this.state.accounts[accountIndex].name = payload.name;
          // 1.0.2 (BUG-24): an unsafe icon or a non-palette colour is ignored.
          if (payload.icon !== undefined && this.isSafeIcon(payload.icon)) this.state.accounts[accountIndex].icon = payload.icon;
          if (payload.type !== undefined) this.state.accounts[accountIndex].type = payload.type;
          if (payload.color !== undefined && this.normalizeAccountColor(payload.color)) this.state.accounts[accountIndex].color = this.normalizeAccountColor(payload.color);
          if (payload.currency !== undefined) this.state.accounts[accountIndex].currency = payload.currency; // v1.02
          
          this._sortData();
          window.StackdDB.save('accounts', this.state.accounts);
          if ((payload.openingBalance !== undefined && parseFloat(payload.openingBalance) !== 0) || payload.openingDate !== undefined) {
            const newObAmt = payload.openingBalance !== undefined ? (parseFloat(payload.openingBalance) || 0) : null;
            const existingObIdx = this.state.transactions.findIndex(
              t => t.accountId === payload.id && t.type === 'opening_balance'
            );
            // 1.0.2 (BUG-38): the createdAt fallback is its LOCAL day (createdAt
            // is a UTC ISO timestamp); a missing createdAt means today, never ''.
            const createdAt = this.state.accounts[accountIndex].createdAt;
            // 1.0.2 (BUG-24): a non-YMD openingDate (file text) is ignored.
            const obDate = typeof payload.openingDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(payload.openingDate) ? payload.openingDate : '';
            const newDate = obDate || (existingObIdx !== -1
              ? this.state.transactions[existingObIdx].date
              : (createdAt ? this._localYMD(createdAt) : this._todayYMD()));
            if (existingObIdx !== -1) {
              if (newObAmt !== null) this.state.transactions[existingObIdx].amount = newObAmt;
              this.state.transactions[existingObIdx].date = newDate;
              this.state.transactions[existingObIdx].time = '00:00';
            } else {
              this.state.transactions.push({
                id: window.StackdDB.generateId(),
                type: 'opening_balance',
                amount: newObAmt !== null ? newObAmt : 0,
                accountId: payload.id,
                categoryId: 'cat_balance',
                date: newDate,
                time: '00:00',
                comment: 'Opening Balance',
                createdAt: new Date().toISOString()
              });
            }
            window.StackdDB.save('transactions', this.state.transactions);
          }
          changed = true;
        }
        break;
      }

      case 'UPDATE_ACCOUNT_COLOR': {
        const accountIndex = this.state.accounts.findIndex(a => a.id === payload.id);
        if (accountIndex !== -1 && this.normalizeAccountColor(payload.color)) { // 1.0.2 (BUG-24)
          this.state.accounts[accountIndex].color = this.normalizeAccountColor(payload.color);
          window.StackdDB.save('accounts', this.state.accounts);
          changed = true;
        }
        break;
      }

      case 'DELETE_ACCOUNT': {
        const goneAcc = this.state.accounts.find(a => a.id === payload.id); // read BEFORE filtering
        this.state.accounts = this.state.accounts.filter(a => a.id !== payload.id);
        this._sortData();
        window.StackdDB.save('accounts', this.state.accounts);
        this._pruneAccountRefs(); // 1.0.2 (BUG-29)
        // 1.0.1 (BUG-14): a transfer's other leg lives in ANOTHER account. Deleting
        // this account removes only its own rows; the surviving counterpart is
        // unlinked into a plain (Uncategorized) income/expense — the same rule as
        // import.js _relinkTransfers ("an unpaired leg is not a transfer"). It keeps
        // amount, date, type, recurrence/seriesId, tags and paid state, so no other
        // account's balance or forecast moves. A note (UI language at deletion
        // time) records where the money went.
        const lostLegs = new Map(); // transferRef -> the leg being deleted
        this.state.transactions.forEach(t => {
          if (t.accountId === payload.id && t.transferRef) lostLegs.set(t.transferRef, t);
        });
        if (lostLegs.size) {
          const now = new Date().toISOString();
          this.state.transactions.forEach(t => {
            if (t.accountId === payload.id || !t.transferRef || !lostLegs.has(t.transferRef)) return;
            const lost = lostLegs.get(t.transferRef);
            t.transferRef = null;
            // One-armed-tail invariant: if the deleted leg was the series generator
            // (the expense side of a recurring transfer), hand its nextDate to its
            // pair partner — the surviving chain tail — so the series still runs to
            // its endDate with exactly one armed member. Not handed over (accepted):
            // a series whose armed tail in the deleted account was already a PLAIN
            // row (a v0.69 'only'-scope conversion) — only a not-yet-fully-generated
            // daily series would notice.
            if (lost.recurrence && lost.recurrence.nextDate && t.recurrence &&
                t.recurrence.seriesId === lost.recurrence.seriesId && !t.recurrence.nextDate) {
              t.recurrence = { ...t.recurrence, nextDate: lost.recurrence.nextDate };
            }
            if (goneAcc && window.I18n) {
              const key = t.type === 'expense' ? 'account.deletedTransferTo' : 'account.deletedTransferFrom';
              const note = window.I18n.t(key, { name: goneAcc.name });
              if (note !== key) { // never store a raw key (stale dictionary)
                // Legacy rows may hold their text in .note (the form reads comment || note).
                const base = String(t.comment || t.note || '').trim();
                t.comment = base ? base + ' · ' + note : note;
              }
            }
            t.updatedAt = now;
          });
        }
        this.state.transactions = this.state.transactions.filter(t => t.accountId !== payload.id);
        window.StackdDB.save('transactions', this.state.transactions);
        // No-op unless the handover armed a tail that is not fully generated yet
        // (a daily series past the 1000-iteration cap); sorts + saves only then.
        this._processRecurringTransactions();
        changed = true;
        break;
      }

      case 'ADD_TRANSACTION': {
        const tagsArray = Array.isArray(payload.tags) ? payload.tags.map(t => t.toLowerCase()) : [];
        
        // Handle recurrence initialization
        // v0.67: no longer gated on recurrence.enabled — the live form never
        // sets that flag, which made the 60-month cap unreachable in practice.
        if (payload.recurrence) {
          if (!payload.recurrence.startDate) {
            payload.recurrence.startDate = payload.date;
          }
          this._clampRecurrenceEndDate(payload.recurrence, payload.date);
          if (!payload.recurrence.seriesId) {
            payload.recurrence.seriesId = window.StackdDB.generateId();
          }
          // 1.0.3 (BUG-51): the chain's day — a series on the 31st keeps it
          if (!payload.recurrence.anchorDay) payload.recurrence.anchorDay = Number(String(payload.date).slice(8, 10)) || undefined;
          if (!payload.recurrence.nextDate) {
            payload.recurrence.nextDate = this._nextSeriesDate(payload.date, payload.recurrence);
          }
        }

        const newTransaction = {
          id: window.StackdDB.generateId(),
          ...payload,
          // v0.67: default applied AFTER the spread — payload.time is an own
          // (undefined) key when the time input is hidden and used to clobber it
          time: payload.time || this._getSystemTimeString(),
          recurrence: payload.recurrence ? { ...payload.recurrence } : payload.recurrence,
          tags: tagsArray,
          createdAt: new Date().toISOString()
        };
        this.state.transactions.push(newTransaction);
        this._sortTransactions();
        window.StackdDB.save('transactions', this.state.transactions);
        this._processRecurringTransactions();

        // v0.71 Phase 4: the armed loan link fires only for the exact series we
        // prefilled, so unrelated recurring transactions never touch a loan.
        const pend = this.state.pendingLoanLink;
        if (pend && newTransaction.recurrence && newTransaction.recurrence.seriesId === pend.seriesId) {
          const linkedLoan = this.state.loans.find(l => l.id === pend.loanId);
          if (linkedLoan) {
            linkedLoan.linkedSeriesId = pend.seriesId;
            delete linkedLoan.needsNoteRelink; // 1.0.1 (BUG-02)
            linkedLoan.updatedAt = new Date().toISOString();
            window.StackdDB.save('loans', this.state.loans);
            // 1.0.1 (BUG-17): the chain is materialized by now (processed
            // above) — give its last member the schedule's final amount. The
            // series' own amount is the regular instalment it was armed with.
            const regularC = Math.round(Math.abs(Number(newTransaction.amount)) * 100);
            if (this._applyLoanFinalInstalment(linkedLoan, regularC)) {
              window.StackdDB.save('transactions', this.state.transactions);
            }
          }
          this.state.pendingLoanLink = null;
        }
        changed = true;
        break;
      }

      case 'UPDATE_TRANSACTION': {
        const index = this.state.transactions.findIndex(t => t.id === payload.id);
        if (index === -1) break;
        
        const existingTx = this.state.transactions[index];

        // 1.0.2 (BUG-25): an opening balance belongs to its account. Only
        // UPDATE_ACCOUNT changes its sign; nothing moves it to another account,
        // a series or a transfer, whatever the caller sends.
        const isOpening = existingTx.type === 'opening_balance';
        if (isOpening) {
          payload = { ...payload };
          ['type', 'accountId', 'categoryId', 'recurrence', 'transferRef', 'convertFromTransfer',
            'updateFuture', 'updateAll', 'regenerateSeries'].forEach(k => { delete payload[k]; });
        }
        // Amounts in the DB are stored as absolute numbers, except an opening
        // balance, which keeps its stored sign.
        let absoluteAmount = payload.amount;
        if (absoluteAmount !== undefined) {
          absoluteAmount = Math.abs(absoluteAmount);
          if (isOpening && existingTx.amount < 0) absoluteAmount = -absoluteAmount;
        }

        // v0.69: transfer leg -> plain expense/income conversion. The form
        // dispatches UPDATE_TRANSACTION on the tapped leg when the type toggle
        // leaves "transfer"; without this flag the counterpart leg survived as
        // a phantom (the other account's balance stayed wrong), the kept leg
        // still carried transferRef (transfer styling, and deleting it later
        // silently killed a counterpart the user never knew about), and the
        // sync block below kept pushing amount/date onto that ghost.
        const convertingFromTransfer = !!(payload.convertFromTransfer && existingTx.transferRef);

        if (existingTx.transferRef && !convertingFromTransfer) {
          const counterpartIndex = this.state.transactions.findIndex(t => t.transferRef === existingTx.transferRef && t.id !== existingTx.id);
          if (counterpartIndex !== -1) {
            const counterpartTx = this.state.transactions[counterpartIndex];
            // 1.0.2 (BUG-35): UPDATE_TRANSFER's rule — never copy a figure into
            // another currency; a save changing neither the amount nor this
            // leg's account leaves the other leg alone (D-U8-11).
            const legAccountId = payload.accountId !== undefined ? payload.accountId : existingTx.accountId;
            const amountTouched = absoluteAmount !== undefined &&
              (absoluteAmount !== Math.abs(existingTx.amount) || legAccountId !== existingTx.accountId);
            if (amountTouched && this._sameCurrency(legAccountId, counterpartTx.accountId)) counterpartTx.amount = absoluteAmount;
            if (payload.date !== undefined) counterpartTx.date = payload.date;
            if (payload.time !== undefined) counterpartTx.time = payload.time; // 1.0.3 (BUG-99)
            if (payload.note !== undefined) counterpartTx.note = payload.note;
            if (payload.comment !== undefined) counterpartTx.comment = payload.comment;
          }
        }

        const updatePayload = { ...payload };
        if (absoluteAmount !== undefined) updatePayload.amount = absoluteAmount;
        if (Array.isArray(payload.tags)) updatePayload.tags = payload.tags.map(t => t.toLowerCase());
        delete updatePayload.updateFuture;
        delete updatePayload.updateAll;
        delete updatePayload.regenerateSeries;
        delete updatePayload.convertFromTransfer;
        // v0.69: the kept leg stops being half of a pair
        if (convertingFromTransfer) updatePayload.transferRef = null;
        // v0.67: an undefined value must mean "leave this field alone", not
        // "overwrite with undefined" (e.g. time when the time input is hidden).
        Object.keys(updatePayload).forEach(k => {
          if (updatePayload[k] === undefined) delete updatePayload[k];
        });

        // v0.67: merge recurrence instead of replacing it. The form rebuilds
        // the recurrence object with a freshly computed nextDate on EVERY save;
        // blindly accepting it re-armed mid-series members as live generators
        // and materialized a duplicate future chain. Preserve fields the form
        // doesn't know about (propagateTags, startDate) and the member's own
        // generator state. A tx that was NOT part of a series keeps the armed
        // nextDate so newly-enabled recurrence still materializes.
        const existingRec = existingTx.recurrence || null;
        // 1.0.2 (BUG-26): the schedule is the SERIES' (read before anything
        // below mutates) — never the tapped member's own, possibly stale, copy.
        const sched = existingRec && existingRec.seriesId ? this.getSeriesSchedule(existingRec.seriesId) : null;
        const scoped = !!(payload.updateFuture || payload.updateAll);
        if (sched && updatePayload.recurrence) {
          updatePayload.recurrence = this._resolveSeriesRec(updatePayload.recurrence, sched, scoped);
        }
        if (updatePayload.recurrence) {
          const merged = { ...(existingRec || {}), ...updatePayload.recurrence };
          if (existingRec) {
            if (existingRec.nextDate) merged.nextDate = existingRec.nextDate;
            else delete merged.nextDate;
            // 1.0.3 (BUG-51): the member's own anchor (a rebuild sets a new one below)
            if (existingRec.anchorDay) merged.anchorDay = existingRec.anchorDay;
            else delete merged.anchorDay;
          } else {
            if (!merged.startDate) merged.startDate = payload.date || existingTx.date;
            // 1.0.3 (BUG-51): a new chain steps from its own day
            if (!merged.anchorDay) merged.anchorDay = Number(String(payload.date || existingTx.date).slice(8, 10)) || undefined;
          }
          // v0.67: the edit path honors the same 60-month window as creation
          this._clampRecurrenceEndDate(merged, payload.date || existingTx.date);
          updatePayload.recurrence = merged;
        }

        // Classify the change BEFORE mutating (drives the future/all scopes)
        const seriesId = (existingRec && existingRec.seriesId) || (payload.recurrence && payload.recurrence.seriesId);
        const dateChanged = payload.date !== undefined && payload.date !== existingTx.date;
        // 1.0.2 (BUG-26): changed against the SERIES' schedule
        const scheduleChanged = !!(updatePayload.recurrence && existingRec &&
          ['endDate', 'interval', 'frequency'].some(k =>
            String(updatePayload.recurrence[k]) !== String((sched || existingRec)[k])));
        const recurrenceRemoved = !!existingRec && payload.recurrence === null;
        const baseDate = existingTx.date; // original date: the past/future split point
        // 1.0.3 (BUG-136): a payment dated today or earlier has happened —
        // Recurrent off with a scope unlinks it instead of deleting it
        const today = this._todayYMD();
        // 1.0.3 (BUG-51): a 'This and future' / 'All' date move (or a new
        // interval/frequency) rebuilds the chain on its new day (below)
        const stepChanged = !!(updatePayload.recurrence && sched &&
          (String(updatePayload.recurrence.interval) !== String(sched.interval) ||
            String(updatePayload.recurrence.frequency) !== String(sched.frequency)));
        // 1.0.3 (BUG-139, D1): the payments deleted with 'Only this', read from
        // the chain BEFORE anything below moves or drops a member. A new
        // interval/frequency cannot map them (the scope sheet warns instead).
        const seriesGaps = (scoped && seriesId && sched && !recurrenceRemoved && !stepChanged &&
          (payload.regenerateSeries || dateChanged || scheduleChanged))
          ? this._seriesGaps(seriesId, existingTx, sched) : [];

        // Update the target transaction
        this.state.transactions[index] = {
          ...existingTx,
          ...updatePayload,
          tags: (updatePayload.tags !== undefined) ? updatePayload.tags : (existingTx.tags || []),
          updatedAt: new Date().toISOString()
        };

        // 1.0.2 (BUG-74): an 'Only this' amount change on a loan's linked
        // payment is a hand edit — the loan sync keeps it. A scoped amount
        // change makes the amount the series' own again.
        const amountMoved = absoluteAmount !== undefined &&
          Math.round(Math.abs(absoluteAmount) * 100) !== Math.round(Math.abs(Number(existingTx.amount)) * 100);
        if (amountMoved && seriesId) {
          const edited = this.state.transactions[index];
          if (scoped) delete edited.amountEdited;
          else if ((this.state.loans || []).some(l => l.linkedSeriesId === seriesId)) edited.amountEdited = true;
        }

        if (convertingFromTransfer) {
          // v0.69: drop the counterpart leg(s) and unlink the kept one(s).
          // Which leg survives is decided by the ROLE the user tapped
          // (existingTx.type), not by the new type — tapping the income side
          // of a transfer and saving it as an expense keeps that same row.
          // Scope: this occurrence, plus the later members of the series when
          // future/all was chosen. Past occurrences are never restructured —
          // the same promise the scope modal makes for the regular -> transfer
          // direction, so 'all' behaves like 'future' here.
          const keptType = existingTx.type;
          const newType = updatePayload.type || existingTx.type;
          const refsToConvert = new Set([existingTx.transferRef]);
          if (seriesId && (payload.updateFuture || payload.updateAll)) {
            this.state.transactions.forEach(t => {
              if (t.transferRef && t.recurrence && t.recurrence.seriesId === seriesId && t.date >= baseDate) {
                refsToConvert.add(t.transferRef);
              }
            });
          }
          const idsToDrop = new Set();
          // 1.0.3: a dropped leg's generator state moves to the leg kept from
          // the same pair (same date) — converting the INCOME legs kept them
          // and dropped the armed expense tail, so the series lost its
          // generator and its end collapsed onto the last payment.
          const armedNext = new Map();
          this.state.transactions.forEach(t => {
            if (t.transferRef && refsToConvert.has(t.transferRef) && t.type !== keptType &&
              t.recurrence && t.recurrence.nextDate) armedNext.set(t.transferRef, t.recurrence.nextDate);
          });
          this.state.transactions.forEach(t => {
            if (!t.transferRef || !refsToConvert.has(t.transferRef)) return;
            if (t.type === keptType) {
              const next = armedNext.get(t.transferRef);
              if (next && t.recurrence && t.recurrence.seriesId) t.recurrence = { ...t.recurrence, nextDate: next };
              t.transferRef = null;
              t.type = newType;
              t.updatedAt = new Date().toISOString();
            } else {
              idsToDrop.add(t.id);
            }
          });
          if (idsToDrop.size > 0) {
            this.state.transactions = this.state.transactions.filter(t => !idsToDrop.has(t.id));
          }
        }

        if ((payload.updateFuture || payload.updateAll) && seriesId) {
           // v0.67 scope semantics:
           // - The literal date is NEVER stamped onto other members. Past dates
           //   are untouchable; a date/schedule change reshapes the future by
           //   REGENERATING it from this member instead.
           // - "all" additionally applies the non-date fields to past members.
           // - recurrence:null + future scope = stop the series here (future
           //   materialized occurrences are removed).
           const regenerate = payload.regenerateSeries || dateChanged || scheduleChanged || recurrenceRemoved;

           const propagate = (t, i) => {
             const tUpdate = { ...updatePayload };
             delete tUpdate.id;
             delete tUpdate.date; // never move another member's date
             // v0.67: type is per-member — propagating it flipped the income
             // legs of future transfer pairs into expenses (double-expense
             // corruption when a transfer leg's type was converted with a
             // future/all scope)
             // 1.0.3 (BUG-135): ...on transfer legs only. A plain member takes
             // an expense/income switch with the category it goes with (the
             // legs a conversion keeps are plain by now, already retyped).
             if (t.transferRef || !['income', 'expense'].includes(tUpdate.type)) delete tUpdate.type;
             // 1.0.2 (BUG-27): paid state is per occurrence — the edited
             // payment still takes its flip, the others keep their own
             delete tUpdate.isPaid;
             if (t.transferRef && t.type !== existingTx.type) {
               // Counterpart leg of a transfer pair: its account/category
               // belong to the OTHER side — only shared fields may propagate
               delete tUpdate.accountId;
               delete tUpdate.categoryId;
               if (!this._sameCurrency(payload.accountId || existingTx.accountId, t.accountId)) delete tUpdate.amount; // 1.0.2 (BUG-35)
             }
             if (recurrenceRemoved) {
               tUpdate.recurrence = null;
             } else if (tUpdate.recurrence) {
               // Per-member copy (the old code aliased ONE object across all
               // members) preserving each member's own generator state.
               const memberRec = { ...(t.recurrence || {}), ...tUpdate.recurrence };
               if (t.recurrence && t.recurrence.nextDate) memberRec.nextDate = t.recurrence.nextDate;
               else delete memberRec.nextDate;
               // 1.0.3 (BUG-51): anchorDay is the member's own chain's, never propagated
               if (t.recurrence && t.recurrence.anchorDay) memberRec.anchorDay = t.recurrence.anchorDay;
               else delete memberRec.anchorDay;
               tUpdate.recurrence = memberRec;
             }
             const next = { ...t, ...tUpdate, updatedAt: new Date().toISOString() };
             // 1.0.2 (BUG-74): a propagated amount is the series' own again
             if (tUpdate.amount !== undefined) delete next.amountEdited;
             this.state.transactions[i] = next;
           };

           this.state.transactions.forEach((t, i) => {
             if (!t.recurrence || t.recurrence.seriesId !== seriesId || t.id === existingTx.id) return;
             const isFuture = t.date >= baseDate;
             // 1.0.3 (BUG-136, D5): Recurrent off keeps what already happened —
             // the payments up to today take the edit (recurrence: null), so
             // they stay in History unlinked; only the later ones are dropped.
             const kept = recurrenceRemoved && t.date <= today;
             // v0.69: a conversion's 'all' scope stops at the present — past
             // occurrences stay untouched transfer pairs, so their legs must
             // not inherit the converted account/category either.
             if (payload.updateAll && !convertingFromTransfer) {
               if (!isFuture || !regenerate || kept) propagate(t, i);
             } else if (isFuture && (!regenerate || kept)) {
               propagate(t, i);
             }
           });

           if (regenerate) {
              // Drop future members and let _processRecurringTransactions
              // rebuild them from this member's new date/schedule.
              // v0.98: the drop window starts at the EARLIER of the old and new
              // date — when a date moves backward (7th → 5th), same-series
              // members sitting between the two (interleaved duplicate chains
              // from poisoned data) must fall inside the regeneration, or the
              // rebuilt chain lands next to them and the month shows twice.
              const dropFrom = (payload.date !== undefined && payload.date < baseDate) ? payload.date : baseDate;
              this.state.transactions = this.state.transactions.filter(t => {
                 const isFutureInSeries = t.recurrence && t.recurrence.seriesId === seriesId &&
                   t.id !== existingTx.id && t.date >= dropFrom &&
                   !(existingTx.transferRef && t.transferRef === existingTx.transferRef) &&
                   (!recurrenceRemoved || t.date > today); // 1.0.3 (BUG-136): never a payment that happened
                 return !isFutureInSeries;
              });
              const updatedTx = this.state.transactions.find(t => t.id === payload.id);
              if (updatedTx && updatedTx.recurrence && !recurrenceRemoved) {
                 // 1.0.3 (BUG-51): a fresh object (it may still be existingTx's)
                 updatedTx.recurrence = { ...updatedTx.recurrence };
                 // 1.0.2 (BUG-26): the re-armed member never ends before its own date
                 if (updatedTx.recurrence.endDate && updatedTx.recurrence.endDate < updatedTx.date) {
                    updatedTx.recurrence.endDate = updatedTx.date;
                 }
                 // 1.0.3 (BUG-51): a scoped date move (or a new interval /
                 // frequency) starts the rebuilt chain on the new day
                 if (dateChanged || stepChanged) updatedTx.recurrence.anchorDay = Number(String(updatedTx.date).slice(8, 10)) || undefined;
                 updatedTx.recurrence.nextDate = this._nextSeriesDate(updatedTx.date, updatedTx.recurrence);
              }
              // v0.98: after a regeneration exactly ONE member may be armed —
              // the edited one. A stray armed PAST member (old duplicate-chain
              // bug / pre-v0.68 import poison) survives the drop above, and the
              // processing pass below would materialize the old chain right
              // back on the old dates next to the regenerated one.
              this.state.transactions.forEach((t, i) => {
                 if (t.id === payload.id || !t.recurrence || t.recurrence.seriesId !== seriesId || !t.recurrence.nextDate) return;
                 if (existingTx.transferRef && t.transferRef === existingTx.transferRef) return;
                 const disarmed = { ...t.recurrence };
                 delete disarmed.nextDate;
                 this.state.transactions[i] = { ...t, recurrence: disarmed };
              });
           }
        }

        // 1.0.2 (BUG-26): every member carries the series' schedule
        if (seriesId) this._syncSeriesSchedule(seriesId);
        this._sortTransactions();
        window.StackdDB.save('transactions', this.state.transactions);
        this._processRecurringTransactions();
        // 1.0.3 (BUG-139, D1): the rebuilt chain keeps the old one's gaps
        if (seriesGaps.length && this._dropSeriesGaps(seriesId, payload.id, seriesGaps)) {
          this._syncSeriesSchedule(seriesId);
          window.StackdDB.save('transactions', this.state.transactions);
        }
        changed = true;
        break;
      }

      case 'ADD_TRANSFER': {
        const transferRef = window.StackdDB.generateId();
        const tagsArray = Array.isArray(payload.tags) ? payload.tags.map(t => t.toLowerCase()) : [];

        // Handle recurrence initialization
        // v0.67: no longer gated on recurrence.enabled (see ADD_TRANSACTION)
        if (payload.recurrence) {
          if (!payload.recurrence.startDate) {
            payload.recurrence.startDate = payload.date;
          }
          this._clampRecurrenceEndDate(payload.recurrence, payload.date);
          if (!payload.recurrence.seriesId) {
            payload.recurrence.seriesId = window.StackdDB.generateId();
          }
          // 1.0.3 (BUG-51): the chain's day, on both legs (copied below)
          if (!payload.recurrence.anchorDay) payload.recurrence.anchorDay = Number(String(payload.date).slice(8, 10)) || undefined;
          if (!payload.recurrence.nextDate) {
            payload.recurrence.nextDate = this._nextSeriesDate(payload.date, payload.recurrence);
          }
        }

        const transferTime = payload.time || this._getSystemTimeString();
        const createdAtIso = new Date().toISOString();

        // v0.67: each leg gets its OWN recurrence object, and only the expense
        // leg carries the live nextDate. When both legs shared one object (and
        // both held nextDate) the generation pass consumed it twice: the second
        // leg read a stripped nextDate and crashed with "Invalid time value".
        const expenseRecurrence = payload.recurrence ? { ...payload.recurrence } : payload.recurrence;
        let incomeRecurrence = payload.recurrence ? { ...payload.recurrence } : payload.recurrence;
        if (incomeRecurrence) delete incomeRecurrence.nextDate;

        // Expense side (From)
        this.state.transactions.push({
          id: window.StackdDB.generateId(),
          type: 'expense',
          amount: Math.abs(payload.amount),
          accountId: payload.expenseAccountId,
          categoryId: '', // Transfers don't have a category
          date: payload.date,
          time: transferTime,
          comment: payload.note,
          transferRef: transferRef,
          tags: tagsArray,
          recurrence: expenseRecurrence,
          createdAt: createdAtIso,
          // v0.82: the form's Paid toggle. Lean storage — the key exists only
          // when unpaid; both legs always share one paid state (the
          // TOGGLE_TRANSACTION_PAID mirror invariant).
          ...(payload.isPaid === false ? { isPaid: false } : {})
        });

        // 1.0.2 (BUG-35): each leg in its OWN currency, never converted. Across
        // currencies the income leg holds what arrived; within one currency the
        // legs mirror (a stray receivedAmount is ignored). No receivedAmount
        // from an old caller = the old 1:1 behaviour; the form requires it.
        const received = this._sameCurrency(payload.expenseAccountId, payload.incomeAccountId)
          ? undefined : this._receivedAmount(payload);

        // Income side (To)
        this.state.transactions.push({
          id: window.StackdDB.generateId(),
          type: 'income',
          amount: received !== undefined ? received : Math.abs(payload.amount),
          accountId: payload.incomeAccountId,
          categoryId: '',
          date: payload.date,
          time: transferTime,
          comment: payload.note,
          transferRef: transferRef,
          tags: tagsArray,
          recurrence: incomeRecurrence,
          createdAt: createdAtIso,
          ...(payload.isPaid === false ? { isPaid: false } : {})
        });

        this._sortTransactions();
        window.StackdDB.save('transactions', this.state.transactions);
        this._processRecurringTransactions();
        changed = true;
        break;
      }

      case 'UPDATE_TRANSFER': {
        // Specifically designed to reliably update both legs simultaneously from views
        // Requires payload: { transferRef, amount, expenseAccountId, incomeAccountId, date, note }
        // Update logic for Transfer
        const items = this.state.transactions.filter(t => t.transferRef === payload.transferRef);
        if (items.length === 0) break;

        const tagsArray = Array.isArray(payload.tags) ? payload.tags.map(t => t.toLowerCase()) : undefined;

        // Classify BEFORE mutating (v0.67)
        const baseDate = items[0].date;
        const existingRecT = (items.find(t => t.recurrence && t.recurrence.seriesId) || {}).recurrence || null;
        const seriesId = (existingRecT && existingRecT.seriesId) || (payload.recurrence && payload.recurrence.seriesId) || null;
        const dateChanged = payload.date !== undefined && payload.date !== baseDate;
        // 1.0.2 (BUG-26): resolve against the SERIES' schedule (read before
        // anything mutates) and classify the change against it — same rule as
        // UPDATE_TRANSACTION. legRecurrence and the propagated memberRec read rec.
        const schedT = existingRecT && existingRecT.seriesId ? this.getSeriesSchedule(existingRecT.seriesId) : null;
        const scopedT = !!(payload.updateFuture || payload.updateAll);
        const rec = (schedT && payload.recurrence) ? this._resolveSeriesRec(payload.recurrence, schedT, scopedT) : payload.recurrence;
        // 1.0.3 (BUG-51): same re-anchor rule as UPDATE_TRANSACTION — a scoped
        // date move (or a new interval/frequency) rebuilds on the new day
        const stepChangedT = !!(rec && schedT &&
          (String(rec.interval) !== String(schedT.interval) || String(rec.frequency) !== String(schedT.frequency)));
        // compared merged and 60-month-clamped, exactly like UPDATE_TRANSACTION
        // (an End Date past the cap that clamps back to the series end is no change)
        const recCmp = (rec && existingRecT)
          ? this._clampRecurrenceEndDate({ ...existingRecT, ...rec }, payload.date || baseDate) : null;
        const scheduleChanged = !!(recCmp &&
          ['endDate', 'interval', 'frequency'].some(k => String(recCmp[k]) !== String((schedT || existingRecT)[k])));
        const recurrenceRemoved = !!existingRecT && payload.recurrence === null;
        const today = this._todayYMD(); // 1.0.3 (BUG-136): see UPDATE_TRANSACTION
        // 1.0.3 (BUG-139, D1): the gaps, read before anything moves (the
        // expense leg stands for the edited pair)
        const editedLegT = items.find(t => t.type === 'expense' && t.recurrence) || items.find(t => t.recurrence);
        const seriesGapsT = (scopedT && seriesId && schedT && editedLegT && !recurrenceRemoved && !stepChangedT &&
          (payload.regenerateSeries || dateChanged || scheduleChanged))
          ? this._seriesGaps(seriesId, editedLegT, schedT) : [];
        // 1.0.2 (BUG-74): the expense leg's amount before the edit (the leg a
        // loan reads), for the hand-edit mark below
        const expLegBefore = items.find(t => t.type === 'expense') || items[0];
        const oldAmountC = Math.round(Math.abs(Number(expLegBefore.amount)) * 100);

        // v0.67: build a PER-LEG recurrence. The old code assigned the same
        // payload.recurrence object (with a freshly armed nextDate) to both
        // legs, which re-armed the pair as duplicate generators and crashed
        // _processRecurringTransactions ("Invalid time value"). Rules: keep
        // fields the form doesn't send, preserve the leg's own generator
        // state, and when recurrence is newly enabled arm ONLY the expense leg.
        const legRecurrence = (item) => {
          if (rec === undefined) return item.recurrence;
          if (rec === null) return null;
          const merged = { ...(item.recurrence || {}), ...rec };
          if (item.recurrence) {
            if (item.recurrence.nextDate) merged.nextDate = item.recurrence.nextDate;
            else delete merged.nextDate;
            // 1.0.3 (BUG-51): the leg's own anchor (set below on a rebuild)
            if (item.recurrence.anchorDay) merged.anchorDay = item.recurrence.anchorDay;
            else delete merged.anchorDay;
          } else {
            if (!merged.startDate) merged.startDate = payload.date || item.date;
            // 1.0.3 (BUG-51): a new chain steps from its own day
            if (!merged.anchorDay) merged.anchorDay = Number(String(payload.date || item.date).slice(8, 10)) || undefined;
            if (item.type !== 'expense') delete merged.nextDate;
          }
          // v0.67: the edit path honors the same 60-month window as creation
          this._clampRecurrenceEndDate(merged, payload.date || item.date);
          return merged;
        };

        // 1.0.2 (BUG-35): the income leg's amount, judged on the pair's
        // accounts AFTER the edit; computed now because the loop below mutates
        // the legs in place. undefined = leave every income leg's amount alone.
        const expLeg = items.find(t => t.type === 'expense');
        const incLeg = items.find(t => t.type === 'income');
        const fromId = payload.expenseAccountId !== undefined ? payload.expenseAccountId : (expLeg && expLeg.accountId);
        const toId = payload.incomeAccountId !== undefined ? payload.incomeAccountId : (incLeg && incLeg.accountId);
        const sentAbs = payload.amount !== undefined ? Math.abs(payload.amount) : undefined;
        let incomeAmount;
        if (this._sameCurrency(fromId, toId)) {
          // Mirror, as before — but a save that changes neither the sent amount
          // nor an account keeps the pair's own received side (equal legs: the
          // same number; legs that differ after a relabel: kept, D-U8-11).
          const untouched = !!(expLeg && incLeg) && sentAbs === Math.abs(expLeg.amount) &&
            fromId === expLeg.accountId && toId === incLeg.accountId;
          incomeAmount = untouched ? Math.abs(incLeg.amount) : sentAbs;
        } else {
          incomeAmount = this._receivedAmount(payload); // the form requires it; else untouched
        }

        items.forEach(item => {
           if (item.type === 'expense') {
              if (payload.amount !== undefined) item.amount = Math.abs(payload.amount);
              if (payload.expenseAccountId !== undefined) item.accountId = payload.expenseAccountId;
              if (payload.date !== undefined) item.date = payload.date;
              if (payload.time !== undefined) item.time = payload.time; // 1.0.3 (BUG-99)
              if (payload.note !== undefined) item.comment = payload.note;
              if (payload.recurrence !== undefined) item.recurrence = legRecurrence(item);
              if (tagsArray !== undefined) item.tags = tagsArray;
              item.updatedAt = new Date().toISOString();
           } else if (item.type === 'income') {
              if (incomeAmount !== undefined) item.amount = incomeAmount; // 1.0.2 (BUG-35)
              if (payload.incomeAccountId !== undefined) item.accountId = payload.incomeAccountId;
              if (payload.date !== undefined) item.date = payload.date;
              if (payload.time !== undefined) item.time = payload.time; // 1.0.3 (BUG-99)
              if (payload.note !== undefined) item.comment = payload.note;
              if (payload.recurrence !== undefined) item.recurrence = legRecurrence(item);
              if (tagsArray !== undefined) item.tags = tagsArray;
              item.updatedAt = new Date().toISOString();
           }
           // v0.82: paid state, mirrored on both legs. Canonical storage:
           // unpaid = false, paid = key deleted.
           if (payload.isPaid !== undefined) {
              if (payload.isPaid === false) item.isPaid = false;
              else delete item.isPaid;
           }
           const idx = this.state.transactions.findIndex(t => t.id === item.id);
           this.state.transactions[idx] = { ...item };
        });

        // 1.0.2 (BUG-74): same hand-edit mark as UPDATE_TRANSACTION, on the
        // expense leg (the one getLoanFuturePayments reads)
        if (seriesId && payload.amount !== undefined && Math.round(Math.abs(payload.amount) * 100) !== oldAmountC) {
          const exp = this.state.transactions.find(t => t.transferRef === payload.transferRef && t.type === 'expense');
          if (exp && scopedT) delete exp.amountEdited;
          else if (exp && (this.state.loans || []).some(l => l.linkedSeriesId === seriesId)) exp.amountEdited = true;
        }

        // Handle updateFuture or updateAll for Transfers (v0.67 semantics —
        // mirrors UPDATE_TRANSACTION: literal dates never propagate, date and
        // schedule changes regenerate the future, past pairs stay put)
        if ((payload.updateFuture || payload.updateAll) && seriesId && baseDate) {
           const regenerate = payload.regenerateSeries || dateChanged || scheduleChanged || recurrenceRemoved;

           this.state.transactions.forEach((t, i) => {
              if (!t.recurrence || t.recurrence.seriesId !== seriesId || t.transferRef === payload.transferRef) return;
              const isFuture = t.date >= baseDate;
              const kept = recurrenceRemoved && t.date <= today; // 1.0.3 (BUG-136, D5)
              const shouldPropagate = payload.updateAll ? (!isFuture || !regenerate || kept) : (isFuture && (!regenerate || kept));
              if (!shouldPropagate) return;

              // 1.0.2 (BUG-35): each leg in its own currency (incomeAmount above)
              if (t.type === 'income') { if (incomeAmount !== undefined) t.amount = incomeAmount; }
              else if (payload.amount !== undefined) t.amount = Math.abs(payload.amount);
              if (payload.time !== undefined) t.time = payload.time; // 1.0.3 (BUG-99)
              if (payload.note !== undefined) t.comment = payload.note;
              if (payload.tags !== undefined) t.tags = payload.tags.map(tag => tag.toLowerCase());
              // 1.0.2 (BUG-27): paid is per occurrence — only the tapped pair (above) changes
              // 1.0.2 (BUG-74): a propagated amount is the series' own again
              if (payload.amount !== undefined) delete t.amountEdited;
              if (t.type === 'expense' && payload.expenseAccountId !== undefined) t.accountId = payload.expenseAccountId;
              if (t.type === 'income' && payload.incomeAccountId !== undefined) t.accountId = payload.incomeAccountId;
              if (recurrenceRemoved) {
                 t.recurrence = null;
              } else if (rec) {
                 // the clamped end, like UPDATE_TRANSACTION's propagated recurrence
                 const memberRec = { ...(t.recurrence || {}), ...rec, ...(recCmp && recCmp.endDate ? { endDate: recCmp.endDate } : {}) };
                 if (t.recurrence && t.recurrence.nextDate) memberRec.nextDate = t.recurrence.nextDate;
                 else delete memberRec.nextDate;
                 // 1.0.3 (BUG-51): anchorDay is the member's own chain's, never propagated
                 if (t.recurrence && t.recurrence.anchorDay) memberRec.anchorDay = t.recurrence.anchorDay;
                 else delete memberRec.anchorDay;
                 t.recurrence = memberRec;
              }
              t.updatedAt = new Date().toISOString();
              this.state.transactions[i] = { ...t };
           });

           if (regenerate) {
              // v0.98: same widened drop window + single-generator sweep as
              // UPDATE_TRANSACTION — see the comments there.
              const dropFrom = (payload.date !== undefined && payload.date < baseDate) ? payload.date : baseDate;
              this.state.transactions = this.state.transactions.filter(t => {
                 const isFutureInSeries = t.recurrence && t.recurrence.seriesId === seriesId &&
                   t.transferRef !== payload.transferRef && t.date >= dropFrom &&
                   (!recurrenceRemoved || t.date > today); // 1.0.3 (BUG-136): never a payment that happened
                 return !isFutureInSeries;
              });
              this.state.transactions.forEach((t, i) => {
                 if (!t.recurrence || t.recurrence.seriesId !== seriesId || t.transferRef === payload.transferRef || !t.recurrence.nextDate) return;
                 const disarmed = { ...t.recurrence };
                 delete disarmed.nextDate;
                 this.state.transactions[i] = { ...t, recurrence: disarmed };
              });
              if (!recurrenceRemoved) {
                 // Re-arm exactly one leg (the expense side) from the new date
                 const pair = this.state.transactions.filter(t => t.transferRef === payload.transferRef);
                 pair.forEach(t => {
                    if (!t.recurrence) return;
                    // 1.0.3 (BUG-51): a scoped date move (or a new interval /
                    // frequency) starts the rebuilt chain on the new day, both legs
                    if (dateChanged || stepChangedT) t.recurrence = { ...t.recurrence, anchorDay: Number(String(t.date).slice(8, 10)) || undefined };
                    if (t.type === 'expense') {
                       const r = { ...t.recurrence };
                       if (r.endDate && r.endDate < t.date) r.endDate = t.date; // 1.0.2 (BUG-26) floor
                       r.nextDate = this._nextSeriesDate(t.date, r); // 1.0.3 (BUG-51)
                       t.recurrence = r;
                    } else if (t.recurrence.nextDate) {
                       t.recurrence = { ...t.recurrence };
                       delete t.recurrence.nextDate;
                    }
                 });
              }
           }
        }

        // 1.0.2 (BUG-26): every member (both legs) carries the series' schedule
        if (seriesId) this._syncSeriesSchedule(seriesId);
        this._sortTransactions();
        window.StackdDB.save('transactions', this.state.transactions);
        this._processRecurringTransactions();
        // 1.0.3 (BUG-139, D1): the rebuilt chain keeps the old one's gaps
        if (seriesGapsT.length && this._dropSeriesGaps(seriesId, editedLegT.id, seriesGapsT)) {
          this._syncSeriesSchedule(seriesId);
          window.StackdDB.save('transactions', this.state.transactions);
        }
        changed = true;
        break;
      }

      case 'UPDATE_TRANSACTION_TAGS_ALL': {
        // v0.32: Propagate tag changes to ALL members of a recurring series
        // payload: { seriesId, tags }
        const { seriesId: allSeriesId, tags: newTagsAll } = payload;
        if (!allSeriesId) break;

        const tagsNormalised = Array.isArray(newTagsAll)
          ? newTagsAll.map(t => t.toLowerCase())
          : [];

        let tagsBulkChanged = false;
        this.state.transactions.forEach((t, i) => {
          if (t.recurrence && t.recurrence.seriesId === allSeriesId) {
            this.state.transactions[i] = {
              ...t,
              tags: tagsNormalised,
              updatedAt: new Date().toISOString()
            };
            tagsBulkChanged = true;
          }
        });

        if (tagsBulkChanged) {
          window.StackdDB.save('transactions', this.state.transactions);
          changed = true;
        }
        break;
      }

      case 'DELETE_RECURRING_FUTURE': {
        this.dispatch('DELETE_TRANSACTION', { id: payload.id, deleteFuture: true });
        changed = true;
        break;
      }

      case 'DELETE_RECURRING_ALL': {
        this.dispatch('DELETE_TRANSACTION', { id: payload.id, deleteAll: true });
        changed = true;
        break;
      }

      case 'UPDATE_RECURRING_SERIES': {
        this.dispatch('UPDATE_TRANSACTION', { ...payload, updateAll: true });
        changed = true;
        break;
      }

      case 'DELETE_TRANSACTION': {
        const txToDelete = this.state.transactions.find(t => t.id === payload.id);
        if (!txToDelete) break;

        let idsToDelete = new Set([txToDelete.id]);
        if (txToDelete.transferRef) {
          this.state.transactions.forEach(t => {
            if (t.transferRef === txToDelete.transferRef) idsToDelete.add(t.id);
          });
        }

        if (payload.deleteAll && txToDelete.recurrence && txToDelete.recurrence.seriesId) {
           this.state.transactions.forEach(t => {
              if (t.recurrence && t.recurrence.seriesId === txToDelete.recurrence.seriesId) {
                 idsToDelete.add(t.id);
                 if (t.transferRef) {
                    this.state.transactions.forEach(tc => {
                       if (tc.transferRef === t.transferRef) idsToDelete.add(tc.id);
                    });
                 }
              }
           });
        } else if (payload.deleteFuture && txToDelete.recurrence && txToDelete.recurrence.seriesId) {
           this.state.transactions.forEach(t => {
              if (t.recurrence && t.recurrence.seriesId === txToDelete.recurrence.seriesId && t.date >= txToDelete.date) {
                 idsToDelete.add(t.id);
                 if (t.transferRef) {
                    this.state.transactions.forEach(tc => {
                       if (tc.transferRef === t.transferRef) idsToDelete.add(tc.id);
                    });
                 }
              }
           });
        }

        this.state.transactions = this.state.transactions.filter(t => !idsToDelete.has(t.id));

        // 1.0.2 (BUG-26): the survivors carry the series' real schedule. A
        // 'This and future' cut removed the live tail, so an armed survivor
        // is poison (it would regenerate the deleted payments); the stopped
        // series then ends ON its last payment. Also covers DELETE_LOAN,
        // SYNC 'finish', DELETE_RECURRING_FUTURE and the form's conversion,
        // which all come through here.
        const cutSid = txToDelete.recurrence && txToDelete.recurrence.seriesId;
        if (cutSid) {
          if (payload.deleteFuture) this._disarmSeries(cutSid);
          this._syncSeriesSchedule(cutSid);
        }

        window.StackdDB.save('transactions', this.state.transactions);
        changed = true;
        break;
      }

      case 'TOGGLE_TRANSACTION_PAID': {
        const tx = this.state.transactions.find(t => t.id === payload.id);
        if (!tx) break;

        // v0.82: two-state toggle. Absence of isPaid means paid (the app-wide
        // convention every consumer, export and import are built on), so
        // marking paid DELETES the key rather than storing true — the old
        // three-state flip (undefined→true→false→…) could never return to the
        // canonical absent form. An explicit payload.isPaid still wins.
        const makeUnpaid = payload.isPaid !== undefined
          ? payload.isPaid === false
          : tx.isPaid !== false;
        // 1.0.2 (live-U2-1): an opening balance is never unpaid (one swipe
        // moved the balance by the whole opening amount, the BUG-25 class).
        // Marking one paid still works: the way back for a row stored unpaid.
        if (makeUnpaid && tx.type === 'opening_balance') break;

        const apply = (t) => {
          if (makeUnpaid) t.isPaid = false;
          else delete t.isPaid;
        };
        apply(tx);

        if (tx.transferRef) {
          this.state.transactions.forEach(t => {
            if (t.transferRef === tx.transferRef) apply(t);
          });
        }

        window.StackdDB.save('transactions', this.state.transactions);
        changed = true;
        break;
      }

      case 'TOGGLE_SELECTION_MODE': {
        const active = payload && payload.active !== undefined ? payload.active : !this.state.isSelectionMode;
        this.state.isSelectionMode = active;
        if (!active) {
          this.state.selectedTransactionIds = [];
        }
        changed = true;
        break;
      }

      case 'TOGGLE_TRANSACTION_SELECTION': {
        const id = payload.id;
        if (!id) break;
        const current = Array.isArray(this.state.selectedTransactionIds) ? this.state.selectedTransactionIds : [];
        if (current.includes(id)) {
          this.state.selectedTransactionIds = current.filter(i => i !== id);
        } else {
          this.state.selectedTransactionIds = [...current, id];
        }
        changed = true;
        break;
      }

      case 'SET_ALL_TRANSACTIONS_SELECTION': {
        const ids = payload.ids || [];
        this.state.selectedTransactionIds = payload.selectAll ? [...ids] : [];
        changed = true;
        break;
      }

      case 'DELETE_BULK_TRANSACTIONS': {
        const targetIds = (payload && payload.ids) || this.state.selectedTransactionIds || [];
        if (!Array.isArray(targetIds) || targetIds.length === 0) break;
        const deleteFuture = payload && payload.deleteFuture === true;

        let idsToDelete = new Set();
        targetIds.forEach(id => {
          const tx = this.state.transactions.find(t => t.id === id);
          if (tx) {
            idsToDelete.add(tx.id);
            if (tx.transferRef) {
              this.state.transactions.forEach(t => {
                if (t.transferRef === tx.transferRef) idsToDelete.add(t.id);
              });
            }

            if (deleteFuture && tx.recurrence && tx.recurrence.seriesId) {
              this.state.transactions.forEach(t => {
                if (t.recurrence && t.recurrence.seriesId === tx.recurrence.seriesId && t.date >= tx.date) {
                  idsToDelete.add(t.id);
                  if (t.transferRef) {
                    this.state.transactions.forEach(tc => {
                      if (tc.transferRef === t.transferRef) idsToDelete.add(tc.id);
                    });
                  }
                }
              });
            }
          }
        });

        // Collect affected account IDs before removal
        const affectedAccountIds = new Set();
        this.state.transactions.forEach(t => {
          if (idsToDelete.has(t.id) && t.accountId) {
            affectedAccountIds.add(t.accountId);
          }
        });

        // 1.0.2 (BUG-26): same series rule as DELETE_TRANSACTION — the series
        // a 'This and future' target cuts are disarmed, and every series that
        // lost a member re-stamps its schedule on the survivors.
        const touchedSeries = new Set();
        const cutSeries = new Set();
        this.state.transactions.forEach(t => {
          if (idsToDelete.has(t.id) && t.recurrence && t.recurrence.seriesId) touchedSeries.add(t.recurrence.seriesId);
        });
        if (deleteFuture) {
          targetIds.forEach(id => {
            const tx = this.state.transactions.find(t => t.id === id);
            if (tx && tx.recurrence && tx.recurrence.seriesId) cutSeries.add(tx.recurrence.seriesId);
          });
        }

        this.state.transactions = this.state.transactions.filter(t => !idsToDelete.has(t.id));
        cutSeries.forEach(sid => this._disarmSeries(sid));
        touchedSeries.forEach(sid => this._syncSeriesSchedule(sid));
        this.state.selectedTransactionIds = [];
        this.state.isSelectionMode = false;

        // Save batch deletion to database
        window.StackdDB.save('transactions', this.state.transactions);

        // Sort transactions so dynamic balance calculation from opening date baseline is clean
        this._sortTransactions();

        changed = true;
        break;
      }

      case 'BATCH_IMPORT_TRANSACTIONS': {
        // 1.0.2 (BUG-78): a restore keeps each row's id; one id is one
        // transaction. A payload row whose id is already here is dropped (the
        // last line of defence, as BATCH_IMPORT_BANK_TRANSACTIONS does for
        // keys). 1.0.2 (BUG-24): the id is written AFTER the spread — an
        // unsafe id (or an explicit `id: undefined`) gets a generated one — and
        // the duplicate check runs on that id.
        const importTime = this._getSystemTimeString();
        const ids = new Set(this.state.transactions.map(t => t.id));
        const newTxs = [];
        payload.transactions.forEach(t => {
          const id = this.safeId(t.id) || window.StackdDB.generateId();
          if (ids.has(id)) return;
          ids.add(id);
          newTxs.push({
            time: t.time || importTime,
            ...t,
            id: id,
            createdAt: t.createdAt || new Date().toISOString()
          });
        });
        if (!newTxs.length) break;
        this.state.transactions.push(...newTxs);
        this._sortTransactions();
        this._healSeriesSchedules(); // 1.0.2 (BUG-26): a pre-1.0.2 backup carries stale series ends
        this._healSeriesAnchors(); // 1.0.3 (BUG-51, D4): and chains drifted to the 28th
        window.StackdDB.save('transactions', this.state.transactions);
        changed = true;
        break;
      }

      case 'BATCH_IMPORT_BANK_TRANSACTIONS': {
        // v0.99: bank-statement import (docs/bank-import-plan.md §3). Unlike
        // the backup restore above, this is idempotent: every row must carry
        // an importKey and is dropped when the key already exists — the
        // preview marks duplicates, but the store is the last line of defence
        // against a double-tapped Confirm or a stale preview.
        const idx = this._ensureImportKeyIdx();
        const importTime = this._getSystemTimeString();
        const accepted = [];
        payload.transactions.forEach(t => {
          if (!t.importKey || idx.has(t.importKey)) return;
          idx.add(t.importKey); // intra-batch twins already carry '#n' suffixes
          accepted.push({
            id: window.StackdDB.generateId(),
            time: t.time || importTime,
            ...t,
            createdAt: t.createdAt || new Date().toISOString()
          });
        });
        if (accepted.length) {
          this.state.transactions.push(...accepted);
          this._sortTransactions();
          window.StackdDB.save('transactions', this.state.transactions);
          changed = true;
        }
        break;
      }

      case 'APPLY_IMPORT_MATCHES': {
        // v1.03: match/link + transfer pairing from the import preview
        // (docs/bank-import-plan.md §7). Two payload arrays, both optional:
        // - links: [{txId, importKey, bankRef?}] — the EXISTING transaction
        //   absorbs the bank identity so future re-imports dedup against it.
        //   Identity only: its date, category and any recurrence (including
        //   nextDate) are NEVER touched here.
        // - transfers: [{existingTxId, tx}] — inserts the incoming row and
        //   pairs it with the existing one under a fresh shared transferRef;
        //   both legs' categories empty per the paired-legs model. Rows that
        //   are already transfer legs or carry recurrence are refused.
        const links = (payload && payload.links) || [];
        const pairs = (payload && payload.transfers) || [];
        const idx = this._ensureImportKeyIdx();
        const importTime = this._getSystemTimeString();
        let touched = 0;

        links.forEach(l => {
          const t = this.state.transactions.find(x => x.id === l.txId);
          if (!t || t.importKey || !l.importKey || idx.has(l.importKey)) return;
          t.importKey = l.importKey;
          if (l.bankRef) t.bankRef = l.bankRef;
          idx.add(l.importKey);
          touched++;
        });

        pairs.forEach(p => {
          const target = this.state.transactions.find(x => x.id === p.existingTxId);
          if (!target || target.transferRef || target.recurrence) return;
          if (!p.tx || !p.tx.importKey || idx.has(p.tx.importKey)) return;
          const ref = window.StackdDB.generateId();
          target.transferRef = ref;
          target.categoryId = '';
          this.state.transactions.push({
            id: window.StackdDB.generateId(),
            time: p.tx.time || importTime,
            ...p.tx,
            categoryId: '',
            transferRef: ref,
            createdAt: new Date().toISOString()
          });
          idx.add(p.tx.importKey);
          touched++;
        });

        if (touched) {
          this._sortTransactions();
          window.StackdDB.save('transactions', this.state.transactions);
          changed = true;
        }
        break;
      }

      case 'SAVE_IMPORT_PRESET': {
        // v0.99: remember a bank file's column mapping by header signature so
        // the next statement from the same bank opens pre-mapped.
        if (!payload || !payload.signature || !payload.mapping) break;
        const now = new Date().toISOString();
        const presets = this.state.importPresets || (this.state.importPresets = []);
        const existing = presets.find(p => p.signature === payload.signature);
        if (existing) {
          existing.mapping = payload.mapping;
          existing.updatedAt = now;
        } else {
          presets.push({
            id: window.StackdDB.generateId(),
            signature: payload.signature,
            mapping: payload.mapping,
            createdAt: now,
            updatedAt: now
          });
          // Cap at 20: evict the least-recently-used layout, not the oldest.
          while (presets.length > 20) {
            let oldest = 0;
            presets.forEach((p, i) => {
              if ((p.updatedAt || '') < (presets[oldest].updatedAt || '')) oldest = i;
            });
            presets.splice(oldest, 1);
          }
        }
        window.StackdDB.save('importPresets', presets);
        changed = true;
        break;
      }

      case 'ADD_IMPORT_RULE': {
        // v1.01: category rule taught from the import preview (plan §5).
        // Prepending + dedupe-by-match means re-teaching a merchant replaces
        // the old rule and wins immediately (first match wins in
        // matchImportRule), which stands in for a reorder UI.
        // 1.0.2 (BUG-33): whitespace-collapsed, so a match taught from a legacy
        // multi-line note is one line, and re-teaching replaces a stored
        // 'supermercato\nrossi' instead of keeping it next to 'supermercato rossi'.
        const norm = (m) => String(m || '').toLowerCase().replace(/\s+/g, ' ').trim().slice(0, 60);
        const match = norm(payload && payload.match);
        if (!match || !payload.categoryId) break;
        const rules = this.state.importRules || (this.state.importRules = []);
        this.state.importRules = [
          { id: window.StackdDB.generateId(), match: match, categoryId: payload.categoryId, createdAt: new Date().toISOString() }
        ].concat(rules.filter(r => norm(r.match) !== match)).slice(0, 100); // cap bounds the per-row scan
        window.StackdDB.save('importRules', this.state.importRules);
        changed = true;
        break;
      }

      case 'DELETE_IMPORT_RULE': {
        const before = (this.state.importRules || []).length;
        this.state.importRules = (this.state.importRules || []).filter(r => r.id !== payload);
        if (this.state.importRules.length !== before) {
          window.StackdDB.save('importRules', this.state.importRules);
          changed = true;
        }
        break;
      }

      case 'ADD_CATEGORY': {
        const newCategory = {
          id: this.safeId(payload.id) || window.StackdDB.generateId(), // 1.0.2 (BUG-24)
          name: payload.name,
          icon: this.isSafeIcon(payload.icon) ? payload.icon : 'pin',
          isDefault: false,
          typeHint: payload.typeHint || 'both'
        };
        this.state.categories.push(newCategory);
        this._sortData();
        window.StackdDB.save('categories', this.state.categories);
        changed = true;
        break;
      }

      case 'UPDATE_CATEGORY': {
        const catIdx = this.state.categories.findIndex(c => c.id === payload.id);
        if (catIdx !== -1) {
          if (payload.name !== undefined) this.state.categories[catIdx].name = payload.name;
          if (payload.icon !== undefined && this.isSafeIcon(payload.icon)) this.state.categories[catIdx].icon = payload.icon; // 1.0.2 (BUG-24)
          // v1.19 (A-17): typeHint was accepted by ADD_CATEGORY but ignored
          // here, so the category editor's income/expense/both choice was
          // never saved on an EDIT (views.js sends it), and a restore could
          // not give an auto-created category its real kind back.
          if (['income', 'expense', 'both'].includes(payload.typeHint)) {
            this.state.categories[catIdx].typeHint = payload.typeHint;
          }
          this._sortData();
          window.StackdDB.save('categories', this.state.categories);
          changed = true;
        }
        break;
      }

      case 'DELETE_CATEGORY': {
        const hasTx = this.state.transactions.some(t => t.categoryId === payload.id);
        if (!hasTx) {
          this.state.categories = this.state.categories.filter(c => c.id !== payload.id);
          this._sortData();
          window.StackdDB.save('categories', this.state.categories);
          changed = true;
        }
        break;
      }

      case 'SET_VIEW':
        // 1.0.2 (BUG-69) a new local day rolls live periods; re-render only if the target view's own page moved
        if (this._rollLivePeriods().includes(this._livePageOf(payload))) changed = true;
        if (this.state.activeView !== payload) {
          this.state.activeView = payload;
          // v0.72: widget edit mode is a dashboard-only affordance; leaving the
          // dashboard must drop it, or coming back shows the chrome unexpectedly.
          if (payload !== 'dashboard') this.state.widgetEditMode = false;
          changed = true;
        }
        break;

      case 'ROLL_PERIODS':
        // 1.0.2 (BUG-69) main.js on resume, History's Today. Silent on other
        // views: a half-filled form must never re-render under the user. On
        // History/Analytics only that page's own roll re-renders (round-1
        // review): History's Today scrolls synchronously when nothing it shows
        // moved, and a re-render queued meanwhile would detach its target.
        if (this._rollLivePeriods().includes(this._livePageOf(this.state.activeView))) changed = true;
        break;

      case 'SET_DEBT_SIM':
        // v0.71 Phase 3: carries a freshly calculated simulation to #debt-results
        this.state.debtSim = payload || null;
        changed = true;
        break;

      case 'SET_PENDING_LOAN_LINK':
        // v0.71 Phase 4: arms {loanId, seriesId} before sending the user to the
        // prefilled transaction form; consumed by ADD_TRANSACTION on a match.
        this.state.pendingLoanLink = payload || null;
        // 1.0.1 (BUG-02): the user is tracking this loan by hand — its link is
        // theirs from now on, never the import's payment-note fallback.
        if (payload && payload.loanId) {
          const tracked = this.state.loans.find(l => l.id === payload.loanId);
          if (tracked && tracked.needsNoteRelink) {
            delete tracked.needsNoteRelink;
            window.StackdDB.save('loans', this.state.loans);
          }
        }
        break;

      case 'SAVE_EXPANDED_GRAPH_FILTERS':
      case 'UPDATE_EXPANDED_GRAPH_FILTERS': {
        this.state.expandedGraphFilters = {
          ...this.state.expandedGraphFilters,
          ...payload
        };
        window.StackdDB.save('expandedGraphFilters', this.state.expandedGraphFilters);
        changed = true;
        break;
      }

      case 'RESET_EXPANDED_GRAPH_FILTERS':
      case 'CLEAR_EXPANDED_GRAPH_FILTERS': {
        this.state.expandedGraphFilters = {
          interval: 'monthly',
          accounts: [],
          categories: []
        };
        window.StackdDB.save('expandedGraphFilters', this.state.expandedGraphFilters);
        changed = true;
        break;
      }

      case 'SAVE_BUDGET': {
        const existingIdx = this.state.budgets.findIndex(b => b.categoryId === payload.categoryId);
        if (existingIdx !== -1) {
          this.state.budgets[existingIdx] = { ...this.state.budgets[existingIdx], ...payload };
        } else {
          this.state.budgets.push({ id: window.StackdDB.generateId(), ...payload });
        }
        window.StackdDB.save('budgets', this.state.budgets);
        changed = true;
        break;
      }



      // ── Home dashboard widgets (v0.72, docs/home-widgets-plan.md §3.2) ────

      case 'ADD_HOME_WIDGET': {
        if (!payload || !payload.type) break;
        this.state.homeWidgets.push({
          id: window.StackdDB.generateId(),
          type: payload.type,
          size: payload.size === 'large' ? 'large' : 'small',
          config: payload.config ? { ...payload.config } : {},
          createdAt: new Date().toISOString()
        });
        window.StackdDB.save('homeWidgets', this.state.homeWidgets);
        changed = true;
        break;
      }

      case 'UPDATE_HOME_WIDGET': {
        const wIdx = this.state.homeWidgets.findIndex(w => w.id === (payload && payload.id));
        if (wIdx === -1) break;
        const currentW = this.state.homeWidgets[wIdx];
        const nextW = { ...currentW };
        if (payload.size === 'small' || payload.size === 'large') nextW.size = payload.size;
        if (payload.config) nextW.config = { ...currentW.config, ...payload.config };
        this.state.homeWidgets[wIdx] = nextW;
        window.StackdDB.save('homeWidgets', this.state.homeWidgets);
        changed = true;
        break;
      }

      case 'REMOVE_HOME_WIDGET': {
        const removeId = payload && (payload.id || payload);
        const beforeLen = this.state.homeWidgets.length;
        this.state.homeWidgets = this.state.homeWidgets.filter(w => w.id !== removeId);
        if (this.state.homeWidgets.length === beforeLen) break;
        window.StackdDB.save('homeWidgets', this.state.homeWidgets);
        changed = true;
        break;
      }

      case 'REORDER_HOME_WIDGETS': {
        // Only accept a true permutation of the current ids. A partial or
        // stale list would silently drop widgets, and this action is driven by
        // UI that may be one render behind the state.
        const orderedIds = (payload && payload.orderedIds) || payload;
        if (!Array.isArray(orderedIds)) break;
        if (orderedIds.length !== this.state.homeWidgets.length) break;
        const orderedSet = new Set(orderedIds);
        if (orderedSet.size !== orderedIds.length) break;
        if (!this.state.homeWidgets.every(w => orderedSet.has(w.id))) break;
        this.state.homeWidgets = orderedIds.map(id => this.state.homeWidgets.find(w => w.id === id));
        window.StackdDB.save('homeWidgets', this.state.homeWidgets);
        changed = true;
        break;
      }

      case 'TOGGLE_WIDGET_EDIT_MODE': {
        this.state.widgetEditMode = typeof payload === 'boolean'
          ? payload
          : !this.state.widgetEditMode;
        changed = true;
        break;
      }

      case 'RESET_APP': {
        // 1.0.2 (BUG-34 hand-off from U7): shrinking writes first — the
        // emptied transactions slice frees the most space — and the slices
        // that can GROW (categories, the widget seed, the view/default
        // resets) last, so at the storage quota a growing write never runs
        // before the space it needs has been released.
        window.StackdDB.save('transactions', []);
        window.StackdDB.save('loans', []);
        window.StackdDB.save('accounts', []);
        window.StackdDB.save('budgets', []);
        window.StackdDB.save('importPresets', []); // v0.99
        window.StackdDB.save('importRules', []); // v1.01
        // v1.05: connections are per-device state; B4 revokes them at the
        // broker (best effort) before this runs.
        this.state.bankConnect = this._bankConnectDefaults();
        window.StackdDB.save('bankConnect', this.state.bankConnect);
        this.state.bankConnections = [];
        window.StackdDB.save('bankConnections', []);
        // v1.13: state.pro is deliberately KEPT — it is a paid entitlement,
        // not user data, and the web build has no restore path.
        window.StackdDB.save('categories', [...DEFAULT_CATEGORIES]);
        // v0.72 Phase 5: reset = fresh-install experience, so the seed widget
        // comes back (Recent Activities no longer exists outside the widgets).
        this.state.homeWidgets = this._defaultHomeWidgets();
        window.StackdDB.save('homeWidgets', this.state.homeWidgets);
        // 1.0.2 (BUG-29): reset = fresh install. The saved Home view and the
        // default wallet name accounts and categories the reset wipes (a
        // restore from a pre-1.0.2 backup re-creates them under new ids).
        this.state.expandedGraphFilters = { interval: 'monthly', accounts: [], categories: [] };
        window.StackdDB.save('expandedGraphFilters', this.state.expandedGraphFilters);
        this.state.defaultAccountId = '';
        window.StackdDB.save('defaultAccountId', '');
        // Clear the first-launch flag so the region setup modal shows again
        // (v0.97: through StackdDB so the native file mirror deletes it too —
        // a raw removeItem would let the mirror resurrect it at next boot).
        window.StackdDB.remove('setup_done');
        this.state.loans = [];
        // App will force reload by the caller, so we don't even need to emit strictly
        break;
      }

      // ── Loans CRUD (v0.71 Phase 2: config-based records) ──────────────────

      case 'ADD_LOAN': {
        // v2 payload: { name, kind: 'sim'|'active', config, linkedSeriesId? }.
        // Legacy payload ({ name, amount, tan, durationMonths, startDate, ... })
        // is still accepted while the old DebtView exists: its fields are kept
        // for rendering and a config is derived so v2 consumers always find one.
        const isLegacy = !payload.config;
        const newLoan = {
          id: window.StackdDB.generateId(),
          name: payload.name || 'My Loan',
          kind: payload.kind === 'sim' ? 'sim' : 'active',
          config: payload.config || this._loanConfigFromLegacy(payload),
          linkedSeriesId: payload.linkedSeriesId || null,
          createdAt: new Date().toISOString(),
          updatedAt: null
        };
        // 1.0.1 (BUG-02): an imported loan that may still be linked by its
        // payment note (see _relinkLoanSeries). Persisted: the transactions
        // file may be imported later, even in another session.
        if (payload.needsNoteRelink && newLoan.kind === 'active' && !newLoan.linkedSeriesId) {
          newLoan.needsNoteRelink = true;
        }
        if (isLegacy) {
          newLoan.amount = payload.amount;
          newLoan.tan = payload.tan;
          newLoan.durationMonths = payload.durationMonths;
          newLoan.startDate = payload.startDate;
          newLoan.endDate = payload.endDate;
          newLoan.monthlyPayment = payload.monthlyPayment;
          newLoan.totalReimbursement = payload.totalReimbursement;
        }
        this.state.loans.push(newLoan);
        window.StackdDB.save('loans', this.state.loans);
        changed = true;
        break;
      }

      case 'UPDATE_LOAN': {
        // payload: { id, ...fieldsToUpdate } — v2 fields (kind, config,
        // linkedSeriesId) and legacy fields both merge; when legacy loan terms
        // change without an explicit config, the config is re-derived from the
        // merged record so it never goes stale.
        const lIdx = this.state.loans.findIndex(l => l.id === payload.id);
        if (lIdx !== -1) {
          const merged = {
            ...this.state.loans[lIdx],
            ...payload,
            updatedAt: new Date().toISOString()
          };
          const legacyTermsTouched = ['amount', 'tan', 'durationMonths', 'startDate']
            .some(k => payload[k] !== undefined);
          if (!payload.config && legacyTermsTouched) {
            merged.config = this._loanConfigFromLegacy(merged);
          }
          // 1.0.1 (BUG-02): the user has edited the loan as it stands, so a
          // later transactions import must not link it behind their back.
          delete merged.needsNoteRelink;
          this.state.loans[lIdx] = merged;
          window.StackdDB.save('loans', this.state.loans);
          changed = true;
        }
        break;
      }

      case 'SYNC_LOAN_SERIES': {
        // 1.0.1 (BUG-07): payload { id, prevConfig } — bring an active loan's
        // linked series in line with its edited terms, after the user accepted
        // the prompt. The plan is recomputed here (never trusted from a stale
        // view).
        //  - 'finish': the loan now ends before the next linked payment →
        //    "this and future" delete from the first future member;
        //  - 'update' (review 3): the series end moves IN PLACE
        //    (_moveSeriesEnd — never by regenerating the chain, which cloned one
        //    member's account/category/note over every future payment and
        //    brought deleted ones back), payments dated before the loan's new
        //    first instalment go, then each future member is re-priced to its
        //    own month's amount where the edit changed that month.
        // Past members are never touched (beyond the series' end-date
        // metadata). A series later converted to a transfer is handled on both
        // legs by every step.
        const loan = this.state.loans.find(l => l.id === payload.id);
        const plan = loan ? this.getLoanSeriesSyncPlan(loan, payload.prevConfig) : null;
        if (!plan) break;
        if (plan.mode === 'finish') {
          this.dispatch('DELETE_TRANSACTION', { id: plan.firstId, deleteFuture: true });
          this._disarmSeries(loan.linkedSeriesId);
          // review 6: the survivors carry the series' real end (their last
          // date) — an old, later end would let a future "this and future"
          // date edit regenerate every deleted payment.
          const left = this.state.transactions.filter(t => t.recurrence && t.recurrence.seriesId === loan.linkedSeriesId);
          const lastDate = left.reduce((acc, t) => (t.date > acc ? t.date : acc), '');
          if (lastDate) {
            left.forEach(t => {
              if (t.recurrence.endDate !== lastDate) t.recurrence = { ...t.recurrence, endDate: lastDate };
            });
          }
          window.StackdDB.save('transactions', this.state.transactions);
        } else {
          let newSim, oldSim;
          try {
            newSim = window.LoanEngine.simulate({ ...loan.config, computeSavings: false });
            oldSim = window.LoanEngine.simulate({ ...payload.prevConfig, computeSavings: false });
          } catch (e) {
            break;
          }
          if (plan.endDate) this._moveSeriesEnd(loan.linkedSeriesId, plan.endDate);
          // Payments dated before the loan's (new) first instalment — the
          // first payment moved later — have nothing to pay.
          const startMonth = newSim.schedule.length ? newSim.schedule[0].date.slice(0, 7) : '';
          const orphans = this.getLoanFuturePayments(loan).filter(m => m.date.slice(0, 7) < startMonth);
          if (orphans.length) this._removeSeriesMembers(orphans);
          const now = new Date().toISOString();
          let repriced = false;
          // 1.0.2 (BUG-74): payments the user changed by hand keep their
          // amount — decided once, on the plan (computed above, before the
          // end move), so the prompt and this loop name the same payments.
          const keep = new Set(plan.customIds || []);
          this.getLoanFuturePayments(loan).forEach(m => {
            if (keep.has(m.id)) return;
            const toC = this._loanMonthRegularC(loan.config, newSim, m.date);
            if (toC == null) return;
            const oldC = this._loanMonthRegularC(payload.prevConfig, oldSim, m.date);
            if (oldC === toC || Math.round(Math.abs(Number(m.amount)) * 100) === toC) return;
            delete m.amountEdited; // back on the schedule
            this._setLoanMemberAmount(m, toC, now);
            repriced = true;
          });
          if (repriced) this._budgetSpendIdx = null;
          this._syncSeriesSchedule(loan.linkedSeriesId); // 1.0.2 (BUG-26)
          window.StackdDB.save('transactions', this.state.transactions);
        }
        changed = true;
        break;
      }

      case 'PROMOTE_LOAN': {
        // payload: { id } — flips a saved simulation into a tracked loan
        const loan = this.state.loans.find(l => l.id === payload.id);
        if (loan && loan.kind !== 'active') {
          loan.kind = 'active';
          loan.updatedAt = new Date().toISOString();
          window.StackdDB.save('loans', this.state.loans);
          changed = true;
        }
        break;
      }

      case 'DELETE_LOAN': {
        // payload: { id, deleteFuturePayments? }
        // v0.71 Phase 4: disarm a pending link aimed at the loan being removed
        if (this.state.pendingLoanLink && this.state.pendingLoanLink.loanId === payload.id) {
          this.state.pendingLoanLink = null;
        }
        // 1.0.1 (BUG-06): optionally take the linked series' FUTURE payments
        // (dated after today) with the loan, through the recurring "this and
        // future" delete; past and today's payments are history and stay.
        // The lookup must happen before the loan is filtered out below.
        if (payload.deleteFuturePayments) {
          const loan = this.state.loans.find(l => l.id === payload.id);
          const fut = loan ? this.getLoanFuturePayments(loan) : [];
          if (fut.length) {
            this.dispatch('DELETE_TRANSACTION', { id: fut[0].id, deleteFuture: true });
            if (this._disarmSeries(loan.linkedSeriesId)) {
              window.StackdDB.save('transactions', this.state.transactions);
            }
          }
        }
        this.state.loans = this.state.loans.filter(l => l.id !== payload.id);
        window.StackdDB.save('loans', this.state.loans);
        changed = true;
        break;
      }

      // v0.94: SET_ACCOUNT_FILTER removed — activeAccountFilter had zero
      // readers; the wallet deep-link goes through UPDATE_FILTERS {replace}.

      case 'SET_CURRENCY': {
        // 1.0.1 (BUG-01): 'EUR' (onboarding, tests, cross-tab) or
        // { code, relabel } from Components.CurrencySwitchConfirm. relabel
        // moves EVERY account still in the OLD base to the new code, all or
        // nothing (keeps same-currency transfer pairs on one currency). It is
        // a label change only: amounts are never converted.
        const code = typeof payload === 'string' ? payload : (payload && payload.code);
        if (!code) break;
        const prev = this.state.currency;
        if (payload && typeof payload === 'object' && payload.relabel && code !== prev) {
          let moved = false;
          this.state.accounts.forEach(a => {
            if ((a.currency || prev) === prev) { a.currency = code; moved = true; }
          });
          if (moved) window.StackdDB.save('accounts', this.state.accounts);
        }
        this.state.currency = code;
        window.StackdDB.save('currency', code);
        changed = true;
        break;
      }

      case 'SET_LANGUAGE': {
        this.state.language = payload;
        window.StackdDB.save('language', payload);
        // v0.86 P8a: the emit() below re-renders the active view wholesale,
        // so flipping I18n.lang here is all live language switching needs.
        if (window.I18n) window.I18n.setLang(payload);
        changed = true;
        break;
      }

      case 'SET_ENABLE_TIME_INPUT': {
        this.state.enableTimeInput = !!payload;
        window.StackdDB.save('enableTimeInput', this.state.enableTimeInput);
        changed = true;
        break;
      }

      // ── Bank Connect (v1.05, docs/bank-connect-ux-plan.md) ────────────────

      // Shallow merge of the prefs object; `entitlement` merges one level
      // deeper so a partial {active} update keeps expiresAt.
      case 'SET_BANK_CONNECT_PREFS': {
        const cur = this.state.bankConnect || this._bankConnectDefaults();
        const p = payload || {};
        const next = Object.assign({}, cur, p);
        if (p.entitlement) next.entitlement = Object.assign({}, cur.entitlement, p.entitlement);
        this.state.bankConnect = next;
        window.StackdDB.save('bankConnect', next);
        changed = true;
        break;
      }

      // ── Stack'd Pro (v1.13, docs/pro-unlock.md) ───────────────────────────
      // Shallow merge; Pro._activate is the only writer besides tests.
      case 'SET_PRO': {
        // 1.0.2 (BUG-34, D-U7-11): {sessionOnly} holds the unlock in memory
        // when storage is full (Pro._activate) — the store re-signals
        // ownership at every launch.
        const { sessionOnly, ...fields } = payload || {};
        const next = Object.assign({}, this.state.pro || this._proDefaults(), fields);
        this.state.pro = next;
        if (!sessionOnly) window.StackdDB.save('pro', next);
        changed = true;
        break;
      }

      case 'ADD_BANK_CONNECTION': {
        if (!payload || !payload.ref) break;
        const list = (this.state.bankConnections || []).filter(c => c.ref !== payload.ref);
        list.push(Object.assign({ accounts: [], connectedAt: new Date().toISOString(), lastFetchAt: null, status: 'LN' }, payload));
        this.state.bankConnections = list;
        window.StackdDB.save('bankConnections', list);
        changed = true;
        break;
      }

      case 'UPDATE_BANK_CONNECTION': {
        if (!payload || !payload.ref) break;
        const list = this.state.bankConnections || [];
        const idx = list.findIndex(c => c.ref === payload.ref);
        if (idx === -1) break;
        list[idx] = Object.assign({}, list[idx], payload);
        this.state.bankConnections = [...list];
        window.StackdDB.save('bankConnections', this.state.bankConnections);
        changed = true;
        break;
      }

      case 'REMOVE_BANK_CONNECTION': {
        const before = (this.state.bankConnections || []).length;
        this.state.bankConnections = (this.state.bankConnections || []).filter(c => c.ref !== payload);
        if (this.state.bankConnections.length !== before) {
          window.StackdDB.save('bankConnections', this.state.bankConnections);
          changed = true;
        }
        break;
      }

      case 'RELINK_LOAN_SERIES': {
        // 1.0.1 (BUG-02): dispatched by import.js after a loans or a
        // transactions import, so it works in either file order. Links loans
        // from a backup made before the LinkedSeriesId column to their payment
        // series by the payment note (see _relinkLoanSeries).
        if (this._relinkLoanSeries()) {
          window.StackdDB.save('loans', this.state.loans);
          changed = true;
        }
        break;
      }

      case 'SET_THEME': {
        const validThemes = ['system', 'light', 'dark'];
        const newTheme = validThemes.includes(payload) ? payload : 'system';
        this.state.theme = newTheme;
        window.StackdDB.save('theme', newTheme);
        this.applyTheme();
        changed = true;
        break;
      }

      case 'SET_ANALYTICS_BALANCE_MODE': {
        // v0.64 - 'today' shows the balance as of now; 'end' shows the projected period-end balance
        this.state.analyticsBalanceMode = payload === 'end' ? 'end' : 'today';
        window.StackdDB.save('analyticsBalanceMode', this.state.analyticsBalanceMode);
        changed = true;
        break;
      }

      case 'SET_PERIOD_TYPE':
        this.state.activePeriod.type = payload;
        changed = true;
        break;

      case 'SET_PERIOD_VALUE':
        this.state.activePeriod.value = payload;
        // Sync legacy filter if applicable
        this.state.activeMonthFilter = payload.substring(0, 7);
        changed = true;
        break;

      case 'NAVIGATE_PERIOD': {
        const payloadObj = typeof payload === 'object' ? payload : { offset: payload, page: null };
        const offset = payloadObj.offset;
        const page = payloadObj.page;
        // 1.0.2 (BUG-69) ‹ › step from the period ON SCREEN (this page is kept);
        // the other page reconciles, and the result is judged against today.
        this._rollLivePeriods(page);
        
        let periodRef = this.state.activePeriod;
        if (page === 'history') periodRef = this.state.historyFilters.period;
        else if (page === 'analytics') periodRef = this.state.analyticsFilters.period;
        
        const type = periodRef.type;
        const currentVal = periodRef.value;
        const d = new Date(currentVal + 'T00:00:00');
        
        if (type === 'today') d.setDate(d.getDate() + offset);
        else if (type === 'week') d.setDate(d.getDate() + (offset * 7));
        else if (type === 'month') d.setMonth(d.getMonth() + offset);
        else if (type === 'year') d.setFullYear(d.getFullYear() + offset);
        
        const fmt = (dt) => `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
        periodRef.value = fmt(d);
        
        // Sync legacy global state if it's the global period
        if (!page) {
           this.state.activeMonthFilter = periodRef.value.substring(0, 7);
        }
        changed = true;
        break;
      }

      case 'RESET_PERIOD': {
        const now = new Date();
        const fmt = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
        this.state.activePeriod.value = fmt;
        this.state.activeMonthFilter = fmt.substring(0, 7);
        changed = true;
        break;
      }

      case 'UPDATE_FILTERS': {
        const { page, filters, replace } = payload;
        const key = page === 'history' ? 'historyFilters' : 'analyticsFilters';
        // 1.0.2 (BUG-69) reconcile first. A period set here is the user's
        // choice against today's calendar, so that page is kept; any other
        // change (types, accounts, tags...) lands on the rolled period.
        this._rollLivePeriods(replace || (filters && filters.period) ? page : undefined);
        // v0.94: replace=true rebuilds from pristine defaults (same shape
        // CLEAR_ALL_FILTERS produces) before applying the partial. The wallet
        // tile deep-link means "ONLY this account" — merging onto whatever
        // period/type/tag filters were left behind broke that promise.
        let base = this.state[key];
        if (replace) {
          const fmt = (dt) => `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
          base = {
            period: { type: 'month', value: fmt(new Date()), start: '', end: '' },
            types: [],
            accounts: [],
            categories: [],
            tags: [],
            sortOrder: page === 'history' ? 'asc' : 'desc'
          };
        }
        this.state[key] = { ...base, ...filters };
        // 1.0.2 (BUG-29): never keep an account id that names no account. A
        // stale #transactions?account=<deleted> entry (web Back/Forward,
        // reload, bookmark; Router.handleRouteChange) or another tab's filter
        // sheet re-applied it, and History showed a raw-id chip and no rows.
        // An emptied list means unfiltered.
        if (Array.isArray(this.state[key].accounts)) {
          const known = new Set(this.state.accounts.map(a => a.id));
          this.state[key].accounts = this.state[key].accounts.filter(id => known.has(id));
        }
        // Persist history sort order preference
        if (page === 'history' && filters.sortOrder !== undefined) {
          window.StackdDB.save('historyFilterSortOrder', this.state.historyFilters.sortOrder);
        }
        changed = true;
        break;
      }

      case 'CLEAR_ALL_FILTERS': {
        const page = payload && payload.page ? payload.page : 'analytics';
        const key = page === 'history' ? 'historyFilters' : 'analyticsFilters';
        this._rollLivePeriods(page); // 1.0.2 (BUG-69) this page resets to today; the other reconciles
        const fmt = (dt) => `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
        // History defaults to Oldest First; analytics stays Newest First
        const defaultSort = page === 'history' ? 'asc' : 'desc';
        this.state[key] = {
          period: { type: 'month', value: fmt(new Date()), start: '', end: '' },
          types: [],
          accounts: [],
          categories: [],
          tags: [],
          sortOrder: defaultSort
        };
        if (page === 'history') {
          window.StackdDB.save('historyFilterSortOrder', defaultSort);
        }
        changed = true;
        break;
      }

      case 'SET_MONTH_FILTER':
        // Expected payload format: 'YYYY-MM'
        this.state.activeMonthFilter = payload;
        // Also sync the period value if we are in month mode
        if (this.state.activePeriod.type === 'month') {
          this.state.activePeriod.value = payload + '-01';
        }
        changed = true;
        break;

      case 'SET_HISTORY_SORT_ORDER': {
        this.state.historySortOrder = payload;
        window.StackdDB.save('historySortOrder', this.state.historySortOrder);
        this.emit();
        break;
      }

      case 'SET_DEFAULT_ACCOUNT': {
        // 1.0.2 (BUG-34): a default names a live account ('' clears) — never
        // an id a rolled-back ADD_ACCOUNT left behind (account form read-back)
        if (payload && !this.state.accounts.some(a => a.id === payload)) break;
        this.state.defaultAccountId = payload;
        window.StackdDB.save('defaultAccountId', this.state.defaultAccountId);
        this.emit();
        break;
      }


    }

    // 1.0.2 (BUG-69, integrated review): ANY action taken on History/Analytics
    // re-renders it (selection mode, balance mode, a paid toggle, a swipe
    // delete...), so it reconciles first -- otherwise yesterday's period comes
    // back after midnight labelled "October 2026". The actions above that
    // reconcile themselves already stamped _liveDay, so this is a no-op for
    // them (their keepPage semantics hold).
    const livePage = this._livePageOf(this.state.activeView);
    if (livePage && this._rollLivePeriods().includes(livePage)) changed = true;

    if (changed) this.emit();
  },

  // --- Computed helpers ---



  // v0.87 P8b: single choke point for every date/number formatting locale.
  // Follows the app language (user decision 2026-08-12); guarded so unit test
  // chains that load store.js without i18n.js keep today's en-US behavior.
  getLocale() {
    return window.I18n ? window.I18n.locale() : 'en-US';
  },

  // Currency helpers
  getCurrencySymbol(currencyCode) {
    // v1.02: optional override for per-account surfaces; defaults to primary.
    const symbols = { USD: '$', EUR: '\u20ac', JPY: '\u00a5', GBP: '\u00a3', CNY: '\u00a5' };
    return symbols[currencyCode || this.state.currency] || '$';
  },

  // v0.93: Intl.NumberFormat construction is one of the most expensive routine
  // JS operations (locale-data resolution) and this runs once per rendered
  // amount — every row, wallet card and widget value. Cache per locale+digits;
  // language/currency switches produce a new key, so no invalidation needed.
  _numberFormatCache: {},
  formatCurrency(amount, currencyCode) {
    // v1.02: optional currency override (per-account surfaces). The cache key
    // stays locale|digits — the symbol is applied OUTSIDE the cached formatter
    // and the decimals rule is folded into the digits half of the key.
    const code = currencyCode || this.state.currency;
    const symbol = this.getCurrencySymbol(code);
    const isNeg = amount < 0;
    const abs = Math.abs(amount);
    // No decimal places for Yen / Renminbi
    const noDecimals = code === 'JPY' || code === 'CNY';
    const key = this.getLocale() + '|' + (noDecimals ? '0' : '2');
    let fmt = this._numberFormatCache[key];
    if (!fmt) {
      fmt = this._numberFormatCache[key] = noDecimals
        ? new Intl.NumberFormat(this.getLocale(), { maximumFractionDigits: 0 })
        : new Intl.NumberFormat(this.getLocale(), { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }
    return `${isNeg ? '-' : ''}${symbol}${fmt.format(abs)}`;
  },

  // 1.0.2 (BUG-50): the one reader for a typed or pasted money amount. The
  // transaction and budget fields are text inputs: a type=number input kept one
  // separator of '1,234.56' and the form saved 1.23456. Returns a Number
  // rounded to cents, null when empty, NaN when the text can't be read without
  // guessing (both separators: the last one is decimal; a lone separator + 3
  // digits is grouping only when it's the UI locale's grouping char; a space
  // or apostrophe groups in threes and is never the decimal; >2 decimals ->
  // NaN). A Number is rounded to cents as is. A leading '-' is kept, so
  // callers can refuse it.
  _amountSepCache: {},
  _numberSeparators() {
    const loc = this.getLocale();
    let s = this._amountSepCache[loc];
    if (!s) {
      s = { group: ',', decimal: '.' };
      try {
        new Intl.NumberFormat(loc).formatToParts(12345.6).forEach(p => {
          if (p.type === 'group') s.group = p.value;
          if (p.type === 'decimal') s.decimal = p.value;
        });
      } catch (e) { /* very old WebView: en separators */ }
      this._amountSepCache[loc] = s;
    }
    return s;
  },
  parseAmount(raw) {
    // A Number is already a value: round it to cents. Through String() it would
    // be re-read with the UI separators (it/es: 1.234 -> '1.234' -> 1234).
    if (typeof raw === 'number') return Number.isFinite(raw) ? Math.round(raw * 100) / 100 : NaN;
    let s = String(raw == null ? '' : raw).trim();
    if (!s) return null;
    // Spaces next to a currency sign or the minus are free ('€ 12,50', '- 5').
    s = s.replace(/^[€$£¥]\s*|\s*[€$£¥]$/g, '');
    let neg = false;
    const minus = /^[-−]\s*/.exec(s);
    if (minus) { neg = true; s = s.slice(minus[0].length); }
    if (!/^[0-9.,\s'’]*[0-9][0-9.,\s'’]*$/.test(s)) return NaN;
    // A run of spaces (any flavour, incl. NBSP / U+202F) or apostrophes
    // inside the number is ONE grouping mark, checked in threes
    // like '.' and ',' — '1 234,56' and "1'234.50" read, '12 50' / "12'5" are
    // NaN instead of a silent 1250 / 125. A space is never the decimal point.
    s = s.replace(/[\s'’]+/g, ' ');
    // '1,234,567' with sep ',' -> true; first group 1-3 digits, no leading 0
    const grouped = (str, sep) => {
      const g = str.split(sep);
      return g.length > 1 && /^[1-9][0-9]{0,2}$/.test(g[0]) && g.slice(1).every(x => /^[0-9]{3}$/.test(x));
    };
    const seps = ['.', ',', ' '].filter(c => s.indexOf(c) !== -1);
    let int = s, frac = '';
    if (seps.length > 2) return NaN;
    if (seps.length === 2) {
      // the separator appearing LAST is the decimal; the other groups the integer part
      const dec = s.lastIndexOf(seps[0]) > s.lastIndexOf(seps[1]) ? seps[0] : seps[1];
      const grp = dec === seps[0] ? seps[1] : seps[0];
      if (dec === ' ') return NaN;
      const i = s.lastIndexOf(dec);
      int = s.slice(0, i); frac = s.slice(i + 1);
      if (!grouped(int, grp)) return NaN;
      int = int.split(grp).join('');
    } else if (seps.length === 1) {
      const sep = seps[0];
      const parts = s.split(sep);
      if (sep === ' ' || parts.length > 2) { if (!grouped(s, sep)) return NaN; int = parts.join(''); }
      else if (parts[1].length <= 2) { int = parts[0]; frac = parts[1]; }
      else if (parts[1].length === 3 && sep === this._numberSeparators().group && grouped(s, sep)) int = parts.join('');
      else return NaN;
    }
    if (frac.length > 2) return NaN;
    const n = Number((int || '0') + (frac ? '.' + frac : ''));
    if (!isFinite(n)) return NaN;
    const r = Math.round(n * 100) / 100;
    return neg ? -r : r;
  },
  // The locale's 2-decimal format of 1234.56, for the form.amountInvalid
  // {example} text ('1,234.56' en, '1 234,56' fr, '1234,56' it/es/pt-PT).
  amountExample() {
    return new Intl.NumberFormat(this.getLocale(), { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(1234.56);
  },

  // 1.0.1 (BUG-09): locale-aware percentage — the single choke point for every
  // displayed percent. `pct` is in percent units (59.9 → '59.9%' / '59,9 %').
  // opts: { digits = min fraction digits (default 0), maxDigits (default =
  // digits), signed = prefix '+' on a positive value }. Like formatCurrency the
  // sign is applied OUTSIDE the cached formatter with an ASCII '-' (no
  // signDisplay dependency on old WebViews), and it is decided from the
  // FORMATTED string so a value that rounds to zero never reads '-0.0%'.
  // null / undefined / non-finite → '—' (no basis). Never feed the result into
  // a CSS `width:` — a comma decimal breaks the style.
  _percentFormatCache: {},
  formatPercent(pct, opts) {
    if (pct === null || pct === undefined || typeof pct !== 'number' || !isFinite(pct)) return '—';
    const o = opts || {};
    const min = o.digits || 0;
    const max = o.maxDigits != null ? Math.max(o.maxDigits, min) : min;
    const locale = this.getLocale();
    const key = locale + '|' + min + '|' + max;
    let fmt = this._percentFormatCache[key];
    if (!fmt) {
      fmt = this._percentFormatCache[key] = new Intl.NumberFormat(locale, {
        style: 'percent', minimumFractionDigits: min, maximumFractionDigits: max
      });
    }
    const s = fmt.format(Math.abs(pct) / 100);
    const isZero = !/[1-9]/.test(s);
    const sign = isZero ? '' : (pct < 0 ? '-' : (o.signed ? '+' : ''));
    return sign + s;
  },

  _isPositiveTx(tx) {
    return tx.type === 'income' || tx.type === 'opening_balance' || tx.type === 'transfer_in';
  },

  getAccountOpeningDate(accountId) {
    if (!accountId) return null;
    // v0.93: memoized. This was a full-array .find called from per-transaction
    // filter predicates (getFilteredTransactions, computeNetFlowData,
    // getBalanceAtDate) — O(T²) on every balance/filter path, and the
    // opening_balance rows sit at the END of the desc-sorted array. The index
    // is dropped at every dispatch/_sortData and rebuilt lazily in one pass.
    let idx = this._openingIdx;
    if (!idx) {
      idx = this._openingIdx = Object.create(null);
      for (const t of this.state.transactions) {
        if (t.type === 'opening_balance' && t.accountId && idx[t.accountId] === undefined) {
          idx[t.accountId] = t.date;
        }
      }
    }
    const date = idx[accountId];
    return date === undefined ? null : date;
  },

  _isTxBeforeOpeningDate(tx) {
    if (!tx || !tx.accountId || tx.type === 'opening_balance') return false;
    const obDate = this.getAccountOpeningDate(tx.accountId);
    if (!obDate) return false;
    return tx.date < obDate;
  },

  // v0.99: bank-import dedup index — every non-empty importKey in one Set.
  // Same lifecycle as _openingIdx/_budgetSpendIdx: dropped on every
  // dispatch/_sortData, rebuilt lazily in one O(T) pass.
  _ensureImportKeyIdx() {
    let idx = this._importKeyIdx;
    if (!idx) {
      idx = this._importKeyIdx = new Set();
      for (const t of this.state.transactions) {
        if (t.importKey) idx.add(t.importKey);
      }
    }
    return idx;
  },

  hasImportKey(key) {
    return this._ensureImportKeyIdx().has(key);
  },

  // 1.0.2 (BUG-32): statement keys embed the account they were imported into
  // ('ref:<accountId>|…' / 'fp:<accountId>|…', import.js _stampImportKey).
  // Swap that segment; any other key is returned unchanged.
  rebaseImportKey(key, accountId) {
    const m = /^(ref|fp):[^|]*\|/.exec(String(key || ''));
    return m ? m[1] + ':' + accountId + key.slice(m[0].length - 1) : key;
  },

  // 1.0.2 (BUG-32): a restore before 1.0.2 gave every account a new id but
  // kept the old keys, so the same statement imported again matched nothing
  // and was added twice. Only a key naming NO account of this install is
  // re-pointed to its row's (live) account — a row the user moved keeps its
  // key (D7). Idempotent; saves only when it changed something.
  _healRestoredImportKeys() {
    const live = new Set(this.state.accounts.map(a => a.id));
    let healed = false;
    this.state.transactions.forEach(t => {
      if (!t.importKey || !live.has(t.accountId)) return;
      const m = /^(?:ref|fp):([^|]*)\|/.exec(t.importKey);
      if (!m || live.has(m[1])) return;
      t.importKey = this.rebaseImportKey(t.importKey, t.accountId);
      healed = true;
    });
    if (healed) {
      this._importKeyIdx = null;
      window.StackdDB.save('transactions', this.state.transactions);
    }
  },

  // 1.0.2 (R1, BUG-33 follow-up): camt imports before 1.0.2 stored line
  // breaks that the one-line note field drops on save (the words merged).
  // Flatten them once — the same rule StackdImport._oneLine applies to every
  // import since 1.0.2. Keys are unaffected (stored values; fp normDesc
  // already collapses whitespace). Idempotent; saves only when it changed.
  _healMultilineNotes() {
    let healed = false;
    this.state.transactions.forEach(t => {
      if (typeof t.comment === 'string' && /[\r\n]/.test(t.comment)) {
        t.comment = t.comment.replace(/[ \t]*[\r\n]+[ \t]*/g, ' ').trim();
        healed = true;
      }
    });
    if (healed) window.StackdDB.save('transactions', this.state.transactions);
  },

  // ── v1.02 per-account currency (docs/bank-import-plan.md §6) ──────────────
  // Aggregates operate on PRIMARY-currency accounts only — exclude, never
  // convert. "Primary" = account.currency equals state.currency (a missing
  // field counts as primary for safety). Memoized with the standard lazy-index
  // lifecycle: nulled at the top of dispatch and in _sortData, so account
  // edits AND a SET_CURRENCY reclassification both invalidate it.
  getAccountCurrency(accountId) {
    const acc = this.state.accounts.find(a => a.id === accountId);
    return (acc && acc.currency) || this.state.currency;
  },

  // The memo indexes FOREIGN ids (not primary ones) so an unknown accountId —
  // a dangling transaction after odd deletions, or fixture data — counts as
  // primary and never silently vanishes from totals it was always part of.
  _ensureForeignIdx() {
    let idx = this._primaryIdx;
    if (!idx) {
      idx = this._primaryIdx = new Set();
      for (const a of this.state.accounts) {
        if (a.currency && a.currency !== this.state.currency) idx.add(a.id);
      }
    }
    return idx;
  },

  _isPrimaryAccount(accountId) {
    return !this._ensureForeignIdx().has(accountId);
  },

  primaryAccountIds() {
    const idx = this._ensureForeignIdx();
    return this.state.accounts.filter(a => !idx.has(a.id)).map(a => a.id);
  },

  foreignAccountCount() {
    return this._ensureForeignIdx().size;
  },

  // 1.0.2 (BUG-35): each transfer leg is stored in its OWN currency and nothing
  // is ever converted. Unknown ids count as base (same rule as _ensureForeignIdx).
  _sameCurrency(a, b) {
    return this.getAccountCurrency(a) === this.getAccountCurrency(b);
  },

  // 1.0.2 (BUG-35): the amount that arrived on a cross-currency transfer's
  // income leg — a finite value above 0, else undefined (= not supplied).
  _receivedAmount(payload) {
    const r = Number(payload && payload.receivedAmount);
    return Number.isFinite(r) && r > 0 ? r : undefined;
  },

  // 1.0.2 (BUG-36): exclude, never convert, for an EXPLICIT selection too. v1.02
  // guarded only [], so Main (EUR) + US Checking (USD) summed € and $ 1:1.
  //   []                   → [] (= every base-currency account, unchanged)
  //   one currency         → as given (a single foreign account's own figures)
  //   mixed, base included → the base-currency accounts
  //   mixed, no base       → the largest same-currency group (tie: account order)
  //                          [D-U8-6(a), with the BUG-63 rider formatting it in
  //                          that currency]
  // Unknown ids do not vote. excluded → common.otherCurrencyExcluded; currency →
  // formatCurrency's 2nd arg. Filter with aggregatePredicate; never feed .ids
  // back into an aggregate ([] there means every base account).
  aggregateSelection(accountIds) {
    const base = this.state.currency;
    const ids = Array.isArray(accountIds) ? accountIds : [];
    if (ids.length === 0) return { ids, currency: base, excluded: this.foreignAccountCount() };
    const picked = new Set(ids);
    const groups = new Map(); // currency → ids, in account order
    let known = 0;
    this.state.accounts.forEach(a => {
      if (!picked.has(a.id)) return;
      known++;
      const c = a.currency || base;
      if (!groups.has(c)) groups.set(c, []);
      groups.get(c).push(a.id);
    });
    if (groups.size <= 1) {
      return { ids, currency: groups.size ? [...groups.keys()][0] : base, excluded: 0 };
    }
    let currency = base;
    if (!groups.has(base)) {
      let best = 0;
      groups.forEach((g, c) => { if (g.length > best) { best = g.length; currency = c; } });
    }
    const kept = groups.get(currency);
    return { ids: kept, currency, excluded: known - kept.length };
  },

  // 1.0.2 (BUG-36): `accountId → bool` for an aggregate over `accountIds`.
  // [] → the base-currency accounts; a single id → that id (the per-account fast
  // path: tiles, forecast baselines, per-account chart lines); otherwise the
  // ids aggregateSelection keeps.
  aggregatePredicate(accountIds) {
    const ids = Array.isArray(accountIds) ? accountIds : [];
    if (ids.length === 0) return (id) => this._isPrimaryAccount(id);
    if (ids.length === 1) { const only = ids[0]; return (id) => id === only; }
    const keep = new Set(this.aggregateSelection(ids).ids);
    return (id) => keep.has(id);
  },

  // 1.0.2 (BUG-36): true when `ids` is exactly the base-currency accounts — what
  // Home and the expanded graph expand [] to — so it reads (and saves) as the
  // default view.
  isPrimarySelection(ids) {
    const prim = this.primaryAccountIds();
    if (!Array.isArray(ids) || !prim.length || ids.length !== prim.length) return false;
    const picked = new Set(ids);
    return prim.every(id => picked.has(id));
  },

  // 1.0.1 (BUG-01): what switching the base currency to `code` would do —
  // read-only, drives Components.CurrencySwitchConfirm. A missing account
  // currency counts as the current base (same rule as _ensureForeignIdx).
  //   total        — every account
  //   relabelable  — accounts SET_CURRENCY {relabel:true} would move (old base)
  //   excluded     — accounts left out of totals after a plain switch
  //   primaryAfter — accounts already in `code`
  currencySwitchImpact(code) {
    const prev = this.state.currency;
    const accs = this.state.accounts || [];
    const cur = a => a.currency || prev;
    return {
      total: accs.length,
      relabelable: code === prev ? 0 : accs.filter(a => cur(a) === prev).length,
      excluded: accs.filter(a => cur(a) !== code).length,
      primaryAfter: accs.filter(a => cur(a) === code).length
    };
  },

  // v1.01: first matching import rule wins (rules are newest-first). A rule
  // whose category was deleted is skipped, not surfaced as a broken id.
  // Unindexed on purpose: ≤100 rules × includes() is cheap even for a
  // 1000-row statement.
  matchImportRule(description) {
    // 1.0.2 (BUG-33): both sides whitespace-collapsed, so a rule stored from a
    // legacy multi-line note ('supermercato\nrossi') still matches the one-line
    // notes every import writes now. No stored rule needs rewriting.
    const desc = String(description || '').toLowerCase().replace(/\s+/g, ' ');
    if (!desc) return '';
    for (const r of (this.state.importRules || [])) {
      const m = r.match ? String(r.match).replace(/\s+/g, ' ') : '';
      if (m && desc.indexOf(m) !== -1 &&
          this.state.categories.some(c => c.id === r.categoryId)) {
        return r.categoryId;
      }
    }
    return '';
  },

  getAccountBalance(accountId) {
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    return this.getBalanceAtDate(today, [accountId]);
  },

  getGlobalBalance() {
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    return this.getBalanceAtDate(today);
  },

  getBalanceAtDate(date, accountIds = [], categoryIds = []) {
    // 1.0.2 (BUG-36): an explicit list that mixes currencies keeps only the
    // accounts aggregateSelection resolves (v1.02 guarded only []).
    const inScope = this.aggregatePredicate(accountIds);
    // v0.93: cheap string/array checks first, memoized opening-date check last.
    return this.state.transactions
      .filter(t => t.date <= date &&
        t.isPaid !== false &&
        // v1.02: an empty list means "all PRIMARY-currency accounts" — foreign
        // accounts never leak into aggregate balances (a single foreign
        // account's own balance still computes over its rows).
        inScope(t.accountId) &&
        (categoryIds.length === 0 || !t.categoryId || categoryIds.includes(t.categoryId)) &&
        !this._isTxBeforeOpeningDate(t)
      )
      .reduce((sum, tx) => this._isPositiveTx(tx) ? sum + tx.amount : sum - tx.amount, 0);
  },

  // v0.64 - Future-dated transactions (after today, up to endDate) that are already
  // counted by getBalanceAtDate(endDate). Lets Analytics caveat projected balances.
  computeUpcomingImpact(endDate, accountIds = []) {
    const now = new Date();
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const inScope = this.aggregatePredicate(accountIds); // 1.0.2 (BUG-36)
    const upcoming = this.state.transactions.filter(t =>
      t.date > todayStr && t.date <= endDate &&
      t.isPaid !== false &&
      // v1.02: empty list = all primary-currency accounts
      inScope(t.accountId) &&
      !this._isTxBeforeOpeningDate(t)
    );
    return {
      count: upcoming.length,
      net: upcoming.reduce((sum, tx) => this._isPositiveTx(tx) ? sum + tx.amount : sum - tx.amount, 0)
    };
  },

  computeGraphBalances({ interval = 'monthly', accountIds = [], categoryIds = [] } = {}) {
    const now = new Date();
    const fmt = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const todayStr = fmt(now);
    const accIds = accountIds || [];
    const catIds = categoryIds || [];

    if (interval === 'weekly') {
      const monthLabels = [];
      for (let m = 11; m >= 0; m--) {
        const d = new Date(now.getFullYear(), now.getMonth() - m, 1);
        monthLabels.push(d.toLocaleDateString(this.getLocale(), { month: 'short', year: '2-digit' }));
      }

      const points = [];
      for (let i = 51; i >= 0; i--) {
        const weekIdx = 51 - i;
        const x = weekIdx * (11 / 51);
        const d = new Date(now);
        d.setDate(d.getDate() - (i * 7));
        const cutoffStr = fmt(d);
        const fullLabel = d.toLocaleDateString(this.getLocale(), { month: 'short', day: 'numeric' });
        const balance = this.getBalanceAtDate(cutoffStr > todayStr ? todayStr : cutoffStr, accIds, catIds);
        points.push({ x, y: balance, label: fullLabel, fullLabel, balance });
      }
      return { monthLabels, points };
    } else if (interval === 'quarter') {
      const currentYear = now.getFullYear();
      const currentQuarter = Math.floor(now.getMonth() / 3);
      const quarterLabels = [];
      const points = [];

      for (let i = 3; i >= 0; i--) {
        let qIdx = currentQuarter - i;
        let yr = currentYear;
        while (qIdx < 0) {
          qIdx += 4;
          yr -= 1;
        }
        const endMonth = (qIdx + 1) * 3;
        const lastDay = new Date(yr, endMonth, 0);
        let cutoffStr = fmt(lastDay);
        if (cutoffStr > todayStr) cutoffStr = todayStr;
        const label = `Q${qIdx + 1} '${String(yr).slice(-2)}`;
        quarterLabels.push(label);
        const x = 3 - i;
        const balance = this.getBalanceAtDate(cutoffStr, accIds, catIds);
        points.push({ x, y: balance, label, fullLabel: label, balance });
      }
      return { monthLabels: quarterLabels, points };
    } else { // 'monthly'
      const monthLabels = [];
      const months = [];
      for (let i = 11; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const lbl = d.toLocaleDateString(this.getLocale(), { month: 'short', year: '2-digit' });
        monthLabels.push(lbl);
        months.push({
          year: d.getFullYear(),
          month: d.getMonth(),
          label: lbl
        });
      }

      const points = months.map((m, idx) => {
        const cutoff = new Date(m.year, m.month + 1, 0);
        let cutoffStr = fmt(cutoff);
        if (cutoffStr > todayStr) cutoffStr = todayStr;
        const balance = this.getBalanceAtDate(cutoffStr, accIds, catIds);
        return { x: idx, y: balance, label: m.label, fullLabel: m.label, balance };
      });
      return { monthLabels, points };
    }
  },

  computeBalanceForecast(accountIds = []) {
    const now = new Date();
    const fmt = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

    // Shared baseline: balance as of last day of previous month (= start of current month)
    const startOfMonthBaseline = fmt(new Date(now.getFullYear(), now.getMonth(), 0));

    // As of today
    const today = fmt(now);

    // As of EOM: last day of current month (includes actual + scheduled future recurring transactions already generated)
    const eom = fmt(new Date(now.getFullYear(), now.getMonth() + 1, 0));

    // v1.02 ([] = primary accounts); 1.0.2 (BUG-36): a mixed explicit list too
    const inScope = this.aggregatePredicate(accountIds);
    const targetAccounts = this.state.accounts.filter(a => inScope(a.id));

    // Calculate effective start-of-month baseline balance for a cutoff date (today or eom).
    // For accounts opened on or before startOfMonthBaseline: use historical balance at startOfMonthBaseline.
    // For accounts whose opening date is after startOfMonthBaseline:
    // - If opening date <= cutoff, include initial opening balance amount (since it was opened during current month).
    // - If opening date > cutoff, account has not opened yet, so baseline contribution is 0.
    const computeBaselineForCutoff = (cutoffDate) => {
      return targetAccounts.reduce((sum, acc) => {
        const obDate = this.getAccountOpeningDate(acc.id);
        if (!obDate || obDate <= startOfMonthBaseline) {
          return sum + this.getBalanceAtDate(startOfMonthBaseline, [acc.id]);
        } else if (obDate <= cutoffDate) {
          const obTx = this.state.transactions.find(
            t => t.accountId === acc.id && t.type === 'opening_balance'
          );
          return sum + (obTx && obTx.isPaid !== false ? obTx.amount : 0);
        }
        return sum;
      }, 0);
    };

    const balanceBaselineToday = computeBaselineForCutoff(today);
    const balanceBaselineEOM   = computeBaselineForCutoff(eom);

    const balanceToday       = this.getBalanceAtDate(today, accountIds);
    const balanceEOM         = this.getBalanceAtDate(eom, accountIds);

    // Returns null when baseline is 0 (new user with no prior history) to avoid misleading numbers
    const calculatePct = (curr, prev) => {
      if (prev === 0) return null;
      return ((curr - prev) / Math.abs(prev)) * 100;
    };

    return {
      todayAbsDiff: balanceToday - balanceBaselineToday,
      eomAbsDiff:   balanceEOM - balanceBaselineEOM,
      todayVariation: calculatePct(balanceToday, balanceBaselineToday),
      eomVariation:   calculatePct(balanceEOM,   balanceBaselineEOM)
    };
  },

  compute12MonthBalances(accountIds = null) {
    const now = new Date();
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const months = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push({
        year: d.getFullYear(),
        month: d.getMonth(),
        label: d.toLocaleDateString(this.getLocale(), { month: 'short', year: '2-digit' })
      });
    }
    return months.map(m => {
      // Last day of the requested month
      const cutoff = new Date(m.year, m.month + 1, 0);
      let cutoffStr = `${cutoff.getFullYear()}-${String(cutoff.getMonth() + 1).padStart(2, '0')}-${String(cutoff.getDate()).padStart(2, '0')}`;
      
      if (cutoffStr > todayStr) cutoffStr = todayStr;

      const balance = this.getBalanceAtDate(cutoffStr, accountIds || []);
      return { label: m.label, balance };
    });
  },

  computeAccount12MonthBalances(accountId) {
    return this.compute12MonthBalances([accountId]);
  },

  getAvailableMonths() {
    const monthsSet = new Set();
    this.state.transactions.forEach(tx => {
      // tx.date is 'YYYY-MM-DD', so extract 'YYYY-MM'
      monthsSet.add(tx.date.substring(0, 7));
    });
    // If no transactions, add current month
    if (monthsSet.size === 0) {
      const today = new Date();
      monthsSet.add(`${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`);
    }
    
    // Sort descending (newest first)
    const sortedVals = Array.from(monthsSet).sort().reverse();
    
    return sortedVals.map(val => {
      const [year, month] = val.split('-');
      const d = new Date(parseInt(year), parseInt(month) - 1, 1);
      return {
        value: val, // 'YYYY-MM'
        label: d.toLocaleDateString(this.getLocale(), { month: 'long', year: 'numeric' }) // 'March 2026'
      };
    });
  },

  // v0.93: one-pass category×month spend index. getBudgetForMonth used to
  // rescan the whole transactions array once per month of its cumulative loop
  // (a two-year-old budget = 24 full scans, per budget row, per render).
  // Same lifecycle as _openingIdx: dropped on every dispatch/_sortData,
  // rebuilt lazily in one pass.
  // 1.0.2 (BUG-55): same row rules as every other aggregate — unpaid rows,
  // transfer legs and rows dated before their account opened are not spend
  // (they inflated Goals, the Home budgets widget and every later rollover).
  _categoryMonthSpend(categoryId, yearMonth) {
    let idx = this._budgetSpendIdx;
    if (!idx) {
      idx = this._budgetSpendIdx = Object.create(null);
      for (const t of this.state.transactions) {
        if (t.type !== 'expense' || !t.categoryId) continue;
        if (t.isPaid === false || t.transferRef) continue;  // 1.0.2 (BUG-55)
        if (!this._isPrimaryAccount(t.accountId)) continue; // v1.02: budgets are primary-currency
        if (this._isTxBeforeOpeningDate(t)) continue;       // 1.0.2 (BUG-55), memoized
        const key = t.categoryId + '|' + t.date.slice(0, 7);
        idx[key] = (idx[key] || 0) + t.amount;
      }
    }
    return idx[categoryId + '|' + yearMonth] || 0;
  },

  getBudgetForMonth(categoryId, yearMonth) {
    // yearMonth is format "YYYY-MM"
    const budget = this.state.budgets.find(b => b.categoryId === categoryId);
    if (!budget) return { allocated: 0, spent: 0, carryover: 0, finalLimit: 0 };

    // Check if within date bounds
    if (budget.startDate && yearMonth < budget.startDate) return { allocated: 0, spent: 0, carryover: 0, finalLimit: 0 };
    if (budget.endDate && yearMonth > budget.endDate) return { allocated: 0, spent: 0, carryover: 0, finalLimit: 0 };

    const baseAmount = parseFloat(budget.amount) || 0;

    // Calculate spent in this current yearMonth
    const spentThisMonth = this._categoryMonthSpend(categoryId, yearMonth);

    let carryOver = 0;

    if (budget.isCumulative && budget.startDate) {
      // Iterate from startDate up to yearMonth - 1
      let iterDate = new Date(`${budget.startDate}-01T00:00:00`);
      const endDateTarget = new Date(`${yearMonth}-01T00:00:00`);

      while (iterDate < endDateTarget) {
        const lookupMonth = `${iterDate.getFullYear()}-${String(iterDate.getMonth() + 1).padStart(2, '0')}`;
        const spentPast = this._categoryMonthSpend(categoryId, lookupMonth);

        const remainder = baseAmount - spentPast;
        // cumulative logic normally adds up left-over, but can go negative if overspent
        carryOver += remainder;

        // advance 1 month
        iterDate.setMonth(iterDate.getMonth() + 1);
      }
    }

    const finalLimit = baseAmount + carryOver;
    return {
      allocated: baseAmount,
      spent: spentThisMonth,
      carryover: carryOver,
      finalLimit: finalLimit
    };
  },

  // v0.95 (refactor-plan-2 P3.2): average monthly spend for one category over
  // the trailing `months` WHOLE calendar months (current month excluded — it
  // is partial and would drag the average down). Feeds the budget form's
  // insight line. Same row rules as getBudgetForMonth's spent figure since
  // 1.0.2 (BUG-55): no unpaid rows ("you spent" must not count scheduled
  // bills), no transfer legs, nothing dated before the account opened, and
  // no account in another currency (v1.02: exclude, never convert). Averages
  // over the months that actually had spend (matches the copy "on average you
  // spent X/month"); returns null when there is nothing meaningful to show.
  getCategoryMonthlyAverage(categoryId, months = 6) {
    if (!categoryId || categoryId === 'cat_balance') return null;
    const now = new Date();
    const keys = [];
    for (let i = months; i >= 1; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      keys.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    }
    const totals = {};
    keys.forEach(k => { totals[k] = 0; });
    for (const tx of this.state.transactions) {
      if (tx.type !== 'expense') continue;           // excludes income + opening_balance
      if (tx.categoryId !== categoryId) continue;    // transfer legs carry '' → excluded
      if (tx.transferRef) continue;                  // defensive — never count transfers
      if (tx.isPaid === false) continue;             // lean flag: absent means paid
      const k = tx.date.slice(0, 7);
      if (!(k in totals)) continue;
      if (!this._isPrimaryAccount(tx.accountId)) continue; // 1.0.2 (BUG-55): as _categoryMonthSpend
      if (this._isTxBeforeOpeningDate(tx)) continue; // memoized (v0.93), cheap
      totals[k] += tx.amount;
    }
    const active = keys.filter(k => totals[k] > 0);
    if (active.length > 0) {
      const sum = active.reduce((s, k) => s + totals[k], 0);
      return { average: sum / active.length, months: active.length };
    }

    // v0.96: young-dataset fallback. A brand-new user has ALL their data in
    // the current (deliberately excluded) month and used to get no insight at
    // all. Fall back to this month's spend SO FAR (past-dated, paid rows
    // only — never materialised future occurrences), flagged so the view
    // picks the "so far this month" wording instead of an average.
    const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const todayStr = `${ym}-${String(now.getDate()).padStart(2, '0')}`;
    let mtd = 0;
    for (const tx of this.state.transactions) {
      if (tx.type !== 'expense') continue;
      if (tx.categoryId !== categoryId) continue;
      if (tx.transferRef) continue;
      if (tx.isPaid === false) continue;
      if (tx.date.slice(0, 7) !== ym || tx.date > todayStr) continue;
      if (!this._isPrimaryAccount(tx.accountId)) continue; // 1.0.2 (BUG-55): as _categoryMonthSpend
      if (this._isTxBeforeOpeningDate(tx)) continue;
      mtd += tx.amount;
    }
    if (mtd <= 0) return null;
    return { average: mtd, months: 0, currentMonth: true };
  },

  /**
   * 1.0.1 (BUG-02): restore fallback for loans files written before the
   * LinkedSeriesId column. Such a loan arrives with no link at all and is
   * flagged `needsNoteRelink` by the import (so is a re-imported loan whose
   * link another loan already owned — import.js _releaseOwnedLoanLinks). Only
   * flagged loans are considered: a loan the user left untracked must never
   * be linked by a later transactions import. A flagged loan is matched to the recurring expense series whose note is its payment note
   * ('debt.paymentNote') in ANY loaded language — the note is written in the
   * language active when tracking started. Category and amount are not used:
   * the user may have changed them. Only loans with NO link are touched: a
   * dangling link (new-format file imported before its transactions, or a
   * series the user deleted to un-track) is left alone, and a series that any
   * loan already names (live or dangling) is never taken. Several matches
   * (an already double-tracked restore) → earliest first member, then id.
   * Mutates this.state.loans; the caller persists.
   *
   * @returns {boolean} true when at least one loan was linked
   */
  _relinkLoanSeries() {
    const loans = this.state.loans || [];
    const pending = loans.filter(l => l.kind !== 'sim' && !l.linkedSeriesId && l.needsNoteRelink);
    if (!pending.length) return false;

    const owned = new Set();
    loans.forEach(l => { if (l.linkedSeriesId) owned.add(l.linkedSeriesId); });

    const norm = (s) => String(s || '').trim().toLowerCase();
    const byNote = new Map();   // note -> Set(seriesId)
    const firstDate = new Map(); // seriesId -> earliest member date
    for (const t of this.state.transactions) {
      if (t.type !== 'expense' || !t.recurrence || !t.recurrence.seriesId) continue;
      const sid = t.recurrence.seriesId;
      if (owned.has(sid)) continue;
      const note = norm(t.comment);
      if (!note) continue;
      if (!byNote.has(note)) byNote.set(note, new Set());
      byNote.get(note).add(sid);
      const d = t.date || '';
      if (!firstDate.has(sid) || d < firstDate.get(sid)) firstDate.set(sid, d);
    }
    if (!byNote.size) return false;

    const dicts = (window.I18n && window.I18n.dicts) || {};
    const templates = Object.keys(dicts)
      .map(lang => dicts[lang] && dicts[lang]['debt.paymentNote'])
      .filter(tpl => typeof tpl === 'string' && tpl.indexOf('{name}') !== -1);
    if (!templates.length) return false;

    let linkedAny = false;
    pending.forEach(loan => {
      const name = String(loan.name || '');
      const notes = new Set(templates.map(tpl => norm(tpl.replace(/\{name\}/g, () => name))));
      const candidates = [];
      notes.forEach(n => {
        (byNote.get(n) || []).forEach(sid => {
          if (!owned.has(sid) && candidates.indexOf(sid) === -1) candidates.push(sid);
        });
      });
      if (!candidates.length) return;
      candidates.sort((a, b) => {
        const da = firstDate.get(a) || '';
        const db = firstDate.get(b) || '';
        if (da !== db) return da < db ? -1 : 1;
        return a < b ? -1 : (a > b ? 1 : 0);
      });
      loan.linkedSeriesId = candidates[0];
      delete loan.needsNoteRelink;
      loan.updatedAt = new Date().toISOString();
      owned.add(candidates[0]);
      linkedAny = true;
    });
    return linkedAny;
  },

  getAllUniqueTags(querySubstring = '') {
    const tagsSet = new Set();
    this.state.transactions.forEach(tx => {
      if (Array.isArray(tx.tags)) {
        tx.tags.forEach(tag => tagsSet.add(tag));
      }
    });
    
    let allTags = Array.from(tagsSet);
    if (querySubstring) {
      const q = querySubstring.toLowerCase();
      allTags = allTags.filter(tag => tag.includes(q));
    }
    return allTags.sort();
  },

  getAllUniqueNotes(querySubstring = '') {
    const notesSet = new Set();
    this.state.transactions.forEach(tx => {
      // Historical notes could be in .comment or .note
      const note = tx.comment || tx.note;
      if (note && note.trim()) {
        notesSet.add(note.trim());
      }
    });
    
    let allNotes = Array.from(notesSet);
    if (querySubstring) {
      const q = querySubstring.toLowerCase();
      allNotes = allNotes.filter(note => note.toLowerCase().includes(q));
    }
    return allNotes.sort();
  },

  // v0.64 - clampEnd (YYYY-MM-DD) caps every bucket at that date so "as of today" mode
  // excludes future-dated transactions from the current bucket.
  computeNetFlowData(filters, clampEnd = null) {
    const { period, accounts, categories } = filters;
    const { type, value } = period;
    
    // Ignore Custom Range
    if (type === 'custom') return null;

    const anchorDt = new Date(value + 'T00:00:00');
    const buckets = []; // { label, start, end }

    if (type === 'today') {
      // Sliding 7-day window ending at anchorDt
      for (let i = 6; i >= 0; i--) {
        const d = new Date(anchorDt);
        d.setDate(anchorDt.getDate() - i);
        const dStr = this._localYMD(d); // 1.0.2 (BUG-28) local day, not the UTC day
        buckets.push({
          label: d.toLocaleDateString(this.getLocale(), { weekday: 'short', day: 'numeric' }),
          start: dStr,
          end: dStr
        });
      }
    } else if (type === 'week') {
      // Sliding 5-week window ending at the week containing anchorDt
      // Find the Sunday of the week containing anchorDt
      const anchor = new Date(anchorDt);
      const day = anchor.getDay();
      const endSunday = new Date(anchor.setDate(anchor.getDate() + (day === 0 ? 0 : 7 - day)));
      
      for (let i = 4; i >= 0; i--) {
        const start = new Date(endSunday);
        start.setDate(endSunday.getDate() - (i * 7) - 6);
        const end = new Date(endSunday);
        end.setDate(endSunday.getDate() - (i * 7));
        
        const fmt = (dt) => this._localYMD(dt); // 1.0.2 (BUG-28) local day, not the UTC day
        buckets.push({
          label: start.toLocaleDateString(this.getLocale(), { month: 'short', day: 'numeric' }),
          start: fmt(start),
          end: fmt(end)
        });
      }
    } else if (type === 'month') {
      // Sliding 12-month window ending at the month containing anchorDt
      for (let i = 11; i >= 0; i--) {
        const d = new Date(anchorDt.getFullYear(), anchorDt.getMonth() - i, 1);
        const last = new Date(d.getFullYear(), d.getMonth() + 1, 0);
        const fmt = (dt) => this._localYMD(dt); // 1.0.2 (BUG-28) local day, not the UTC day
        buckets.push({
          label: d.toLocaleDateString(this.getLocale(), { month: 'short', year: '2-digit' }),
          start: fmt(d),
          end: fmt(last)
        });
      }
    } else if (type === 'year') {
      // Selected Year vs Prior Year
      const yearSelection = anchorDt.getFullYear();
      const priorYear = yearSelection - 1;
      
      buckets.push({
        label: priorYear.toString(),
        start: `${priorYear}-01-01`,
        end: `${priorYear}-12-31`
      });
      buckets.push({
        label: yearSelection.toString(),
        start: `${yearSelection}-01-01`,
        end: `${yearSelection}-12-31`
      });
    }

    // v1.02 ([] = primary accounts); 1.0.2 (BUG-36): a mixed explicit list too
    const inScope = this.aggregatePredicate(accounts);
    return buckets.map(b => {
      const bucketEnd = clampEnd && b.end > clampEnd ? clampEnd : b.end;
      const txs = this.state.transactions.filter(t => {
        // v0.93: date-range compare first (rejects the bulk of a 60-month
        // materialized dataset on a string compare), memoized opening-date last.
        if (t.date < b.start || t.date > bucketEnd) return false;
        if (t.isPaid === false) return false; // Exclude unpaid transactions
        if (t.type !== 'expense' && t.type !== 'income') return false;
        if (t.transferRef) return false; // Exclude linked transfers
        if (t.categoryId === 'cat_balance') return false; // Exclude adjustments
        if (!inScope(t.accountId)) return false;
        if (categories.length > 0 && !categories.includes(t.categoryId)) return false;
        return !this._isTxBeforeOpeningDate(t);
      });

      const income = txs
        .filter(t => this._isPositiveTx(t))
        .reduce((sum, t) => sum + t.amount, 0);
      const expense = txs
        .filter(t => t.type === 'expense')
        .reduce((sum, t) => sum + t.amount, 0);
      
      return {
        label: b.label,
        start: b.start,
        end: b.end,
        net: income - expense,
        income,
        expense
      };
    });
  },

  computeAnalyticalSummary(filters) {
    // v0.64 - actually honor the passed filters (previously always read state.analyticsFilters,
    // which made previous-period comparisons compare the period to itself)
    const txs = this.getFilteredTransactions('analytics', filters);
    const income = txs
      .filter(t => this._isPositiveTx(t))
      .reduce((sum, t) => sum + t.amount, 0);
    const expense = txs
      .filter(t => t.type === 'expense')
      .reduce((sum, t) => sum + t.amount, 0);
    
    return { income, expense, net: income - expense };
  },

  computeCategoryDistribution(filters, distributionType) {
    const transactions = this.getFilteredTransactions('analytics', filters); // v0.64 - honor passed filters
    
    // distributionType is 'income' or 'expense'
    const filteredByRequestedType = transactions.filter(tx => {
      if (distributionType === 'income') return this._isPositiveTx(tx);
      return tx.type === 'expense';
    });
    
    const categoryMap = {};
    filteredByRequestedType.forEach(tx => {
      const catId = tx.categoryId || 'uncategorized';
      if (!categoryMap[catId]) {
        const cat = this.state.categories.find(c => c.id === catId);
        categoryMap[catId] = {
          id: catId,
          // 1.0.1 (BUG-08): localized label for rows without (or with a dangling)
          // category. The 'uncategorized' bucket id stays — the drilldown filter keys on it.
          name: cat ? cat.name : (window.I18n ? window.I18n.t('common.uncategorized') : 'Uncategorized'),
          color: cat ? cat.color : '#94a3b8',
          icon: cat ? cat.icon : 'help-circle',
          amount: 0
        };
      }
      categoryMap[catId].amount += tx.amount;
    });
    
    const total = Object.values(categoryMap).reduce((sum, item) => sum + item.amount, 0);
    
    return Object.values(categoryMap).map(item => ({
      ...item,
      percentage: total > 0 ? (item.amount / total) * 100 : 0
    })).sort((a, b) => b.amount - a.amount);
  },

  /**
   * v0.85 (docs/refactor-plan.md P7): per-tag breakdown WITHIN one category,
   * for the analytics donut's drilldown accordion. Sibling of
   * computeCategoryDistribution — deliberately a separate getter, because that
   * one's output shape is consumed by widgets, _capData and existing tests.
   *
   * Reuses getFilteredTransactions('analytics', filters) so the analytics
   * exclusions (unpaid, transfer legs, cat_balance, non-income/expense) come
   * for free, and honours the same effectiveFilters the category rows use.
   *
   * NOTE: a transaction carrying several tags counts once per tag, so the tag
   * amounts can legitimately sum to more than the category total; percentages
   * are of the category total. Untagged transactions form their own bucket
   * (single-counted) and are returned last under the '__untagged__' sentinel.
   */
  computeCategoryTagBreakdown(filters, distributionType, categoryId) {
    const transactions = this.getFilteredTransactions('analytics', filters);
    const typed = transactions.filter(tx => {
      if (distributionType === 'income') return this._isPositiveTx(tx);
      return tx.type === 'expense';
    });
    const inCategory = typed.filter(tx => (tx.categoryId || 'uncategorized') === categoryId);

    const total = inCategory.reduce((sum, tx) => sum + tx.amount, 0);
    const byTag = {};
    let untaggedAmount = 0;
    let untaggedCount = 0;

    inCategory.forEach(tx => {
      const tags = (Array.isArray(tx.tags) ? tx.tags : []).filter(Boolean);
      if (tags.length === 0) {
        untaggedAmount += tx.amount;
        untaggedCount += 1;
        return;
      }
      tags.forEach(tag => {
        if (!byTag[tag]) byTag[tag] = { tag, amount: 0, count: 0, isUntagged: false };
        byTag[tag].amount += tx.amount;
        byTag[tag].count += 1;
      });
    });

    const pct = (amount) => (total > 0 ? (amount / total) * 100 : 0);
    const rows = Object.values(byTag)
      .sort((a, b) => b.amount - a.amount || a.tag.localeCompare(b.tag))
      .map(r => ({ ...r, percentage: pct(r.amount) }));

    if (untaggedCount > 0) {
      rows.push({
        tag: '__untagged__',
        amount: untaggedAmount,
        count: untaggedCount,
        percentage: pct(untaggedAmount),
        isUntagged: true
      });
    }

    return { total, count: inCategory.length, rows };
  },

  getMaxTransactionDate() {
    if (this.state.transactions.length === 0) return null;
    const sorted = [...this.state.transactions].sort((a, b) => b.date.localeCompare(a.date));
    return sorted[0].date;
  },

  /**
   * v0.71 Phase 2: derives a LoanEngine input config from a legacy v1 loan
   * record (or legacy-shaped ADD_LOAN/UPDATE_LOAN payload). Pure data mapping —
   * no LoanEngine call, so the store stays loadable without loan-engine.js.
   * See docs/debt-rebuild-plan.md §5.
   */
  _loanConfigFromLegacy(rec) {
    return {
      type: 'personal',
      principal: rec.amount,
      duration: rec.durationMonths,
      durationUnit: 'months',
      annualRate: rec.tan || 0,
      firstPaymentDate: rec.startDate,
      amortization: 'french'
    };
  },

  /**
   * v0.71 Phase 4: schedule-derived loan progress (replaces the old
   * straight-line computeLoanRemainingBalance, which disagreed with the
   * interest-bearing payment displayed next to it). Everything comes from
   * LoanEngine, so principal paid, interest paid and the next instalment are
   * all consistent with the amortization schedule.
   *
   * @param {Object} loan - v2 loan record (needs .config)
   * @param {string} [todayStr] - 'YYYY-MM-DD' override, for tests
   * @returns {Object|null} progress, or null when the config can't be simulated
   */
  getLoanProgress(loan, todayStr) {
    if (!loan || !loan.config || !window.LoanEngine) return null;
    let res;
    try {
      res = window.LoanEngine.simulate({ ...loan.config, computeSavings: false });
    } catch (e) {
      return null;
    }
    const today = todayStr || this._todayYMD();
    const totalC = res.financedPrincipalC;
    let paidPrincipalC = 0;
    let paidInterestC = 0;
    let paidCount = 0;
    let nextPayment = null;
    let nextRegularPayment = null;
    res.schedule.forEach(row => {
      // index 0 is the interest-only stub, which is NOT representative of the
      // instalment: a recurring series armed from it would under-charge every
      // month. Track the next true amortizing row separately.
      // 1.0.1 (BUG-15): the armable row is picked BEFORE the paid cut, with
      // `>= today`: an instalment due today is not in the ledger yet, so it is
      // still trackable (tracking used to start a month late and skip it).
      // Past rows are never armed (no back-dated series). Progress (paidCount,
      // pct, nextPayment) keeps its "on or before today = paid" semantics.
      if (!nextRegularPayment && row.index >= 1 && row.date >= today) {
        // 1.0.1 (BUG-07 review): the regular instalment — a one-off early
        // repayment due that month must not be armed into every payment.
        nextRegularPayment = { date: row.date, amountC: this._loanRowRegularC(loan.config, row) };
      }
      if (row.date <= today) {
        paidPrincipalC += row.principalC + row.extraPrincipalC;
        paidInterestC += row.interestC;
        paidCount++;
        return;
      }
      if (!nextPayment) {
        nextPayment = { date: row.date, amountC: row.paymentC + row.extraPrincipalC };
      }
    });
    const remainingC = Math.max(0, totalC - paidPrincipalC);
    return {
      totalC,
      paidPrincipalC,
      paidInterestC,
      remainingC,
      pct: totalC > 0 ? Math.min(100, Math.max(0, paidPrincipalC / totalC * 100)) : 0,
      paidCount,
      totalCount: res.installmentCount,
      nextPayment,
      nextRegularPayment,
      initialPaymentC: res.initialPaymentC,
      lastPaymentDate: res.lastPaymentDate,
      isPaidOff: remainingC === 0,
      simulation: res
    };
  },

  /**
   * v0.71 Phase 4: the live transactions of a loan's linked recurring series.
   * Reads through to the transactions rather than trusting `linkedSeriesId`, so
   * a series the user deleted stops showing as tracked.
   *
   * @param {Object} loan
   * @returns {Array|null} the series' transactions, or null when not tracked
   */
  getLoanLinkedTransactions(loan) {
    if (!loan || !loan.linkedSeriesId) return null;
    const txs = this.state.transactions.filter(
      t => t.recurrence && t.recurrence.seriesId === loan.linkedSeriesId
    );
    return txs.length ? txs : null;
  },

  /**
   * 1.0.1 (BUG-06): the linked series' members dated strictly AFTER today, one
   * row per occurrence (a recurring-transfer pair counts once, by its expense
   * leg), ascending. "Future" is the same split Upcoming and
   * computeUpcomingImpact use: a payment dated today counts as booked.
   *
   * @param {Object} loan
   * @param {string} [todayStr] - 'YYYY-MM-DD' override, for tests
   * @returns {Array} [] when the loan is not tracked
   */
  getLoanFuturePayments(loan, todayStr) {
    // 1.0.1 (BUG-02): a series another loan also claims (a loans file imported
    // twice, a backup restored over its own install) is not this loan's to
    // delete or rewrite — deleting the duplicate must not take the original's
    // payments with it. Every per-loan series action (the delete sheet's
    // checkbox, DELETE_LOAN deleteFuturePayments, the sync plan) reads
    // through here, so they all stand down together.
    if (this._loanSeriesShared(loan)) return [];
    const today = todayStr || this._todayYMD();
    return (this.getLoanLinkedTransactions(loan) || [])
      .filter(t => t.date > today && (!t.transferRef || t.type === 'expense'))
      .sort((a, b) => a.date.localeCompare(b.date) || String(a.id).localeCompare(String(b.id)));
  },

  // 1.0.1 (BUG-02): true when ANOTHER loan names the same linked series.
  _loanSeriesShared(loan) {
    if (!loan || !loan.linkedSeriesId) return false;
    return (this.state.loans || []).some(
      l => l && l.id !== loan.id && l.linkedSeriesId === loan.linkedSeriesId
    );
  },

  // 1.0.1 (BUG-07): a schedule row's REGULAR instalment — the payment plus
  // only the recurring ('monthly') early repayments active in its month. A
  // one-off ('once', the engine default) lump sum lands in the same row's
  // extraPrincipalC but is not what the loan charges every month, so it must
  // never become a series' uniform amount. Mirrors LoanEngine's slot rule: a
  // monthly repayment is active from the first row dated on/after its date
  // until its endDate. Capped at extraPrincipalC (the engine caps each
  // repayment at the remaining balance).
  _loanRowRegularC(config, row) {
    if (!row) return null;
    const ers = config && Array.isArray(config.earlyRepayments) ? config.earlyRepayments : [];
    let recurringC = 0;
    ers.forEach(er => {
      if (!er || er.frequency !== 'monthly' || !er.date) return;
      if (er.date > row.date) return;
      if (er.endDate && er.endDate < row.date) return;
      const c = Math.round(Number(er.amount) * 100);
      if (Number.isFinite(c) && c > 0) recurringC += c;
    });
    return row.paymentC + Math.min(row.extraPrincipalC || 0, recurringC);
  },

  // 1.0.1 (BUG-06/07): once a series' future members are gone, none of the
  // survivors may stay armed — a stray generator (one-armed-tail invariant
  // broken by old data) would materialize the deleted payments right back on
  // the next processing pass. Returns true when something was disarmed; the
  // caller saves.
  _disarmSeries(seriesId) {
    if (!seriesId) return false;
    let disarmed = false;
    this.state.transactions.forEach((t, i) => {
      if (!t.recurrence || t.recurrence.seriesId !== seriesId || !t.recurrence.nextDate) return;
      const r = { ...t.recurrence };
      delete r.nextDate;
      this.state.transactions[i] = { ...t, recurrence: r };
      disarmed = true;
    });
    return disarmed;
  },

  // 1.0.1 (BUG-07): the regular instalment (_loanRowRegularC) of the schedule
  // row falling in ymd's month, or null when the loan has no instalment that
  // month. Matching by month (not day) tolerates the 29th-31st drift of
  // monthly series against the engine's anchor-day schedule. Review 3: any
  // row counts — an interest-only first instalment (index 0) is what that
  // month's payment is.
  _loanMonthRegularC(config, sim, ymd) {
    if (!sim || !sim.schedule || !ymd) return null;
    const month = ymd.slice(0, 7);
    const row = sim.schedule.find(r => r.date.slice(0, 7) === month);
    return row ? this._loanRowRegularC(config, row) : null;
  },

  // 1.0.1 (BUG-07): a stable fingerprint of what a loan's terms produce. Two
  // configs whose schedules match row for row are "unchanged" for the series,
  // whatever their key order or shape (legacy-derived / imported configs).
  _loanScheduleSignature(sim) {
    if (!sim || !sim.schedule) return '';
    return sim.lastPaymentDate + '|' + sim.schedule
      .map(r => `${r.date}:${r.paymentC}:${r.extraPrincipalC}`).join(',');
  },

  /**
   * 1.0.1 (BUG-07): what an edit of an active loan's terms means for its
   * linked series. Only ever proposes something when the terms actually
   * changed (prevConfig = the config before UPDATE_LOAN): a name-only edit, or
   * an Italian loan whose instalment simply moved on since tracking started,
   * never prompts. SYNC_LOAN_SERIES applies exactly what this describes.
   *
   * @param {Object} loan - the loan AFTER the edit
   * @param {Object} prevConfig - its config BEFORE the edit
   * @param {string} [todayStr]
   * @returns {null|{mode:'finish', firstId, count}|{mode:'update', firstId, count, amountC, varies, endDate, firstDate?, fromDate?, removeCount?, startDate?, capped?, loanEnd?}}
   *   'finish': the loan now ends before its next linked payment, so every
   *   future payment should go. 'update':
   *   - re-pricing (_loanSeriesAmountChanges): firstId/firstDate name the
   *     first re-priced payment, amountC its new amount, count how many are
   *     re-priced; `varies` says the new schedule does not keep that amount
   *     (several steps, a temporary change, a final payment far from it).
   *     fromDate is set when that payment is not the next one. With no
   *     re-pricing, amountC is null and count is the future chain.
   *   - endDate: the series' new end (on its own day of the month, possibly
   *     60-month-capped — then capped/loanEnd), only when the series followed
   *     the old loan end or now outlives the loan.
   *   - removeCount/startDate: payments dated before the loan's (new) first
   *     instalment, which the sync deletes.
   *   - keepCount/addCount: the future payments that survive the sync and
   *     the ones a longer end adds (review 4).
   *   - finalDate/finalC: on an end-only plan, a final payment the sync
   *     re-prices (or creates) by more than rounding; revertDate/revertFromC/
   *     revertC: the old final payment going back to the regular amount by
   *     more than rounding; addFrom/addC: the first payment a longer end adds
   *     (after today only) and its amount.
   *   - customIds/customCount/customDate/customC (1.0.2 BUG-74, only when
   *     non-empty): future payments the user changed by hand in a month the
   *     edit re-prices — kept by SYNC, left out of count/amountC/varies; the
   *     first one's date and amount name them in the prompt.
   *   Re-pricing and end moves apply to monthly series only.
   */
  getLoanSeriesSyncPlan(loan, prevConfig, todayStr) {
    if (!loan || !loan.config || !prevConfig || !window.LoanEngine) return null;
    if (this._loanSeriesShared(loan)) return null;
    const future = this.getLoanFuturePayments(loan, todayStr);
    // review 6: the chain is read from ALL its legs — once the last linked
    // payment is due today or past, a longer loan can still extend it.
    const seriesMembers = this.getLoanLinkedTransactions(loan) || [];
    const seriesLegs = seriesMembers
      .filter(t => !t.transferRef || t.type === 'expense')
      .sort((a, b) => a.date.localeCompare(b.date));
    if (!seriesLegs.length) return null;
    let newSim, oldSim;
    try {
      newSim = window.LoanEngine.simulate({ ...loan.config, computeSavings: false });
      oldSim = window.LoanEngine.simulate({ ...prevConfig, computeSavings: false });
    } catch (e) {
      return null;
    }
    if (this._loanScheduleSignature(newSim) === this._loanScheduleSignature(oldSim)) return null;

    const month = (ymd) => String(ymd).slice(0, 7);
    const first = future[0] || null;
    const tail = seriesLegs[seriesLegs.length - 1];
    const newEnd = newSim.lastPaymentDate;
    const rec = tail.recurrence || {};
    // The loan now ends before the next linked payment: every future payment
    // goes. A monthly series compares by month (that month's payment IS its
    // instalment); any other cadence by date (review 5).
    const monthlyCadence = rec.frequency === 'months';
    if (first && (monthlyCadence ? month(newEnd) < month(first.date) : newEnd < first.date)) {
      return { mode: 'finish', firstId: first.id, count: future.length };
    }
    // 1.0.1 (BUG-07 review 4): re-pricing and moving the end are MONTHLY rules
    // (one instalment per payment, ends by month). A series the user switched
    // to weekly or every-N-months is left alone — only 'finish' (above)
    // applies to any cadence.
    if (!monthlyCadence || Number(rec.interval) !== 1) return null;
    // 1.0.1 (BUG-07 review 3): a series end is a DAY on the series' own day of
    // the month, while payments match the schedule by MONTH. Put the loan's
    // last month on the series' day (clamped to the month's length), so a
    // series on the 20th of a loan that now ends on the 5th keeps its
    // final-month payment. Ends are compared by month.
    const seriesDay = Number(tail.date.slice(8, 10)) || 1;
    const onSeriesDay = (ymd) => {
      const [y, m] = ymd.split('-').map(Number);
      const dim = new Date(y, m, 0).getDate();
      return `${month(ymd)}-${String(Math.min(seriesDay, dim)).padStart(2, '0')}`;
    };
    // _clampRecurrenceEndDate mutates its argument: always a fresh literal
    const clamp = (end) => this._clampRecurrenceEndDate({ startDate: rec.startDate || seriesLegs[0].date, endDate: end }).endDate;
    // review 6: never below a payment the series keeps in the loan's last
    // month — a chain drifted to the 28th (or a last payment moved earlier)
    // can hold that month's payment on a LATER day than the tail's; no member
    // may be dated after its series' end.
    const inEndMonth = future.filter(m => month(m.date) === month(newEnd)).map(m => m.date).sort();
    let wantEndRaw = onSeriesDay(newEnd);
    if (inEndMonth.length && inEndMonth[inEndMonth.length - 1] > wantEndRaw) wantEndRaw = inEndMonth[inEndMonth.length - 1];
    const wantEnd = clamp(wantEndRaw);
    const oldEnd = clamp(onSeriesDay(oldSim.lastPaymentDate));
    const curEnd = rec.endDate;
    // The series end follows the loan when the loan now ends before the
    // series does — or, for a LONGER end, only when the series followed the
    // old loan end (a deliberately shorter series stays as the user set it)
    // and its chain is still live (review 4: a series the user stopped — a
    // "this and future" delete, recurrence removed — has no armed member and
    // is never restarted).
    const chainLive = seriesMembers.some(t => t.recurrence && t.recurrence.nextDate);
    // review 7: a stopped chain really ends at its last payment, whatever
    // end its metadata still carries — it is "shorter" only past that.
    const effCur = chainLive ? curEnd : tail.date;
    const endChanged = !!curEnd && month(wantEnd) !== month(curEnd) &&
      (month(wantEnd) < month(effCur) || (chainLive && month(curEnd) === month(oldEnd)));
    // Nothing ahead: only a LONGER end has something to do (review 6).
    if (!first && !(endChanged && month(wantEnd) > month(curEnd))) return null;

    // Payments dated before the loan's (new) first instalment (the first
    // payment moved later) have nothing to pay: the sync deletes them.
    const startDate = newSim.schedule.length ? newSim.schedule[0].date : newEnd;
    const orphans = future.filter(m => month(m.date) < month(startDate));

    // 1.0.1 (BUG-07 review 2): follow the schedule MONTH BY MONTH — a single
    // uniform amount cannot represent a schedule whose instalment changes
    // more than once.
    // 1.0.2 (BUG-74): payments the user changed by hand (custom) are kept —
    // out of the count, the amounts and the prompt; named in one note.
    const { changes, custom } = this._loanSeriesAmountChanges(loan.config, prevConfig, newSim, oldSim, future);
    // What the prompt talks about. The NEW schedule's last row is the engine's
    // cent-adjusted final instalment, and when the end moves the OLD last
    // month just loses its old cent adjustment: SYNC re-prices both, but a
    // cents-level adjustment is not "the loan's regular payment", so it never
    // drives the prompt (unless it is the only payment left) — and a
    // cents-only change to the final payment alone never prompts. Review 4:
    // a final payment that changes by more than that (a lump sum shrinking
    // it) IS a change worth asking about.
    const lastMonth = month(newEnd);
    const oldLastMonth = month(oldSim.lastPaymentDate);
    const oldRows = oldSim.schedule || [];
    const oldRegularC = oldRows.length >= 2
      ? this._loanRowRegularC(prevConfig, oldRows[oldRows.length - 2]) : null;
    const newRows = newSim.schedule || [];
    const newRegularC = newRows.length >= 2
      ? this._loanRowRegularC(loan.config, newRows[newRows.length - 2]) : null;
    const isFinal = (c) => month(c.date) === lastMonth && (!first || c.id !== first.id);
    // A final payment far (> 1 unit) from the new regular payment — a lump
    // sum shrinking it — or (review 6) from what that month's instalment WAS
    // is worth naming; a cents-level one is rounding.
    const finalChange = changes.find(c => {
      if (!isFinal(c)) return false;
      const wasC = this._loanMonthRegularC(prevConfig, oldSim, c.date);
      return newRegularC == null || Math.abs(c.toC - newRegularC) > 100 ||
        (wasC != null && Math.abs(c.toC - wasC) > 100);
    }) || null;
    // review 6: the old final month going back to the regular payment is not
    // a new regular payment — but a material jump (an old lump-sum final) is
    // named, so the prompt never hides it.
    const revert = endChanged ? changes.find(c => month(c.date) === oldLastMonth &&
      month(c.date) !== lastMonth && c.toC === oldRegularC && Math.abs(c.toC - c.fromC) > 100) || null : null;
    let priced = changes.filter(c => {
      const mo = month(c.date);
      if (isFinal(c)) return false;
      // the old final month merely back at the old regular payment
      if (endChanged && mo === oldLastMonth && mo !== lastMonth && c.toC === oldRegularC) return false;
      return true;
    });
    // Only the final payment changes (the end stays): that IS the prompt.
    if (!priced.length && finalChange && !endChanged) priced = [finalChange];
    if (!priced.length && !endChanged && !orphans.length) return null;

    const head = priced[0];
    let varies = false;
    if (head) {
      // a final-payment-only change is not a new regular payment either
      varies = priced.some(c => c.toC !== head.toC) || isFinal(head);
      if (!varies) {
        // 1.0.1 (BUG-07 review 3): "the regular payment is now X" must hold
        // to the series' end — a change that does not last (a time-boxed
        // monthly repayment) or a final payment far from X (a reduceDuration
        // repayment) is a schedule, not a new regular payment. A cents-level
        // final adjustment is not a change.
        const endMo = month(endChanged ? wantEnd : (curEnd || wantEnd));
        const lastRow = newSim.schedule[newSim.schedule.length - 1];
        varies = newSim.schedule.some(r => {
          const mo = month(r.date);
          if (mo < month(head.date) || mo > endMo) return false;
          const c = this._loanRowRegularC(loan.config, r);
          return r === lastRow ? Math.abs(c - head.toC) > 100 : c !== head.toC;
        });
      }
    }
    // 1.0.1 (BUG-07 review 4): what the series holds AFTER the sync — the
    // surviving future payments (inside the loan's new start..end) plus the
    // months a longer end adds (mirroring _moveSeriesEnd: stepped from the
    // chain's tail past its old end; months before the new start are deleted
    // again, so they do not count).
    const effEnd = endChanged ? wantEnd : curEnd;
    const today = todayStr || this._todayYMD();
    const keepCount = future.filter(m => month(m.date) >= month(startDate) &&
      (!effEnd || month(m.date) <= month(effEnd))).length;
    let addCount = 0;
    let lastAdded = null;
    let firstAdded = null;
    if (endChanged && month(wantEnd) > month(curEnd)) {
      const step = (d) => this._nextSeriesDate(d, rec); // 1.0.3 (BUG-51): the chain's anchor day
      const floor = curEnd < wantEnd ? curEnd : wantEnd;
      let next = step(tail.date);
      let guard = 0;
      while (next && next <= floor && guard++ < 1000) next = step(next);
      // review 7: like tracking itself, a longer end never back-dates —
      // only occurrences after today are created (_moveSeriesEnd agrees).
      while (next && next <= today && guard++ < 1000) next = step(next);
      while (next && next <= wantEnd && guard++ < 1000) {
        if (month(next) >= month(startDate)) {
          addCount++;
          lastAdded = next;
          if (!firstAdded) firstAdded = next;
        }
        next = step(next);
      }
    }
    // review 8: nothing ahead and nothing a longer end adds after today —
    // there is no payment to talk about (an empty prompt changed nothing)
    if (!first && !addCount) return null;
    const plan = {
      mode: 'update',
      firstId: head ? head.id : (first ? first.id : tail.id),
      // every payment the sync re-prices — the cent-adjusted final one
      // included ("…to match") — or, for an end-only change, every future
      // payment the series holds afterwards
      count: priced.length ? changes.length : keepCount + addCount,
      amountC: head ? head.toC : null,
      varies,
      endDate: endChanged ? wantEnd : null
    };
    if (head) plan.firstDate = head.date;
    if (head && first && head.id !== first.id) plan.fromDate = head.date;
    if (orphans.length) {
      plan.removeCount = orphans.length;
      plan.startDate = startDate;
    }
    plan.keepCount = keepCount;
    if (addCount) {
      plan.addCount = addCount;
      plan.addFrom = firstAdded;
      // review 7: what the new payments cost (SYNC prices them to the new
      // schedule — say so, it can differ from the series' current payment)
      const addC = this._loanMonthRegularC(loan.config, newSim, firstAdded);
      if (addC != null) plan.addC = addC;
    }
    if (!head && revert) {
      plan.revertDate = revert.date;
      plan.revertFromC = revert.fromC;
      plan.revertC = revert.toC;
    }
    // An end-only plan still names a final payment that moves by more than
    // rounding (review 4) — the end note alone would hide it.
    if (!head && finalChange) {
      plan.finalDate = finalChange.date;
      plan.finalC = finalChange.toC;
    } else if (!head && lastAdded && month(lastAdded) === lastMonth) {
      // review 5: a final payment the end move CREATES, far from the regular
      const fc = this._loanMonthRegularC(loan.config, newSim, lastAdded);
      if (fc != null && (newRegularC == null || Math.abs(fc - newRegularC) > 100)) {
        plan.finalDate = lastAdded;
        plan.finalC = fc;
      }
    }
    // The loan's own end, for every sentence about the loan (review 5: the
    // series end sits on the series' day and may be 60-month-capped — it is
    // not the loan's end). capped: the series stops before the loan does.
    plan.loanEnd = newEnd;
    if (endChanged && month(wantEnd) !== month(newEnd)) plan.capped = true;
    // 1.0.2 (BUG-74): only when a hand-edited payment is kept (so plans
    // without one keep their exact shape)
    if (custom.length) {
      plan.customIds = custom.map(c => c.id);
      plan.customCount = custom.length;
      plan.customDate = custom[0].date;
      plan.customC = custom[0].fromC;
    }
    return plan;
  },

  /**
   * 1.0.1 (BUG-07 review 2): which future linked payments an edit of the
   * loan's terms re-prices, and to what. Each member is compared with its OWN
   * month's regular instalment (_loanMonthRegularC: one-off lump sums
   * excluded, an interest-only first instalment included) — and only in
   * months whose regular instalment the edit actually changed (old schedule
   * vs new), so a payment the user customised in a month the edit did not
   * touch keeps its amount. The schedule's cent-adjusted final row is just
   * another month here (BUG-17 falls out of it). Members with no instalment
   * in their month (past the new end, before the new start) are not listed:
   * the end move and the start cleanup deal with them.
   * 1.0.2 (BUG-74): a payment the user changed by hand ('Only this' amount
   * edit → amountEdited) keeps its amount and goes into `custom`, unless it
   * is back at its month's OLD instalment (typed back to the regular amount).
   * Never inferred from amounts: clones, partly re-priced Italian schedules
   * and declined syncs carry no mark.
   *
   * @returns {{changes: Array<{id, date, fromC, toC}>, custom: Array<{id, date, fromC, toC}>}}
   *   both in member (date) order
   */
  _loanSeriesAmountChanges(config, prevConfig, newSim, oldSim, members) {
    const changes = [];
    const custom = [];
    members.forEach(m => {
      const toC = this._loanMonthRegularC(config, newSim, m.date);
      if (toC == null) return;
      const oldC = this._loanMonthRegularC(prevConfig, oldSim, m.date);
      const fromC = Math.round(Math.abs(Number(m.amount)) * 100);
      if (oldC === toC || fromC === toC) return;
      (m.amountEdited === true && fromC !== oldC ? custom : changes).push({ id: m.id, date: m.date, fromC, toC });
    });
    return { changes, custom };
  },

  /**
   * 1.0.1 (BUG-07 review 3): move a linked series' end IN PLACE — never by
   * regenerating the chain, which cloned one member over every future payment
   * (its account, category and note) and brought deleted payments back.
   *  1. A shorter end: future members past the end's month go, with their
   *     transfer counterparts.
   *  2. Every member — both legs of a transfer pair, past members too (the
   *     transaction form fills the end date from the tapped leg) — carries
   *     the new end; all are disarmed.
   *  3. One armed tail (unless the chain had been stopped), the latest member
   *     (the expense leg of a pair), armed at its first occurrence beyond the
   *     old window — the tail's own end: a longer end makes the
   *     generator materialize exactly the months the chain gains, cloned from
   *     the real tail; a shorter one leaves it dormant. A payment the user
   *     deleted inside the old window stays deleted either way.
   * The caller saves.
   */
  _moveSeriesEnd(seriesId, endDate, todayStr) {
    if (!seriesId || !endDate) return;
    const today = todayStr || this._todayYMD();
    const endMonth = endDate.slice(0, 7);
    const inSeries = t => t.recurrence && t.recurrence.seriesId === seriesId;
    const isLeg = t => !t.transferRef || t.type === 'expense';
    const byDate = (a, b) => a.date.localeCompare(b.date);
    // review 4, read BEFORE anything is removed (a shorter end removes the
    // armed tail itself): the old window is the LIVE chain's end — its tail's
    // — not the latest end any member carries (past members keep the end
    // they had when a "this and future" edit shortened the chain); and a
    // chain the user stopped (no armed member) is never re-armed.
    const all = this.state.transactions.filter(inSeries);
    if (!all.length) return;
    const oldLegs = all.filter(isLeg).sort(byDate);
    const prevEnd = (oldLegs.length && oldLegs[oldLegs.length - 1].recurrence.endDate) || '';
    const wasLive = all.some(t => t.recurrence.nextDate);
    const beyond = all.filter(t => t.date > today && t.date.slice(0, 7) > endMonth);
    if (beyond.length) this._removeSeriesMembers(beyond);
    const members = this.state.transactions.filter(inSeries);
    if (!members.length) return;
    const legs = members.filter(isLeg).sort(byDate);
    const tail = legs[legs.length - 1];
    // review 6: no member may be dated after its series' end
    if (tail && tail.date > endDate) endDate = tail.date;
    members.forEach(t => {
      const r = { ...t.recurrence, endDate };
      delete r.nextDate;
      t.recurrence = r;
    });
    if (!tail || !wasLive) {
      this._budgetSpendIdx = null;
      return;
    }
    let floor = prevEnd && prevEnd < endDate ? prevEnd : endDate;
    // review 7: never generate a back-dated payment (a series extended after
    // its last payment was due starts at the next occurrence after today)
    if (floor < today) floor = today;
    // 1.0.3 (BUG-51): stepped on the chain's anchor day
    let next = this._nextSeriesDate(tail.date, tail.recurrence);
    let guard = 0;
    while (next && next <= floor && guard++ < 1000) {
      next = this._nextSeriesDate(next, tail.recurrence);
    }
    if (next) tail.recurrence = { ...tail.recurrence, nextDate: next };
    this._processRecurringTransactions();
    this._budgetSpendIdx = null;
  },

  // 1.0.1 (BUG-07 review 3): delete these series members and their transfer
  // counterparts (no recurrence scope logic — callers pick exactly what goes).
  // The caller saves.
  _removeSeriesMembers(list) {
    const ids = new Set(list.map(t => t.id));
    const refs = new Set(list.filter(t => t.transferRef).map(t => t.transferRef));
    this.state.transactions = this.state.transactions.filter(t =>
      !ids.has(t.id) && !(t.transferRef && refs.has(t.transferRef)));
    this._budgetSpendIdx = null;
  },

  // 1.0.1 (BUG-07 review 2): re-price one linked payment in place (and its
  // transfer counterpart, for a series later converted to a transfer). The
  // caller nulls _budgetSpendIdx and saves.
  _setLoanMemberAmount(member, amountC, now) {
    member.amount = amountC / 100;
    member.updatedAt = now;
    if (member.transferRef) {
      this.state.transactions.forEach(t => {
        // 1.0.2 (BUG-35, D-U8-5): never copy the loan figure into a leg in
        // another currency
        if (t !== member && t.transferRef === member.transferRef && this._sameCurrency(t.accountId, member.accountId)) {
          t.amount = amountC / 100;
          t.updatedAt = now;
        }
      });
    }
  },

  /**
   * 1.0.1 (BUG-17): LoanEngine absorbs rounding into the LAST schedule row, but
   * a tracked series is a uniform chain cloned from its generator. Stamp the
   * series' last member with the schedule's final amount — only when that is
   * honestly "the same series with a cent-adjusted last payment":
   *  (a) the series ends on the loan's last payment date (not capped by the
   *      60-month window, end not customised);
   *  (b) its last member falls in the last payment's month;
   *  (c) that member still carries the regular amount (not customised);
   *  (d) every schedule row from the series' first month up to the last row
   *      equals the regular amount (Italian / repriced loans are already an
   *      approximation — stamping one odd row would be half-correct).
   * Mutates the state objects in place; returns true when it did, and the
   * caller saves 'transactions'.
   *
   * @param {Object} loan
   * @param {number} regularC - the series' regular instalment, in cents
   */
  _applyLoanFinalInstalment(loan, regularC) {
    const txs = this.getLoanLinkedTransactions(loan);
    if (!txs || !loan.config || !window.LoanEngine || !Number.isFinite(regularC)) return false;
    let sim;
    try {
      sim = window.LoanEngine.simulate({ ...loan.config, computeSavings: false });
    } catch (e) {
      return false;
    }
    const sched = sim.schedule || [];
    if (!sched.length) return false;
    const last = sched[sched.length - 1];
    const finalC = this._loanRowRegularC(loan.config, last); // 1.0.1 (BUG-07 review): one-off extras excluded
    if (finalC === regularC) return false;

    const legs = txs
      .filter(t => !t.transferRef || t.type === 'expense')
      .sort((a, b) => a.date.localeCompare(b.date));
    if (!legs.length) return false;
    const head = legs[0];
    const tail = legs[legs.length - 1];
    if (!tail.recurrence || tail.recurrence.frequency !== 'months' || Number(tail.recurrence.interval) !== 1) return false; // review 4: monthly only
    if (!tail.recurrence.endDate ||
        tail.recurrence.endDate.slice(0, 7) !== sim.lastPaymentDate.slice(0, 7)) return false;   // (a) by month (review 3)
    if (tail.date.slice(0, 7) !== sim.lastPaymentDate.slice(0, 7)) return false;                // (b)
    if (Math.round(Math.abs(Number(tail.amount)) * 100) !== regularC) return false;              // (c)
    const headMonth = head.date.slice(0, 7);
    // 1.0.1 (BUG-07 review): compared on the REGULAR instalment — a one-off
    // early repayment's lump sum is not part of what the series charges.
    const uniform = sched
      .filter(r => r.index >= 1 && r !== last && r.date.slice(0, 7) >= headMonth)
      .every(r => this._loanRowRegularC(loan.config, r) === regularC);
    if (!uniform) return false;                                                                  // (d)

    const now = new Date().toISOString();
    tail.amount = finalC / 100;
    tail.updatedAt = now;
    if (tail.transferRef) {
      this.state.transactions.forEach(t => {
        // 1.0.2 (BUG-35, D-U8-5): same-currency legs only
        if (t !== tail && t.transferRef === tail.transferRef && this._sameCurrency(t.accountId, tail.accountId)) {
          t.amount = finalC / 100;
          t.updatedAt = now;
        }
      });
    }
    this._budgetSpendIdx = null;
    return true;
  },

  _todayYMD() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
};


