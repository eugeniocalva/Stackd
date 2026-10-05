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
    '#debt-results': 'debt-results',
    '#import-map': 'import-map', // v0.99: bank-statement column mapping
    '#import-preview': 'import-preview', // v0.99: bank-statement review & confirm
    '#bank-connect': 'bank-connect', // v1.05: online banking hub
    '#bank-connect-add': 'bank-connect-add', // v1.05: bank picker
    '#bank-connect-map': 'bank-connect-map', // v1.07: account mapping after the bank confirms
    '#purchases': 'purchases' // v1.13: in-app purchases (Stack'd Pro + Bank Connect)
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
    // 1.0.1 (BUG-03): snapshot a form view the first time it is touched,
    // BEFORE the touch changes anything (capture phase), so async init
    // (amount autofocus at +100ms, icon hydration) is never mistaken for an
    // edit. Inert outside FORM_VIEWS.
    const rv = document.getElementById('router-view');
    if (rv) {
      ['pointerdown', 'focusin', 'keydown'].forEach(type =>
        rv.addEventListener(type, () => this._armFormBaseline(), true));
      // 1.0.2 (BUG-87): close / not-found links marked data-router-leave leave
      // their screen without pushing an entry (the href stays as the fallback).
      rv.addEventListener('click', (e) => {
        const a = e.target && e.target.closest ? e.target.closest('a[data-router-leave]') : null;
        if (!a || e.defaultPrevented) return;
        e.preventDefault();
        this.leave(a.getAttribute('href'));
      });
    }
    // Initial route handling
    this.handleRouteChange();
  },

  // ── 1.0.1 (BUG-03): Android Back ─────────────────────────────────────────
  // Forms whose input would be lost by Back. debt-sim and the import views
  // are excluded: their drafts already survive Back (only their own close
  // button clears them).
  FORM_VIEWS: ['add', 'edit', 'edit-account', 'edit-category'],
  // Snapshot of the current form view taken on its first touch; reset ONLY on
  // a route change (not on same-view re-renders), so the draft restored after
  // the in-place add-category re-render still counts as unsaved.
  // Caveat: an attachEvents timer slower than the first touch that writes a
  // field value would read as an edit (none in the tx/account/category forms).
  _formBaseline: null,

  _formSnapshot(root) {
    const parts = [];
    root.querySelectorAll('input, select, textarea').forEach(el => {
      parts.push((el.type === 'checkbox' || el.type === 'radio') ? el.checked : el.value);
    });
    // Non-input state: tx tag chips (not the autocomplete suggestions), the
    // account colour swatch, the picked icon (data-lucide survives hydration).
    root.querySelectorAll('[data-tag]:not(.tag-suggestion), [aria-checked="true"], [data-lucide]').forEach(el => {
      parts.push(el.getAttribute('data-tag') || el.getAttribute('data-lucide') || el.getAttribute('data-color') || 1);
    });
    // 1.0.1 (BUG-03): pressed toggle buttons, keyed by id so a pair of them is
    // told apart — the account form's opening-balance +/− sign lives only in a
    // closure and shows as #btn-ob-pos / #btn-ob-neg aria-pressed (the amount
    // field always holds the absolute value), so a sign-only flip is an edit.
    root.querySelectorAll('[aria-pressed="true"]').forEach(el => {
      parts.push('p:' + (el.id || 1));
    });
    return JSON.stringify(parts);
  },

  _armFormBaseline() {
    if (this._formBaseline !== null) return;
    const s = window.Store && window.Store.getState();
    const rv = document.getElementById('router-view');
    if (s && rv && this.FORM_VIEWS.includes(s.activeView)) this._formBaseline = this._formSnapshot(rv);
  },

  _isFormDirty() {
    const rv = document.getElementById('router-view');
    return this._formBaseline !== null && !!rv && this._formSnapshot(rv) !== this._formBaseline;
  },

  // An empty WebView history (cold start on a deep route) cannot go back.
  _back(canGoBack) {
    if (canGoBack) {
      this._noOrigin = true; // 1.0.2 (BUG-87): an unstamped entry reached this way has an unknown origin
      window.history.back();
    } else this.navigate('#dashboard');
  },

  // 1.0.2 (BUG-86): the one "Discard changes?" sheet (route forms + the Goals
  // limit editor). A second Back hits its Cancel = keep editing.
  _confirmDiscard(onDiscard) {
    window.Components.Modal.show({
      title: window.I18n.t('form.discardTitle'),
      content: `<p>${window.I18n.t('form.discardBody')}</p>`,
      saveText: window.I18n.t('form.discard'),
      saveClass: 'btn-danger', // 1.0.1 (BUG-20): Discard is the destructive choice
      onSave: (close) => { close(); onDiscard(); }
    });
  },

  // ── 1.0.2 (BUG-87): leaving a screen ────────────────────────────────────
  // navigate() pushes, so the jump after a save/delete left the form's entry
  // under the landing screen and Back reopened it. Each fresh entry is stamped
  // with the hash it was pushed from (history.state = {stackdNav, from}); no
  // other code may write history.state.
  _curHash: null,
  _noOrigin: false,
  _norm(h) { return (!h || h === '#') ? '#dashboard' : h; },

  _entryState() {
    try {
      const st = window.history ? window.history.state : null;
      return st && st.stackdNav ? st : null;
    } catch (e) { return null; }
  },

  _stampEntry() {
    const unknown = this._noOrigin;
    this._noOrigin = false;
    try {
      const H = window.history;
      if (H && typeof H.replaceState === 'function' && !this._entryState()) {
        const from = unknown ? null : this._curHash;
        H.replaceState({ stackdNav: 1, from: typeof from === 'string' ? from : null }, '');
      }
    } catch (e) { /* unstamped: leave() replaces, which is always safe */ }
    this._curHash = window.location ? window.location.hash : null;
  },

  // Leave the current screen for `path` without keeping its entry. The entry
  // is rewritten in place and the route applied at once, so the save/delete
  // and the landing screen render in ONE coalesced pass (the closed form never
  // re-renders: no 'not found' frame, no live Save in between). When the entry
  // underneath already shows `path`, the now-identical entry is then dropped:
  // history.back() lands on the same URL (no hashchange, no second render).
  leave(path) {
    const H = window.history, L = window.location;
    if (!L || typeof path !== 'string') return;
    if (this._norm(L.hash) === this._norm(path)) return;                          // already there (double tap)
    if (!H || typeof H.replaceState !== 'function') { this.navigate(path); return; } // windows without the History API
    const st = this._entryState();
    if (st && st.left) return;                                                     // a step back is still landing
    const from = st ? st.from : null;
    const route = (h) => this._norm(h).split('?')[0];
    const under = from !== null && typeof H.back === 'function' &&
      (this._norm(from) === this._norm(path) ||
       (path.indexOf('?') === -1 && route(from) === this._norm(path)));            // D-U9-8: filtered History
    try {
      if (under) H.replaceState({ stackdNav: 1, from: null, left: 1 }, '', from || L.href.split('#')[0]);
      else H.replaceState({ stackdNav: 1, from }, '', path);
    } catch (e) {          // WebKit refuses >100 history calls in 30 s: replace the old way
      this._noOrigin = true;
      this._replaceHash(path);
      return;
    }
    this.handleRouteChange(); // render the landing screen in this same pass
    if (under) H.back();      // drop the duplicate entry: same URL, no hashchange
  },
  _replaceHash(path) {
    const L = window.location;
    if (L && typeof L.replace === 'function') L.replace(path); else this.navigate(path);
  },

  // The Android Back priority chain (the Capacitor 'backButton' event covers
  // both the hardware key and the edge gesture): open sheet → + menu →
  // History selection mode → Home widget edit mode → Goals limit editor
  // (closes it, 'step'; after the discard confirm when a field changed) →
  // confirm leaving a dirty form → route back. Returns what it did; 'exit'
  // (bare Home) means leave the app, which the native caller performs. The
  // in-app close links on the forms stay explicit discards. Views must never
  // call this (unit tests stub Router wholesale).
  handleBack(opts) {
    const canGoBack = !opts || opts.canGoBack !== false;
    const C = window.Components;
    const state = window.Store.getState() || {};

    if (C && C.dismissTopSheet && C.dismissTopSheet()) return 'sheet';

    const nav = document.getElementById('bottom-nav');
    const fab = nav && nav.querySelector('#nav-fab-toggle');
    if (fab && fab.getAttribute('aria-expanded') === 'true') {
      C.BottomNav.closeMenu(nav);
      return 'menu';
    }

    // isSelectionMode survives SET_VIEW and only renders on History.
    if (state.activeView === 'transactions' && state.isSelectionMode) {
      window.Store.dispatch('TOGGLE_SELECTION_MODE', { active: false });
      return 'mode';
    }
    // Edit chrome only shows with at least one widget.
    if (state.activeView === 'dashboard' && state.widgetEditMode && (state.homeWidgets || []).length > 0) {
      window.Store.dispatch('TOGGLE_WIDGET_EDIT_MODE', false);
      return 'mode';
    }

    // 1.0.2 (BUG-86): the Goals limit editor is a step INSIDE #budget
    // (BudgetView.editCategoryId), not a route. Back closes it to the budget
    // list (after the discard confirm when a field changed) and never leaves
    // Goals. It used to route back to Home and leave the editor armed. The
    // lookup is guarded: router-only tests and a stale views.js see no step.
    const BV = window.Views && window.Views.BudgetView;
    if (state.activeView === 'budget' && BV && BV.editCategoryId && typeof BV.closeEditor === 'function') {
      const rv = document.getElementById('router-view');
      if (rv && typeof BV.isEditorDirty === 'function' && BV.isEditorDirty(rv)) {
        this._confirmDiscard(() => BV.closeEditor());
        return 'confirm';
      }
      BV.closeEditor();
      return 'step';
    }

    if (this.FORM_VIEWS.includes(state.activeView) && this._isFormDirty()) {
      this._confirmDiscard(() => { this._formBaseline = null; this._back(canGoBack); });
      return 'confirm'; // a second Back hits the sheet's Cancel = keep editing
    }

    if (state.activeView === 'dashboard') return 'exit';
    this._back(canGoBack);
    return 'back';
  },

  handleRouteChange() {
    this._formBaseline = null; // 1.0.1 (BUG-03): a new route starts clean
    const prevHash = this._curHash; // 1.0.2 (live-U3-N2)
    this._stampEntry();        // 1.0.2 (BUG-87): record where this entry came from
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
    // 1.0.2 (live-U3-N2): #edit?id=A -> #edit?id=B (address bar, web) keeps
    // the view, so SET_VIEW renders nothing and the form kept A's fields: a
    // save then edited A. A form whose query changed renders afresh.
    if (oldView === viewId && this.FORM_VIEWS.includes(viewId) && prevHash !== null && prevHash !== hash &&
        typeof window.Store.emit === 'function') {
      window.Store.emit();
    }

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
