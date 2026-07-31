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

  exportTransactions(state, options = {}) {
    const delimiter = options.delimiter || ',';
    const dateFormat = options.dateFormat || 'dd-mm-yyyy';
    const headers = this._toRow(['Date', 'Type', 'Amount', 'Account', 'Category', 'Note'], delimiter);
    
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
      return this._toRow([
        this._formatDate(t.date, dateFormat),
        t.type,
        t.amount,
        acc ? acc.name : '',
        cat ? cat.name : '',
        t.comment || ''
      ], delimiter);
    });

    this._download('stackd_transactions.csv', [headers, ...rows].join('\n'));
  },

  exportTransactionsPDF(state, options = {}) {
    if (!window.jspdf || !window.jspdf.jsPDF) {
      alert("PDF library not loaded. Please check your internet connection.");
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
    const now = new Date().toLocaleString();
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
