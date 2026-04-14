// src/utils/scroll.js - Universal Scroll Utility
window.ScrollUtils = {
    _pendingInterval: null,

    /**
     * Aggressively scrolls all possible scroll containers to the top.
     * Uses setInterval for maximum compatibility on throttled mobile devices.
     */
    universalSmoothScrollToTop() {
        try {
            if (this._pendingInterval) {
                clearInterval(this._pendingInterval);
            }

            // 1. Identify common targets
            const commonTargets = [
                document.getElementById('router-view'),
                document.documentElement,
                document.body,
                window
            ].filter(t => !!t);

            // 2. Global Scroll Search: Identify targets ONCE at the start
            // We only care about elements that actually HAVE a scrollbar and are scrolled.
            const allScrolled = Array.from(document.querySelectorAll('*'))
                .filter(el => el.scrollTop > 5); 
            
            const targets = [...new Set([...commonTargets, ...allScrolled])];

            const duration = 300;
            const startTime = Date.now();
            
            // Capture initial scroll positions
            const starts = targets.map(t => {
                if (t === window) return window.pageYOffset || document.documentElement.scrollTop;
                return t.scrollTop || 0;
            });

            // If nothing is scrolled, exit early
            if (starts.every(s => s <= 0)) {
                console.log('[Stackd] Scroll: Already at top');
                return;
            }

            console.log('[Stackd] Scroll started on targets:', targets.length);

            this._pendingInterval = setInterval(() => {
                const elapsed = Date.now() - startTime;
                const progress = Math.min(elapsed / duration, 1);
                const ease = progress * (2 - progress); // easeOutQuad

                for (let i = 0; i < targets.length; i++) {
                    const t = targets[i];
                    const start = starts[i];
                    const current = progress === 1 ? 0 : start * (1 - ease);
                    
                    if (t === window) {
                        window.scrollTo(0, Math.floor(current));
                    } else {
                        t.scrollTop = Math.floor(current);
                    }
                }

                if (progress >= 1) {
                    clearInterval(this._pendingInterval);
                    this._pendingInterval = null;
                }
            }, 20); // Slightly slower interval (50fps) for mobile stability
        } catch (err) {
            console.error('[Stackd] Scroll Error:', err);
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
