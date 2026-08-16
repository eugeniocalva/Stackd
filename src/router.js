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
    '#category-detail': 'category-detail',
    '#edit-category': 'edit-category',
    '#debt': 'debt',
    '#debt-sim': 'debt-sim',
    '#debt-results': 'debt-results'
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

    // Set filter FIRST — state mutates synchronously with the dispatch, so by
    // the time SET_VIEW triggers the (coalesced) render, the filters are
    // already correct in state.
    // v0.94: ?account= now REPLACES the History filters (fresh defaults +
    // this account) instead of merging — "the account as the only filter".
    // Analytics is no longer silently filtered, and the zero-reader legacy
    // SET_ACCOUNT_FILTER dispatch is gone.
    const params = this.getParams();
    if (params.account) {
      window.Store.dispatch('UPDATE_FILTERS', {
        page: 'history',
        filters: { accounts: [params.account] },
        replace: true
      });
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
      // v0.80: a pending same-view scroll timer from an EARLIER route change
      // must never fire after a newer navigation — the stale 400ms timer raced
      // the History entry scroll and yanked the fresh view back to the top.
      if (this._pendingScrollTimer) {
        clearTimeout(this._pendingScrollTimer);
        this._pendingScrollTimer = null;
      }
      if (oldView === viewId) {
        if (viewId === 'transactions') {
          // Reset shadow state and scroll back to today/relevant date
          // Added delay to ensure view.attachEvents has run (which is in a requestAnimationFrame)
          this._pendingScrollTimer = setTimeout(() => {
            this._pendingScrollTimer = null;
            window.dispatchEvent(new CustomEvent('scroll-history-to-today'));
          }, 100);
        } else {
          // v0.36 - Increased delay to 400ms for mid-range mobile hardware (Redmi Note 7)
          this._pendingScrollTimer = setTimeout(() => {
            this._pendingScrollTimer = null;
            window.ScrollUtils.universalSmoothScrollToTop();
          }, 400);
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
