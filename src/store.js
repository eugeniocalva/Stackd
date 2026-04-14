// store.js - Pub/Sub State Manager
const DEFAULT_CATEGORIES = [
  { id: 'cat_balance', name: 'Adjustment', icon: '⚖️', isDefault: true, typeHint: 'both' },
  { id: 'cat_dining', name: 'Dining Out', icon: '🍽️', isDefault: true, typeHint: 'expense' },
  { id: 'cat_entertainment', name: 'Entertainment', icon: '🎬', isDefault: true, typeHint: 'expense' },
  { id: 'cat_freelance', name: 'Freelance', icon: '💻', isDefault: true, typeHint: 'income' },
  { id: 'cat_groceries', name: 'Groceries', icon: '🛒', isDefault: true, typeHint: 'expense' },
  { id: 'cat_health', name: 'Health', icon: '🏥', isDefault: true, typeHint: 'expense' },
  { id: 'cat_investments', name: 'Investments', icon: '📈', isDefault: true, typeHint: 'income' },
  { id: 'cat_other', name: 'Other', icon: '📦', isDefault: true, typeHint: 'both' },
  { id: 'cat_rent', name: 'Rent', icon: '🏠', isDefault: true, typeHint: 'expense' },
  { id: 'cat_salary', name: 'Salary', icon: '💰', isDefault: true, typeHint: 'income' },
  { id: 'cat_shopping', name: 'Shopping', icon: '🛍️', isDefault: true, typeHint: 'expense' },
  { id: 'cat_transport', name: 'Transport', icon: '🚗', isDefault: true, typeHint: 'expense' },
  { id: 'cat_utilities', name: 'Utilities', icon: '💡', isDefault: true, typeHint: 'expense' }
];

const ACCOUNT_COLORS = [
  '#0075EB', // Electric Blue (Revolut)
  '#00C9A7', // Mint Green
  '#7B61FF', // Indigo/Purple
  '#FF5C5C', // Coral Red
  '#FFB800', // Amber
  '#14B8A6', // Teal
  '#F97316', // Orange
  '#8B5CF6', // Violet
];

