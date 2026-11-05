/**
 * keyboard.js - Robust Web-based Keyboard Avoidance for Capacitor/Web
 * Handles keyboard visibility states and ensures focused inputs remain visible.
 *
 * 1.2.0 (UX-8): iOS WebKit does not move a field's caret along with a SMOOTH
 * programmatic scroll — the text scrolls, the caret stays where it was drawn,
 * and it ends up hanging below the digits (the "drifting caret" on the amount
 * field). So: never scroll a field that is already visible above the
 * keyboard, scroll instantly when a scroll is needed, wait for the keyboard
 * to settle instead of scrolling on every visualViewport event, and re-set
 * the selection afterwards so WebKit redraws the caret at the text.
 */

window.KeyboardManager = {
  // Space kept between a focused field and the visible edges (px).
  VISIBLE_MARGIN: 24,
  // How long the visual viewport must be quiet before we act (ms).
  SETTLE_MS: 120,

  init() {
    this.body = document.body;
    this.app = document.getElementById('app');
    this.lastFocusedElement = null;
    this._settleTimer = null;

    // Listen for focus events
    document.addEventListener('focusin', this.handleFocusIn.bind(this));
    document.addEventListener('focusout', this.handleFocusOut.bind(this));

    // Monitor visual viewport changes (the most robust way to detect keyboard on mobile)
    if (window.visualViewport) {
      console.log('KeyboardManager: Using VisualViewport API');
      window.visualViewport.addEventListener('resize', () => this.handleViewportResize());
      // A visual-viewport scroll is iOS moving the page itself: track the
      // keyboard state, but never answer it with a scroll of our own.
      window.visualViewport.addEventListener('scroll', () => this.handleViewportResize({ fromScroll: true }));
    } else {
      console.log('KeyboardManager: VisualViewport NOT supported, using window resize fallback');
      window.addEventListener('resize', () => this.handleViewportResize());
    }

    this.initialHeight = window.innerHeight;
  },

  _isField(el) {
    return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT');
  },

  handleFocusIn(e) {
    const target = e.target;
    if (this._isField(target)) {
      this.body.classList.add('keyboard-active');
      this.lastFocusedElement = target;

      // Delay slightly to allow keyboard to start opening and layout to shift
      setTimeout(() => {
        if (document.activeElement === target) this.scrollElementIntoView(target);
      }, 300);
    }
  },

  handleFocusOut() {
    // Small delay to see if focus moves to another input immediately
    setTimeout(() => {
      if (!this._isField(document.activeElement)) {
        this.body.classList.remove('keyboard-active');
        this.lastFocusedElement = null;
      }
    }, 50);
  },

  handleViewportResize(opts) {
    const fromScroll = !!(opts && opts.fromScroll);
    const viewport = window.visualViewport;
    const currentHeight = viewport ? viewport.height : window.innerHeight;
    const isKeyboardOpen = currentHeight < this.initialHeight * 0.85;

    if (isKeyboardOpen) {
      this.body.classList.add('keyboard-active');

      // Act once the keyboard animation has settled (resize fires on every
      // frame of it), and only for a field that still has focus.
      if (!fromScroll && this.lastFocusedElement) {
        clearTimeout(this._settleTimer);
        this._settleTimer = setTimeout(() => {
          const el = this.lastFocusedElement;
          if (el && document.activeElement === el) this.scrollElementIntoView(el);
        }, this.SETTLE_MS);
      }
    } else {
      // Only remove if we're not still focused on an input
      if (!this._isField(document.activeElement)) {
        this.body.classList.remove('keyboard-active');
      }
    }
  },

  // true when the whole field sits inside the visible area (above the keyboard).
  _isComfortablyVisible(el) {
    if (typeof el.getBoundingClientRect !== 'function') return false;
    const r = el.getBoundingClientRect();
    const vv = window.visualViewport;
    const top = vv ? vv.offsetTop : 0;
    const height = vv ? vv.height : window.innerHeight;
    const m = this.VISIBLE_MARGIN;
    return r.top >= top + m && r.bottom <= top + height - m;
  },

  // Re-setting the selection makes WebKit recompute and redraw the caret at
  // the text's current position (a no-op for the user).
  refreshCaret(el) {
    if (!el || document.activeElement !== el) return;
    if (el.tagName !== 'INPUT' && el.tagName !== 'TEXTAREA') return;
    try {
      const s = el.selectionStart;
      const e = el.selectionEnd;
      if (typeof s === 'number' && typeof e === 'number') el.setSelectionRange(s, e);
    } catch (err) { /* date/number inputs have no selection API */ }
  },

  scrollElementIntoView(el) {
    if (!el || el.isConnected === false) return;

    if (!this._isComfortablyVisible(el)) {
      // Instant, not smooth: the caret follows an instant scroll.
      try {
        el.scrollIntoView({ behavior: 'auto', block: 'center' });
      } catch (err) {
        el.scrollIntoView();
      }
    }

    const raf = window.requestAnimationFrame || ((fn) => setTimeout(fn, 16));
    raf(() => this.refreshCaret(el));
  }
};
