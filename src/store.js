// store.js - Pub/Sub State Manager
const DEFAULT_CATEGORIES = [
  { id: 'cat_balance', name: 'Adjustment', icon: 'scale', isDefault: true, typeHint: 'both', color: '#64748b' },
  { id: 'cat_dining', name: 'Dining Out', icon: 'utensils', isDefault: true, typeHint: 'expense', color: '#f59e0b' },
  { id: 'cat_entertainment', name: 'Entertainment', icon: 'clapperboard', isDefault: true, typeHint: 'expense', color: '#8b5cf6' },
  { id: 'cat_freelance', name: 'Freelance', icon: 'laptop', isDefault: true, typeHint: 'income', color: '#6366f1' },
  { id: 'cat_groceries', name: 'Groceries', icon: 'shopping-cart', isDefault: true, typeHint: 'expense', color: '#10b981' },
  { id: 'cat_health', name: 'Health', icon: 'hospital', isDefault: true, typeHint: 'expense', color: '#ef4444' },
  { id: 'cat_investments', name: 'Investments', icon: 'trending-up', isDefault: true, typeHint: 'income', color: '#00c9a7' },
  { id: 'cat_other', name: 'Other', icon: 'package', isDefault: true, typeHint: 'both', color: '#64748b' },
  { id: 'cat_rent', name: 'Rent', icon: 'home', isDefault: true, typeHint: 'expense', color: '#3b82f6' },
  { id: 'cat_salary', name: 'Salary', icon: 'wallet', isDefault: true, typeHint: 'income', color: '#10b981' },
  { id: 'cat_shopping', name: 'Shopping', icon: 'shopping-bag', isDefault: true, typeHint: 'expense', color: '#ec4899' },
  { id: 'cat_transport', name: 'Transport', icon: 'car', isDefault: true, typeHint: 'expense', color: '#06b6d4' },
  { id: 'cat_utilities', name: 'Utilities', icon: 'zap', isDefault: true, typeHint: 'expense', color: '#eab308' }
];

