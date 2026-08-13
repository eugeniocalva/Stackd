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
  state: {
    accounts: [],
    categories: [],
    transactions: [],
    budgets: [],
    currency: 'USD',
    activeView: 'dashboard',
    activeAccountFilter: '',
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

    initialized: false
  },

  listeners: [],

  init() {
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
    });

    if (accountsChanged) {
      window.StackdDB.save('accounts', this.state.accounts);
    }

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
    const todayStr = today.toISOString().split('T')[0];
    const monthStr = todayStr.substring(0, 7) + '-01';
    
    this.state.activeMonthFilter = todayStr.substring(0, 7);
    this.state.activePeriod = {
      type: 'month',
      value: monthStr
    };

    // Initialize Page Filters (v0.55)
    this.state.historyFilters.period.value = monthStr;
    this.state.analyticsFilters.period.value = monthStr;
    
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

    this._processRecurringTransactions();

    // ── Cross-Tab Synchronization ──────────────────────────────────────────
    // Listen to localStorage changes made natively by other tabs to ensure
    // zero-refresh sync for the global state.
    if (typeof window.addEventListener === 'function') {
      window.addEventListener('storage', async (e) => {
        if (!e.key || !e.key.startsWith('stackd_')) return;

        let changed = false;

        // Sync Plain Data
        if (e.key === 'stackd_v1_accounts') { this.state.accounts = window.StackdDB.load('accounts', []); changed = true; }
        if (e.key === 'stackd_v1_categories') { this.state.categories = window.StackdDB.load('categories', []); changed = true; }
        if (e.key === 'stackd_v1_transactions') { this.state.transactions = window.StackdDB.load('transactions', []); changed = true; }
        if (e.key === 'stackd_v1_budgets') { this.state.budgets = window.StackdDB.load('budgets', []); changed = true; }
        if (e.key === 'stackd_v1_loans') { this.state.loans = window.StackdDB.load('loans', []); changed = true; }
        if (e.key === 'stackd_v1_currency') { this.state.currency = window.StackdDB.load('currency', 'USD'); changed = true; }
        if (e.key === 'stackd_v1_language') { this.state.language = window.StackdDB.load('language', 'en'); if (window.I18n) window.I18n.setLang(this.state.language); changed = true; } // v0.86 P8a
        if (e.key === 'stackd_v1_enableTimeInput') { this.state.enableTimeInput = window.StackdDB.load('enableTimeInput', false); changed = true; }
        if (e.key === 'stackd_v1_homeWidgets') { this.state.homeWidgets = window.StackdDB.load('homeWidgets', []); changed = true; } // v0.72
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
    return active;
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
      const clampedEnd = new Date(capStart);
      clampedEnd.setMonth(clampedEnd.getMonth() + 60);
      rec.endDate = `${clampedEnd.getFullYear()}-${String(clampedEnd.getMonth() + 1).padStart(2, '0')}-${String(clampedEnd.getDate()).padStart(2, '0')}`;
    }
    return rec;
  },

  _calculateNextRecurrenceDate(baseDateStr, interval, freq) {
    // v0.67: parse and format in LOCAL time anchored at noon. The old
    // UTC-parse + toISOString round-trip slipped one day backwards every
    // time a DST boundary was crossed, so monthly series drifted (15th ->
    // 14th -> 13th ...) one day per year.
    const [by, bm, bd] = String(baseDateStr).split('-').map(Number);
    if (!by || !bm || !bd) return undefined;
    const d = new Date(by, bm - 1, bd, 12, 0, 0);
    if (freq === 'days') d.setDate(d.getDate() + interval);
    else if (freq === 'weeks') d.setDate(d.getDate() + (interval * 7));
    else if (freq === 'months') {
      const originalDay = d.getDate();
      d.setMonth(d.getMonth() + interval);
      // Handle end of month issues (e.g. going from Jan 31 + 1 month -> March 3 if Feb has 28 days)
      if (d.getDate() !== originalDay) {
         d.setDate(0); // Sets to last day of the previous calculated month
      }
    }
    else if (freq === 'years') d.setFullYear(d.getFullYear() + interval);

    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  },

  _processRecurringTransactions() {
    let changed = false;
    const today = new Date().toISOString().split('T')[0];
    
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
          const nextNextD = this._calculateNextRecurrenceDate(nextD, gen.recurrence.interval, gen.recurrence.frequency);
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
      window.StackdDB.save('transactions', this.state.transactions);
    }
  },

  // --- Period Helpers (v0.52) ---
  
  _getPeriodBounds(type, anchorDateStr) {
    const d = new Date(anchorDateStr + 'T00:00:00');
    let start, end;

    switch (type) {
      case 'custom':
        // For custom, anchorDateStr might be empty, we look at the period object specifically.
        // But here we rely on the period having start/end set already.
        return { start: '', end: '' }; // Should be overridden by the caller or handled separately
      case 'today':
        start = new Date(d);
        end = new Date(d);
        break;
      case 'week':
        const day = d.getDay(); // 0 is Sunday, 1 is Monday
        const diff = d.getDate() - day + (day === 0 ? -6 : 1);
        start = new Date(d.setDate(diff));
        end = new Date(start);
        end.setDate(start.getDate() + 6);
        break;
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
    return {
      start: fmt(start),
      end: fmt(end)
    };
  },

  _getPeriodLabel(period) {
    if (!period) return '';
    const { type, value, start, end } = period;
    
    if (type === 'custom') {
      if (!start || !end) return 'Custom Range';
      const fmt = (d) => new Date(d + 'T00:00:00').toLocaleDateString(this.getLocale(), { month: 'short', day: 'numeric' });
      return `${fmt(start)} - ${fmt(end)}`;
    }

    const d = new Date(value + 'T00:00:00');
    const bounds = this._getPeriodBounds(type, value);
    const startDt = new Date(bounds.start + 'T00:00:00');
    const endDt = new Date(bounds.end + 'T00:00:00');

    const today = new Date();
    today.setHours(0,0,0,0);
    const todayStr = today.toISOString().split('T')[0];

    switch (type) {
      case 'today':
        if (bounds.start === todayStr) return 'Today';
        const yest = new Date(today); yest.setDate(yest.getDate() - 1);
        if (bounds.start === yest.toISOString().split('T')[0]) return 'Yesterday';
        return d.toLocaleDateString(this.getLocale(), { month: 'short', day: 'numeric', year: 'numeric' });
      
      case 'week':
        if (today >= startDt && today <= endDt) return 'This Week';
        return `${startDt.toLocaleDateString(this.getLocale(), { month: 'short', day: 'numeric' })} – ${endDt.toLocaleDateString(this.getLocale(), { month: 'short', day: 'numeric' })}`;
 
      case 'month':
        if (today.getFullYear() === d.getFullYear() && today.getMonth() === d.getMonth()) return 'This Month';
        return d.toLocaleDateString(this.getLocale(), { month: 'long', year: 'numeric' });
 
      case 'year':
        if (today.getFullYear() === d.getFullYear()) return 'This Year';
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

    return this.state.transactions.filter(tx => {
      if (this._isTxBeforeOpeningDate(tx)) return false;

      if (pageKey === 'analytics') {
        if (tx.isPaid === false) return false; // Exclude unpaid transactions from analytics
        if (tx.type !== 'expense' && tx.type !== 'income') return false;
        if (tx.transferRef) return false; // Exclude linked transfers
        if (tx.categoryId === 'cat_balance') return false; // Exclude adjustments (initial balances)
      }

      const matchPeriod = this.isDateInPeriod(tx.date, period);
      const matchType = types.length === 0 || types.includes(tx.type);
      const matchAccount = accounts.length === 0 || accounts.includes(tx.accountId);
      const matchCategory = categories.length === 0 ||
                            categories.includes(tx.categoryId) ||
                            (categories.includes('uncategorized') && !tx.categoryId);
      const txTags = Array.isArray(tx.tags) ? tx.tags : [];
      const matchTag = tagFilter.length === 0 ||
                       txTags.some(t => tagFilter.includes(t)) ||
                       (tagFilter.includes('__untagged__') && txTags.length === 0);
      return matchPeriod && matchType && matchAccount && matchCategory && matchTag;
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
      const diffDays = Math.ceil((eDt - sDt) / (1000 * 60 * 60 * 24)) + 1;
      
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

  emit() { this.listeners.forEach(cb => cb(this.state)); },

  dispatch(action, payload) {
    let changed = false;

    switch (action) {
      case 'ADD_ACCOUNT': {
        const existingCount = this.state.accounts.length;
        const newAccount = {
          id: payload.id || window.StackdDB.generateId(),
          name: payload.name,
          color: payload.color || this.ACCOUNT_COLORS[existingCount % this.ACCOUNT_COLORS.length],
          icon: payload.icon || 'wallet',
          type: payload.type || 'Account',
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
            date: payload.openingDate || newAccount.createdAt.split('T')[0],
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
          if (payload.icon !== undefined) this.state.accounts[accountIndex].icon = payload.icon;
          if (payload.type !== undefined) this.state.accounts[accountIndex].type = payload.type;
          if (payload.color !== undefined) this.state.accounts[accountIndex].color = payload.color;
          
          this._sortData();
          window.StackdDB.save('accounts', this.state.accounts);
          if ((payload.openingBalance !== undefined && parseFloat(payload.openingBalance) !== 0) || payload.openingDate !== undefined) {
            const newObAmt = payload.openingBalance !== undefined ? (parseFloat(payload.openingBalance) || 0) : null;
            const existingObIdx = this.state.transactions.findIndex(
              t => t.accountId === payload.id && t.type === 'opening_balance'
            );
            const newDate = payload.openingDate || (existingObIdx !== -1 ? this.state.transactions[existingObIdx].date : this.state.accounts[accountIndex].createdAt.split('T')[0]);
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
        if (accountIndex !== -1) {
          this.state.accounts[accountIndex].color = payload.color;
          window.StackdDB.save('accounts', this.state.accounts);
          changed = true;
        }
        break;
      }

      case 'DELETE_ACCOUNT':
        this.state.accounts = this.state.accounts.filter(a => a.id !== payload.id);
        this._sortData();
        window.StackdDB.save('accounts', this.state.accounts);
        this.state.transactions = this.state.transactions.filter(t => t.accountId !== payload.id);
        window.StackdDB.save('transactions', this.state.transactions);
        changed = true;
        break;

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
          if (!payload.recurrence.nextDate) {
            payload.recurrence.nextDate = this._calculateNextRecurrenceDate(payload.date, payload.recurrence.interval, payload.recurrence.frequency);
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
            linkedLoan.updatedAt = new Date().toISOString();
            window.StackdDB.save('loans', this.state.loans);
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

        // Amounts in the DB are always stored as absolute, unsigned numbers
        let absoluteAmount = payload.amount;
        if (absoluteAmount !== undefined) {
           absoluteAmount = Math.abs(absoluteAmount);
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
            if (absoluteAmount !== undefined) counterpartTx.amount = absoluteAmount; 
            if (payload.date !== undefined) counterpartTx.date = payload.date;
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
        if (updatePayload.recurrence) {
          const merged = { ...(existingRec || {}), ...updatePayload.recurrence };
          if (existingRec) {
            if (existingRec.nextDate) merged.nextDate = existingRec.nextDate;
            else delete merged.nextDate;
          } else {
            if (!merged.startDate) merged.startDate = payload.date || existingTx.date;
          }
          // v0.67: the edit path honors the same 60-month window as creation
          this._clampRecurrenceEndDate(merged, payload.date || existingTx.date);
          updatePayload.recurrence = merged;
        }

        // Classify the change BEFORE mutating (drives the future/all scopes)
        const seriesId = (existingRec && existingRec.seriesId) || (payload.recurrence && payload.recurrence.seriesId);
        const dateChanged = payload.date !== undefined && payload.date !== existingTx.date;
        const scheduleChanged = !!(payload.recurrence && existingRec && (
          String(payload.recurrence.interval) !== String(existingRec.interval) ||
          String(payload.recurrence.frequency) !== String(existingRec.frequency) ||
          String(payload.recurrence.endDate) !== String(existingRec.endDate)
        ));
        const recurrenceRemoved = !!existingRec && payload.recurrence === null;
        const baseDate = existingTx.date; // original date: the past/future split point

        // Update the target transaction
        this.state.transactions[index] = {
          ...existingTx,
          ...updatePayload,
          tags: (updatePayload.tags !== undefined) ? updatePayload.tags : (existingTx.tags || []),
          updatedAt: new Date().toISOString()
        };

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
          this.state.transactions.forEach(t => {
            if (!t.transferRef || !refsToConvert.has(t.transferRef)) return;
            if (t.type === keptType) {
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
             delete tUpdate.type;
             if (t.transferRef && t.type !== existingTx.type) {
               // Counterpart leg of a transfer pair: its account/category
               // belong to the OTHER side — only shared fields may propagate
               delete tUpdate.accountId;
               delete tUpdate.categoryId;
             }
             if (recurrenceRemoved) {
               tUpdate.recurrence = null;
             } else if (tUpdate.recurrence) {
               // Per-member copy (the old code aliased ONE object across all
               // members) preserving each member's own generator state.
               const memberRec = { ...(t.recurrence || {}), ...tUpdate.recurrence };
               if (t.recurrence && t.recurrence.nextDate) memberRec.nextDate = t.recurrence.nextDate;
               else delete memberRec.nextDate;
               tUpdate.recurrence = memberRec;
             }
             this.state.transactions[i] = { ...t, ...tUpdate, updatedAt: new Date().toISOString() };
           };

           this.state.transactions.forEach((t, i) => {
             if (!t.recurrence || t.recurrence.seriesId !== seriesId || t.id === existingTx.id) return;
             const isFuture = t.date >= baseDate;
             // v0.69: a conversion's 'all' scope stops at the present — past
             // occurrences stay untouched transfer pairs, so their legs must
             // not inherit the converted account/category either.
             if (payload.updateAll && !convertingFromTransfer) {
               if (!isFuture || !regenerate) propagate(t, i);
             } else if (isFuture && !regenerate) {
               propagate(t, i);
             }
           });

           if (regenerate) {
              // Drop future members and let _processRecurringTransactions
              // rebuild them from this member's new date/schedule.
              this.state.transactions = this.state.transactions.filter(t => {
                 const isFutureInSeries = t.recurrence && t.recurrence.seriesId === seriesId &&
                   t.id !== existingTx.id && t.date >= baseDate &&
                   !(existingTx.transferRef && t.transferRef === existingTx.transferRef);
                 return !isFutureInSeries;
              });
              const updatedTx = this.state.transactions.find(t => t.id === payload.id);
              if (updatedTx && updatedTx.recurrence && !recurrenceRemoved) {
                 updatedTx.recurrence.nextDate = this._calculateNextRecurrenceDate(updatedTx.date, updatedTx.recurrence.interval, updatedTx.recurrence.frequency);
              }
           }
        }

        this._sortTransactions();
        window.StackdDB.save('transactions', this.state.transactions);
        this._processRecurringTransactions();
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
          if (!payload.recurrence.nextDate) {
            payload.recurrence.nextDate = this._calculateNextRecurrenceDate(payload.date, payload.recurrence.interval, payload.recurrence.frequency);
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

        // Income side (To)
        this.state.transactions.push({
          id: window.StackdDB.generateId(),
          type: 'income',
          amount: Math.abs(payload.amount),
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
        const scheduleChanged = !!(payload.recurrence && existingRecT && (
          String(payload.recurrence.interval) !== String(existingRecT.interval) ||
          String(payload.recurrence.frequency) !== String(existingRecT.frequency) ||
          String(payload.recurrence.endDate) !== String(existingRecT.endDate)
        ));
        const recurrenceRemoved = !!existingRecT && payload.recurrence === null;

        // v0.67: build a PER-LEG recurrence. The old code assigned the same
        // payload.recurrence object (with a freshly armed nextDate) to both
        // legs, which re-armed the pair as duplicate generators and crashed
        // _processRecurringTransactions ("Invalid time value"). Rules: keep
        // fields the form doesn't send, preserve the leg's own generator
        // state, and when recurrence is newly enabled arm ONLY the expense leg.
        const legRecurrence = (item) => {
          if (payload.recurrence === undefined) return item.recurrence;
          if (payload.recurrence === null) return null;
          const merged = { ...(item.recurrence || {}), ...payload.recurrence };
          if (item.recurrence) {
            if (item.recurrence.nextDate) merged.nextDate = item.recurrence.nextDate;
            else delete merged.nextDate;
          } else {
            if (!merged.startDate) merged.startDate = payload.date || item.date;
            if (item.type !== 'expense') delete merged.nextDate;
          }
          // v0.67: the edit path honors the same 60-month window as creation
          this._clampRecurrenceEndDate(merged, payload.date || item.date);
          return merged;
        };

        items.forEach(item => {
           if (item.type === 'expense') {
              if (payload.amount !== undefined) item.amount = Math.abs(payload.amount);
              if (payload.expenseAccountId !== undefined) item.accountId = payload.expenseAccountId;
              if (payload.date !== undefined) item.date = payload.date;
              if (payload.note !== undefined) item.comment = payload.note;
              if (payload.recurrence !== undefined) item.recurrence = legRecurrence(item);
              if (tagsArray !== undefined) item.tags = tagsArray;
              item.updatedAt = new Date().toISOString();
           } else if (item.type === 'income') {
              if (payload.amount !== undefined) item.amount = Math.abs(payload.amount);
              if (payload.incomeAccountId !== undefined) item.accountId = payload.incomeAccountId;
              if (payload.date !== undefined) item.date = payload.date;
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

        // Handle updateFuture or updateAll for Transfers (v0.67 semantics —
        // mirrors UPDATE_TRANSACTION: literal dates never propagate, date and
        // schedule changes regenerate the future, past pairs stay put)
        if ((payload.updateFuture || payload.updateAll) && seriesId && baseDate) {
           const regenerate = payload.regenerateSeries || dateChanged || scheduleChanged || recurrenceRemoved;

           this.state.transactions.forEach((t, i) => {
              if (!t.recurrence || t.recurrence.seriesId !== seriesId || t.transferRef === payload.transferRef) return;
              const isFuture = t.date >= baseDate;
              const shouldPropagate = payload.updateAll ? (!isFuture || !regenerate) : (isFuture && !regenerate);
              if (!shouldPropagate) return;

              if (payload.amount !== undefined) t.amount = Math.abs(payload.amount);
              if (payload.note !== undefined) t.comment = payload.note;
              if (payload.tags !== undefined) t.tags = payload.tags.map(tag => tag.toLowerCase());
              // v0.82: paid propagates with future/all like other non-date fields
              if (payload.isPaid !== undefined) {
                 if (payload.isPaid === false) t.isPaid = false;
                 else delete t.isPaid;
              }
              if (t.type === 'expense' && payload.expenseAccountId !== undefined) t.accountId = payload.expenseAccountId;
              if (t.type === 'income' && payload.incomeAccountId !== undefined) t.accountId = payload.incomeAccountId;
              if (recurrenceRemoved) {
                 t.recurrence = null;
              } else if (payload.recurrence) {
                 const memberRec = { ...(t.recurrence || {}), ...payload.recurrence };
                 if (t.recurrence && t.recurrence.nextDate) memberRec.nextDate = t.recurrence.nextDate;
                 else delete memberRec.nextDate;
                 t.recurrence = memberRec;
              }
              t.updatedAt = new Date().toISOString();
              this.state.transactions[i] = { ...t };
           });

           if (regenerate) {
              this.state.transactions = this.state.transactions.filter(t => {
                 const isFutureInSeries = t.recurrence && t.recurrence.seriesId === seriesId &&
                   t.transferRef !== payload.transferRef && t.date >= baseDate;
                 return !isFutureInSeries;
              });
              if (!recurrenceRemoved) {
                 // Re-arm exactly one leg (the expense side) from the new date
                 const pair = this.state.transactions.filter(t => t.transferRef === payload.transferRef);
                 pair.forEach(t => {
                    if (!t.recurrence) return;
                    if (t.type === 'expense') {
                       t.recurrence = { ...t.recurrence, nextDate: this._calculateNextRecurrenceDate(t.date, t.recurrence.interval, t.recurrence.frequency) };
                    } else if (t.recurrence.nextDate) {
                       t.recurrence = { ...t.recurrence };
                       delete t.recurrence.nextDate;
                    }
                 });
              }
           }
        }

        this._sortTransactions();
        window.StackdDB.save('transactions', this.state.transactions);
        this._processRecurringTransactions();
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

        this.state.transactions = this.state.transactions.filter(t => !idsToDelete.has(t.id));
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
        const importTime = this._getSystemTimeString();
        const newTxs = payload.transactions.map(t => ({
          id: window.StackdDB.generateId(),
          time: t.time || importTime,
          ...t,
          createdAt: t.createdAt || new Date().toISOString()
        }));
        this.state.transactions.push(...newTxs);
        this._sortTransactions();
        window.StackdDB.save('transactions', this.state.transactions);
        changed = true;
        break;
      }

      case 'ADD_CATEGORY': {
        const newCategory = {
          id: payload.id || window.StackdDB.generateId(),
          name: payload.name,
          icon: payload.icon || 'pin',
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
          if (payload.icon !== undefined) this.state.categories[catIdx].icon = payload.icon;
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
        if (this.state.activeView !== payload) {
          this.state.activeView = payload;
          // v0.72: widget edit mode is a dashboard-only affordance; leaving the
          // dashboard must drop it, or coming back shows the chrome unexpectedly.
          if (payload !== 'dashboard') this.state.widgetEditMode = false;
          changed = true;
        }
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
        window.StackdDB.save('accounts', []);
        window.StackdDB.save('categories', [...DEFAULT_CATEGORIES]);
        window.StackdDB.save('transactions', []);
        window.StackdDB.save('budgets', []);
        window.StackdDB.save('loans', []);
        // v0.72 Phase 5: reset = fresh-install experience, so the seed widget
        // comes back (Recent Activities no longer exists outside the widgets).
        this.state.homeWidgets = this._defaultHomeWidgets();
        window.StackdDB.save('homeWidgets', this.state.homeWidgets);
        // Clear the first-launch flag so the region setup modal shows again
        localStorage.removeItem('stackd_v1_setup_done');
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
          this.state.loans[lIdx] = merged;
          window.StackdDB.save('loans', this.state.loans);
          changed = true;
        }
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
        // payload: { id }
        // v0.71 Phase 4: disarm a pending link aimed at the loan being removed
        if (this.state.pendingLoanLink && this.state.pendingLoanLink.loanId === payload.id) {
          this.state.pendingLoanLink = null;
        }
        this.state.loans = this.state.loans.filter(l => l.id !== payload.id);
        window.StackdDB.save('loans', this.state.loans);
        changed = true;
        break;
      }

      case 'SET_ACCOUNT_FILTER':
        // Always emit — even if same view, filter change must re-render
        this.state.activeAccountFilter = payload || '';
        changed = true;
        break;

      case 'SET_CURRENCY': {
        this.state.currency = payload;
        window.StackdDB.save('currency', payload);
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
        const { page, filters } = payload;
        const key = page === 'history' ? 'historyFilters' : 'analyticsFilters';
        this.state[key] = { ...this.state[key], ...filters };
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
        this.state.defaultAccountId = payload;
        window.StackdDB.save('defaultAccountId', this.state.defaultAccountId);
        this.emit();
        break;
      }


    }

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
  getCurrencySymbol() {
    const symbols = { USD: '$', EUR: '\u20ac', JPY: '\u00a5', GBP: '\u00a3', CNY: '\u00a5' };
    return symbols[this.state.currency] || '$';
  },

  formatCurrency(amount) {
    const symbol = this.getCurrencySymbol();
    const isNeg = amount < 0;
    const abs = Math.abs(amount);
    let formatted;
    if (this.state.currency === 'JPY' || this.state.currency === 'CNY') {
      // No decimal places for Yen / Renminbi
      formatted = new Intl.NumberFormat(this.getLocale(), { maximumFractionDigits: 0 }).format(abs);
    } else {
      formatted = new Intl.NumberFormat(this.getLocale(), { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(abs);
    }
    return `${isNeg ? '-' : ''}${symbol}${formatted}`;
  },

  _isPositiveTx(tx) {
    return tx.type === 'income' || tx.type === 'opening_balance' || tx.type === 'transfer_in';
  },

  getAccountOpeningDate(accountId) {
    if (!accountId) return null;
    const obTx = this.state.transactions.find(
      t => t.accountId === accountId && t.type === 'opening_balance'
    );
    return obTx ? obTx.date : null;
  },

  _isTxBeforeOpeningDate(tx) {
    if (!tx || !tx.accountId || tx.type === 'opening_balance') return false;
    const obDate = this.getAccountOpeningDate(tx.accountId);
    if (!obDate) return false;
    return tx.date < obDate;
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
    return this.state.transactions
      .filter(t => t.date <= date &&
        !this._isTxBeforeOpeningDate(t) &&
        t.isPaid !== false &&
        (accountIds.length === 0 || accountIds.includes(t.accountId)) &&
        (categoryIds.length === 0 || !t.categoryId || categoryIds.includes(t.categoryId))
      )
      .reduce((sum, tx) => this._isPositiveTx(tx) ? sum + tx.amount : sum - tx.amount, 0);
  },

  // v0.64 - Future-dated transactions (after today, up to endDate) that are already
  // counted by getBalanceAtDate(endDate). Lets Analytics caveat projected balances.
  computeUpcomingImpact(endDate, accountIds = []) {
    const now = new Date();
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const upcoming = this.state.transactions.filter(t =>
      t.date > todayStr && t.date <= endDate &&
      !this._isTxBeforeOpeningDate(t) &&
      t.isPaid !== false &&
      (accountIds.length === 0 || accountIds.includes(t.accountId))
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

    const targetAccounts = (accountIds && accountIds.length > 0)
      ? this.state.accounts.filter(a => accountIds.includes(a.id))
      : this.state.accounts;

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

  getBudgetForMonth(categoryId, yearMonth) {
    // yearMonth is format "YYYY-MM"
    const budget = this.state.budgets.find(b => b.categoryId === categoryId);
    if (!budget) return { allocated: 0, spent: 0, carryover: 0, finalLimit: 0 };
    
    // Check if within date bounds
    if (budget.startDate && yearMonth < budget.startDate) return { allocated: 0, spent: 0, carryover: 0, finalLimit: 0 };
    if (budget.endDate && yearMonth > budget.endDate) return { allocated: 0, spent: 0, carryover: 0, finalLimit: 0 };

    const baseAmount = parseFloat(budget.amount) || 0;
    
    // Calculate spent in this current yearMonth
    const spentThisMonth = this.state.transactions
      .filter(t => t.categoryId === categoryId && t.date.startsWith(yearMonth) && t.type === 'expense')
      .reduce((sum, tx) => sum + tx.amount, 0);

    let carryOver = 0;

    if (budget.isCumulative && budget.startDate) {
      // Iterate from startDate up to yearMonth - 1
      let iterDate = new Date(`${budget.startDate}-01T00:00:00`);
      const endDateTarget = new Date(`${yearMonth}-01T00:00:00`);

      while (iterDate < endDateTarget) {
        const lookupMonth = `${iterDate.getFullYear()}-${String(iterDate.getMonth() + 1).padStart(2, '0')}`;
        const spentPast = this.state.transactions
          .filter(t => t.categoryId === categoryId && t.date.startsWith(lookupMonth) && t.type === 'expense')
          .reduce((sum, tx) => sum + tx.amount, 0);
        
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
        const dStr = d.toISOString().split('T')[0];
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
        
        const fmt = (dt) => dt.toISOString().split('T')[0];
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
        const fmt = (dt) => dt.toISOString().split('T')[0];
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

    return buckets.map(b => {
      const bucketEnd = clampEnd && b.end > clampEnd ? clampEnd : b.end;
      const txs = this.state.transactions.filter(t => {
        if (this._isTxBeforeOpeningDate(t)) return false;
        if (t.isPaid === false) return false; // Exclude unpaid transactions
        if (t.type !== 'expense' && t.type !== 'income') return false;
        if (t.transferRef) return false; // Exclude linked transfers
        if (t.categoryId === 'cat_balance') return false; // Exclude adjustments

        const matchDate = t.date >= b.start && t.date <= bucketEnd;
        const matchAcc = accounts.length === 0 || accounts.includes(t.accountId);
        const matchCat = categories.length === 0 || categories.includes(t.categoryId);
        return matchDate && matchAcc && matchCat;
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
          name: cat ? cat.name : (catId === 'uncategorized' ? 'Uncategorized' : 'Unknown'),
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
      if (row.date <= today) {
        paidPrincipalC += row.principalC + row.extraPrincipalC;
        paidInterestC += row.interestC;
        paidCount++;
        return;
      }
      if (!nextPayment) {
        nextPayment = { date: row.date, amountC: row.paymentC + row.extraPrincipalC };
      }
      // index 0 is the interest-only stub, which is NOT representative of the
      // instalment: a recurring series armed from it would under-charge every
      // month. Track the next true amortizing row separately.
      if (!nextRegularPayment && row.index >= 1) {
        nextRegularPayment = { date: row.date, amountC: row.paymentC + row.extraPrincipalC };
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

  _todayYMD() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
};


