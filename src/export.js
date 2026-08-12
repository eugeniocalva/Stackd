// export.js - CSV & PDF Export Utilities
window.StackdExport = {
  _download(filename, content, type = 'text/csv;charset=utf-8;') {
    const blob = new Blob(['\uFEFF' + content], { type });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  },

  _toRow(values, delimiter = ',') {
    return values.map(v => {
      const str = (v === null || v === undefined) ? '' : String(v);
      const needsQuotes = str.includes(delimiter) || str.includes('"') || str.includes('\n');
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

  exportAccounts(state) {
    const headers = 'id,name,opening_balance,created_at';
    const rows = state.accounts.map(acc => {
      const ob = state.transactions.find(t => t.accountId === acc.id && t.type === 'opening_balance');
      return this._toRow([acc.id, acc.name, ob ? ob.amount : 0, acc.createdAt]);
    });
    this._download('stackd_accounts.csv', [headers, ...rows].join('\n'));
  },

  exportCategories(state) {
    const headers = 'id,name,icon,type_hint';
    const rows = state.categories.map(cat =>
      this._toRow([cat.id, cat.name, cat.icon, cat.typeHint])
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
    'ExtraCosts', 'Config'],

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
        JSON.stringify(c)
      ], delimiter);
    });
    this._download('stackd_loans.csv', [headers, ...rows].join('\n'));
  },

  // v0.68: the CSV is a backup/restore format, so it now carries every field the
  // importer needs to rebuild a transaction faithfully — time, tags, isPaid, the
  // transfer pairing ref and the full recurrence descriptor. Dates default to ISO
  // (YYYY-MM-DD): the app compares dates as raw strings everywhere (sorting,
  // period filters, `t.date <= today` balance math), so a DD-MM-YYYY value that
  // reached the store silently broke all of it.
  TX_HEADERS: ['Date', 'Time', 'Type', 'Amount', 'Account', 'Category', 'Note', 'Tags',
    'IsPaid', 'TransferRef', 'SeriesId', 'Interval', 'Frequency', 'StartDate', 'EndDate',
    'NextDate', 'PropagateTags'],

  exportTransactions(state, options = {}) {
    const delimiter = options.delimiter || ',';
    const dateFormat = options.dateFormat || 'yyyy-mm-dd';
    const headers = this._toRow(this.TX_HEADERS, delimiter);

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
        rec.seriesId ? (rec.propagateTags === false ? 'false' : 'true') : ''
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
        () => alert('PDF export needs an internet connection to fetch the PDF library. Please try again once online.')
      );
      return;
    }

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    const dateFormat = options.dateFormat || 'dd-mm-yyyy';
    
    // Header
    doc.setFontSize(20);
    doc.setTextColor(33, 37, 41);
    doc.text('Stackd Transaction Report', 14, 20);
    
    // Metadata
    doc.setFontSize(10);
    doc.setTextColor(100);
    const now = new Date().toLocaleString(window.Store.getLocale());
    doc.text(`Generated on: ${now}`, 14, 28);

    const periodText = (options.period && options.period.start && options.period.end) 
      ? `Range: ${this._formatDate(options.period.start, dateFormat)} to ${this._formatDate(options.period.end, dateFormat)}`
      : 'Range: All Time';
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
        t.type.charAt(0).toUpperCase() + t.type.slice(1),
        acc ? acc.name : '-',
        cat ? cat.name : '-',
        t.comment || '',
        window.Store.formatCurrency(t.amount)
      ];
    });

    doc.autoTable({
      startY: 40,
      head: [['Date', 'Type', 'Account', 'Category', 'Note', 'Amount']],
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
        const str = 'Page ' + doc.internal.getNumberOfPages();
        doc.setFontSize(10);
        const pageSize = doc.internal.pageSize;
        const pageHeight = pageSize.height ? pageSize.height : pageSize.getHeight();
        doc.text(str, data.settings.margin.left, pageHeight - 10);
      }
    });

    doc.save(`stackd_export_${new Date().toISOString().split('T')[0]}.pdf`);
  }
};
