// export.js - CSV & PDF Export Utilities
window.StackdExport = {
  _busy: false, // 1.0.2 (BUG-37): a native share sheet is open
  _sink: null, // 1.2.0 (UX-11): (filename, content) => void — collects instead of delivering

  _download(filename, content, type = 'text/csv;charset=utf-8;', opts = {}) {
    // 1.0.2 (BUG-37): Android's WebView has no DownloadListener and iOS's no
    // download delegate, so the <a download> below was silently dropped in the
    // native apps. There the file goes through the system share sheet (Save to
    // Files / Drive / mail). Returns a Promise of whether the file went out.
    // 1.1.0 (IE-1): opts.bom === false leaves the UTF-8 BOM out (the ledger
    // export's "Add BOM for Excel" setting); every backup keeps it.
    // 1.2.0 (UX-11): while a sink is set the file is handed to it instead
    // (the raw text, no BOM) \u2014 the backup bundle collects the six backup
    // exporters' texts through it without a download or a share sheet.
    if (typeof this._sink === 'function') {
      this._sink(filename, content, type);
      return Promise.resolve(true);
    }
    const text = (opts.bom === false ? '' : '\uFEFF') + content;
    const cap = window.Capacitor;
    if (cap && typeof cap.isNativePlatform === 'function' && cap.isNativePlatform()) {
      return this._shareNative(filename, text);
    }
    const blob = new Blob([text], { type });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return Promise.resolve(true);
  },

  // 1.0.2 (BUG-37): the CSV (with its BOM) is written to the app cache \u2014
  // covered by the existing FileProvider \u2014 and handed to @capacitor/share
  // through the native plugin proxies (no JS wrapper is bundled, as in
  // db.js). A cancel is silent; any other failure, including a build that
  // lacks the Share plugin, shows a sheet instead of doing nothing.
  // 1.2.0 (UX-10): `text` may also be { base64 } — a binary file (the
  // receipts PDF), written WITHOUT an encoding (the plugin's binary contract).
  async _shareNative(filename, text) {
    if (this._busy) return false; // a second tap while the sheet is up
    this._busy = true;
    try {
      const P = (window.Capacitor && window.Capacitor.Plugins) || {};
      if (!P.Filesystem || !P.Share) throw new Error('export plugins unavailable');
      const binary = !!text && typeof text === 'object' && typeof text.base64 === 'string';
      const written = await P.Filesystem.writeFile(binary ? {
        path: 'exports/' + filename,
        data: text.base64,
        directory: 'CACHE',
        recursive: true
      } : {
        path: 'exports/' + filename,
        data: text,
        directory: 'CACHE',
        encoding: 'utf8',
        recursive: true
      });
      if (!written || !written.uri) throw new Error('export file not written');
      await P.Share.share({
        title: filename,
        files: [written.uri],
        // Android's chooser title is otherwise a hard-coded English 'Share'
        dialogTitle: window.I18n.t('export.shareTitle', { file: filename })
      });
      return true;
    } catch (error) {
      if (/cancel/i.test(String((error && error.message) || error))) return false; // the user closed the sheet
      console.error('Export failed:', error);
      const C = window.Components;
      if (C && C.NoticeSheet) {
        C.NoticeSheet.show({
          id: 'export-result-modal',
          tone: 'error',
          title: window.I18n.t('export.failedTitle'),
          body: window.I18n.t('export.failedBody')
        });
      }
      return false;
    } finally {
      this._busy = false;
    }
  },

  _toRow(values, delimiter = ',') {
    return values.map(v => {
      const str = (v === null || v === undefined) ? '' : String(v);
      // 1.0.2 (BUG-33): a lone CR is a line break to a spreadsheet too.
      const needsQuotes = str.includes(delimiter) || str.includes('"') || str.includes('\n') || str.includes('\r');
      return needsQuotes ? `"${str.replace(/"/g, '""')}"` : str;
    }).join(delimiter);
  },

  _formatDate(dateStr, format) {
    if (!dateStr) return '';
    const parts = dateStr.split('-');
    if (parts.length !== 3) return dateStr;
    const [y, m, d] = parts;
    if (format === 'dd-mm-yyyy') return `${d}-${m}-${y}`;
    return dateStr; // default yyyy-mm-dd
  },

  // ── 1.1.0 (IE-4) the ledger export (docs/import-export-plan.md §5b) ────────
  // MoneyStats' 17 columns in the app's language: a file for Excel, Numbers,
  // Google Sheets or MoneyStats, read back by the ledger importer. Not a
  // backup: no times, repeats, ids, loans or budgets.
  LEDGER_COLS: ['account', 'date', 'amount', 'currency', 'balance', 'balanceCurrency', 'title', 'payee', 'purpose',
    'category', 'comment', 'tags', 'amount2', 'currency2', 'rate', 'status', 'brand'],

  // 'YYYY-MM-DD' in one of Store.EXPORT_DATE_FORMATS.
  _ledgerDate(ymd, pattern) {
    const [y, m, d] = String(ymd || '').split('-');
    if (!d) return ymd || '';
    return pattern.replace('yyyy', y).replace('MM', m).replace('dd', d);
  },

  // { text, lineCount, fileName, prefs }. opts: any export pref (format,
  // delimiter, dateFormat, decimal, quoteAll, bom) over the saved ones,
  // period {start, end} ('YYYY-MM-DD', inclusive; empty = all time),
  // includePlanned (rows after today; default true), now (a Date, for the
  // file name). The text carries no BOM (_download adds it per prefs.bom).
  buildLedger(state, opts = {}) {
    const Store = window.Store;
    const I = window.I18n;
    const prefs = Store.normalizeExportPrefs(Object.assign({}, Store.getExportPrefs(), opts));
    const txt = prefs.format === 'txt';
    const delim = txt ? '\t' : prefs.delimiter;
    const eol = txt ? '\n' : '\r\n';
    const today = Store._todayYMD();
    const start = (opts.period && opts.period.start) || '';
    const end = (opts.period && opts.period.end) || '';
    const planned = opts.includePlanned !== false;
    const inPeriod = (d) => (!start || d >= start) && (!end || d <= end);
    const accById = new Map(state.accounts.map(a => [a.id, a]));
    const catById = new Map(state.categories.map(c => [c.id, c]));
    const word = (k) => I.t('ledger.word.' + k);
    const ccyOf = (acc) => acc.currency || state.currency;
    const num = (n, digits) => {
      let s = Math.abs(n).toFixed(digits);
      const zero = Number(s) === 0;
      if (prefs.decimal === 'comma') s = s.replace('.', ',');
      return (n < 0 && !zero ? '-' : '') + s;
    };
    const money = (n, ccy) => num(n, Math.min(2, Store.currencyDigits(ccy)));
    const one = num(1, 2);
    const cell = (v) => {
      const s = String(v == null ? '' : v);
      if (prefs.quoteAll && !txt) return '"' + s.replace(/"/g, '""') + '"';
      return (s.includes(delim) || s.includes('"')) ? '"' + s.replace(/"/g, '""') + '"' : s;
    };
    const line = (vals) => vals.map(cell).join(delim);

    // Entries: ascending by date, time, creation; a transfer's two legs
    // together, the incoming one first.
    const ts = (t) => (t.date || '') + 'T' + (t.time || '') + '|' + (t.createdAt || '') + '|' + (t.id || '');
    const entries = state.transactions
      .filter(t => t.type !== 'opening_balance' && accById.has(t.accountId) && inPeriod(t.date) && (planned || t.date <= today))
      .sort((a, b) => (ts(a) < ts(b) ? -1 : ts(a) > ts(b) ? 1 : 0));
    const chosen = new Set(entries);
    const byRef = new Map();
    entries.forEach(t => { if (t.transferRef) { if (!byRef.has(t.transferRef)) byRef.set(t.transferRef, []); byRef.get(t.transferRef).push(t); } });
    const ordered = [];
    const done = new Set();
    entries.forEach(t => {
      if (done.has(t)) return;
      const legs = t.transferRef ? (byRef.get(t.transferRef) || [t]).filter(x => chosen.has(x)) : [t];
      legs.sort((a, b) => (a.type === 'income' ? 0 : 1) - (b.type === 'income' ? 0 : 1)).forEach(x => { if (!done.has(x)) { done.add(x); ordered.push(x); } });
    });

    const entryRow = (t) => {
      const acc = accById.get(t.accountId);
      const ccy = ccyOf(acc);
      const signed = t.type === 'expense' ? -Number(t.amount) : Number(t.amount);
      const cat = t.transferRef ? word('transfer') : ((t.categoryId && catById.get(t.categoryId)) ? catById.get(t.categoryId).name : '');
      let amt2 = signed;
      let ccy2 = ccy;
      let rate = one;
      const partner = t.transferRef ? (byRef.get(t.transferRef) || []).find(x => x !== t) ||
        state.transactions.find(x => x.transferRef === t.transferRef && x !== t) : null;
      if (partner && accById.has(partner.accountId) && ccyOf(accById.get(partner.accountId)) !== ccy) {
        ccy2 = ccyOf(accById.get(partner.accountId));
        amt2 = partner.type === 'expense' ? -Number(partner.amount) : Number(partner.amount);
        rate = num(Math.abs(amt2) / (Math.abs(signed) || 1), 4);
      }
      const note = String(t.comment || t.note || '').replace(/\s*[\r\n]+\s*/g, ' ').trim();
      return [acc.name, this._ledgerDate(t.date, prefs.dateFormat), money(signed, ccy), ccy, money(0, ccy), ccy, cat, '', '', cat,
        note, (Array.isArray(t.tags) ? t.tags : []).join(' | '), money(amt2, ccy2), ccy2, rate,
        word(t.isPaid === false ? 'unpaid' : 'paid'), ''];
    };
    const balanceRow = (acc, date, amount) => {
      const ccy = ccyOf(acc);
      return [acc.name, this._ledgerDate(date, prefs.dateFormat), money(0, ccy), ccy, money(amount, ccy), ccy, word('balance'),
        '', '', '', '', '', money(0, ccy), ccy, one, word('paid'), ''];
    };

    // Balance rows, one per account: its opening when the period holds it
    // (or when the file holds entries dated before it, so they stay
    // uncounted on re-import); otherwise, when the period starts later, the
    // counted balance the day before the period starts.
    const dayBefore = (ymd) => {
      const d = new Date(ymd + 'T12:00:00');
      d.setDate(d.getDate() - 1);
      return Store._localYMD(d);
    };
    const balances = [];
    state.accounts.forEach(acc => {
      const ob = state.transactions.find(t => t.accountId === acc.id && t.type === 'opening_balance');
      const mine = ordered.filter(t => t.accountId === acc.id);
      if (ob && (inPeriod(ob.date) || mine.some(t => t.date < ob.date))) {
        balances.push(balanceRow(acc, ob.date, Number(ob.amount)));
        return;
      }
      if (!start) return;
      const opened = ob ? ob.date < start
        : state.transactions.some(t => t.accountId === acc.id && t.date < start && t.isPaid !== false);
      if (!opened) return;
      const bal = Store.getBalanceAtDate(dayBefore(start), [acc.id]);
      if (!mine.length && Math.round(bal * 100) === 0) return;
      balances.push(balanceRow(acc, start, Math.round(bal * 100) / 100));
    });

    const header = this.LEDGER_COLS.map(k => I.t('ledger.col.' + k));
    const lines = [line(header)].concat(balances.map(line), ordered.map(t => line(entryRow(t))));
    const now = opts.now instanceof Date ? opts.now : new Date();
    const p2 = (n) => String(n).padStart(2, '0');
    const stamp = now.getFullYear() + p2(now.getMonth() + 1) + p2(now.getDate()) + p2(now.getHours()) + p2(now.getMinutes()) + p2(now.getSeconds());
    return { text: lines.join(eol), lineCount: lines.length, fileName: 'Stackd_export_' + stamp + (txt ? '.txt' : '.csv'), prefs };
  },

  // The ledger file through the share sheet (native) or a download (web).
  exportLedger(state, opts = {}) {
    const b = this.buildLedger(state, opts);
    const type = b.prefs.format === 'txt' ? 'text/plain;charset=utf-8;' : 'text/csv;charset=utf-8;';
    return this._download(b.fileName, b.text, type, { bom: b.prefs.bom });
  },

  exportAccounts(state) {
    // v1.02: Currency column appended (plan §6).
    // v1.19 (A-17): the file finally restores (import.js isAccountRows /
    // buildAccounts), so it carries everything an account is: type, icon,
    // colour and the opening DATE as well as the amount — the date matters,
    // because transactions dated before it are left out of the balance.
    // Columns are only ever appended, so an older file still imports.
    const headers = 'id,name,opening_balance,created_at,currency,type,icon,color,opening_date';
    const rows = state.accounts.map(acc => {
      const ob = state.transactions.find(t => t.accountId === acc.id && t.type === 'opening_balance');
      return this._toRow([
        acc.id, acc.name, ob ? ob.amount : 0, acc.createdAt, acc.currency || '',
        acc.type || '', acc.icon || '', acc.color || '', ob ? ob.date : ''
      ]);
    });
    this._download('stackd_accounts.csv', [headers, ...rows].join('\n'));
  },

  exportCategories(state) {
    // 1.2.0 (UX-9): a 5th column `tags` — the tags EXPLICITLY linked to the
    // category (state.tagLinks), pipe-joined like the transactions file's
    // Tags. Derived links re-derive from the restored transactions; a tag
    // created with no category and no transaction is not carried (accepted
    // limit). Columns are only ever appended, so an older file still imports.
    const headers = 'id,name,icon,type_hint,tags';
    const links = state.tagLinks || {};
    const linkedTags = (catId) => Object.keys(links)
      .filter(tag => Array.isArray(links[tag]) && links[tag].includes(catId)).join('|');
    const rows = state.categories.map(cat =>
      this._toRow([cat.id, cat.name, cat.icon, cat.typeHint, linkedTags(cat.id)])
    );
    this._download('stackd_categories.csv', [headers, ...rows].join('\n'));
  },

  // v0.71: loans were the only slice a backup couldn't carry. The flat columns
  // are there so the file is readable in a spreadsheet; `Config` holds the whole
  // LoanEngine config as JSON and is what the importer actually trusts, because
  // rate changes / early repayments / extra costs are nested lists that cannot
  // be flattened into fixed columns.
  LOAN_HEADERS: ['Name', 'Kind', 'Type', 'Principal', 'DownPayment', 'Duration',
    'DurationUnit', 'AnnualRate', 'FirstPaymentDate', 'Amortization',
    'InterestOnlyFirst', 'InterestOnlyExtends', 'RateChanges', 'EarlyRepayments',
    'ExtraCosts', 'Config',
    // 1.0.1 (BUG-02): the loan's payment series. Without it a restored loan
    // came back untracked and offered "Track monthly payment" again, which
    // doubled every payment. import.js keeps the transactions file's series
    // ids (re-keyed only on a collision), so this id resolves after a restore
    // whichever file is imported first. Columns are only ever appended.
    'LinkedSeriesId'],

  exportLoans(state, options = {}) {
    const delimiter = options.delimiter || ',';
    const headers = this._toRow(this.LOAN_HEADERS, delimiter);
    const rows = (state.loans || []).map(loan => {
      const c = loan.config || {};
      return this._toRow([
        loan.name,
        loan.kind === 'sim' ? 'sim' : 'active',
        c.type || '',
        c.principal === undefined ? '' : c.principal,
        c.downPayment || 0,
        c.duration === undefined ? '' : c.duration,
        c.durationUnit || '',
        c.annualRate === undefined ? '' : c.annualRate,
        c.firstPaymentDate || '',
        c.amortization || '',
        c.firstInstallmentInterestOnly ? 'true' : 'false',
        c.interestOnlyExtendsDuration === false ? 'false' : 'true',
        (c.rateChanges || []).length,
        (c.earlyRepayments || []).length,
        (c.additionalExpenses || []).length,
        JSON.stringify(c),
        // 1.0.1 (BUG-02): a simulation is never tracked.
        loan.kind === 'sim' ? '' : (loan.linkedSeriesId || '')
      ], delimiter);
    });
    this._download('stackd_loans.csv', [headers, ...rows].join('\n'));
  },

  // v1.01: import rules travel by category NAME (ids differ across installs);
  // import.js resolves the name back and re-creates a missing category. Rules
  // whose category was deleted export nothing restorable, so they are skipped.
  RULE_HEADERS: ['Match', 'Category'],

  exportImportRules(state, options = {}) {
    const delimiter = options.delimiter || ',';
    const headers = this._toRow(this.RULE_HEADERS, delimiter);
    const rows = (state.importRules || [])
      .map(r => {
        const cat = (state.categories || []).find(c => c.id === r.categoryId);
        return cat ? this._toRow([r.match, cat.name], delimiter) : null;
      })
      .filter(Boolean);
    this._download('stackd_import_rules.csv', [headers, ...rows].join('\n'));
  },

  // v1.19: budgets were the one slice of the Goals screen a backup could not
  // carry — neither exported nor importable, so a restore silently dropped
  // every budget. Same convention as import rules: the category travels by
  // NAME (ids differ across installs) and import.js re-creates a missing one.
  // A deleted budget is a tombstone (SAVE_BUDGET with amount 0), and a budget
  // whose category is gone has nothing to restore onto — both are skipped.
  // Months stay 'YYYY-MM', the format the store and the month picker use.
  // 1.0.3 (BUG-140): `Limits` = the limit history as JSON
  // ([{"from":"","amount":300},{"from":"2026-10","amount":400}]), empty for a
  // flat budget; `Amount` stays the newest limit, so an older reader restores
  // the budget flat.
  BUDGET_HEADERS: ['Category', 'Amount', 'StartMonth', 'EndMonth', 'Cumulative', 'Limits'],

  exportBudgets(state, options = {}) {
    const delimiter = options.delimiter || ',';
    const headers = this._toRow(this.BUDGET_HEADERS, delimiter);
    const rows = (state.budgets || [])
      .filter(b => (parseFloat(b.amount) || 0) > 0)
      .map(b => {
        const cat = (state.categories || []).find(c => c.id === b.categoryId);
        return cat ? this._toRow([
          cat.name,
          b.amount,
          b.startDate || '',
          b.endDate || '',
          b.isCumulative ? 'true' : 'false',
          Array.isArray(b.limits) && b.limits.length >= 2 ? JSON.stringify(b.limits) : ''
        ], delimiter) : null;
      })
      .filter(Boolean);
    this._download('stackd_budgets.csv', [headers, ...rows].join('\n'));
  },

  // v0.68: the CSV is a backup/restore format, so it now carries every field the
  // importer needs to rebuild a transaction faithfully — time, tags, isPaid, the
  // transfer pairing ref and the full recurrence descriptor. Dates default to ISO
  // (YYYY-MM-DD): the app compares dates as raw strings everywhere (sorting,
  // period filters, `t.date <= today` balance math), so a DD-MM-YYYY value that
  // reached the store silently broke all of it.
  TX_HEADERS: ['Date', 'Time', 'Type', 'Amount', 'Account', 'Category', 'Note', 'Tags',
    'IsPaid', 'TransferRef', 'SeriesId', 'Interval', 'Frequency', 'StartDate', 'EndDate',
    'NextDate', 'PropagateTags', 'ImportKey', 'BankRef', // v0.99: bank-import dedup identity survives backup round-trips
    // v1.19 (A-17): the currency of the row's account. Without it a restore
    // re-created every account in the new phone's primary currency, so a USD
    // account's dollar amounts were silently read as euros.
    'AccountCurrency',
    // 1.0.2 (BUG-30, BUG-78): the row's account by id (names are not unique:
    // two 'Visa' accounts folded into one on restore) and the row's own id (a
    // second import of the same backup duplicated every row). import.js keeps
    // both and trusts them only in a Stack'd export. Columns are only ever
    // appended.
    'AccountId', 'Id',
    // 1.2.0 (UX-10): the row's attachment metas as a JSON array (never the
    // bytes). A same-device restore keeps the ids and re-links the files; on
    // another phone the viewer says the file is missing.
    'Attachments'],

  exportTransactions(state, options = {}) {
    const delimiter = options.delimiter || ',';
    const dateFormat = options.dateFormat || 'yyyy-mm-dd';
    const headers = this._toRow(this.TX_HEADERS, delimiter);

    // v1.19 (A-17): opening-balance rows are exported again. The app calls
    // this file "a Stack'd backup", yet it used to drop them, so a restore
    // onto a new phone rebuilt every account from zero and every balance came
    // back wrong. import.js puts them back onto accounts that the SAME import
    // creates, and still skips them for accounts that already exist, so
    // re-importing into the same install cannot double-count. (The PDF export
    // below is a report, not a backup, and keeps leaving them out.)
    const filtered = state.transactions
      .filter(t => {
        if (!options.period || !options.period.start || !options.period.end) return true;
        return t.date >= options.period.start && t.date <= options.period.end;
      })
      .sort((a,b) => {
        const tsA = a.date ? `${a.date}T${a.time || '00:00:00'}` : (a.createdAt || '');
        const tsB = b.date ? `${b.date}T${b.time || '00:00:00'}` : (b.createdAt || '');
        return tsB.localeCompare(tsA);
      });

    const rows = filtered.map(t => {
      const acc = state.accounts.find(a => a.id === t.accountId);
      const cat = state.categories.find(c => c.id === t.categoryId);
      const rec = t.recurrence || {};
      return this._toRow([
        this._formatDate(t.date, dateFormat),
        t.time || '',
        t.type,
        t.amount,
        acc ? acc.name : '',
        cat ? cat.name : '',
        t.comment || '',
        Array.isArray(t.tags) ? t.tags.join('|') : '',
        t.isPaid === false ? 'false' : 'true',
        t.transferRef || '',
        rec.seriesId || '',
        (rec.interval === undefined || rec.interval === null) ? '' : rec.interval,
        rec.frequency || '',
        this._formatDate(rec.startDate, dateFormat),
        this._formatDate(rec.endDate, dateFormat),
        // Only the chain tail carries nextDate — see the recurrence notes in
        // CLAUDE.md. Preserving which member is armed is what keeps a restored
        // series generating from the right slot instead of duplicating.
        this._formatDate(rec.nextDate, dateFormat),
        rec.seriesId ? (rec.propagateTags === false ? 'false' : 'true') : '',
        t.importKey || '', // v0.99
        t.bankRef || '',
        acc ? (acc.currency || '') : '', // v1.19 (A-17)
        acc ? acc.id : '', // 1.0.2 (BUG-30)
        t.id || '', // 1.0.2 (BUG-78)
        Array.isArray(t.attachments) && t.attachments.length ? JSON.stringify(t.attachments) : '' // 1.2.0 (UX-10)
      ], delimiter);
    });

    this._download('stackd_transactions.csv', [headers, ...rows].join('\n'));
  },

  // v0.81: jspdf/autotable are no longer loaded in <head> (they were two
  // parser-blocking CDN requests paid on every boot, and nothing in the UI
  // currently calls this). They load on demand the first time a PDF export
  // runs; the cached promise makes repeat calls free.
  _pdfLibsPromise: null,
  _ensurePdfLibs() {
    if (window.jspdf && window.jspdf.jsPDF) return Promise.resolve();
    if (this._pdfLibsPromise) return this._pdfLibsPromise;
    const load = (src) => new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src;
      s.onload = resolve;
      s.onerror = () => reject(new Error('Failed to load ' + src));
      document.head.appendChild(s);
    });
    this._pdfLibsPromise = load('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js')
      .then(() => load('https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.5.25/jspdf.plugin.autotable.min.js'))
      .catch((err) => {
        this._pdfLibsPromise = null; // allow a retry once back online
        throw err;
      });
    return this._pdfLibsPromise;
  },

  exportTransactionsPDF(state, options = {}) {
    if (!window.jspdf || !window.jspdf.jsPDF) {
      this._ensurePdfLibs().then(
        () => this.exportTransactionsPDF(state, options),
        () => alert(window.I18n.t('export.pdfOffline'))
      );
      return;
    }

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    const dateFormat = options.dateFormat || 'dd-mm-yyyy';
    
    // Header
    doc.setFontSize(20);
    doc.setTextColor(33, 37, 41);
    doc.text(window.I18n.t('export.pdfTitle'), 14, 20);
    
    // Metadata
    doc.setFontSize(10);
    doc.setTextColor(100);
    const now = new Date().toLocaleString(window.Store.getLocale());
    doc.text(window.I18n.t('export.pdfGeneratedOn', { date: now }), 14, 28);

    const periodText = (options.period && options.period.start && options.period.end) 
      ? window.I18n.t('export.pdfRange', { start: this._formatDate(options.period.start, dateFormat), end: this._formatDate(options.period.end, dateFormat) })
      : window.I18n.t('export.pdfRangeAll');
    doc.text(periodText, 14, 34);

    const filtered = state.transactions
      .filter(t => t.type !== 'opening_balance')
      .filter(t => {
        if (!options.period || !options.period.start || !options.period.end) return true;
        return t.date >= options.period.start && t.date <= options.period.end;
      })
      .sort((a,b) => {
        const tsA = a.date ? `${a.date}T${a.time || '00:00:00'}` : (a.createdAt || '');
        const tsB = b.date ? `${b.date}T${b.time || '00:00:00'}` : (b.createdAt || '');
        return tsB.localeCompare(tsA);
      });

    const tableData = filtered.map(t => {
      const acc = state.accounts.find(a => a.id === t.accountId);
      const cat = state.categories.find(c => c.id === t.categoryId);
      return [
        this._formatDate(t.date, dateFormat),
        window.I18n.t('export.txType.' + t.type),
        acc ? acc.name : '-',
        cat ? cat.name : '-',
        t.comment || '',
        window.Store.formatCurrency(t.amount, acc && acc.currency, { plain: true }) // v1.02: row currency; 1.2.2 (HG-4): a file is never masked
      ];
    });

    doc.autoTable({
      startY: 40,
      head: [[window.I18n.t('form.date'), window.I18n.t('account.type'), window.I18n.t('common.account'), window.I18n.t('form.category'), window.I18n.t('export.pdfNote'), window.I18n.t('form.amount')]],
      body: tableData,
      theme: 'grid',
      styles: { fontSize: 8, cellPadding: 3 },
      headStyles: { fillColor: [42, 46, 51], textColor: [255, 255, 255], fontStyle: 'bold' },
      columnStyles: {
        5: { halign: 'right', fontStyle: 'bold' } // Amount column
      },
      margin: { top: 40, bottom: 20 },
      didDrawPage: (data) => {
        // Footer: Page number
        const str = window.I18n.t('export.pdfPage', { n: doc.internal.getNumberOfPages() });
        doc.setFontSize(10);
        const pageSize = doc.internal.pageSize;
        const pageHeight = pageSize.height ? pageSize.height : pageSize.getHeight();
        doc.text(str, data.settings.margin.left, pageHeight - 10);
      }
    });

    doc.save(`stackd_export_${window.Store._todayYMD()}.pdf`); // 1.0.2 (D-U4-7) local day, not the UTC day
  },

  // ── 1.2.0 (UX-10): Receipts PDF ─────────────────────────────────────────
  // Every attachment of the rows in the Export period (the ledger's own
  // filter: no opening balances, no rows of a deleted account, planned rows
  // only when asked), oldest first, in ONE PDF built with the vendored
  // pdf-lib (window.PDFLib): an A4 page per image with a caption line, a
  // caption page before the pages of each attached PDF, a caption page
  // saying "file missing" for a file this device does not hold (or "can't
  // be shown" for one it holds but cannot embed).
  receiptEntries(state, opts = {}) {
    const today = window.Store._todayYMD();
    const start = (opts.period && opts.period.start) || '';
    const end = (opts.period && opts.period.end) || '';
    const planned = opts.includePlanned !== false;
    const accIds = new Set((state.accounts || []).map(a => a.id));
    const ts = (t) => (t.date || '') + 'T' + (t.time || '') + '|' + (t.createdAt || '') + '|' + (t.id || '');
    return (state.transactions || [])
      .filter(t => t.type !== 'opening_balance' && accIds.has(t.accountId) && Array.isArray(t.attachments) && t.attachments.length &&
        (!start || t.date >= start) && (!end || t.date <= end) && (planned || t.date <= today))
      .sort((a, b) => (ts(a) < ts(b) ? -1 : ts(a) > ts(b) ? 1 : 0));
  },

  // The number of attachments the receipts PDF of this period would hold.
  receiptsCount(state, opts = {}) {
    return this.receiptEntries(state, opts).reduce((n, t) => n + t.attachments.length, 0);
  },

  // The standard Helvetica font encodes WinAnsi only: every other character
  // is replaced (accents dropped first, then '?'), so a Polish or Greek note
  // never makes drawText throw.
  _WIN_ANSI_EXTRA: '\u20AC\u201A\u0192\u201E\u2026\u2020\u2021\u02C6\u2030\u0160\u2039\u0152\u017D\u2018\u2019\u201C\u201D\u2022\u2013\u2014\u02DC\u2122\u0161\u203A\u0153\u017E\u0178',
  _winAnsi(text) {
    const ok = (c) => { const n = c.charCodeAt(0); return (n >= 0x20 && n <= 0x7E) || (n >= 0xA0 && n <= 0xFF) || this._WIN_ANSI_EXTRA.indexOf(c) !== -1; };
    return Array.from(String(text == null ? '' : text).replace(/[\r\n\t]+/g, ' ').replace(/[\u2000-\u200B\u202F\u205F\u3000]/g, ' ').replace(/\u2212/g, '-'))
      .map(c => {
        if (ok(c)) return c;
        const base = c.normalize ? c.normalize('NFD').replace(/[\u0300-\u036F]/g, '') : '';
        return base && Array.from(base).every(ok) ? base : '?';
      }).join('');
  },

  // date · account · category · amount · note — the caption of a receipt.
  _receiptCaption(t, state) {
    const S = window.Store;
    const I = window.I18n;
    const acc = (state.accounts || []).find(a => a.id === t.accountId);
    const cat = t.transferRef ? I.t('common.transfer') : (((state.categories || []).find(c => c.id === t.categoryId) || {}).name || '');
    let day = t.date || '';
    try { day = new Intl.DateTimeFormat(S.getLocale(), { dateStyle: 'medium' }).format(new Date(t.date + 'T12:00:00')); } catch (e) { /* undated row: the raw date */ }
    const signed = t.type === 'expense' ? -Math.abs(Number(t.amount) || 0) : Math.abs(Number(t.amount) || 0);
    const note = String(t.comment || t.note || '').trim();
    return [day, acc ? acc.name : '', cat, S.formatCurrency(signed, acc && acc.currency, { plain: true }), note].filter(Boolean).join(' · ');
  },

  // Shortened with '…' until it fits `width` points.
  _fitText(font, text, size, width) {
    let s = this._winAnsi(text);
    if (!font || typeof font.widthOfTextAtSize !== 'function') return s;
    if (font.widthOfTextAtSize(s, size) <= width) return s;
    while (s.length > 1 && font.widthOfTextAtSize(s + '…', size) > width) s = s.slice(0, -1);
    return s + '…';
  },

  // → Promise<Uint8Array|null> (null: nothing to export, or no pdf-lib).
  async buildReceiptsPdf(state, opts = {}) {
    const L = window.PDFLib;
    const A = window.Attachments;
    if (!L || !L.PDFDocument || !A) return null;
    const entries = this.receiptEntries(state, opts);
    if (!entries.length) return null;
    const doc = await L.PDFDocument.create();
    const font = await doc.embedFont(L.StandardFonts.Helvetica);
    const W = 595.28;
    const H = 841.89; // A4
    const M = 36;
    const ink = typeof L.rgb === 'function' ? L.rgb(0.2, 0.2, 0.22) : undefined;
    const muted = typeof L.rgb === 'function' ? L.rgb(0.45, 0.45, 0.5) : undefined;
    const captionPage = (caption, name, extra) => {
      const page = doc.addPage([W, H]);
      page.drawText(this._fitText(font, caption, 11, W - 2 * M), { x: M, y: H - M - 11, size: 11, font, color: ink });
      page.drawText(this._fitText(font, name, 9, W - 2 * M), { x: M, y: H - M - 27, size: 9, font, color: muted });
      if (extra) page.drawText(this._fitText(font, extra, 11, W - 2 * M), { x: M, y: H - M - 55, size: 11, font, color: ink });
      return page;
    };
    const TOP = 40; // the two caption lines
    for (const t of entries) {
      const caption = this._receiptCaption(t, state);
      for (const meta of t.attachments) {
        const bytes = await A.read(meta);
        const kind = bytes ? A.sniff(bytes) : null;
        if (kind === 'jpg' || kind === 'png') {
          let img = null;
          try { img = kind === 'jpg' ? await doc.embedJpg(bytes) : await doc.embedPng(bytes); } catch (e) { img = null; }
          if (img) {
            const page = captionPage(caption, meta.name);
            const aw = W - 2 * M;
            const ah = H - 2 * M - TOP;
            const scale = Math.min(1, aw / img.width, ah / img.height);
            const w = img.width * scale;
            const h = img.height * scale;
            page.drawImage(img, { x: M + (aw - w) / 2, y: M + (ah - h) / 2, width: w, height: h });
            continue;
          }
        }
        if (kind === 'pdf') {
          let copied = null;
          try {
            const src = await L.PDFDocument.load(bytes, { ignoreEncryption: true });
            copied = await doc.copyPages(src, src.getPageIndices());
          } catch (e) { copied = null; }
          if (copied) {
            captionPage(caption, meta.name);
            copied.forEach(p => doc.addPage(p));
            continue;
          }
        }
        // bytes that are here but cannot be drawn (a format pdf-lib cannot
        // embed) are not "missing"
        captionPage(caption, meta.name, window.I18n.t(bytes ? 'attach.noPreview' : 'attach.missing'));
      }
    }
    return doc.save();
  },

  _receiptsBusy: false,

  // Builds the PDF and hands it out: the share sheet on native (a CACHE
  // file, no encoding), a download on the web. Nothing in the period → an
  // info sheet. → Promise<boolean> (whether the file went out).
  async exportReceiptsPdf(state, opts = {}) {
    const I = window.I18n;
    const C = window.Components;
    const notice = (o) => { if (C && C.NoticeSheet) C.NoticeSheet.show(o); };
    if (!this.receiptEntries(state, opts).length) {
      notice({ id: 'export-result-modal', tone: 'info', title: I.t('export.receipts'), body: I.t('export.receiptsNone') });
      return false;
    }
    if (this._receiptsBusy) return false;
    this._receiptsBusy = true;
    try {
      let bytes = null;
      try { bytes = await this.buildReceiptsPdf(state, opts); } catch (error) { console.error('Receipts PDF failed:', error); }
      if (!bytes) {
        notice({ id: 'export-result-modal', tone: 'error', title: I.t('export.failedTitle'), body: I.t('export.failedBody') });
        return false;
      }
      const now = opts.now instanceof Date ? opts.now : new Date();
      const p2 = (n) => String(n).padStart(2, '0');
      const name = 'Stackd_receipts_' + now.getFullYear() + p2(now.getMonth() + 1) + p2(now.getDate()) + p2(now.getHours()) + p2(now.getMinutes()) + p2(now.getSeconds()) + '.pdf';
      const cap = window.Capacitor;
      if (cap && typeof cap.isNativePlatform === 'function' && cap.isNativePlatform()) {
        return this._shareNative(name, { base64: this._bytesToBase64(bytes) });
      }
      const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = name;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      return true;
    } finally {
      this._receiptsBusy = false;
    }
  },

  _bytesToBase64(bytes) {
    let s = '';
    for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, Math.min(i + 0x8000, bytes.length)));
    return btoa(s);
  }
};
