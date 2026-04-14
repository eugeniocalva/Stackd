/**
 * keyboard.js - Robust Web-based Keyboard Avoidance for Capacitor/Web
 * Handles keyboard visibility states and ensures focused inputs remain visible.
 */

window.KeyboardManager = {
  init() {
    this.body = document.body;
    this.app = document.getElementById('app');
    this.lastFocusedElement = null;

    // Listen for focus events
    document.addEventListener('focusin', this.handleFocusIn.bind(this));
    document.addEventListener('focusout', this.handleFocusOut.bind(this));

    // Monitor visual viewport changes (the most robust way to detect keyboard on mobile)
    if (window.visualViewport) {
      console.log('KeyboardManager: Using VisualViewport API');
      window.visualViewport.addEventListener('resize', this.handleViewportResize.bind(this));
      window.visualViewport.addEventListener('scroll', this.handleViewportResize.bind(this));
    } else {
      console.log('KeyboardManager: VisualViewport NOT supported, using window resize fallback');
      window.addEventListener('resize', this.handleViewportResize.bind(this));
    }
    
    this.initialHeight = window.innerHeight;
  },

  handleFocusIn(e) {
    const target = e.target;
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT') {
      this.body.classList.add('keyboard-active');
      this.lastFocusedElement = target;
      
      // Delay slightly to allow keyboard to start opening and layout to shift
      setTimeout(() => {
        this.scrollElementIntoView(target);
      }, 300);
    }
  },

  handleFocusOut() {
    // Small delay to see if focus moves to another input immediately
    setTimeout(() => {
      if (!document.activeElement || (document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'TEXTAREA' && document.activeElement.tagName !== 'SELECT')) {
        this.body.classList.remove('keyboard-active');
        this.lastFocusedElement = null;
      }
    }, 50);
  },

  handleViewportResize() {
    const viewport = window.visualViewport;
    const currentHeight = viewport ? viewport.height : window.innerHeight;
    const isKeyboardOpen = currentHeight < this.initialHeight * 0.85;

    console.log(`KeyboardManager: Viewport changed. Height: ${currentHeight}, Keyboard Open: ${isKeyboardOpen}`);

    if (isKeyboardOpen) {
      this.body.classList.add('keyboard-active');
      
      // If we have a focused element, make sure it's in view
      if (this.lastFocusedElement) {
        this.scrollElementIntoView(this.lastFocusedElement);
      }
    } else {
      // Only remove if we're not still focused on an input
      if (!document.activeElement || (document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'TEXTAREA' && document.activeElement.tagName !== 'SELECT')) {
        this.body.classList.remove('keyboard-active');
      }
    }
  },

  scrollElementIntoView(el) {
    if (!el) return;
    
    // Use block: 'center' to ensure the input is not just at the edge
    el.scrollIntoView({
      behavior: 'smooth',
      block: 'center'
    });
  }
};
