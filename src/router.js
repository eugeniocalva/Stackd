// router.js - Hash-based SPA Router
window.Router = {
  routes: {
    '': 'dashboard',
    '#dashboard': 'dashboard',
    '#transactions': 'transactions',
    '#add': 'add',
    '#edit': 'edit',
    '#categories': 'categories',
    '#settings': 'settings',
    '#budget': 'budget'
  },

  // Returns query params parsed from the current hash, e.g. { account: 'abc123' }
  getParams() {
    const hash = window.location.hash; // e.g. #transactions?account=abc
    const qIdx = hash.indexOf('?');
    if (qIdx === -1) return {};
    const query = hash.slice(qIdx + 1);
    const params = {};
    query.split('&').forEach(pair => {
      const [key, value] = pair.split('=');
      if (key) params[decodeURIComponent(key)] = decodeURIComponent(value || '');
    });
    return params;
  },

  init() {
    window.addEventListener('hashchange', () => this.handleRouteChange());
    // Initial route handling
    this.handleRouteChange();
  },

  handleRouteChange() {
    const hash = window.location.hash;
    // Strip query string for route lookup
    const baseHash = hash.split('?')[0];
    const viewId = this.routes[baseHash] || 'dashboard';

    // Set filter FIRST — store emits synchronously, so by the time SET_VIEW
    // triggers the view render, activeAccountFilter is already correct in state.
    const params = this.getParams();
    const accountFilter = params.account || '';
    window.Store.dispatch('SET_ACCOUNT_FILTER', accountFilter);
    
    // Always open budget in the current physical month
    if (viewId === 'budget' && window.Store.getState().activeView !== 'budget') {
      const today = new Date();
      const currentPhysicalMonthStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
      window.Store.dispatch('SET_MONTH_FILTER', currentPhysicalMonthStr);
    }

    window.Store.dispatch('SET_VIEW', viewId);
  },

  navigate(path) {
    window.location.hash = path;
  }
};
