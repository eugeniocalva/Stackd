// export.js - CSV Export Utilities
window.StackdExport = {
  _download(filename, csvContent) {
    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  },

  _toRow(values) {
    return values.map(v => {
      const str = (v === null || v === undefined) ? '' : String(v);
      return (str.includes(',') || str.includes('"') || str.includes('\n'))
        ? `"${str.replace(/"/g, '""')}"`
        : str;
    }).join(',');
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

  exportTransactions(state) {
    const headers = 'id,type,amount,account_id,category_id,date,comment';
    const rows = state.transactions
      .filter(t => t.type !== 'opening_balance')
      .map(t => this._toRow([t.id, t.type, t.amount, t.accountId, t.categoryId || '', t.date, t.comment || '']));
    this._download('stackd_transactions.csv', [headers, ...rows].join('\n'));
  }
};
