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
    '#budget': 'budget',
    '#analytics': 'analytics',
    '#edit-account': 'edit-account',
    '#tags': 'tags',
    '#tag-detail': 'tag-detail',
    '#category-detail': 'category-detail',
    '#edit-category': 'edit-category',
    '#debt': 'debt'
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
    if (params.account) {
      // Sync both for consistency if requested via URL
      const filters = { accounts: [params.account] };
      window.Store.dispatch('UPDATE_FILTERS', { page: 'history', filters });
      window.Store.dispatch('UPDATE_FILTERS', { page: 'analytics', filters });
      // Also update legacy if still used
      window.Store.dispatch('SET_ACCOUNT_FILTER', params.account);
    }
    
    // Always open budget in the current physical month
    if (viewId === 'budget' && window.Store.getState().activeView !== 'budget') {
      const today = new Date();
      const currentPhysicalMonthStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
      window.Store.dispatch('SET_MONTH_FILTER', currentPhysicalMonthStr);
    }

    // v0.36: State-Aware Scroll Integration
    const oldView = window.Store.getState() ? window.Store.getState().activeView : null;
    window.Store.dispatch('SET_VIEW', viewId);
    
    // Reset scroll position based on whether the view actually changed
    if (window.ScrollUtils) {
      if (oldView === viewId) {
        if (viewId === 'transactions') {
          // Reset shadow state and scroll back to today/relevant date
          // Added delay to ensure view.attachEvents has run (which is in a requestAnimationFrame)
          setTimeout(() => {
            window.dispatchEvent(new CustomEvent('scroll-history-to-today'));
          }, 100);
        } else {
          // v0.36 - Increased delay to 400ms for mid-range mobile hardware (Redmi Note 7)
          setTimeout(() => window.ScrollUtils.universalSmoothScrollToTop(), 400);
        }
      } else {
        // We are switching to a new tab. Reset scroll position instantly
        window.ScrollUtils.instantReset();
      }
    }
  },

  navigate(path) {
    window.location.hash = path;
  }
};