window.Store = {
  state: {
    accounts: [],
    categories: [],
    transactions: [],
    budgets: [],
    currency: 'USD',
    activeView: 'dashboard',
    activeAccountFilter: '',
    activeMonthFilter: '', // Will hold 'YYYY-MM'
    activeTagFilter: '', // Will hold selected tag
    language: 'en',
    historySortOrder: 'desc', // 'asc' or 'desc'
    initialized: false
  },

  listeners: [],

  init() {
    this.state.accounts = window.StackdDB.load('accounts', []);
    this.state.categories = window.StackdDB.load('categories', []);
    this.state.transactions = window.StackdDB.load('transactions', []);
    this.state.budgets = window.StackdDB.load('budgets', []);
    this.state.currency = window.StackdDB.load('currency', 'USD');
    this.state.language = window.StackdDB.load('language', 'en');
    this.state.historySortOrder = window.StackdDB.load('historySortOrder', 'desc');

    if (this.state.categories.length === 0) {
      this.state.categories = [...DEFAULT_CATEGORIES];
      window.StackdDB.save('categories', this.state.categories);
    }

    let accountsChanged = false;
    // Map of old hex codes to new modern colors is not strictly needed: we can just check 
    // if the color is NOT in the new ACCOUNT_COLORS array, and if so, map it via index.
    this.state.accounts.forEach((acc, index) => {
      if (!acc.color || !ACCOUNT_COLORS.includes(acc.color)) {
        acc.color = ACCOUNT_COLORS[index % ACCOUNT_COLORS.length];
        accountsChanged = true;
      }
    });
    if (accountsChanged) {
      window.StackdDB.save('accounts', this.state.accounts);
    }

    // Initialize month filter to current month
    const today = new Date();
    this.state.activeMonthFilter = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
    
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

    this._processRecurringTransactions();

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
          id: window.StackdDB.generateId(),
          name: payload.name,
          color: ACCOUNT_COLORS[existingCount % ACCOUNT_COLORS.length],
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
            amount: Math.abs(obAmount),
            accountId: newAccount.id,
            categoryId: 'cat_balance',
            date: payload.openingDate || newAccount.createdAt.split('T')[0],
            comment: 'Opening Balance',
            createdAt: new Date().toISOString()
          });
          window.StackdDB.save('transactions', this.state.transactions);
        }
        changed = true;
        break;
      }

      case 'UPDATE_ACCOUNT': {
        const accountIndex = this.state.accounts.findIndex(a => a.id === payload.id);
        if (accountIndex !== -1) {
          this.state.accounts[accountIndex].name = payload.name;
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
                this.state.transactions[existingObIdx].amount = Math.abs(newObAmt);
                this.state.transactions[existingObIdx].date = newDate;
              }
            } else if (newObAmt !== 0) {
              this.state.transactions.push({
                id: window.StackdDB.generateId(),
                type: 'opening_balance',
                amount: Math.abs(newObAmt),
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
        delete updatePayload.updateFuture; // Do not store flag

        // Update the target transaction
        this.state.transactions[index] = { ...existingTx, ...updatePayload, tags: updatePayload.tags || existingTx.tags || [], updatedAt: new Date().toISOString() };
        
        // If updating future, find all transactions with the same seriesId and date >= this transaction's original date
        if (payload.updateFuture) {
           const seriesId = payload.recurrence?.seriesId || existingTx.recurrence?.seriesId;
           if (seriesId) {
             const baseDate = existingTx.date;
             this.state.transactions.forEach((t, i) => {
               if (t.recurrence?.seriesId === seriesId && t.id !== existingTx.id && t.date >= baseDate) {
                 const tUpdate = { ...updatePayload };
                 // Do not overwrite nextDate if 't' corresponds to the active generator!
                 if (t.recurrence?.nextDate) {
                    tUpdate.recurrence = { ...tUpdate.recurrence, nextDate: t.recurrence.nextDate };
                 } else {
                    delete tUpdate.recurrence?.nextDate;
                 }
                 delete tUpdate.id; // ensure ID is not overwritten
                 
                 this.state.transactions[i] = { ...t, ...tUpdate, updatedAt: new Date().toISOString() };
               }
             });
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
           if (!seriesId && item.recurrence?.seriesId) seriesId = item.recurrence.seriesId;

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

        // Handle updateFuture for Transfers
        if (payload.updateFuture && seriesId && baseDate) {
           this.state.transactions.forEach((t, i) => {
              if (t.recurrence?.seriesId === seriesId && t.transferRef !== payload.transferRef && t.date >= baseDate) {
                 if (t.type === 'expense') {
                    if (payload.amount !== undefined) t.amount = Math.abs(payload.amount);
                    if (payload.expenseAccountId !== undefined) t.accountId = payload.expenseAccountId;
                    if (payload.note !== undefined) t.comment = payload.note;
                    t.recurrence = { ...payload.recurrence, nextDate: t.recurrence.nextDate }; // Preserve nextDate
                    t.updatedAt = new Date().toISOString();
                 } else if (t.type === 'income') {
                    if (payload.amount !== undefined) t.amount = Math.abs(payload.amount);
                    if (payload.incomeAccountId !== undefined) t.accountId = payload.incomeAccountId;
                    if (payload.note !== undefined) t.comment = payload.note; 
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
          if (t.recurrence?.seriesId === allSeriesId) {
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

      case 'DELETE_TRANSACTION': {
        const txToDelete = this.state.transactions.find(t => t.id === payload.id);
        if (!txToDelete) break;

        let idsToDelete = new Set([txToDelete.id]);
        if (txToDelete.transferRef) {
          this.state.transactions.forEach(t => {
            if (t.transferRef === txToDelete.transferRef) idsToDelete.add(t.id);
          });
        }

        if (payload.deleteAll && txToDelete.recurrence?.seriesId) {
           this.state.transactions.forEach(t => {
              if (t.recurrence?.seriesId === txToDelete.recurrence.seriesId) {
                 idsToDelete.add(t.id);
                 if (t.transferRef) {
                    this.state.transactions.forEach(tc => {
                       if (tc.transferRef === t.transferRef) idsToDelete.add(tc.id);
                    });
                 }
              }
           });
        } else if (payload.deleteFuture && txToDelete.recurrence?.seriesId) {
           this.state.transactions.forEach(t => {
              if (t.recurrence?.seriesId === txToDelete.recurrence.seriesId && t.date >= txToDelete.date) {
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
          icon: payload.icon || '📌',
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
        // App will force reload by the caller, so we don't even need to emit strictly
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

      case 'SET_MONTH_FILTER':
        // Expected payload format: 'YYYY-MM'
        this.state.activeMonthFilter = payload;
        changed = true;
        break;

      case 'SET_TAG_FILTER':
        this.state.activeTagFilter = payload || '';
        changed = true;
        break;

      case 'SET_HISTORY_SORT_ORDER':
        this.state.historySortOrder = payload;
        window.StackdDB.save('historySortOrder', payload);
        this._sortTransactions();
        changed = true;
        break;
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
    const abs = Math.abs(amount);
    let formatted;
    if (this.state.currency === 'JPY' || this.state.currency === 'CNY') {
      // No decimal places for Yen / Renminbi
      formatted = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(abs);
    } else {
      formatted = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(abs);
    }
    return `${symbol}${formatted}`;
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
    return this.state.transactions
      .filter(t => t.date <= today)
      .reduce((sum, tx) => this._isPositiveTx(tx) ? sum + tx.amount : sum - tx.amount, 0);
  },

  compute12MonthBalances() {
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
      const cutoff = new Date(m.year, m.month + 1, 0, 23, 59, 59);
      const cutoffStr = `${cutoff.getFullYear()}-${String(cutoff.getMonth() + 1).padStart(2, '0')}-${String(cutoff.getDate()).padStart(2, '0')}`;
      const balance = this.state.transactions
        .filter(t => t.date <= cutoffStr && t.date <= todayStr)
        .reduce((sum, tx) => this._isPositiveTx(tx) ? sum + tx.amount : sum - tx.amount, 0);
      return { label: m.label, balance };
    });
  },

  computeAccount12MonthBalances(accountId) {
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
      const cutoff = new Date(m.year, m.month + 1, 0, 23, 59, 59);
      const cutoffStr = `${cutoff.getFullYear()}-${String(cutoff.getMonth() + 1).padStart(2, '0')}-${String(cutoff.getDate()).padStart(2, '0')}`;
      const balance = this.state.transactions
        .filter(t => t.accountId === accountId && t.date <= cutoffStr && t.date <= todayStr)
        .reduce((sum, tx) => this._isPositiveTx(tx) ? sum + tx.amount : sum - tx.amount, 0);
      return { label: m.label, balance };
    });
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
  }
};