window.Store = {
  ACCOUNT_COLORS: [
    '#E60023', // 01 Monster Red
    '#FF9500', // 02 Pure Orange
    '#FFD600', // 03 Neon Gold
    '#32D74B', // 04 High-Vis Lime
    '#248A3D', // 05 TR Green
    '#00C9A7', // 06 Deep Mint
    '#00B3FF', // 07 Sky Blue
    '#0075EB', // 08 Revolut Blue
    '#1326FD', // 09 Electric Blue
    '#7B61FF', // 10 Royal Purple
    '#CC00FF', // 11 Magenta Pop
    '#FF2D55', // 12 Shocking Pink
    '#374151', // 13 Graphite
    '#161618', // 14 Obsidian Black
  ],
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
    activeTagFilter: '', // Will hold selected tag
    language: 'en',
    historySortOrder: 'desc', // 'asc' or 'desc'
    defaultAccountId: '', // v0.53



    // Page-specific Filters (v0.55)
    historyFilters: {
      period: { type: 'month', value: '', start: '', end: '' },
      types: [],
      accounts: [],
      categories: [],
      sortOrder: 'asc'  // Default: Oldest First
    },
    analyticsFilters: {
      period: { type: 'month', value: '', start: '', end: '' },
      types: [],
      accounts: [],
      categories: [],
      sortOrder: 'desc'
    },
    expandedGraphFilters: {
      interval: 'monthly', // 'weekly', 'monthly', 'quarter'
      accounts: [],
      categories: []
    },

    // ── Debt Simulator ──────────────────────────────────────────────────────
    // Each loan profile shape:
    // {
    //   id: string,                  -- UUID
    //   name: string,                -- e.g. 'Car Loan'
    //   amount: number,              -- Principal base amount
    //   tan: number,                 -- Annual interest rate in %
    //   durationMonths: number,      -- Total number of monthly instalments
    //   startDate: string,           -- 'YYYY-MM-DD'
    //   endDate: string,             -- Computed: startDate + durationMonths
    //   monthlyPayment: number,      -- PMT result
    //   totalReimbursement: number,  -- monthlyPayment × durationMonths
    //   createdAt: string,
    //   updatedAt: string|null
    // }
    loans: [],

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
    this.state.historySortOrder = window.StackdDB.load('historySortOrder', 'desc');
    this.state.defaultAccountId = window.StackdDB.load('defaultAccountId', '');
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
      // 1. Color Migration
      if (!acc.color || !this.ACCOUNT_COLORS.includes(acc.color)) {
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
    const V059_ICON_REMAP = {
      'clover': 'leaf',          // 'clover' removed from main set; leaf is the closest equivalent
      'building': 'hospital',    // 'building' moved to health context
      'pin': 'map-pin',          // Prefer map-pin for location/misc pins
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

  compareAlpha(a, b) {
    return (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base', numeric: true });
  },

  _sortTransactions() {
    const isAsc = this.state.historySortOrder === 'asc';
    this.state.transactions.sort((a, b) => {
      if (a.date !== b.date) {
        const diff = new Date(a.date) - new Date(b.date);
        return isAsc ? diff : -diff;
      }
      const diff = new Date(a.createdAt) - new Date(b.createdAt);
      return isAsc ? diff : -diff;
    });
  },

  _calculateNextRecurrenceDate(baseDateStr, interval, freq) {
    const d = new Date(baseDateStr);
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
    
    return d.toISOString().split('T')[0];
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
          const nextD = gen.recurrence.nextDate;
          const nextNextD = this._calculateNextRecurrenceDate(nextD, gen.recurrence.interval, gen.recurrence.frequency);
          
          // Create new generated transaction
          const generatedTx = {
             ...gen,
             id: window.StackdDB.generateId(),
             date: nextD,
             createdAt: new Date().toISOString(),
             tags: gen.recurrence.propagateTags === false ? [] : (gen.tags ? [...gen.tags] : []),
             recurrence: {
                ...gen.recurrence,
                nextDate: nextNextD
             }
          };
          
          // If transfer, handle ref regenerations
          if (generatedTx.transferRef) {
             generatedTx.transferRef = window.StackdDB.generateId();
             // Find counterpart and duplicate it
             const cp = this.state.transactions.find(t => t.transferRef === gen.transferRef && t.id !== gen.id);
             if (cp) {
                const cpGen = {
                   ...cp,
                   id: window.StackdDB.generateId(),
                   date: nextD,
                   createdAt: new Date().toISOString(),
                   transferRef: generatedTx.transferRef,
                   tags: (cp.recurrence && cp.recurrence.propagateTags === false) ? [] : (cp.tags ? [...cp.tags] : []),
                   recurrence: {
                      ...cp.recurrence, // cp should also carry the recurrence info since we attach it to both!
                      nextDate: nextNextD
                   }
                };
                this.state.transactions.push(cpGen);
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
      const fmt = (d) => new Date(d + 'T00:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
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
        return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
      
      case 'week':
        if (today >= startDt && today <= endDt) return 'This Week';
        return `${startDt.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} – ${endDt.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`;
 
      case 'month':
        if (today.getFullYear() === d.getFullYear() && today.getMonth() === d.getMonth()) return 'This Month';
        return d.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
 
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

  getFilteredTransactions(pageKey) {
    const filters = pageKey === 'history' ? this.state.historyFilters : this.state.analyticsFilters;
    const { period, types, accounts, categories, sortOrder } = filters;
    
    return this.state.transactions.filter(tx => {
      if (pageKey === 'analytics') {
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
      return matchPeriod && matchType && matchAccount && matchCategory;
    }).sort((a, b) => {
      const dir = sortOrder === 'asc' ? 1 : -1;
      if (a.date !== b.date) {
        return dir * (a.date.localeCompare(b.date));
      }
      return dir * (b.id.localeCompare(a.id));
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
        // Auto-create opening balance transaction if provided
        const obAmount = parseFloat(payload.openingBalance) || 0;
        if (obAmount !== 0) {
          this.state.transactions.push({
            id: window.StackdDB.generateId(),
            type: 'opening_balance',
            amount: obAmount,
            accountId: newAccount.id,
            categoryId: 'cat_balance',
            date: payload.openingDate || newAccount.createdAt.split('T')[0],
            comment: 'Opening Balance',
            createdAt: new Date().toISOString()
          });
          window.StackdDB.save('transactions', this.state.transactions);
        }
        if (this.state.accounts.length === 1 && !this.state.defaultAccountId) {
          this.state.defaultAccountId = newAccount.id;
          localStorage.setItem('stackd_v1_defaultAccountId', newAccount.id);
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
          if (payload.openingBalance !== undefined) {
            const newObAmt = parseFloat(payload.openingBalance) || 0;
            const newDate = payload.openingDate || this.state.accounts[accountIndex].createdAt.split('T')[0];
            const existingObIdx = this.state.transactions.findIndex(
              t => t.accountId === payload.id && t.type === 'opening_balance'
            );
            if (existingObIdx !== -1) {
              if (newObAmt === 0) {
                this.state.transactions.splice(existingObIdx, 1);
              } else {
                this.state.transactions[existingObIdx].amount = newObAmt;
                this.state.transactions[existingObIdx].date = newDate;
              }
            } else if (newObAmt !== 0) {
              this.state.transactions.push({
                id: window.StackdDB.generateId(),
                type: 'opening_balance',
                amount: newObAmt,
                accountId: payload.id,
                categoryId: 'cat_balance',
                date: newDate,
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
        if (payload.recurrence && payload.recurrence.enabled) {
          // ── Global 60-month cap ─────────────────────────────────────────────
          if (payload.recurrence.startDate && payload.recurrence.endDate) {
            const capStart = new Date(payload.recurrence.startDate + 'T00:00:00');
            const capEnd   = new Date(payload.recurrence.endDate   + 'T00:00:00');
            const capMonths = (capEnd.getFullYear() - capStart.getFullYear()) * 12
                            + (capEnd.getMonth()   - capStart.getMonth());
            if (capMonths > 60) {
              const clampedEnd = new Date(capStart);
              clampedEnd.setMonth(clampedEnd.getMonth() + 60);
              payload.recurrence.endDate = clampedEnd.toISOString().split('T')[0];
            }
          }
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
          tags: tagsArray,
          createdAt: new Date().toISOString()
        };
        this.state.transactions.push(newTransaction);
        this._sortTransactions();
        window.StackdDB.save('transactions', this.state.transactions);
        this._processRecurringTransactions();
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

        if (existingTx.transferRef) {
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

        // Update the target transaction
        this.state.transactions[index] = { 
          ...existingTx, 
          ...updatePayload, 
          tags: (updatePayload.tags !== undefined) ? updatePayload.tags : (existingTx.tags || []), 
          updatedAt: new Date().toISOString() 
        };
        
        // If updating future, find all transactions with the same seriesId and date >= this transaction's original date
        if (payload.updateFuture || payload.updateAll) {
           const seriesId = (payload.recurrence && payload.recurrence.seriesId) || (existingTx.recurrence && existingTx.recurrence.seriesId);
           if (seriesId) {
             const baseDate = existingTx.date;

             if (payload.regenerateSeries) {
                // Remove all future transactions in this series to start fresh
                this.state.transactions = this.state.transactions.filter(t => {
                   const isFutureInSeries = t.recurrence && t.recurrence.seriesId === seriesId && t.id !== existingTx.id && t.date >= baseDate;
                   return !isFutureInSeries;
                });
                // Ensure the current transaction (which is now the new 'head') has the nextDate set
                const updatedTx = this.state.transactions.find(t => t.id === payload.id);
                if (updatedTx && updatedTx.recurrence && updatedTx.recurrence.enabled) {
                   updatedTx.recurrence.nextDate = this._calculateNextRecurrenceDate(updatedTx.date, updatedTx.recurrence.interval, updatedTx.recurrence.frequency);
                }
             } else {
                this.state.transactions.forEach((t, i) => {
                  let isTarget = false;
                  if (payload.updateAll) {
                    isTarget = (t.recurrence && t.recurrence.seriesId === seriesId && t.id !== existingTx.id);
                  } else if (payload.updateFuture) {
                    isTarget = (t.recurrence && t.recurrence.seriesId === seriesId && t.id !== existingTx.id && t.date >= baseDate);
                  }

                  if (isTarget) {
                    const tUpdate = { ...updatePayload };
                    // Do not overwrite nextDate if 't' corresponds to the active generator!
                    if (t.recurrence && t.recurrence.nextDate) {
                        tUpdate.recurrence = { ...tUpdate.recurrence, nextDate: t.recurrence.nextDate };
                    } else if (tUpdate.recurrence) {
                        delete tUpdate.recurrence.nextDate;
                    }
                    delete tUpdate.id; // ensure ID is not overwritten
                    
                    this.state.transactions[i] = { ...t, ...tUpdate, updatedAt: new Date().toISOString() };
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

      case 'ADD_TRANSFER': {
        const transferRef = window.StackdDB.generateId();
        const tagsArray = Array.isArray(payload.tags) ? payload.tags.map(t => t.toLowerCase()) : [];

        // Handle recurrence initialization
        if (payload.recurrence && payload.recurrence.enabled) {
          // ── Global 60-month cap ─────────────────────────────────────────────
          if (payload.recurrence.startDate && payload.recurrence.endDate) {
            const capStart = new Date(payload.recurrence.startDate + 'T00:00:00');
            const capEnd   = new Date(payload.recurrence.endDate   + 'T00:00:00');
            const capMonths = (capEnd.getFullYear() - capStart.getFullYear()) * 12
                            + (capEnd.getMonth()   - capStart.getMonth());
            if (capMonths > 60) {
              const clampedEnd = new Date(capStart);
              clampedEnd.setMonth(clampedEnd.getMonth() + 60);
              payload.recurrence.endDate = clampedEnd.toISOString().split('T')[0];
            }
          }
          if (!payload.recurrence.seriesId) {
            payload.recurrence.seriesId = window.StackdDB.generateId();
          }
          if (!payload.recurrence.nextDate) {
            payload.recurrence.nextDate = this._calculateNextRecurrenceDate(payload.date, payload.recurrence.interval, payload.recurrence.frequency);
          }
        }

        // Expense side (From)
        this.state.transactions.push({
          id: window.StackdDB.generateId(),
          type: 'expense',
          amount: Math.abs(payload.amount),
          accountId: payload.expenseAccountId,
          categoryId: '', // Transfers don't have a category
          date: payload.date,
          comment: payload.note,
          transferRef: transferRef,
          tags: tagsArray,
          recurrence: payload.recurrence,
          createdAt: new Date().toISOString()
        });

        // Income side (To)
        this.state.transactions.push({
          id: window.StackdDB.generateId(),
          type: 'income',
          amount: Math.abs(payload.amount),
          accountId: payload.incomeAccountId,
          categoryId: '',
          date: payload.date,
          comment: payload.note,
          transferRef: transferRef,
          tags: tagsArray,
          recurrence: payload.recurrence,
          createdAt: new Date().toISOString()
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
        const updatePayload = { ...payload };
        delete updatePayload.updateFuture;

        const items = this.state.transactions.filter(t => t.transferRef === payload.transferRef);
        let baseDate = null;
        let seriesId = null;
        const tagsArray = Array.isArray(payload.tags) ? payload.tags.map(t => t.toLowerCase()) : undefined;
        
        items.forEach(item => {
           if (!baseDate) baseDate = item.date;
           if (!seriesId && item.recurrence && item.recurrence.seriesId) seriesId = item.recurrence.seriesId;

           if (item.type === 'expense') {
              if (payload.amount !== undefined) item.amount = Math.abs(payload.amount);
              if (payload.expenseAccountId !== undefined) item.accountId = payload.expenseAccountId;
              if (payload.date !== undefined) item.date = payload.date;
              if (payload.note !== undefined) item.comment = payload.note;
              if (payload.recurrence !== undefined) item.recurrence = payload.recurrence;
              if (tagsArray !== undefined) item.tags = tagsArray;
              item.updatedAt = new Date().toISOString();
           } else if (item.type === 'income') {
              if (payload.amount !== undefined) item.amount = Math.abs(payload.amount);
              if (payload.incomeAccountId !== undefined) item.accountId = payload.incomeAccountId;
              if (payload.date !== undefined) item.date = payload.date;
              if (payload.note !== undefined) item.comment = payload.note; 
              if (payload.recurrence !== undefined) item.recurrence = payload.recurrence;
              if (tagsArray !== undefined) item.tags = tagsArray;
              item.updatedAt = new Date().toISOString();
           }
           const idx = this.state.transactions.findIndex(t => t.id === item.id);
           this.state.transactions[idx] = { ...item };
        });

        // Handle updateFuture or updateAll for Transfers
        if ((payload.updateFuture || payload.updateAll) && seriesId && baseDate) {
           this.state.transactions.forEach((t, i) => {
              const isTarget = payload.updateAll 
                ? (t.recurrence && t.recurrence.seriesId === seriesId && t.transferRef !== payload.transferRef)
                : (t.recurrence && t.recurrence.seriesId === seriesId && t.transferRef !== payload.transferRef && t.date >= baseDate);

              if (isTarget) {
                 if (t.type === 'expense') {
                    if (payload.amount !== undefined) t.amount = Math.abs(payload.amount);
                    if (payload.expenseAccountId !== undefined) t.accountId = payload.expenseAccountId;
                    if (payload.note !== undefined) t.comment = payload.note;
                    if (payload.tags !== undefined) t.tags = payload.tags.map(tag => tag.toLowerCase());
                    t.recurrence = { ...payload.recurrence, nextDate: t.recurrence.nextDate }; // Preserve nextDate
                    t.updatedAt = new Date().toISOString();
                 } else if (t.type === 'income') {
                    if (payload.amount !== undefined) t.amount = Math.abs(payload.amount);
                    if (payload.incomeAccountId !== undefined) t.accountId = payload.incomeAccountId;
                    if (payload.note !== undefined) t.comment = payload.note; 
                    if (payload.tags !== undefined) t.tags = payload.tags.map(tag => tag.toLowerCase());
                    t.recurrence = { ...payload.recurrence, nextDate: t.recurrence.nextDate };
                    t.updatedAt = new Date().toISOString();
                 }
                 this.state.transactions[i] = t;
              }
           });
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

      case 'BATCH_IMPORT_TRANSACTIONS': {
        const newTxs = payload.transactions.map(t => ({
          id: window.StackdDB.generateId(),
          ...t,
          createdAt: new Date().toISOString()
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
          changed = true;
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



      case 'RESET_APP': {
        window.StackdDB.save('accounts', []);
        window.StackdDB.save('categories', [...DEFAULT_CATEGORIES]);
        window.StackdDB.save('transactions', []);
        window.StackdDB.save('budgets', []);
        window.StackdDB.save('loans', []);
        // Clear the first-launch flag so the region setup modal shows again
        localStorage.removeItem('stackd_v1_setup_done');
        this.state.loans = [];
        // App will force reload by the caller, so we don't even need to emit strictly
        break;
      }

      // ── Debt Simulator CRUD ───────────────────────────────────────────────

      case 'ADD_LOAN': {
        // payload: { name, amount, tan, durationMonths, startDate, endDate, monthlyPayment, totalReimbursement }
        const newLoan = {
          id: window.StackdDB.generateId(),
          name: payload.name || 'My Loan',
          amount: payload.amount,
          tan: payload.tan,
          durationMonths: payload.durationMonths,
          startDate: payload.startDate,
          endDate: payload.endDate,
          monthlyPayment: payload.monthlyPayment,
          totalReimbursement: payload.totalReimbursement,
          createdAt: new Date().toISOString(),
          updatedAt: null
        };
        this.state.loans.push(newLoan);
        window.StackdDB.save('loans', this.state.loans);
        changed = true;
        break;
      }

      case 'UPDATE_LOAN': {
        // payload: { id, ...fieldsToUpdate }
        const lIdx = this.state.loans.findIndex(l => l.id === payload.id);
        if (lIdx !== -1) {
          this.state.loans[lIdx] = {
            ...this.state.loans[lIdx],
            ...payload,
            updatedAt: new Date().toISOString()
          };
          window.StackdDB.save('loans', this.state.loans);
          changed = true;
        }
        break;
      }

      case 'DELETE_LOAN': {
        // payload: { id }
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

      case 'SET_TAG_FILTER':
        this.state.activeTagFilter = payload || '';
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
      formatted = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(abs);
    } else {
      formatted = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(abs);
    }
    return `${isNeg ? '-' : ''}${symbol}${formatted}`;
  },

  _isPositiveTx(tx) {
    return tx.type === 'income' || tx.type === 'opening_balance' || tx.type === 'transfer_in';
  },

  getAccountBalance(accountId) {
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    return this.state.transactions
      .filter(t => t.accountId === accountId && t.date <= today)
      .reduce((sum, tx) => this._isPositiveTx(tx) ? sum + tx.amount : sum - tx.amount, 0);
  },

  getGlobalBalance() {
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    return this.getBalanceAtDate(today);
  },

  getBalanceAtDate(date, accountIds = [], categoryIds = []) {
    return this.state.transactions
      .filter(t => t.date <= date &&
        (accountIds.length === 0 || accountIds.includes(t.accountId)) &&
        (categoryIds.length === 0 || !t.categoryId || categoryIds.includes(t.categoryId))
      )
      .reduce((sum, tx) => this._isPositiveTx(tx) ? sum + tx.amount : sum - tx.amount, 0);
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
        monthLabels.push(d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' }));
      }

      const points = [];
      for (let i = 51; i >= 0; i--) {
        const weekIdx = 51 - i;
        const x = weekIdx * (11 / 51);
        const d = new Date(now);
        d.setDate(d.getDate() - (i * 7));
        const cutoffStr = fmt(d);
        const fullLabel = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
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
        const lbl = d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
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

    // Shared baseline: balance as of last day of previous month (= start of current month, before any this-month transactions)
    const startOfMonthBaseline = fmt(new Date(now.getFullYear(), now.getMonth(), 0));

    // As of today
    const today = fmt(now);

    // As of EOM: last day of current month (includes actual + scheduled future recurring transactions already generated)
    const eom = fmt(new Date(now.getFullYear(), now.getMonth() + 1, 0));

    const balanceBaseline    = this.getBalanceAtDate(startOfMonthBaseline, accountIds);
    const balanceToday       = this.getBalanceAtDate(today, accountIds);
    const balanceEOM         = this.getBalanceAtDate(eom, accountIds);

    // Returns null when baseline is 0 (new user with no prior history) to avoid misleading numbers
    const calculatePct = (curr, prev) => {
      if (prev === 0) return null;
      return ((curr - prev) / Math.abs(prev)) * 100;
    };

    return {
      todayVariation: calculatePct(balanceToday, balanceBaseline),
      eomVariation:   calculatePct(balanceEOM,   balanceBaseline)
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
        label: d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' })
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
        label: d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }) // 'March 2026'
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

  computeNetFlowData(filters) {
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
          label: d.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric' }),
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
          label: start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
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
          label: d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' }),
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
      const txs = this.state.transactions.filter(t => {
        if (t.type !== 'expense' && t.type !== 'income') return false;
        if (t.transferRef) return false; // Exclude linked transfers
        if (t.categoryId === 'cat_balance') return false; // Exclude adjustments
        
        const matchDate = t.date >= b.start && t.date <= b.end;
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
    const txs = this.getFilteredTransactions('analytics');
    const income = txs
      .filter(t => this._isPositiveTx(t))
      .reduce((sum, t) => sum + t.amount, 0);
    const expense = txs
      .filter(t => t.type === 'expense')
      .reduce((sum, t) => sum + t.amount, 0);
    
    return { income, expense, net: income - expense };
  },

  computeCategoryDistribution(filters, distributionType) {
    const transactions = this.getFilteredTransactions('analytics');
    
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

  getMaxTransactionDate() {
    if (this.state.transactions.length === 0) return null;
    const sorted = [...this.state.transactions].sort((a, b) => b.date.localeCompare(a.date));
    return sorted[0].date;
  },

  /**
   * Computes the remaining base principal for a loan using a straight-line method.
   * Deduction is based purely on calendar time vs. start date.
   * The month is considered elapsed once today's day-of-month >= loan start day-of-month.
   *
   * @param {Object} loan - Loan profile from state.loans
   * @returns {number} Remaining balance (>= 0)
   */
  computeLoanRemainingBalance(loan) {
    const today = new Date();
    const start = new Date(loan.startDate + 'T00:00:00');
    let months = (today.getFullYear() - start.getFullYear()) * 12
               + (today.getMonth() - start.getMonth());
    // Only count a month as elapsed once we've passed the day-of-month
    if (today.getDate() < start.getDate()) months -= 1;
    months = Math.max(0, Math.min(months, loan.durationMonths));
    const remaining = loan.amount - (months * (loan.amount / loan.durationMonths));
    return Math.max(0, remaining);
  }
};


