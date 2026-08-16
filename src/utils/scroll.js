// src/utils/scroll.js - Universal Scroll Utility
window.ScrollUtils = {
    _pendingInterval: null,

    /**
     * Smooth-scrolls the app's scroll containers to the top.
     * v0.93: #router-view is the app's only real vertical scroller (#app is
     * overflow:hidden and body never scrolls — global.css). The old
     * implementation swept document.querySelectorAll('*'), reading scrollTop
     * on EVERY node (a forced-layout full-DOM pass) and then animated with a
     * 20ms setInterval; native smooth scrolling does the job without either.
     */
    universalSmoothScrollToTop() {
        try {
            if (this._pendingInterval) {
                clearInterval(this._pendingInterval);
                this._pendingInterval = null;
            }
            const rv = document.getElementById('router-view');
            if (rv && rv.scrollTop > 0) {
                if (typeof rv.scrollTo === 'function') rv.scrollTo({ top: 0, behavior: 'smooth' });
                else rv.scrollTop = 0;
            }
            if ((window.pageYOffset || document.documentElement.scrollTop || 0) > 0) {
                window.scrollTo({ top: 0, behavior: 'smooth' });
            }
        } catch (err) {
            // Emergency fallback for mobile
            window.scrollTo(0, 0);
            const rv = document.getElementById('router-view');
            if (rv) rv.scrollTop = 0;
        }
    },

    /**
     * Instant reset of all common scroll containers.
     */
    instantReset() {
        const targets = [
            document.getElementById('router-view'),
            document.documentElement,
            document.body,
            window
        ];

        targets.forEach(t => {
            if (!t) return;
            if (t === window) {
                window.scrollTo(0, 0);
            } else {
                t.scrollTop = 0;
            }
        });
    }
};
