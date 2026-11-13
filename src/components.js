// components.js - Reusable UI Components
window.Components = {
  // v0.61 - Shared autosizer for money tiles.
  //
  // Amounts grow without bound (six-figure balances, large transfers) but the tiles that
  // hold them are fixed fractions of the viewport, so a long value used to wrap
  // mid-number. Callers pass EVERY value in a group and get back ONE font-size for all
  // of them: sibling tiles then shrink together, because a single shrunken tile reads as
  // a rendering glitch rather than a design.
  //
  // Sizing is length-driven, not measured. Views re-render wholesale on every dispatch
  // (see main.js), so a post-render measure-and-refit pass would run on every state
  // change and thrash. With tabular figures a value's rendered width is very close to
  // (character count x NUMERIC_GLYPH_EM x font-size), so the clamp() below just solves
  // that relation for font-size. Keeping the preferred term as a CSS expression means it
  // also keeps adapting to viewport width after render, at no runtime cost.
  //
  //   values     already-formatted strings, including sign and currency symbol
  //   maxRem     size to use when everything fits comfortably
  //   minRem     never shrink past this
  //   widthExpr  CSS expression for the tile's usable inline width
  //
  // Callers must pair this with `white-space: nowrap` and `font-variant-numeric:
  // tabular-nums`, and zero the `min-width` of any grid cell holding the value -- an
  // `auto` minimum lets the nowrapped text push its own column wider than its share.
  NUMERIC_GLYPH_EM: 0.62,
  fitNumericFontSize(values, maxRem, minRem, widthExpr) {
    const longest = (values || []).reduce(
      (max, v) => Math.max(max, String(v === null || v === undefined ? '' : v).length),
      0
    );
    if (!longest) return `${maxRem}rem`;
    const emNeeded = (longest * this.NUMERIC_GLYPH_EM).toFixed(2);
    return `clamp(${minRem}rem, calc(${widthExpr} / ${emNeeded}), ${maxRem}rem)`;
  },

  // 1.0.2 (BUG-24): the components' alias of I18n.esc, for every stored text
  // (names, tags, types) placed in markup. A METHOD on purpose: a top-level
  // `const esc` here would collide with views.js's global `function esc` in
  // the classic-script (defer) build and stop views.js loading at all.
  esc(value) {
    return window.I18n.esc(value);
  },

  BottomNav: {
    // 1.2.2 (HG-7): five tabs. P2: the order after Home is the user's
    // (Settings → Tab bar, Store.getNavOrder); Home is always first.
    TABS: {
      dashboard: { icon: 'home', labelKey: 'nav.dashboard' },
      transactions: { icon: 'list', labelKey: 'nav.history' },
      budget: { icon: 'target', labelKey: 'nav.goals' },
      analytics: { icon: 'pie-chart', labelKey: 'nav.analytics' },
      insights: { icon: 'lightbulb', labelKey: 'nav.insights' }
    },
    tabs() {
      const S = window.Store;
      const order = S && S.getNavOrder ? S.getNavOrder() : ['transactions', 'budget', 'analytics', 'insights'];
      return ['dashboard'].concat(order).filter(v => this.TABS[v]).map(v => Object.assign({ view: v }, this.TABS[v]));
    },
    // What the mounted nav was built from: main.js rebuilds it when this changes.
    key(state) {
      const S = window.Store;
      return (state.language || '') + '|' + (S && S.getNavOrder ? S.getNavOrder().join(',') : '');
    },
    render() {
      return `
        <div class="nav-overlay" id="nav-overlay" aria-hidden="true" style="opacity: 0; pointer-events: none; position: fixed; inset: 0; background-color: rgba(0,0,0,0.3); background: rgba(0,0,0,0.3); backdrop-filter: blur(4px); -webkit-backdrop-filter: blur(4px); z-index: 998; transition: opacity 0.3s ease;"></div>
        
        <div class="nav-action-menu" id="nav-action-menu" style="position: fixed; bottom: calc(100px + var(--safe-bottom)); right: max(var(--space-4), var(--safe-right)); width: 280px; background: var(--bg-surface-elevated); backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px); border-radius: 24px; padding: var(--space-4); box-shadow: 0 12px 40px var(--color-overlay); border: 1px solid var(--glass-border); z-index: 999; transform: translateY(20px) scale(0.9); opacity: 0; pointer-events: none; transition: all 0.4s cubic-bezier(0.16, 1, 0.3, 1);">
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-3);">
            <a href="#add" class="menu-action-item" style="text-decoration: none; background: var(--bg-surface-sunken); padding: var(--space-4) var(--space-2); border-radius: 20px; display: flex; flex-direction: column; align-items: center; gap: var(--space-2); transition: transform 0.2s ease;">
              <div style="width: 44px; height: 44px; border-radius: 14px; background: var(--bg-surface-dim); color: var(--color-primary); display: flex; align-items: center; justify-content: center;"><i data-lucide="edit-3"></i></div>
              <span style="font-size: 0.8rem; font-weight: 700; color: var(--text-primary);">${window.I18n.t('nav.addLog')}</span>
            </a>
            <a href="#edit-account" class="menu-action-item" style="text-decoration: none; background: var(--bg-surface-sunken); padding: var(--space-4) var(--space-2); border-radius: 20px; display: flex; flex-direction: column; align-items: center; gap: var(--space-2); transition: transform 0.2s ease;">
              <div style="width: 44px; height: 44px; border-radius: 14px; background: var(--bg-surface-dim); color: var(--color-primary); display: flex; align-items: center; justify-content: center;"><i data-lucide="landmark"></i></div>
              <span style="font-size: 0.8rem; font-weight: 700; color: var(--text-primary);">${window.I18n.t('nav.addAccount')}</span>
            </a>
            <a href="#debt" class="menu-action-item" style="text-decoration: none; background: var(--bg-surface-sunken); padding: var(--space-4) var(--space-2); border-radius: 20px; display: flex; flex-direction: column; align-items: center; gap: var(--space-2); transition: transform 0.2s ease;">
              <div style="width: 44px; height: 44px; border-radius: 14px; background: var(--bg-surface-dim); color: var(--color-primary); display: flex; align-items: center; justify-content: center;"><i data-lucide="percent"></i></div>
              <span style="font-size: 0.8rem; font-weight: 700; color: var(--text-primary);">${window.I18n.t('nav.debt')}</span>
            </a>
            <a href="#edit-category" class="menu-action-item" style="text-decoration: none; background: var(--bg-surface-sunken); padding: var(--space-4) var(--space-2); border-radius: 20px; display: flex; flex-direction: column; align-items: center; gap: var(--space-2); transition: transform 0.2s ease;">
              <div style="width: 44px; height: 44px; border-radius: 14px; background: var(--bg-surface-dim); color: var(--color-primary); display: flex; align-items: center; justify-content: center;"><i data-lucide="tag"></i></div>
              <span style="font-size: 0.8rem; font-weight: 700; color: var(--text-primary);">${window.I18n.t('nav.addCategory')}</span>
            </a>
            <a href="#settings" class="menu-action-item" style="text-decoration: none; background: var(--bg-surface-sunken); padding: var(--space-4) var(--space-2); border-radius: 20px; grid-column: span 2; display: flex; align-items: center; justify-content: center; gap: var(--space-3); transition: transform 0.2s ease;">
              <div style="width: 32px; height: 32px; border-radius: 10px; background: var(--bg-surface-dim); color: var(--text-secondary); display: flex; align-items: center; justify-content: center;"><i data-lucide="more-horizontal" style="width: 18px; height: 18px;"></i></div>
              <span style="font-size: 0.8rem; font-weight: 700; color: var(--text-secondary);">${window.I18n.t('nav.othersSettings')}</span>
            </a>
          </div>
        </div>

        <div class="nav-pill">
          ${this.tabs().map(tab => `
          <a href="#${tab.view}" class="nav-item touch-target" data-view="${tab.view}" aria-label="${window.I18n.t(tab.labelKey)}">
            <div class="nav-icon"><i data-lucide="${tab.icon}"></i></div>
            <div class="nav-item-indicator"></div>
          </a>`).join('')}
        </div>
        <button id="nav-fab-toggle" class="nav-fab touch-target" aria-label="${window.I18n.t('nav.toggleActions')}" aria-expanded="false" style="border: none; cursor: pointer;">
          <i data-lucide="plus" style="width: 28px; height: 28px;"></i>
        </button>
      `;
    },
    updateActiveState(container, activeView) {
      const items = container.querySelectorAll('.nav-item');
      items.forEach(item => {
        const isActive = item.dataset.view === activeView;
        item.classList.toggle('active', isActive);
        if (isActive) {
          item.setAttribute('aria-current', 'page');
        } else {
          item.removeAttribute('aria-current');
        }
      });
      // v0.51: Close menu on view change
      this.closeMenu(container);
    },
    toggleMenu(container) {
      const menu = container.querySelector('#nav-action-menu');
      const overlay = container.querySelector('#nav-overlay');
      const fab = container.querySelector('#nav-fab-toggle');
      const isOpen = fab.getAttribute('aria-expanded') === 'true';

      if (isOpen) {
        this.closeMenu(container);
      } else {
        fab.setAttribute('aria-expanded', 'true');
        fab.style.color = 'var(--text-on-primary)';
        fab.style.background = 'var(--color-primary)';
        menu.style.opacity = '1';
        menu.style.pointerEvents = 'all';
        menu.style.transform = 'translateY(0) scale(1)';
        overlay.style.opacity = '1';
        overlay.style.pointerEvents = 'all';
      }
    },
    closeMenu(container) {
      const menu = container.querySelector('#nav-action-menu');
      const overlay = container.querySelector('#nav-overlay');
      const fab = container.querySelector('#nav-fab-toggle');
      if (!fab) return;

      fab.setAttribute('aria-expanded', 'false');
      fab.style.color = 'var(--color-primary)';
      fab.style.background = ''; // Revert to CSS default (glassmorphic)
      fab.style.transform = 'rotate(0deg)';
      menu.style.opacity = '0';
      menu.style.pointerEvents = 'none';
      menu.style.transform = 'translateY(20px) scale(0.9)';
      overlay.style.opacity = '0';
      overlay.style.pointerEvents = 'none';
    },
    attachEvents(container) {
      const fabToggle = container.querySelector('#nav-fab-toggle');
      const overlay = container.querySelector('#nav-overlay');

      if (fabToggle) {
        fabToggle.addEventListener('click', () => this.toggleMenu(container));
      }
      if (overlay) {
        overlay.addEventListener('click', () => this.closeMenu(container));
      }

      const handleTabAction = (e, navItem) => {
        const targetView = navItem.dataset.view;
        const currentView = window.Store.getState() ? window.Store.getState().activeView : null;

        if (targetView === currentView) {
          e.preventDefault();
          if (window.Router && window.Router.handleRouteChange) {
            window.Router.handleRouteChange();
          }
          window.dispatchEvent(new CustomEvent('scroll-to-top', { detail: { view: targetView } }));
        }
      };

      // v0.88 P8c: attachEvents re-runs on language change (main.js re-renders
      // the nav); the container-level listener survives innerHTML swaps, so it
      // must replace itself instead of stacking a duplicate.
      if (container._navClickHandler) container.removeEventListener('click', container._navClickHandler);
      container._navClickHandler = (e) => {
        const navItem = e.target.closest('.nav-item');
        if (navItem) handleTabAction(e, navItem);

        // Close menu if clicking menu items
        if (e.target.closest('.menu-action-item')) {
          this.closeMenu(container);
        }
      };
      container.addEventListener('click', container._navClickHandler);
    }
  },

  Modal: {
    show(options) {
      // 1.0.1 (BUG-20): in a delete confirmation saveText IS the safe action
      // ("Cancel", "Keep", "Keep Data"), so a footer Cancel would duplicate
      // it: showCancel defaults to !showDelete and the safe button turns
      // secondary. A caller that wants Delete + a real action + Cancel must
      // pass showCancel: true; dismiss-only sheets ("Done", "OK") pass
      // showCancel: false. deleteText labels the destructive button up front
      // (no setTimeout relabel; its visible text is then its accessible name).
      // Footer order is destructive first, safe action last (D4f), so the
      // bottom thumb spot never holds Delete.
      const {
        title, content, onSave, saveText = window.I18n.t('common.save'),
        showDelete = false, onDelete, showClose = false,
        showCancel = !showDelete,
        saveClass = showDelete ? 'btn-secondary' : 'btn-primary',
        deleteText,
        // 1.0.2 (BUG-40): false = a mandatory sheet (first-run welcome): no
        // backdrop-tap or swipe-down close, and Android Back swallowed via
        // [data-back-swallow] (D4h). Only its own buttons, or its owner's
        // Modal.hide(), close it. The drag handle stays as an invisible
        // spacer so the layout matches every other sheet.
        dismissible = true
      } = options;
      const container = document.getElementById('modal-container');
      container.innerHTML = `
        <div class="modal-backdrop" id="active-modal" role="dialog" aria-modal="true" aria-labelledby="modal-title"${dismissible ? '' : ' data-back-swallow'}>
          <div class="modal-content">
            <div class="modal-handle"${dismissible ? '' : ' style="visibility: hidden;" aria-hidden="true"'}></div>
            <div class="modal-header-container">
              <h2 id="modal-title" class="header-title" style="margin-bottom: 0; font-size: var(--text-2xl);">${title}</h2>
              ${showClose ? `
                <button class="modal-close-btn" id="modal-close-icon-btn" aria-label="${window.I18n.t('modal.closeAria')}">
                  <i data-lucide="x" style="width: 24px; height: 24px;"></i>
                </button>
              ` : ''}
            </div>
            <div class="modal-body">${content}</div>
            <div style="margin-top: var(--space-6); display: flex; flex-direction: column; gap: var(--space-3);">
              ${showDelete ? `<button class="btn btn-danger" id="modal-delete-btn"${deleteText ? '' : ` aria-label="${window.I18n.t('modal.deleteAria')}"`}>${deleteText || window.I18n.t('common.delete')}</button>` : ''}
              <button class="btn ${saveClass}" id="modal-save-btn">${saveText}</button>
              ${showCancel ? `<button class="btn btn-secondary" id="modal-cancel-btn" aria-label="${window.I18n.t('modal.cancelAria')}">${window.I18n.t('common.cancel')}</button>` : ''}
            </div>
          </div>
        </div>`;
      
      if (window.StackdHydrateIcons) window.StackdHydrateIcons();

      requestAnimationFrame(() => {
        const backdrop = document.getElementById('active-modal');
        if (backdrop) backdrop.classList.add('open');
      });

      const backdrop = document.getElementById('active-modal');
      const modalContent = backdrop.querySelector('.modal-content');

      // Swipe-to-dismiss Logic
      let startY = 0;
      let currentY = 0;
      let isDragging = false;

      const onStart = (e) => {
        startY = e.touches[0].clientY;
        isDragging = true;
        modalContent.style.transition = 'none';
      };

      const onMove = (e) => {
        if (!isDragging) return;
        currentY = e.touches[0].clientY - startY;
        if (currentY > 0) {
          modalContent.style.transform = `translateY(${currentY}px)`;
        }
      };

      const onEnd = () => {
        isDragging = false;
        modalContent.style.transition = 'transform 0.3s cubic-bezier(0.16, 1, 0.3, 1)';
        if (currentY > 150) {
          modalContent.style.transform = `translateY(100%)`;
          setTimeout(() => boundClose(), 200);
        } else {
          modalContent.style.transform = `translateY(0)`;
        }
        currentY = 0;
      };

      if (dismissible) { // 1.0.2 (BUG-40)
        backdrop.addEventListener('touchstart', onStart, { passive: true });
        backdrop.addEventListener('touchmove', onMove, { passive: true });
        backdrop.addEventListener('touchend', onEnd);
      }

      const boundClose = () => this.hide();
      const saveBtn = document.getElementById('modal-save-btn');
      if (saveBtn) {
        saveBtn.addEventListener('click', () => {
          if (onSave) onSave(boundClose); else this.hide();
        });
      }
      const cancelBtn = document.getElementById('modal-cancel-btn');
      if (cancelBtn) {
        cancelBtn.addEventListener('click', boundClose);
      }
      const closeIconBtn = document.getElementById('modal-close-icon-btn');
      if (closeIconBtn) {
        closeIconBtn.addEventListener('click', boundClose);
      }
      const deleteBtn = document.getElementById('modal-delete-btn');
      if (deleteBtn) {
        deleteBtn.addEventListener('click', () => {
          if (onDelete) onDelete(boundClose);
        });
      }
      const backdropEl = document.getElementById('active-modal');
      if (backdropEl && dismissible) { // 1.0.2 (BUG-40)
        backdropEl.addEventListener('click', (e) => {
          if (e.target === backdropEl) boundClose();
        });
      }
    },
    hide() {
      const backdrop = document.getElementById('active-modal');
      if (backdrop) {
        backdrop.classList.remove('open');
        // v0.71: the teardown must only clear ITS OWN modal. A modal opened
        // during the 300ms exit animation (e.g. one flow handing off to the
        // next) replaces #active-modal, and the stale timer used to wipe the
        // container out from under it.
        setTimeout(() => {
          const current = document.getElementById('active-modal');
          if (current && current !== backdrop) return;
          const container = document.getElementById('modal-container');
          if (container) container.innerHTML = '';
        }, 300);
      }
    }
  },

  // v0.74: FAQ sheet (Others → Support → FAQ). Static Q&A accordion; reuses
  // the #active-modal id so Modal.hide() owns the teardown.
  // (FaqModal follows the Android Back helpers below.)

  // 1.0.1 (BUG-03): Android Back (the hardware key AND the edge gesture —
  // Capacitor delivers both as one 'backButton' event) closes the TOPMOST
  // open sheet THROUGH its own dismiss control, so each sheet's teardown runs
  // exactly as a tap would (ExpandedGraph destroys its chart, AddWidget steps
  // back, BankDisclosure reverts the toggle via its backdrop handler).
  // Convention: every sheet needs one of these controls, or a backdrop-tap
  // close (e.target === backdrop); otherwise Back is swallowed while it is
  // open — safe (never navigates or exits underneath it), but it feels stuck.
  // Priority order: an explicit [data-back-dismiss] wins over the generic ids.
  _BACK_DISMISS: ['[data-back-dismiss]', '#modal-cancel-btn', '.modal-btn-close'],
  // Sheets where Back must do nothing (D4h): the mandatory first-launch
  // welcome sheet (recognised by its setup rows, whether its Cancel is hidden
  // or absent) and the bank-waiting sheet, whose Cancel revokes the pending
  // requisition over the network.
  _BACK_SWALLOW: '[data-back-swallow], #bank-waiting-modal, #setup-row-currency, #setup-row-language',
  // Returns true whenever a sheet was open: Back is then consumed even if the
  // sheet refuses to close, and is never routed underneath it.
  dismissTopSheet() {
    let top = null;
    let topZ = -Infinity;
    document.querySelectorAll('.modal-backdrop.open').forEach(el => {
      // Computed, not inline: pickers carry an inline 10000, the setup picker
      // 10002, plain sheets the stylesheet's --z-modal-backdrop.
      const z = parseInt(window.getComputedStyle(el).zIndex, 10) || 0;
      if (z >= topZ) { top = el; topZ = z; } // a tie goes to the later node (paints on top)
    });
    if (!top) return false;
    if (top.matches(this._BACK_SWALLOW) || top.querySelector(this._BACK_SWALLOW)) return true;

    let btn = null;
    for (const sel of this._BACK_DISMISS) {
      btn = top.querySelector(sel);
      if (btn) break;
    }
    if (btn) {
      const hidden = btn.hidden || btn.disabled || !!btn.closest('[hidden]') ||
        window.getComputedStyle(btn).display === 'none';
      if (!hidden) btn.click();
      return true; // a hidden/disabled dismiss control means "not dismissable now"
    }
    // No dismiss control (e.g. a Modal.show delete sheet without Cancel):
    // the sheet's own backdrop-tap close runs (HTMLElement.click() targets
    // the backdrop itself)...
    top.click();
    // ...and the generic modal is closed through its own teardown if its
    // backdrop handler did not (hide() drops .open synchronously).
    if (top.id === 'active-modal' && top.classList.contains('open') && this.Modal && this.Modal.hide) {
      this.Modal.hide();
    }
    return true;
  },

  FaqModal: {
    // v0.91 P8f: 7 stable ids; the text lives in the dictionary, so the
    // list is rebuilt in the active language on every show().
    IDS: ['account', 'transaction', 'editDelete', 'widgets', 'loan', 'categories', 'tags', 'bankConnect', 'bankPending', 'moveApp'], // v1.10 B6: Bank Connect entries; 1.1.0 (IE-8): moveApp

    get FAQS() {
      return this.IDS.map(id => ({
        q: window.I18n.t(`faq.${id}.q`),
        a: window.I18n.t(`faq.${id}.a`)
      }));
    },
    show() {
      const container = document.getElementById('modal-container');
      container.innerHTML = `
        <div class="modal-backdrop" id="active-modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">
          <div class="modal-content">
            <div class="modal-handle"></div>
            <div class="modal-header-container">
              <h2 id="modal-title" class="header-title" style="margin-bottom: 0; font-size: var(--text-2xl);">${window.I18n.t('others.faq')}</h2>
            </div>
            <div class="modal-body">
              ${this.FAQS.map(f => `
                <details style="border-bottom: 1px solid var(--border-color); padding: var(--space-3) 0;">
                  <summary style="cursor: pointer; font-weight: 600; font-size: var(--text-sm); color: var(--text-primary); padding: var(--space-2) 0;">${f.q}</summary>
                  <p style="margin: var(--space-2) 0 var(--space-1); color: var(--text-secondary); font-size: var(--text-sm); line-height: 1.6;">${f.a}</p>
                </details>`).join('')}
            </div>
            <div style="margin-top: var(--space-6);">
              <button class="btn btn-secondary" id="modal-cancel-btn" style="width: 100%;" aria-label="${window.I18n.t('support.closeFaqAria')}">${window.I18n.t('common.close')}</button>
            </div>
          </div>
        </div>`;

      requestAnimationFrame(() => {
        const backdrop = document.getElementById('active-modal');
        if (backdrop) backdrop.classList.add('open');
      });

      const close = () => window.Components.Modal.hide();
      const cancelBtn = document.getElementById('modal-cancel-btn');
      if (cancelBtn) cancelBtn.addEventListener('click', close);
      const backdrop = document.getElementById('active-modal');
      if (backdrop) {
        backdrop.addEventListener('click', (e) => {
          if (e.target === backdrop) close();
        });
      }
    }
  },

  // v0.75: User Manual sheet (Others → Support → User Manual). Every user
  // interaction, grouped by screen, with live search + match highlighting.
  // Items are PLAIN TEXT (no HTML) so search/highlight can escape safely.
  // Reuses the #active-modal id so Modal.hide() owns the teardown.
  ManualModal: {
    // v0.91 P8f: section/item ids only — every heading and body comes from
    // the dictionary. _renderBody reads SECTIONS, so search and highlighting
    // run over the ACTIVE language's text, not the English source.
    STRUCTURE: [
      { id: 'around',     items: ['bottomBar', 'plusButton', 'settings'] },
      { id: 'home',       items: ['totalBalance', 'balanceChart', 'walletCards'] },
      { id: 'accounts',   items: ['create', 'fields', 'balances', 'order', 'editDelete'] }, // 1.2.2 (HG-12): order
      { id: 'addTx',      items: ['newLog', 'categoryPicker', 'transfers', 'tags', 'notesTime', 'recurring'] },
      { id: 'editTx',     items: ['edit', 'scope', 'delete'] },
      { id: 'history',    items: ['swipe', 'bulk', 'periods', 'customRange', 'filterSort', 'summary'] },
      { id: 'goals',      items: ['limits', 'setLimit', 'rollover', 'progress'] },
      { id: 'analytics',  items: ['filters', 'netBalance', 'netFlow', 'distribution'] },
      { id: 'loans',      items: ['open', 'simulate', 'advanced', 'results', 'saveTrack', 'trackPayment', 'manage'] },
      { id: 'categories', items: ['manage', 'fields', 'detailEdit', 'deleting'] },
      { id: 'tags',       items: ['add', 'browse', 'lifecycle'] },
      { id: 'widgets',    items: ['add', 'types', 'editMode', 'shortcuts', 'options'] },
      { id: 'others',     items: ['manage', 'region', 'preferences', 'import', 'export', 'backup', 'factoryReset', 'privacy'] } // 1.1.0 (IE-8): + backup
    ],

    get SECTIONS() {
      return this.STRUCTURE.map(sec => ({
        title: window.I18n.t(`manual.${sec.id}.title`),
        items: sec.items.map(it => ({
          h: window.I18n.t(`manual.${sec.id}.${it}.h`),
          d: window.I18n.t(`manual.${sec.id}.${it}.d`)
        }))
      }));
    },

    show() {
      const container = document.getElementById('modal-container');
      container.innerHTML = `
        <div class="modal-backdrop" id="active-modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">
          <div class="modal-content" style="display: flex; flex-direction: column; height: calc(90vh - var(--safe-top));">
            <div class="modal-handle"></div>
            <div class="modal-header-container">
              <h2 id="modal-title" class="header-title" style="margin-bottom: 0; font-size: var(--text-2xl);">${window.I18n.t('others.userManual')}</h2>
            </div>
            <input type="search" id="manual-search" class="form-control" placeholder="${window.I18n.t('support.searchManual')}" autocomplete="off"
                   aria-label="${window.I18n.t('support.searchManualAria')}" style="margin-bottom: var(--space-4); flex-shrink: 0;">
            <div class="modal-body" id="manual-body">${this._renderBody('')}</div>
            <div style="margin-top: var(--space-4); flex-shrink: 0;">
              <button class="btn btn-secondary" id="modal-cancel-btn" style="width: 100%;" aria-label="${window.I18n.t('support.closeManualAria')}">${window.I18n.t('common.close')}</button>
            </div>
          </div>
        </div>`;

      requestAnimationFrame(() => {
        const backdrop = document.getElementById('active-modal');
        if (backdrop) backdrop.classList.add('open');
      });

      const close = () => window.Components.Modal.hide();
      const cancelBtn = document.getElementById('modal-cancel-btn');
      if (cancelBtn) cancelBtn.addEventListener('click', close);
      const backdrop = document.getElementById('active-modal');
      if (backdrop) {
        backdrop.addEventListener('click', (e) => {
          if (e.target === backdrop) close();
        });
      }

      const search = document.getElementById('manual-search');
      const body = document.getElementById('manual-body');
      if (search && body) {
        let timer = null;
        search.addEventListener('input', () => {
          clearTimeout(timer);
          timer = setTimeout(() => { body.innerHTML = this._renderBody(search.value); }, 150);
        });
      }
    },

    _esc(str) {
      return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    },

    // Escape segment-by-segment around the raw-text matches, so a query
    // containing &, < or " still matches and highlights correctly.
    _highlight(text, q) {
      if (!q) return this._esc(text);
      const lower = text.toLowerCase();
      let out = '';
      let i = 0;
      let idx = lower.indexOf(q, i);
      while (idx !== -1) {
        out += this._esc(text.slice(i, idx))
          + `<mark style="background: var(--color-accent); color: white; border-radius: 3px; padding: 0 2px;">${this._esc(text.slice(idx, idx + q.length))}</mark>`;
        i = idx + q.length;
        idx = lower.indexOf(q, i);
      }
      return out + this._esc(text.slice(i));
    },

    _renderBody(query) {
      const q = String(query || '').trim().toLowerCase();
      const sectionsHtml = this.SECTIONS.map(section => {
        const titleMatch = section.title.toLowerCase().includes(q);
        const items = (q && !titleMatch)
          ? section.items.filter(it => (it.h + ' ' + it.d).toLowerCase().includes(q))
          : section.items;
        if (q && !titleMatch && items.length === 0) return '';
        return `
          <div class="manual-section" style="margin-bottom: var(--space-6);">
            <div class="section-title" style="margin-bottom: var(--space-2);">${this._highlight(section.title, q)}</div>
            ${items.map(it => `
              <div style="padding: var(--space-2) 0; border-bottom: 1px solid var(--border-color);">
                <div style="font-weight: 600; font-size: var(--text-sm); color: var(--text-primary); margin-bottom: 2px;">${this._highlight(it.h, q)}</div>
                <div style="font-size: var(--text-sm); color: var(--text-secondary); line-height: 1.6;">${this._highlight(it.d, q)}</div>
              </div>`).join('')}
          </div>`;
      }).filter(Boolean);

      if (sectionsHtml.length === 0) {
        return `<div style="text-align: center; color: var(--text-tertiary); padding: var(--space-8) 0; font-size: var(--text-sm);">${window.I18n.t('support.noResults', { query: this._esc(query.trim()) })}</div>`;
      }
      return sectionsHtml.join('');
    }
  },

  // v1.14: the pair of legal links every purchase surface has to carry. Both
  // stores expect the Terms of Use AND the Privacy Policy to be reachable BY
  // NAME next to the price, so one combined "Terms and Conditions" button is
  // not enough — these open the same modal at the matching part.
  // `close` lets a sheet dismiss itself first (two stacked sheets fight).
  _legalLinks(prefix) {
    const t = (k) => window.I18n.t(k);
    const link = (id, label) => `<button type="button" id="${prefix}-${id}" style="background: none; border: none; padding: 4px 8px; color: var(--color-accent); font-weight: 600; font-size: var(--text-xs); cursor: pointer;">${label}</button>`;
    return `<div style="display: flex; justify-content: center; align-items: center; gap: var(--space-1); flex-wrap: wrap;">
        ${link('terms-link', t('others.termsOfUse'))}
        <span style="color: var(--text-tertiary); font-size: var(--text-xs);">·</span>
        ${link('privacy-link', t('others.privacyPolicy'))}
      </div>`;
  },

  _bindLegalLinks(root, prefix, close) {
    const open = (section) => {
      if (typeof close === 'function') {
        close();
        setTimeout(() => window.Components.TermsModal.show({ section }), 320);
      } else {
        window.Components.TermsModal.show({ section });
      }
    };
    const terms = root.querySelector('#' + prefix + '-terms-link');
    const privacy = root.querySelector('#' + prefix + '-privacy-link');
    if (terms) terms.addEventListener('click', () => open('use'));
    if (privacy) privacy.addEventListener('click', () => open('privacy'));
  },

  // v0.76: Terms & Conditions sheet (Others → Support → Terms and Conditions).
  // Two parts — Terms of Use and Privacy Policy — written for the app's
  // local-only storage model (no servers, no data collection), with the
  // GDPR data-subject rights mapped to in-app features. Static trusted
  // content; reuses the #active-modal id so Modal.hide() owns the teardown.
  TermsModal: {
    // v0.91 P8f: clause ids only; every heading and body is a dictionary key.
    // v0.99: bank-import clauses (imported data accuracy + third-party names).
    // v1.10 B6 (bank-connect-ux-plan §15): Bank Connect + subscription clauses;
    // the privacy part gains the data-flow and recipients clauses. Order =
    // numbering, and terms.intro cites "Terms 5–6 / Privacy 3–4" — keep it.
    // v1.14: 'proUnlock' sits AFTER 'subscription' so bankConnect stays clause 5
    // and subscription clause 6 — terms.intro cites "Terms 5–6 / Privacy 3–4".
    TERMS_IDS: ['acceptance', 'license', 'notAdvice', 'importAccuracy', 'bankConnect', 'subscription', 'proUnlock', 'yourData', 'noWarranty', 'liability', 'thirdParties', 'changes'],
    PRIVACY_IDS: ['short', 'whatStored', 'bankConnectData', 'recipients', 'whatNot', 'gdpr', 'rights', 'security', 'children', 'contact', 'changes'],

    // v1.14: show({section: 'privacy'}) opens scrolled to Part 2, so a paywall
    // can offer a link actually LABELLED "Privacy Policy" (Apple 3.1.2 / the
    // subscription checklist want the two documents reachable by name).
    show(options) {
      const opts = options || {};
      const clause = (title, body) => `
        <div style="margin-bottom: var(--space-4);">
          <div style="font-weight: 600; font-size: var(--text-sm); color: var(--text-primary); margin-bottom: 2px;">${title}</div>
          <div style="font-size: var(--text-sm); color: var(--text-secondary); line-height: 1.6;">${body}</div>
        </div>`;
      const part = (title, id) => `<div class="section-title" id="${id}" style="margin: var(--space-5) 0 var(--space-3);">${title}</div>`;
      // Numbering is generated, not baked into each translated heading.
      const clauses = (prefix, ids) => ids.map((id, i) =>
        clause(`${i + 1}. ${window.I18n.t(`terms.${prefix}.${id}.h`)}`, window.I18n.t(`terms.${prefix}.${id}.d`))
      ).join('');

      const container = document.getElementById('modal-container');
      container.innerHTML = `
        <div class="modal-backdrop" id="active-modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">
          <div class="modal-content" style="display: flex; flex-direction: column; height: calc(90vh - var(--safe-top));">
            <div class="modal-handle"></div>
            <div class="modal-header-container">
              <h2 id="modal-title" class="header-title" style="margin-bottom: 0; font-size: var(--text-2xl);">${window.I18n.t('support.termsTitle')}</h2>
            </div>
            <div style="font-size: var(--text-xs); color: var(--text-tertiary); margin-bottom: var(--space-2); flex-shrink: 0;">${window.I18n.t('terms.lastUpdated', { date: window.I18n.t('terms.updatedDate') })}</div>
            <div class="modal-body">
              <div style="font-size: var(--text-sm); color: var(--text-secondary); line-height: 1.6;">
                ${window.I18n.t('terms.intro')}
              </div>

              ${part(window.I18n.t('terms.part1'), 'terms-part-use')}
              ${clauses('use', this.TERMS_IDS)}

              ${part(window.I18n.t('terms.part2'), 'terms-part-privacy')}
              ${clauses('privacy', this.PRIVACY_IDS)}
            </div>
            <div style="margin-top: var(--space-4); flex-shrink: 0;">
              <button class="btn btn-secondary" id="modal-cancel-btn" style="width: 100%;" aria-label="${window.I18n.t('others.openTermsAria')}">${window.I18n.t('common.close')}</button>
            </div>
          </div>
        </div>`;

      requestAnimationFrame(() => {
        const backdrop = document.getElementById('active-modal');
        if (backdrop) backdrop.classList.add('open');
      });

      // v1.14: land on the requested part instead of making the reader scroll
      // past the whole licence to reach the privacy policy. Deliberately NOT
      // inside the rAF above: the scroll needs the sheet to have been laid out
      // (until `.open` lands the backdrop has no box, and setting scrollTop on
      // a zero-height element silently does nothing), and a timer keeps this
      // working where rAF is throttled.
      if (opts.section === 'privacy') {
        setTimeout(() => {
          const open = document.getElementById('active-modal');
          const anchor = open && open.querySelector('#terms-part-privacy');
          const body = open && open.querySelector('.modal-body');
          // Rect delta, not offsetTop: offsetTop is measured against whatever
          // the nearest positioned ancestor happens to be, which is not the
          // scroll container here.
          if (anchor && body && body.scrollHeight > body.clientHeight) {
            body.scrollTop += anchor.getBoundingClientRect().top - body.getBoundingClientRect().top;
          }
        }, 80);
      }

      const close = () => window.Components.Modal.hide();
      const cancelBtn = document.getElementById('modal-cancel-btn');
      if (cancelBtn) cancelBtn.addEventListener('click', close);
      const backdrop = document.getElementById('active-modal');
      if (backdrop) {
        backdrop.addEventListener('click', (e) => {
          if (e.target === backdrop) close();
        });
      }
    }
  },

  IconPicker: {
    // v0.66: two disjoint icon sets — accounts get banking/finance icons,
    // categories get spending/lifestyle icons. Every name must exist in
    // lucide@0.400.0 AND have an EMERGENCY_ICONS fallback in main.js so it
    // renders on native/file:// where the CDN script is unavailable.
    ACCOUNT_GROUPS: [
      { label: 'Banking', icons: ['wallet', 'wallet-cards', 'wallet-2', 'landmark', 'banknote', 'credit-card', 'coins', 'piggy-bank', 'vault', 'building', 'building-2'] },
      { label: 'Savings & Goals', icons: ['lock', 'shield-check', 'umbrella', 'sprout', 'goal', 'rocket', 'trophy'] },
      { label: 'Investments', icons: ['line-chart', 'candlestick-chart', 'area-chart', 'bitcoin', 'diamond'] },
      { label: 'Currencies', icons: ['dollar-sign', 'euro', 'pound-sterling', 'japanese-yen', 'swiss-franc', 'indian-rupee', 'russian-ruble', 'currency', 'badge-dollar-sign', 'badge-percent'] }
    ],
    CATEGORY_GROUPS: [
      { label: 'Money', icons: ['trending-up', 'trending-down', 'receipt', 'receipt-text', 'percent', 'circle-dollar-sign', 'hand-coins', 'bar-chart-3', 'scale', 'heart-handshake'] },
      { label: 'Food & Drink', icons: ['utensils', 'coffee', 'pizza', 'glass-water', 'beer', 'cup-soda', 'cake', 'leaf', 'ice-cream', 'wine', 'sandwich', 'salad', 'milk', 'soup', 'cooking-pot', 'apple', 'egg', 'cherry', 'grape'] },
      { label: 'Transport', icons: ['car', 'bus', 'plane', 'bike', 'fuel', 'train', 'ship', 'map-pin', 'truck', 'cable-car', 'anchor', 'parking-square', 'navigation'] },
      { label: 'Shopping', icons: ['shopping-bag', 'shopping-cart', 'tag', 'gift', 'shirt', 'watch', 'gem', 'store', 'barcode', 'layers', 'sparkles', 'package'] },
      { label: 'Leisure', icons: ['clapperboard', 'film', 'popcorn', 'music', 'guitar', 'gamepad-2', 'dices', 'party-popper', 'camera', 'ticket', 'tent', 'mountain', 'palmtree', 'ferris-wheel'] },
      { label: 'Home', icons: ['home', 'zap', 'droplets', 'wifi', 'tv', 'refrigerator', 'sofa', 'lamp', 'bath', 'door-closed', 'key', 'plug', 'paint-bucket', 'armchair', 'trash-2'] },
      { label: 'Tech & Work', icons: ['laptop', 'smartphone', 'briefcase', 'book', 'palette', 'globe', 'monitor', 'keyboard', 'headphones', 'printer', 'cpu', 'cloud', 'hard-drive', 'code'] },
      { label: 'Education', icons: ['school', 'graduation-cap', 'book-open', 'pencil', 'library', 'microscope', 'flask-conical', 'telescope', 'calculator', 'backpack', 'presentation', 'compass'] },
      { label: 'Health', icons: ['hospital', 'heart', 'pill', 'activity', 'dumbbell', 'baby', 'stethoscope', 'syringe', 'thermometer', 'brain', 'weight'] },
      { label: 'Pets', icons: ['dog', 'cat', 'bird', 'fish', 'rabbit', 'paw-print', 'bone', 'shell', 'bug'] },
      { label: 'Symbols', icons: ['hash', 'star', 'pin', 'bookmark', 'flag', 'check', 'x', 'plus', 'minus', 'help-circle', 'info', 'alert-circle', 'clock', 'settings', 'search', 'bell', 'share-2'] }
    ],

    render(selectedIcon = 'pin', groups = this.CATEGORY_GROUPS) {
      return `
        <div class="icon-picker" id="icon-picker-v2" style="font-size: 16px;">
          <input type="text" id="icon-search" class="form-control" placeholder="${window.I18n.t('iconPicker.search')}" aria-label="${window.I18n.t('iconPicker.searchAria')}" autocomplete="off" style="font-size: var(--text-sm); margin-bottom: var(--space-3);">
          <div id="icon-selected-display-v2" style="display: flex; align-items: center; justify-content: center; width: 64px; height: 64px; margin: 0 auto var(--space-3); color: var(--color-primary); background: var(--bg-surface-elevated); border-radius: var(--radius-lg); border: 2px dashed var(--border-color);">
            <i data-lucide="${selectedIcon}" style="font-size: 48px; width: 48px; height: 48px; display: inline-block; vertical-align: middle;"></i>
          </div>
          <div id="icon-grid-v2" style="max-height: 220px; overflow-y: auto; padding-right: 4px;">${this._renderGroups(groups)}</div>
        </div>`;
    },

    _renderGroups(groups, filter = '') {
      return groups.map(group => {
        const filtered = filter
          ? group.icons.filter(i => i.includes(filter.toLowerCase()))
          : group.icons;
        if (!filtered.length) return '';
        return `<div style="margin-bottom: var(--space-3);">
          <div class="section-title" style="font-size: 0.75rem; margin-bottom: var(--space-2); opacity: 0.7;">${group.label}</div>
          <div style="display: grid; grid-template-columns: repeat(7, 1fr); gap: 4px;" role="group" aria-label="${group.label}">
            ${filtered.map(i => `<button class="icon-btn touch-target" data-icon="${i}" aria-label="${window.I18n.t('iconPicker.selectAria', { icon: i })}" aria-pressed="false" style="width: 40px; height: 40px; border-radius: 50%; background: var(--bg-surface-sunken); border: none; cursor: pointer; display: flex; align-items: center; justify-content: center; color: var(--text-primary); transition: all 0.2s ease;">
              <i data-lucide="${i}" style="font-size: 20px; width: 20px; height: 20px; display: inline-block; vertical-align: middle;"></i>
            </button>`).join('')}
          </div></div>`;
      }).join('');
    },

    attachEvents(container, onSelect, groups = this.CATEGORY_GROUPS) {
      const grid = container.querySelector('#icon-grid-v2');
      const search = container.querySelector('#icon-search');
      const display = container.querySelector('#icon-selected-display-v2');

      const refreshIcons = () => {
        window.StackdHydrateIcons();
      };

      if (search) {
        search.addEventListener('input', (e) => {
          grid.innerHTML = this._renderGroups(groups, e.target.value.trim());
          this._bindClicks(grid, display, onSelect);
          refreshIcons();
        });
      }
      this._bindClicks(grid, display, onSelect);
      refreshIcons();
    },

    _bindClicks(grid, display, onSelect) {
      grid.querySelectorAll('.icon-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.preventDefault();
          const icon = btn.dataset.icon;
          if (display) {
             display.innerHTML = `<i data-lucide="${icon}"></i>`;
             window.StackdHydrateIcons();
          }
          grid.querySelectorAll('.icon-btn').forEach(b => {
            b.style.background = 'var(--bg-surface-sunken)';
            b.style.color = 'var(--text-primary)';
            b.setAttribute('aria-pressed', 'false');
          });
          btn.style.background = 'var(--color-primary)';
          btn.style.color = 'var(--text-on-primary)';
          btn.setAttribute('aria-pressed', 'true');
          if (onSelect) onSelect(icon);
        });
      });
    },

    show(options) {
      // context: 'account' shows the banking set, anything else the category set (v0.66)
      const { initialIcon = 'pin', onSelect, context = 'category' } = options;
      let groups = context === 'account' ? this.ACCOUNT_GROUPS : this.CATEGORY_GROUPS;
      // Icons picked before the account/category split may not be in the active
      // set — surface them in a leading group so they stay re-selectable.
      if (initialIcon && !groups.some(g => g.icons.includes(initialIcon))) {
        groups = [{ label: 'Current', icons: [initialIcon] }, ...groups];
      }
      const container = document.getElementById('modal-container');
      
      const div = document.createElement('div');
      div.innerHTML = `
        <div class="modal-backdrop" id="active-icon-picker" style="z-index: 10000;" role="dialog" aria-modal="true" aria-labelledby="ip-title">
          <div class="modal-content" style="padding: 0; overflow: hidden; display: flex; flex-direction: column; max-height: 85vh;">
            <div style="padding: 16px; border-bottom: 1px solid var(--border-color); display: flex; flex-direction: column; align-items: center; gap: var(--space-3);">
              <h3 id="ip-title" style="margin: 0; font-size: 1.25rem; font-family: var(--font-family-display); font-weight: 800;">${window.I18n.t('iconPicker.title')}</h3>
              <div style="display: flex; width: 100%; gap: var(--space-3);">
                <button class="btn btn-secondary" id="ip-cancel" data-back-dismiss style="flex: 1; padding: 8px 16px; min-height: 40px;" aria-label="${window.I18n.t('picker.cancelAria')}">${window.I18n.t('common.cancel')}</button>
                <button class="btn btn-primary" id="ip-confirm" style="flex: 1; padding: 8px 16px; min-height: 40px;" aria-label="${window.I18n.t('picker.confirmAria')}">${window.I18n.t('common.done')}</button>
              </div>
            </div>
            
            <div style="padding: var(--space-4); overflow-y: auto;">
              ${this.render(initialIcon, groups)}
            </div>
          </div>
        </div>`;
      container.appendChild(div.firstElementChild);
      
      requestAnimationFrame(() => {
        const backdrop = document.getElementById('active-icon-picker');
        if (backdrop) {
          backdrop.classList.add('open');
          const searchInput = backdrop.querySelector('#icon-search');
          if (searchInput) {
            searchInput.focus();
          }
        }
      });

      let currentSelected = initialIcon;
      const closePicker = () => {
        const backdrop = document.getElementById('active-icon-picker');
        if (backdrop) {
          backdrop.classList.remove('open');
          setTimeout(() => { backdrop.remove(); }, 300);
        }
      };

      const ipContainer = document.getElementById('active-icon-picker');
      this.attachEvents(ipContainer, (icon) => {
        currentSelected = icon;
      }, groups);

      ipContainer.querySelector('#ip-cancel').addEventListener('click', closePicker);
      ipContainer.querySelector('#ip-confirm').addEventListener('click', () => {
        if (onSelect) onSelect(currentSelected);
        closePicker();
      });
    }
  },

  AccountCard: {
    render(account, balance) {
      const formattedBalance = window.Store.formatCurrency(balance); // v0.87 P8b: was pinned en-US/USD
      return `
        <div class="card card-elevated account-card touch-target" data-id="${account.id}" style="cursor: pointer; padding: var(--space-5); width: 100%; justify-content: space-between;" tabindex="0" role="button" aria-label="${window.I18n.t('account.viewAria', { name: window.Components.esc(account.name) })}">
          <div style="display: flex; justify-content: space-between; align-items: flex-start;">
            <div>
              <p style="font-size: var(--text-sm); font-family: var(--font-family-body); color: var(--text-secondary); margin-bottom: var(--space-2);">${window.Components.esc(account.name)}</p>
              <h3 style="font-size: var(--text-2xl); font-family: var(--font-family-display); font-weight: 700; color: var(--text-primary); letter-spacing: -0.02em;">${formattedBalance}</h3>
            </div>
            <div style="width: 48px; height: 48px; border-radius: 14px; background: var(--bg-surface-sunken); display: flex; align-items: center; justify-content: center; color: var(--color-primary);">
              <i data-lucide="wallet" style="width: 24px; height: 24px;"></i>
            </div>
          </div>
        </div>`;
    }
  },

  TransactionItem: {
    render(transaction, category, accountData, options = {}) {
      const esc = window.Components.esc; // 1.0.2 (BUG-24)
      // 1.2.0 (UX-10): a paperclip + count next to the date
      const attachCount = Array.isArray(transaction.attachments) ? transaction.attachments.length : 0;
      let amountClass = 'text-expense';
      let sign = '';
      
      const isOpeningBalance = transaction.type === 'opening_balance';
      const isFlush = options && options.flush === true;
      const allowSwipe = options && options.allowSwipeReveal === true; // v0.62: Renamed to avoid collisions

      // 1. Determine the Sign
      if (transaction.type === 'expense' || (isOpeningBalance && transaction.amount < 0)) {
        sign = '-';
      } else {
        sign = '+';
      }

      // 2. Determine Styling Class
      // 1.2.2 (HG-11 D5/D7): a ledger is mostly spending, so an expense row
      // reads in the neutral text colour, a transfer in a calm blue
      // (.text-transfer, also the form's transfer amount), income stays
      // green. tx-amt-expense, not .text-expense: that one also colours the
      // form's amount field and the nets, which keep their red.
      if (transaction.transferRef) {
        amountClass = 'text-transfer';
      } else if (isOpeningBalance) {
        amountClass = transaction.amount < 0 ? 'tx-amt-expense' : 'text-balance';
      } else if (sign === '+') {
        amountClass = 'text-income';
      } else {
        amountClass = 'tx-amt-expense';
      }

      // v1.02: a row belongs to ONE account — format in that account's currency
      const formattedAmount = sign + window.Store.formatCurrency(Math.abs(transaction.amount), accountData && accountData.currency);
      // 1.2.2 (HG-11 D8): a list grouped under day headers does not repeat the date
      const hideDate = !!(options && options.hideDate);
      const dateStr = hideDate ? '' : window.Components.TransactionItem._fmtDate(transaction.date);

      const isSelectionMode = options && options.isSelectionMode === true;
      const isSelected = options && options.isSelected === true;
      // 1.2.2 (HG-11): selecting turns the category icon over to a check (the
      // mail-app gesture) — no checkbox column, nothing slides. `flip` is
      // 'in' / 'out' only on the render right after this row's state changed.
      const flip = options && (options.flip === 'in' || options.flip === 'out') ? options.flip : '';

      const selectedClass = isSelected ? 'list-item-selected' : '';
      const selectedBgStyle = '';

      // v0.82: paid is the default and shows NOTHING (the green chip is gone);
      // the amber left-edge bar is the single indicator, only when unpaid.
      const isUnpaid = transaction.isPaid === false;

      const unpaidBarHtml = isUnpaid ? `<div class="unpaid-edge-bar"></div>` : '';

      // v0.63: Tags render inline on line 2 (after account name) so tile height stays uniform
      const TAG_PILL_STYLE = 'flex-shrink: 0; font-size: 0.7rem; color: var(--text-secondary); background: var(--bg-surface-sunken); padding: 2px 8px; border-radius: 12px; font-weight: 600;';
      // 1.0.2 (live-U1-N1): a long unbroken category or account name (an
      // IBAN-style bank name) ellipsizes instead of pushing the icon and the
      // amount out of the row. Inline: stylesheets carry no ?v= cache-busting.
      const ELLIPSIS = 'min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;';

      // 1.0.3 (BUG-41, D2): a row dated before its account's opening date is
      // listed dimmed with a "not counted" line (it is in no balance or sum).
      // The icon and text fade, not the row: a translucent swipe row would
      // show its action buttons through. Inline: no stylesheet cache-busting.
      const beforeOpening = !!(options && options.beforeOpening);
      const dimStyle = beforeOpening ? ' opacity: 0.55;' : '';
      const beforeOpeningHtml = beforeOpening
        ? `<div class="list-item-subtitle tx-before-opening" style="margin-top: 2px; font-size: 0.72rem; ${ELLIPSIS}">${window.I18n.t('history.beforeOpening')}</div>`
        : '';

      const iconName = category ? category.icon : 'receipt';
      const iconHtml = allowSwipe
        ? `<div class="list-item-icon tx-icon-flip${isSelected ? ' is-selected' : ''}${flip ? ` tx-flip-${flip}` : ''}" aria-hidden="true">
          <span class="tx-face tx-face-front${beforeOpening ? ' is-dim' : ''}"><i data-lucide="${iconName}"></i></span>
          <span class="tx-face tx-face-back"><svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg></span>
        </div>`
        : `<div class="list-item-icon"${beforeOpening ? ` style="${dimStyle.trim()}"` : ''}>
          <i data-lucide="${iconName}"></i>
        </div>`;

      const innerContent = `
        ${unpaidBarHtml}
        ${iconHtml}
        <div class="list-item-content" style="min-width: 0;${dimStyle}">
          <div style="display: flex; justify-content: space-between; align-items: center; gap: 8px;">
            <div class="list-item-title" style="display: flex; align-items: center; gap: 6px; min-width: 0; flex: 1;">
              <span class="tx-item-title-text" style="${ELLIPSIS}">${category ? esc(category.name) : (transaction.transferRef ? window.I18n.t('common.transfer') : window.I18n.t('common.uncategorized'))}</span>
            </div>
            <div class="list-item-value ${amountClass}" style="flex-shrink: 0; white-space: nowrap;">${formattedAmount}</div>
          </div>
          <div style="display: flex; justify-content: space-between; align-items: center; gap: 8px; margin-top: 4px;">
            <div style="display: flex; align-items: center; gap: 6px; min-width: 0; flex: 1;">
              <div class="list-item-subtitle tx-item-account" style="flex: 0 1 auto; ${ELLIPSIS}">${accountData ? esc(accountData.name) : window.I18n.t('common.account')}</div>
              ${transaction.tags && transaction.tags.length > 0 ? `
              <div class="tx-tags-inline" style="display: flex; align-items: center; gap: 4px; overflow: hidden; min-width: 0; flex: 1;">
                ${transaction.tags.map(tag => `
                  <span class="tx-tag-pill" style="${TAG_PILL_STYLE}">#${esc(tag)}</span>
                `).join('')}
                <span class="tx-tag-more" style="display: none; ${TAG_PILL_STYLE}"></span>
              </div>` : ''}
            </div>
            ${(attachCount || dateStr) ? `<div class="list-item-subtitle" style="flex-shrink: 0;">${attachCount ? `<span class="tx-attach-badge" role="img" aria-label="${esc(window.I18n.t('tx.attachmentsCount', { count: attachCount }))}"><i data-lucide="paperclip" aria-hidden="true"></i>${attachCount}</span>` : ''}${dateStr}</div>` : ''}
          </div>
          ${beforeOpeningHtml}
        </div>`;

      // 1.2.2 (HG-11): in selection mode a row says whether it is picked
      const pressedAttr = isSelectionMode ? ` aria-pressed="${isSelected ? 'true' : 'false'}"` : '';

      // v0.62: Complete branch isolation. 1.2.2 (HG-11): a swipe row keeps its
      // structure in selection mode (only the gesture is off), so entering it
      // moves nothing.
      if (!allowSwipe) {
        return `
          <div class="list-item touch-target ${isFlush ? 'list-item-flush' : ''} ${selectedClass}" data-id="${transaction.id}" style="cursor: pointer; width: 100%; ${selectedBgStyle}" tabindex="0" role="button"${pressedAttr} aria-label="${window.I18n.t('tx.itemAria', { amount: formattedAmount })}">
            ${innerContent}
          </div>`;
      }

      // 1.0.2 (live-U2-1): an opening balance cannot be marked unpaid (one tap
      // moved the balance by the whole opening amount; the store ignores it
      // too). One already unpaid keeps the action, as its only way back.
      const paidActionHtml = (isOpeningBalance && !isUnpaid) ? '' : `
            <button class="swipe-action-btn paid ${isUnpaid ? 'is-unpaid' : ''}" data-id="${transaction.id}" aria-label="${isUnpaid ? window.I18n.t('tx.markPaid') : window.I18n.t('tx.markUnpaid')}">
              <i data-lucide="check" style="width: 20px; height: 20px;"></i>
            </button>`;

      return `
        <div class="swipe-container" data-id="${transaction.id}">
          <div class="swipe-actions left">${paidActionHtml}
          </div>
          <div class="swipe-actions right">
            <button class="swipe-action-btn edit" data-id="${transaction.id}" aria-label="${window.I18n.t('tx.editAria')}">
              <i data-lucide="edit-2" style="width: 20px; height: 20px;"></i>
            </button>
            <button class="swipe-action-btn delete" data-id="${transaction.id}" aria-label="${window.I18n.t('tx.deleteAria')}">
              <i data-lucide="trash-2" style="width: 20px; height: 20px;"></i>
            </button>
          </div>
          <div class="list-item touch-target swipe-content ${isFlush ? 'list-item-flush' : ''} ${selectedClass}" data-id="${transaction.id}" style="cursor: pointer; width: 100%; ${selectedBgStyle}" tabindex="0" role="button"${pressedAttr} aria-label="${window.I18n.t('tx.itemAria', { amount: formattedAmount })}">
            ${innerContent}
          </div>
        </div>`;
    },

    // v0.93: cached row-date formatter. Constructing Intl.DateTimeFormat per
    // rendered row (the old toLocaleDateString call) dominated row cost. The
    // noon anchor keeps 'YYYY-MM-DD' from drifting a day in negative-UTC
    // timezones (the old code parsed it as UTC midnight).
    _dateFmtCache: {},
    _fmtDate(dateStr) {
      const loc = window.Store.getLocale();
      let fmt = this._dateFmtCache[loc];
      if (!fmt) fmt = this._dateFmtCache[loc] = new Intl.DateTimeFormat(loc, { month: 'short', day: 'numeric' });
      return fmt.format(new Date(dateStr + 'T12:00:00'));
    },

    // v0.63: Pills that don't fit on line 2 collapse into a "+N" counter.
    // Must run after the tiles are in the DOM (called from the main.js render loop).
    // v0.93: batched — the old loop interleaved a scrollWidth read with a
    // display write per pill, forcing a synchronous layout per pill per tagged
    // row. Now one read pass finds the rows that actually overflow (after a
    // fresh render every pill starts visible, so no reset writes are needed);
    // only those rows pay the iterative hide loop. Pass { reset: true } on the
    // resize path, where a previously collapsed row may fit again.
    applyTagOverflow(root, opts) {
      const scope = root || document;
      const containers = Array.from(scope.querySelectorAll('.tx-tags-inline'));
      if (containers.length === 0) return;

      if (opts && opts.reset) {
        containers.forEach(container => {
          container.querySelectorAll('.tx-tag-pill').forEach(p => { p.style.display = ''; });
          const more = container.querySelector('.tx-tag-more');
          if (more) more.style.display = 'none';
        });
      }

      containers.forEach(container => {
        if (container.clientWidth === 0 || container.scrollWidth <= container.clientWidth) return;
        const pills = Array.from(container.querySelectorAll('.tx-tag-pill'));
        const more = container.querySelector('.tx-tag-more');
        if (pills.length === 0 || !more) return;
        let hiddenCount = 0;
        for (let i = pills.length - 1; i >= 0 && container.scrollWidth > container.clientWidth; i--) {
          pills[i].style.display = 'none';
          hiddenCount++;
          more.textContent = `+${hiddenCount}`;
          more.style.display = '';
        }
      });
    }
  },

  // 1.2.2 (HG-10 P3, docs/period-picker-plan.md §0): the period control of
  // History and Analytics — one ‹ November 2026 ▾ › pill (Goals' look) under
  // the title, and a context row that appears only when there is something
  // to say: a "↺ This month" chip when the period shown does not contain
  // today, one removable chip per active filter kind, "Clear all" at 2+.
  // The pill's name opens Components.PeriodSheet. Replaces the scrolling
  // AdvancedFilterBar (‹ Today › · funnel · Day…Year · calendar · sliders).
  PeriodBar: {
    _esc(v) { return window.I18n.esc(v); },

    // One chip per active filter kind: { kind, label }. Labels are raw text
    // (escaped by the caller). Accounts: a strict subset of the accounts;
    // types: one of the two.
    chips(filters, state) {
      const t = (k, p) => window.I18n.t(k, p);
      const st = state || window.Store.getState();
      const out = [];
      const accs = Array.isArray(filters.accounts) ? filters.accounts : [];
      const allAccs = st.accounts || [];
      if (accs.length > 0 && accs.length < allAccs.length) {
        const names = accs.map(id => { const a = allAccs.find(x => x.id === id); return a ? a.name : id; });
        out.push({ kind: 'accounts', label: names.length <= 2 ? names.join(', ') : t('filters.accountsShown', { shown: names.length, total: allAccs.length }) });
      }
      const types = Array.isArray(filters.types) ? filters.types : [];
      if (types.length === 1) out.push({ kind: 'types', label: t(types[0] === 'income' ? 'form.income' : 'form.expense') });
      const cats = Array.isArray(filters.categories) ? filters.categories : [];
      if (cats.length) {
        const names = cats.map(id => { const c = (st.categories || []).find(x => x.id === id); return c ? c.name : id; });
        out.push({ kind: 'categories', label: names.length <= 2 ? names.join(', ') : t('filters.categoriesCount', { count: names.length }) });
      }
      const tags = Array.isArray(filters.tags) ? filters.tags : [];
      if (tags.length) {
        const names = tags.map(x => (x === '__untagged__' ? t('history.noTag') : '#' + x));
        out.push({ kind: 'tags', label: names.length <= 2 ? names.join(', ') : t('filters.tagsCount', { count: names.length }) });
      }
      return out;
    },

    // The title-row Filter button (History: "Filter and sort"), with a badge
    // counting the active filter kinds. Keeps the old id (#btn-filter-<page>).
    filterButton(pageKey, filters, state) {
      const n = this.chips(filters, state).length;
      const aria = n ? window.I18n.t('filters.activeAria', { count: n }) : window.I18n.t(pageKey === 'history' ? 'filter.filterAndSort' : 'filters.openAria');
      return `<button type="button" class="period-filter-btn" id="btn-filter-${pageKey}" data-focus-key="period-filter-${pageKey}" aria-label="${aria}" aria-haspopup="dialog">
          <i data-lucide="sliders-horizontal" aria-hidden="true"></i>${n ? `<span class="period-filter-badge" aria-hidden="true">${n}</span>` : ''}
        </button>`;
    },

    render(pageKey, filters, state) {
      const S = window.Store;
      const t = (k, p) => window.I18n.t(k, p);
      const esc = (v) => this._esc(v);
      const p = filters.period;
      const label = S.periodLabel(p);
      const prev = S.periodLabel(S.stepPeriod(p, -1));
      const next = S.periodLabel(S.stepPeriod(p, 1));
      const back = S.currentPeriodLike(p);
      const chips = this.chips(filters, state);
      const backHtml = back
        ? `<button type="button" class="period-chip period-chip--now" id="period-now-${pageKey}" data-focus-key="period-now-${pageKey}">
             <i data-lucide="rotate-ccw" aria-hidden="true"></i>${t(back.type === 'year' ? 'period.backYear' : 'period.backMonth')}
           </button>`
        : '';
      const chipsHtml = chips.map(c => `<button type="button" class="period-chip" data-filter-kind="${c.kind}" data-focus-key="period-chip-${pageKey}-${c.kind}" aria-label="${t('filters.remove', { name: esc(c.label) })}">
             <span class="period-chip-label">${esc(c.label)}</span><i data-lucide="x" aria-hidden="true"></i>
           </button>`).join('');
      const clearHtml = chips.length >= 2
        ? `<button type="button" class="period-chip period-chip--clear" id="period-clear-${pageKey}" data-focus-key="period-clear-${pageKey}">${t('filters.clearAll')}</button>`
        : '';
      const context = backHtml || chipsHtml
        ? `<div class="period-context">${backHtml}${chipsHtml}${clearHtml}</div>`
        : '';
      return `
        <div class="period-bar" data-page="${pageKey}">
          <!-- 1.2.2 (HG-10 follow-up): the arrows sit outside the pill as
               primary buttons; the pill is the label alone, no chevron -->
          <div class="period-row">
            <button type="button" class="period-arrow" id="period-prev-${pageKey}" data-focus-key="period-prev-${pageKey}" aria-label="${t('period.prevAria', { label: esc(prev) })}">
              <i data-lucide="chevron-left" aria-hidden="true"></i>
            </button>
            <div class="period-pill">
              <button type="button" class="period-label" id="period-label-${pageKey}" data-focus-key="period-label-${pageKey}" aria-haspopup="dialog" aria-label="${t('period.change', { label: esc(label) })}">
                <span class="period-label-text">${esc(label)}</span>
              </button>
            </div>
            <button type="button" class="period-arrow" id="period-next-${pageKey}" data-focus-key="period-next-${pageKey}" aria-label="${t('period.nextAria', { label: esc(next) })}">
              <i data-lucide="chevron-right" aria-hidden="true"></i>
            </button>
          </div>
          ${context}
        </div>`;
    },

    // "November 2026. 23 transactions" (History) / "November 2026" — read
    // after the period moved (Announcer delays past the coalesced render).
    announce(pageKey) {
      const S = window.Store;
      const A = window.Components.Announcer;
      if (!A) return;
      const f = pageKey === 'history' ? S.state.historyFilters : S.state.analyticsFilters;
      const label = S.periodLabel(f.period);
      if (pageKey !== 'history') { A.say(label); return; }
      const n = S.getFilteredTransactions('history', null, { keepBeforeOpening: true }).length;
      A.say(window.I18n.t('period.announce', { label, count: n }));
    },

    // Back to the period containing today. History keeps its BUG-115 /
    // BUG-69 sequence: roll first, move, then scroll to today after the
    // re-render (or at once when nothing re-renders).
    goNow(container, pageKey) {
      const S = window.Store;
      if (pageKey === 'history') {
        const before = S.state.historyFilters;
        S.dispatch('ROLL_PERIODS');
        const target = S.currentPeriodLike(S.state.historyFilters.period);
        if (target) S.dispatch('UPDATE_FILTERS', { page: 'history', filters: { period: target } });
        if (S.state.historyFilters !== before) {
          setTimeout(() => window.dispatchEvent(new CustomEvent('scroll-history-to-today')), 100);
        } else if (window.Views && window.Views.TransactionsView) {
          window.Views.TransactionsView.scrollToToday(container);
        }
      } else {
        const target = S.currentPeriodLike(S.state.analyticsFilters.period);
        if (target) S.dispatch('UPDATE_FILTERS', { page: pageKey, filters: { period: target } });
      }
      this.announce(pageKey);
    },

    // 1.2.2 (HG-10 follow-up) a new period opens at the top of the page, not
    // at the old period's scroll offset. The same-view re-render keeps
    // whatever scrollTop it finds (main.js), and it runs in the next
    // microtask, so zeroing it right before the dispatch shows no jump.
    // "Back to this month" keeps its own scroll to today (goNow).
    toTop() {
      const view = document.getElementById('router-view');
      if (view) view.scrollTop = 0;
    },

    attachEvents(container, pageKey) {
      const S = window.Store;
      const q = (sel) => container.querySelector(sel);
      const step = (dir) => { this.toTop(); S.dispatch('NAVIGATE_PERIOD', { offset: dir, page: pageKey }); this.announce(pageKey); };
      const prev = q(`#period-prev-${pageKey}`);
      const next = q(`#period-next-${pageKey}`);
      const label = q(`#period-label-${pageKey}`);
      const now = q(`#period-now-${pageKey}`);
      const clear = q(`#period-clear-${pageKey}`);
      const filterBtn = q(`#btn-filter-${pageKey}`);
      if (prev) prev.addEventListener('click', () => step(-1));
      if (next) next.addEventListener('click', () => step(1));
      if (label) label.addEventListener('click', () => window.Components.PeriodSheet.show(pageKey));
      if (now) now.addEventListener('click', () => this.goNow(container, pageKey));
      container.querySelectorAll(`.period-bar[data-page="${pageKey}"] [data-filter-kind]`).forEach(chip => {
        chip.addEventListener('click', () => {
          S.dispatch('UPDATE_FILTERS', { page: pageKey, filters: { [chip.dataset.filterKind]: [] } });
        });
      });
      // Clear all never touches the period or the sort
      if (clear) clear.addEventListener('click', () => {
        S.dispatch('UPDATE_FILTERS', { page: pageKey, filters: { types: [], accounts: [], categories: [], tags: [] } });
      });
      if (filterBtn) filterBtn.addEventListener('click', () => window.Components.FilterModal.show(pageKey));
    }
  },

  // 1.2.2 (HG-10 P3) one bottom sheet for the period: a Month · Year switch
  // over a grid that opens where you are, and "Custom range…" — a one-month
  // range calendar in the same sheet (tap the start, tap the end, Done). A
  // tap on a month or a year applies it and closes. Back from the calendar
  // returns to the grid ([data-back-dismiss] on "‹ Period"); Back, ✕, Escape
  // or a backdrop tap on the grid closes without a change.
  PeriodSheet: {
    show(pageKey) {
      const S = window.Store;
      const t = (k, p) => window.I18n.t(k, p);
      const esc = (v) => window.I18n.esc(v);
      const loc = S.getLocale();
      const container = document.getElementById('modal-container');
      if (!container) return;
      const old = document.getElementById('period-sheet');
      if (old) old.remove();

      const filters = pageKey === 'history' ? S.state.historyFilters : S.state.analyticsFilters;
      const shown = filters.period;
      const today = S._todayYMD();
      const bounds = shown.type === 'custom' ? { start: shown.start, end: shown.end } : S._getPeriodBounds(shown.type, shown.value);
      const anchor = S.isDateInPeriod(today, shown) ? today : (bounds.start || today);
      const thisYear = Number(today.slice(0, 4));
      const ymd = (y, m, d) => `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

      const st = {
        step: 'grid',
        unit: shown.type === 'year' ? 'year' : 'month',
        gridYear: Number(anchor.slice(0, 4)),
        yearEnd: Math.max(thisYear, Number(anchor.slice(0, 4))),
        selStart: bounds.start || '',
        selEnd: bounds.end || '',
        fresh: true, // the next day tap starts a new range
        calY: Number((bounds.start || today).slice(0, 4)),
        calM: Number((bounds.start || today).slice(5, 7)) - 1
      };

      const wrapper = document.createElement('div');
      wrapper.className = 'modal-backdrop';
      wrapper.id = 'period-sheet';
      wrapper.setAttribute('role', 'dialog');
      wrapper.setAttribute('aria-modal', 'true');
      wrapper.setAttribute('aria-labelledby', 'ps-title');

      const close = () => {
        wrapper.classList.remove('open');
        document.removeEventListener('keydown', onKey, true);
        setTimeout(() => wrapper.remove(), 300);
        const lab = document.getElementById(`period-label-${pageKey}`);
        if (lab) lab.focus({ preventScroll: true });
      };
      const apply = (period) => {
        // a different period from the sheet opens at the top too
        const p0 = shown;
        const same = p0.type === period.type && (period.type === 'custom'
          ? p0.start === period.start && p0.end === period.end
          : p0.value === period.value);
        if (!same) window.Components.PeriodBar.toTop();
        S.dispatch('UPDATE_FILTERS', { page: pageKey, filters: { period } });
        close();
        window.Components.PeriodBar.announce(pageKey);
      };

      const isShown = (type, value) => shown.type === type && shown.value === value;
      const monthNames = window.I18n.monthNames('short');
      const monthLong = window.I18n.monthNames('long');

      const gridHtml = () => {
        let nav;
        let cells;
        if (st.unit === 'month') {
          nav = `<button type="button" class="period-nav-btn" data-k="g-prev" aria-label="${t('monthPicker.prevYear')}"><i data-lucide="chevron-left" aria-hidden="true"></i></button>
                 <span class="period-nav-title">${st.gridYear}</span>
                 <button type="button" class="period-nav-btn" data-k="g-next" aria-label="${t('monthPicker.nextYear')}"><i data-lucide="chevron-right" aria-hidden="true"></i></button>`;
          cells = monthNames.map((m, i) => {
            const value = ymd(st.gridYear, i, 1);
            const sel = isShown('month', value);
            const cur = today.slice(0, 7) === value.slice(0, 7);
            return `<button type="button" class="period-cell${sel ? ' is-selected' : ''}${cur ? ' is-current' : ''}" data-k="m-${i}" data-type="month" data-value="${value}" aria-pressed="${sel}"${cur ? ' aria-current="date"' : ''} aria-label="${esc(monthLong[i])} ${st.gridYear}">${esc(m)}</button>`;
          }).join('');
        } else {
          const first = st.yearEnd - 11;
          nav = `<button type="button" class="period-nav-btn" data-k="y-prev" aria-label="${t('period.yearsPrev')}"><i data-lucide="chevron-left" aria-hidden="true"></i></button>
                 <span class="period-nav-title">${first} – ${st.yearEnd}</span>
                 <button type="button" class="period-nav-btn" data-k="y-next" aria-label="${t('period.yearsNext')}"><i data-lucide="chevron-right" aria-hidden="true"></i></button>`;
          cells = Array.from({ length: 12 }, (_, i) => first + i).map(y => {
            const value = `${y}-01-01`;
            const sel = isShown('year', value);
            const cur = y === thisYear;
            return `<button type="button" class="period-cell${sel ? ' is-selected' : ''}${cur ? ' is-current' : ''}" data-k="y-${y}" data-type="year" data-value="${value}" aria-pressed="${sel}"${cur ? ' aria-current="date"' : ''}>${y}</button>`;
          }).join('');
        }
        return `
          <div class="period-sheet-head">
            <h2 id="ps-title" class="period-sheet-title">${t('period.sheetTitle')}</h2>
            <button type="button" class="period-sheet-x" data-k="close" data-back-dismiss aria-label="${t('common.close')}"><i data-lucide="x" aria-hidden="true"></i></button>
          </div>
          <div class="period-seg" role="radiogroup" aria-label="${t('period.unitAria')}">
            <button type="button" role="radio" class="period-seg-btn" data-k="u-month" data-unit="month" aria-checked="${st.unit === 'month'}" tabindex="${st.unit === 'month' ? 0 : -1}">${t('filter.month')}</button>
            <button type="button" role="radio" class="period-seg-btn" data-k="u-year" data-unit="year" aria-checked="${st.unit === 'year'}" tabindex="${st.unit === 'year' ? 0 : -1}">${t('filter.year')}</button>
          </div>
          <div class="period-nav">${nav}</div>
          <div class="period-grid" role="group" aria-label="${t('period.sheetTitle')}">${cells}</div>
          <button type="button" class="period-custom-row" data-k="custom">
            <span>${t('period.customRow')}</span><i data-lucide="chevron-right" aria-hidden="true"></i>
          </button>`;
      };

      const calHtml = () => {
        const first = new Date(st.calY, st.calM, 1);
        const lead = (first.getDay() + 6) % 7; // Monday first
        const days = new Date(st.calY, st.calM + 1, 0).getDate();
        const a = st.selStart;
        const b = st.selEnd || st.selStart;
        const lo = a && b ? (a < b ? a : b) : '';
        const hi = a && b ? (a < b ? b : a) : '';
        const heads = window.I18n.weekdayInitials().map(w => `<span class="period-cal-head" aria-hidden="true">${esc(w)}</span>`).join('');
        let cells = '';
        for (let i = 0; i < lead; i++) cells += '<span class="period-cal-pad" aria-hidden="true"></span>';
        for (let d = 1; d <= days; d++) {
          const v = ymd(st.calY, st.calM, d);
          const isLo = v === lo;
          const isHi = v === hi;
          const inside = lo && v > lo && v < hi;
          const name = new Date(v + 'T12:00:00').toLocaleDateString(loc, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
          const mark = isLo && isHi ? '' : (isLo ? t('period.custom.startMark') : (isHi ? t('period.custom.endMark') : ''));
          const cls = ['period-day'];
          if (isLo || isHi) cls.push('is-end');
          if (isLo && hi && lo !== hi) cls.push('is-lo');
          if (isHi && lo && lo !== hi) cls.push('is-hi');
          if (inside) cls.push('is-in');
          if (v === today) cls.push('is-today');
          cells += `<button type="button" class="${cls.join(' ')}" data-k="d-${v}" data-day="${v}" aria-pressed="${isLo || isHi || !!inside}" aria-label="${esc(name)}${mark ? ', ' + mark : ''}">${d}</button>`;
        }
        let status;
        if (!st.selStart) status = t('period.custom.pickStart');
        else if (!st.selEnd) status = t('period.custom.pickEnd');
        else {
          const n = Math.round((new Date(hi + 'T12:00:00') - new Date(lo + 'T12:00:00')) / 86400000) + 1;
          status = t('period.custom.days', { range: esc(S.periodLabel({ type: 'custom', start: lo, end: hi })), count: n });
        }
        const title = new Date(st.calY, st.calM, 15).toLocaleDateString(loc, { month: 'long', year: 'numeric' });
        return `
          <div class="period-sheet-head">
            <button type="button" class="period-sheet-back" data-k="back" data-back-dismiss><i data-lucide="chevron-left" aria-hidden="true"></i>${t('period.sheetTitle')}</button>
            <h2 id="ps-title" class="period-sheet-title">${t('period.custom.title')}</h2>
            <button type="button" class="period-sheet-x modal-btn-close" data-k="close2" aria-label="${t('common.close')}"><i data-lucide="x" aria-hidden="true"></i></button>
          </div>
          <div class="period-nav">
            <button type="button" class="period-nav-btn" data-k="c-prev" aria-label="${t('budget.prevMonth')}"><i data-lucide="chevron-left" aria-hidden="true"></i></button>
            <span class="period-nav-title">${esc(title)}</span>
            <button type="button" class="period-nav-btn" data-k="c-next" aria-label="${t('budget.nextMonth')}"><i data-lucide="chevron-right" aria-hidden="true"></i></button>
          </div>
          <div class="period-cal">${heads}${cells}</div>
          <p class="period-cal-status" role="status">${status}</p>
          <button type="button" class="btn btn-primary period-done" data-k="done"${st.selStart ? '' : ' disabled'}>${t('common.done')}</button>`;
      };

      const paint = (focusKey) => {
        wrapper.innerHTML = `<div class="modal-content period-sheet">${st.step === 'grid' ? gridHtml() : calHtml()}</div>`;
        if (window.StackdHydrateIcons) window.StackdHydrateIcons(wrapper);
        const el = (focusKey && wrapper.querySelector(`[data-k="${focusKey}"]`))
          || wrapper.querySelector('.period-cell.is-selected, .period-day.is-end')
          || wrapper.querySelector('[data-k]');
        if (el) el.focus({ preventScroll: true });
      };

      wrapper.addEventListener('click', (e) => {
        if (e.target === wrapper) { close(); return; }
        const btn = e.target.closest && e.target.closest('[data-k]');
        if (!btn || btn.disabled) return;
        const k = btn.dataset.k;
        if (k === 'close' || k === 'close2') { close(); return; }
        if (k === 'u-month' || k === 'u-year') { st.unit = btn.dataset.unit; paint(k); return; }
        if (k === 'g-prev' || k === 'g-next') { st.gridYear += k === 'g-prev' ? -1 : 1; paint(k); return; }
        if (k === 'y-prev' || k === 'y-next') { st.yearEnd += k === 'y-prev' ? -12 : 12; paint(k); return; }
        if (btn.dataset.type) { apply({ type: btn.dataset.type, value: btn.dataset.value, start: '', end: '' }); return; }
        if (k === 'custom') { st.step = 'custom'; paint(); return; }
        if (k === 'back') { st.step = 'grid'; paint('custom'); return; }
        if (k === 'c-prev' || k === 'c-next') {
          const d = new Date(st.calY, st.calM + (k === 'c-prev' ? -1 : 1), 1);
          st.calY = d.getFullYear(); st.calM = d.getMonth();
          paint(k);
          return;
        }
        if (btn.dataset.day) {
          const v = btn.dataset.day;
          if (st.fresh || !st.selStart || st.selEnd) { st.selStart = v; st.selEnd = ''; st.fresh = false; }
          else { st.selEnd = v; }
          paint(k);
          return;
        }
        if (k === 'done' && st.selStart) {
          const a = st.selStart;
          const b = st.selEnd || st.selStart;
          apply({ type: 'custom', value: '', start: a < b ? a : b, end: a < b ? b : a }); // 1.0.2 (BUG-68) in order
        }
      });

      const onKey = (e) => {
        if (!wrapper.isConnected) return;
        if (e.key === 'Escape') {
          e.preventDefault();
          e.stopPropagation();
          if (st.step === 'custom') { st.step = 'grid'; paint('custom'); } else close();
          return;
        }
        if (e.key === 'Tab') { // focus stays in the sheet
          const f = [...wrapper.querySelectorAll('button:not([disabled])')];
          if (!f.length) return;
          const i = f.indexOf(document.activeElement);
          if (e.shiftKey && i <= 0) { e.preventDefault(); f[f.length - 1].focus(); }
          else if (!e.shiftKey && i === f.length - 1) { e.preventDefault(); f[0].focus(); }
          return;
        }
        if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && document.activeElement && document.activeElement.getAttribute('role') === 'radio') {
          e.preventDefault();
          st.unit = st.unit === 'month' ? 'year' : 'month';
          paint(st.unit === 'month' ? 'u-month' : 'u-year');
        }
      };
      document.addEventListener('keydown', onKey, true);

      container.appendChild(wrapper);
      paint();
      requestAnimationFrame(() => wrapper.classList.add('open'));
    }
  },

  FilterModal: {
    show(pageKey) {
      const filters = pageKey === 'history' ? window.Store.state.historyFilters : window.Store.state.analyticsFilters;
      const accounts = window.Store.orderedAccounts(); // 1.2.2 (HG-12): the user's order
      const categories = window.Store.state.categories;
      const esc = (v) => String(v == null ? '' : v)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

      let currentFilters = JSON.parse(JSON.stringify(filters));

      const container = document.getElementById('modal-container');
      const div = document.createElement('div');
      div.className = 'modal-backdrop';
      div.id = 'filter-advanced-modal';
      // 1.2.2 (HG-10 P4) a real dialog: named, modal, focus in and back out
      div.setAttribute('role', 'dialog');
      div.setAttribute('aria-modal', 'true');
      div.setAttribute('aria-labelledby', 'afm-title');
      const isHistory = pageKey === 'history';
      const pressed = (on) => `aria-pressed="${on ? 'true' : 'false'}"`;
      
      const renderContent = () => {
        div.innerHTML = `
          <div class="modal-content" style="padding: 0; display: flex; flex-direction: column;">
            <div class="modal-top-bar">
              <button class="modal-btn-top modal-btn-close" id="afm-close">${window.I18n.t('common.cancel')}</button>
              <h3 id="afm-title" style="font-weight: 800; font-size: 1rem;">${window.I18n.t(isHistory ? 'filter.filterAndSort' : 'filters.openAria')}</h3>
              <button class="modal-btn-top" id="afm-apply">${window.I18n.t('range.apply')}</button>
            </div>

            <div class="modal-body" style="padding: var(--space-4) var(--space-5) 40px;">
              <div style="margin-bottom: var(--space-4); display: flex; justify-content: flex-end;">
                <button id="afm-show-all" class="afm-reset">${window.I18n.t('filterModal.reset')}</button>
              </div>

              ${isHistory ? `
              <div class="filter-group-title" style="margin-top: 0;">${window.I18n.t('filterModal.order')}</div>
              <div class="multi-select-row" role="group" aria-label="${window.I18n.t('filterModal.order')}">
                <button class="multi-select-chip ${currentFilters.sortOrder === 'asc' ? 'active' : ''}" data-sort="asc" ${pressed(currentFilters.sortOrder === 'asc')}>${window.I18n.t('history.oldestFirst')}</button>
                <button class="multi-select-chip ${currentFilters.sortOrder === 'desc' ? 'active' : ''}" data-sort="desc" ${pressed(currentFilters.sortOrder === 'desc')}>${window.I18n.t('history.newestFirst')}</button>
              </div>` : ''}

              <div class="filter-group-title"${isHistory ? '' : ' style="margin-top: 0;"'}>${window.I18n.t('filterModal.txType')}</div>
              <div class="multi-select-row">
                <button class="multi-select-chip ${currentFilters.types.includes('income') ? 'active' : ''}" data-type="income" ${pressed(currentFilters.types.includes('income'))}>${window.I18n.t('form.income')}</button>
                <button class="multi-select-chip ${currentFilters.types.includes('expense') ? 'active' : ''}" data-type="expense" ${pressed(currentFilters.types.includes('expense'))}>${window.I18n.t('form.expense')}</button>
              </div>

              <div class="filter-group-title">${window.I18n.t('filterModal.accounts')}</div>
              <div class="multi-select-row">
                ${accounts.map(acc => `
                  <button class="multi-select-chip ${currentFilters.accounts.includes(acc.id) ? 'active' : ''}" data-acc="${esc(acc.id)}" ${pressed(currentFilters.accounts.includes(acc.id))}>
                    ${esc(acc.name)}
                  </button>
                `).join('')}
              </div>

              <div class="filter-group-title">${window.I18n.t('others.categories')}</div>
              <div class="multi-select-row">
                ${categories.map(cat => `
                  <button class="multi-select-chip ${currentFilters.categories.includes(cat.id) ? 'active' : ''}" data-cat="${esc(cat.id)}" ${pressed(currentFilters.categories.includes(cat.id))}>
                    ${esc(cat.name)}
                  </button>
                `).join('')}
              </div>

              ${(currentFilters.tags && currentFilters.tags.length) ? `
                <div class="filter-group-title">${window.I18n.t('form.tags')}</div>
                <div class="multi-select-row">
                  ${currentFilters.tags.map(tag => `
                    <button class="multi-select-chip active" data-tag="${esc(tag)}" aria-label="${window.I18n.t('filterModal.removeTagAria')}">
                      ${tag === '__untagged__' ? window.I18n.t('history.noTag') : '#' + esc(tag)} ✕
                    </button>
                  `).join('')}
                </div>
              ` : ''}
            </div>
          </div>
        `;

        // Attach events
        div.querySelector('#afm-close').onclick = close;
        div.querySelector('#afm-apply').onclick = apply;
        
        // 1.2.2 (HG-10 P4) Reset (was SHOW ALL) clears the filters only — the
        // order is a preference and stays
        div.querySelector('#afm-show-all').onclick = () => {
          currentFilters.types = [];
          currentFilters.accounts = [];
          currentFilters.categories = [];
          currentFilters.tags = []; // v0.85: a drilled-in tag filter must clear too
          renderContent();
        };

        // Tag chips are removal-only: they appear when a drilldown deep-links
        // a tag, so the filter is visible and dismissible rather than sticky.
        div.querySelectorAll('.multi-select-chip[data-tag]').forEach(btn => {
          btn.onclick = () => {
            const val = btn.dataset.tag;
            currentFilters.tags = (currentFilters.tags || []).filter(v => v !== val);
            renderContent();
          };
        });

        div.querySelectorAll('.multi-select-chip[data-sort]').forEach(btn => {
          btn.onclick = () => { currentFilters.sortOrder = btn.dataset.sort; renderContent(); };
        });

        div.querySelectorAll('.multi-select-chip[data-type]').forEach(btn => {
          btn.onclick = () => {
            const val = btn.dataset.type;
            if (currentFilters.types.includes(val)) currentFilters.types = currentFilters.types.filter(v => v !== val);
            else currentFilters.types.push(val);
            renderContent();
          };
        });

        div.querySelectorAll('.multi-select-chip[data-acc]').forEach(btn => {
          btn.onclick = () => {
            const val = btn.dataset.acc;
            if (currentFilters.accounts.includes(val)) currentFilters.accounts = currentFilters.accounts.filter(v => v !== val);
            else currentFilters.accounts.push(val);
            renderContent();
          };
        });

        div.querySelectorAll('.multi-select-chip[data-cat]').forEach(btn => {
          btn.onclick = () => {
            const val = btn.dataset.cat;
            if (currentFilters.categories.includes(val)) currentFilters.categories = currentFilters.categories.filter(v => v !== val);
            else currentFilters.categories.push(val);
            renderContent();
          };
        });
      };

      const apply = () => {
        // 1.0.2 (BUG-69) this sheet never edits the period: sending back the
        // snapshot taken at open would undo a roll that happened meanwhile.
        // 1.2.2 (HG-10 P4) Analytics has no order, so it sends none either.
        const { period: _period, sortOrder: _sort, ...rest } = currentFilters;
        window.Store.dispatch('UPDATE_FILTERS', {
          page: pageKey,
          filters: isHistory ? { ...rest, sortOrder: currentFilters.sortOrder } : rest
        });
        close();
      };

      const onKey = (e) => {
        if (e.key === 'Escape' && div.isConnected) { e.preventDefault(); e.stopPropagation(); close(); }
      };
      const close = () => {
        div.classList.remove('open');
        document.removeEventListener('keydown', onKey, true);
        setTimeout(() => div.remove(), 300);
        const back = document.getElementById(`btn-filter-${pageKey}`);
        if (back) back.focus({ preventScroll: true });
      };

      renderContent();
      // 1.2.2 (HG-10 P4) a backdrop tap and Escape close it (no change), like
      // the Period sheet; focus starts on Cancel
      div.addEventListener('click', (e) => { if (e.target === div) close(); });
      document.addEventListener('keydown', onKey, true);
      container.appendChild(div);
      requestAnimationFrame(() => div.classList.add('open'));
      const first = div.querySelector('#afm-close');
      if (first) first.focus({ preventScroll: true });
    }
  },

  RecurringCreationModal: {
    show(options) {
      const { onlyThis, allTransactions } = options;
      const container = document.getElementById('modal-container');

      const div = document.createElement('div');
      div.innerHTML = `
        <div class="modal-backdrop" id="recurring-creation-modal" role="dialog" aria-modal="true" aria-labelledby="rcm-title">
          <div class="modal-content" style="padding: 0; overflow: hidden;">
            <div class="modal-handle"></div>
            <div style="padding: var(--space-5) var(--space-5) var(--space-2);">
              <h2 id="rcm-title" class="header-title" style="margin: 0 0 var(--space-1); font-size: var(--text-xl);">${window.I18n.t('recCreate.title')}</h2>
              <p style="color: var(--text-secondary); font-size: var(--text-sm); margin: 0;">${window.I18n.t('recCreate.body')}</p>
            </div>

            <div style="display: flex; flex-direction: column; padding: var(--space-3) var(--space-4) var(--space-5); gap: var(--space-2);">

              <!-- Option 1: Only this -->
              <button id="rcm-only-this" class="touch-target" style="
                display: flex; align-items: center; gap: var(--space-4);
                background: var(--bg-surface); border: 1px solid var(--border-color);
                border-radius: var(--radius-lg); padding: var(--space-4);
                cursor: pointer; text-align: left; width: 100%;
              ">
                <div style="width: 40px; height: 40px; border-radius: 14px; background: var(--bg-surface-sunken); display: flex; align-items: center; justify-content: center; color: var(--text-secondary); flex-shrink: 0;"><i data-lucide="pin" style="width: 20px; height: 20px;"></i></div>
                <div style="flex: 1;">
                  <div style="font-weight: 600; color: var(--text-primary); font-size: var(--text-base);">${window.I18n.t('recCreate.onlyThis')}</div>
                  <div style="color: var(--text-secondary); font-size: var(--text-sm); margin-top: 2px;">${window.I18n.t('recCreate.onlyThisDesc')}</div>
                </div>
                <i data-lucide="chevron-right" style="color: var(--text-tertiary); width: 20px; height: 20px;"></i>
              </button>

              <!-- Option 2: All transactions -->
              <button id="rcm-all" class="touch-target" style="
                display: flex; align-items: center; gap: var(--space-4);
                background: var(--bg-surface); border: 1px solid var(--border-color);
                border-radius: var(--radius-lg); padding: var(--space-4);
                cursor: pointer; text-align: left; width: 100%;
              ">
                <div style="width: 40px; height: 40px; border-radius: 14px; background: var(--color-income-bg); display: flex; align-items: center; justify-content: center; color: var(--color-income-text); flex-shrink: 0;"><i data-lucide="refresh-cw" style="width: 20px; height: 20px;"></i></div>
                <div style="flex: 1;">
                  <div style="font-weight: 600; color: var(--text-primary); font-size: var(--text-base);">${window.I18n.t('recCreate.all')}</div>
                  <div style="color: var(--text-secondary); font-size: var(--text-sm); margin-top: 2px;">${window.I18n.t('recCreate.allDesc')}</div>
                </div>
                <i data-lucide="chevron-right" style="color: var(--text-tertiary); width: 20px; height: 20px;"></i>
              </button>

              <!-- Cancel -->
              <button id="rcm-cancel" data-back-dismiss class="btn btn-secondary" style="margin-top: var(--space-1);">${window.I18n.t('common.cancel')}</button>
            </div>
          </div>
        </div>`;
      // v0.67: drop any stale instance so a double-tapped Save can't stack
      // listeners and dispatch the series twice
      const existingRcm = document.getElementById('recurring-creation-modal');
      if (existingRcm) existingRcm.remove();
      container.appendChild(div.firstElementChild);

      requestAnimationFrame(() => {
        const backdrop = document.getElementById('recurring-creation-modal');
        if (backdrop) backdrop.classList.add('open');
      });

      const close = () => {
        const backdrop = document.getElementById('recurring-creation-modal');
        if (backdrop) {
          backdrop.classList.remove('open');
          setTimeout(() => { backdrop.remove(); }, 300);
        }
      };

      const btnOnly = document.getElementById('rcm-only-this');
      if (btnOnly) btnOnly.addEventListener('click', () => { close(); if (onlyThis) onlyThis(); });
      
      const btnAll = document.getElementById('rcm-all');
      if (btnAll) btnAll.addEventListener('click', () => { close(); if (allTransactions) allTransactions(); });
      
      const btnCancel = document.getElementById('rcm-cancel');
      if (btnCancel) btnCancel.addEventListener('click', close);
      
      const modalBackdrop = document.getElementById('recurring-creation-modal');
      if (modalBackdrop) {
        modalBackdrop.addEventListener('click', (e) => {
          if (e.target.id === 'recurring-creation-modal') close();
        });
      }
    }
  },

  // -----------------------------------------------------------------------
  // RECURRING DELETE MODAL (v0.32)
  // Shows a 3-choice bottom-sheet styled for destruction when deleting a
  // transaction embedded in a recurrent series.
  // -----------------------------------------------------------------------
  RecurringDeleteModal: {
    show(options) {
      const { onlyThis, thisAndFuture, allTransactions } = options;
      const container = document.getElementById('modal-container');

      const div = document.createElement('div');
      div.innerHTML = `
        <div class="modal-backdrop" id="recurring-delete-modal" role="dialog" aria-modal="true" aria-labelledby="rdm-title">
          <div class="modal-content" style="padding: 0; overflow: hidden;">
            <div class="modal-handle"></div>
            <div style="padding: var(--space-5) var(--space-5) var(--space-2);">
              <h2 id="rdm-title" class="header-title" style="margin: 0 0 var(--space-1); font-size: var(--text-xl); color: var(--color-expense);">${window.I18n.t('recDelete.title')}</h2>
              <p style="color: var(--text-secondary); font-size: var(--text-sm); margin: 0;">${window.I18n.t('recDelete.body')}</p>
            </div>

            <div style="display: flex; flex-direction: column; padding: var(--space-3) var(--space-4) var(--space-5); gap: var(--space-2);">

              <!-- Option 1: Only this -->
              <button id="rdm-only-this" class="touch-target" style="
                display: flex; align-items: center; gap: var(--space-4);
                background: var(--color-expense-bg); border: 1px solid rgba(255, 68, 68, 0.2);
                border-radius: var(--radius-lg); padding: var(--space-4);
                cursor: pointer; text-align: left; width: 100%;
              ">
                <div style="flex: 1;">
                  <div style="font-weight: 600; color: var(--color-expense); font-size: var(--text-base);">${window.I18n.t('recDelete.onlyThis')}</div>
                  <div style="color: var(--color-expense); font-size: var(--text-sm); margin-top: 2px;">${window.I18n.t('recDelete.onlyThisSub')}</div>
                </div>
              </button>

              <!-- Option 2: This and future -->
              <button id="rdm-and-future" class="touch-target" style="
                display: flex; align-items: center; gap: var(--space-4);
                background: var(--color-expense-bg); border: 1px solid rgba(255, 68, 68, 0.2);
                border-radius: var(--radius-lg); padding: var(--space-4);
                cursor: pointer; text-align: left; width: 100%;
              ">
                <div style="flex: 1;">
                  <div style="font-weight: 600; color: var(--color-expense); font-size: var(--text-base);">${window.I18n.t('recDelete.thisFuture')}</div>
                  <div style="color: var(--color-expense); font-size: var(--text-sm); margin-top: 2px;">${window.I18n.t('recDelete.thisFutureSub')}</div>
                </div>
              </button>

              <!-- Option 3: All transactions -->
              <button id="rdm-all" class="touch-target" style="
                display: flex; align-items: center; gap: var(--space-4);
                background: var(--color-expense-bg); border: 1px solid rgba(255, 68, 68, 0.2);
                border-radius: var(--radius-lg); padding: var(--space-4);
                cursor: pointer; text-align: left; width: 100%;
              ">
                <div style="flex: 1;">
                  <div style="font-weight: 600; color: var(--color-expense); font-size: var(--text-base);">${window.I18n.t('recDelete.all')}</div>
                  <div style="color: var(--color-expense); font-size: var(--text-sm); margin-top: 2px;">${window.I18n.t('recDelete.allSub')}</div>
                </div>
              </button>

              <!-- Cancel -->
              <button id="rdm-cancel" data-back-dismiss class="btn btn-secondary" style="margin-top: var(--space-1);">${window.I18n.t('common.cancel')}</button>
            </div>
          </div>
        </div>`;
      // v0.67: same duplicate-instance guard as RecurringUpdateModal
      const existingRdm = document.getElementById('recurring-delete-modal');
      if (existingRdm) existingRdm.remove();
      container.appendChild(div.firstElementChild);

      const backdrop = document.getElementById('recurring-delete-modal');
      const modalContent = backdrop.querySelector('.modal-content');

      // Swipe-to-dismiss Logic
      let startY = 0;
      let currentY = 0;
      let isDragging = false;

      const onStart = (e) => {
        startY = e.touches[0].clientY;
        isDragging = true;
        modalContent.style.transition = 'none';
      };

      const onMove = (e) => {
        if (!isDragging) return;
        currentY = e.touches[0].clientY - startY;
        if (currentY > 0) {
          modalContent.style.transform = `translateY(${currentY}px)`;
        }
      };

      const onEnd = () => {
        isDragging = false;
        modalContent.style.transition = 'transform 0.3s cubic-bezier(0.16, 1, 0.3, 1)';
        if (currentY > 150) {
          modalContent.style.transform = `translateY(100%)`;
          setTimeout(() => close(), 200);
        } else {
          modalContent.style.transform = `translateY(0)`;
        }
        currentY = 0;
      };

      backdrop.addEventListener('touchstart', onStart, { passive: true });
      backdrop.addEventListener('touchmove', onMove, { passive: true });
      backdrop.addEventListener('touchend', onEnd);

      requestAnimationFrame(() => {
        if (backdrop) backdrop.classList.add('open');
      });

      const close = () => {
        const backdrop = document.getElementById('recurring-delete-modal');
        if (backdrop) {
          backdrop.classList.remove('open');
          setTimeout(() => { backdrop.remove(); }, 300);
        }
      };

      const btnOnly = document.getElementById('rdm-only-this');
      if (btnOnly) btnOnly.addEventListener('click', () => { close(); if (onlyThis) onlyThis(); });
      
      const btnFuture = document.getElementById('rdm-and-future');
      if (btnFuture) btnFuture.addEventListener('click', () => { close(); if (thisAndFuture) thisAndFuture(); });
      
      const btnAll = document.getElementById('rdm-all');
      if (btnAll) btnAll.addEventListener('click', () => { close(); if (allTransactions) allTransactions(); });
      
      const btnCancel = document.getElementById('rdm-cancel');
      if (btnCancel) btnCancel.addEventListener('click', close);
      
      const modalBackdrop = document.getElementById('recurring-delete-modal');
      if (modalBackdrop) {
        modalBackdrop.addEventListener('click', (e) => {
          if (e.target.id === 'recurring-delete-modal') close();
        });
      }
    }
  },
  RecurringSettingsModal: {
    show(options) {
      const { initialRecurrence, onSave } = options;
      const container = document.getElementById('modal-container');
      
      let recurrence = initialRecurrence || {
        enabled: false,
        period: 'monthly',
        startDate: window.Store._todayYMD(), // 1.0.2 (D-U4-7) local day, not the UTC day
        endDate: '',
        interval: 1,
        frequency: 'months' // matches store freq parameter
      };

      // Helper to map frequency pill to store logic
      const mapFreq = (pill) => {
        switch(pill) {
          case 'weekly': return { interval: 1, frequency: 'weeks' };
          case 'biweekly': return { interval: 2, frequency: 'weeks' };
          case 'monthly': return { interval: 1, frequency: 'months' };
          case 'quarterly': return { interval: 3, frequency: 'months' };
          case 'yearly': return { interval: 1, frequency: 'years' };
          default: return { interval: 1, frequency: 'months' };
        }
      };

      const renderContent = () => {
        const title = window.I18n.t(recurrence.enabled ? 'recSettings.editTitle' : 'recSettings.title');
        const isWeekly = recurrence.period === 'weekly';
        const isBiWeekly = recurrence.period === 'biweekly';
        const isMonthly = recurrence.period === 'monthly';
        const isQuarterly = recurrence.period === 'quarterly';
        const isYearly = recurrence.period === 'yearly';

        const div = document.createElement('div');
        div.innerHTML = `
          <div class="modal-backdrop" id="recurring-settings-modal" role="dialog" aria-modal="true">
            <div class="modal-content" style="padding: 0; overflow: hidden;">
              <div class="modal-handle"></div>
              <div style="padding: var(--space-5) var(--space-5) var(--space-2);">
                <h2 class="header-title" style="margin: 0 0 var(--space-1); font-size: var(--text-xl);">${title}</h2>
                <p style="color: var(--text-secondary); font-size: var(--text-sm); margin: 0;">${window.I18n.t('recSettings.body')}</p>
              </div>

              <div style="display: flex; flex-direction: column; padding: var(--space-4) var(--space-5) var(--space-6); gap: var(--space-5);">
                
                <!-- Toggle: Enable Recurring -->
                <div style="display: flex; align-items: center; justify-content: space-between;">
                  <div>
                    <div style="font-weight: 600; color: var(--text-primary);">${window.I18n.t('recSettings.enable')}</div>
                    <div style="font-size: var(--text-xs); color: var(--text-tertiary); margin-top: 2px;">${window.I18n.t('recSettings.enableSub')}</div>
                  </div>
                  <div style="display: flex; background: var(--bg-surface-sunken); border-radius: 20px; padding: 2px;">
                    <button id="rs-toggle-off" class="btn hit-target" style="padding: 4px 12px; font-size: 11px; min-height: 0; height: 28px; border-radius: 18px; ${!recurrence.enabled ? 'background: var(--color-accent); color: white;' : 'background: transparent; color: var(--text-secondary);'}">OFF</button>
                    <button id="rs-toggle-on" class="btn hit-target" style="padding: 4px 12px; font-size: 11px; min-height: 0; height: 28px; border-radius: 18px; ${recurrence.enabled ? 'background: var(--color-accent); color: white;' : 'background: transparent; color: var(--text-secondary);'}">ON</button>
                  </div>
                </div>

                <div id="rs-config-area" style="display: ${recurrence.enabled ? 'flex' : 'none'}; flex-direction: column; gap: var(--space-5); transition: all 0.3s ease;">
                  
                  <!-- Frequency Pills -->
                  <div>
                    <label class="form-label" style="font-size: var(--text-xs); text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-tertiary); margin-bottom: var(--space-3); display: block;">${window.I18n.t('debt.frequency')}</label>
                    <div style="display: flex; flex-wrap: wrap; gap: 8px;">
                      <button class="freq-pill ${isWeekly ? 'active' : ''}" data-freq="weekly">${window.I18n.t('recSettings.weekly')}</button>
                      <button class="freq-pill ${isBiWeekly ? 'active' : ''}" data-freq="biweekly">Every 2 Weeks</button>
                      <button class="freq-pill ${isMonthly ? 'active' : ''}" data-freq="monthly">${window.I18n.t('recSettings.monthly')}</button>
                      <button class="freq-pill ${isQuarterly ? 'active' : ''}" data-freq="quarterly">${window.I18n.t('recSettings.quarterly')}</button>
                      <button class="freq-pill ${isYearly ? 'active' : ''}" data-freq="yearly">${window.I18n.t('recSettings.yearly')}</button>
                    </div>
                  </div>

                  <!-- Dates -->
                  <div style="display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-4);">
                    <div class="form-group" style="margin-bottom: 0;">
                      <label class="form-label" for="rs-start-date">${window.I18n.t('range.startDate')}</label>
                      <input type="date" id="rs-start-date" class="form-control" value="${recurrence.startDate}">
                    </div>
                    <div class="form-group" style="margin-bottom: 0;">
                      <label class="form-label" for="rs-end-date">${window.I18n.t('recSettings.endsOn')}</label>
                      <input type="date" id="rs-end-date" class="form-control" value="${recurrence.endDate || ''}">
                    </div>
                  </div>

                  <!-- Warning -->
                  <div id="rs-warning" style="display: none; background: var(--color-expense-bg); color: var(--color-expense); padding: var(--space-3); border-radius: var(--radius-md); font-size: var(--text-xs); line-height: 1.4; border: 1px solid rgba(255, 68, 68, 0.1);">
                    <div style="display: flex; gap: 8px;">
                      <i data-lucide="alert-circle" style="width: 14px; height: 14px; flex-shrink: 0;"></i>
                      <span>${window.I18n.t('recSettings.cap', { years: '<strong>' + window.I18n.t('recSettings.capYears') + '</strong>' })}</span>
                    </div>
                  </div>
                </div>

                <div style="display: flex; gap: var(--space-3); margin-top: var(--space-2);">
                  <button id="rs-cancel" data-back-dismiss class="btn btn-secondary" style="flex: 1;">${window.I18n.t('common.cancel')}</button>
                  <button id="rs-save" class="btn btn-primary" style="flex: 2;">${window.I18n.t('recSettings.saveRules')}</button>
                </div>
              </div>
            </div>
            <style>
              .freq-pill {
                padding: 6px 14px;
                border-radius: 20px;
                background: var(--bg-surface-sunken);
                border: 1px solid var(--border-color);
                font-size: 13px;
                font-weight: 600;
                color: var(--text-secondary);
                cursor: pointer;
                transition: all 0.2s;
              }
              .freq-pill.active {
                background: var(--color-primary);
                color: var(--text-on-primary) !important;
                border-color: var(--color-primary);
              }
              .freq-pill:hover:not(.active) {
                border-color: var(--text-tertiary);
              }
            </style>
          </div>`;
        
        const existing = document.getElementById('recurring-settings-modal');
        if (existing) existing.remove();
        container.appendChild(div.firstElementChild);
        window.StackdHydrateIcons?.();
        attachInternalEvents();
      };

      const attachInternalEvents = () => {
        const close = () => {
          const backdrop = document.getElementById('recurring-settings-modal');
          if (backdrop) {
            backdrop.classList.remove('open');
            setTimeout(() => { backdrop.remove(); }, 300);
          }
        };

        document.getElementById('rs-toggle-off').onclick = () => {
          recurrence.enabled = false;
          renderContent();
          document.getElementById('recurring-settings-modal').classList.add('open');
        };
        document.getElementById('rs-toggle-on').onclick = () => {
          recurrence.enabled = true;
          renderContent();
          document.getElementById('recurring-settings-modal').classList.add('open');
        };

        document.querySelectorAll('.freq-pill').forEach(pill => {
          pill.onclick = () => {
            recurrence.period = pill.dataset.freq;
            const mapped = mapFreq(recurrence.period);
            recurrence.interval = mapped.interval;
            recurrence.frequency = mapped.frequency;
            renderContent();
            document.getElementById('recurring-settings-modal').classList.add('open');
          };
        });

        const startDateInput = document.getElementById('rs-start-date');
        if (startDateInput) {
          startDateInput.onchange = (e) => { recurrence.startDate = e.target.value; };
        }

        const endDateInput = document.getElementById('rs-end-date');
        if (endDateInput) {
          endDateInput.onchange = (e) => {
            recurrence.endDate = e.target.value;
            checkWarning();
          };
        }

        const checkWarning = () => {
          const warning = document.getElementById('rs-warning');
          if (!warning || !recurrence.startDate || !recurrence.endDate) return;
          
          const start = new Date(recurrence.startDate);
          const end = new Date(recurrence.endDate);
          const diffMonths = (end.getFullYear() - start.getFullYear()) * 12
                           + (end.getMonth() - start.getMonth());
          warning.style.display = diffMonths > 60 ? 'block' : 'none';
        };

        document.getElementById('rs-save').onclick = () => {
          if (onSave) onSave(recurrence);
          close();
        };

        document.getElementById('rs-cancel').onclick = close;

        const backdropEl = document.getElementById('recurring-settings-modal');
        if (backdropEl) {
          backdropEl.onclick = (e) => { if (e.target.id === 'recurring-settings-modal') close(); };
          requestAnimationFrame(() => backdropEl.classList.add('open'));
        }
        
        checkWarning();
      };

      renderContent();
    }
  },



  FrequencyPicker: {
    show(options) {
      const { initialInterval = 1, initialFreq = 'months', onSelect } = options;
      const container = document.getElementById('modal-container');
      
      const freqs = [
        { id: 'days', label: window.I18n.t('freqPicker.days') },
        { id: 'weeks', label: window.I18n.t('freqPicker.weeks') },
        { id: 'months', label: window.I18n.t('freqPicker.months') },
        { id: 'years', label: window.I18n.t('freqPicker.years') }
      ];
      
      const intervals = Array.from({ length: 30 }, (_, i) => i + 1);
      
      let initFreqIdx = freqs.findIndex(f => f.id === initialFreq);
      if (initFreqIdx === -1) initFreqIdx = 2; // Default to months
      
      let initIntervalIdx = intervals.indexOf(initialInterval);
      if (initIntervalIdx === -1) initIntervalIdx = 0; // Default to 1
      
      const div = document.createElement('div');
      div.innerHTML = `
        <div class="modal-backdrop" id="active-freq-picker" style="z-index: 10000;" role="dialog" aria-modal="true" aria-labelledby="fp-title">
          <div class="modal-content" style="padding: 0; overflow: hidden; display: flex; flex-direction: column;">
            <!-- 1.0.1 (BUG-23): .btn is width:100%, which squeezed the title to
                 one word per line; the header buttons size to their content
                 and the title takes the remaining space (wraps only as a
                 last resort, centred). -->
            <div style="padding: 16px; border-bottom: 1px solid var(--border-color); display: flex; justify-content: space-between; align-items: center; gap: var(--space-3);">
              <button class="btn btn-secondary" id="fp-cancel" data-back-dismiss style="width: auto; flex-shrink: 0; padding: 8px 14px; font-size: var(--text-sm);" aria-label="${window.I18n.t('freqPicker.cancelAria')}">${window.I18n.t('common.cancel')}</button>
              <h3 id="fp-title" style="margin: 0; flex: 1; min-width: 0; text-align: center; line-height: 1.25; font-size: 1.1rem; font-family: var(--font-family-display);">${window.I18n.t('freqPicker.title')}</h3>
              <button class="btn btn-primary" id="fp-confirm" style="width: auto; flex-shrink: 0; padding: 8px 14px; font-size: var(--text-sm);" aria-label="${window.I18n.t('freqPicker.confirmAria')}">${window.I18n.t('common.done')}</button>
            </div>
            
            <div style="position: relative; display: flex; height: 200px; background: var(--bg-surface);">
              <!-- Highlight bar in the center -->
              <div style="position: absolute; top: 80px; height: 40px; width: 100%; background: var(--bg-surface-sunken); opacity: 0.6; pointer-events: none; border-top: 1px solid var(--border-color); border-bottom: 1px solid var(--border-color);"></div>
              
              <!-- Interval Column -->
              <div id="fp-col-interval" style="flex: 1; overflow-y: scroll; scroll-snap-type: y mandatory; padding: 80px 0; scrollbar-width: none; text-align: center;">
                ${intervals.map(i => `<div class="fp-item" style="height: 40px; line-height: 40px; scroll-snap-align: center; font-size: 1.2rem; font-family: var(--font-family-display); font-weight: 500;">${i}</div>`).join('')}
              </div>
              
              <!-- Frequency Column -->
              <div id="fp-col-freq" style="flex: 1; overflow-y: scroll; scroll-snap-type: y mandatory; padding: 80px 0; scrollbar-width: none; text-align: center;">
                ${freqs.map(f => `<div class="fp-item" data-val="${f.id}" style="height: 40px; line-height: 40px; scroll-snap-align: center; font-size: 1.2rem; font-family: var(--font-family-display); font-weight: 500;">${f.label}</div>`).join('')}
              </div>
            </div>
            <style>
              #fp-col-interval::-webkit-scrollbar { display: none; }
              #fp-col-freq::-webkit-scrollbar { display: none; }
              /* 1.0.1 (BUG-23): the absolutely positioned highlight band used to
                 paint OVER the non-positioned columns at 60% opacity, greying
                 the selected row. Lift the (transparent) columns above it, and
                 fade rows away from the centre band so the selection reads as
                 emphasised. The mask is fixed to the scroller box: no scroll
                 listener needed. */
              #fp-col-interval, #fp-col-freq {
                position: relative;
                z-index: 1;
                -webkit-mask-image: linear-gradient(to bottom, rgba(0,0,0,.3), #000 40%, #000 60%, rgba(0,0,0,.3));
                mask-image: linear-gradient(to bottom, rgba(0,0,0,.3), #000 40%, #000 60%, rgba(0,0,0,.3));
              }
            </style>
          </div>
        </div>`;
      container.appendChild(div.firstElementChild);
      
      requestAnimationFrame(() => {
        const backdrop = document.getElementById('active-freq-picker');
        if (backdrop) backdrop.classList.add('open');
        
        const iCol = document.getElementById('fp-col-interval');
        const fCol = document.getElementById('fp-col-freq');
        
        if (iCol && fCol) {
          iCol.scrollTop = initIntervalIdx * 40;
          fCol.scrollTop = initFreqIdx * 40;
        }
      });

      const closePicker = () => {
        const backdrop = document.getElementById('active-freq-picker');
        if (backdrop) {
          backdrop.classList.remove('open');
          setTimeout(() => { backdrop.remove(); }, 300);
        }
      };
      const btnCancel = document.getElementById('fp-cancel');
      if (btnCancel) {
        btnCancel.addEventListener('click', closePicker);
      }

      const btnConfirm = document.getElementById('fp-confirm');
      if (btnConfirm) {
        btnConfirm.addEventListener('click', () => {
          const iCol = document.getElementById('fp-col-interval');
          const fCol = document.getElementById('fp-col-freq');
          const selectedInterval = Math.round(iCol.scrollTop / 40) + 1;
          const fIdx = Math.round(fCol.scrollTop / 40);
          const selectedFreq = freqs[fIdx] || freqs[0];
          
          if (onSelect) onSelect({ interval: selectedInterval, frequency: selectedFreq.id });
          closePicker();
        });
      }
    }
  },

  // -----------------------------------------------------------------------
  // LIST PICKER (v0.52)
  // Reusable bottom-sheet picker for selecting from a list of options.
  // Includes an 'X' button in the top right for navigation back.
  // -----------------------------------------------------------------------
  // 1.3.0 (PL-2, docs/privacy-currencies-plan.md §3): the one currency list.
  // Suggested (the phone's region, the current choice, the five originals),
  // then every other currency by name; typing filters by code, name or symbol
  // into one flat list. Hosts: CurrencyPicker below (Settings and the account
  // form — two-step: pick, then Done) and the onboarding sheet in main.js
  // (a pick is the choice). Row markup is the host's class + .currency-row.
  CurrencyList: {
    _rows: null,
    _rowsLocale: null,
    _fold(s) {
      return String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    },
    _row(code) {
      const S = window.Store;
      const row = { code, name: S.currencyName(code), symbol: S.getCurrencySymbol(code) };
      row.key = this._fold(row.code + ' ' + row.name + ' ' + row.symbol);
      return row;
    },
    rows() {
      const S = window.Store;
      const loc = S.getLocale();
      if (this._rows && this._rowsLocale === loc) return this._rows;
      const rows = S.CURRENCY_CODES.map(code => this._row(code));
      let cmp;
      try { cmp = new Intl.Collator(loc).compare; } catch (e) { cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0); }
      rows.sort((a, b) => cmp(a.name, b.name));
      this._rows = rows;
      this._rowsLocale = loc;
      return rows;
    },
    // The short list on top. `selected` may be a code the list does not
    // carry (an imported account's): it is offered all the same.
    suggested(selected) {
      const S = window.Store;
      const out = [];
      [S.regionCurrency(), selected, 'USD', 'EUR', 'GBP', 'JPY', 'CNY'].forEach(c => {
        if (S.isCurrencyCode(c) && !out.includes(c)) out.push(c);
      });
      return out;
    },
    _rowHtml(row, o) {
      const esc = window.I18n.esc;
      const on = row.code === o.selected;
      const label = row.name && row.name !== row.code ? `${row.code} — ${row.name}` : row.code;
      const role = o.role === 'radio' ? `role="radio" aria-checked="${on ? 'true' : 'false'}"` : 'role="button"';
      return `<div class="currency-row ${o.rowClass}${on ? ' is-selected' : ''}" data-code="${esc(row.code)}" tabindex="0" ${role}>
        <span class="currency-row-symbol" aria-hidden="true">${esc(row.symbol)}</span>
        <span class="currency-row-label">${esc(label)}</span>
        ${on ? '<span class="currency-row-check" aria-hidden="true">✓</span>' : ''}
      </div>`;
    },
    listHtml(o) {
      const t = (k) => window.I18n.t(k);
      const all = this.rows();
      const q = this._fold(o.query || '').trim();
      if (q) {
        const hits = all.filter(r => r.key.includes(q));
        if (o.selected && !all.some(r => r.code === o.selected)) {
          const own = this._row(o.selected);
          if (own.key.includes(q)) hits.unshift(own);
        }
        return hits.length
          ? hits.map(r => this._rowHtml(r, o)).join('')
          : `<p class="currency-empty" role="status">${t('currencyPicker.none')}</p>`;
      }
      const top = this.suggested(o.selected);
      const byCode = Object.create(null);
      all.forEach(r => { byCode[r.code] = r; });
      return `<div class="currency-group-title">${t('currencyPicker.suggested')}</div>`
        + top.map(c => this._rowHtml(byCode[c] || this._row(c), o)).join('')
        + `<div class="currency-group-title">${t('currencyPicker.more')}</div>`
        + all.filter(r => !top.includes(r.code)).map(r => this._rowHtml(r, o)).join('');
    },
    // o: { selected, rowClass, role: 'radio' | 'button' }
    html(o) {
      const t = (k) => window.I18n.t(k);
      const group = o.role === 'radio' ? ` role="radiogroup" aria-label="${t('others.chooseCurrency')}"` : '';
      return `<div class="currency-list">
        <input type="search" id="currency-search" class="form-control currency-search" placeholder="${t('currencyPicker.search')}" aria-label="${t('currencyPicker.search')}" autocomplete="off" autocapitalize="none" autocorrect="off" spellcheck="false" maxlength="40" enterkeyhint="search">
        <div class="currency-list-scroll" id="currency-opts"${group}>${this.listHtml(o)}</div>
      </div>`;
    },
    // Wires a list written by html(). onPick(code) runs on every pick; the
    // list then redraws with the new selection (unless the host removed it).
    bind(root, o) {
      const box = root && root.querySelector('#currency-opts');
      const search = root && root.querySelector('#currency-search');
      if (!box) return;
      const state = { selected: o.selected, rowClass: o.rowClass, role: o.role, query: '' };
      const draw = () => { box.innerHTML = this.listHtml(state); };
      const pick = (el) => {
        state.selected = el.dataset.code;
        if (typeof o.onPick === 'function') o.onPick(state.selected);
        if (!box.isConnected) return;
        draw();
        const chosen = Array.from(box.querySelectorAll('.currency-row')).find(r => r.dataset.code === state.selected);
        if (chosen) chosen.focus();
      };
      box.addEventListener('click', (e) => {
        const el = e.target.closest && e.target.closest('.currency-row');
        if (el) pick(el);
      });
      box.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        const el = e.target.closest && e.target.closest('.currency-row');
        if (el) { e.preventDefault(); pick(el); }
      });
      // a drag inside the list scrolls it — it must not swipe the sheet away
      box.addEventListener('touchstart', (e) => e.stopPropagation(), { passive: true });
      if (search) {
        search.addEventListener('input', () => { state.query = search.value; draw(); box.scrollTop = 0; });
        search.addEventListener('touchstart', (e) => e.stopPropagation(), { passive: true });
      }
    }
  },

  // 1.3.0 (PL-2): the currency sheet of Settings and the account form.
  // 1.0.1 (BUG-01) holds: a tap only SELECTS; Done continues; Cancel, the
  // backdrop, a swipe and Back leave with nothing applied. onDone(code, close)
  // runs only for a changed choice and owns closing (Settings hands off to
  // CurrencySwitchConfirm without close()).
  CurrencyPicker: {
    show({ title, selected, onDone }) {
      let picked = selected;
      window.Components.Modal.show({
        title: title || window.I18n.t('others.chooseCurrency'),
        content: window.Components.CurrencyList.html({ selected, rowClass: 'currency-opt', role: 'radio' }),
        saveText: window.I18n.t('common.done'),
        onSave: (close) => {
          if (picked === selected) { close(); return; }
          onDone(picked, close);
        }
      });
      // Modal.show writes the DOM synchronously, so bind right away.
      window.Components.CurrencyList.bind(document.getElementById('active-modal'), {
        selected, rowClass: 'currency-opt', role: 'radio', onPick: (code) => { picked = code; }
      });
    }
  },

  ListPicker: {
    show(options) {
      const { title, items, selectedValue, onSelect } = options;
      const container = document.getElementById('modal-container');
      if (!container) return;

      const div = document.createElement('div');
      
      const itemsHtml = items.map(item => `
        <div class="list-picker-item touch-target" data-value="${item.id}" style="
          display: flex; align-items: center; justify-content: space-between;
          padding: var(--space-4) var(--space-5); border-bottom: 1px solid var(--border-color);
          cursor: pointer; transition: background 0.2s;
        ">
          <span style="font-weight: 600; font-size: 1rem; color: ${item.id === selectedValue ? 'var(--color-primary)' : 'var(--text-primary)'};">
            ${window.Components.esc(item.name)}
          </span>
          ${item.id === selectedValue ? '<i data-lucide="check" style="width: 20px; height: 20px; color: var(--color-primary);"></i>' : ''}
        </div>
      `).join('');

      div.innerHTML = `
        <div class="modal-backdrop" id="active-list-picker" style="z-index: 10000;" role="dialog" aria-modal="true" aria-labelledby="lp-title">
          <div class="modal-content" style="padding: 0; overflow: hidden; display: flex; flex-direction: column; max-height: 80vh;">
            <div style="padding: var(--space-4) var(--space-5); border-bottom: 1px solid var(--border-color); display: flex; justify-content: space-between; align-items: center; background: var(--bg-surface);">
              <h3 id="lp-title" style="margin: 0; font-size: 1.1rem; font-family: var(--font-family-display); font-weight: 800;">${title}</h3>
              <button class="btn-icon touch-target" id="lp-close" data-back-dismiss aria-label="${window.I18n.t('picker.closeAria')}" style="color: var(--text-secondary); width: 44px; height: 44px; margin-right: -10px;">
                <i data-lucide="x" style="width: 24px; height: 24px;"></i>
              </button>
            </div>
            <div class="modal-body" style="padding: 0; overflow-y: auto;">
              ${itemsHtml}
            </div>
          </div>
        </div>
      `;
      
      container.appendChild(div.firstElementChild);
      if (window.StackdHydrateIcons) window.StackdHydrateIcons();
      
      requestAnimationFrame(() => {
        const backdrop = document.getElementById('active-list-picker');
        if (backdrop) backdrop.classList.add('open');
      });

      const close = () => {
        const backdrop = document.getElementById('active-list-picker');
        if (backdrop) {
          backdrop.classList.remove('open');
          setTimeout(() => { backdrop.remove(); }, 300);
        }
      };

      document.getElementById('lp-close').addEventListener('click', close);
      
      const itemDoms = document.getElementById('active-list-picker').querySelectorAll('.list-picker-item');
      itemDoms.forEach(el => {
        el.addEventListener('click', () => {
          if (onSelect) onSelect(el.dataset.value);
          close();
        });
      });
    }
  },

  NetFlowChart: {
    // v0.72: extracted from attachEvents' closure so the home widgets can reuse
    // the exact same axis rounding instead of shipping a second copy of it.
    // Chooses an axis step from strict multiples of 10/50/100/200/250/500.
    _computeYScale(vals) {
      if (!vals || vals.length === 0) {
        return { min: 0, max: 10, stepSize: 10 };
      }
      const rawMax = Math.max(...vals, 0);
      const rawMin = Math.min(...vals, 0);
      if (rawMax === 0 && rawMin === 0) {
        return { min: 0, max: 10, stepSize: 10 };
      }

      const baseMultipliers = [10, 50, 100, 200, 250, 500];
      const candidateStepSizes = [];
      for (let k = 0; k <= 6; k++) {
        const factor = Math.pow(10, k);
        for (const m of baseMultipliers) {
          candidateStepSizes.push(m * factor);
        }
      }
      const sortedStepSizes = [...new Set(candidateStepSizes)].sort((a, b) => a - b);

      let chosenStepSize = sortedStepSizes[0];
      for (const s of sortedStepSizes) {
        const stepsMax = Math.ceil(rawMax / s);
        const stepsMin = Math.floor(rawMin / s);
        const totalSteps = stepsMax - stepsMin;
        if (totalSteps <= 6) {
          chosenStepSize = s;
          break;
        }
      }

      let axisMax = Math.ceil(rawMax / chosenStepSize) * chosenStepSize;
      let axisMin = Math.floor(rawMin / chosenStepSize) * chosenStepSize;

      if (axisMin === 0 && axisMax === 0) {
        axisMax = chosenStepSize;
      }

      return { min: axisMin, max: axisMax, stepSize: chosenStepSize };
    },

    // v0.72: the per-chart isDark/hex pairs were copy-pasted at every chart site;
    // widgets read them from here so themes stay consistent as widgets are added.
    _themeColors() {
      const isDark = (window.Store && window.Store.state && window.Store.state.activeTheme === 'dark');
      return {
        isDark,
        tooltipBg: isDark ? '#161e2e' : '#ffffff',
        tooltipTitle: isDark ? '#94a3b8' : '#64748b',
        tooltipBody: isDark ? '#f8fafc' : '#334155',
        tooltipBorder: isDark ? 'rgba(51, 65, 85, 0.8)' : '#e2e8f0',
        gridColor: isDark ? 'rgba(51, 65, 85, 0.5)' : 'rgba(226, 232, 240, 0.6)',
        // v0.83: was '#94a3b8' for BOTH themes — 2.56:1 on light cards, well
        // under WCAG AA. The ExpandedGraphModal already used this exact pair.
        tickColor: isDark ? '#94a3b8' : '#64748b',
        // 1.2.0 (UX-1/UX-3): trend pair (= --trend-up / --trend-down, the
        // financial income/expense tokens), their rgb triplets for alpha
        // fills, the dotted baseline and the surface (end-dot ring).
        trendUp: isDark ? '#34d399' : '#10b981',
        trendDown: isDark ? '#f87171' : '#ef4444',
        trendUpRgb: isDark ? '52,211,153' : '16,185,129',
        trendDownRgb: isDark ? '248,113,113' : '239,68,68',
        baseline: isDark ? '#64748b' : '#94a3b8',
        surface: isDark ? '#161e2e' : '#ffffff',
        // 1.2.2 (HG-6): the quiet grid's hairline (the zero line uses baseline)
        hairline: isDark ? 'rgba(51, 65, 85, 0.4)' : 'rgba(226, 232, 240, 0.9)'
      };
    },

    // 1.2.2 (HG-6): the app's one bar look — Home's monthly net. Solid fills
    // in the theme's trend pair (up = income green, down = expense red),
    // rounded, no outline. emphasizeLast: the newest bar strong, the earlier
    // ones softer (Home); otherwise every bar the same strength (Analytics).
    BAR_ALPHA: 0.9,
    BAR_ALPHA_SOFT: 0.55,
    BAR_RADIUS: 6,
    barFill(value, pal, alpha) {
      const p = pal || this._themeColors();
      return 'rgba(' + (value >= 0 ? p.trendUpRgb : p.trendDownRgb) + ',' + (alpha == null ? this.BAR_ALPHA : alpha) + ')';
    },
    barStyle(values, opts) {
      const pal = this._themeColors();
      const last = values.length - 1;
      const soft = !!(opts && opts.emphasizeLast);
      return {
        backgroundColor: values.map((v, i) => this.barFill(v, pal, soft && i !== last ? this.BAR_ALPHA_SOFT : this.BAR_ALPHA)),
        borderWidth: 0,
        borderRadius: this.BAR_RADIUS,
        borderSkipped: false,
        barPercentage: 0.72,
        categoryPercentage: 0.8
      };
    },
    // Faint solid hairlines, the zero line drawn like Home's baseline.
    quietGrid(pal) {
      const p = pal || this._themeColors();
      return {
        color: (c) => (c && c.tick && c.tick.value === 0 ? p.baseline : p.hairline),
        drawTicks: false
      };
    },

    // 1.0.2 (BUG-63): `currency` (optional, last) = the selection's currency
    // (Store.aggregateSelection); stored so attachEvents can default to it.
    // 1.2.2 (HG-10 P2) isCustom is ignored: a custom range has bars now
    // (Store._customNetFlowBuckets) instead of "Chart not available".
    render(data, isCustom = false, currency) {
      this._currency = currency;

      if (!data || data.length === 0) {
        return `
          <div class="card card-elevated" style="padding: var(--space-6); margin-top: var(--space-4); text-align: center; border-radius: var(--radius-2xl);">
            <p class="text-secondary">${window.I18n.t('charts.noData')}</p>
          </div>
        `;
      }

      return `
        <div class="card card-elevated" style="padding: var(--space-5); margin-top: var(--space-4); border-radius: var(--radius-2xl); position: relative; overflow: hidden;">

          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: var(--space-4); position: relative; z-index: 1;">
            <p class="section-title" style="margin-bottom: 0; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.05em; opacity: 0.8;">${window.I18n.t('charts.netFlowAnalysis')}</p>
            <span style="font-size: 10px; color: var(--text-tertiary); font-weight: 700; background: var(--bg-surface-sunken); padding: 2px 8px; border-radius: 10px;">${window.I18n.t('charts.incomeMinusExpenses')}</span>
          </div>

          <div style="height: 200px; width: 100%; position: relative; z-index: 1;">
            <canvas id="netFlowChart"></canvas>
          </div>

        </div>
      `;
    },

    attachEvents(container, data, filters, currency) {
      const canvas = container.querySelector('#netFlowChart');
      if (!canvas || !data || !window.Chart) return;
      // 1.0.2 (BUG-63): captured per mount for the chart callbacks below
      const ccy = currency || this._currency || undefined;

      const labels = data.map(d => d.label);
      const values = data.map(d => d.net);

      // 1.2.2 (HG-6): Home's solid bars, every bar the same strength
      const bars = this.barStyle(values);

      // v0.80: track the instance on the component. The old getChart(canvas)
      // guard could never find the previous chart — every re-render replaces
      // the canvas element, so lookups by the fresh canvas always miss and one
      // instance (pinned to its detached canvas) leaked per re-render.
      if (this._chartInstance) {
        try { this._chartInstance.destroy(); } catch (e) { /* already gone */ }
        this._chartInstance = null;
      }
      // Belt-and-braces for any externally-created chart on this same canvas.
      const existingNetFlowChart = window.Chart.getChart ? window.Chart.getChart(canvas) : null;
      if (existingNetFlowChart) existingNetFlowChart.destroy();

      // Dynamic Y-axis scaling (multiples of 10/50/100/200/250/500) — see _computeYScale
      const yScale = this._computeYScale(values);
      const pal = this._themeColors();
      const { tooltipBg, tooltipTitle, tooltipBody, tooltipBorder, tickColor } = pal;

      this._chartInstance = new window.Chart(canvas, {
        type: 'bar',
        data: {
          labels: labels,
          datasets: [Object.assign({ data: values }, bars)]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          animation: false, // v0.93: entry animation played inside the render pass — pure added latency
          onHover: (event, elements) => {
            event.native.target.style.cursor = elements.length > 0 ? 'pointer' : 'default';
          },
          onClick: (event, elements) => {
            if (elements.length > 0 && filters) {
              const index = elements[0].index;
              const bucket = data[index];
              if (!bucket) return;

              // 1.2.2 (HG-10) History opens on the bar's own month or year
              // (its arrows then work); a day/week bar keeps its fixed range.
              // The filters come along, tags are cleared, and History's saved
              // sort is left alone (Analytics' sort silently replaced it).
              const period = bucket.kind === 'month' || bucket.kind === 'year'
                ? { type: bucket.kind, value: bucket.start, start: '', end: '' }
                : { type: 'custom', start: bucket.start, end: bucket.end, value: bucket.start };
              const newHistoryFilters = {
                period,
                types: [...filters.types],
                accounts: [...filters.accounts],
                categories: [...filters.categories],
                tags: []
              };

              // Update Store and Navigate
              window.Store.dispatch('UPDATE_FILTERS', { page: 'history', filters: newHistoryFilters });
              window.Router.navigate('#transactions');
            }
          },
          plugins: {
            legend: { display: false },
            tooltip: {
              backgroundColor: tooltipBg,
              titleColor: tooltipTitle,
              titleFont: { size: 11, weight: '600' },
              bodyColor: tooltipBody,
              bodyFont: { family: 'Manrope', size: 14, weight: '800' },
              borderColor: tooltipBorder,
              borderWidth: 1,
              padding: 12,
              displayColors: false,
              callbacks: {
                // 1.2.2 (HG-6): was an English "Net:" in every language
                label: (ctx) => ` ${window.Store.formatCurrency(ctx.parsed.y, ccy)}`
              }
            }
          },
          scales: {
            x: {
              grid: { display: false },
              ticks: {
                autoSkip: true,
                autoSkipPadding: 6,
                maxRotation: 45,
                minRotation: 0,
                font: (context) => {
                  const width = context.chart ? context.chart.width : 360;
                  return {
                    size: width < 360 ? 9 : 10,
                    family: 'Manrope',
                    weight: '700'
                  };
                },
                color: tickColor
              }
            },
            y: {
              display: true,
              min: yScale.min,
              max: yScale.max,
              border: { display: false },
              grid: this.quietGrid(pal), // 1.2.2 (HG-6)
              ticks: {
                stepSize: yScale.stepSize,
                font: { size: 10, family: 'Manrope', weight: '600' },
                color: tickColor,
                callback: (val) => {
                  const symbol = window.Store.getCurrencySymbol(ccy); // 1.0.2 (BUG-63)
                  const sign = val < 0 ? '-' : '';
                  const formattedAbs = Math.abs(val).toLocaleString(window.Store.getLocale(), { maximumFractionDigits: 0 });
                  return `${sign}${symbol}${formattedAbs}`;
                }
              }
            }
          }
        }
      });
    }
  },

  // 1.2.0 (UX-7) / 1.2.2 (HG-5): the one look for every ring (Goals,
  // Analytics, the Home categories and budgets widgets): flat solid arcs with
  // small rounded gaps, and an entry-only sweep. config() decorates a plain
  // Chart.js doughnut config; datasets[0].backgroundColor stays the plain hex
  // array.
  // 1.2.2 (HG-1): selection haptics (the picker "tick") for drag-to-read on
  // the Home graphs. @capacitor/haptics is a native plugin reached through
  // Capacitor.Plugins (no plugin JS is bundled); on the web, or when the
  // plugin is missing, every call is a no-op. start() arms the generator
  // (Android only ticks between selectionStart and selectionEnd).
  // 1.2.2 (HG-7 P2): one polite live region, outside #router-view, so a
  // status message survives the wholesale re-render that follows a dispatch
  // (WCAG 4.1.3). ensure() creates it ahead of the first message: a region
  // created together with its text is often not read.
  Announcer: {
    ensure() {
      const doc = window.document;
      if (!doc || !doc.body) return null;
      let el = doc.getElementById('sr-announcer');
      if (!el) {
        el = doc.createElement('div');
        el.id = 'sr-announcer';
        el.className = 'visually-hidden';
        el.setAttribute('role', 'status');
        el.setAttribute('aria-live', 'polite');
        doc.body.appendChild(el);
      }
      return el;
    },
    say(text) {
      const el = this.ensure();
      if (!el) return;
      // cleared first, so the same message twice is read twice
      el.textContent = '';
      clearTimeout(this._timer);
      this._timer = setTimeout(() => { el.textContent = String(text || ''); }, 60);
    }
  },

  Haptics: {
    _plugin() {
      const cap = window.Capacitor;
      if (!cap || typeof cap.isNativePlatform !== 'function' || !cap.isNativePlatform()) return null;
      return (cap.Plugins && cap.Plugins.Haptics) || null;
    },
    _call(method, arg) {
      const p = this._plugin();
      if (!p || typeof p[method] !== 'function') return;
      try {
        const r = arg === undefined ? p[method]() : p[method](arg);
        if (r && typeof r.catch === 'function') r.catch(() => {});
      } catch (e) { /* haptics are a nicety, never an error */ }
    },
    start() { this._call('selectionStart'); },
    tick() { this._call('selectionChanged'); },
    end() { this._call('selectionEnd'); },
    // 1.2.2 (HG-4): one firm tap — a shake flipped hidden balances
    impact() { this._call('impact', { style: 'MEDIUM' }); },
    // 1.2.2 (HG-8): a light tap — a ring slice took the focus
    light() { this._call('impact', { style: 'LIGHT' }); },
    // 1.2.2 (HG-13): the seal when the last hiding ball lands
    heavy() { this._call('impact', { style: 'HEAVY' }); }
  },

  // 1.2.2 (HG-4): shake to hide balances on Home. Listens to devicemotion
  // only while started (DashboardView.attachEvents starts it when the pref is
  // on, destroy() stops it). A shake = PEAKS jolts above THRESHOLD m/s²
  // (gravity removed) inside WINDOW_MS; one jolt counts once (PEAK_GAP_MS),
  // and a fired shake waits COOLDOWN_MS. iOS asks permission through
  // DeviceMotionEvent.requestPermission (from the Settings switch tap; the
  // Capacitor bridge grants it without a prompt); Android needs none.
  PrivacyShake: {
    THRESHOLD: 13,
    PEAKS: 3,
    WINDOW_MS: 900,
    PEAK_GAP_MS: 90,
    COOLDOWN_MS: 1500,
    _handler: null,
    _onShake: null,
    _peaks: [],
    _lastPeak: 0,
    _lastFire: -Infinity,
    supported() {
      return typeof window.DeviceMotionEvent !== 'undefined';
    },
    async requestPermission() {
      const DME = window.DeviceMotionEvent;
      if (!DME) return 'unsupported';
      if (typeof DME.requestPermission !== 'function') return 'granted';
      try {
        const answer = await DME.requestPermission();
        if (answer === 'granted') this._granted = true;
        return answer;
      } catch (e) { return 'denied'; }
    },
    isRunning() { return !!this._handler; },
    // 1.2.2 (HG-13 fix): iOS WebKit sends devicemotion only to a page that
    // called DeviceMotionEvent.requestPermission() from a user gesture in
    // THIS page load — the grant is not kept across launches (the Capacitor
    // shell answers it silently, but the call still has to be made). So
    // while Shake to hide is on, a tap after each launch asks again;
    // nothing to do where requestPermission does not exist (Android, web).
    // 1.3.0 (PL-1): it stays armed until iOS answers. The first touch after
    // a launch is often the end of a scroll or a swipe, which iOS does not
    // take as a gesture: the call throws, and 1.2.2 had already removed its
    // listeners — no shake arrived until the Settings switch was flipped.
    // A thrown call is retried on the next click / touchend; 'granted' or a
    // real 'denied' ends it (iOS does not ask twice in one page load).
    _granted: false,
    _armHandler: null,
    _asking: false,
    armPermission() {
      const DME = window.DeviceMotionEvent;
      if (this._granted || this._armHandler || !DME || typeof DME.requestPermission !== 'function') return;
      const doc = window.document;
      if (!doc || typeof doc.addEventListener !== 'function') return;
      const handler = () => {
        if (this._asking) return;
        this._asking = true;
        let asked;
        try { asked = Promise.resolve(DME.requestPermission()); } catch (e) { asked = Promise.reject(e); }
        asked.then(answer => {
          this._asking = false;
          if (answer === 'granted') this._granted = true;
          this.disarmPermission(); // iOS has answered, either way
        }, () => { this._asking = false; }); // not a gesture: stay armed
      };
      this._armHandler = handler;
      doc.addEventListener('touchend', handler, true);
      doc.addEventListener('click', handler, true);
    },
    disarmPermission() {
      const doc = window.document;
      if (this._armHandler && doc) {
        doc.removeEventListener('touchend', this._armHandler, true);
        doc.removeEventListener('click', this._armHandler, true);
      }
      this._armHandler = null;
    },
    // 1.3.0 (PL-1): on iPhone the StackdPrivacy plugin reads CoreMotion — no
    // permission and no tap needed first, so a shake works from the first
    // second after a launch. It runs next to the web listener (Android, the
    // web build, a shell without the plugin); _fire's cooldown makes the two
    // count once.
    _nativeToken: null,
    _nativeHandle: null,
    _nativePlugin() {
      const cap = window.Capacitor;
      if (!cap || typeof cap.isNativePlatform !== 'function' || !cap.isNativePlatform()) return null;
      const p = cap.Plugins && cap.Plugins.StackdPrivacy;
      return p && typeof p.startShake === 'function' && typeof p.addListener === 'function' ? p : null;
    },
    _startNative() {
      const p = this._nativePlugin();
      if (!p || this._nativeToken) return;
      const token = this._nativeToken = {};
      try {
        Promise.resolve(p.addListener('shake', () => this._fire(Date.now()))).then(h => {
          if (this._nativeToken === token) this._nativeHandle = h;
          else if (h && typeof h.remove === 'function') h.remove();
        }).catch(() => {});
        Promise.resolve(p.startShake()).catch(() => {});
      } catch (e) { /* the web listener stays */ }
    },
    _stopNative() {
      if (!this._nativeToken) return;
      this._nativeToken = null;
      const h = this._nativeHandle;
      this._nativeHandle = null;
      try { if (h && typeof h.remove === 'function') h.remove(); } catch (e) { /* gone */ }
      const p = this._nativePlugin();
      try { if (p && typeof p.stopShake === 'function') Promise.resolve(p.stopShake()).catch(() => {}); } catch (e) { /* gone */ }
    },
    start(onShake) {
      this._onShake = onShake;
      if (this._handler) return;
      this._peaks = [];
      this._handler = (e) => this._sample(e, Date.now());
      window.addEventListener('devicemotion', this._handler);
      this._startNative();
    },
    stop() {
      if (this._handler) window.removeEventListener('devicemotion', this._handler);
      this._handler = null;
      this._onShake = null;
      this._peaks = [];
      this._stopNative();
    },
    // The jolt size of one motion event, gravity removed: `acceleration` when
    // the device gives it, else |accelerationIncludingGravity| − g.
    _magnitude(e) {
      const a = e && e.acceleration;
      if (a && a.x != null && a.y != null && a.z != null) return Math.hypot(a.x, a.y, a.z);
      const g = e && e.accelerationIncludingGravity;
      if (g && g.x != null && g.y != null && g.z != null) return Math.abs(Math.hypot(g.x, g.y, g.z) - 9.81);
      return 0;
    },
    _sample(e, now) {
      if (this._magnitude(e) < this.THRESHOLD) return;
      if (now - this._lastPeak < this.PEAK_GAP_MS) return;
      this._lastPeak = now;
      this._peaks = this._peaks.filter(t => now - t <= this.WINDOW_MS);
      this._peaks.push(now);
      if (this._peaks.length < this.PEAKS || now - this._lastFire < this.COOLDOWN_MS) return;
      this._peaks = [];
      this._fire(now);
    },
    // one shake, from either detector; a fired shake waits COOLDOWN_MS
    _fire(now) {
      if (now - this._lastFire < this.COOLDOWN_MS) return;
      this._lastFire = now;
      if (typeof this._onShake === 'function') {
        try { this._onShake(); } catch (err) { console.error('PrivacyShake:', err); }
      }
    }
  },

  // 1.2.2 (HG-4): the sheet behind Home's "Balances hidden" pill. Show turns
  // hiding off; Done (primary, the thumb spot) keeps it on.
  // 1.2.2 (HG-7 P4): the recurring payments behind the Smart Insights
  // "recurring payments" insight. Read-only: each series by its next payment
  // and frequency, biggest monthly cost first, with the monthly total.
  // Amounts go through formatCurrency, so they mask on Home when balances are
  // hidden (the sheet opens over the screen it was tapped on).
  RecurringPaymentsSheet: {
    show(rows, total) {
      const t = (k, p) => window.I18n.t(k, p);
      const esc = (v) => window.I18n.esc(v);
      const money = (v) => window.Store.formatCurrency(v);
      const id = 'recurring-payments-sheet';
      const list = (rows || []).map(r => `
          <li class="recurring-sheet-row">
            <span class="list-item-icon recurring-sheet-icon" aria-hidden="true"><i data-lucide="${esc(r.icon)}"></i></span>
            <span class="recurring-sheet-text">
              <span class="list-item-title">${esc(r.name)}</span>
              <span class="list-item-subtitle">${esc(r.freq)}</span>
            </span>
            <span class="recurring-sheet-amount">${esc(money(r.amount))}</span>
          </li>`).join('');
      const backdrop = window.Components._bankSheet(id, `
        <h2 id="${id}-title" class="header-title" style="margin: 0 0 var(--space-1); font-size: var(--text-2xl);">${t('insight.recurring.title')}</h2>
        <p id="${id}-body" class="recurring-sheet-total">${t('insight.recurring.perMonth', { amount: esc(window.Store.formatCurrency(total, null, { whole: true })) })}</p>
        <ul class="recurring-sheet-list" role="list">${list}</ul>
        <button type="button" class="btn btn-primary" id="${id}-done" data-back-dismiss>${t('common.done')}</button>`);
      if (!backdrop) return null;
      backdrop.setAttribute('aria-describedby', `${id}-body`);
      let closed = false;
      const onKey = (e) => {
        if (!document.body.contains(backdrop)) { document.removeEventListener('keydown', onKey); return; }
        if (e.key === 'Escape') { e.preventDefault(); close(); }
      };
      const close = () => {
        if (closed) return;
        closed = true;
        document.removeEventListener('keydown', onKey);
        backdrop._close();
      };
      backdrop.addEventListener('click', (e) => { if (e.target === backdrop) close(); });
      const done = backdrop.querySelector(`#${id}-done`);
      done.addEventListener('click', close);
      document.addEventListener('keydown', onKey);
      setTimeout(() => { if (!closed && done.isConnected) { try { done.focus({ preventScroll: true }); } catch (e) { done.focus(); } } }, 50);
      return backdrop;
    }
  },

  HiddenBalancesSheet: {
    show() {
      const t = (k, p) => window.I18n.t(k, p);
      const id = 'hidden-balances-sheet';
      const backdrop = window.Components._bankSheet(id, `
        <div class="privacy-sheet-icon" aria-hidden="true"><i data-lucide="eye-off"></i></div>
        <h2 id="${id}-title" class="header-title" style="margin: 0 0 var(--space-2); font-size: var(--text-2xl);">${t('privacy.hiddenTitle')}</h2>
        <p id="${id}-body" style="margin: 0 0 var(--space-6); font-size: var(--text-sm); line-height: 1.55; color: var(--text-secondary);">${t('privacy.hiddenBody')}</p>
        <div style="display: flex; flex-direction: column; gap: var(--space-3);">
          <button type="button" class="btn btn-secondary" id="${id}-show">${t('privacy.show')}</button>
          <button type="button" class="btn btn-primary" id="${id}-done" data-back-dismiss>${t('common.done')}</button>
        </div>`);
      if (!backdrop) return null;
      backdrop.setAttribute('aria-describedby', `${id}-body`);
      let closed = false;
      const onKey = (e) => {
        if (!document.body.contains(backdrop)) { document.removeEventListener('keydown', onKey); return; }
        if (e.key === 'Escape') { e.preventDefault(); close(); }
      };
      const close = () => {
        if (closed) return;
        closed = true;
        document.removeEventListener('keydown', onKey);
        backdrop._close();
      };
      backdrop.addEventListener('click', (e) => { if (e.target === backdrop) close(); });
      backdrop.querySelector(`#${id}-done`).addEventListener('click', close);
      backdrop.querySelector(`#${id}-show`).addEventListener('click', () => {
        close();
        // 1.2.2 (HG-13): through Home's reveal motion when Home is on screen
        const D = window.Views && window.Views.DashboardView;
        if (D && typeof D.setHidden === 'function') D.setHidden(false);
        else window.Store.dispatch('SET_PRIVACY', { hide: false });
      });
      document.addEventListener('keydown', onKey);
      return backdrop;
    }
  },

  // 1.2.0 (UX-8): the big amount fields draw their own caret. iOS WebKit
  // leaves the system caret behind when the form scrolls with the field
  // focused (it ended up below the digits), so the system caret is hidden
  // (caret-color: transparent) and a blinking bar is drawn in an invisible
  // copy of the text laid over the input. The copy is in the page, so it
  // scrolls with the digits, and it splits the text at the selection, so the
  // bar sits where the cursor really is. Nothing of the value reaches markup:
  // the copy is built with textContent.
  AmountCaret: {
    attach(input) {
      if (!input || input._amountCaret || typeof document === 'undefined') return null;
      const group = input.parentElement;
      if (!group) return null;

      const overlay = document.createElement('div');
      overlay.className = 'amount-caret-overlay';
      overlay.setAttribute('aria-hidden', 'true');
      const line = document.createElement('span');
      line.className = 'amount-caret-line';
      const before = document.createTextNode('');
      const caret = document.createElement('span');
      caret.className = 'amount-caret';
      const after = document.createTextNode('');
      line.appendChild(before);
      line.appendChild(caret);
      line.appendChild(after);
      overlay.appendChild(line);
      group.appendChild(overlay);
      input.classList.add('amount-input--own-caret');

      const COPY = ['fontFamily', 'fontSize', 'fontWeight', 'fontStyle', 'letterSpacing', 'lineHeight',
        'fontVariantNumeric', 'fontFeatureSettings', 'textTransform'];

      const sync = () => {
        if (!input.isConnected) { detach(); return; }
        const focused = document.activeElement === input;
        // The type toggles rewrite input.className; keep the system caret hidden.
        input.classList.add('amount-input--own-caret');
        overlay.classList.toggle('is-active', focused);
        if (!focused) return;
        const cs = window.getComputedStyle ? window.getComputedStyle(input) : null;
        if (cs) {
          COPY.forEach(p => { if (cs[p]) line.style[p] = cs[p]; });
          const pad = (side) => (parseFloat(cs['padding' + side]) || 0) + (parseFloat(cs['border' + side + 'Width']) || 0);
          overlay.style.paddingLeft = pad('Left') + 'px';
          overlay.style.paddingRight = pad('Right') + 'px';
          if (cs.color) caret.style.background = cs.color;
        }
        // Lay the copy exactly over the input's box (the group is the
        // positioned ancestor).
        overlay.style.left = input.offsetLeft + 'px';
        overlay.style.top = input.offsetTop + 'px';
        overlay.style.width = input.offsetWidth + 'px';
        overlay.style.height = input.offsetHeight + 'px';

        const value = input.value || '';
        const s = typeof input.selectionStart === 'number' ? input.selectionStart : value.length;
        const e = typeof input.selectionEnd === 'number' ? input.selectionEnd : s;
        before.nodeValue = value.slice(0, s);
        after.nodeValue = value.slice(s);
        // A selected range shows the system highlight; no bar then.
        caret.style.visibility = s === e ? 'visible' : 'hidden';

        // A value wider than the box: the input scrolls from the start.
        const overflowing = line.offsetWidth > overlay.clientWidth;
        overlay.classList.toggle('is-overflowing', overflowing);
        overlay.scrollLeft = overflowing ? (input.scrollLeft || 0) : 0;

        // Solid while typing, then blink again.
        caret.style.animation = 'none';
        void caret.offsetWidth;
        caret.style.animation = '';
      };

      // Selection moves (a tap inside the digits) are seen once the browser
      // has applied them.
      const syncSoon = () => setTimeout(sync, 0);
      // A re-rendered view drops the old input: its document listeners go too.
      const onSelection = () => { if (!input.isConnected) detach(); else if (document.activeElement === input) sync(); };
      const onResize = onSelection;

      const events = [['input', sync], ['focus', sync], ['blur', sync], ['keyup', sync],
        ['select', sync], ['click', syncSoon], ['touchend', syncSoon]];
      events.forEach(([t, fn]) => input.addEventListener(t, fn));
      document.addEventListener('selectionchange', onSelection);
      if (typeof window.addEventListener === 'function') window.addEventListener('resize', onResize);

      function detach() {
        events.forEach(([t, fn]) => input.removeEventListener(t, fn));
        document.removeEventListener('selectionchange', onSelection);
        if (typeof window.removeEventListener === 'function') window.removeEventListener('resize', onResize);
        if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
        input.classList.remove('amount-input--own-caret');
        input._amountCaret = null;
      }

      input._amountCaret = { sync, detach, overlay };
      if (document.activeElement === input) sync();
      return input._amountCaret;
    }
  },

  RingChart: {
    _reduced() {
      try {
        return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
      } catch (e) {
        return false;
      }
    },

    // 1.2.2 (HG-5): flat solid arcs — no gradient, no glow, no icon badges
    // (the legends carry the icons, tinted in the arc colour). Every ring
    // (Analytics, Budget, the Home categories and budgets widgets) gets the
    // same cutout, gap and corner rounding here.
    CUTOUT: '66%', // --ring-cutout
    SPACING: 2,
    RADIUS: 6,

    // opts: { animate, delay }. Unknown keys (old callers' badges/track) are
    // ignored.
    config(base, opts) {
      const o = opts || {};
      const cfg = base || {};
      // The sweep plays only when the caller says this is an entry render,
      // and never under reduced motion.
      const animate = !!o.animate && !this._reduced();
      cfg.options = cfg.options || {};
      cfg.options.cutout = this.CUTOUT;
      if (!cfg.options.layout) cfg.options.layout = { padding: 4 };
      const ds = cfg.data && cfg.data.datasets && cfg.data.datasets[0];
      if (ds) {
        ds.borderWidth = 0;
        ds.borderColor = 'transparent';
        ds.hoverBorderWidth = 0;
        ds.hoverBorderColor = 'transparent';
        ds.spacing = this.SPACING;
        ds.borderRadius = this.RADIUS;
      }
      cfg.options.animation = animate
        ? {
          animateRotate: true,
          animateScale: false,
          duration: 700,
          easing: 'easeOutQuart',
          delay: o.delay || 0,
          // Only the entry sweep waits for the view transition: later hover
          // transitions start at once.
          onComplete: (a) => {
            const an = a && a.chart && a.chart.options && a.chart.options.animation;
            if (an && typeof an === 'object') an.delay = 0;
          }
        }
        : false;
      return cfg;
    }
  },

  // 1.2.2 (HG-8, docs/category-rings-plan.md §4): one stable, accessible
  // colour per category for every ring (Goals, Analytics, the Home widgets,
  // Smart Insights). 8 slots, each at least 3:1 against both cards and both
  // icon discs (WCAG 1.4.11); red is not a slot, it means "over budget".
  // Default categories have fixed slots; any other id hashes (FNV-1a) to one.
  // assign() walks one ring's categories in a fixed priority order and gives
  // each its slot or the next free one: no two slices on a ring share a
  // colour, and the same set of categories always gets the same colours
  // (month, tab, amounts and language do not matter). Stored category colours
  // are not read by rings. Nothing is saved.
  CategoryPalette: {
    SLOTS: ['#3b82f6', '#059669', '#8b5cf6', '#ea580c', '#0891b2', '#db2777', '#a16207', '#c026d3'],
    OTHERS: '#64748b',
    DEFAULT_SLOTS: {
      cat_rent: 0, cat_debt: 0, cat_freelance: 0,
      cat_groceries: 1, cat_salary: 1,
      cat_entertainment: 2, cat_investments: 2,
      cat_dining: 3,
      cat_transport: 4, cat_balance: 4,
      cat_shopping: 5,
      cat_utilities: 6, cat_other: 6,
      cat_health: 7
    },
    PRIORITY: ['cat_rent', 'cat_groceries', 'cat_dining', 'cat_transport', 'cat_utilities', 'cat_health', 'cat_shopping',
      'cat_entertainment', 'cat_salary', 'cat_freelance', 'cat_investments', 'cat_debt', 'cat_other', 'cat_balance'],

    slotOf(id) {
      const s = String(id == null ? '' : id);
      if (Object.prototype.hasOwnProperty.call(this.DEFAULT_SLOTS, s)) return this.DEFAULT_SLOTS[s];
      let h = 2166136261;
      for (let i = 0; i < s.length; i++) {
        h ^= s.charCodeAt(i);
        h = Math.imul(h, 16777619);
      }
      return (h >>> 0) % this.SLOTS.length;
    },

    _rank(id) {
      const i = this.PRIORITY.indexOf(id);
      return i === -1 ? this.PRIORITY.length : i;
    },

    // ids → { id: '#rrggbb' }, unique among up to 8 ids.
    assign(ids) {
      const uniq = [...new Set((ids || []).filter(id => id != null && id !== '__others__').map(String))];
      uniq.sort((a, b) => (this._rank(a) - this._rank(b)) || (a < b ? -1 : (a > b ? 1 : 0)));
      const used = new Set();
      const out = {};
      uniq.forEach(id => {
        let slot = this.slotOf(id);
        for (let k = 0; k < this.SLOTS.length && used.has(slot); k++) slot = (slot + 1) % this.SLOTS.length;
        used.add(slot);
        out[id] = this.SLOTS[slot];
      });
      return out;
    }
  },

  // 1.2.2 (HG-8, docs/category-rings-plan.md §3, §5): the shared category-ring
  // rules — the Others fold, the ring geometry and tap zones, and the
  // tap-to-focus drawing (the tapped arc thickens, the others thin).
  CategoryRing: {
    MAX: 6, // slices on one ring; from 7 categories: the 5 biggest + Others
    MIN_ZONE: (24 / 180) * Math.PI, // 24°: a 24 × 24 px target fits at these radii (WCAG 2.5.8)
    // Focus deltas (px) on the resting ring of the 180 px box (outer 82,
    // inner 54.12): the focused arc grows to 88 / 50.12, every other arc
    // (the track too) thins to 80 / 58.12.
    FOCUS_IN: { dOut: 6, dIn: -4 },
    FOCUS_OUT: { dOut: -2, dIn: 4 },
    DUR_IN: 240,
    DUR_OUT: 200,

    // items: [{ id, value, … }] → { named: biggest first, others: null |
    // { id: '__others__', value, members } }. Up to MAX items each keep a
    // slice; past that the MAX - 1 biggest do and the rest fold into Others
    // (always 2 or more). Ties: palette priority, then id — never the name,
    // so the order does not change with the language.
    fold(items, max) {
      const n = max || this.MAX;
      const P = window.Components.CategoryPalette;
      const sorted = (items || []).filter(it => it && it.value > 0).slice().sort((a, b) =>
        (b.value - a.value) || (P._rank(String(a.id)) - P._rank(String(b.id))) ||
        (String(a.id) < String(b.id) ? -1 : (String(a.id) > String(b.id) ? 1 : 0)));
      if (sorted.length <= n) return { named: sorted, others: null };
      const members = sorted.slice(n - 1);
      return {
        named: sorted.slice(0, n - 1),
        others: { id: '__others__', value: members.reduce((s, m) => s + m.value, 0), members }
      };
    },

    // Chart.js 4.4.2 doughnut geometry for a square box: the radius is
    // (box - 2·padding - (maxBorderWidth + maxOffset + spacing)) / 2. Goals
    // passes hoverOffset 0 and padding 7, so its resting ring keeps the
    // 1.2.0 size (outer 82, inner 54.12) and the 6 px the hover pop used
    // to reserve is the room for the focused arc.
    geometry(values, opts) {
      const o = Object.assign({ box: 180, padding: 7, spacing: 2, offset: 0, cutout: 0.66 }, opts || {});
      const outer = (o.box - 2 * o.padding - (o.offset + o.spacing)) / 2;
      const total = (values || []).reduce((s, v) => s + Math.max(0, v), 0);
      let a = 0;
      const arcs = (values || []).map(v => {
        const span = total > 0 ? (Math.max(0, v) / total) * 2 * Math.PI : 0;
        const arc = { start: a, end: a + span, mid: a + span / 2, span };
        a += span;
        return arc;
      });
      return { cx: o.box / 2, cy: o.box / 2, outer, inner: outer * o.cutout, arcs };
    },

    // Tap zones (angles from 12 o'clock, clockwise). Correctness first: a tap
    // on a slice as drawn is always that slice (hitTest checks the painted
    // arcs before anything else), so a tap can never select a neighbour.
    // A slice narrower than MIN_ZONE then gains a halo over the track next
    // to it (the remaining budget, which is not a target), up to MIN_ZONE in
    // all and never more than half of that track, so its target reaches 24°
    // where there is room (WCAG 2.5.8). A halo never covers another slice:
    // several tiny slices side by side keep their painted size (the keyboard
    // and screen-reader buttons stay the full path). Each zone: { start, end
    // (with the halo), mid (the painted mid), painted: {start, end}, tappable }.
    hitZones(arcs, tappable) {
      const n = arcs.length;
      if (!n) return [];
      const MIN = this.MIN_ZONE;
      const trackSide = (j) => j >= 0 && j < n && !tappable[j];
      return arcs.map((a, i) => {
        const z = { start: a.start, end: a.end, mid: a.mid, painted: { start: a.start, end: a.end }, tappable: !!tappable[i] };
        if (!z.tappable || a.span >= MIN || n < 2) return z;
        const prev = (i - 1 + n) % n;
        const next = (i + 1) % n;
        const need = MIN - a.span;
        const before = trackSide(prev) ? arcs[prev].span / 2 : 0;
        const after = trackSide(next) ? arcs[next].span / 2 : 0;
        if (prev === next) { // one slice and the track: the track is on both sides
          const each = Math.min(need / 2, arcs[next].span / 4);
          z.start -= each;
          z.end += each;
          return z;
        }
        let takeBefore = 0;
        let takeAfter = 0;
        if (before && after) {
          takeBefore = Math.min(need / 2, before);
          takeAfter = Math.min(need - takeBefore, after);
          takeBefore = Math.min(need - takeAfter, before);
        } else if (after) {
          takeAfter = Math.min(need, after);
        } else if (before) {
          takeBefore = Math.min(need, before);
        }
        z.start -= takeBefore;
        z.end += takeAfter;
        return z;
      });
    },

    // The arc under a point of the box (px from its top-left), or -1 for the
    // hole / outside. band: [inner, outer] px. Order: a slice as drawn, then a
    // small slice's halo, then the track (not a target: the caller clears).
    hitTest(zones, x, y, geo, band) {
      const dx = x - geo.cx;
      const dy = y - geo.cy;
      const r = Math.sqrt(dx * dx + dy * dy);
      const [rin, rout] = band || [geo.inner - 8, geo.outer + 8];
      if (r < rin || r > rout) return -1;
      let theta = Math.atan2(dx, -dy); // 0 at 12 o'clock, clockwise
      if (theta < 0) theta += 2 * Math.PI;
      const inside = (s, e) => [theta, theta + 2 * Math.PI, theta - 2 * Math.PI].some(t => t >= s && t < e);
      for (let i = 0; i < zones.length; i++) {
        const z = zones[i];
        if (z.tappable && inside(z.painted.start, z.painted.end)) return i;
      }
      for (let i = 0; i < zones.length; i++) {
        const z = zones[i];
        if (z.tappable && inside(z.start, z.end)) return i;
      }
      for (let i = 0; i < zones.length; i++) {
        if (inside(zones[i].painted.start, zones[i].painted.end)) return i;
      }
      return -1;
    },

    // A point on the ring: angle from 12 o'clock, clockwise.
    point(geo, angle, radius) {
      return { x: geo.cx + radius * Math.sin(angle), y: geo.cy - radius * Math.cos(angle) };
    },

    _ease(t) { return 1 - Math.pow(1 - t, 4); }, // easeOutQuart, the entry sweep's curve

    // scale: the ring's outer radius / 82 (Goals' 180 px box), so a bigger
    // ring (Analytics' 220 px) thickens in proportion.
    _targets(count, index, scale) {
      const k = scale || 1;
      const IN = { dOut: this.FOCUS_IN.dOut * k, dIn: this.FOCUS_IN.dIn * k };
      const OUT = { dOut: this.FOCUS_OUT.dOut * k, dIn: this.FOCUS_OUT.dIn * k };
      const out = [];
      for (let i = 0; i < count; i++) {
        if (index < 0) out.push({ dOut: 0, dIn: 0 });
        else out.push(i === index ? IN : OUT);
      }
      return out;
    },

    _deltas(f) {
      const e = this._ease(Math.max(0, Math.min(1, f.t)));
      return f.to.map((to, i) => {
        const from = f.from[i] || { dOut: 0, dIn: 0 };
        return { dOut: from.dOut + (to.dOut - from.dOut) * e, dIn: from.dIn + (to.dIn - from.dIn) * e };
      });
    },

    // The caller-supplied Chart.js plugin (RingChart.config stays
    // plugin-free, HG-5): it only moves each arc's radii while the dataset
    // draws and puts them back right after. Nothing is cancelled or copied.
    plugin() {
      const CR = this;
      return {
        id: 'stackdRingFocus',
        beforeDatasetDraw(chart, args) {
          const f = chart.$ringFocus;
          const meta = args && args.meta;
          if (!f || !meta || !Array.isArray(meta.data)) return;
          const d = CR._deltas(f);
          chart.$ringSaved = meta.data.map((el, i) => {
            const saved = [el.outerRadius, el.innerRadius];
            const k = d[i] || { dOut: 0, dIn: 0 };
            el.outerRadius = Math.max(0, el.outerRadius + k.dOut);
            el.innerRadius = Math.max(0, el.innerRadius + k.dIn);
            return saved;
          });
        },
        afterDatasetDraw(chart, args) {
          const saved = chart.$ringSaved;
          const meta = args && args.meta;
          if (!saved || !meta || !Array.isArray(meta.data)) return;
          meta.data.forEach((el, i) => {
            if (saved[i]) { el.outerRadius = saved[i][0]; el.innerRadius = saved[i][1]; }
          });
          chart.$ringSaved = null;
        }
      };
    },

    // Focus arc `index` (-1 = none) on a chart built with plugin(). Tweens
    // from wherever the arcs are now; `instant` (re-render restore, reduced
    // motion) jumps to the end. A timeout finishes the tween where
    // requestAnimationFrame is suspended (hidden documents).
    focus(chart, count, index, instant, scale) {
      if (!chart) return;
      const prev = chart.$ringFocus;
      const from = prev ? this._deltas(prev) : this._targets(count, -1);
      const to = this._targets(count, index, scale);
      if (chart.$ringRaf && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(chart.$ringRaf);
      clearTimeout(chart.$ringSnap);
      const canDraw = () => typeof chart.draw === 'function' && chart.canvas && chart.canvas.isConnected !== false && chart.ctx;
      const draw = () => { if (canDraw()) { try { chart.draw(); } catch (e) { /* a destroyed chart */ } } };
      const reduced = window.Components.RingChart._reduced();
      if (instant || reduced) {
        chart.$ringFocus = { from: to, to, t: 1 };
        draw();
        return;
      }
      const dur = index < 0 ? this.DUR_OUT : this.DUR_IN;
      chart.$ringFocus = { from, to, t: 0 };
      const t0 = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
      const step = (now) => {
        const f = chart.$ringFocus;
        if (!f || f.to !== to) return;
        f.t = Math.min(1, ((now || t0 + dur) - t0) / dur);
        draw();
        if (f.t < 1 && typeof requestAnimationFrame === 'function') chart.$ringRaf = requestAnimationFrame(step);
      };
      if (typeof requestAnimationFrame === 'function') chart.$ringRaf = requestAnimationFrame(step);
      chart.$ringSnap = setTimeout(() => {
        const f = chart.$ringFocus;
        if (f && f.to === to && f.t < 1) { f.t = 1; draw(); }
      }, dur + 40);
    },

    stop(chart) {
      if (!chart) return;
      if (chart.$ringRaf && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(chart.$ringRaf);
      clearTimeout(chart.$ringSnap);
      chart.$ringRaf = null;
    },

    // ── The shared tap-to-focus controller (Goals P1, Analytics P2) ──────────
    // A ring: slices [{ id, name, icon, value, color, members? }] drawn
    // biggest first, then (Goals only) the track value; in a square box.
    layout(slices, track, box) {
      const size = box || 180;
      const values = slices.map(sl => sl.value).concat(track == null ? [] : [track]);
      const geo = this.geometry(values, { box: size });
      const zones = this.hitZones(geo.arcs, values.map((v, i) => i < slices.length));
      return { geo, zones, count: values.length, hasTrack: track != null, box: size, scale: geo.outer / 82 };
    },

    // Root font ≥ 20 px: the readout leaves the hole for the space under the
    // ring (WCAG 1.4.4) and the badge hides; the share moves into the caption.
    // 1.2.2 (HG-8 review C6): 20, not 24 — from ~21 px a French caption wraps
    // out of the hole and the pill near 6 o'clock lands on it. Android's text
    // sizes: 115 % (18.4 px) keeps the hole, 130 % (20.8 px) goes below.
    bigText() {
      try {
        return parseFloat(window.getComputedStyle(document.documentElement).fontSize) >= 20;
      } catch (e) {
        return false;
      }
    },

    // The ring's overlay: a real button per slice — the keyboard and
    // screen-reader path (WCAG 2.1.1, 4.1.2); pointer-events none, a finger
    // goes through the box's one hit test — on its drawn mid, and a badge per
    // slice (the icon, then the icon and the share). A focus is written in its final
    // state: no replay. o: { focus, groupLabel (t() output), ariaOf(slice)
    // (markup-safe), pctOf(slice) }.
    overlayHtml(ring, slices, o) {
      const esc = (v) => window.I18n.esc(v);
      const rBtn = (ring.geo.outer + ring.geo.inner) / 2;
      const rBadge = rBtn + ring.scale; // the middle of the focused band
      const reduced = window.Components.RingChart._reduced();
      const buttons = slices.map((sl, i) => {
        const pt = this.point(ring.geo, ring.zones[i].mid, rBtn);
        return `<button type="button" class="ring-arc-btn" data-arc-id="${esc(sl.id)}" aria-pressed="${sl.id === o.focus}" aria-label="${o.ariaOf(sl)}" style="left: ${pt.x.toFixed(1)}px; top: ${pt.y.toFixed(1)}px;"></button>`;
      }).join('');
      const badges = slices.map((sl, i) => {
        const pt = this.point(ring.geo, ring.geo.arcs[i].mid, rBadge);
        // --push: the slice's sideways direction (sin of its angle from 12
        // o'clock). The pill grows away from the centre — at 3 o'clock to the
        // right, at 9 to the left, at 12 and 6 both ways — so it stays off the
        // readout in the hole (at large text the readout moves below the
        // ring and the badges hide).
        const push = Math.sin(ring.geo.arcs[i].mid);
        const on = sl.id === o.focus ? (reduced ? ' is-on is-both' : ' is-on is-pct is-static') : '';
        return `<span class="ring-badge${on}" data-arc-id="${esc(sl.id)}" aria-hidden="true" style="left: ${pt.x.toFixed(1)}px; top: ${pt.y.toFixed(1)}px; --slice: ${esc(sl.color)}; --push: ${push.toFixed(3)};"><span class="ring-badge-icon"><i data-lucide="${esc(sl.icon)}"></i></span><span class="ring-badge-pct">${esc(o.pctOf(sl))}</span></span>`;
      }).join('');
      return `${slices.length ? `<div class="ring-arc-group" role="group" aria-label="${o.groupLabel}">${buttons}</div>` : ''}${badges}`;
    },

    // The focused readout (raw strings in; escaped here).
    readoutHtml(r, below) {
      const esc = (v) => window.I18n.esc(v);
      const x = r || {};
      return `<div class="ring-focus-readout${below ? ' ring-focus-readout--below' : ''}" aria-hidden="true"><div class="ring-focus-name">${esc(x.name || '')}</div><div class="ring-focus-amount">${esc(x.amount || '')}</div><div class="ring-focus-caption">${esc(x.caption || '')}</div></div>`;
    },

    clearTimers(timers) {
      if (!timers) return;
      timers.forEach(id => clearTimeout(id));
      timers.length = 0;
    },

    _readoutOf(box) {
      const inner = box.querySelector('.ring-focus-readout');
      if (inner) return inner;
      const next = box.nextElementSibling;
      return next && next.classList && next.classList.contains('ring-focus-readout') ? next : null;
    },

    // Focus a slice (id), or clear (null / the focused id again). host: { box,
    // ring, slices, timers (array), chart() → Chart, getFocus() → id|null,
    // setFocus(id|null), readout(slice) → { name, amount, caption },
    // announce(slice) → text, cleared (text) }. `viaPointer` adds the haptic
    // and the live-region message; a button activation is already announced
    // through its aria-pressed change (WCAG 4.1.3).
    select(host, id, viaPointer) {
      const box = host && host.box;
      if (!box || !host.ring) return;
      const slices = host.slices || [];
      const cur = host.getFocus();
      const next = id && id !== cur && slices.some(sl => sl.id === id) ? id : null;
      if (next === cur) return;
      host.setFocus(next);
      this.clearTimers(host.timers);
      const idx = next ? slices.findIndex(sl => sl.id === next) : -1;
      this.focus(host.chart(), host.ring.count, idx, false, host.ring.scale);

      box.querySelectorAll('.ring-arc-btn').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.arcId === next)));
      box.classList.toggle('is-focused', !!next);
      const slice = next ? slices[idx] : null;
      const readout = this._readoutOf(box);
      if (slice && readout) {
        const r = host.readout(slice);
        readout.querySelector('.ring-focus-name').textContent = r.name;
        readout.querySelector('.ring-focus-amount').textContent = r.amount;
        readout.querySelector('.ring-focus-caption').textContent = r.caption;
      }

      // the badge that loses the focus fades out where it is (is-leaving keeps
      // its layout, colours and fit); the one that takes it starts as a clean
      // hidden disc, whatever it was doing (a quick re-tap catches it leaving)
      box.querySelectorAll('.ring-badge.is-on').forEach(b => {
        b.classList.remove('is-on');
        b.classList.add('is-leaving');
      });
      const badge = slice ? [...box.querySelectorAll('.ring-badge')].find(b => b.dataset.arcId === next) : null;
      if (badge) {
        this._resetBadge(badge);
        if (window.Components.RingChart._reduced()) {
          badge.classList.add('is-on', 'is-both'); // no timed swap: icon and share at once
          this._fitBadge(badge, badge.offsetWidth);
        } else {
          host.timers.push(setTimeout(() => { if (badge.isConnected) badge.classList.add('is-on'); }, 60));
          host.timers.push(setTimeout(() => {
            if (!badge.isConnected) return;
            // 1.2.2 (HG-8): the pill keeps the icon beside the share — measure
            // its natural width with both inside, put the disc width back,
            // then grow to it so the width change animates.
            badge.classList.add('is-pct');
            badge.style.width = 'max-content'; // not auto: that shrinks near the box edge
            const w = Math.ceil(badge.offsetWidth) || 64;
            this._fitBadge(badge, w);
            badge.style.width = '28px';
            void badge.offsetWidth; // commit the disc width
            badge.style.width = `${w}px`;
          }, 900));
        }
      }

      if (viaPointer) {
        if (slice && window.Components.Haptics) window.Components.Haptics.light();
        if (window.Components.Announcer) window.Components.Announcer.say(slice ? host.announce(slice) : host.cleared);
      }
    },

    // 1.2.2 (HG-8 review C3/C5/C7): keep a focused pill inside the box that
    // clips it (the card). The room beside a ring depends on the viewport and
    // the text size, so it is measured: --push-k scales the outward growth
    // (1 = all the way, 0 = centred on the band) and, if even a centred pill
    // would cross the edge, --nudge moves it back in. w is the pill's final
    // width; the geometry is computed, not read from the (possibly
    // mid-transition) badge rect. A failed read leaves the pill unfitted.
    _fitBadge(badge, w) {
      if (!badge) return;
      badge.style.removeProperty('--push-k');
      badge.style.removeProperty('--nudge');
      try {
        this._fitBadgeTo(badge, w);
      } catch (e) {
        badge.style.removeProperty('--push-k');
        badge.style.removeProperty('--nudge');
      }
    },

    // A clean hidden disc, at once (no transition on the badge or its parts).
    _resetBadge(b) {
      b.classList.add('is-reset');
      b.classList.remove('is-on', 'is-pct', 'is-static', 'is-both', 'is-leaving');
      b.style.width = '';
      b.style.removeProperty('--push-k');
      b.style.removeProperty('--nudge');
      void b.offsetWidth;
      b.classList.remove('is-reset');
    },

    // Refit, in place, every focused pill on the page (a resize or a
    // rotation changes the room beside its ring). A disc needs no fit; a
    // pill mid-morph uses its target width.
    _refitFocused() {
      document.querySelectorAll('.ring-box .ring-badge.is-on').forEach(b => {
        if (!['is-pct', 'is-both', 'is-static'].some(c => b.classList.contains(c))) return;
        const w = parseFloat(b.style.width) || b.offsetWidth;
        b.classList.add('is-reset');
        this._fitBadge(b, w);
        void b.offsetWidth;
        b.classList.remove('is-reset');
      });
    },

    _fitBadgeTo(badge, w) {
      const box = badge.parentElement;
      if (!box || !w || !badge.isConnected) return;
      let clip = box.parentElement;
      while (clip && clip !== document.body && window.getComputedStyle(clip).overflowX === 'visible') clip = clip.parentElement;
      const br = box.getBoundingClientRect();
      const sc = box.offsetWidth && br.width ? br.width / box.offsetWidth : 1; // any scale on the way up
      let lo;
      let hi;
      if (clip && clip !== document.body) {
        const cr = clip.getBoundingClientRect();
        lo = (cr.left - br.left) / sc + clip.clientLeft;
        hi = lo + clip.clientWidth;
      } else {
        lo = -br.left / sc;
        hi = lo + (window.innerWidth || 0) / sc;
      }
      lo += 4; // a little air inside the edge
      hi -= 4;
      const x = parseFloat(badge.style.left) || 0; // the badge's point, in box px
      const push = parseFloat(badge.style.getPropertyValue('--push')) || 0;
      const reach = Math.abs(push) * (w / 2 - 14); // the outward growth at k = 1
      const room = push >= 0 ? hi - (x + w / 2) : (x - w / 2) - lo; // past a centred pill
      if (reach > 0.5 && room < reach) badge.style.setProperty('--push-k', Math.max(0, room / reach).toFixed(3));
      if (room < 0) badge.style.setProperty('--nudge', `${(push >= 0 ? room : -room).toFixed(1)}px`);
    },

    // Wire one ring box: the one hit test for taps (a drawn slice, a small
    // slice's halo; the hole and the track clear), the button activations
    // and Escape. The box is replaced with the view on every render, so its
    // listeners go with it.
    wire(host) {
      const box = host && host.box;
      if (!box || !host.ring || !(host.slices || []).length) return;
      if (window.Components.Announcer) window.Components.Announcer.ensure();
      // a focus restored by the render: fit its pill in place, no slide
      const restored = box.querySelector('.ring-badge.is-on');
      if (restored && restored.offsetWidth) {
        restored.classList.add('is-reset');
        this._fitBadge(restored, restored.offsetWidth);
        void restored.offsetWidth;
        restored.classList.remove('is-reset');
      }
      // one page-wide listener: a resize or a rotation refits a focused pill
      if (!this._resizeWired && window.addEventListener) {
        this._resizeWired = true;
        window.addEventListener('resize', () => {
          clearTimeout(this._resizeTimer);
          this._resizeTimer = setTimeout(() => this._refitFocused(), 120);
        });
      }
      box.addEventListener('click', (e) => {
        e.stopPropagation(); // a host's own "tap outside the ring" must not see it
        const btn = e.target && e.target.closest ? e.target.closest('.ring-arc-btn') : null;
        if (btn) { // keyboard / screen-reader activation
          this.select(host, btn.dataset.arcId, false);
          return;
        }
        const r = box.getBoundingClientRect();
        const k = r.width ? r.width / host.ring.box : 1;
        const g = host.ring.geo;
        const band = [g.inner - 10 * host.ring.scale, g.outer + 10 * host.ring.scale];
        const i = this.hitTest(host.ring.zones, (e.clientX - r.left) / k, (e.clientY - r.top) / k, g, band);
        this.select(host, i >= 0 && i < host.slices.length ? host.slices[i].id : null, true);
      });
      box.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && host.getFocus()) {
          e.preventDefault();
          e.stopPropagation();
          this.select(host, null, false);
        }
      });
    }
  },

  CategoryDonutChart: {
    _chartInstance: null,
    _currentType: 'expense',
    // v0.85: which category's tag breakdown is open. Kept on the singleton
    // (like _currentType) rather than in the store: expanding must NOT
    // dispatch — a dispatch re-renders the whole view and replays the donut's
    // 700ms entry animation for a pure disclosure toggle. Because render()
    // emits the panels and attachEvents restores this id, an unrelated
    // re-render (cross-tab sync, filter change) reproduces the open state.
    _expandedCatId: null,

    _esc(str) {
      return String(str == null ? '' : str)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    },

    // 1.2.2 (HG-8): colours come from Components.CategoryPalette — stable
    // per category, unique on the ring; Others is slate. Stored category
    // colours are not read (the old _CATEGORY_COLORS / _FALLBACK_PALETTE
    // repeated after 12 and moved with the order). _hoverColor = the colour.
    _assignColors(data) {
      if (!data) return [];
      const P = window.Components.CategoryPalette;
      const isOthers = (it) => !!(it && (it.isOthers || it.id === '__others__'));
      const map = P.assign(data.filter(it => !isOthers(it)).map(it => it.id));
      return data.map(item => {
        const c = isOthers(item) ? P.OTHERS : (map[String(item.id)] || P.OTHERS);
        return { ...item, _color: c, _hoverColor: c };
      });
    },

    // 1.2.2 (HG-8 P2): the shared Others rule (CategoryRing.fold): up to 6
    // categories each keep a slice; from 7 the 5 biggest do and the rest fold
    // into Others (always 2 or more — the old top-5 cut made a one-member
    // Others at exactly 6). Others carries its members' names. The Home
    // categories widget reads this too.
    _capData(rawData) {
      const raw = rawData || [];
      const f = window.Components.CategoryRing.fold(raw.map(it => ({ id: it.id, value: it.amount, item: it })));
      const out = f.named.map(x => x.item);
      if (f.others) {
        const total = raw.reduce((sum, it) => sum + it.amount, 0);
        out.push({
          id: '__others__',
          name: window.I18n.t('charts.others'),
          amount: f.others.value,
          icon: 'more-horizontal',
          percentage: total > 0 ? (f.others.value / total) * 100 : 0,
          isOthers: true,
          members: f.others.members.map(m => m.item.name)
        });
      }
      return out;
    },

    // ── 1.2.2 (HG-8 P2): tap-to-focus on the Analytics ring ────────────────
    // The Goals controller (CategoryRing.select / wire) with this ring's
    // words: the share is of the period's spending (or income). The focus
    // lives on the singleton like _expandedCatId: { type, id } | null.
    _focus: null,
    _ringTimers: [],
    _ringPass: null,

    _ringPct(value) {
      const total = this._ringPass ? this._ringPass.total : 0;
      return window.Store.formatPercent(total > 0 ? (value / total) * 100 : 0, { digits: 0, maxDigits: 1 });
    },

    // plain = raw params for the live region; markup gets them escaped.
    _ringAria(sl, plain) {
      const e = plain ? (v) => v : (v) => this._esc(v);
      const income = this._currentType === 'income';
      const money = window.Store.formatCurrency(sl.value, this._currency);
      const pct = this._ringPct(sl.value);
      return sl.members
        ? window.I18n.t(income ? 'charts.ring.othersAriaIncome' : 'budget.ring.othersAria', { count: sl.members.length, names: e(sl.members.join(', ')), amount: e(money), pct: e(pct) })
        : window.I18n.t(income ? 'charts.ring.arcAriaIncome' : 'budget.ring.arcAria', { name: e(sl.name), amount: e(money), pct: e(pct) });
    },

    _ringReadout(sl, big) {
      const income = this._currentType === 'income';
      const total = window.Store.formatCurrency(this._ringPass ? this._ringPass.total : 0, this._currency);
      const pct = this._ringPct(sl.value);
      return {
        name: sl.name,
        amount: window.Store.formatCurrency(sl.value, this._currency),
        caption: big
          ? window.I18n.t(income ? 'charts.ring.pctOfIncome' : 'budget.ring.pctOfSpent', { pct, amount: total })
          : window.I18n.t(income ? 'charts.ring.ofIncome' : 'budget.ring.ofSpent', { amount: total })
      };
    },

    _ringHost(box) {
      const pass = this._ringPass;
      if (!box || !pass || !pass.ring) return null;
      return {
        box,
        ring: pass.ring,
        slices: pass.slices,
        timers: this._ringTimers,
        chart: () => this._chartInstance,
        getFocus: () => (this._focus ? this._focus.id : null),
        setFocus: (id) => { this._focus = id ? { type: this._currentType, id } : null; },
        readout: (sl) => this._ringReadout(sl, box.classList.contains('ring--big-text')),
        announce: (sl) => this._ringAria(sl, true),
        cleared: window.I18n.t('charts.ring.cleared')
      };
    },

    // Leaving Analytics (AnalyticsView.destroy) or switching the type.
    dropFocus() {
      this._focus = null;
      window.Components.CategoryRing.clearTimers(this._ringTimers);
      if (this._chartInstance) window.Components.CategoryRing.stop(this._chartInstance);
    },

    // 1.0.2 (BUG-63): `currency` (optional, last) = the selection's currency;
    // kept on the singleton so the type toggle, drilldown and tooltip reuse it.
    render(rawData, type = 'expense', currency) {
      this._currentType = type;
      this._currency = currency;
      const isExpense = type === 'expense';
      const rawCapped = this._capData(rawData);
      const data = this._assignColors(rawCapped);
      
      const hasData = data && data.length > 0;
      const totalAmount = rawData.reduce((sum, item) => sum + item.amount, 0);

      // 1.2.2 (HG-8 P2): the slices (Others named "Others (n)" in the
      // readout), a focus kept only while its slice is still here under this
      // type, and the 220 px ring's geometry for the overlay and the hit test.
      const CR = window.Components.CategoryRing;
      const slices = (data || []).map(d => ({
        id: d.id,
        name: d.isOthers ? window.I18n.t('budget.ring.othersLabel', { count: (d.members || []).length }) : d.name,
        icon: d.icon,
        value: d.amount,
        color: d._color,
        members: d.isOthers ? (d.members || []) : undefined
      }));
      const focus = this._focus && this._focus.type === type && slices.some(sl => sl.id === this._focus.id) ? this._focus.id : null;
      if (!focus) this._focus = null;
      const ring = slices.length ? CR.layout(slices, null, 220) : null;
      this._ringPass = { slices, ring, total: totalAmount, type };
      const big = CR.bigText();
      const focused = slices.find(sl => sl.id === focus) || null;
      const overlay = ring ? CR.overlayHtml(ring, slices, {
        focus,
        groupLabel: window.I18n.t('charts.ring.groupAria'),
        ariaOf: (sl) => this._ringAria(sl, false),
        pctOf: (sl) => this._ringPct(sl.value)
      }) : '';
      const readout = CR.readoutHtml(focused ? this._ringReadout(focused, big) : null, big);

      let contentHtml = '';
      if (!hasData) {
        contentHtml = `
          <div style="height: 200px; display: flex; flex-direction: column; align-items: center; justify-content: center; opacity: 0.5;">
            <div style="font-size: 2.5rem; margin-bottom: var(--space-2);">🥯</div>
            <p>${window.I18n.t(type === 'expense' ? 'charts.noExpenseData' : 'charts.noIncomeData')}</p>
          </div>
        `;
      } else {
        contentHtml = `
          <div class="donut-chart-layout">
            <div class="donut-chart-container ring-box ring-box--lg${focused ? ' is-focused' : ''}${big ? ' ring--big-text' : ''}" id="analytics-ring-box">
              <canvas id="categoryDonutChart" aria-hidden="true"></canvas>
              <div class="donut-chart-center">
                <div class="donut-total-label">${window.I18n.t('charts.total')}</div>
                <div class="donut-total-value">${window.Store.formatCurrency(totalAmount, this._currency)}</div>
              </div>
              ${big ? '' : readout}
              ${overlay}
            </div>${big ? readout : ''}
            <div class="donut-legend">
              ${data.map(item => {
                const esc = (v) => this._esc(v);
                // v0.85: every real category is an accordion — tapping it
                // reveals its per-tag breakdown (filled lazily in
                // attachEvents). 'Others' aggregates categories 6+, so it has
                // no single tag breakdown and stays inert, as before.
                // 1.2.2 (HG-5): the icon carries the arc colour (no colour
                // bar), like the account tiles on Home.
                const row = `
                  <div class="donut-legend-item touch-target" data-cat-id="${esc(item.id)}"
                       ${item.isOthers ? '' : 'role="button" tabindex="0" aria-expanded="false"'}
                       style="cursor: ${item.isOthers ? 'default' : 'pointer'}; padding: 8px 4px; border-radius: var(--radius-md); transition: background 0.2s; align-items: center;">
                    <div class="list-item-icon ring-legend-icon" style="width: 32px; height: 32px; min-width: 32px; color: ${esc(item._color)};"><i data-lucide="${esc(item.icon)}" style="width: 18px; height: 18px;"></i></div>
                    <div class="donut-legend-info" style="margin-left: 4px;">
                      <span class="donut-legend-name" style="${item.isOthers ? 'opacity:0.65;' : ''}">${esc(item.name)}</span>
                      <span class="donut-legend-pct">${esc(window.Store.formatPercent(item.percentage, { digits: 1 }))}</span>
                    </div>
                    <div class="donut-legend-amount" style="${item.isOthers ? 'opacity:0.65;' : ''}">${esc(window.Store.formatCurrency(item.amount, this._currency))}</div>
                    ${item.isOthers ? '<div style="width: 8px; margin-left: 8px;"></div>' : '<div class="donut-legend-caret" aria-hidden="true">›</div>'}
                  </div>`;
                if (item.isOthers) return row;
                return `
                  <div class="donut-legend-group" data-cat-group="${esc(item.id)}">
                    ${row}
                    <div class="donut-tag-panel" data-tag-panel="${esc(item.id)}"></div>
                  </div>`;
              }).join('')}
            </div>
          </div>
        `;
      }

      return `
        <div class="card card-elevated category-donut-card" style="padding: var(--space-5); margin-top: var(--space-4); border-radius: var(--radius-2xl); position: relative; overflow: hidden;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: var(--space-6); position: relative; z-index: 1;">
            <p class="section-title" style="margin-bottom: 0; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.05em; opacity: 0.8;">${window.I18n.t('charts.distribution')}</p>
            
            <div class="chart-toggle-group">
              <button class="chart-toggle-btn ${isExpense ? 'active' : ''}" data-type="expense">${window.I18n.t('charts.expenses')}</button>
              <button class="chart-toggle-btn ${!isExpense ? 'active' : ''}" data-type="income">${window.I18n.t('form.income')}</button>
            </div>
          </div>
          
          ${contentHtml}
        </div>
      `;
    },

    // 1.2.0 (UX-7): opts.animate = this is the Analytics entry render (the
    // ring sweeps once); the type toggle's local re-render passes false.
    attachEvents(container, filters, currency, opts) {
      const animate = !!(opts && opts.animate);
      const canvas = container.querySelector('#categoryDonutChart');
      // 1.2.2 (HG-8 P2 review): only the donut's own Expenses / Income buttons —
      // the bare class also caught Analytics' Today / period-end chips, so a
      // balance tap dropped the ring focus and stacked a listener per toggle.
      const donutCard = container.querySelector('.category-donut-card');
      const toggleBtns = donutCard ? donutCard.querySelectorAll('.chart-toggle-btn[data-type]') : [];
      if (currency !== undefined) this._currency = currency; // 1.0.2 (BUG-63)
      const ccy = this._currency; // captured per mount for the chart callbacks

      const updateChart = (type) => {
        this._currentType = type;
        // v0.85: an expense category's tag breakdown means nothing under the
        // income lens — collapse rather than restore something stale.
        this._expandedCatId = null;
        this.dropFocus(); // 1.2.2 (HG-8 P2): and the ring focus with it
        const newData = window.Store.computeCategoryDistribution(filters, type);

        // 1.2.2 (HG-8 P2 review): the donut's own card. The old inline-style
        // fallback ([style*="height: 200px"]) matched the Net Flow chart first
        // when the donut had no data, and the toggle replaced that card.
        const outerCard = container.querySelector('.category-donut-card');
        if (outerCard) {
          outerCard.outerHTML = this.render(newData, type, ccy); // 1.0.2 (BUG-63): same currency
          this.attachEvents(container, filters, ccy, { animate: false });
        }
      };

      toggleBtns.forEach(btn => {
        btn.addEventListener('click', () => {
          const type = btn.dataset.type;
          if ((type !== 'expense' && type !== 'income') || type === this._currentType) return;
          updateChart(type);
        });
      });

      // ── v0.85: category → tag drilldown ────────────────────────────────
      // Hand off to History exactly the way the category tap always did
      // (copy the analytics period/accounts, pin the category and type), plus
      // the chosen tag. Passing null tags = the whole category.
      // 1.2.2 (HG-10) through UPDATE_FILTERS (it wrote the state and emitted),
      // so the hand-off gets the live-period roll, the account-id check and
      // the selection pruning like every other filter change.
      const openInHistory = (catId, tag) => {
        const aFilters = window.Store.state.analyticsFilters;
        window.Store.dispatch('UPDATE_FILTERS', {
          page: 'history',
          filters: {
            period: { ...aFilters.period },
            accounts: [...aFilters.accounts],
            categories: [catId],
            types: [this._currentType],
            tags: tag ? [tag] : []
          }
        });
        if (window.Router) window.Router.navigate('#transactions');
      };

      const panelFor = (catId) => {
        let found = null;
        container.querySelectorAll('.donut-tag-panel').forEach(p => {
          if (p.dataset.tagPanel === catId) found = p;
        });
        return found;
      };

      const fillPanel = (catId, panel) => {
        const esc = (v) => this._esc(v);
        const breakdown = window.Store.computeCategoryTagBreakdown(filters, this._currentType, catId);
        const rows = breakdown.rows.map(r => `
          <div class="donut-tag-row touch-target" data-tag-row="${esc(r.tag)}" role="button" tabindex="0">
            <span class="donut-tag-name${r.isUntagged ? ' is-untagged' : ''}">${r.isUntagged ? window.I18n.t('history.noTag') : '#' + esc(r.tag)}</span>
            <span class="donut-tag-count">${r.count}</span>
            <span class="donut-tag-amount">${esc(window.Store.formatCurrency(r.amount, ccy))}</span>
          </div>`).join('');
        // Always offer the whole category too — the pre-v0.85 behaviour, and
        // the only route to a category whose rows are all tagged differently.
        panel.innerHTML = `
          <div class="donut-tag-list">
            ${rows}
            <div class="donut-tag-row donut-tag-row--all touch-target" data-tag-row="__all__" role="button" tabindex="0">
              <span class="donut-tag-name">All ${breakdown.count} transaction${breakdown.count === 1 ? '' : 's'}</span>
              <span class="donut-tag-amount">${esc(window.Store.formatCurrency(breakdown.total, ccy))}</span>
            </div>
          </div>`;
        panel.querySelectorAll('.donut-tag-row').forEach(row => {
          row.addEventListener('click', (e) => {
            e.stopPropagation();
            const tag = row.dataset.tagRow;
            openInHistory(catId, tag === '__all__' ? null : tag);
          });
        });
        if (window.StackdHydrateIcons) window.StackdHydrateIcons();
      };

      const setExpanded = (catId, expanded) => {
        const panel = panelFor(catId);
        if (!panel) return;
        const group = panel.closest('.donut-legend-group');
        const header = group ? group.querySelector('.donut-legend-item') : null;
        if (expanded) fillPanel(catId, panel);
        else panel.innerHTML = '';
        if (group) group.classList.toggle('is-expanded', expanded);
        if (header) header.setAttribute('aria-expanded', expanded ? 'true' : 'false');
      };

      const legendItems = container.querySelectorAll('.donut-legend-item');
      legendItems.forEach(item => {
        const catId = item.dataset.catId;
        if (catId === '__others__') return; // aggregate row: nothing to drill into
        item.addEventListener('click', () => {
          const isOpen = this._expandedCatId === catId;
          if (this._expandedCatId) setExpanded(this._expandedCatId, false);
          this._expandedCatId = isOpen ? null : catId;
          if (this._expandedCatId) setExpanded(this._expandedCatId, true);
        });
      });

      // Restore the open accordion after any re-render (this runs on every
      // attachEvents, including the type toggle's local re-render below).
      if (this._expandedCatId && panelFor(this._expandedCatId)) {
        setExpanded(this._expandedCatId, true);
      } else if (this._expandedCatId) {
        this._expandedCatId = null; // that category left the top-5
      }


      if (window.StackdHydrateIcons) window.StackdHydrateIcons();

      if (!canvas || !window.Chart) return;

      // 1.2.2 (HG-8 P2): the slices render() just laid out (same pass)
      const pass = this._ringPass;
      if (!pass || !pass.ring || !pass.slices.length) return;
      const CR = window.Components.CategoryRing;

      if (this._chartInstance) {
        CR.stop(this._chartInstance);
        this._chartInstance.destroy();
      }

      // 1.2.0 (UX-7): the shared ring look; the sweep plays on the Analytics
      // entry render only (v0.93's animation: false stays the rule for every
      // other mount). 1.2.2 (HG-8 P2): no tooltip and no Chart.js events —
      // the box's one hit test owns taps (tap-to-focus, as on Goals); a
      // square 220 px box, padding 7, hoverOffset 0, and the focus plugin.
      this._chartInstance = new window.Chart(canvas, window.Components.RingChart.config({
        type: 'doughnut',
        data: {
          labels: pass.slices.map(sl => sl.name),
          datasets: [{
            data: pass.slices.map(sl => sl.value),
            backgroundColor: pass.slices.map(sl => sl.color),
            hoverOffset: 0
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          events: [],
          layout: { padding: 7 },
          plugins: { legend: { display: false }, tooltip: { enabled: false } }
        },
        plugins: [CR.plugin()]
      }, {
        animate,
        delay: 250 // past the view-transition snapshot
      }));

      // A focus restored by a re-render: final state, no tween.
      if (this._focus) {
        const idx = pass.slices.findIndex(sl => sl.id === this._focus.id);
        if (idx >= 0) CR.focus(this._chartInstance, pass.ring.count, idx, true, pass.ring.scale);
      }
      const box = container.querySelector('#analytics-ring-box');
      if (box) CR.wire(this._ringHost(box));
    }
  },

  // -----------------------------------------------------------------------
  // 1.2.0 (UX-9) TAG PICKER (docs/ux-review-1.2-plan.md §C.2) — replaces the
  // orphan TagsModal. Full-screen sheet on the CategorySelectionModal shell:
  // ✕ closes without a change, + (or Enter in the search box) creates or
  // selects the typed tag, ✓ applies. The open category's tags (explicit ∪
  // derived links, Store.getTagsForCategory) list first, then every other tag
  // alphabetically. Apply hands the selection to onApply and then links the
  // tags SILENTLY (LINK_TAG {silent}: saved, no re-render — the form that
  // opened the sheet keeps its unsaved fields). Tag and category names are
  // stored text: every one goes through Components.esc.
  // -----------------------------------------------------------------------
  TagPickerSheet: {
    show(options = {}) {
      const { selectedTags = [], categoryId = '', typeHint = '', onApply } = options;
      const container = document.getElementById('modal-container');
      if (!container) return;
      const esc = (v) => window.Components.esc(v);
      const t = (k, p) => window.I18n.t(k, p);
      const S = window.Store;
      const catId = typeHint === 'transfer' ? '' : (categoryId || '');
      const category = catId ? (S.getState().categories || []).find(c => c.id === catId) : null;
      const groups = S.getTagsForCategory(category ? catId : '');
      let selected = [];
      (Array.isArray(selectedTags) ? selectedTags : []).forEach(tag => {
        const s = String(tag == null ? '' : tag);
        if (s && !selected.includes(s)) selected.push(s);
      });
      const created = [];
      const known = new Set([...groups.linked, ...groups.others]);

      const old = document.getElementById('tag-picker-sheet');
      if (old) old.remove();

      const backdrop = document.createElement('div');
      backdrop.className = 'modal-backdrop';
      backdrop.id = 'tag-picker-sheet';
      backdrop.style.zIndex = '10000';
      backdrop.style.display = 'flex';
      backdrop.style.flexDirection = 'column';
      backdrop.setAttribute('role', 'dialog');
      backdrop.setAttribute('aria-modal', 'true');
      backdrop.setAttribute('aria-labelledby', 'tps-title');
      backdrop.innerHTML = `
        <div class="modal-content tps-content">
          <div class="modal-top-bar modal-top-bar--safe">
            <button type="button" class="modal-btn-top modal-btn-close tps-top-btn" id="tps-close" aria-label="${t('tagPicker.closeAria')}">✕</button>
            <h2 id="tps-title" class="header-title tps-title">${t('tagPicker.title')}</h2>
            <div class="tps-top-actions">
              <button type="button" class="modal-btn-top tps-top-btn tps-add" id="tps-add" aria-label="${t('tagPicker.addAria')}">+</button>
              <button type="button" class="modal-btn-top tps-top-btn tps-apply" id="tps-apply" aria-label="${t('tagPicker.applyAria')}">✓</button>
            </div>
          </div>
          <div class="modal-body tps-body">
            <input type="text" id="tps-search" class="form-control" placeholder="${t('tagPicker.search')}" aria-label="${t('tagPicker.search')}" autocomplete="off" autocapitalize="none" spellcheck="false" maxlength="60">
            <div id="tps-selected" class="tps-selected"></div>
            <div id="tps-lists"></div>
          </div>
        </div>
      `;

      const search = backdrop.querySelector('#tps-search');
      const selectedEl = backdrop.querySelector('#tps-selected');
      const listsEl = backdrop.querySelector('#tps-lists');
      const query = () => String(search.value || '').toLowerCase().replace(/^[\s#]+/, '').trim();

      const rowHtml = (tag) => {
        const on = selected.includes(tag);
        return `<div class="list-item touch-target tps-row${on ? ' is-selected' : ''}" data-tag="${esc(tag)}" role="checkbox" aria-checked="${on ? 'true' : 'false'}" tabindex="0">
          <span class="tps-row-name">#${esc(tag)}</span>
          ${created.includes(tag) ? `<span class="tps-row-new">${t('tagPicker.created')}</span>` : ''}
          <span class="tps-row-check" aria-hidden="true">${on ? '✓' : ''}</span>
        </div>`;
      };

      const render = () => {
        selectedEl.innerHTML = selected.map(tag =>
          `<button type="button" class="tag-chip tps-chip" data-tag="${esc(tag)}" aria-label="${t('form.removeTag', { tag: esc(tag) })}">#${esc(tag)} <span aria-hidden="true">×</span></button>`
        ).join('') || `<span class="tps-selected-none">${t('form.tagsNone')}</span>`;
        const q = query();
        const match = (tag) => !q || tag.toLowerCase().includes(q);
        // A tag created here joins the open category's list (it will be linked
        // on Apply), or the all-tags list when there is no category.
        const linked = category ? [...groups.linked, ...created.filter(c => !groups.linked.includes(c))] : [];
        const others = category ? groups.others.filter(o => !created.includes(o)) : [...groups.others, ...created.filter(c => !groups.others.includes(c))];
        const sortT = (a) => S._sortTags(a);
        const inCat = sortT(linked.filter(match));
        const all = sortT(others.filter(match));
        let html = '';
        if (category && inCat.length) {
          html += `<div class="tps-section" id="tps-section-category">
            <div class="tps-section-title">${t('tagPicker.inCategory', { category: esc(category.name) })}</div>
            <div class="list-group">${inCat.map(rowHtml).join('')}</div>
          </div>`;
        }
        if (all.length) {
          html += `<div class="tps-section" id="tps-section-all">
            <div class="tps-section-title">${t('tagPicker.allTags')}</div>
            <div class="list-group">${all.map(rowHtml).join('')}</div>
          </div>`;
        }
        if (!html) html = `<p class="tps-empty" id="tps-empty">${t('tagPicker.none')}</p>`;
        listsEl.innerHTML = html;
      };

      const toggle = (tag) => {
        selected = selected.includes(tag) ? selected.filter(x => x !== tag) : [...selected, tag];
        render();
      };

      // + / Enter: the typed name, through the store's one normaliser. An
      // existing tag is selected; a new one is selected and remembered as
      // created (linked on Apply even with no category, so it stays listed).
      const addTyped = () => {
        const tag = S.normalizeTag(search.value);
        if (!tag) { search.focus(); return; }
        if (!known.has(tag) && !created.includes(tag)) created.push(tag);
        if (!selected.includes(tag)) selected = [...selected, tag];
        search.value = '';
        render();
      };

      let closed = false;
      const close = () => {
        if (closed) return;
        closed = true;
        backdrop.classList.remove('open');
        const content = backdrop.querySelector('.modal-content');
        if (content) content.style.transform = 'translateY(100%)';
        setTimeout(() => backdrop.remove(), 300);
      };

      const apply = () => {
        const result = [...selected];
        close();
        if (onApply) onApply(result);
        const toLink = [];
        result.forEach(tag => {
          if (category) {
            if (!S.getTagLinks(tag).includes(catId)) toLink.push({ tag, categoryId: catId, silent: true });
          } else if (created.includes(tag)) {
            toLink.push({ tag, categoryId: null, silent: true });
          }
        });
        if (toLink.length) S.batch(() => toLink.forEach(p => S.dispatch('LINK_TAG', p)));
      };

      backdrop.querySelector('#tps-close').onclick = close;
      backdrop.querySelector('#tps-add').onclick = addTyped;
      backdrop.querySelector('#tps-apply').onclick = apply;
      backdrop.addEventListener('click', (e) => {
        if (e.target === backdrop) { close(); return; }
        const chip = e.target.closest('.tps-chip');
        if (chip) { toggle(chip.dataset.tag); return; }
        const row = e.target.closest('.tps-row');
        if (row) toggle(row.dataset.tag);
      });
      backdrop.addEventListener('keydown', (e) => {
        const row = e.target.closest && e.target.closest('.tps-row');
        if (row && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); toggle(row.dataset.tag); }
      });
      search.addEventListener('input', render);
      search.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); addTyped(); }
      });

      render();
      container.appendChild(backdrop);
      const content = backdrop.querySelector('.modal-content');
      void content.offsetHeight; // start the slide from the closed position (no rAF: hidden panes have none)
      backdrop.classList.add('open');
      content.style.transform = 'translateY(0)';
    }
  },

  // -----------------------------------------------------------------------
  // RECURRING UPDATE MODAL (rebuilt v0.67)
  // 3-choice scope sheet shown when saving ANY change to a transaction that
  // belongs to a recurrent series (mirrors RecurringDeleteModal's layout).
  // Accepts either { onSelection(scope) } with scope 'single'|'future'|'all',
  // or the delete-modal-style { onlyThis, thisAndFuture, allTransactions }
  // callbacks (the v0.32 caller used the latter shape and crashed — B3).
  // Optional flags tune the copy: dateChanged, recurrenceRemoved,
  // scheduleChanged (1.0.2 BUG-26: 'Only this' keeps the series' end date and
  // frequency), paidNote (1.0.2 BUG-27: 'only' | 'rebuild' | null) and
  // amountNote (1.0.2 live-U3-N1: a rebuild would replace a later member's
  // different amount, e.g. a hand-edited loan payment).
  // -----------------------------------------------------------------------
  // 1.2.2 (HG-14, docs/tags-page-plan.md): the Tags page's add / edit sheet.
  // One wrapper, four steps (PeriodSheet's pattern): 'form' (name +
  // category chips), 'cats' (pick a category to add), 'confirm' (one summary
  // of every change; a removed category that still has rows with the tag
  // asks what they do) and 'delete'. Nothing is dispatched before Confirm.
  TagEditSheet: {
    show(options = {}) {
      const S = window.Store;
      const t = (k, p) => window.I18n.t(k, p);
      const esc = (v) => window.I18n.esc(v);
      const container = document.getElementById('modal-container');
      if (!container) return;
      const old = document.getElementById('tag-edit-sheet');
      if (old) old.remove();

      const orig = options.tag ? S.normalizeTag(options.tag) : '';
      const cats = () => S.getState().categories || [];
      const catOf = (id) => cats().find(c => c.id === id);
      const usage = orig ? S.tagUsage(orig) : { total: 0, byCat: Object.create(null) };
      const origCats = orig ? S.getTagLinks(orig).filter(id => catOf(id)) : [];
      const st = {
        step: 'form',
        name: orig,
        cats: origCats.slice(),
        added: [],          // in the order they were added (D6: newest preselected)
        choice: {},         // removed catId → {mode, to}
        error: ''
      };
      const known = () => S.getAllUniqueTags();
      const norm = () => S.normalizeTag(st.name);
      const removedCats = () => origCats.filter(id => !st.cats.includes(id));
      const isDirty = () => !orig ? !!norm()
        : (norm() !== orig || removedCats().length > 0 || st.cats.some(id => !origCats.includes(id)));
      const clash = () => { const n = norm(); return n && n !== orig && known().includes(n); };

      const wrapper = document.createElement('div');
      wrapper.className = 'modal-backdrop';
      wrapper.id = 'tag-edit-sheet';
      wrapper.setAttribute('role', 'dialog');
      wrapper.setAttribute('aria-modal', 'true');
      wrapper.setAttribute('aria-labelledby', 'tes-title');

      const close = () => {
        wrapper.classList.remove('open');
        document.removeEventListener('keydown', onKey, true);
        setTimeout(() => wrapper.remove(), 300);
      };

      const chipHtml = (id) => {
        const c = catOf(id);
        if (!c) return '';
        return `<span class="tes-chip"><i data-lucide="${esc(c.icon || 'pin')}" aria-hidden="true"></i><span class="tes-chip-name">${esc(c.name)}</span>
          <button type="button" class="tes-chip-x" data-k="rm-${esc(id)}" data-rm="${esc(id)}" aria-label="${t('tags.removeCategory', { name: esc(c.name) })}"><i data-lucide="x" aria-hidden="true"></i></button></span>`;
      };

      const formHtml = () => {
        const n = usage.total;
        return `
          <div class="period-sheet-head">
            <h2 id="tes-title" class="period-sheet-title">${t(orig ? 'tags.editTitle' : 'tags.newTitle')}</h2>
            <button type="button" class="period-sheet-x" data-k="close" data-back-dismiss aria-label="${t('common.close')}"><i data-lucide="x" aria-hidden="true"></i></button>
          </div>
          <label class="tes-label" for="tag-name">${t('tags.name')}</label>
          <div class="tes-name-wrap"><span class="tes-hash" aria-hidden="true">#</span>
            <input id="tag-name" class="form-control tes-name" type="text" maxlength="40" autocomplete="off" autocapitalize="none" spellcheck="false" value="${esc(st.name)}"${st.error ? ' aria-invalid="true" aria-describedby="tag-name-error"' : ''}></div>
          ${st.error ? `<p id="tag-name-error" class="tes-error" role="alert">${st.error}</p>` : ''}
          <div class="tes-label" id="tes-cats-label">${t('tags.categories')}</div>
          <div class="tes-chips" role="group" aria-labelledby="tes-cats-label">
            ${st.cats.map(chipHtml).join('')}
            <button type="button" class="tes-chip tes-chip--add" data-k="add-cat"><i data-lucide="plus" aria-hidden="true"></i>${t('tags.addCategory')}</button>
          </div>
          ${st.cats.length ? '' : `<p class="tes-hint">${t('tags.noCategories')}</p>`}
          ${orig && n ? `<button type="button" class="tes-see" data-k="see">${t('tags.seeTx', { count: n })}<i data-lucide="chevron-right" aria-hidden="true"></i></button>` : ''}
          <div class="tes-actions">
            ${orig ? `<button type="button" class="btn btn-danger" data-k="delete" id="tes-delete">${t('common.delete')}</button>` : ''}
            <button type="button" class="btn btn-primary" data-k="save" id="tes-save"${isDirty() ? '' : ' disabled'}>${t('common.save')}</button>
          </div>`;
      };

      const catsHtml = () => {
        const list = cats().filter(c => !st.cats.includes(c.id)).sort((a, b) => S.compareAlpha(a, b));
        return `
          <div class="period-sheet-head">
            <button type="button" class="period-sheet-back" data-k="back" data-back-dismiss><i data-lucide="chevron-left" aria-hidden="true"></i>${t('tags.backToTag')}</button>
            <h2 id="tes-title" class="period-sheet-title">${t('tags.pickCategory')}</h2>
            <span class="tes-head-pad" aria-hidden="true"></span>
          </div>
          <div class="tes-catlist">
            ${list.map(c => `<button type="button" class="tes-cat" data-k="pick-${esc(c.id)}" data-pick="${esc(c.id)}"><i data-lucide="${esc(c.icon || 'pin')}" aria-hidden="true"></i><span>${esc(c.name)}</span></button>`).join('')}
          </div>`;
      };

      // the rows a removed category still holds decide its question
      const asked = () => removedCats().filter(id => usage.byCat[id] && usage.byCat[id].count > 0);
      const confirmHtml = () => {
        const n = norm();
        const lines = [];
        if (orig && n !== orig) {
          const merge = clash();
          const c = usage.total;
          const key = merge ? (c ? 'tags.confirmMerge' : 'tags.confirmMergeNoTx') : (c ? 'tags.confirmRename' : 'tags.confirmRenameNoTx');
          lines.push(t(key, { from: esc(orig), to: esc(n), count: c }));
        }
        const add = st.cats.filter(id => !origCats.includes(id)).map(id => esc(catOf(id).name));
        if (add.length) lines.push(t('tags.confirmLinked', { names: add.join(', ') }));
        const quiet = removedCats().filter(id => !asked().includes(id)).map(id => esc(catOf(id).name));
        if (quiet.length) lines.push(t('tags.confirmUnlinked', { names: quiet.join(', ') }));
        const questions = asked().map(id => {
          const u = usage.byCat[id];
          const cname = esc(catOf(id).name);
          const ch = st.choice[id];
          const targets = st.cats;
          const canMove = targets.length > 0 && u.movable > 0;
          const radio = (mode, label) => `<label class="tes-opt"><input type="radio" name="tes-${esc(id)}" data-mode="${mode}" data-cat="${esc(id)}"${ch.mode === mode ? ' checked' : ''}><span>${label}</span></label>`;
          return `<fieldset class="tes-q">
            <legend>${t('tags.removedQ', { count: u.count, cat: cname, tag: esc(orig) })}</legend>
            ${radio('untag', t('tags.optUntag', { cat: cname }))}
            ${radio('keep', t('tags.optKeep', { cat: cname }))}
            ${canMove ? radio('move', t('tags.optMove')) : ''}
            ${canMove && ch.mode === 'move' ? `<label class="tes-move"><span>${t('tags.moveTo')}</span>
              <select class="form-control" data-move="${esc(id)}">${targets.map(tid => `<option value="${esc(tid)}"${ch.to === tid ? ' selected' : ''}>${esc(catOf(tid).name)}</option>`).join('')}</select></label>
              ${u.movable < u.count ? `<p class="tes-hint">${t('tags.moveSkipped', { count: u.count - u.movable, cat: cname })}</p>` : ''}` : ''}
          </fieldset>`;
        }).join('');
        return `
          <div class="period-sheet-head">
            <button type="button" class="period-sheet-back" data-k="back" data-back-dismiss><i data-lucide="chevron-left" aria-hidden="true"></i>${t('tags.backToTag')}</button>
            <h2 id="tes-title" class="period-sheet-title">${t('tags.confirmTitle')}</h2>
            <span class="tes-head-pad" aria-hidden="true"></span>
          </div>
          ${lines.length ? `<ul class="tes-summary">${lines.map(l => `<li>${l}</li>`).join('')}</ul>` : ''}
          ${questions}
          <div class="tes-actions"><button type="button" class="btn btn-primary" data-k="confirm" id="tes-confirm">${t('tags.confirm')}</button></div>`;
      };

      const deleteHtml = () => `
          <div class="period-sheet-head">
            <button type="button" class="period-sheet-back" data-k="back" data-back-dismiss><i data-lucide="chevron-left" aria-hidden="true"></i>${t('tags.backToTag')}</button>
            <h2 id="tes-title" class="period-sheet-title">${t('tags.deleteTitle', { tag: esc(orig) })}</h2>
            <span class="tes-head-pad" aria-hidden="true"></span>
          </div>
          <p class="tes-body">${usage.total ? t('tags.deleteBody', { count: usage.total }) : t('tags.deleteBodyNoTx')}</p>
          <div class="tes-actions"><button type="button" class="btn btn-danger" data-k="delete-yes" id="tes-delete-yes">${t('common.delete')}</button></div>`;

      const paint = (focusKey) => {
        const body = { form: formHtml, cats: catsHtml, confirm: confirmHtml, delete: deleteHtml }[st.step]();
        wrapper.innerHTML = `<div class="modal-content period-sheet tes-sheet">${body}</div>`;
        if (window.StackdHydrateIcons) window.StackdHydrateIcons(wrapper);
        const el = (focusKey && wrapper.querySelector(focusKey.startsWith('#') ? focusKey : `[data-k="${focusKey}"]`))
          || (st.step === 'form' && !orig ? wrapper.querySelector('#tag-name') : null)
          || wrapper.querySelector('[data-k]');
        if (el) el.focus({ preventScroll: true });
        const input = wrapper.querySelector('#tag-name');
        if (input) {
          input.addEventListener('input', () => {
            st.name = input.value;
            if (st.error) { st.error = ''; const er = wrapper.querySelector('#tag-name-error'); if (er) er.remove(); input.removeAttribute('aria-invalid'); input.removeAttribute('aria-describedby'); }
            const sv = wrapper.querySelector('#tes-save');
            if (sv) sv.disabled = !isDirty();
          });
          input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); save(); } });
        }
      };

      const finish = (dispatchArgs) => {
        S.dispatch(...dispatchArgs);
        close();
        if (window.Components.Announcer) window.Components.Announcer.say(t('tags.savedAnnounce'));
      };

      const save = () => {
        if (!isDirty()) return;
        const n = norm();
        if (!n) { st.error = t('tags.errEmpty'); paint('#tag-name'); return; }
        if (!orig && known().includes(n)) { st.error = t('tags.errExists'); paint('#tag-name'); return; }
        if (!orig) { finish(['EDIT_TAG', { tag: null, name: n, categoryIds: st.cats }]); return; }
        // D2/D6: each asked category starts on "keep the tag"; Move targets the newest added
        asked().forEach(id => {
          if (!st.choice[id]) st.choice[id] = { mode: 'keep', to: '' };
          const pref = st.added.slice().reverse().find(x => st.cats.includes(x)) || st.cats[0] || '';
          if (!st.cats.includes(st.choice[id].to)) st.choice[id].to = pref;
        });
        st.step = 'confirm';
        paint();
      };

      const confirm = () => {
        const removed = {};
        removedCats().forEach(id => {
          const ch = st.choice[id];
          removed[id] = ch && asked().includes(id) ? { mode: ch.mode, to: ch.to } : { mode: 'untag' };
        });
        finish(['EDIT_TAG', { tag: orig, name: norm(), categoryIds: st.cats, removed }]);
      };

      wrapper.addEventListener('click', (e) => {
        if (e.target === wrapper) { close(); return; }
        const btn = e.target.closest && e.target.closest('[data-k]');
        if (!btn || btn.disabled) return;
        const k = btn.dataset.k;
        if (k === 'close') { close(); return; }
        if (k === 'back') { st.step = 'form'; paint('save'); return; }
        if (k === 'add-cat') { st.step = 'cats'; paint(); return; }
        if (btn.dataset.pick) {
          st.cats.push(btn.dataset.pick);
          if (!origCats.includes(btn.dataset.pick)) st.added.push(btn.dataset.pick);
          st.step = 'form';
          paint('add-cat');
          return;
        }
        if (btn.dataset.rm) { st.cats = st.cats.filter(id => id !== btn.dataset.rm); paint('add-cat'); return; }
        if (k === 'see') { close(); window.Views.TagsView.openHistory(orig); return; }
        if (k === 'save') { save(); return; }
        if (k === 'confirm') { confirm(); return; }
        if (k === 'delete') { st.step = 'delete'; paint(); return; }
        if (k === 'delete-yes') finish(['DELETE_TAG', { tag: orig, fromTransactions: true }]);
      });
      wrapper.addEventListener('change', (e) => {
        const el = e.target;
        if (el.dataset.mode) {
          st.choice[el.dataset.cat].mode = el.dataset.mode;
          paint(`#tes-confirm`);
          const r = [...wrapper.querySelectorAll("input[data-mode]")].find(x => x.dataset.cat === el.dataset.cat && x.dataset.mode === el.dataset.mode);
          if (r) r.focus({ preventScroll: true });
        } else if (el.dataset.move) {
          st.choice[el.dataset.move].to = el.value;
        }
      });

      const onKey = (e) => {
        if (!wrapper.isConnected) return;
        if (e.key === 'Escape') {
          e.preventDefault();
          e.stopPropagation();
          if (st.step === 'form') close(); else { st.step = 'form'; paint('save'); }
        }
      };
      document.addEventListener('keydown', onKey, true);

      container.appendChild(wrapper);
      paint();
      requestAnimationFrame(() => wrapper.classList.add('open'));
    }
  },

  RecurringUpdateModal: {
    show(options) {
      const { dateChanged = false, recurrenceRemoved = false, scheduleChanged = false, paidNote = null, amountNote = false, gapNote = false } = options;
      const onSelection = options.onSelection || ((scope) => {
        if (scope === 'single' && options.onlyThis) options.onlyThis();
        else if (scope === 'future' && options.thisAndFuture) options.thisAndFuture();
        else if (scope === 'all' && options.allTransactions) options.allTransactions();
      });
      const container = document.getElementById('modal-container');

      // 1.0.2 (live-U8-PRE-2): translated (was English in every language)
      let description = window.I18n.t('recUpdate.description');
      let futureSub = window.I18n.t('recUpdate.futureSub');
      let allSub = window.I18n.t('recUpdate.allSub');
      if (recurrenceRemoved) {
        description = window.I18n.t('recUpdate.stopDescription');
        futureSub = window.I18n.t('recUpdate.futureSubStop');
        allSub = window.I18n.t('recUpdate.allSubStop');
      } else if (dateChanged) {
        futureSub = window.I18n.t('recUpdate.futureSubDate');
        allSub = window.I18n.t('recUpdate.allSubDate');
      }

      const optionCard = (id, title, sub) => `
        <button id="${id}" class="touch-target" style="
          display: flex; align-items: center; gap: var(--space-4);
          background: var(--bg-surface); border: 1px solid var(--border-color);
          border-radius: var(--radius-lg); padding: var(--space-4);
          cursor: pointer; text-align: left; width: 100%;
        ">
          <div style="flex: 1;">
            <div style="font-weight: 600; color: var(--text-primary); font-size: var(--text-base);">${title}</div>
            <div style="color: var(--text-secondary); font-size: var(--text-sm); margin-top: 2px;">${sub}</div>
          </div>
        </button>`;

      const div = document.createElement('div');
      div.innerHTML = `
        <div class="modal-backdrop" id="recurring-update-modal" role="dialog" aria-modal="true" aria-labelledby="rum-title">
          <div class="modal-content" style="padding: 0; overflow: hidden;">
            <div class="modal-handle"></div>
            <div style="padding: var(--space-5) var(--space-5) var(--space-2);">
              <h2 id="rum-title" class="header-title" style="margin: 0 0 var(--space-1); font-size: var(--text-xl);">${window.I18n.t(recurrenceRemoved ? 'recUpdate.stopTitle' : 'recUpdate.title')}</h2>
              <p style="color: var(--text-secondary); font-size: var(--text-sm); margin: 0;">${description}</p>
              ${amountNote ? `<p id="ru-amount-note" style="color: var(--text-secondary); font-size: var(--text-xs); margin: var(--space-2) 0 0;">${window.I18n.t('recUpdate.rebuildAmountNote')}</p>` : ''}
              ${paidNote ? `<p id="ru-paid-note" style="color: var(--text-secondary); font-size: var(--text-xs); margin: var(--space-2) 0 0;">${window.I18n.t(paidNote === 'rebuild' ? 'recUpdate.rebuildPaidNote' : 'recUpdate.paidNote')}</p>` : ''}
              ${gapNote ? `<p id="ru-gap-note" style="color: var(--text-secondary); font-size: var(--text-xs); margin: var(--space-2) 0 0;">${window.I18n.t('recUpdate.gapNote')}</p>` : ''}
            </div>

            <div style="display: flex; flex-direction: column; padding: var(--space-3) var(--space-4) var(--space-5); gap: var(--space-2);">
              ${optionCard('ru-only-this', window.I18n.t('recUpdate.onlyThis'), window.I18n.t(recurrenceRemoved ? 'recUpdate.onlyThisSubUnlink' : scheduleChanged ? 'recUpdate.onlyThisSubSchedule' : 'recUpdate.onlyThisSub'))}
              ${optionCard('ru-this-future', window.I18n.t('recUpdate.thisFuture'), futureSub)}
              ${optionCard('ru-all-series', window.I18n.t('recUpdate.allSeries'), allSub)}
              <button id="ru-cancel" data-back-dismiss class="btn btn-secondary" style="margin-top: var(--space-1);">${window.I18n.t('common.cancel')}</button>
            </div>
          </div>
        </div>
      `;
      
      const existing = document.getElementById('recurring-update-modal');
      if (existing) existing.remove();
      container.appendChild(div.firstElementChild);
      window.StackdHydrateIcons?.();

      const backdrop = document.getElementById('recurring-update-modal');
      const modalContent = backdrop.querySelector('.modal-content');

      // Swipe-to-dismiss Logic
      let startY = 0;
      let currentY = 0;
      let isDragging = false;

      const onStart = (e) => {
        startY = e.touches[0].clientY;
        isDragging = true;
        modalContent.style.transition = 'none';
      };

      const onMove = (e) => {
        if (!isDragging) return;
        currentY = e.touches[0].clientY - startY;
        if (currentY > 0) {
          modalContent.style.transform = `translateY(${currentY}px)`;
        }
      };

      const onEnd = () => {
        isDragging = false;
        modalContent.style.transition = 'transform 0.3s cubic-bezier(0.16, 1, 0.3, 1)';
        if (currentY > 150) {
          modalContent.style.transform = `translateY(100%)`;
          setTimeout(() => close(), 200);
        } else {
          modalContent.style.transform = `translateY(0)`;
        }
        currentY = 0;
      };

      backdrop.addEventListener('touchstart', onStart, { passive: true });
      backdrop.addEventListener('touchmove', onMove, { passive: true });
      backdrop.addEventListener('touchend', onEnd);

      const close = () => {
        backdrop.classList.remove('open');
        setTimeout(() => backdrop.remove(), 300);
      };

      backdrop.onclick = (e) => {
        if (e.target === backdrop) close();
      };

      document.getElementById('ru-cancel').onclick = close;

      // v0.67: close first, then invoke — matches the sibling recurring modals
      const btnOnly = document.getElementById('ru-only-this');
      if (btnOnly) btnOnly.onclick = () => { close(); onSelection('single'); };

      const btnFuture = document.getElementById('ru-this-future');
      if (btnFuture) btnFuture.onclick = () => { close(); onSelection('future'); };

      const btnAll = document.getElementById('ru-all-series');
      if (btnAll) btnAll.onclick = () => { close(); onSelection('all'); };

      requestAnimationFrame(() => backdrop.classList.add('open'));
    }
  },

  // -------------------------
  // MONTH PICKER (v0.16)
  // -------------------------
  MonthPicker: {
    // 1.1.0 (IE-8): the Export Period sheet reuses the picker, so the grid
    // and the Selected line follow the app language (were English literals).
    get MONTHS() { return window.I18n.monthNames('short'); },
    get MONTHS_FULL() { return window.I18n.monthNames('long'); },

    show(options = {}) {
      // 1.0.3 (BUG-104) `clearText` + `onClear`: an extra button that empties
      // an optional field (the budget End Month) and closes the picker.
      // `clearText` is t() output: markup-safe, never escaped again.
      const { initialValue, onSelect, clearText, onClear } = options;

      // Parse the initialValue (expected format: "YYYY-MM") or default to today
      const now = new Date();
      let initYear = now.getFullYear();
      let initMonth = now.getMonth(); // 0-indexed

      if (initialValue && /^\d{4}-\d{2}$/.test(initialValue)) {
        const [y, m] = initialValue.split('-').map(Number);
        initYear = y;
        initMonth = m - 1; // convert to 0-indexed
      }

      let currentYear = initYear;
      let selectedYear = initYear;
      let selectedMonth = initMonth; // 0-indexed

      const container = document.getElementById('modal-container');
      const wrapper = document.createElement('div');
      wrapper.className = 'modal-backdrop';
      wrapper.id = 'active-month-picker';
      wrapper.setAttribute('role', 'dialog');
      wrapper.setAttribute('aria-modal', 'true');
      wrapper.setAttribute('aria-labelledby', 'mp-title');

      const close = () => {
        wrapper.classList.remove('open');
        setTimeout(() => wrapper.remove(), 300);
      };

      const render = () => {
        wrapper.innerHTML = `
          <div class="modal-content" style="padding: 0; overflow: hidden;">
            <div class="modal-top-bar" style="display: flex; align-items: center; justify-content: space-between; padding: 16px; border-bottom: 1px solid var(--border-color);">
              <button class="modal-btn-top modal-btn-close" id="mp-cancel">${window.I18n.t('common.cancel')}</button>
              <h3 id="mp-title" style="margin: 0; font-weight: 800; font-size: 1rem;">${window.I18n.t('monthPicker.title')}</h3>
              <button class="modal-btn-top" id="mp-done" style="color: var(--color-accent); font-weight: 700;">${window.I18n.t('common.done')}</button>
            </div>

            <div style="padding: 16px 20px;">
              <!-- Year Navigator -->
              <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 20px;">
                <button id="mp-prev-year" class="btn-icon touch-target" style="width: 36px; height: 36px; background: var(--bg-surface-sunken); border-radius: 50%; border: none; cursor: pointer; color: var(--text-primary); display: flex; align-items: center; justify-content: center;" aria-label="${window.I18n.t('monthPicker.prevYear')}">
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg>
                </button>
                <span id="mp-year-label" style="font-family: var(--font-family-display); font-weight: 800; font-size: 1.4rem; color: var(--text-primary);">${currentYear}</span>
                <button id="mp-next-year" class="btn-icon touch-target" style="width: 36px; height: 36px; background: var(--bg-surface-sunken); border-radius: 50%; border: none; cursor: pointer; color: var(--text-primary); display: flex; align-items: center; justify-content: center;" aria-label="${window.I18n.t('monthPicker.nextYear')}">
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>
                </button>
              </div>

              <!-- Month Grid -->
              <div id="mp-month-grid" style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px;" role="group" aria-label="${window.I18n.t('monthPicker.gridAria')}">
                ${this.MONTHS.map((m, i) => {
                  const isSelected = (i === selectedMonth && currentYear === selectedYear);
                  const isToday = (i === now.getMonth() && currentYear === now.getFullYear());
                  return `<button
                    class="mp-month-btn touch-target"
                    data-month="${i}"
                    aria-pressed="${isSelected}"
                    aria-label="${this.MONTHS_FULL[i]} ${currentYear}"
                    style="
                      padding: 10px 4px;
                      border-radius: 10px;
                      border: ${isToday && !isSelected ? '1.5px solid var(--color-primary)' : '1.5px solid transparent'};
                      background: ${isSelected ? 'var(--color-primary)' : 'var(--bg-surface-sunken)'};
                      color: ${isSelected ? 'var(--text-on-primary, #fff)' : isToday ? 'var(--color-primary)' : 'var(--text-primary)'};
                      font-family: var(--font-family-display);
                      font-weight: ${isSelected || isToday ? '700' : '500'};
                      font-size: 0.9rem;
                      cursor: pointer;
                      transition: background 0.15s ease, transform 0.1s ease;
                    "
                  >${m}</button>`;
                }).join('')}
              </div>

              <!-- Selected Label -->
              <div style="text-align: center; margin-top: 20px; color: var(--text-secondary); font-size: 0.85rem;">
                ${window.I18n.t('monthPicker.selected')} <strong id="mp-selected-label" style="color: var(--text-primary);">${this.MONTHS_FULL[selectedMonth]} ${selectedYear}</strong>
              </div>
              ${clearText && onClear ? `<button type="button" class="btn btn-secondary" id="mp-clear" style="width: 100%; margin-top: 16px;">${clearText}</button>` : ''}
            </div>
          </div>
        `;

        // Bind month button clicks
        wrapper.querySelectorAll('.mp-month-btn').forEach(btn => {
          btn.addEventListener('click', () => {
            selectedMonth = parseInt(btn.dataset.month);
            selectedYear = currentYear;
            render(); // re-render to update selection highlight
          });
        });

        // Year navigation
        const prevYearBtn = wrapper.querySelector('#mp-prev-year');
        const nextYearBtn = wrapper.querySelector('#mp-next-year');
        if (prevYearBtn) prevYearBtn.addEventListener('click', () => { currentYear--; render(); });
        if (nextYearBtn) nextYearBtn.addEventListener('click', () => { currentYear++; render(); });

        // Cancel / Done
        const cancelBtn = wrapper.querySelector('#mp-cancel');
        const doneBtn = wrapper.querySelector('#mp-done');
        if (cancelBtn) cancelBtn.addEventListener('click', close);
        const clearBtn = wrapper.querySelector('#mp-clear'); // 1.0.3 (BUG-104)
        if (clearBtn) clearBtn.addEventListener('click', () => { onClear(); close(); });
        if (doneBtn) {
          doneBtn.addEventListener('click', () => {
            const val = `${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}`;
            if (onSelect) onSelect(val);
            close();
          });
        }

        // Close on backdrop tap
        wrapper.addEventListener('click', (e) => {
          if (e.target === wrapper) close();
        });
      };

      container.appendChild(wrapper);
      render();
      requestAnimationFrame(() => wrapper.classList.add('open'));
    }
  },

  // v1.01: manage the taught import rules (docs/bank-import-plan.md §5).
  // Deletes dispatch DELETE_IMPORT_RULE and prune the row in place — the
  // emit re-renders the view behind the sheet, but #modal-container lives
  // outside #router-view so the sheet itself survives.
  ImportRulesModal: {
    show() {
      const existing = document.getElementById('import-rules-modal');
      if (existing) existing.remove();
      const container = document.getElementById('modal-container');
      if (!container) return;

      const state = window.Store.getState();
      const rules = state.importRules || [];
      const esc = (s) => String(s).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));

      const row = (r) => {
        const cat = (state.categories || []).find(c => c.id === r.categoryId);
        return `
          <div class="list-item irm-row" data-rule-id="${r.id}" style="display: flex; align-items: center; gap: var(--space-3); padding: var(--space-3) 0;">
            <div class="list-item-icon" style="flex-shrink: 0;"><i data-lucide="${cat ? (cat.icon || 'pin') : 'pin'}"></i></div>
            <div style="flex: 1; min-width: 0;">
              <div style="font-weight: 600; font-size: var(--text-sm); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${esc(r.match)}</div>
              <div style="font-size: var(--text-xs); color: var(--text-secondary);">${cat ? esc(cat.name) : ''}</div>
            </div>
            <button type="button" class="irm-delete touch-target" aria-label="${window.I18n.t('common.delete')}" style="background: none; border: none; cursor: pointer; color: var(--color-expense); display: flex; padding: var(--space-2);"><i data-lucide="trash-2" style="width: 18px; height: 18px;"></i></button>
          </div>`;
      };
      const emptyHtml = `<div id="irm-empty" style="color: var(--text-secondary); font-size: var(--text-sm); line-height: 1.5; padding: var(--space-3) 0;">${window.I18n.t('bankImport.rulesEmpty')}</div>`;

      const div = document.createElement('div');
      div.innerHTML = `
        <div class="modal-backdrop" id="import-rules-modal" role="dialog" aria-modal="true" aria-labelledby="irm-title">
          <div class="modal-content">
            <div class="modal-handle"></div>
            <h2 id="irm-title" class="header-title" style="margin: 0 0 var(--space-2); font-size: 1.1rem;">${window.I18n.t('bankImport.rulesTitle')}</h2>
            <p style="color: var(--text-secondary); font-size: var(--text-xs); line-height: 1.5; margin: 0 0 var(--space-3);">${window.I18n.t('bankImport.rulesDesc')}</p>
            <div id="irm-list" style="max-height: 50vh; overflow-y: auto;">${rules.length ? rules.map(row).join('') : emptyHtml}</div>
            <button class="btn btn-secondary" id="irm-close" data-back-dismiss style="width: 100%; margin-top: var(--space-4);">${window.I18n.t('common.close')}</button>
          </div>
        </div>`;
      container.appendChild(div.firstElementChild);

      const backdrop = document.getElementById('import-rules-modal');
      const close = () => { backdrop.classList.remove('open'); setTimeout(() => backdrop.remove(), 300); };
      backdrop.addEventListener('click', (e) => { if (e.target === backdrop) close(); });
      backdrop.querySelector('#irm-close').addEventListener('click', close);
      backdrop.querySelector('#irm-list').addEventListener('click', (e) => {
        const btn = e.target && e.target.closest ? e.target.closest('.irm-delete') : null;
        if (!btn) return;
        const rowEl = btn.closest('.irm-row');
        if (!rowEl) return;
        window.Store.dispatch('DELETE_IMPORT_RULE', rowEl.dataset.ruleId);
        rowEl.remove();
        const list = backdrop.querySelector('#irm-list');
        if (list && !list.querySelector('.irm-row')) list.innerHTML = emptyHtml;
      });

      if (window.StackdHydrateIcons) window.StackdHydrateIcons();
      requestAnimationFrame(() => backdrop.classList.add('open'));
    }
  },

  CategorySelectionModal: {
    show(options) {
      const { selectedCategoryId, typeHint, onSelect, onAddNewCategory } = options;
      const container = document.getElementById('modal-container');
      if (!container) return;

      container.innerHTML = '';

      const modalBackdrop = document.createElement('div');
      modalBackdrop.className = 'modal-backdrop';
      modalBackdrop.id = 'category-selection-modal';
      modalBackdrop.style.zIndex = '10000';
      modalBackdrop.style.display = 'flex';
      modalBackdrop.style.flexDirection = 'column';
      modalBackdrop.setAttribute('role', 'dialog');
      modalBackdrop.setAttribute('aria-modal', 'true');
      modalBackdrop.setAttribute('aria-labelledby', 'csm-title');

      const categories = window.Store.getState().categories || [];
      const filteredCategories = categories.filter(c => !typeHint || c.typeHint === typeHint || c.typeHint === 'both' || typeHint === 'both');
      const sortedCategories = [...filteredCategories].sort((a, b) => window.Store.compareAlpha(a, b));

      modalBackdrop.innerHTML = `
        <div class="modal-content" style="padding: 0; display: flex; flex-direction: column; width: 100%; height: 100%; max-width: 100%; max-height: 100vh; border-radius: 0; transform: translateY(100%); transition: transform 0.3s cubic-bezier(0.16, 1, 0.3, 1);">
          <div class="modal-top-bar modal-top-bar--safe">
            <button class="modal-btn-top modal-btn-close" id="csm-close" aria-label="${window.I18n.t('catPicker.closeAria')}" style="display: flex; align-items: center; justify-content: center; width: 36px; height: 36px; border-radius: 12px; background: var(--bg-surface-sunken); border: none; cursor: pointer; color: var(--text-primary); font-size: 1.1rem; font-weight: bold; padding: 0;">✕</button>
            <h2 id="csm-title" class="header-title" style="margin: 0; font-size: 1.1rem; font-family: var(--font-family-display); font-weight: 700;">${window.I18n.t('catPicker.title')}</h2>
            <button class="modal-btn-top" id="csm-add-new" aria-label="${window.I18n.t('catPicker.addNewAria')}" style="display: flex; align-items: center; justify-content: center; width: 36px; height: 36px; border-radius: 12px; background: var(--bg-surface-sunken); border: none; cursor: pointer; color: var(--color-primary); font-size: 1.3rem; font-weight: bold; padding: 0;">+</button>
          </div>
          
          <div class="modal-body" style="padding: var(--space-4) var(--space-4) 40px; flex: 1; overflow-y: auto;">
            <div class="list-group" id="csm-category-list">
              <div class="list-item touch-target category-select-item" data-id="" style="cursor: pointer; display: flex; align-items: center; justify-content: space-between; padding: var(--space-4); margin-bottom: var(--space-2); border-radius: var(--radius-lg); ${!selectedCategoryId ? 'background: var(--bg-surface-sunken); border: 2px solid var(--color-primary);' : ''}">
                <div style="display: flex; align-items: center; gap: var(--space-3);">
                  <div class="list-item-icon" style="flex-shrink: 0;"><i data-lucide="minus-circle"></i></div>
                  <div class="list-item-title" style="font-weight: 600; color: var(--text-secondary);">${window.I18n.t('form.noCategorySelected')}</div>
                </div>
                ${!selectedCategoryId ? '<i data-lucide="check" style="width: 20px; height: 20px; color: var(--color-primary);"></i>' : ''}
              </div>
              ${sortedCategories.map(cat => {
                const isSelected = cat.id === selectedCategoryId;
                return `
                  <div class="list-item touch-target category-select-item" data-id="${cat.id}" style="cursor: pointer; display: flex; align-items: center; justify-content: space-between; padding: var(--space-4); margin-bottom: var(--space-2); border-radius: var(--radius-lg); ${isSelected ? 'background: var(--bg-surface-sunken); border: 2px solid var(--color-primary);' : ''}">
                    <div style="display: flex; align-items: center; gap: var(--space-3);">
                      <div class="list-item-icon" style="flex-shrink: 0;"><i data-lucide="${cat.icon || 'pin'}"></i></div>
                      <div class="list-item-title" style="font-weight: 600;">${window.Components.esc(cat.name)}</div>
                    </div>
                    ${isSelected ? '<i data-lucide="check" style="width: 20px; height: 20px; color: var(--color-primary);"></i>' : ''}
                  </div>
                `;
              }).join('')}
            </div>
          </div>
        </div>
      `;

      const close = () => {
        modalBackdrop.classList.remove('open');
        const content = modalBackdrop.querySelector('.modal-content');
        if (content) content.style.transform = 'translateY(100%)';
        setTimeout(() => {
          modalBackdrop.remove();
          const mc = document.getElementById('modal-container');
          if (mc && (!mc.children || mc.children.length === 0)) {
            mc.innerHTML = '';
          }
        }, 300);
      };

      const closeBtn = modalBackdrop.querySelector('#csm-close');
      if (closeBtn) closeBtn.onclick = close;

      const addNewBtn = modalBackdrop.querySelector('#csm-add-new');
      if (addNewBtn) {
        addNewBtn.onclick = () => {
          if (onAddNewCategory) {
            onAddNewCategory((newCat) => {
              close();
              if (onSelect) onSelect(newCat);
            });
          }
        };
      }

      modalBackdrop.querySelectorAll('.category-select-item').forEach(item => {
        item.onclick = () => {
          const catId = item.dataset.id;
          const cat = catId ? sortedCategories.find(c => c.id === catId) : null;
          close();
          if (onSelect) onSelect(cat || { id: '', name: window.I18n.t('form.noCategorySelected') });
        };
      });

      container.appendChild(modalBackdrop);

      requestAnimationFrame(() => {
        modalBackdrop.classList.add('open');
        const content = modalBackdrop.querySelector('.modal-content');
        if (content) content.style.transform = 'translateY(0)';
        if (window.StackdHydrateIcons) window.StackdHydrateIcons();
      });
    }
  },

  ExpandedGraphModal: {
    _chartInstance: null,
    show(state) {
      const container = document.getElementById('modal-container') || document.body;
      
      const existing = document.getElementById('expanded-graph-modal');
      if (existing) existing.remove();

      const modalBackdrop = document.createElement('div');
      modalBackdrop.className = 'modal-backdrop expanded-graph-modal';
      modalBackdrop.id = 'expanded-graph-modal';

      const accounts = window.Store.orderedAccounts((state && state.accounts) ? state.accounts : (window.Store.state ? window.Store.state.accounts : [])); // 1.2.2 (HG-12)
      const categories = (state && state.categories) ? state.categories : (window.Store.state ? window.Store.state.categories : []);

      const savedFilters = (window.Store.state && window.Store.state.expandedGraphFilters)
        ? window.Store.state.expandedGraphFilters
        : { interval: 'monthly', accounts: [], categories: [] };

      let activeInterval = savedFilters.interval || 'monthly';
      // v1.02: the "all accounts" default expands to PRIMARY-currency accounts
      // only (exclude-never-convert, plan §6); an explicit user selection may
      // still mix currencies — their call.
      let selectedAccountIds = (savedFilters.accounts && savedFilters.accounts.length > 0)
        ? [...savedFilters.accounts]
        : window.Store.primaryAccountIds();
      let selectedCategoryIds = (savedFilters.categories && savedFilters.categories.length > 0)
        ? [...savedFilters.categories]
        : [];

      let showFilterPanel = false;

      // 1.0.2 (BUG-36): what the total sums and its currency. Ticking exactly
      // the base accounts IS the default view (caption, saved as []). A shared
      // closure: initExpandedChart cannot see renderModalContent's locals.
      const resolveSel = () => window.Store.aggregateSelection(
        window.Store.isPrimarySelection(selectedAccountIds) ? [] : selectedAccountIds);

      const renderModalContent = () => {
        const visibleAccounts = accounts.filter(a => selectedAccountIds.includes(a.id));
        const computeIds = visibleAccounts.map(a => a.id);
        const result = window.Store.computeGraphBalances({
          interval: activeInterval,
          accountIds: computeIds,
          categoryIds: selectedCategoryIds
        });
        const balances = (result && result.points) ? result.points : [];
        const latestBalance = (balances && balances.length > 0) ? balances[balances.length - 1].balance : 0;
        const aggSel = resolveSel(); // 1.0.2 (BUG-36)
        const formattedTotal = window.Store.formatCurrency(latestBalance, aggSel.currency);

        modalBackdrop.innerHTML = `
          <div class="modal-content" style="height: 92vh; border-top-left-radius: 32px; border-top-right-radius: 32px; padding: 0; display: flex; flex-direction: column; overflow: hidden; background: var(--bg-surface);">
            <!-- Top Bar with X (Left) and Filter (Right) -->
            <div class="modal-top-bar" style="display: flex; justify-content: space-between; align-items: center; padding: var(--space-4) var(--space-5); border-bottom: 1px solid var(--color-border); position: sticky; top: 0; z-index: 20; background: var(--bg-surface);">
              <button class="modal-btn-icon-left" id="egm-close" data-back-dismiss aria-label="${window.I18n.t('graphModal.closeAria')}">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-x" data-hydrated="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
              <h3 style="font-family: var(--font-family-display); font-weight: 800; font-size: 1.1rem; margin: 0; color: var(--text-primary);">${window.I18n.t('graphModal.balanceTrend')}</h3>
              <button class="modal-btn-filter-right ${showFilterPanel ? 'active' : ''}" id="egm-filter" aria-label="${window.I18n.t('graphModal.toggleFiltersAria')}">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-sliders" data-hydrated="true"><line x1="4" x2="4" y1="21" y2="14"/><line x1="4" x2="4" y1="10" y2="3"/><line x1="12" x2="12" y1="21" y2="12"/><line x1="12" x2="12" y1="8" y2="3"/><line x1="20" x2="20" y1="21" y2="16"/><line x1="20" x2="20" y1="12" y2="3"/><line x1="2" x2="6" y1="14" y2="14"/><line x1="10" x2="14" y1="8" y2="8"/><line x1="18" x2="22" y1="16" y2="16"/></svg>
                <span>${window.I18n.t('graphModal.filter')}</span>
              </button>
            </div>

            <div class="modal-body" style="padding: var(--space-5); flex: 1; overflow-y: auto;">
              <!-- Overall Metrics -->
              <div style="margin-bottom: var(--space-4);">
                <span style="font-size: var(--text-xs); font-weight: 700; text-transform: uppercase; color: var(--text-tertiary); letter-spacing: 0.05em;">${window.I18n.t('dash.totalBalance')}</span>
                <div style="font-family: var(--font-family-display); font-size: 2.2rem; font-weight: 850; color: var(--text-primary); margin-top: 2px;">${formattedTotal}</div>
                ${aggSel.excluded > 0 ? `<div class="egm-currency-note" style="font-size: var(--text-xs); color: var(--text-tertiary); margin-top: 2px;">${window.I18n.t('common.otherCurrencyExcluded', { count: aggSel.excluded })}</div>` : ''}
              </div>

              <!-- Collapsible Filter Menu -->
              ${showFilterPanel ? `
                <div class="graph-filter-card animate-fade-in">
                  <!-- 1. Interval Selector -->
                  <div>
                    <div class="filter-section-title">${window.I18n.t('graphModal.interval')}</div>
                    <div class="filter-interval-group">
                      <button class="filter-interval-btn ${activeInterval === 'weekly' ? 'active' : ''}" data-interval="weekly">${window.I18n.t('dash.interval.weekly')}</button>
                      <button class="filter-interval-btn ${activeInterval === 'monthly' ? 'active' : ''}" data-interval="monthly">${window.I18n.t('dash.interval.monthly')}</button>
                      <button class="filter-interval-btn ${activeInterval === 'quarter' ? 'active' : ''}" data-interval="quarter">${window.I18n.t('dash.interval.quarter')}</button>
                    </div>
                  </div>

                  <!-- 2. Accounts Checkboxes -->
                  <div>
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
                      <div class="filter-section-title" style="margin-bottom: 0;">${window.I18n.t('others.accounts')}</div>
                      <button id="egm-toggle-all-accounts" style="background: none; border: none; font-size: 0.75rem; font-weight: 700; color: var(--color-primary, #111); cursor: pointer;">
                        ${window.I18n.t(selectedAccountIds.length === accounts.length ? 'history.deselectAll' : 'history.selectAll')}
                      </button>
                    </div>
                    <div class="filter-checkbox-grid">
                      ${/* 1.2.2 (HG-9): the account's icon in its line colour (was a dot) */ ''}
                      ${accounts.map(acc => `
                        <label class="filter-checkbox-label">
                          <input type="checkbox" class="egm-acc-checkbox" data-acc-id="${acc.id}" ${selectedAccountIds.includes(acc.id) ? 'checked' : ''} />
                          <span class="account-icon account-icon--sm" style="color: ${window.Components.esc(acc.color || '#64748B')};" aria-hidden="true"><i data-lucide="${window.Components.esc(acc.icon || 'wallet')}"></i></span>
                          <span style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${window.Components.esc(acc.name)}</span>
                        </label>
                      `).join('')}
                    </div>
                  </div>

                  <!-- 3. Categories Checkboxes -->
                  <div>
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
                      <div class="filter-section-title" style="margin-bottom: 0;">${window.I18n.t('others.categories')}</div>
                      <button id="egm-toggle-all-categories" style="background: none; border: none; font-size: 0.75rem; font-weight: 700; color: var(--color-primary, #111); cursor: pointer;">
                        ${window.I18n.t(selectedCategoryIds.length === categories.length || selectedCategoryIds.length === 0 ? 'history.selectAll' : 'history.deselectAll')}
                      </button>
                    </div>
                    <div class="filter-checkbox-grid">
                      ${categories.map(cat => `
                        <label class="filter-checkbox-label">
                          <input type="checkbox" class="egm-cat-checkbox" data-cat-id="${cat.id}" ${selectedCategoryIds.length === 0 || selectedCategoryIds.includes(cat.id) ? 'checked' : ''} />
                          <span style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${window.Components.esc(cat.name)}</span>
                        </label>
                      `).join('')}
                    </div>
                  </div>

                  <!-- 4. Save View Button -->
                  <button class="btn-save-filters" id="egm-save-filters">
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path><polyline points="17 21 17 13 7 13 7 21"></polyline><polyline points="7 3 7 8 15 8"></polyline></svg>
                    <span>${window.I18n.t('graphModal.saveView')}</span>
                  </button>
                </div>
              ` : ''}

              <!-- Chart Canvas Area -->
              <div class="expanded-chart-wrapper" style="height: 360px; position: relative;">
                <canvas id="expandedBalanceChart"></canvas>
              </div>
            </div>
          </div>
        `;

        // Event handlers
        const closeBtn = modalBackdrop.querySelector('#egm-close');
        if (closeBtn) closeBtn.onclick = close;

        const filterBtn = modalBackdrop.querySelector('#egm-filter');
        if (filterBtn) {
          filterBtn.onclick = () => {
            showFilterPanel = !showFilterPanel;
            renderModalContent();
          };
        }

        // Interval buttons
        modalBackdrop.querySelectorAll('[data-interval]').forEach(btn => {
          btn.onclick = () => {
            activeInterval = btn.dataset.interval;
            renderModalContent();
          };
        });

        // Account checkboxes
        modalBackdrop.querySelectorAll('.egm-acc-checkbox').forEach(cb => {
          cb.onchange = (e) => {
            const accId = cb.dataset.accId;
            if (e.target.checked) {
              if (!selectedAccountIds.includes(accId)) selectedAccountIds.push(accId);
            } else {
              if (selectedAccountIds.length > 1) {
                selectedAccountIds = selectedAccountIds.filter(id => id !== accId);
              } else {
                e.target.checked = true;
              }
            }
            renderModalContent();
          };
        });

        // Toggle all accounts
        const toggleAccBtn = modalBackdrop.querySelector('#egm-toggle-all-accounts');
        if (toggleAccBtn) {
          toggleAccBtn.onclick = () => {
            if (selectedAccountIds.length === accounts.length) {
              selectedAccountIds = accounts.length > 0 ? [accounts[0].id] : [];
            } else {
              selectedAccountIds = accounts.map(a => a.id);
            }
            renderModalContent();
          };
        }

        // Category checkboxes
        modalBackdrop.querySelectorAll('.egm-cat-checkbox').forEach(cb => {
          cb.onchange = (e) => {
            const catId = cb.dataset.catId;
            if (selectedCategoryIds.length === 0) {
              selectedCategoryIds = categories.map(c => c.id);
            }
            if (e.target.checked) {
              if (!selectedCategoryIds.includes(catId)) selectedCategoryIds.push(catId);
            } else {
              selectedCategoryIds = selectedCategoryIds.filter(id => id !== catId);
            }
            if (selectedCategoryIds.length === categories.length) {
              selectedCategoryIds = [];
            }
            renderModalContent();
          };
        });

        // Toggle all categories
        const toggleCatBtn = modalBackdrop.querySelector('#egm-toggle-all-categories');
        if (toggleCatBtn) {
          toggleCatBtn.onclick = () => {
            if (selectedCategoryIds.length === 0 || selectedCategoryIds.length === categories.length) {
              selectedCategoryIds = categories.length > 0 ? [categories[0].id] : [];
            } else {
              selectedCategoryIds = [];
            }
            renderModalContent();
          };
        }

        // Save Filters button
        const saveFiltersBtn = modalBackdrop.querySelector('#egm-save-filters');
        if (saveFiltersBtn) {
          saveFiltersBtn.onclick = () => {
            window.Store.dispatch('SAVE_EXPANDED_GRAPH_FILTERS', {
              interval: activeInterval,
              // 1.0.2 (BUG-36, D-U8-7): exactly the base accounts = the default
              // view, saved as [] (an account added later joins the total)
              accounts: window.Store.isPrimarySelection(selectedAccountIds) ? [] : selectedAccountIds,
              categories: selectedCategoryIds
            });
            showFilterPanel = false;
            renderModalContent();
          };
        }

        if (window.StackdHydrateIcons) window.StackdHydrateIcons();

        initExpandedChart();
      };

      const close = () => {
        if (window.Components.ExpandedGraphModal._chartInstance) {
          try { window.Components.ExpandedGraphModal._chartInstance.destroy(); } catch {}
          window.Components.ExpandedGraphModal._chartInstance = null;
        }
        modalBackdrop.classList.remove('open');
        const content = modalBackdrop.querySelector('.modal-content');
        if (content) content.style.transform = 'translateY(100%)';
        setTimeout(() => modalBackdrop.remove(), 300);
      };

      const initExpandedChart = () => {
        const canvas = modalBackdrop.querySelector('#expandedBalanceChart');
        if (!canvas || !window.Chart) return;

        if (window.Components.ExpandedGraphModal._chartInstance) {
          try { window.Components.ExpandedGraphModal._chartInstance.destroy(); } catch {}
          window.Components.ExpandedGraphModal._chartInstance = null;
        }

        const visibleIds = accounts.filter(a => selectedAccountIds.includes(a.id)).map(a => a.id);
        // 1.0.2 (BUG-36, D-U8-9): only the accounts the total sums get a line;
        // every figure carries its own currency.
        const aggSel = resolveSel();
        const inAgg = window.Store.aggregatePredicate(selectedAccountIds);
        const visibleAccounts = accounts.filter(a => visibleIds.includes(a.id) && inAgg(a.id));

        const graphResult = window.Store.computeGraphBalances({
          interval: activeInterval,
          accountIds: visibleIds,
          categoryIds: selectedCategoryIds
        });
        const mainResult = graphResult;
        const monthLabels = (graphResult && graphResult.monthLabels) ? graphResult.monthLabels : [];
        const isQuarter = activeInterval === 'quarter';

        const isDark = (window.Store && window.Store.state && window.Store.state.activeTheme === 'dark');
        const tooltipBg = isDark ? '#161e2e' : '#ffffff';
        const tooltipTitle = isDark ? '#94a3b8' : '#64748b';
        const tooltipBody = isDark ? '#f8fafc' : '#1a1e21';
        const tooltipBorder = isDark ? 'rgba(51, 65, 85, 0.8)' : '#e2e8f0';
        const gridColor = isDark ? 'rgba(51, 65, 85, 0.5)' : 'rgba(0, 0, 0, 0.05)';
        const legendColor = isDark ? '#f8fafc' : '#1a1e21';
        const tickColor = isDark ? '#94a3b8' : '#64748b';

        // 1.2.0 (UX-1): the Home curve's look — trend colour (end of the
        // series vs its first point) and a fading gradient fill; the
        // per-account lines, legend and y axis stay the sheet's own.
        const mainPoints = (mainResult && mainResult.points) ? mainResult.points : [];
        const pal = window.Components.NetFlowChart._themeColors();
        const trendUp = mainPoints.length === 0 ||
          mainPoints[mainPoints.length - 1].balance >= mainPoints[0].balance;
        const trendColor = trendUp ? pal.trendUp : pal.trendDown;
        const trendRgb = trendUp ? pal.trendUpRgb : pal.trendDownRgb;
        const datasets = [{
          label: window.I18n.t('analytics.totalNetBalance'),
          data: mainPoints,
          currency: aggSel.currency, // 1.0.2 (BUG-36)
          borderColor: trendColor,
          backgroundColor: (c) => {
            const chart = c && c.chart;
            const area = chart && chart.chartArea;
            const g2d = chart && chart.ctx;
            if (!area || !g2d || typeof g2d.createLinearGradient !== 'function') return 'rgba(' + trendRgb + ',0.12)';
            const memo = chart.$stackdFill;
            if (memo && memo.top === area.top && memo.bottom === area.bottom && memo.rgb === trendRgb) return memo.g;
            const g = g2d.createLinearGradient(0, area.top, 0, area.bottom);
            g.addColorStop(0, 'rgba(' + trendRgb + ',0.28)');
            g.addColorStop(1, 'rgba(' + trendRgb + ',0)');
            chart.$stackdFill = { top: area.top, bottom: area.bottom, rgb: trendRgb, g };
            return g;
          },
          borderWidth: 2.5,
          fill: 'start',
          cubicInterpolationMode: 'monotone',
          pointRadius: activeInterval === 'weekly' ? 3 : 4,
          pointHoverRadius: 7,
          pointBackgroundColor: isDark ? '#161e2e' : '#ffffff',
          pointBorderWidth: 3,
          pointBorderColor: trendColor
        }];

        visibleAccounts.forEach(acc => {
          const accResult = window.Store.computeGraphBalances({
            interval: activeInterval,
            accountIds: [acc.id],
            categoryIds: selectedCategoryIds
          });

          datasets.push({
            label: acc.name,
            data: (accResult && accResult.points) ? accResult.points : [],
            currency: acc.currency, // 1.0.2 (BUG-36)
            borderColor: acc.color,
            borderWidth: 2,
            borderDash: [4, 4],
            fill: false,
            tension: 0,
            pointRadius: activeInterval === 'weekly' ? 1.5 : 2
          });
        });

        window.Components.ExpandedGraphModal._chartInstance = new window.Chart(canvas, {
          type: 'line',
          data: {
            datasets: datasets
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: { duration: 250 },
            interaction: { mode: 'index', intersect: false },
            plugins: {
              legend: { display: true, position: 'bottom', labels: { color: legendColor, boxWidth: 12, font: { family: 'Manrope', size: 11, weight: 'bold' } } },
              tooltip: {
                backgroundColor: tooltipBg,
                titleColor: tooltipTitle,
                titleFont: { family: 'Manrope', size: 11, weight: 'bold' },
                bodyColor: tooltipBody,
                bodyFont: { family: 'Manrope', size: 14, weight: '800' },
                displayColors: true,
                usePointStyle: true,
                boxWidth: 8,
                boxHeight: 8,
                pointStyle: 'circle',
                borderColor: tooltipBorder,
                borderWidth: 1,
                padding: 10,
                callbacks: {
                  title: (items) => {
                    if (!items || !items.length) return '';
                    const item = items[0];
                    return item.raw?.fullLabel || item.raw?.label || '';
                  },
                  // 1.0.2 (BUG-36): each line in its own currency
                  label: (ctx) => ` ${ctx.dataset.label}: ${window.Store.formatCurrency(ctx.parsed.y, ctx.dataset.currency)}`
                }
              }
            },
            scales: {
              x: {
                type: 'linear',
                min: 0,
                max: isQuarter ? 3 : (activeInterval === 'weekly' ? 51 : 11),
                grid: { display: false },
                ticks: {
                  stepSize: isQuarter ? 1 : (activeInterval === 'weekly' ? 4 : 1),
                  autoSkip: true,
                  autoSkipPadding: 6,
                  maxRotation: 45,
                  minRotation: 0,
                  font: (context) => {
                    const width = context.chart ? context.chart.width : 360;
                    return {
                      size: width < 360 ? 9 : 10,
                      family: 'Manrope',
                      weight: '600'
                    };
                  },
                  color: tickColor,
                  callback: (val) => {
                    const idx = Math.round(val);
                    if (Math.abs(val - idx) < 0.001 && idx >= 0 && idx < monthLabels.length) {
                      return monthLabels[idx];
                    }
                    return '';
                  }
                }
              },
              y: {
                display: true,
                beginAtZero: false,
                grid: { display: true, color: gridColor },
                ticks: {
                  font: { size: 10, family: 'Inter' },
                  color: tickColor,
                  callback: (val) => window.Store.formatCurrency(val, aggSel.currency) // 1.0.2 (BUG-36)
                }
              }
            }
          }
        });
      };

      renderModalContent();

      container.appendChild(modalBackdrop);

      requestAnimationFrame(() => {
        modalBackdrop.classList.add('open');
        const content = modalBackdrop.querySelector('.modal-content');
        if (content) content.style.transform = 'translateY(0)';
        if (window.StackdHydrateIcons) window.StackdHydrateIcons();
        setTimeout(() => {
          if (window.Components.ExpandedGraphModal._chartInstance && typeof window.Components.ExpandedGraphModal._chartInstance.resize === 'function') {
            window.Components.ExpandedGraphModal._chartInstance.resize();
          } else {
            initExpandedChart();
          }
        }, 60);
      });
    }
  },

  // v0.72 Add-widget sheet (docs/home-widgets-plan.md §6.3).
  // Two steps: gallery → config (config only for registry entries with
  // hasConfig). show({editId}) jumps straight to the config step for an
  // existing widget, which is what the gear button in edit mode uses.
  // The detail/preview step with the size carousel lands in Phase 3.
  AddWidgetModal: {
    show(options = {}) {
      const container = document.getElementById('modal-container');
      if (!container || !window.Widgets) return;

      const existing = document.getElementById('add-widget-modal');
      if (existing) existing.remove();

      const W = window.Widgets;
      const esc = W._esc.bind(W);
      const editId = options.editId || null;

      let step = 'gallery';
      let selectedType = null;
      let selectedSize = 'small';
      let draft = {};

      if (editId) {
        const inst = (window.Store.getState().homeWidgets || []).find(w => w.id === editId);
        if (!inst) return;
        selectedType = inst.type;
        selectedSize = inst.size;
        draft = W._cfg(inst);
        step = 'config';
      }

      const backdrop = document.createElement('div');
      backdrop.className = 'modal-backdrop';
      backdrop.id = 'add-widget-modal';
      backdrop.style.zIndex = '10000';
      backdrop.style.display = 'flex';
      backdrop.style.flexDirection = 'column';
      backdrop.setAttribute('role', 'dialog');
      backdrop.setAttribute('aria-modal', 'true');
      backdrop.setAttribute('aria-labelledby', 'awm-title');

      const close = () => {
        W.destroyPreview();
        backdrop.classList.remove('open');
        const content = backdrop.querySelector('.modal-content');
        if (content) content.style.transform = 'translateY(100%)';
        setTimeout(() => {
          backdrop.remove();
          const mc = document.getElementById('modal-container');
          if (mc && (!mc.children || mc.children.length === 0)) mc.innerHTML = '';
        }, 300);
      };

      const renderGallery = () => `
        <div class="widget-gallery-grid">
          ${W.listTypes().map(t => `
            <button type="button" class="widget-gallery-card touch-target" data-widget-type="${esc(t.type)}">
              <div class="widget-gallery-icon"><i data-lucide="${esc(t.icon)}"></i></div>
              <span class="widget-gallery-title">${esc(t.title)}</span>
              <span class="widget-gallery-desc">${esc(t.description)}</span>
            </button>
          `).join('')}
        </div>`;

      const renderConfigStep = () => {
        const def = W.registry[selectedType];
        const state = window.Store.getState();
        return `
          <p class="widget-config-intro">${esc(def.description)}</p>
          <div id="awm-config">${def.renderConfig ? def.renderConfig(draft, state) : ''}</div>`;
      };

      // Detail step: name, what it does, and a live preview you can flip
      // between the two sizes before committing.
      // 1.2.0 (UX-6): a real scroll-snap rail — every size is pre-rendered on
      // its own slide, so a swipe slides the next card in (the native scroll
      // does the motion) and the dots follow the slide that settles.
      const sizesOf = () => (selectedType && W.registry[selectedType] && W.registry[selectedType].sizes) || ['small'];
      const renderDetailStep = () => {
        const def = W.registry[selectedType];
        const sizes = def.sizes || ['small'];
        const state = window.Store.getState();
        return `
          <h3 class="widget-detail-title">${esc(def.title)}</h3>
          <p class="widget-detail-desc">${esc(def.description)}</p>
          <div class="awm-size-rail" id="awm-preview" data-horizontal-scroll data-first="${esc(sizes[0])}" data-last="${esc(sizes[sizes.length - 1])}">
            ${sizes.map(s => `
              <div class="awm-size-slide ${s === selectedSize ? 'is-active' : ''}" data-size="${esc(s)}">${W.renderPreview(selectedType, s, draft, state)}</div>
            `).join('')}
          </div>
          ${sizes.length > 1 ? `
            <div class="widget-size-dots" role="group" aria-label="${window.I18n.t('widget.sizeAria')}">
              ${sizes.map(s => `
                <button type="button" class="widget-size-dot ${s === selectedSize ? 'is-active' : ''}"
                        data-size="${esc(s)}" aria-pressed="${s === selectedSize}"
                        aria-label="${window.I18n.t(s === 'large' ? 'widget.sizeWideAria' : 'widget.sizeSmallAria')}"></button>
              `).join('')}
            </div>
            <p class="widget-size-caption">${window.I18n.t(selectedSize === 'large' ? 'widget.sizeWide' : 'widget.sizeSmall')}</p>
          ` : ''}`;
      };

      // v0.93: size flips never rebuild the modal (refactor-plan-2 §1.6).
      // 1.2.0 (UX-6): nor the preview — every size is already on the rail, so
      // a flip only moves the dots, the caption and the active slide.
      const syncSizeUi = (size) => {
        backdrop.querySelectorAll('.widget-size-dot').forEach(d => {
          const active = d.dataset.size === size;
          d.classList.toggle('is-active', active);
          d.setAttribute('aria-pressed', String(active));
        });
        backdrop.querySelectorAll('.awm-size-slide').forEach(sl => {
          sl.classList.toggle('is-active', sl.dataset.size === size);
        });
        const caption = backdrop.querySelector('.widget-size-caption');
        if (caption) caption.textContent = window.I18n.t(size === 'large' ? 'widget.sizeWide' : 'widget.sizeSmall');
      };

      const reducedMotion = () => {
        try { return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches); } catch (e) { return false; }
      };

      // 1.2.2 (HG-2): the rail's geometry. Slides have their own widths and
      // snap by their centre, so a slide's resting scroll position is its
      // centre on the rail's centre (never idx × width).
      const railSlides = (rail) => Array.from(rail.querySelectorAll('.awm-size-slide'));
      const slideLeft = (rail, slide) => Math.max(0, slide.offsetLeft - (rail.clientWidth - slide.offsetWidth) / 2);
      const nearestSlide = (rail) => {
        let best = 0;
        let bestD = Infinity;
        railSlides(rail).forEach((s, i) => {
          const d = Math.abs(slideLeft(rail, s) - rail.scrollLeft);
          if (d < bestD) { bestD = d; best = i; }
        });
        return best;
      };
      // The card in focus is whole; the other one shrinks (toward the focused
      // side, so its peeking edge stays put) and fades, in step with the
      // finger. Reduce Motion keeps the fade and drops the scale.
      const paintRail = (rail) => {
        const slides = railSlides(rail);
        if (slides.length < 2) return;
        const still = reducedMotion();
        const mid = rail.scrollLeft + rail.clientWidth / 2;
        const travel = Math.abs(slideLeft(rail, slides[1]) - slideLeft(rail, slides[0])) || 1;
        slides.forEach(s => {
          const inner = s.firstElementChild;
          if (!inner) return;
          const c = s.offsetLeft + s.offsetWidth / 2;
          const t = Math.min(1, Math.abs(c - mid) / travel);
          inner.style.transformOrigin = c > mid ? 'left center' : 'right center';
          inner.style.transform = still || t === 0 ? '' : `scale(${(1 - 0.08 * t).toFixed(4)})`;
          inner.style.opacity = t === 0 ? '' : (1 - 0.55 * t).toFixed(3);
        });
      };
      const showSlide = (rail, idx, smooth) => {
        const slide = railSlides(rail)[idx];
        if (!slide) return;
        const left = slideLeft(rail, slide);
        if (smooth && typeof rail.scrollTo === 'function') {
          rail.scrollTo({ left, behavior: reducedMotion() ? 'auto' : 'smooth' });
        } else {
          rail.scrollLeft = left;
          paintRail(rail);
        }
      };

      const renderAll = () => {
        // Any previous preview chart belongs to markup we are about to discard.
        W.destroyPreview();

        const def = selectedType ? W.registry[selectedType] : null;
        const isConfig = step === 'config';
        const isDetail = step === 'detail';
        const title = (isConfig && editId) ? (def ? def.title : window.I18n.t('widget.configure')) : window.I18n.t('widget.addWidget');
        // Only the edit-mode entry point has no earlier step to go back to.
        const canGoBack = (isDetail || isConfig) && !editId;
        const leftGlyph = canGoBack ? '‹' : '✕';
        // Detail advances to config when there is something to configure.
        const confirmLabel = editId
          ? window.I18n.t('account.saveChanges')
          : (isDetail && def && def.hasConfig ? window.I18n.t('widget.next') : window.I18n.t('widget.addWidget'));

        backdrop.innerHTML = `
          <div class="modal-content" style="padding: 0; display: flex; flex-direction: column; width: 100%; height: 100%; max-width: 100%; max-height: 100vh; border-radius: 0; transform: translateY(0); transition: transform 0.3s cubic-bezier(0.16, 1, 0.3, 1);">
            <div class="modal-top-bar modal-top-bar--safe">
              <button class="modal-btn-top modal-btn-close" id="awm-left" aria-label="${window.I18n.t(canGoBack ? 'widget.back' : 'common.close')}" style="display: flex; align-items: center; justify-content: center; width: 36px; height: 36px; border-radius: 12px; background: var(--bg-surface-sunken); border: none; cursor: pointer; color: var(--text-primary); font-size: 1.3rem; font-weight: bold; padding: 0;">${leftGlyph}</button>
              <h2 id="awm-title" class="header-title" style="margin: 0; font-size: 1.1rem; font-family: var(--font-family-display); font-weight: 700;">${esc(title)}</h2>
              <div style="width: 36px;"></div>
            </div>

            <div class="modal-body" style="padding: var(--space-4) var(--space-4) 40px; flex: 1; overflow-y: auto;">
              ${isConfig ? renderConfigStep() : (isDetail ? renderDetailStep() : renderGallery())}
            </div>

            ${(isConfig || isDetail) ? `
              <div class="modal-footer-bar" style="padding: var(--space-4); padding-bottom: calc(var(--space-4) + var(--safe-bottom, 0px)); border-top: 1px solid var(--color-border); background: var(--bg-surface);">
                <button type="button" class="btn btn-primary" id="awm-confirm">${esc(confirmLabel)}</button>
              </div>` : ''}
          </div>`;

        attachAll();
        if (window.StackdHydrateIcons) window.StackdHydrateIcons();
        // Mount the preview charts after the markup is in the document.
        // 1.2.0 (UX-6): one per slide (each an animation-free rAF mount), and
        // the rail opens on the selected size (e.g. back from the config step).
        if (isDetail) {
          const rail = backdrop.querySelector('.awm-size-rail');
          const idx = Math.max(0, sizesOf().indexOf(selectedSize));
          if (rail) showSlide(rail, idx, false); // 1.2.2 (HG-2): also paints the peek
          const state = window.Store.getState();
          sizesOf().forEach(sz => W.attachPreview(backdrop, selectedType, sz, draft, state));
        }
      };

      const ctx = {
        getConfig: () => draft,
        setConfig: (patch) => { draft = { ...draft, ...patch }; },
        rerender: () => renderAll()
      };

      const attachAll = () => {
        const leftBtn = backdrop.querySelector('#awm-left');
        if (leftBtn) {
          leftBtn.onclick = () => {
            if (editId) { close(); return; }
            if (step === 'config') {
              step = 'detail';       // back to the preview
              renderAll();
            } else if (step === 'detail') {
              step = 'gallery';
              selectedType = null;
              renderAll();
            } else {
              close();
            }
          };
        }

        // Gallery → detail. Every type gets a preview first now; config (when
        // the type has any) comes after, from the detail step's Next button.
        backdrop.querySelectorAll('.widget-gallery-card').forEach(card => {
          card.onclick = () => {
            const type = card.dataset.widgetType;
            const def = W.registry[type];
            if (!def) return;
            selectedType = type;
            selectedSize = (def.sizes && def.sizes[0]) || 'small';
            draft = { ...(def.defaultConfig || {}) };
            step = 'detail';
            renderAll();
          };
        });

        // 1.2.0 (UX-6): a dot scrolls the rail to its slide; the rail's own
        // scroll (a swipe, or the dot's) settles the selected size. Handlers
        // die with each renderAll() rebuild, so no cleanup is needed.
        const rail = backdrop.querySelector('.awm-size-rail');
        const goToSize = (size) => {
          const sizes = sizesOf();
          const idx = sizes.indexOf(size);
          if (idx < 0) return;
          selectedSize = sizes[idx];
          syncSizeUi(selectedSize);
          if (rail) showSlide(rail, idx, true);
        };
        backdrop.querySelectorAll('.widget-size-dot').forEach(dot => {
          dot.onclick = () => goToSize(dot.dataset.size);
        });
        // 1.2.2 (HG-2): a tap on the peeking card brings it in
        backdrop.querySelectorAll('.awm-size-slide').forEach(slide => {
          slide.onclick = () => {
            if (slide.dataset.size !== selectedSize) goToSize(slide.dataset.size);
          };
        });

        if (rail && selectedType && sizesOf().length > 1) {
          let settle = null;
          rail.addEventListener('scroll', () => {
            paintRail(rail); // 1.2.2 (HG-2): the peek follows the finger
            clearTimeout(settle);
            settle = setTimeout(() => {
              if (!rail.isConnected) return;
              const sizes = sizesOf();
              const idx = Math.max(0, Math.min(sizes.length - 1, nearestSlide(rail)));
              selectedSize = sizes[idx];
              syncSizeUi(selectedSize);
            }, 80);
          }, { passive: true });
        }

        const configRoot = backdrop.querySelector('#awm-config');
        if (configRoot && selectedType) {
          const def = W.registry[selectedType];
          if (def && def.attachConfig) def.attachConfig(configRoot, ctx);
        }

        const confirmBtn = backdrop.querySelector('#awm-confirm');
        if (confirmBtn) {
          confirmBtn.onclick = () => {
            const def = W.registry[selectedType];
            if (!def) return;

            // Detail step on a configurable widget just advances a step.
            if (step === 'detail' && def.hasConfig && !editId) {
              step = 'config';
              renderAll();
              return;
            }

            const config = { ...draft };
            close();
            if (editId) {
              window.Store.dispatch('UPDATE_HOME_WIDGET', { id: editId, config });
            } else {
              window.Store.dispatch('ADD_HOME_WIDGET', { type: selectedType, size: selectedSize, config });
            }
          };
        }
      };

      container.appendChild(backdrop);
      renderAll();

      requestAnimationFrame(() => {
        backdrop.classList.add('open');
        const content = backdrop.querySelector('.modal-content');
        if (content) content.style.transform = 'translateY(0)';
        if (window.StackdHydrateIcons) window.StackdHydrateIcons();
      });
    }
  }
};



// ── Bank Connect sheets (v1.05, docs/bank-connect-ux-plan.md §3.3/§3.5/§3.9) ─
// Custom sheets in the ImportRulesModal shape: own backdrop id (they must not
// be torn down by a Modal.hide() from elsewhere), own close, own icon
// hydration on their root (modals render outside #router-view).
Object.assign(window.Components, {
  _bankSheet(id, innerHtml) {
    const existing = document.getElementById(id);
    if (existing) existing.remove();
    const container = document.getElementById('modal-container');
    if (!container) return null;
    const div = document.createElement('div');
    div.innerHTML = `
      <div class="modal-backdrop" id="${id}" role="dialog" aria-modal="true" aria-labelledby="${id}-title">
        <div class="modal-content">
          <div class="modal-handle"></div>
          ${innerHtml}
        </div>
      </div>`;
    container.appendChild(div.firstElementChild);
    const backdrop = document.getElementById(id);
    backdrop._close = () => { backdrop.classList.remove('open'); setTimeout(() => backdrop.remove(), 300); };
    if (window.StackdHydrateIcons) window.StackdHydrateIcons(backdrop);
    requestAnimationFrame(() => backdrop.classList.add('open'));
    return backdrop;
  },

  // First toggle-on (and again after a terms revision): consent before any
  // network call. Decline reverts the toggle.
  BankDisclosureModal: {
    show(options) {
      const opts = options || {};
      const t = (k, p) => window.I18n.t(k, p);
      const point = (icon, key) => `
        <div style="display: flex; align-items: flex-start; gap: var(--space-3); margin-bottom: var(--space-3);">
          <div class="list-item-icon" style="margin: 0; flex-shrink: 0;" aria-hidden="true"><i data-lucide="${icon}"></i></div>
          <div style="font-size: var(--text-sm); color: var(--text-secondary); line-height: 1.55; padding-top: 6px;">${t(key)}</div>
        </div>`;
      const backdrop = window.Components._bankSheet('bank-disclosure-modal', `
        <h2 id="bank-disclosure-modal-title" class="header-title" style="margin: 0 0 var(--space-4); font-size: 1.1rem;">${t('bank.disclosureTitle')}</h2>
        ${point('lock', 'bank.disclosure1')}
        ${point('shield-check', 'bank.disclosure2')}
        ${point('refresh-cw', 'bank.disclosure3')}
        ${point('badge-check', 'bank.disclosure4')}
        <button type="button" id="bank-disclosure-terms" style="background: none; border: none; padding: 0; margin: var(--space-1) 0 var(--space-4); color: var(--color-accent); font-weight: 600; font-size: var(--text-sm); cursor: pointer;">${t('others.terms')}</button>
        <div style="display: flex; flex-direction: column; gap: var(--space-3);">
          <button type="button" class="btn btn-primary" id="bank-disclosure-accept">${t('bank.continue')}</button>
          <button type="button" class="btn btn-secondary" id="bank-disclosure-decline">${t('bank.notNow')}</button>
        </div>`);
      if (!backdrop) return;
      let decided = false;
      const decline = () => { if (decided) return; decided = true; backdrop._close(); if (opts.onDecline) opts.onDecline(); };
      backdrop.addEventListener('click', (e) => { if (e.target === backdrop) decline(); });
      backdrop.querySelector('#bank-disclosure-decline').addEventListener('click', decline);
      backdrop.querySelector('#bank-disclosure-accept').addEventListener('click', () => {
        if (decided) return;
        decided = true;
        backdrop._close();
        if (opts.onAccept) opts.onAccept();
      });
      // TermsModal owns #modal-container's innerHTML, so reading the terms
      // means leaving this sheet: treat it as "not now" and let the user
      // flip the toggle again afterwards.
      backdrop.querySelector('#bank-disclosure-terms').addEventListener('click', () => {
        decline();
        setTimeout(() => window.Components.TermsModal.show(), 320);
      });
    }
  },

  // Defaults for NEW connections + subscription facts (UX plan §3.9).
  BankSettingsModal: {
    show() {
      const BC = window.BankConnect;
      const t = (k, p) => window.I18n.t(k, p);
      const state = window.Store.getState();
      const p = BC.prefs(state);
      const ent = BC.entitlement(state);
      const daysLabel = (d) => d === 0 ? t('bank.maximum') : t('bank.daysOption', { count: d });
      const opts = (values, current) => values.map(v => `<option value="${v}" ${v === current ? 'selected' : ''}>${daysLabel(v)}</option>`).join('');
      const subLine = ent.active
        ? t('bank.subActive', { date: BC.formatDate(ent.expiresAt) })
        : t('bank.subNone');
      const supportId = BC.supportId(state);
      // v1.11 B7 (UX plan §3.12): native gets "Pair a browser" + the paired
      // list (entitled only); the web build gets "Log out of this browser"
      // and no store buttons (there is no web payment path).
      const web = BC.isWebSession();
      const canPair = !web && ent.active;
      const readRow = (label, valueHtml, id) => `
        <div style="display: flex; align-items: center; justify-content: space-between; gap: var(--space-3); padding: var(--space-3) 0; border-top: 1px solid var(--border-color);">
          <div style="font-size: var(--text-sm); color: var(--text-secondary);">${label}</div>
          <div id="${id}" style="font-size: var(--text-sm); font-weight: 600; text-align: right;">${valueHtml}</div>
        </div>`;
      const field = (id, labelKey, helpKey, control) => `
        <div class="form-group">
          <label class="form-label" for="${id}">${t(labelKey)}</label>
          ${control}
          <div style="font-size: var(--text-xs); color: var(--text-tertiary); margin-top: 6px; line-height: 1.5;">${t(helpKey)}</div>
        </div>`;

      const backdrop = window.Components._bankSheet('bank-settings-modal', `
        <h2 id="bank-settings-modal-title" class="header-title" style="margin: 0 0 var(--space-4); font-size: 1.1rem;">${t('bank.settingsTitle')}</h2>
        <div style="max-height: 60vh; overflow-y: auto;">
          ${field('bank-set-history', 'bank.historyDepth', 'bank.historyDepthHelp', `<select id="bank-set-history" class="form-control" style="appearance: none;">${opts(BC.HISTORY_OPTIONS, p.historyDays)}</select>`)}
          ${field('bank-set-validity', 'bank.validity', 'bank.validityHelp', `<select id="bank-set-validity" class="form-control" style="appearance: none;">${opts(BC.VALIDITY_OPTIONS, p.validityDays)}</select>`)}
          ${field('bank-set-from', 'bank.importFrom', 'bank.importFromHelp', `<input id="bank-set-from" class="form-control" type="date" value="${BC.esc(p.importFrom || '')}">`)}
          ${readRow(t('bank.subscription'), BC.esc(subLine), 'bank-set-sub')}
          ${readRow(t('bank.supportId'), supportId ? `<span style="font-family: monospace;">${BC.esc(supportId)}</span> <button type="button" id="bank-set-copy" class="touch-target" aria-label="${t('bank.copied')}" style="background: none; border: none; cursor: pointer; color: var(--color-accent); vertical-align: middle; padding: 4px;"><i data-lucide="copy" style="width: 16px; height: 16px;"></i></button>` : '—', 'bank-set-support')}
          ${web ? '' : `<button type="button" class="btn btn-secondary" id="bank-set-restore" style="width: 100%; margin-top: var(--space-3);">${t('bank.restore')}</button>`}
          ${canPair ? `
          <button type="button" class="btn btn-secondary" id="bank-set-pair" style="width: 100%; margin-top: var(--space-3);">${t('bank.pairBrowser')}</button>
          <div style="margin-top: var(--space-4); border-top: 1px solid var(--border-color); padding-top: var(--space-3);">
            <div style="font-size: var(--text-sm); color: var(--text-secondary); margin-bottom: var(--space-2);">${t('bank.pairedBrowsers')}</div>
            <div id="bank-set-devices" style="font-size: var(--text-sm);">${t('bank.pairChecking')}</div>
          </div>` : ''}
          ${web ? `<button type="button" class="btn btn-danger" id="bank-set-logout" style="width: 100%; margin-top: var(--space-4);">${t('bank.logoutBrowser')}</button>` : ''}
        </div>
        <div style="margin-top: var(--space-5); display: flex; flex-direction: column; gap: var(--space-3);">
          <button type="button" class="btn btn-primary" id="bank-set-save">${t('common.save')}</button>
          <button type="button" class="btn btn-secondary" id="bank-set-cancel">${t('common.cancel')}</button>
        </div>`);
      if (!backdrop) return;
      const close = backdrop._close;
      backdrop.addEventListener('click', (e) => { if (e.target === backdrop) close(); });
      backdrop.querySelector('#bank-set-cancel').addEventListener('click', close);
      backdrop.querySelector('#bank-set-save').addEventListener('click', () => {
        window.Store.dispatch('SET_BANK_CONNECT_PREFS', {
          historyDays: Number(backdrop.querySelector('#bank-set-history').value),
          validityDays: Number(backdrop.querySelector('#bank-set-validity').value),
          importFrom: backdrop.querySelector('#bank-set-from').value || null
        });
        close();
      });
      const copy = backdrop.querySelector('#bank-set-copy');
      if (copy) {
        copy.addEventListener('click', () => {
          const text = BC.supportId(window.Store.getState());
          if (navigator.clipboard && text) navigator.clipboard.writeText(text).catch(() => {});
          copy.innerHTML = `<span style="font-size: var(--text-xs);">${t('bank.copied')}</span>`;
        });
      }
      const restore = backdrop.querySelector('#bank-set-restore');
      if (restore) restore.addEventListener('click', async () => {
        if (!BC.storeAvailable()) { alert(t('bank.storeUnavailable')); return; }
        let ent2 = null;
        try { ent2 = await BC.restorePurchase(); } catch (e) { alert(t(e && e.pending ? 'bank.purchasePending' : 'bank.purchaseFailed')); return; }
        if (!ent2 || !ent2.active) { alert(t('bank.restoreNone')); return; }
        const e2 = BC.entitlement(window.Store.getState());
        const el = backdrop.querySelector('#bank-set-sub');
        if (el) el.textContent = e2.active ? t('bank.subActive', { date: BC.formatDate(e2.expiresAt) }) : t('bank.subNone');
      });

      // v1.11 B7: Pair a browser → the code sheet; the paired list (D-C20).
      const pairBtn = backdrop.querySelector('#bank-set-pair');
      if (pairBtn) {
        pairBtn.addEventListener('click', async () => {
          pairBtn.disabled = true;
          try {
            const res = await BC.pairCode();
            close();
            setTimeout(() => window.Components.BankPairCodeModal.show({ code: res.code, expiresAt: res.expiresAt }), 320);
          } catch (e) {
            alert(t((e && e.code) === 'subscription_required' ? 'bank.chipSubscription' : 'bank.pairFailed'));
            pairBtn.disabled = false;
          }
        });
        const list = backdrop.querySelector('#bank-set-devices');
        const renderDevices = (devices) => {
          if (!list) return;
          if (!devices.length) { list.innerHTML = `<div style="color: var(--text-tertiary);">${t('bank.pairedNone')}</div>`; return; }
          list.innerHTML = devices.map(d => `
            <div class="bank-device-row" style="display: flex; align-items: center; justify-content: space-between; gap: var(--space-3); padding: var(--space-2) 0;">
              <div style="min-width: 0;">
                <div style="font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${BC.esc(d.label || t('bank.pairedBrowser'))}</div>
                <div style="font-size: var(--text-xs); color: var(--text-tertiary);">${BC.esc(t('bank.pairedSince', { date: BC.formatDate(d.createdAt) }))}</div>
              </div>
              <button type="button" class="btn btn-secondary bank-device-remove" data-id="${BC.esc(d.id)}" style="padding: 6px 12px; font-size: var(--text-xs); flex-shrink: 0;">${t('bank.pairedRemove')}</button>
            </div>`).join('');
          list.querySelectorAll('.bank-device-remove').forEach(btn => {
            btn.addEventListener('click', async () => {
              btn.disabled = true;
              try {
                await BC.revokeDevice(btn.dataset.id);
                renderDevices(devices.filter(d => d.id !== btn.dataset.id));
              } catch (e) {
                btn.disabled = false;
                alert(t('bank.fetchError'));
              }
            });
          });
        };
        BC.listDevices().then(renderDevices).catch(() => { if (list) list.innerHTML = `<div style="color: var(--text-tertiary);">${t('bank.pairedNone')}</div>`; });
      }

      // v1.11 B7: web — log this browser out (the phone is untouched).
      const logout = backdrop.querySelector('#bank-set-logout');
      if (logout) {
        logout.addEventListener('click', () => {
          close();
          setTimeout(() => window.Components.Modal.show({
            title: t('bank.logoutBrowser'),
            content: `<p style="color: var(--text-secondary); font-size: var(--text-sm); line-height: 1.6;">${t('bank.logoutBody')}</p>`,
            saveText: t('bank.logoutConfirm'),
            onSave: async (closeModal) => {
              closeModal();
              try { await BC.logoutWeb(); } catch (e) { alert(t('bank.fetchError')); }
              window.Store.emit();
            }
          }), 320);
        });
      }
    }
  },

  // v1.11 B7 (UX plan §3.12): the pairing code, shown large on the phone
  // with its 5-minute countdown. A new code can be minted from here once
  // this one runs out.
  BankPairCodeModal: {
    show(options) {
      const opts = options || {};
      const BC = window.BankConnect;
      const t = (k, p) => window.I18n.t(k, p);
      const grouped = (code) => String(code || '').replace(/(.{4})(?=.)/g, '$1 ');
      const backdrop = window.Components._bankSheet('bank-pair-code-modal', `
        <h2 id="bank-pair-code-modal-title" class="header-title" style="margin: 0 0 var(--space-2); font-size: 1.1rem;">${t('bank.pairBrowser')}</h2>
        <div style="color: var(--text-secondary); font-size: var(--text-sm); line-height: 1.6; margin-bottom: var(--space-4);">${t('bank.pairShowIntro')}</div>
        <div id="bank-pair-code-value" style="font-family: monospace; font-size: 2rem; font-weight: 700; letter-spacing: 0.12em; text-align: center; padding: var(--space-4); border-radius: var(--radius-lg); background: var(--bg-surface-sunken); user-select: all;">${BC.esc(grouped(opts.code))}</div>
        <div id="bank-pair-code-countdown" aria-live="polite" style="text-align: center; color: var(--text-tertiary); font-size: var(--text-sm); margin: var(--space-3) 0 var(--space-4); min-height: 1.4em;"></div>
        <div style="display: flex; flex-direction: column; gap: var(--space-3);">
          <button type="button" class="btn btn-secondary" id="bank-pair-code-new" hidden>${t('bank.pairNewCode')}</button>
          <button type="button" class="btn btn-primary" id="bank-pair-code-done">${t('common.done')}</button>
        </div>`);
      if (!backdrop) return;
      const close = () => { clearInterval(timer); backdrop._close(); };
      const countdown = backdrop.querySelector('#bank-pair-code-countdown');
      const renew = backdrop.querySelector('#bank-pair-code-new');
      let expiresAt = Date.parse(opts.expiresAt || '') || (Date.now() + 5 * 60 * 1000);
      const tick = () => {
        const left = Math.max(0, Math.round((expiresAt - Date.now()) / 1000));
        if (left <= 0) {
          countdown.textContent = t('bank.pairCodeExpired');
          renew.hidden = false;
          clearInterval(timer);
          return;
        }
        const m = Math.floor(left / 60);
        const s = left % 60;
        countdown.textContent = t('bank.pairExpiresIn', { time: `${m}:${s < 10 ? '0' : ''}${s}` });
      };
      let timer = setInterval(() => { if (!backdrop.isConnected) { clearInterval(timer); return; } tick(); }, 1000);
      tick();
      backdrop.addEventListener('click', (e) => { if (e.target === backdrop) close(); });
      backdrop.querySelector('#bank-pair-code-done').addEventListener('click', close);
      renew.addEventListener('click', async () => {
        renew.disabled = true;
        try {
          const res = await BC.pairCode();
          backdrop.querySelector('#bank-pair-code-value').textContent = grouped(res.code);
          expiresAt = Date.parse(res.expiresAt || '') || (Date.now() + 5 * 60 * 1000);
          renew.hidden = true;
          timer = setInterval(() => { if (!backdrop.isConnected) { clearInterval(timer); return; } tick(); }, 1000);
          tick();
        } catch (e) {
          alert(t('bank.pairFailed'));
        }
        renew.disabled = false;
      });
    }
  },

  // Shown only when the user taps Connect without a valid entitlement, or on
  // a 402 from the broker (B4/B5). One product, monthly + yearly (D-C9).
  PaywallModal: {
    show(options) {
      const opts = options || {};
      const BC = window.BankConnect;
      const t = (k, p) => window.I18n.t(k, p);
      const prices = BC.prices();
      let plan = 'yearly';
      const perk = (key, params) => `
        <div style="display: flex; align-items: flex-start; gap: var(--space-2); margin-bottom: var(--space-2); font-size: var(--text-sm); color: var(--text-secondary); line-height: 1.5;">
          <i data-lucide="check" style="width: 16px; height: 16px; color: var(--color-income); flex-shrink: 0; margin-top: 2px;"></i>
          <span>${t(key, params)}</span>
        </div>`;
      // v1.14: the billed amount must name its period ("€2.99 / month"), not
      // stand alone — Apple's subscription checklist asks for the length of
      // the subscription and the full renewal price on the sign-up screen,
      // and Play wants the billing frequency visible before purchase.
      const withPeriod = (id, price) => price
        ? t(id === 'yearly' ? 'bank.pricePerYear' : 'bank.pricePerMonth', { price: BC.esc(price) })
        : '—';
      const planCard = (id, labelKey, price, sub) => `
        <button type="button" class="bank-plan" data-plan="${id}" aria-pressed="${plan === id ? 'true' : 'false'}" style="flex: 1; text-align: left; background: var(--bg-surface); border: 1px solid ${plan === id ? 'var(--color-accent)' : 'var(--color-border)'}; box-shadow: ${plan === id ? '0 0 0 1px var(--color-accent)' : 'none'}; border-radius: var(--radius-lg); padding: var(--space-3) var(--space-4); cursor: pointer; color: var(--text-primary);">
          <div style="font-size: var(--text-xs); color: var(--text-secondary); font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em;">${t(labelKey)}</div>
          <div style="font-family: var(--font-family-display); font-weight: 700; font-size: var(--text-lg); margin-top: 2px;">${withPeriod(id, price)}</div>
          ${sub ? `<div style="font-size: var(--text-xs); color: var(--text-tertiary);">${BC.esc(sub)}</div>` : ''}
        </button>`;
      const plansHtml = prices
        ? `<div id="bank-paywall-plans" style="display: flex; gap: var(--space-3); margin: var(--space-4) 0;">
             ${planCard('monthly', 'bank.planMonthly', prices.monthly.price, '')}
             ${planCard('yearly', 'bank.planYearly', prices.yearly.price, prices.yearly.perMonth ? t('bank.perMonthEquiv', { amount: prices.yearly.perMonth }) : '')}
           </div>`
        : `<div id="bank-paywall-noprices" style="font-size: var(--text-sm); color: var(--text-secondary); margin: var(--space-4) 0; line-height: 1.5;">${t('bank.pricesUnavailable')}</div>`;

      // v1.09 B5: the store answers asynchronously — render now, fill in the
      // plans when the prices arrive (native only; the stub is synchronous).
      // v1.11 B7: the web build has no store — it says so and points at the
      // pairing screen (UX plan §16.3).
      const storeReachable = BC.storeAvailable();
      const webOnly = !storeReachable && BC.isWebSession();
      const webHtml = `
        <div id="bank-paywall-web" style="font-size: var(--text-sm); color: var(--text-secondary); margin: var(--space-4) 0; line-height: 1.6;">${t('bank.webPaywall')}</div>
        <div style="display: flex; flex-direction: column; gap: var(--space-3);">
          ${BC.hasWebSession() ? '' : `<button type="button" class="btn btn-primary" id="bank-paywall-pair">${t('bank.pairButton')}</button>`}
          <button type="button" class="btn btn-secondary" id="bank-paywall-close">${t('common.close')}</button>
        </div>`;
      const backdrop = window.Components._bankSheet('bank-paywall', webOnly ? `
        <h2 id="bank-paywall-title" class="header-title" style="margin: 0 0 var(--space-1); font-size: 1.1rem;">${t('bank.paywallTitle')}</h2>
        ${opts.reason ? `<div style="font-size: var(--text-sm); color: var(--color-expense); margin-bottom: var(--space-2);">${BC.esc(opts.reason)}</div>` : ''}
        ${opts.bankName ? `<div id="bank-paywall-bank" style="font-size: var(--text-sm); color: var(--text-secondary); margin-bottom: var(--space-4);">${t('bank.worksWith', { bank: BC.esc(opts.bankName) })}</div>` : '<div style="margin-bottom: var(--space-3);"></div>'}
        ${perk('bank.perkAuto')}
        ${perk('bank.perkBanks', { count: BC.MAX_CONNECTIONS })}
        ${perk('bank.perkReview')}
        ${webHtml}
        <p style="font-size: var(--text-xs); color: var(--text-secondary); text-align: center; margin: var(--space-4) 0 var(--space-2);">${t('bank.optionalNote')}</p>` : `
        <h2 id="bank-paywall-title" class="header-title" style="margin: 0 0 var(--space-1); font-size: 1.1rem;">${t('bank.paywallTitle')}</h2>
        ${opts.reason ? `<div style="font-size: var(--text-sm); color: var(--color-expense); margin-bottom: var(--space-2);">${BC.esc(opts.reason)}</div>` : ''}
        ${opts.bankName ? `<div id="bank-paywall-bank" style="font-size: var(--text-sm); color: var(--text-secondary); margin-bottom: var(--space-4);">${t('bank.worksWith', { bank: BC.esc(opts.bankName) })}</div>` : '<div style="margin-bottom: var(--space-3);"></div>'}
        ${perk('bank.perkAuto')}
        ${perk('bank.perkBanks', { count: BC.MAX_CONNECTIONS })}
        ${perk('bank.perkReview')}
        <div id="bank-paywall-plans-wrap">${prices ? plansHtml : (storeReachable ? `<div id="bank-paywall-noprices" style="font-size: var(--text-sm); color: var(--text-secondary); margin: var(--space-4) 0; line-height: 1.5;">${t('bank.pricesLoading')}</div>` : plansHtml)}</div>
        <div style="display: flex; flex-direction: column; gap: var(--space-3);">
          <button type="button" class="btn btn-primary" id="bank-paywall-subscribe" ${prices ? '' : 'disabled'}>${t('bank.subscribe')}</button>
          <button type="button" class="btn btn-secondary" id="bank-paywall-restore">${t('bank.restore')}</button>
          <button type="button" class="btn btn-secondary" id="bank-paywall-close">${t('common.close')}</button>
        </div>
        <p style="font-size: var(--text-xs); color: var(--text-secondary); text-align: center; margin: var(--space-4) 0 var(--space-2);">${t('bank.optionalNote')}</p>
        <p style="font-size: 0.68rem; color: var(--text-tertiary); text-align: center; line-height: 1.5; margin: 0 0 var(--space-2);">${t('bank.storeNote')}</p>
        ${window.Components._legalLinks('bank-paywall')}`);
      if (!backdrop) return;
      const close = backdrop._close;
      backdrop.addEventListener('click', (e) => { if (e.target === backdrop) close(); });
      backdrop.querySelector('#bank-paywall-close').addEventListener('click', close);
      if (webOnly) {
        const pairBtn = backdrop.querySelector('#bank-paywall-pair');
        if (pairBtn) pairBtn.addEventListener('click', () => { close(); window.Router.navigate('#bank-connect'); });
        return;
      }
      const bindPlans = () => {
        backdrop.querySelectorAll('.bank-plan').forEach(btn => {
          btn.addEventListener('click', () => {
            plan = btn.dataset.plan;
            backdrop.querySelectorAll('.bank-plan').forEach(b => {
              const on = b.dataset.plan === plan;
              b.setAttribute('aria-pressed', on ? 'true' : 'false');
              b.style.borderColor = on ? 'var(--color-accent)' : 'var(--color-border)';
              b.style.boxShadow = on ? '0 0 0 1px var(--color-accent)' : 'none';
            });
          });
        });
      };
      bindPlans();
      // v1.09 B5: late prices from the native store
      if (!prices && storeReachable && !BC.stub()) {
        BC.loadPrices().then(p => {
          if (!p || !backdrop.isConnected) return;
          const wrap = backdrop.querySelector('#bank-paywall-plans-wrap');
          if (!wrap) return;
          wrap.innerHTML = `<div id="bank-paywall-plans" style="display: flex; gap: var(--space-3); margin: var(--space-4) 0;">
             ${planCard('monthly', 'bank.planMonthly', p.monthly.price, '')}
             ${planCard('yearly', 'bank.planYearly', p.yearly.price, p.yearly.perMonth ? t('bank.perMonthEquiv', { amount: p.yearly.perMonth }) : '')}
           </div>`;
          bindPlans();
          const sub = backdrop.querySelector('#bank-paywall-subscribe');
          if (sub) sub.disabled = false;
        }).catch(() => {});
      }
      const finish = (ent) => {
        if (ent && ent.active) {
          close();
          if (opts.onEntitled) opts.onEntitled();
        }
      };
      const busy = (on) => {
        backdrop.querySelectorAll('#bank-paywall-subscribe, #bank-paywall-restore').forEach(b => { b.disabled = on; });
        const s = backdrop.querySelector('#bank-paywall-subscribe');
        if (s) s.textContent = on ? t('bank.verifying') : t('bank.subscribe');
      };
      backdrop.querySelector('#bank-paywall-subscribe').addEventListener('click', async () => {
        if (!BC.storeAvailable()) { alert(t('bank.storeUnavailable')); return; }
        busy(true);
        try {
          const ent = await BC.purchase(plan);
          busy(false);
          if (!ent) return; // timed out / nothing approved: the store showed its own message
          if (!ent.active) { alert(t('bank.purchaseFailed')); return; }
          finish(ent);
        } catch (e) {
          busy(false);
          // v1.16 A-03: an unreachable broker is not a declined purchase.
          if (!(e && e.cancelled)) alert(t(e && e.pending ? 'bank.purchasePending' : 'bank.purchaseFailed'));
        }
      });
      backdrop.querySelector('#bank-paywall-restore').addEventListener('click', async () => {
        if (!BC.storeAvailable()) { alert(t('bank.storeUnavailable')); return; }
        busy(true);
        try {
          const ent = await BC.restorePurchase();
          busy(false);
          if (!ent || !ent.active) { alert(t('bank.restoreNone')); return; }
          finish(ent);
        } catch (e) {
          busy(false);
          alert(t(e && e.pending ? 'bank.purchasePending' : 'bank.purchaseFailed'));
        }
      });
      window.Components._bindLegalLinks(backdrop, 'bank-paywall', close);
    }
  },

  // v1.13 Stack'd Pro (docs/pro-unlock.md): the gate hit from INSIDE another
  // flow (the transaction form's "New category", the account form's Save).
  // Explains the free-plan limit and hands off to the purchases screen; the
  // gated "new" screens themselves render Views._proLockedPage instead.
  ProLockModal: {
    show(options) {
      const opts = options || {};
      const t = (k, p) => window.I18n.t(k, p);
      const Pro = window.Pro;
      const isAcc = opts.feature === 'accounts';
      // Replace whatever sheet is open (the category picker) — exactly what
      // the ungated path does when Components.Modal.show swaps it for the
      // new-category form. Left underneath, the picker keeps intercepting
      // taps meant for this sheet.
      const mc = document.getElementById('modal-container');
      if (mc) mc.innerHTML = '';
      const backdrop = window.Components._bankSheet('pro-lock', `
        <div class="list-item-icon" style="margin: 0 auto var(--space-4); width: 56px; height: 56px;" aria-hidden="true"><i data-lucide="lock" style="width: 26px; height: 26px;"></i></div>
        <h2 id="pro-lock-title" class="header-title" style="margin: 0 0 var(--space-2); font-size: 1.1rem; text-align: center;">${isAcc ? t('pro.lockedAccountsTitle') : t('pro.lockedCategoriesTitle')}</h2>
        <p style="font-size: var(--text-sm); color: var(--text-secondary); line-height: 1.6; text-align: center; margin: 0 0 var(--space-5);">${isAcc ? t('pro.lockedAccountsBody', { count: Pro.FREE_ACCOUNT_LIMIT }) : t('pro.lockedCategoriesBody')}</p>
        <div style="display: flex; flex-direction: column; gap: var(--space-3);">
          <button type="button" class="btn btn-primary" id="pro-lock-cta">${t('pro.seePro')}</button>
          <button type="button" class="btn btn-secondary" id="pro-lock-close">${t('common.close')}</button>
        </div>`);
      if (!backdrop) return;
      const close = backdrop._close;
      backdrop.addEventListener('click', (e) => { if (e.target === backdrop) close(); });
      backdrop.querySelector('#pro-lock-close').addEventListener('click', close);
      backdrop.querySelector('#pro-lock-cta').addEventListener('click', () => {
        // The router never clears #modal-container, so drop this sheet
        // outright (no fade) before leaving.
        backdrop.remove();
        window.Router.navigate('#purchases');
      });
    }
  },

  // 1.0.1 (BUG-01): confirm step of a base-currency switch, shared by the
  // Settings currency picker and the onboarding welcome sheet. It summarises
  // how many accounts the new base would leave out of totals and offers to
  // relabel every account in the OLD base (label only, never converted). Only
  // the primary button dispatches; Cancel / backdrop / swipe / Back abort with
  // the base unchanged. Callers hand off to it WITHOUT closing their own sheet
  // first (Modal.show replaces #active-modal synchronously).
  //   show({ prev, next, impact, onApplied })
  //   impact = Store.currencySwitchImpact(next)
  CurrencySwitchConfirm: {
    // Sentence for the live summary; `relabel` = state of the checkbox.
    summary(impact, next, relabel) {
      const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
      const left = relabel ? impact.excluded - impact.relabelable : impact.excluded;
      let html = esc(window.I18n.t('others.currencySwitchExcluded', { count: left, currency: next }));
      if (impact.total > 0 && left === impact.total) {
        html += ` <strong style="color: var(--color-expense-val);">${esc(window.I18n.t('others.currencySwitchNoneCounted'))}</strong>`;
      }
      return html;
    },

    show(options) {
      const o = options || {};
      const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
      const prev = o.prev;
      const next = o.next;
      const impact = o.impact || window.Store.currencySwitchImpact(next);
      // D4a: pre-ticked only when no account is already in the new currency
      // (the "I picked the wrong currency at onboarding" case). Holding
      // accounts in the target signals deliberate multi-currency use.
      const relabelDefault = impact.relabelable > 0 && impact.primaryAfter === 0;

      const relabelHtml = impact.relabelable > 0 ? `
        <label style="display: flex; align-items: flex-start; gap: var(--space-2); font-size: var(--text-sm); cursor: pointer; margin-top: var(--space-4);">
          <input type="checkbox" id="currency-switch-relabel" class="import-check" style="margin-top: 2px;" ${relabelDefault ? 'checked' : ''}>
          <span>${esc(window.I18n.t('others.currencySwitchRelabel', { count: impact.relabelable, from: prev, to: next }))}</span>
        </label>` : '';

      window.Components.Modal.show({
        title: esc(window.I18n.t('others.currencySwitchTitle', { currency: next })),
        content: `
          <p id="currency-switch-summary" style="margin: 0; font-size: var(--text-sm); color: var(--text-primary); line-height: 1.5;">${this.summary(impact, next, relabelDefault)}</p>
          ${relabelHtml}
          <p id="currency-switch-note" style="margin: var(--space-4) 0 0; font-size: var(--text-xs); color: var(--text-tertiary); line-height: 1.5;">${esc(window.I18n.t('others.currencySwitchNote'))}</p>`,
        saveText: esc(window.I18n.t('others.currencySwitchApply', { currency: next })),
        onSave: (close) => {
          const box = document.getElementById('currency-switch-relabel');
          window.Store.dispatch('SET_CURRENCY', { code: next, relabel: !!(box && box.checked) });
          close();
          if (typeof o.onApplied === 'function') o.onApplied();
        }
      });

      const box = document.getElementById('currency-switch-relabel');
      if (box) {
        box.addEventListener('change', () => {
          const sum = document.getElementById('currency-switch-summary');
          if (sum) sum.innerHTML = this.summary(impact, next, box.checked);
        });
      }
    }
  },

  // v1.06 U2 (docs/import-ux-plan.md §3): the import's ending. Shown over
  // Settings right after Confirm; counts as rows, the reconciliation verdict
  // as a visual state, and the "View transactions" deep link (the wallet
  // tile's ?account= filter). Also the landing surface for Bank Connect
  // fetches (B3). Uses the shared sheet helper (`_bankSheet`).
  ImportSuccessModal: {
    show(options) {
      const o = options || {};
      const t = (k, p) => window.I18n.t(k, p);
      const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
      const row = (icon, text, id) => `
        <div id="${id}" style="display: flex; align-items: flex-start; gap: var(--space-3); margin-bottom: var(--space-3);">
          <div class="list-item-icon" style="margin: 0; flex-shrink: 0;" aria-hidden="true"><i data-lucide="${icon}"></i></div>
          <div style="font-size: var(--text-sm); color: var(--text-primary); line-height: 1.5; padding-top: 6px;">${text}</div>
        </div>`;
      let rows = row('circle-check', esc(t('bankImport.done', { count: Number(o.imported) || 0, account: o.accountName || '' })), 'import-success-imported');
      if (o.linked) rows += row('link-2', esc(t('bankImport.doneLinked', { count: o.linked })), 'import-success-linked');
      if (o.paired) rows += row('arrow-left-right', esc(t('bankImport.donePaired', { count: o.paired })), 'import-success-paired');

      let verdictHtml = '';
      if (o.verdict) {
        const ok = !!o.verdict.ok;
        const color = ok ? 'var(--color-income)' : 'var(--color-accent)';
        const bg = ok ? 'var(--color-income-bg)' : 'var(--bg-surface-sunken)';
        const text = ok
          ? t('bankImport.reconcileOk', { amount: o.verdict.bank, date: o.verdict.date })
          : t('bankImport.reconcileMismatch', { bank: o.verdict.bank, app: o.verdict.app, date: o.verdict.date });
        verdictHtml = `
          <div id="import-success-verdict" data-ok="${ok ? 'true' : 'false'}" style="display: flex; align-items: flex-start; gap: var(--space-3); background: ${bg}; border-radius: var(--radius-lg); padding: var(--space-3) var(--space-4); margin: var(--space-2) 0 var(--space-4);">
            <i data-lucide="${ok ? 'circle-check' : 'alert-triangle'}" style="width: 20px; height: 20px; color: ${color}; flex-shrink: 0; margin-top: 2px;"></i>
            <div>
              <div style="font-weight: 600; font-size: var(--text-sm); color: ${color};">${t('bankImport.reconcileTitle')}</div>
              <div style="font-size: var(--text-sm); color: var(--text-secondary); line-height: 1.5;">${esc(text)}</div>
            </div>
          </div>`;
      }

      const backdrop = window.Components._bankSheet('import-success-modal', `
        <h2 id="import-success-modal-title" class="header-title" style="margin: 0 0 var(--space-4); font-size: 1.1rem;">${t('bankImport.successTitle')}</h2>
        ${rows}
        ${verdictHtml}
        <div style="display: flex; flex-direction: column; gap: var(--space-3); margin-top: var(--space-2);">
          <button type="button" class="btn btn-primary" id="import-success-view">${t('bankImport.viewTransactions')}</button>
          <button type="button" class="btn btn-secondary" id="import-success-done">${t('common.done')}</button>
        </div>`);
      if (!backdrop) return;
      const close = backdrop._close;
      backdrop.addEventListener('click', (e) => { if (e.target === backdrop) close(); });
      backdrop.querySelector('#import-success-done').addEventListener('click', close);
      backdrop.querySelector('#import-success-view').addEventListener('click', () => {
        close();
        window.Router.navigate(o.accountId ? `#transactions?account=${encodeURIComponent(o.accountId)}` : '#transactions');
      });
    }
  },

  // 1.0.1 (BUG-21): one-button in-app notice, the replacement for window.alert()
  // (an unstyled system dialog titled with the page origin in the Android
  // WebView). Built on _bankSheet, so it lives in #modal-container under its own
  // id and survives the re-render of the view below it. The body is escaped
  // and keeps '\n' line breaks (white-space: pre-line). OK carries
  // [data-back-dismiss] for Android Back; a backdrop tap and Escape also close.
  // show({ id, tone: 'info'|'success'|'error', title, body, okText, onClose })
  NoticeSheet: {
    show(options) {
      const o = options || {};
      const id = o.id || 'notice-sheet';
      const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
      const tone = o.tone || 'info';
      const icon = tone === 'error' ? 'alert-triangle' : (tone === 'success' ? 'circle-check' : 'info');
      const color = tone === 'error' ? 'var(--color-expense)' : (tone === 'success' ? 'var(--color-income)' : 'var(--color-primary)');
      // _bankSheet labels the dialog with `${id}-title`: the heading when there
      // is one, otherwise the body itself.
      const titleHtml = o.title
        ? `<h2 id="${id}-title" class="header-title" style="margin: 0 0 var(--space-3); font-size: 1.1rem;">${esc(o.title)}</h2>`
        : '';
      const backdrop = window.Components._bankSheet(id, `
        ${titleHtml}
        <div style="display: flex; gap: var(--space-3); align-items: flex-start; margin-bottom: var(--space-5);">
          <i data-lucide="${icon}" aria-hidden="true" style="width: 20px; height: 20px; color: ${color}; flex-shrink: 0; margin-top: 2px;"></i>
          <p id="${id}-${o.title ? 'body' : 'title'}" style="margin: 0; white-space: pre-line; overflow-wrap: anywhere; font-size: var(--text-sm); line-height: 1.55; color: var(--text-secondary);">${esc(o.body)}</p>
        </div>
        ${o.action && o.action.text ? `<button type="button" class="btn btn-secondary" id="${id}-action" style="margin-bottom: var(--space-3);">${esc(o.action.text)}</button>` : ''}
        <button type="button" class="btn btn-primary" id="${id}-ok" data-back-dismiss>${esc(o.okText || window.I18n.t('common.ok'))}</button>`);
      if (!backdrop) return null;
      if (o.title) backdrop.setAttribute('aria-describedby', `${id}-body`);
      const okBtn = backdrop.querySelector(`#${id}-ok`);
      let closed = false;
      const onKey = (e) => {
        if (!document.body.contains(backdrop)) { document.removeEventListener('keydown', onKey); return; }
        if (e.key === 'Escape') { e.preventDefault(); close(); }
      };
      const close = () => {
        if (closed) return;
        closed = true;
        document.removeEventListener('keydown', onKey);
        backdrop._close();
        if (typeof o.onClose === 'function') o.onClose();
      };
      backdrop.addEventListener('click', (e) => { if (e.target === backdrop) close(); });
      okBtn.addEventListener('click', close);
      // 1.1.0 (IE-6): one optional secondary action (the import result's
      // "Switch main currency" / "View transactions"); closes, then runs.
      const actionBtn = backdrop.querySelector(`#${id}-action`);
      if (actionBtn) actionBtn.addEventListener('click', () => { close(); if (typeof o.action.onClick === 'function') o.action.onClick(); });
      document.addEventListener('keydown', onKey);
      // alert() used to take focus; keep keyboard / screen-reader users on it.
      setTimeout(() => { if (!closed && okBtn.isConnected) { try { okBtn.focus({ preventScroll: true }); } catch (e) { okBtn.focus(); } } }, 50);
      return backdrop;
    }
  },

  // 1.0.3 (BUG-137/BUG-41): the warning before a save that would leave rows
  // dated before an account's opening date (out of every balance, budget and
  // chart). Shared by Edit Account and the transaction form. Buttons, top to
  // bottom: primary (fix the dates), "anyway" (save as is), Cancel. Cancel,
  // a backdrop tap, Escape and Android Back ([data-back-dismiss]) save
  // nothing and leave the form open as typed. NoticeSheet family (_bankSheet).
  // title / bodyHtml (array of lines) / primaryHtml / anywayHtml are MARKUP:
  // the caller escapes its t() params (account names), never t() output.
  //   show({ title, bodyHtml, primaryHtml, onPrimary, anywayHtml, onAnyway, onCancel })
  OpeningDateSheet: {
    // 'YYYY-MM-DD' → the UI locale's medium date ("Sep 1, 2026"), noon-anchored
    // so it never drifts a day. A non-date is returned as is.
    fmtDate(ymd) {
      const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(ymd || ''));
      if (!m) return String(ymd || '');
      try {
        return new Intl.DateTimeFormat(window.Store.getLocale(), { dateStyle: 'medium' })
          .format(new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12));
      } catch (e) { return String(ymd); }
    },
    show(options) {
      const o = options || {};
      const id = 'opening-date-sheet';
      const lines = Array.isArray(o.bodyHtml) ? o.bodyHtml : [o.bodyHtml || ''];
      const backdrop = window.Components._bankSheet(id, `
        <h2 id="${id}-title" class="header-title" style="margin: 0 0 var(--space-3); font-size: 1.1rem;">${o.title || ''}</h2>
        <div style="display: flex; gap: var(--space-3); align-items: flex-start; margin-bottom: var(--space-5);">
          <i data-lucide="alert-triangle" aria-hidden="true" style="width: 20px; height: 20px; color: var(--color-expense); flex-shrink: 0; margin-top: 2px;"></i>
          <div id="${id}-body">
            ${lines.map(l => `<p style="margin: 0 0 var(--space-2); overflow-wrap: anywhere; font-size: var(--text-sm); line-height: 1.55; color: var(--text-secondary);">${l}</p>`).join('')}
          </div>
        </div>
        <div style="display: flex; flex-direction: column; gap: var(--space-3);">
          <button type="button" class="btn btn-primary" id="opening-date-primary">${o.primaryHtml || ''}</button>
          <button type="button" class="btn btn-secondary" id="opening-date-anyway">${o.anywayHtml || ''}</button>
          <button type="button" class="btn btn-secondary" id="opening-date-cancel" data-back-dismiss>${window.I18n.t('common.cancel')}</button>
        </div>`);
      if (!backdrop) return null;
      backdrop.setAttribute('aria-describedby', `${id}-body`);
      let closed = false;
      const onKey = (e) => {
        if (!document.body.contains(backdrop)) { document.removeEventListener('keydown', onKey); return; }
        if (e.key === 'Escape') { e.preventDefault(); cancel(); }
      };
      const finish = () => {
        if (closed) return false;
        closed = true;
        document.removeEventListener('keydown', onKey);
        return true;
      };
      const cancel = () => {
        if (!finish()) return;
        backdrop._close();
        if (typeof o.onCancel === 'function') o.onCancel();
      };
      // A choice saves and leaves the form: drop the sheet at once (no fade
      // over the landing screen), then act.
      const choose = (fn) => () => {
        if (!finish()) return;
        backdrop.remove();
        if (typeof fn === 'function') fn();
      };
      backdrop.addEventListener('click', (e) => { if (e.target === backdrop) cancel(); });
      backdrop.querySelector('#opening-date-cancel').addEventListener('click', cancel);
      backdrop.querySelector('#opening-date-primary').addEventListener('click', choose(o.onPrimary));
      backdrop.querySelector('#opening-date-anyway').addEventListener('click', choose(o.onAnyway));
      document.addEventListener('keydown', onKey);
      return backdrop;
    }
  },

  // v1.07 B3 (UX plan §3.6): shown while the bank's page is open in the
  // system browser. Cancel deletes the pending requisition at the broker.
  BankWaitingModal: {
    show(options) {
      const o = options || {};
      const t = (k, p) => window.I18n.t(k, p);
      const BC = window.BankConnect;
      const backdrop = window.Components._bankSheet('bank-waiting-modal', `
        <h2 id="bank-waiting-modal-title" class="header-title" style="margin: 0 0 var(--space-2); font-size: 1.1rem;">${t('bank.waitingTitle', { bank: BC.esc(o.bankName || '') })}</h2>
        <p style="color: var(--text-secondary); font-size: var(--text-sm); line-height: 1.6; margin: 0 0 var(--space-4);">${t('bank.waitingBody')}</p>
        <button type="button" class="btn btn-secondary" id="bank-waiting-cancel">${t('common.cancel')}</button>`);
      if (!backdrop) return;
      backdrop.querySelector('#bank-waiting-cancel').addEventListener('click', async () => {
        backdrop._close();
        if (o.ref) {
          try { await BC.revoke(o.ref); } catch (e) { /* best effort */ }
          window.Store.dispatch('SET_BANK_CONNECT_PREFS', { pendingRef: null, pendingInstitution: null });
        }
      });
    },
    hide() {
      const el = document.getElementById('bank-waiting-modal');
      if (el && el._close) el._close();
    }
  },

  // v1.07 B3 (UX plan §3.6): the bank leg failed — one sheet per outcome.
  BankConnectErrorModal: {
    show(options) {
      const o = options || {};
      const t = (k, p) => window.I18n.t(k, p);
      const titleKey = o.status === 'UA' ? 'bank.errCancelledTitle' : (o.status === 'EX' ? 'bank.errExpiredTitle' : 'bank.errRejectedTitle');
      const backdrop = window.Components._bankSheet('bank-connect-error', `
        <h2 id="bank-connect-error-title" class="header-title" style="margin: 0 0 var(--space-2); font-size: 1.1rem;">${t(titleKey)}</h2>
        <p style="color: var(--text-secondary); font-size: var(--text-sm); line-height: 1.6; margin: 0 0 var(--space-4);">${t('bank.errBody')}</p>
        <div style="display: flex; flex-direction: column; gap: var(--space-3);">
          <button type="button" class="btn btn-primary" id="bank-connect-error-retry">${t('bank.tryAgain')}</button>
          <button type="button" class="btn btn-secondary" id="bank-connect-error-close">${t('common.close')}</button>
        </div>`);
      if (!backdrop) return;
      backdrop.addEventListener('click', (e) => { if (e.target === backdrop) backdrop._close(); });
      backdrop.querySelector('#bank-connect-error-close').addEventListener('click', () => backdrop._close());
      backdrop.querySelector('#bank-connect-error-retry').addEventListener('click', () => {
        backdrop._close();
        if (window.Views._BankShared) window.Views._BankShared.resetPicker();
        window.Router.navigate('#bank-connect-add');
      });
    }
  },

  // v1.08 B4 (UX plan §3.2 "Manage"): consent dates, history limit, the
  // linked accounts, Link accounts / Reconnect, and Disconnect (danger).
  // 1.1.0 (IE-5, docs/import-export-plan.md §3a): Settings → Import and
  // export, as MoneyStats does: Import file / Export file / Cancel.
  ImportExportSheet: {
    show() {
      const t = (k) => window.I18n.t(k);
      const backdrop = window.Components._bankSheet('import-export-sheet', `
        <h2 id="import-export-sheet-title" class="header-title" style="margin: 0 0 var(--space-1); font-size: 1.1rem;">${t('others.importExport')}</h2>
        <p style="color: var(--text-secondary); font-size: var(--text-sm); margin: 0 0 var(--space-4); line-height: 1.5;">${t('ie.sheet.body')}</p>
        <div style="display: flex; flex-direction: column; gap: var(--space-3);">
          <button class="btn btn-secondary" id="ie-sheet-import">${t('ie.sheet.import')}</button>
          <button class="btn btn-secondary" id="ie-sheet-export">${t('ie.sheet.export')}</button>
          <button class="btn btn-secondary" id="ie-sheet-cancel" data-back-dismiss>${t('common.cancel')}</button>
        </div>`);
      if (!backdrop) return;
      const go = (path) => { backdrop._close(); window.Router.navigate(path); };
      backdrop.querySelector('#ie-sheet-import').addEventListener('click', () => go('#import'));
      backdrop.querySelector('#ie-sheet-export').addEventListener('click', () => go('#export'));
      backdrop.querySelector('#ie-sheet-cancel').addEventListener('click', () => backdrop._close());
      backdrop.addEventListener('click', (e) => { if (e.target === backdrop) backdrop._close(); });
    }
  },

  // 1.2.0 (UX-10): the transaction form's "Add an attachment" sheet —
  // Camera / Photo library / PDF file / Cancel. Each choice closes the sheet
  // and runs its callback IN the tap (the form clicks a hidden file input,
  // which iOS and Android only open from a user gesture).
  AttachmentSheet: {
    show(options) {
      const o = options || {};
      const t = (k) => window.I18n.t(k);
      const btn = (id, icon, label) => `<button type="button" class="btn btn-secondary att-sheet-btn" id="${id}"><i data-lucide="${icon}" aria-hidden="true"></i><span>${label}</span></button>`;
      const backdrop = window.Components._bankSheet('attachment-sheet', `
        <h2 id="attachment-sheet-title" class="header-title" style="margin: 0 0 var(--space-1); font-size: 1.1rem;">${t('attach.title')}</h2>
        <p style="color: var(--text-secondary); font-size: var(--text-sm); margin: 0 0 var(--space-4); line-height: 1.5;">${t('attach.body')}</p>
        <div style="display: flex; flex-direction: column; gap: var(--space-3);">
          ${btn('att-sheet-camera', 'camera', t('attach.camera'))}
          ${btn('att-sheet-library', 'image', t('attach.library'))}
          ${btn('att-sheet-pdf', 'file-text', t('attach.pdf'))}
          <button type="button" class="btn btn-secondary" id="att-sheet-cancel" data-back-dismiss>${t('common.cancel')}</button>
        </div>`);
      if (!backdrop) return null;
      const pick = (fn) => () => { backdrop._close(); if (typeof fn === 'function') fn(); };
      backdrop.querySelector('#att-sheet-camera').addEventListener('click', pick(o.onCamera));
      backdrop.querySelector('#att-sheet-library').addEventListener('click', pick(o.onLibrary));
      backdrop.querySelector('#att-sheet-pdf').addEventListener('click', pick(o.onPdf));
      backdrop.querySelector('#att-sheet-cancel').addEventListener('click', () => backdrop._close());
      backdrop.addEventListener('click', (e) => { if (e.target === backdrop) backdrop._close(); });
      return backdrop;
    }
  },

  // 1.2.0 (UX-10): a tapped attachment. An image opens full screen (object-
  // fit contain) with Share and Delete; a PDF goes straight to the system
  // (share sheet on native, a new tab on the web). A file this device does
  // not hold (a backup restored on another phone) says so. onDelete(meta)
  // is optional: the form removes the attachment from its list (the file goes
  // when the save lands).
  AttachmentViewer: {
    show(options) {
      const o = options || {};
      const meta = o.meta;
      const A = window.Attachments;
      const esc = window.Components.esc;
      const t = (k, p) => window.I18n.t(k, p);
      if (!meta || !A) return null;
      const missing = () => window.Components.NoticeSheet.show({ id: 'attachment-missing-modal', tone: 'info', title: meta.name || t('form.attachments'), body: t('attach.missing') });
      if (meta.kind === 'pdf') {
        A.read(meta).then((bytes) => {
          if (!bytes) { missing(); return; }
          A.share(meta);
        });
        return null;
      }
      const backdrop = window.Components._bankSheet('attachment-viewer', `
        <div class="modal-top-bar att-viewer-bar">
          <h2 id="attachment-viewer-title" class="att-viewer-title">${esc(meta.name || '')}</h2>
          <button type="button" class="modal-btn-top modal-btn-close" id="att-viewer-close" aria-label="${esc(t('common.close'))}"><i data-lucide="x" aria-hidden="true"></i></button>
        </div>
        <div class="att-viewer-stage" id="att-viewer-stage">
          <img id="att-viewer-img" alt="${esc(meta.name || '')}" hidden>
          <p id="att-viewer-missing" class="att-viewer-missing" hidden>${t('attach.missing')}</p>
        </div>
        <div class="att-viewer-actions">
          <button type="button" class="btn btn-secondary" id="att-viewer-share"><i data-lucide="share-2" aria-hidden="true"></i><span>${t('attach.share')}</span></button>
          ${typeof o.onDelete === 'function' ? `<button type="button" class="btn btn-danger" id="att-viewer-delete"><i data-lucide="trash-2" aria-hidden="true"></i><span>${t('attach.delete')}</span></button>` : ''}
        </div>`);
      if (!backdrop) return null;
      backdrop.classList.add('att-viewer');
      const img = backdrop.querySelector('#att-viewer-img');
      const gone = backdrop.querySelector('#att-viewer-missing');
      const shareBtn = backdrop.querySelector('#att-viewer-share');
      let url = null;
      const showMissing = () => { img.hidden = true; gone.hidden = false; shareBtn.disabled = true; };
      // An image that will not render may still be here (a format this
      // WebView cannot draw): then it says so and Share stays available;
      // only a file the device does not hold reads "not on this device".
      img.addEventListener('error', () => {
        img.hidden = true;
        Promise.resolve(A.read(meta)).then((bytes) => {
          if (!backdrop.isConnected) return;
          if (!bytes) { showMissing(); return; }
          gone.textContent = t('attach.noPreview');
          gone.hidden = false;
        });
      });
      Promise.resolve(A.displayUrl(meta)).then((u) => {
        if (!backdrop.isConnected) return; // closed already (the URL is the form's, which revokes it)
        if (!u) { showMissing(); return; }
        url = u;
        img.src = u;
        img.hidden = false;
      });
      const close = () => { backdrop._close(); };
      backdrop.querySelector('#att-viewer-close').addEventListener('click', close);
      backdrop.addEventListener('click', (e) => { if (e.target === backdrop || e.target.id === 'att-viewer-stage') close(); });
      shareBtn.addEventListener('click', () => { if (url) A.share(meta); });
      const del = backdrop.querySelector('#att-viewer-delete');
      if (del) {
        del.addEventListener('click', () => {
          close();
          window.Components.Modal.show({
            title: esc(meta.name || t('form.attachments')),
            content: `<p>${t('attach.deleteConfirm')}</p>`,
            saveText: t('form.keep'),
            showDelete: true,
            deleteText: t('attach.delete'),
            onSave: (closeModal) => closeModal(),
            onDelete: (closeModal) => { closeModal(); o.onDelete(meta); }
          });
        });
      }
      return backdrop;
    }
  },

  // 1.1.0 (IE-6, plan §4b): the Import screen's settings — every one Auto by
  // default. show({ overrides, onSave(overrides) }); overrides are kept in
  // the Import draft only (a remembered override would misread the next file).
  ImportSettingsSheet: {
    show(options) {
      const o = options || {};
      const cur = o.overrides || {};
      const t = (k) => window.I18n.t(k);
      const esc = window.I18n.esc;
      const sel = (id, label, value, opts) => `
        <div class="form-group" style="margin-bottom: var(--space-3);">
          <label class="form-label" for="${id}">${t(label)}</label>
          <select id="${id}" class="form-control" style="appearance: none;">
            ${opts.map(([v, l]) => `<option value="${esc(v)}" ${v === (value || 'auto') ? 'selected' : ''}>${esc(l)}</option>`).join('')}
          </select>
        </div>`;
      const auto = t('import.set.auto');
      const factorVal = typeof cur.factor === 'number' && cur.factor !== 1 ? String(cur.factor) : '';
      const backdrop = window.Components._bankSheet('import-settings-sheet', `
        <h2 id="import-settings-sheet-title" class="header-title" style="margin: 0 0 var(--space-4); font-size: 1.1rem;">${t('import.set.title')}</h2>
        ${sel('iset-delimiter', 'import.set.delimiter', cur.delimiter === '\t' ? 'tab' : cur.delimiter, [['auto', auto], [';', ';'], [',', ','], ['tab', t('import.set.tab')], ['|', '|']])}
        ${sel('iset-rows', 'import.set.rows', cur.rowDelimiter, [['auto', auto], ['lf', 'LF'], ['crlf', 'CRLF'], ['cr', 'CR']])}
        ${sel('iset-date', 'import.set.date', cur.dateOrder, [['auto', auto], ['dmy', t('bankImport.dateDMY')], ['mdy', t('bankImport.dateMDY')], ['ymd', t('bankImport.dateYMD')]])}
        ${sel('iset-decimal', 'import.set.decimal', cur.decimal, [['auto', auto], ['comma', t('bankImport.decimalComma')], ['dot', t('bankImport.decimalDot')]])}
        <div class="form-group" style="margin-bottom: var(--space-3);">
          <label class="form-label" for="iset-factor">${t('import.set.factor')}</label>
          <input id="iset-factor" class="form-control" type="text" inputmode="decimal" autocomplete="off" placeholder="1" value="${esc(factorVal)}">
          <div style="font-size: var(--text-xs); color: var(--text-secondary); margin-top: var(--space-1);">${t('import.set.factorHelp')}</div>
        </div>
        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: var(--space-5);">
          <span class="list-item-title" id="iset-quotes-label">${t('import.set.quotes')}</span>
          <label class="toggle-switch"><input type="checkbox" id="iset-quotes" aria-labelledby="iset-quotes-label" ${cur.ignoreQuotes ? 'checked' : ''}><span class="slider"></span></label>
        </div>
        <button class="btn btn-primary" id="iset-save" style="margin-bottom: var(--space-3);">${t('common.save')}</button>
        <button class="btn btn-secondary" id="iset-cancel" data-back-dismiss>${t('common.cancel')}</button>`);
      if (!backdrop) return;
      const $ = (id) => backdrop.querySelector('#' + id);
      $('iset-cancel').addEventListener('click', () => backdrop._close());
      backdrop.addEventListener('click', (e) => { if (e.target === backdrop) backdrop._close(); });
      $('iset-save').addEventListener('click', () => {
        const raw = $('iset-factor').value.trim();
        const factor = raw === '' ? 1 : window.StackdImport._parseFactor(raw);
        if (factor === null) {
          const input = $('iset-factor');
          input.setAttribute('aria-invalid', 'true');
          let err = $('iset-factor-error');
          if (!err) {
            err = document.createElement('div');
            err.id = 'iset-factor-error';
            err.setAttribute('role', 'alert');
            err.style.cssText = 'color: var(--color-expense); font-size: var(--text-xs); margin-top: var(--space-1);';
            input.parentNode.appendChild(err);
          }
          err.textContent = t('import.set.factorError');
          return;
        }
        const pick = (id) => { const v = $(id).value; return v === 'auto' ? undefined : v; };
        const delim = pick('iset-delimiter');
        const next = { delimiter: delim === 'tab' ? '\t' : delim, rowDelimiter: pick('iset-rows'), dateOrder: pick('iset-date'),
          decimal: pick('iset-decimal'), factor, ignoreQuotes: $('iset-quotes').checked };
        backdrop._close();
        if (typeof o.onSave === 'function') o.onSave(next);
      });
    }
  },

  // 1.1.0 (IE-7, plan §5a.4): the Export screen's settings, saved in
  // exportPrefs (SET_EXPORT_PREFS). The delimiter is CSV-only — TXT is Tab.
  ExportSettingsSheet: {
    show() {
      const t = (k) => window.I18n.t(k);
      const esc = window.I18n.esc;
      const S = window.Store;
      const cur = S.getExportPrefs();
      const txt = cur.format === 'txt';
      const sel = (id, label, value, opts, disabled) => `
        <div class="form-group" style="margin-bottom: var(--space-3);">
          <label class="form-label" for="${id}">${t(label)}</label>
          <select id="${id}" class="form-control" style="appearance: none;" ${disabled ? 'disabled' : ''}>
            ${opts.map(([v, l]) => `<option value="${esc(v)}" ${v === value ? 'selected' : ''}>${esc(l)}</option>`).join('')}
          </select>
        </div>`;
      const toggle = (id, label, on) => `
        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: var(--space-4);">
          <span class="list-item-title" id="${id}-label">${t(label)}</span>
          <label class="toggle-switch"><input type="checkbox" id="${id}" aria-labelledby="${id}-label" ${on ? 'checked' : ''}><span class="slider"></span></label>
        </div>`;
      const backdrop = window.Components._bankSheet('export-settings-sheet', `
        <h2 id="export-settings-sheet-title" class="header-title" style="margin: 0 0 var(--space-4); font-size: 1.1rem;">${t('export.settings')}</h2>
        ${sel('eset-delimiter', 'import.set.delimiter', txt ? 'tab' : (cur.delimiter === '\t' ? 'tab' : cur.delimiter), [[';', ';'], [',', ','], ['tab', t('import.set.tab')]], txt)}
        ${sel('eset-date', 'export.dateFormat', cur.dateFormat, S.EXPORT_DATE_FORMATS.map(f => [f, f]))}
        ${sel('eset-decimal', 'import.set.decimal', cur.decimal, [['comma', t('bankImport.decimalComma')], ['dot', t('bankImport.decimalDot')]])}
        ${toggle('eset-quote', 'export.quoteAll', cur.quoteAll)}
        ${toggle('eset-bom', 'export.bom', cur.bom)}
        <button class="btn btn-primary" id="eset-save" style="margin-bottom: var(--space-3);">${t('common.save')}</button>
        <button class="btn btn-secondary" id="eset-cancel" data-back-dismiss>${t('common.cancel')}</button>`);
      if (!backdrop) return;
      const $ = (id) => backdrop.querySelector('#' + id);
      $('eset-cancel').addEventListener('click', () => backdrop._close());
      backdrop.addEventListener('click', (e) => { if (e.target === backdrop) backdrop._close(); });
      $('eset-save').addEventListener('click', () => {
        const d = $('eset-delimiter').value;
        const next = { dateFormat: $('eset-date').value, decimal: $('eset-decimal').value,
          quoteAll: $('eset-quote').checked, bom: $('eset-bom').checked };
        if (!txt) next.delimiter = d === 'tab' ? '\t' : d;
        backdrop._close();
        S.dispatch('SET_EXPORT_PREFS', next);
      });
    }
  },

  // 1.1.0 (IE-7, plan §5a.5): Start/End month (MonthPicker), All time and
  // Include planned payments. show({ draft, data:{from,to}, onSave(draft) }).
  ExportPeriodSheet: {
    show(options) {
      const o = options || {};
      const t = (k) => window.I18n.t(k);
      const V = window.Views;
      const data = o.data || { from: '', to: '' };
      const d = Object.assign({ start: '', end: '', planned: true }, o.draft || {});
      const field = (id, label) => `
        <div class="form-group" style="margin-bottom: var(--space-3);">
          <label class="form-label" for="${id}">${t(label)}</label>
          <button type="button" id="${id}" class="form-control" style="text-align: left; cursor: pointer;"></button>
        </div>`;
      const backdrop = window.Components._bankSheet('export-period-sheet', `
        <h2 id="export-period-sheet-title" class="header-title" style="margin: 0 0 var(--space-4); font-size: 1.1rem;">${t('export.period')}</h2>
        ${field('eper-start', 'export.start')}
        ${field('eper-end', 'export.end')}
        <button type="button" id="eper-all" class="btn btn-secondary" style="width: auto; padding: 6px 16px; min-height: 0; margin-bottom: var(--space-4);">${t('export.allTime')}</button>
        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: var(--space-2);">
          <span class="list-item-title" id="eper-planned-label">${t('export.planned')}</span>
          <label class="toggle-switch"><input type="checkbox" id="eper-planned" aria-labelledby="eper-planned-label" ${d.planned ? 'checked' : ''}><span class="slider"></span></label>
        </div>
        <div style="font-size: var(--text-xs); color: var(--text-secondary); margin-bottom: var(--space-5);">${t('export.plannedHelp')}</div>
        <button class="btn btn-primary" id="eper-save" style="margin-bottom: var(--space-3);">${t('common.save')}</button>
        <button class="btn btn-secondary" id="eper-cancel" data-back-dismiss>${t('common.cancel')}</button>`);
      if (!backdrop) return;
      const $ = (id) => backdrop.querySelector('#' + id);
      const paint = () => {
        $('eper-start').textContent = d.start ? V._fmtMonth(d.start) : (data.from ? V._fmtMonth(data.from) + ' · ' + t('export.first') : t('export.allTime'));
        $('eper-end').textContent = d.end ? V._fmtMonth(d.end) : (data.to ? V._fmtMonth(data.to) + ' · ' + t('export.last') : t('export.allTime'));
      };
      paint();
      const pick = (key, fallback) => window.Components.MonthPicker.show({
        initialValue: d[key] || fallback || undefined,
        onSelect: (ym) => { d[key] = ym; paint(); }
      });
      $('eper-start').addEventListener('click', () => pick('start', data.from));
      $('eper-end').addEventListener('click', () => pick('end', data.to));
      $('eper-all').addEventListener('click', () => { d.start = ''; d.end = ''; paint(); });
      $('eper-cancel').addEventListener('click', () => backdrop._close());
      backdrop.addEventListener('click', (e) => { if (e.target === backdrop) backdrop._close(); });
      $('eper-save').addEventListener('click', () => {
        if (d.start && d.end && d.start > d.end) { const s = d.start; d.start = d.end; d.end = s; } // the two months in order
        d.planned = $('eper-planned').checked;
        backdrop._close();
        if (typeof o.onSave === 'function') o.onSave({ start: d.start, end: d.end, planned: d.planned });
      });
    }
  },

  BankManageModal: {
    show(options) {
      const o = options || {};
      const t = (k, p) => window.I18n.t(k, p);
      const BC = window.BankConnect;
      const state = window.Store.getState();
      const conn = BC.findConnection(state, o.ref);
      if (!conn) return;
      const kind = BC.connectionStatus(state, conn);
      const linked = (conn.accounts || []).filter(a => a.stackdAccountId).length;
      const row = (label, value) => `
        <div style="display: flex; align-items: center; justify-content: space-between; gap: var(--space-3); padding: var(--space-3) 0; border-top: 1px solid var(--border-color);">
          <div style="font-size: var(--text-sm); color: var(--text-secondary);">${label}</div>
          <div style="font-size: var(--text-sm); font-weight: 600; text-align: right;">${value}</div>
        </div>`;
      const consent = kind === 'expired'
        ? `<span style="color: var(--color-expense);">${conn.expiresAt ? t('bank.consentExpiredOn', { date: BC.formatDate(conn.expiresAt) }) : t('bank.chipExpired')}</span>`
        : (conn.expiresAt ? t('bank.consentUntil', { date: BC.formatDate(conn.expiresAt) }) : '—');
      const backdrop = window.Components._bankSheet('bank-manage-modal', `
        <div style="display: flex; align-items: center; gap: var(--space-3); margin-bottom: var(--space-3);">
          ${BC.logoHtml({ name: conn.institutionName, logo: conn.logo }, 36)}
          <h2 id="bank-manage-modal-title" class="header-title" style="margin: 0; font-size: 1.1rem;">${BC.esc(conn.institutionName)}</h2>
        </div>
        ${row(t('bank.consentLabel'), consent)}
        ${row(t('bank.historyDepth'), conn.historyLimitDays ? t('bank.daysOption', { count: conn.historyLimitDays }) : '—')}
        ${row(t('bank.accountsLabel'), BC.esc(t('bank.accountsLinked', { count: linked })))}
        ${kind === 'expired' || kind === 'expiring' ? `<p style="font-size: var(--text-xs); color: var(--text-secondary); line-height: 1.5; margin: var(--space-2) 0 0;">${t('bank.reconnectHint')}</p>` : ''}
        <div style="display: flex; flex-direction: column; gap: var(--space-3); margin-top: var(--space-4);">
          ${kind === 'expired' || kind === 'expiring' ? `<button type="button" class="btn btn-primary" id="bank-manage-reconnect">${t('bank.reconnect')}</button>` : ''}
          <button type="button" class="btn btn-secondary" id="bank-manage-link">${t('bank.linkAccounts')}</button>
          <button type="button" class="btn btn-danger" id="bank-manage-disconnect">${t('bank.disconnect')}</button>
          <button type="button" class="btn btn-secondary" id="bank-manage-close">${t('common.close')}</button>
        </div>`);
      if (!backdrop) return;
      const close = backdrop._close;
      backdrop.addEventListener('click', (e) => { if (e.target === backdrop) close(); });
      backdrop.querySelector('#bank-manage-close').addEventListener('click', close);
      backdrop.querySelector('#bank-manage-link').addEventListener('click', () => {
        close();
        window.Router.navigate('#bank-connect-map?ref=' + encodeURIComponent(conn.ref));
      });
      const rec = backdrop.querySelector('#bank-manage-reconnect');
      if (rec) rec.addEventListener('click', async () => {
        rec.disabled = true;
        try { await BC.reconnect(conn, window.Store.getState()); close(); } catch (e) { alert(t('bank.connectError')); rec.disabled = false; }
      });
      backdrop.querySelector('#bank-manage-disconnect').addEventListener('click', () => {
        close();
        // Modal.show owns #modal-container's innerHTML → this sheet is gone by then.
        setTimeout(() => {
          window.Components.Modal.show({
            title: t('bank.disconnectTitle', { bank: BC.esc(conn.institutionName) }), // 1.0.2 (BUG-24)
            content: `<p style="color: var(--text-secondary); font-size: var(--text-sm); line-height: 1.6;">${t('bank.disconnectBody')}</p>`,
            saveText: t('common.cancel'),
            showDelete: true,
            onSave: (closeModal) => closeModal(),
            onDelete: async (closeModal) => {
              try { await BC.revoke(conn.ref); } catch (e) { alert(t('bank.fetchError')); }
              closeModal();
            }
          });
        }, 320);
      });
      BC.attachLogoFallbacks(backdrop);
    }
  }
});
