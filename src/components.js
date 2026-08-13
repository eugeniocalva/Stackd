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

  BottomNav: {
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
          <a href="#dashboard" class="nav-item touch-target" data-view="dashboard" aria-label="${window.I18n.t('nav.dashboard')}">
            <div class="nav-icon"><i data-lucide="home"></i></div>
            <div class="nav-item-indicator"></div>
          </a>
          <a href="#transactions" class="nav-item touch-target" data-view="transactions" aria-label="${window.I18n.t('nav.history')}">
            <div class="nav-icon"><i data-lucide="list"></i></div>
            <div class="nav-item-indicator"></div>
          </a>
          <a href="#budget" class="nav-item touch-target" data-view="budget" aria-label="${window.I18n.t('nav.goals')}">
            <div class="nav-icon"><i data-lucide="target"></i></div>
            <div class="nav-item-indicator"></div>
          </a>
          <a href="#analytics" class="nav-item touch-target" data-view="analytics" aria-label="${window.I18n.t('nav.analytics')}">
            <div class="nav-icon"><i data-lucide="pie-chart"></i></div>
            <div class="nav-item-indicator"></div>
          </a>
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
      const { title, content, onSave, saveText = window.I18n.t('common.save'), showDelete = false, onDelete, showClose = false } = options;
      const container = document.getElementById('modal-container');
      container.innerHTML = `
        <div class="modal-backdrop" id="active-modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">
          <div class="modal-content">
            <div class="modal-handle"></div>
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
              <button class="btn btn-primary" id="modal-save-btn">${saveText}</button>
              ${showDelete ? `<button class="btn btn-danger" id="modal-delete-btn" aria-label="${window.I18n.t('modal.deleteAria')}">${window.I18n.t('common.delete')}</button>` : ''}
              <button class="btn btn-secondary" id="modal-cancel-btn" aria-label="${window.I18n.t('modal.cancelAria')}">${window.I18n.t('common.cancel')}</button>
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

      backdrop.addEventListener('touchstart', onStart, { passive: true });
      backdrop.addEventListener('touchmove', onMove, { passive: true });
      backdrop.addEventListener('touchend', onEnd);

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
      if (backdropEl) {
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
  FaqModal: {
    FAQS: [
      {
        q: 'How do I set up an account?',
        a: 'Tap the + button in the bottom bar and choose <b>Add Account</b>, or use the Add Account tile at the end of the accounts row on Home. Give it a name, an icon and an opening balance. From then on the balance is always computed from your transactions, so it stays in sync automatically.'
      },
      {
        q: 'How do I add a new transaction?',
        a: 'Tap the + button and choose <b>Add Log</b>. Pick Expense, Income or Transfer, then enter the amount, date, account and category. You can also add a note and tags, or turn on the repeat option to make it recurring (daily, weekly, monthly…).'
      },
      {
        q: 'How do I edit or delete a transaction?',
        a: 'Open <b>History</b> (the list icon in the bottom bar) and tap any transaction to open it in the editor. Change what you need and save, or use Delete. If the transaction is part of a recurring series, you will be asked whether the change should apply to only this one, this and future ones, or the whole series.'
      },
      {
        q: 'How do I set up widgets on my Home screen?',
        a: 'On Home, scroll to the <b>Widgets</b> section. Tap <b>Add</b> to pick a widget from the gallery and choose its size. Tap <b>Edit</b> to reorder, resize, configure or remove widgets, then tap Done when you are happy with the layout.'
      },
      {
        q: 'How do I set up a loan?',
        a: 'Tap the + button and choose <b>Debt</b>. Pick a loan type to open the simulator, enter the amount, interest rate and duration, and review the full payment schedule. You can keep it as a simulation or track it as an active loan — tracking links it to a recurring expense so your progress updates automatically as payments are logged.'
      },
      {
        q: 'How do I manage categories?',
        a: 'Go to <b>Others → Categories</b> to see all your categories, or tap the + button and choose <b>Add Category</b> to create one. Tap a category to see its activity, or edit its name, icon and color. Stack\'d ships with a default set you can adapt to your needs.'
      },
      {
        q: 'How do I use tags?',
        a: 'Tags are free-form labels you type in the <b>Tags</b> field when creating or editing a transaction — autocomplete suggests the ones you already use. Browse them under <b>Others → Tags</b>, or filter History by tag to see everything with that label.'
      }
    ],
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
    SECTIONS: [
      {
        title: 'Getting around',
        items: [
          { h: 'Bottom bar', d: 'Four tabs: Home, History, Goals and Analytics. Tap the tab you are already on to jump back to the top (in History, back to today).' },
          { h: 'The + button', d: 'Opens the quick actions menu: Add Log, Add Account, Debt, Add Category, and Others & Settings.' },
          { h: 'Settings', d: 'All settings live under the + button → Others & Settings, not in the bottom bar.' }
        ]
      },
      {
        title: 'Home',
        items: [
          { h: 'Total balance', d: 'Your total across all wallets, with two deltas vs the start of the month: as of today and projected end of month.' },
          { h: 'Balance chart', d: 'Tap the chart to expand it. In the expanded view, tap Filter to switch Weekly / Monthly / Quarter and choose which accounts and categories are plotted. Save View keeps those filters on the Home chart; Reset View restores the default.' },
          { h: 'Wallet cards', d: 'Tap a wallet to open History filtered to that account. Tap the ⋯ button on a card to edit the account. The last tile, Add Wallet, creates a new account.' }
        ]
      },
      {
        title: 'Accounts (wallets)',
        items: [
          { h: 'Create an account', d: 'Tap + → Add Account, the Add Wallet tile on Home, or Others → Accounts → Create New Account.' },
          { h: 'Account fields', d: 'Name, type (Bank, Debit card, Cash, Savings, Credit card, Investment, Wallet, Account), icon, color, opening balance with Positive / Negative sign and date, and a Set as Default Wallet toggle. Choosing Credit card automatically flips a new account to negative.' },
          { h: 'Balances', d: 'Balances are always computed from your transactions, so they stay in sync automatically.' },
          { h: 'Edit or delete', d: 'Open the account via the ⋯ on its wallet card or Others → Accounts. Deleting an account permanently deletes all of its transactions.' }
        ]
      },
      {
        title: 'Adding transactions',
        items: [
          { h: 'New log', d: 'Tap + → Add Log. Pick Expense, Income or Transfer, then enter the amount, account, category and date.' },
          { h: 'Category picker', d: 'Tapping the category field opens the Select Category sheet. Use + Add custom to create a new category on the spot — your form is kept while you do.' },
          { h: 'Transfers', d: 'Transfers move money between two of your accounts: pick From and To. They have no category and do not count as income or spending.' },
          { h: 'Tags', d: 'Type in the Tags field and press Enter, comma or space to add a chip. Autocomplete suggests tags you already use.' },
          { h: 'Notes and time', d: 'The note field suggests notes you have used before. A time field appears if you enable transaction time input in Others.' },
          { h: 'Recurring', d: 'Turn on the Recurrent toggle, tap the "Repeats every…" line to choose the interval (every 1–30 days, weeks, months or years) and set an End Date. All future occurrences are created ahead automatically.' }
        ]
      },
      {
        title: 'Editing transactions',
        items: [
          { h: 'Edit', d: 'Tap any transaction — in History, a category or tag page, or a widget — to open it in the editor.' },
          { h: 'Recurring scope', d: 'When you save or delete a recurring item you choose the scope: only this transaction, this and future transactions, or all transactions in the series.' },
          { h: 'Delete', d: 'Use the Delete button in the editor, or swipe the row left in History.' }
        ]
      },
      {
        title: 'History',
        items: [
          { h: 'Swipe actions', d: 'Swipe a row left for Edit and Delete. Swipe right to toggle its Paid state — unpaid rows show a marker on their left edge.' },
          { h: 'Bulk selection', d: 'Long-press a row (or tap Select) to enter selection mode, then tap rows to select them. Use Select All / Deselect All and Delete (N) to remove many at once.' },
          { h: 'Periods', d: 'Use the Day / Week / Month / Year pills and the ‹ › arrows to move through periods. Today scrolls the list back to today.' },
          { h: 'Custom range', d: 'The calendar pill opens a custom range picker with presets: Last 7 / 30 / 90 Days, 6 Months, 1 Year and All Time.' },
          { h: 'Filter & sort', d: 'The sliders pill filters by transaction type, wallet and category, and switches Newest First / Oldest First. The clear pill resets every filter.' },
          { h: 'Summary card', d: 'Shows the Start balance, End balance and Net Change for the selected period.' }
        ]
      },
      {
        title: 'Goals (budget)',
        items: [
          { h: 'Monthly limits', d: 'Goals are monthly spending (or income) limits per category. Switch between Expenses and Income, and change month with the ‹ › arrows or by tapping the month name.' },
          { h: 'Set a limit', d: 'Tap any category to set its Monthly Limit, a Start Month and an optional End Month.' },
          { h: 'Rollover', d: 'The Cumulative Rollover toggle carries unused budget into the next month; overspending deducts from it.' },
          { h: 'Progress', d: 'The donut shows Allocated, Total Spent and Remaining. Category bars turn amber at 75% and red at 90% or when over budget. Remove Budget Limit clears a limit.' }
        ]
      },
      {
        title: 'Analytics',
        items: [
          { h: 'Filters', d: 'Analytics uses the same filter bar as History: periods, custom ranges, and type / wallet / category filters.' },
          { h: 'Net balance', d: 'The hero card shows the period’s net balance and the change vs the previous period. When the period includes the future, a Today / end-of-period toggle switches between actuals and a projection that includes upcoming recurring items.' },
          { h: 'Net flow chart', d: 'Bars show income minus expenses per bucket. Tap a bar to open exactly those transactions in History.' },
          { h: 'Distribution', d: 'The donut breaks the period down by category, with an Expenses / Income toggle. Tap a legend row to open that category in History.' }
        ]
      },
      {
        title: 'Loans (debt)',
        items: [
          { h: 'Open', d: 'Tap + → Debt to reach the Loans hub.' },
          { h: 'Simulate', d: 'Pick Mortgage, Personal Loan or Installment Plan, then enter the amount (mortgages also take a Down Payment), duration, annual rate and first payment date, and tap Calculate.' },
          { h: 'Advanced options', d: 'The Details section adds constant vs declining payments, an interest-only first installment, future rate changes, early repayments (reducing the payment or the duration), and extra costs such as insurance.' },
          { h: 'Results', d: 'See the monthly payment, total interest, totals and the full payment schedule in Brief or Detailed form.' },
          { h: 'Save or track', d: 'Save Simulation keeps it for later; Add to My Loans turns it into a real loan with paid / remaining progress.' },
          { h: 'Track the payment', d: 'Tracking adds the installment as a monthly recurring expense (category Loan Payment), so progress and the next payment update automatically as payments are logged.' },
          { h: 'Manage', d: 'Tap a saved simulation or loan to reopen it, then use the ⋯ menu to Edit, Add to My Loans, or Delete.' }
        ]
      },
      {
        title: 'Categories',
        items: [
          { h: 'Manage', d: 'Others → Categories lists them grouped by Income, Expense and All Types. Create one with + → Add Category, the + button on the Categories screen, or + Add custom inside the transaction form.' },
          { h: 'Category fields', d: 'Name, type (Expense, Income or Both) and icon.' },
          { h: 'Detail and edit', d: 'Tap a category to see all its transactions; tap its ⋮ button to edit it.' },
          { h: 'Deleting', d: 'A category that still has transactions cannot be deleted.' }
        ]
      },
      {
        title: 'Tags',
        items: [
          { h: 'Add tags', d: 'Tags are free-form labels typed in the transaction form. They are created on the fly — no setup needed.' },
          { h: 'Browse', d: 'Others → Tags lists every tag in use; tap one to see its transactions.' },
          { h: 'Lifecycle', d: 'A tag disappears automatically once no transaction uses it anymore.' }
        ]
      },
      {
        title: 'Home widgets',
        items: [
          { h: 'Add a widget', d: 'On Home, tap Add in the Widgets section, pick from the gallery, preview it with your real data, choose Small or Wide, and configure it if it has options.' },
          { h: 'Widget types', d: 'Latest transactions, Income vs Expenses, Categories, Net worth, Personal savings, Upcoming transactions, Budget goals, and the 50/30/20 budget.' },
          { h: 'Edit mode', d: 'Tap Edit to rearrange: remove with the − button, reorder with the up / down arrows, resize with the Small / Wide pill, configure with the gear, then tap Done.' },
          { h: 'Shortcuts', d: 'Outside edit mode, tapping a widget jumps to its related page — History, Goals or Analytics.' },
          { h: 'Options', d: 'Most widgets can be limited to specific accounts; Categories and Budget goals can pick categories; Upcoming has a 7 / 30 / 60 day horizon; the 50/30/20 widget takes a planned monthly income and a custom split, and simply shows how that income divides.' }
        ]
      },
      {
        title: 'Others & settings',
        items: [
          { h: 'Manage', d: 'Shortcuts to your Accounts, Categories and Tags.' },
          { h: 'Region', d: 'Choose the currency (USD, EUR, JPY, GBP, CNY) and language.' },
          { h: 'Preferences', d: 'History sort order (newest or oldest first), the transaction time input toggle, and the theme: Light, Dark or System Default.' },
          { h: 'Export', d: 'Export Accounts, Categories, Transactions and Loans as CSV files for any spreadsheet app.' },
          { h: 'Import', d: 'Import CSV accepts files with the columns Date, Amount, Type, Account, Category, Note. Missing accounts and categories are created automatically, and a loans export is recognised on its own.' },
          { h: 'Factory reset', d: 'The Danger Zone erases every account, budget and transaction permanently. This cannot be undone.' },
          { h: 'Privacy', d: 'All data lives only on this device — there are no accounts, no cloud and no tracking.' }
        ]
      }
    ],

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

  // v0.76: Terms & Conditions sheet (Others → Support → Terms and Conditions).
  // Two parts — Terms of Use and Privacy Policy — written for the app's
  // local-only storage model (no servers, no data collection), with the
  // GDPR data-subject rights mapped to in-app features. Static trusted
  // content; reuses the #active-modal id so Modal.hide() owns the teardown.
  TermsModal: {
    UPDATED: 'August 10, 2026',

    show() {
      const clause = (title, body) => `
        <div style="margin-bottom: var(--space-4);">
          <div style="font-weight: 600; font-size: var(--text-sm); color: var(--text-primary); margin-bottom: 2px;">${title}</div>
          <div style="font-size: var(--text-sm); color: var(--text-secondary); line-height: 1.6;">${body}</div>
        </div>`;
      const part = (title) => `<div class="section-title" style="margin: var(--space-5) 0 var(--space-3);">${title}</div>`;

      const container = document.getElementById('modal-container');
      container.innerHTML = `
        <div class="modal-backdrop" id="active-modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">
          <div class="modal-content" style="display: flex; flex-direction: column; height: calc(90vh - var(--safe-top));">
            <div class="modal-handle"></div>
            <div class="modal-header-container">
              <h2 id="modal-title" class="header-title" style="margin-bottom: 0; font-size: var(--text-2xl);">${window.I18n.t('support.termsTitle')}</h2>
            </div>
            <div style="font-size: var(--text-xs); color: var(--text-tertiary); margin-bottom: var(--space-2); flex-shrink: 0;">Last updated: ${this.UPDATED}</div>
            <div class="modal-body">
              <div style="font-size: var(--text-sm); color: var(--text-secondary); line-height: 1.6;">
                Stack'd is a privacy-first personal finance tracker. Everything you record stays on your device —
                the app has no servers, no user accounts and no data collection. These conditions are in two parts:
                the <b>Terms of Use</b>, which govern your use of the app, and the <b>Privacy Policy</b>, which
                explains how your data is (and is not) handled.
              </div>

              ${part('Part 1 — Terms of Use')}
              ${clause('1. Acceptance', `By installing or using Stack'd you agree to these Terms of Use. If you do not agree, please do not use the app.`)}
              ${clause('2. License', `You are granted a personal, non-transferable, non-exclusive license to use Stack'd for your own personal, non-commercial finance tracking.`)}
              ${clause('3. Not financial advice', `Stack'd is an organizational tool. Balances, projections, budgets and loan simulations are informational estimates only and may differ from the figures of your bank or lender. Nothing in the app constitutes financial, investment, tax or legal advice — always verify important figures with your financial institution or a qualified advisor before acting on them.`)}
              ${clause('4. Your data, your responsibility', `All data lives only on this device. You are responsible for keeping backups — use the CSV export in Others &amp; Settings. Uninstalling the app, clearing your browser's site data, or using Factory Reset permanently deletes all data, and no one (including the developer) can recover it.`)}
              ${clause('5. No warranty', `Stack'd is provided &ldquo;as is&rdquo; and &ldquo;as available&rdquo;, without warranties of any kind, express or implied, including accuracy of calculations, fitness for a particular purpose, or uninterrupted availability.`)}
              ${clause('6. Limitation of liability', `To the maximum extent permitted by applicable law, the developer shall not be liable for any loss or damage — including financial loss or loss of data — arising from your use of, or inability to use, the app.`)}
              ${clause('7. Changes to these terms', `These terms may be updated together with app updates. The &ldquo;Last updated&rdquo; date above reflects the current version; continued use of the app after an update constitutes acceptance of the revised terms.`)}

              ${part('Part 2 — Privacy Policy')}
              ${clause('1. The short version', `Stack'd does not collect, transmit, sell or share any personal data. There is nothing to opt out of, because nothing ever leaves your device.`)}
              ${clause('2. What is stored, and where', `Your accounts, transactions, budgets, loans, tags and settings are stored exclusively in your device's local storage. They are never sent to a server — the app works fully offline and has no backend.`)}
              ${clause('3. What the app does not do', `No user accounts or registration. No cloud sync. No analytics or usage tracking. No advertising or ad identifiers. No third-party data sharing. No cookies beyond the local storage the app needs to function.`)}
              ${clause('4. GDPR position', `Under the EU General Data Protection Regulation (Regulation (EU) 2016/679), the developer does not process your personal data: all processing happens locally, under your sole control, on your own device. For the data you record in Stack'd, no controller&ndash;processor relationship with the developer arises, no data is transferred (within or outside the EU/EEA), and no consent banner is required because there is nothing to consent to.`)}
              ${clause('5. Your rights, built in', `The GDPR data-subject rights are satisfied directly in the app: <b>access &amp; portability</b> (Art. 15 &amp; 20) — export everything as CSV from Others &amp; Settings; <b>rectification</b> (Art. 16) — edit any record at any time; <b>erasure</b> (Art. 17) — delete individual records or erase everything with Factory Reset. No request to the developer is needed for any of these.`)}
              ${clause('6. Security', `Because your data lives on your device, it is exactly as secure as the device itself. We recommend protecting your device with a screen lock, keeping its system updated, and storing CSV backups in a safe place. Anyone with unrestricted access to your unlocked device can view your data.`)}
              ${clause('7. Children', `Stack'd collects no data from anyone, including children. The app has no age-gated features and no way to identify its users.`)}
              ${clause('8. Contact', `If you email feedback to hi@stackd.com, your email address and message are used only to respond to you and are never added to any marketing list. Data-protection questions can be sent to the same address.`)}
              ${clause('9. Changes to this policy', `If a future version of the app ever changes how data is handled (for example, an optional cloud backup), this policy will be updated first and the change will be clearly announced in the app before anything leaves your device.`)}
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
            ${filtered.map(i => `<button class="icon-btn touch-target" data-icon="${i}" aria-label="Select icon ${i}" aria-pressed="false" style="width: 40px; height: 40px; border-radius: 50%; background: var(--bg-surface-sunken); border: none; cursor: pointer; display: flex; align-items: center; justify-content: center; color: var(--text-primary); transition: all 0.2s ease;">
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
              <h3 id="ip-title" style="margin: 0; font-size: 1.25rem; font-family: var(--font-family-display); font-weight: 800;">Select Icon</h3>
              <div style="display: flex; width: 100%; gap: var(--space-3);">
                <button class="btn btn-secondary" id="ip-cancel" style="flex: 1; padding: 8px 16px; min-height: 40px;" aria-label="${window.I18n.t('picker.cancelAria')}">${window.I18n.t('common.cancel')}</button>
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
        <div class="card card-elevated account-card touch-target" data-id="${account.id}" style="cursor: pointer; padding: var(--space-5); width: 100%; justify-content: space-between;" tabindex="0" role="button" aria-label="View account ${account.name}">
          <div style="display: flex; justify-content: space-between; align-items: flex-start;">
            <div>
              <p style="font-size: var(--text-sm); font-family: var(--font-family-body); color: var(--text-secondary); margin-bottom: var(--space-2);">${account.name}</p>
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
      if (transaction.transferRef) {
        amountClass = 'text-transfer';
      } else if (isOpeningBalance) {
        amountClass = transaction.amount < 0 ? 'text-expense' : 'text-balance';
      } else if (sign === '+') {
        amountClass = 'text-income';
      } else {
        amountClass = 'text-expense';
      }

      const formattedAmount = sign + window.Store.formatCurrency(Math.abs(transaction.amount));
      const dateStr = new Date(transaction.date).toLocaleDateString(window.Store.getLocale(), { month: 'short', day: 'numeric' });
      
      const isSelectionMode = options && options.isSelectionMode === true;
      const isSelected = options && options.isSelected === true;

      const checkboxHtml = isSelectionMode ? `
        <div class="custom-selection-checkbox tx-select-checkbox ${isSelected ? 'checked' : ''}" data-id="${transaction.id}">
          ${isSelected ? `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>` : ''}
        </div>
      ` : '';

      const selectedClass = isSelected ? 'list-item-selected' : '';
      const selectedBgStyle = isSelected ? 'background-color: var(--bg-surface-sunken); border-width: 2px; border-style: solid;' : '';

      // v0.82: paid is the default and shows NOTHING (the green chip is gone);
      // the amber left-edge bar is the single indicator, only when unpaid.
      const isUnpaid = transaction.isPaid === false;

      const unpaidBarHtml = isUnpaid ? `<div class="unpaid-edge-bar"></div>` : '';

      // v0.63: Tags render inline on line 2 (after account name) so tile height stays uniform
      const TAG_PILL_STYLE = 'flex-shrink: 0; font-size: 0.7rem; color: var(--text-secondary); background: var(--bg-surface-sunken); padding: 2px 8px; border-radius: 12px; font-weight: 600;';

      const innerContent = `
        ${unpaidBarHtml}
        ${checkboxHtml}
        <div class="list-item-icon">
          <i data-lucide="${category ? category.icon : 'receipt'}"></i>
        </div>
        <div class="list-item-content">
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <div class="list-item-title" style="display: flex; align-items: center; gap: 6px;">
              <span>${category ? category.name : (transaction.transferRef ? window.I18n.t('common.transfer') : window.I18n.t('common.unknown'))}</span>
            </div>
            <div class="list-item-value ${amountClass}">${formattedAmount}</div>
          </div>
          <div style="display: flex; justify-content: space-between; align-items: center; gap: 8px; margin-top: 4px;">
            <div style="display: flex; align-items: center; gap: 6px; min-width: 0; flex: 1;">
              <div class="list-item-subtitle" style="flex-shrink: 0;">${accountData ? accountData.name : window.I18n.t('common.account')}</div>
              ${transaction.tags && transaction.tags.length > 0 ? `
              <div class="tx-tags-inline" style="display: flex; align-items: center; gap: 4px; overflow: hidden; min-width: 0; flex: 1;">
                ${transaction.tags.map(tag => `
                  <span class="tx-tag-pill" style="${TAG_PILL_STYLE}">#${tag}</span>
                `).join('')}
                <span class="tx-tag-more" style="display: none; ${TAG_PILL_STYLE}"></span>
              </div>` : ''}
            </div>
            <div class="list-item-subtitle" style="flex-shrink: 0;">${dateStr}</div>
          </div>
        </div>`;

      // v0.62: Complete branch isolation
      if (!allowSwipe || isSelectionMode) {
        return `
          <div class="list-item touch-target ${isFlush ? 'list-item-flush' : ''} ${selectedClass}" data-id="${transaction.id}" style="cursor: pointer; width: 100%; ${selectedBgStyle}" tabindex="0" role="button" aria-label="${window.I18n.t('tx.itemAria', { amount: formattedAmount })}">
            ${innerContent}
          </div>`;
      }

      return `
        <div class="swipe-container" data-id="${transaction.id}">
          <div class="swipe-actions left">
            <button class="swipe-action-btn paid ${isUnpaid ? 'is-unpaid' : ''}" data-id="${transaction.id}" aria-label="${isUnpaid ? window.I18n.t('tx.markPaid') : window.I18n.t('tx.markUnpaid')}">
              <i data-lucide="check" style="width: 20px; height: 20px;"></i>
            </button>
          </div>
          <div class="swipe-actions right">
            <button class="swipe-action-btn edit" data-id="${transaction.id}" aria-label="${window.I18n.t('tx.editAria')}">
              <i data-lucide="edit-2" style="width: 20px; height: 20px;"></i>
            </button>
            <button class="swipe-action-btn delete" data-id="${transaction.id}" aria-label="${window.I18n.t('tx.deleteAria')}">
              <i data-lucide="trash-2" style="width: 20px; height: 20px;"></i>
            </button>
          </div>
          <div class="list-item touch-target swipe-content ${isFlush ? 'list-item-flush' : ''} ${selectedClass}" data-id="${transaction.id}" style="cursor: pointer; width: 100%; ${selectedBgStyle}" tabindex="0" role="button" aria-label="${window.I18n.t('tx.itemAria', { amount: formattedAmount })}">
            ${innerContent}
          </div>
        </div>`;
    },

    // v0.63: Pills that don't fit on line 2 collapse into a "+N" counter.
    // Must run after the tiles are in the DOM (called from the main.js render loop).
    applyTagOverflow(root) {
      (root || document).querySelectorAll('.tx-tags-inline').forEach(container => {
        const pills = Array.from(container.querySelectorAll('.tx-tag-pill'));
        const more = container.querySelector('.tx-tag-more');
        if (pills.length === 0 || !more || container.clientWidth === 0) return;
        pills.forEach(p => { p.style.display = ''; });
        more.style.display = 'none';
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

  AdvancedFilterBar: {
    render(pageKey, filters) {
      const { type, value } = filters.period;
      const types = [
        { id: 'today', label: window.I18n.t('filter.day') },
        { id: 'week', label: window.I18n.t('filter.week') },
        { id: 'month', label: window.I18n.t('filter.month') },
        { id: 'year', label: window.I18n.t('filter.year') }
      ];
      
      const hasCustomRange = type === 'custom';
      const hasActiveCategoryAccountFilters = (filters.types && filters.types.length > 0) || 
                                             (filters.accounts && filters.accounts.length > 0) || 
                                             (filters.categories && filters.categories.length > 0) ||
                                             (filters.tags && filters.tags.length > 0);
      const isNonDefaultPeriod = type !== 'month' || hasCustomRange;
      const hasAnyFilter = hasActiveCategoryAccountFilters || isNonDefaultPeriod;

      // Check if "Next" should be disabled (don't allow future navigation for period types)
      const now = new Date();
      const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
      const bounds = window.Store._getPeriodBounds(type, value);
      const maxTxDate = window.Store.getMaxTransactionDate();
      const isFuture = !hasCustomRange && (bounds.end >= todayStr) && (!maxTxDate || bounds.end >= maxTxDate);

      return `
        <div class="filter-bar-wrapper">
          <div class="filter-bar-scrollable">
            <!-- Navigation controls -->
            <button class="filter-pill filter-pill-icon" id="btn-prev-${pageKey}" data-page="${pageKey}" ${hasCustomRange ? 'disabled style="opacity:0.3"' : ''} aria-label="${window.I18n.t('filter.prevPeriod')}">
              <i data-lucide="chevron-left" style="width: 18px; height: 18px;"></i>
            </button>
            <button class="filter-pill" id="btn-today-${pageKey}" data-page="${pageKey}" ${hasCustomRange && pageKey !== 'history' ? 'disabled style="opacity:0.3"' : ''}>
              ${window.I18n.t('filter.today')}
            </button>
            <button class="filter-pill filter-pill-icon" id="btn-next-${pageKey}" data-page="${pageKey}" ${isFuture || hasCustomRange ? 'disabled style="opacity:0.3"' : ''} aria-label="${window.I18n.t('filter.nextPeriod')}">
              <i data-lucide="chevron-right" style="width: 18px; height: 18px;"></i>
            </button>

            <div style="width: 1px; height: 24px; background: var(--border-color); margin: auto 4px; flex-shrink: 0;"></div>

            <button class="filter-pill filter-pill-icon ${hasAnyFilter ? 'active' : ''}" 
                    id="btn-clear-${pageKey}" data-page="${pageKey}" 
                    aria-label="${window.I18n.t('filter.clearAll')}" title="${window.I18n.t('filter.clearAll')}"
                    ${!hasAnyFilter ? 'disabled style="opacity:0.3; cursor:not-allowed;"' : ''}>
              <i data-lucide="filter-x" style="width: 18px; height: 18px;"></i>
            </button>

            ${types.map(t => `
              <button class="filter-pill ${t.id === type ? 'active' : ''}" 
                      data-type="${t.id}" data-page="${pageKey}">
                ${t.label}
              </button>
            `).join('')}
            
            <button class="filter-pill filter-pill-icon ${hasCustomRange ? 'active' : ''}" 
                    id="btn-calendar-${pageKey}" data-page="${pageKey}" aria-label="${window.I18n.t('filter.calendarRange')}">
              <i data-lucide="calendar" style="width: 18px; height: 18px;"></i>
            </button>
            
            <button class="filter-pill filter-pill-icon ${hasActiveCategoryAccountFilters ? 'active' : ''}" 
                    id="btn-filter-${pageKey}" data-page="${pageKey}" aria-label="${window.I18n.t('filter.filterAndSort')}">
              <i data-lucide="sliders-horizontal" style="width: 18px; height: 18px;"></i>
            </button>
          </div>
        </div>
      `;
    },
    attachEvents(container, pageKey) {
      // Clear All Filters
      const btnClear = container.querySelector(`#btn-clear-${pageKey}`);
      if (btnClear) {
        btnClear.addEventListener('click', () => {
          window.Store.dispatch('CLEAR_ALL_FILTERS', { page: pageKey });
        });
      }

      // Period Type Selection
      container.querySelectorAll(`.filter-pill[data-type][data-page="${pageKey}"]`).forEach(btn => {
        btn.addEventListener('click', () => {
          const type = btn.dataset.type;
          const fmt = (dt) => `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
          window.Store.dispatch('UPDATE_FILTERS', { 
            page: pageKey, 
            filters: { period: { type, value: fmt(new Date()), start: '', end: '' } } 
          });
        });
      });

      // Navigation
      const btnPrev = container.querySelector(`#btn-prev-${pageKey}`);
      const btnNext = container.querySelector(`#btn-next-${pageKey}`);
      const btnToday = container.querySelector(`#btn-today-${pageKey}`);

      if (btnPrev) btnPrev.addEventListener('click', () => window.Store.dispatch('NAVIGATE_PERIOD', { offset: -1, page: pageKey }));
      if (btnNext) btnNext.addEventListener('click', () => window.Store.dispatch('NAVIGATE_PERIOD', { offset: 1, page: pageKey }));
      if (btnToday) btnToday.addEventListener('click', () => {
        if (pageKey === 'history') {
          window.Views.TransactionsView.scrollToToday(container);
        } else {
          const fmt = (dt) => `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
          window.Store.dispatch('UPDATE_FILTERS', { 
              page: pageKey, 
              filters: { period: { type: 'today', value: fmt(new Date()), start: '', end: '' } } 
          });
        }
      });

      const btnCal = container.querySelector(`#btn-calendar-${pageKey}`);
      if (btnCal) {
        btnCal.addEventListener('click', () => {
          window.Components.CustomRangeModal.show(pageKey);
        });
      }

      const btnFilter = container.querySelector(`#btn-filter-${pageKey}`);
      if (btnFilter) {
        btnFilter.addEventListener('click', () => {
          window.Components.FilterModal.show(pageKey);
        });
      }
      
      window.StackdHydrateIcons();
    }
  },

  CustomRangeModal: {
    show(pageKey) {
      const filters = pageKey === 'history' ? window.Store.state.historyFilters : window.Store.state.analyticsFilters;
      let { start, end } = filters.period;
      
      const now = new Date();
      const todayStr = now.toISOString().split('T')[0];
      if (!start) start = todayStr;
      if (!end) end = todayStr;

      const container = document.getElementById('modal-container');
      const div = document.createElement('div');
      div.className = 'modal-backdrop';
      div.id = 'custom-range-modal';
      
      div.innerHTML = `
        <div class="modal-content" style="padding: 0; display: flex; flex-direction: column;">
          <div class="modal-top-bar">
            <button class="modal-btn-top modal-btn-close" id="crm-close">${window.I18n.t('common.cancel')}</button>
            <h3 style="font-weight: 800; font-size: 1rem;">${window.I18n.t('range.title')}</h3>
            <button class="modal-btn-top" id="crm-apply">${window.I18n.t('range.apply')}</button>
          </div>
          
          <div class="modal-body" style="padding-bottom: 20px;">
            <div style="padding: var(--space-4);">
              <div class="filter-group-title" style="margin-top: 0;">${window.I18n.t('range.quickPresets')}</div>
              <div class="multi-select-row">
                <button class="multi-select-chip" data-days="7">${window.I18n.t('range.lastDays', { count: 7 })}</button>
                <button class="multi-select-chip" data-days="30">${window.I18n.t('range.lastDays', { count: 30 })}</button>
                <button class="multi-select-chip" data-days="90">${window.I18n.t('range.lastDays', { count: 90 })}</button>
                <button class="multi-select-chip" data-months="6">${window.I18n.t('range.months', { count: 6 })}</button>
                <button class="multi-select-chip" data-years="1">${window.I18n.t('range.years', { count: 1 })}</button>
                <button class="multi-select-chip" data-type="all">${window.I18n.t('range.allTime')}</button>
              </div>
            </div>

            <div id="calendar-container-start"></div>
            <div id="calendar-container-end" style="margin-top: var(--space-6);"></div>
          </div>
          
          <div style="padding: var(--space-5); background: var(--bg-surface-sunken); border-top: 1px solid var(--color-border); text-align: center;">
            <div style="font-size: var(--text-xs); color: var(--text-secondary); text-transform: uppercase; font-weight: 700; margin-bottom: 4px;">${window.I18n.t('range.summary')}</div>
            <div id="crm-range-summary" style="font-weight: 700; font-size: 0.95rem; color: var(--text-primary);">
              ${window.I18n.t('range.pickDates')}
            </div>
          </div>
        </div>
      `;
      container.appendChild(div);

      let currentStart = start;
      let currentEnd = end;

      const updateSummary = () => {
        const summary = document.getElementById('crm-range-summary');
        if (!currentStart || !currentEnd) {
          summary.innerText = window.I18n.t('range.pickDates');
          return;
        }
        const s = new Date(currentStart);
        const e = new Date(currentEnd);
        const diff = Math.ceil((e - s) / (1000 * 60 * 60 * 24)) + 1;
        const fmt = (d) => new Date(d).toLocaleDateString(window.Store.getLocale(), { month: 'short', day: 'numeric', year: 'numeric' });
        summary.innerHTML = `${fmt(currentStart)} - ${fmt(currentEnd)} <span style="color: var(--color-primary); margin-left: 8px;">${window.I18n.t('range.dayCount', { count: diff })}</span>`;
      };

      const renderCalendars = () => {
        const startTarget = document.getElementById('calendar-container-start');
        const endTarget = document.getElementById('calendar-container-end');
        
        const startMonth = currentStart ? new Date(currentStart) : new Date();
        const endMonth = currentEnd ? new Date(currentEnd) : new Date();

        const monthsStr = window.I18n.monthNames('long');

        const navHeader = (title, target, dt) => `
          <div class="calendar-nav-header">
            <button class="btn-month-nav" data-target="${target}" data-offset="-1">
              <i data-lucide="chevron-left" style="width: 18px; height: 18px;"></i>
            </button>
            <div class="calendar-nav-title">${monthsStr[dt.getMonth()]} ${dt.getFullYear()}</div>
            <button class="btn-month-nav" data-target="${target}" data-offset="1">
              <i data-lucide="chevron-right" style="width: 18px; height: 18px;"></i>
            </button>
          </div>
        `;

        startTarget.innerHTML = navHeader(window.I18n.t('range.startDate'), 'start', startMonth) + this._renderCalendar(startMonth, currentStart, currentStart, currentEnd);
        endTarget.innerHTML = navHeader(window.I18n.t('range.endDate'), 'end', endMonth) + this._renderCalendar(endMonth, currentEnd, currentStart, currentEnd);
        
        // Attach day clicks
        startTarget.querySelectorAll('.calendar-day:not(.empty)').forEach(d => {
          d.onclick = () => { currentStart = d.dataset.date; renderCalendars(); updateSummary(); };
        });
        endTarget.querySelectorAll('.calendar-day:not(.empty)').forEach(d => {
          d.onclick = () => { currentEnd = d.dataset.date; renderCalendars(); updateSummary(); };
        });
        
        window.StackdHydrateIcons();
      };

      const close = () => {
        div.classList.remove('open');
        setTimeout(() => div.remove(), 300);
      };

      document.getElementById('crm-close').onclick = close;
      document.getElementById('crm-apply').onclick = () => {
        window.Store.dispatch('UPDATE_FILTERS', {
          page: pageKey,
          filters: { period: { type: 'custom', start: currentStart, end: currentEnd, value: '' } }
        });
        close();
      };

      // Preset clicks
      div.querySelectorAll('.multi-select-chip[data-days], .multi-select-chip[data-months], .multi-select-chip[data-years], .multi-select-chip[data-type="all"]').forEach(btn => {
        btn.onclick = () => {
          const now = new Date();
          const fmt = (dt) => dt.toISOString().split('T')[0];
          currentEnd = fmt(now);
          if (btn.dataset.days) {
            const d = new Date(); d.setDate(d.getDate() - parseInt(btn.dataset.days));
            currentStart = fmt(d);
          } else if (btn.dataset.months) {
            const d = new Date(); d.setMonth(d.getMonth() - parseInt(btn.dataset.months));
            currentStart = fmt(d);
          } else if (btn.dataset.years) {
            const d = new Date(); d.setFullYear(d.getFullYear() - parseInt(btn.dataset.years));
            currentStart = fmt(d);
          } else if (btn.dataset.type === 'all') {
            currentStart = '2000-01-01';
          }
          renderCalendars();
          updateSummary();
        };
      });

      // Month navigation
      div.querySelectorAll('.btn-month-nav').forEach(btn => {
        btn.onclick = () => {
          const target = btn.dataset.target; // 'start' or 'end'
          const offset = parseInt(btn.dataset.offset);
          if (target === 'start') {
            const d = new Date(currentStart);
            d.setMonth(d.getMonth() + offset);
            currentStart = d.toISOString().split('T')[0];
          } else {
            const d = new Date(currentEnd);
            d.setMonth(d.getMonth() + offset);
            currentEnd = d.toISOString().split('T')[0];
          }
          renderCalendars();
        };
      });

      updateSummary();
      renderCalendars();
      setTimeout(() => div.classList.add('open'), 10);
    },

    _renderCalendar(monthCenter, activeDay, rangeStart, rangeEnd) {
      const year = monthCenter.getFullYear();
      const month = monthCenter.getMonth();
      const firstDay = new Date(year, month, 1).getDay();
      const daysInMonth = new Date(year, month + 1, 0).getDate();
      
      const startIdx = (firstDay === 0 ? 6 : firstDay - 1); // Start with Mon=0
      const days = [];
      for (let i = 0; i < startIdx; i++) days.push(null);
      for (let i = 1; i <= daysInMonth; i++) days.push(i);

      const monthsStr = window.I18n.monthNames('long');
      const weekdays = window.I18n.weekdayInitials();
      
      const now = new Date();
      const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

      return `
        <div class="calendar-container">
          <div class="calendar-grid">
            ${weekdays.map(w => `<div class="calendar-weekday">${w}</div>`).join('')}
            ${days.map(d => {
              if (d === null) return `<div class="calendar-day empty"></div>`;
              const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
              const isSelected = dateStr === activeDay;
              const isInRange = rangeStart && rangeEnd && dateStr >= rangeStart && dateStr <= rangeEnd;
              const isStart = dateStr === rangeStart;
              const isEnd = dateStr === rangeEnd;
              const isToday = dateStr === todayStr;
              
              const classes = ['calendar-day'];
              if (isSelected) classes.push('selected');
              if (isInRange) classes.push('in-range');
              if (isInRange && isStart) classes.push('range-start');
              if (isInRange && isEnd) classes.push('range-end');
              if (isToday) classes.push('is-today');
              
              return `<div class="${classes.join(' ')}" data-date="${dateStr}">${d}</div>`;
            }).join('')}
          </div>
        </div>
      `;
    }
  },

  FilterModal: {
    show(pageKey) {
      const filters = pageKey === 'history' ? window.Store.state.historyFilters : window.Store.state.analyticsFilters;
      const accounts = window.Store.state.accounts;
      const categories = window.Store.state.categories;
      const esc = (v) => String(v == null ? '' : v)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

      let currentFilters = JSON.parse(JSON.stringify(filters));

      const container = document.getElementById('modal-container');
      const div = document.createElement('div');
      div.className = 'modal-backdrop';
      div.id = 'filter-advanced-modal';
      
      const renderContent = () => {
        div.innerHTML = `
          <div class="modal-content" style="padding: 0; display: flex; flex-direction: column;">
            <div class="modal-top-bar">
              <button class="modal-btn-top modal-btn-close" id="afm-close">${window.I18n.t('common.cancel')}</button>
              <h3 style="font-weight: 800; font-size: 1rem;">${window.I18n.t('filter.filterAndSort')}</h3>
              <button class="modal-btn-top" id="afm-apply">${window.I18n.t('range.apply')}</button>
            </div>
            
            <div class="modal-body" style="padding: var(--space-4) var(--space-5) 40px;">
              <div style="margin-bottom: var(--space-6); display: flex; justify-content: flex-end;">
                <button id="afm-show-all" style="background: var(--bg-surface-sunken); border: none; padding: 6px 14px; border-radius: 20px; font-size: 0.75rem; font-weight: 800; color: var(--color-primary); cursor: pointer; text-transform: uppercase; letter-spacing: 0.05em; transition: all 0.2s ease;">${window.I18n.t('filterModal.showAll')}</button>
              </div>

              <div class="filter-group-title" style="margin-top: 0;">${window.I18n.t('filterModal.sortOrder')}</div>
              <div class="multi-select-row">
                <button class="multi-select-chip ${currentFilters.sortOrder === 'desc' ? 'active' : ''}" data-sort="desc">${window.I18n.t('history.newestFirst')}</button>
                <button class="multi-select-chip ${currentFilters.sortOrder === 'asc' ? 'active' : ''}" data-sort="asc">${window.I18n.t('history.oldestFirst')}</button>
              </div>

              <div class="filter-group-title">${window.I18n.t('filterModal.txType')}</div>
              <div class="multi-select-row">
                <button class="multi-select-chip ${currentFilters.types.includes('income') ? 'active' : ''}" data-type="income">${window.I18n.t('form.income')}</button>
                <button class="multi-select-chip ${currentFilters.types.includes('expense') ? 'active' : ''}" data-type="expense">${window.I18n.t('form.expense')}</button>
              </div>

              <div class="filter-group-title">${window.I18n.t('dash.wallets')}</div>
              <div class="multi-select-row">
                ${accounts.map(acc => `
                  <button class="multi-select-chip ${currentFilters.accounts.includes(acc.id) ? 'active' : ''}" data-acc="${acc.id}">
                    ${acc.name}
                  </button>
                `).join('')}
              </div>

              <div class="filter-group-title">${window.I18n.t('others.categories')}</div>
              <div class="multi-select-row">
                ${categories.map(cat => `
                  <button class="multi-select-chip ${currentFilters.categories.includes(cat.id) ? 'active' : ''}" data-cat="${cat.id}">
                    ${cat.name}
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
        
        div.querySelector('#afm-show-all').onclick = () => {
          // History defaults to Oldest First; analytics defaults to Newest First
          currentFilters.sortOrder = pageKey === 'history' ? 'asc' : 'desc';
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
        window.Store.dispatch('UPDATE_FILTERS', {
          page: pageKey,
          filters: currentFilters
        });
        close();
      };

      const close = () => {
        div.classList.remove('open');
        setTimeout(() => div.remove(), 300);
      };

      renderContent();
      container.appendChild(div);
      requestAnimationFrame(() => div.classList.add('open'));
    }
  },

  PeriodPicker: {
    show(options) {
      const { type, initialValue, onSelect } = options;
      const container = document.getElementById('modal-container');
      
      const now = new Date();
      let initYear = now.getFullYear();
      let initMonth = now.getMonth();
      let initDay = now.getDate();
      
      if (initialValue && initialValue.includes('-')) {
        const parts = initialValue.split('-');
        initYear = parseInt(parts[0], 10);
        if (parts.length > 1) initMonth = parseInt(parts[1], 10) - 1;
        if (parts.length > 2) initDay = parseInt(parts[2], 10);
      }
      
      const years = [];
      for (let i = initYear - 10; i <= initYear + 5; i++) years.push(i);
      
      const monthsStr = window.I18n.monthNames('short');
      
      let columnsHtml = '';
      if (type === 'year') {
        columnsHtml = `
          <div id="pp-col-year" style="flex: 1; overflow-y: scroll; scroll-snap-type: y mandatory; padding: 80px 0; scrollbar-width: none; text-align: center;">
            ${years.map((y, i) => `<div class="pp-item" data-val="${i}" style="height: 40px; line-height: 40px; scroll-snap-align: center; font-size: 1.2rem; font-family: var(--font-family-display); font-weight: 500;">${y}</div>`).join('')}
          </div>
        `;
      } else if (type === 'month' || type === 'week' || type === 'today') {
        const showDay = type === 'today'; // Today mode allows picking a specific day
        columnsHtml = `
          <div id="pp-col-month" style="flex: 1; overflow-y: scroll; scroll-snap-type: y mandatory; padding: 80px 0; scrollbar-width: none; text-align: center;">
            ${monthsStr.map((m, i) => `<div class="pp-item" data-val="${i}" style="height: 40px; line-height: 40px; scroll-snap-align: center; font-size: 1.2rem; font-family: var(--font-family-display); font-weight: 500;">${m}</div>`).join('')}
          </div>
          <div id="pp-col-year" style="flex: 1; overflow-y: scroll; scroll-snap-type: y mandatory; padding: 80px 0; scrollbar-width: none; text-align: center;">
            ${years.map((y, i) => `<div class="pp-item" data-val="${i}" style="height: 40px; line-height: 40px; scroll-snap-align: center; font-size: 1.2rem; font-family: var(--font-family-display); font-weight: 500;">${y}</div>`).join('')}
          </div>
        `;
        // For Week/Today maybe we wanted a full calendar, but for now Year/Month picker is the "jump" mechanism.
      }

      const div = document.createElement('div');
      div.innerHTML = `
        <div class="modal-backdrop" id="active-period-picker" style="z-index: 10000;" role="dialog" aria-modal="true" aria-labelledby="pp-title">
          <div class="modal-content" style="padding: 0; overflow: hidden; display: flex; flex-direction: column;">
            <div style="padding: 16px; border-bottom: 1px solid var(--border-color); display: flex; justify-content: space-between; align-items: center;">
              <button class="btn btn-secondary" id="pp-cancel" style="padding: 8px 16px; width: auto;" aria-label="${window.I18n.t('common.cancel')}">${window.I18n.t('common.cancel')}</button>
              <h3 id="pp-title" style="margin: 0; font-size: 1.1rem; font-family: var(--font-family-display);">Select ${type.charAt(0).toUpperCase() + type.slice(1)}</h3>
              <button class="btn btn-primary" id="pp-confirm" style="padding: 8px 16px; width: auto;" aria-label="${window.I18n.t('common.done')}">${window.I18n.t('common.done')}</button>
            </div>
            <div style="position: relative; display: flex; height: 200px; background: var(--bg-surface);">
              <div style="position: absolute; top: 80px; height: 40px; width: 100%; background: var(--bg-surface-sunken); opacity: 0.6; pointer-events: none; border-top: 1px solid var(--border-color); border-bottom: 1px solid var(--border-color);"></div>
              ${columnsHtml}
            </div>
            <style>
              .pp-item { height: 40px; line-height: 40px; scroll-snap-align: center; font-size: 1.2rem; font-family: var(--font-family-display); font-weight: 500; color: var(--text-primary); }
              #pp-col-month::-webkit-scrollbar, #pp-col-year::-webkit-scrollbar { display: none; }
            </style>
          </div>
        </div>`;
      container.appendChild(div.firstElementChild);
      
      requestAnimationFrame(() => {
        const backdrop = document.getElementById('active-period-picker');
        if (backdrop) backdrop.classList.add('open');
        const mCol = document.getElementById('pp-col-month');
        const yCol = document.getElementById('pp-col-year');
        if (mCol) mCol.scrollTop = initMonth * 40;
        if (yCol) yCol.scrollTop = years.indexOf(initYear) * 40;
      });

      const close = () => {
        const backdrop = document.getElementById('active-period-picker');
        if (backdrop) {
          backdrop.classList.remove('open');
          setTimeout(() => { backdrop.remove(); }, 300);
        }
      };

      document.getElementById('pp-cancel').addEventListener('click', close);
      document.getElementById('pp-confirm').addEventListener('click', () => {
        const mCol = document.getElementById('pp-col-month');
        const yCol = document.getElementById('pp-col-year');
        let val = '';
        if (yCol) {
          const yIdx = Math.round(yCol.scrollTop / 40);
          const year = years[yIdx] || initYear;
          if (mCol) {
            const mIdx = Math.round(mCol.scrollTop / 40);
            val = `${year}-${String(mIdx + 1).padStart(2, '0')}-01`;
          } else {
            val = `${year}-01-01`;
          }
        }
        if (onSelect) onSelect(val);
        close();
      });
    }
  },

  // -----------------------------------------------------------------------
  // RECURRING CREATION MODAL (v0.32)
  // Shows a 2-choice bottom-sheet when the user creates a new recurring
  // transaction that has tags, asking if tags should propagate.
  // -----------------------------------------------------------------------
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
              <button id="rcm-cancel" class="btn btn-secondary" style="margin-top: var(--space-1);">${window.I18n.t('common.cancel')}</button>
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
              <p style="color: var(--text-secondary); font-size: var(--text-sm); margin: 0;">This transaction belongs to a repeating series. How much do you want to delete?</p>
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
                  <div style="font-weight: 600; color: var(--color-expense); font-size: var(--text-base);">Only this transaction</div>
                  <div style="color: var(--color-expense); font-size: var(--text-sm); margin-top: 2px;">Keep past and future intact</div>
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
                  <div style="font-weight: 600; color: var(--color-expense); font-size: var(--text-base);">This and future transactions</div>
                  <div style="color: var(--color-expense); font-size: var(--text-sm); margin-top: 2px;">Stop the series from continuing</div>
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
                  <div style="font-weight: 600; color: var(--color-expense); font-size: var(--text-base);">All transactions</div>
                  <div style="color: var(--color-expense); font-size: var(--text-sm); margin-top: 2px;">Destroy the entire history of this series</div>
                </div>
              </button>

              <!-- Cancel -->
              <button id="rdm-cancel" class="btn btn-secondary" style="margin-top: var(--space-1);">Cancel</button>
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
        startDate: new Date().toISOString().split('T')[0],
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
                <p style="color: var(--text-secondary); font-size: var(--text-sm); margin: 0;">Configure repeating rules for this transaction.</p>
              </div>

              <div style="display: flex; flex-direction: column; padding: var(--space-4) var(--space-5) var(--space-6); gap: var(--space-5);">
                
                <!-- Toggle: Enable Recurring -->
                <div style="display: flex; align-items: center; justify-content: space-between;">
                  <div>
                    <div style="font-weight: 600; color: var(--text-primary);">Enable recurring</div>
                    <div style="font-size: var(--text-xs); color: var(--text-tertiary); margin-top: 2px;">Generate future transactions automatically</div>
                  </div>
                  <div style="display: flex; background: var(--bg-surface-sunken); border-radius: 20px; padding: 2px;">
                    <button id="rs-toggle-off" class="btn" style="padding: 4px 12px; font-size: 11px; min-height: 0; height: 28px; border-radius: 18px; ${!recurrence.enabled ? 'background: var(--color-accent); color: white;' : 'background: transparent; color: var(--text-secondary);'}">OFF</button>
                    <button id="rs-toggle-on" class="btn" style="padding: 4px 12px; font-size: 11px; min-height: 0; height: 28px; border-radius: 18px; ${recurrence.enabled ? 'background: var(--color-accent); color: white;' : 'background: transparent; color: var(--text-secondary);'}">ON</button>
                  </div>
                </div>

                <div id="rs-config-area" style="display: ${recurrence.enabled ? 'flex' : 'none'}; flex-direction: column; gap: var(--space-5); transition: all 0.3s ease;">
                  
                  <!-- Frequency Pills -->
                  <div>
                    <label class="form-label" style="font-size: var(--text-xs); text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-tertiary); margin-bottom: var(--space-3); display: block;">Frequency</label>
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
                  <button id="rs-cancel" class="btn btn-secondary" style="flex: 1;">${window.I18n.t('common.cancel')}</button>
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
            <div style="padding: 16px; border-bottom: 1px solid var(--border-color); display: flex; justify-content: space-between; align-items: center;">
              <button class="btn btn-secondary" id="fp-cancel" style="padding: 8px 16px;" aria-label="${window.I18n.t('freqPicker.cancelAria')}">${window.I18n.t('common.cancel')}</button>
              <h3 id="fp-title" style="margin: 0; font-size: 1.1rem; font-family: var(--font-family-display);">Repeats Every</h3>
              <button class="btn btn-primary" id="fp-confirm" style="padding: 8px 16px;" aria-label="${window.I18n.t('freqPicker.confirmAria')}">${window.I18n.t('common.done')}</button>
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
            ${item.name}
          </span>
          ${item.id === selectedValue ? '<i data-lucide="check" style="width: 20px; height: 20px; color: var(--color-primary);"></i>' : ''}
        </div>
      `).join('');

      div.innerHTML = `
        <div class="modal-backdrop" id="active-list-picker" style="z-index: 10000;" role="dialog" aria-modal="true" aria-labelledby="lp-title">
          <div class="modal-content" style="padding: 0; overflow: hidden; display: flex; flex-direction: column; max-height: 80vh;">
            <div style="padding: var(--space-4) var(--space-5); border-bottom: 1px solid var(--border-color); display: flex; justify-content: space-between; align-items: center; background: var(--bg-surface);">
              <h3 id="lp-title" style="margin: 0; font-size: 1.1rem; font-family: var(--font-family-display); font-weight: 800;">${title}</h3>
              <button class="btn-icon touch-target" id="lp-close" aria-label="${window.I18n.t('picker.closeAria')}" style="color: var(--text-secondary); width: 44px; height: 44px; margin-right: -10px;">
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
        tickColor: isDark ? '#94a3b8' : '#64748b'
      };
    },

    render(data, isCustom = false) {
      if (isCustom) {
        return `
          <div class="card card-elevated" style="padding: var(--space-6); margin-top: var(--space-4); text-align: center; border-radius: var(--radius-2xl); border: 2px dashed var(--border-color); background: var(--bg-surface-sunken);">
            <div style="font-size: 2.5rem; margin-bottom: var(--space-3); opacity: 0.5;">📊</div>
            <p style="color: var(--text-secondary); font-weight: 500;">${window.I18n.t('charts.customRangeUnavailable')}</p>
            <p style="font-size: 0.75rem; color: var(--text-tertiary); margin-top: var(--space-4); font-style: italic;">${window.I18n.t('charts.customRangeNote')}</p>
          </div>
        `;
      }

      if (!data || data.length === 0) {
        return `
          <div class="card card-elevated" style="padding: var(--space-6); margin-top: var(--space-4); text-align: center; border-radius: var(--radius-2xl);">
            <p class="text-secondary">${window.I18n.t('charts.noData')}</p>
          </div>
        `;
      }

      return `
        <div class="card card-elevated" style="padding: var(--space-5); margin-top: var(--space-4); border-radius: var(--radius-2xl); position: relative; overflow: hidden;">
          <!-- DECORATIVE BACKGROUND GRADIENT -->
          <div style="position: absolute; top: -20px; right: -20px; width: 100px; height: 100px; background: var(--color-primary); opacity: 0.03; border-radius: 20px; filter: blur(30px);"></div>
          
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: var(--space-4); position: relative; z-index: 1;">
            <p class="section-title" style="margin-bottom: 0; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.05em; opacity: 0.8;">${window.I18n.t('charts.netFlowAnalysis')}</p>
            <span style="font-size: 10px; color: var(--text-tertiary); font-weight: 700; background: var(--bg-surface-sunken); padding: 2px 8px; border-radius: 10px;">${window.I18n.t('charts.incomeMinusExpenses')}</span>
          </div>
          
          <div style="height: 200px; width: 100%; position: relative; z-index: 1;">
            <canvas id="netFlowChart"></canvas>
          </div>

          <div style="font-size: 0.7rem; color: var(--text-tertiary); margin-top: var(--space-4); text-align: center; opacity: 0.6; font-style: italic;">
            Note: Custom date ranges do not apply to this view
          </div>
        </div>
      `;
    },

    attachEvents(container, data, filters) {
      const canvas = container.querySelector('#netFlowChart');
      if (!canvas || !data || !window.Chart) return;

      const labels = data.map(d => d.label);
      const values = data.map(d => d.net);
      
      const colors = data.map(d => d.net >= 0 ? '#10b981' : '#ef4444'); 
      const bgColors = data.map(d => d.net >= 0 ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)');

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
      const { tooltipBg, tooltipTitle, tooltipBody, tooltipBorder, gridColor, tickColor } = this._themeColors();

      this._chartInstance = new window.Chart(canvas, {
        type: 'bar',
        data: {
          labels: labels,
          datasets: [{
            data: values,
            backgroundColor: bgColors,
            borderColor: colors,
            borderWidth: 2,
            borderRadius: 6,
            borderSkipped: false
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          animation: { duration: 800, easing: 'easeOutQuart' },
          onHover: (event, elements) => {
            event.native.target.style.cursor = elements.length > 0 ? 'pointer' : 'default';
          },
          onClick: (event, elements) => {
            if (elements.length > 0 && filters) {
              const index = elements[0].index;
              const bucket = data[index];
              if (!bucket) return;

              // Clone filters and update for History view
              const newHistoryFilters = {
                period: { 
                  type: 'custom', 
                  start: bucket.start, 
                  end: bucket.end, 
                  value: bucket.start 
                },
                types: [...filters.types],
                accounts: [...filters.accounts],
                categories: [...filters.categories],
                sortOrder: filters.sortOrder
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
                label: (ctx) => `Net: ${window.Store.formatCurrency(ctx.parsed.y)}`
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
              grid: {
                color: gridColor,
                borderDash: [4, 4]
              },
              ticks: {
                stepSize: yScale.stepSize,
                font: { size: 10, family: 'Manrope', weight: '600' },
                color: tickColor,
                callback: (val) => {
                  const symbol = window.Store.getCurrencySymbol();
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

    _CATEGORY_COLORS: {
      'cat_dining': { color: '#f59e0b', hover: '#d97706' },        // Amber
      'cat_entertainment': { color: '#8b5cf6', hover: '#7c3aed' }, // Violet
      'cat_groceries': { color: '#10b981', hover: '#059669' },     // Emerald
      'cat_health': { color: '#ef4444', hover: '#dc2626' },        // Coral Red
      'cat_rent': { color: '#3b82f6', hover: '#2563eb' },          // Royal Blue
      'cat_shopping': { color: '#ec4899', hover: '#db2777' },      // Pink
      'cat_transport': { color: '#06b6d4', hover: '#0891b2' },     // Cyan
      'cat_utilities': { color: '#eab308', hover: '#ca8a04' },     // Gold
      'cat_salary': { color: '#10b981', hover: '#059669' },        // Emerald
      'cat_freelance': { color: '#6366f1', hover: '#4f46e5' },     // Indigo
      'cat_investments': { color: '#00c9a7', hover: '#009e82' },   // Mint
      'cat_other': { color: '#64748b', hover: '#475569' }          // Slate
    },

    _FALLBACK_PALETTE: [
      { color: '#6366f1', hover: '#4f46e5' }, // Indigo
      { color: '#f59e0b', hover: '#d97706' }, // Amber
      { color: '#06b6d4', hover: '#0891b2' }, // Cyan
      { color: '#ec4899', hover: '#db2777' }, // Pink
      { color: '#8b5cf6', hover: '#7c3aed' }, // Violet
      { color: '#10b981', hover: '#059669' }, // Emerald
      { color: '#3b82f6', hover: '#2563eb' }, // Blue
      { color: '#f43f5e', hover: '#e11d48' }, // Rose
      { color: '#eab308', hover: '#ca8a04' }, // Gold
      { color: '#00c9a7', hover: '#009e82' }  // Mint
    ],

    _assignColors(data) {
      if (!data) return [];
      const usedColors = new Set();
      return data.map((item, idx) => {
        if (item.isOthers || item.id === '__others__') {
          return {
            ...item,
            _color: '#94a3b8',
            _hoverColor: '#64748b'
          };
        }

        let assigned = null;
        if (item.color && item.color !== '#94a3b8' && !usedColors.has(item.color)) {
          assigned = { color: item.color, hover: item.hoverColor || item.color };
        } else if (this._CATEGORY_COLORS[item.id] && !usedColors.has(this._CATEGORY_COLORS[item.id].color)) {
          assigned = this._CATEGORY_COLORS[item.id];
        }

        if (!assigned) {
          const fallback = this._FALLBACK_PALETTE.find(p => !usedColors.has(p.color)) ||
                           this._FALLBACK_PALETTE[idx % this._FALLBACK_PALETTE.length];
          assigned = fallback;
        }

        usedColors.add(assigned.color);
        return {
          ...item,
          _color: assigned.color,
          _hoverColor: assigned.hover
        };
      });
    },

    // Collapse raw distribution data into top-5 + 'Others' always as last entry
    _capData(rawData) {
      if (!rawData || rawData.length <= 5) return rawData || [];
      const top5 = rawData.slice(0, 5);
      const rest = rawData.slice(5);
      const othersAmount = rest.reduce((sum, item) => sum + item.amount, 0);
      const totalAmount = rawData.reduce((sum, item) => sum + item.amount, 0);
      top5.push({
        id: '__others__',
        name: window.I18n.t('charts.others'),
        amount: othersAmount,
        icon: 'more-horizontal',
        percentage: totalAmount > 0 ? (othersAmount / totalAmount) * 100 : 0,
        isOthers: true
      });
      return top5;
    },

    render(rawData, type = 'expense') {
      this._currentType = type;
      const isExpense = type === 'expense';
      const rawCapped = this._capData(rawData);
      const data = this._assignColors(rawCapped);
      
      const hasData = data && data.length > 0;
      const totalAmount = rawData.reduce((sum, item) => sum + item.amount, 0);

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
            <div class="donut-chart-container">
              <canvas id="categoryDonutChart"></canvas>
              <div class="donut-chart-center">
                <div class="donut-total-label">${window.I18n.t('charts.total')}</div>
                <div class="donut-total-value">${window.Store.formatCurrency(totalAmount)}</div>
              </div>
            </div>
            <div class="donut-legend">
              ${data.map(item => {
                const esc = (v) => this._esc(v);
                // v0.85: every real category is an accordion — tapping it
                // reveals its per-tag breakdown (filled lazily in
                // attachEvents). 'Others' aggregates categories 6+, so it has
                // no single tag breakdown and stays inert, as before.
                const row = `
                  <div class="donut-legend-item touch-target" data-cat-id="${esc(item.id)}"
                       ${item.isOthers ? '' : 'role="button" tabindex="0" aria-expanded="false"'}
                       style="cursor: ${item.isOthers ? 'default' : 'pointer'}; padding: 8px 4px; border-radius: var(--radius-md); transition: background 0.2s; align-items: center;">
                    <div class="donut-legend-color" style="background: ${item._color}; opacity: ${item.isOthers ? '0.6' : '1'}; height: 32px;"></div>
                    <div class="list-item-icon" style="width: 32px; height: 32px; min-width: 32px;"><i data-lucide="${esc(item.icon)}" style="width: 18px; height: 18px;"></i></div>
                    <div class="donut-legend-info" style="margin-left: 4px;">
                      <span class="donut-legend-name" style="${item.isOthers ? 'opacity:0.65;' : ''}">${esc(item.name)}</span>
                      <span class="donut-legend-pct">${item.percentage.toFixed(1)}%</span>
                    </div>
                    <div class="donut-legend-amount" style="${item.isOthers ? 'opacity:0.65;' : ''}">${esc(window.Store.formatCurrency(item.amount))}</div>
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
        <div class="card card-elevated" style="padding: var(--space-5); margin-top: var(--space-4); border-radius: var(--radius-2xl); position: relative; overflow: hidden;">
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

    attachEvents(container, filters) {
      const canvas = container.querySelector('#categoryDonutChart');
      const toggleBtns = container.querySelectorAll('.chart-toggle-btn');
      
      const updateChart = (type) => {
        this._currentType = type;
        // v0.85: an expense category's tag breakdown means nothing under the
        // income lens — collapse rather than restore something stale.
        this._expandedCatId = null;
        const newData = window.Store.computeCategoryDistribution(filters, type);
        
        const card = container.querySelector('.donut-chart-layout') || container.querySelector('[style*="height: 200px"]');
        if (card) {
          const outerCard = container.querySelector('.donut-chart-layout')?.closest('.card') || container.querySelector('[style*="height: 200px"]')?.closest('.card');
          if (outerCard) {
            outerCard.outerHTML = this.render(newData, type);
            this.attachEvents(container, filters);
          }
        }
      };

      toggleBtns.forEach(btn => {
        btn.addEventListener('click', () => {
          const type = btn.dataset.type;
          if (type === this._currentType) return;
          updateChart(type);
        });
      });

      // ── v0.85: category → tag drilldown ────────────────────────────────
      // Hand off to History exactly the way the category tap always did
      // (copy the analytics period/accounts, pin the category and type), plus
      // the chosen tag. Passing null tags = the whole category.
      const openInHistory = (catId, tag) => {
        const aFilters = window.Store.state.analyticsFilters;
        const hFilters = window.Store.state.historyFilters;

        hFilters.period = { ...aFilters.period };
        hFilters.accounts = [...aFilters.accounts];
        hFilters.categories = [catId];
        hFilters.types = [this._currentType];
        hFilters.tags = tag ? [tag] : [];

        window.Store.emit();
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
            <span class="donut-tag-amount">${esc(window.Store.formatCurrency(r.amount))}</span>
          </div>`).join('');
        // Always offer the whole category too — the pre-v0.85 behaviour, and
        // the only route to a category whose rows are all tagged differently.
        panel.innerHTML = `
          <div class="donut-tag-list">
            ${rows}
            <div class="donut-tag-row donut-tag-row--all touch-target" data-tag-row="__all__" role="button" tabindex="0">
              <span class="donut-tag-name">All ${breakdown.count} transaction${breakdown.count === 1 ? '' : 's'}</span>
              <span class="donut-tag-amount">${esc(window.Store.formatCurrency(breakdown.total))}</span>
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

      const rawData = window.Store.computeCategoryDistribution(filters, this._currentType);
      const rawCapped = this._capData(rawData);
      const data = this._assignColors(rawCapped);
      if (data.length === 0) return;

      if (this._chartInstance) {
        this._chartInstance.destroy();
      }

      const GAP = 3; // px gap on each side of every segment

      const isDark = (window.Store && window.Store.state && window.Store.state.activeTheme === 'dark');
      const tooltipBg = isDark ? '#161e2e' : '#ffffff';
      const tooltipTitle = isDark ? '#94a3b8' : '#64748b';
      const tooltipBody = isDark ? '#f8fafc' : '#334155';
      const tooltipBorder = isDark ? 'rgba(51, 65, 85, 0.8)' : '#e2e8f0';

      this._chartInstance = new window.Chart(canvas, {
        type: 'doughnut',
        data: {
          labels: data.map(d => d.name),
          datasets: [{
            data: data.map(d => d.amount),
            backgroundColor: data.map(d => d._color),
            hoverBackgroundColor: data.map(d => d._hoverColor),
            borderWidth: GAP,
            borderColor: 'transparent',
            hoverBorderWidth: GAP,
            hoverBorderColor: 'transparent',
            borderRadius: 6,
            hoverOffset: 8
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          cutout: '74%',
          animation: { duration: 700, easing: 'easeOutQuart' },
          plugins: {
            legend: { display: false },
            tooltip: {
              backgroundColor: tooltipBg,
              titleColor: tooltipTitle,
              titleFont: { size: 11, weight: '600' },
              bodyColor: tooltipBody,
              bodyFont: { family: 'Manrope', size: 13, weight: '800' },
              borderColor: tooltipBorder,
              borderWidth: 1,
              padding: 12,
              displayColors: true,
              boxPadding: 6,
              callbacks: {
                label: (ctx) => {
                  const val = ctx.parsed;
                  const total = ctx.dataset.data.reduce((a, b) => a + b, 0);
                  const pct = total > 0 ? ((val / total) * 100).toFixed(1) : 0;
                  return `  ${window.Store.formatCurrency(val)} (${pct}%)`;
                }
              }
            }
          }
        }
      });
    }
  },

  TagsModal: {
    show(options) {
      const { initialTags = [], onSave } = options;
      const container = document.getElementById('modal-container');
      let currentTags = (initialTags || []).map(t => String(t).trim().toLowerCase()).filter(Boolean);
      
      const renderContent = () => {
        const allTags = window.Store.getAllUniqueTags().map(t => String(t).toLowerCase());
        const suggestions = allTags.filter(t => !currentTags.includes(t));

        const div = document.createElement('div');
        div.innerHTML = `
          <div class="modal-backdrop" id="tags-modal" role="dialog" aria-modal="true">
            <div class="modal-content" style="padding: 0; overflow: hidden; display: flex; flex-direction: column; max-height: 85vh;">
              <div class="modal-handle"></div>
              <div style="padding: var(--space-5) var(--space-5) var(--space-2);">
                <h2 class="header-title" style="margin: 0; font-size: var(--text-xl);">${window.I18n.t('form.tags')}</h2>
                <p style="color: var(--text-secondary); font-size: var(--text-sm); margin: var(--space-1) 0 0;">Categorize your transaction with tags.</p>
              </div>

              <div style="padding: var(--space-4) var(--space-5); flex: 1; overflow-y: auto;">
                <!-- Tag Input -->
                <div style="margin-bottom: var(--space-5);">
                  <div style="display: flex; gap: 8px;">
                    <div style="flex: 1; position: relative;">
                      <input type="text" id="tag-input" class="form-control" placeholder="${window.I18n.t('tagsModal.newTag')}" aria-label="${window.I18n.t('tagsModal.newTagAria')}" maxlength="20" style="padding-left: 32px;" autocomplete="off">
                      <i data-lucide="hash" style="position: absolute; left: 10px; top: 12px; width: 14px; color: var(--text-tertiary);" aria-hidden="true"></i>
                    </div>
                    <button id="add-tag-btn" class="btn btn-primary" style="width: auto; padding: 0 16px;">Add</button>
                  </div>
                  <p style="color: var(--text-tertiary); font-size: var(--text-xs); margin-top: 6px; margin-bottom: 0;">Tags cannot contain spaces (use '_' as delimiter). Press Space or Enter to add a tag.</p>
                </div>

                <!-- Current Tags -->
                <div style="margin-bottom: var(--space-6);">
                  <label class="form-label" style="font-size: var(--text-xs); text-transform: uppercase; color: var(--text-tertiary); margin-bottom: var(--space-3); display: block;">Active Tags</label>
                  <div id="current-tags-list" style="display: flex; flex-wrap: wrap; gap: 8px;">
                    ${currentTags.length > 0 ? currentTags.map(tag => `
                      <div class="tag-chip active" data-tag="${tag}">
                        <span>#${tag}</span>
                        <i data-lucide="x" style="width: 14px; margin-left: 4px; cursor: pointer;"></i>
                      </div>
                    `).join('') : '<p style="color: var(--text-tertiary); font-size: var(--text-sm); font-style: italic;">No tags added yet</p>'}
                  </div>
                </div>

                <!-- Suggestions -->
                ${suggestions.length > 0 ? `
                  <div>
                    <label class="form-label" style="font-size: var(--text-xs); text-transform: uppercase; color: var(--text-tertiary); margin-bottom: var(--space-3); display: block;">Recent Tags</label>
                    <div style="display: flex; flex-wrap: wrap; gap: 8px;">
                      ${suggestions.slice(0, 10).map(tag => `
                        <div class="tag-chip suggestion" data-tag="${tag}">#${tag}</div>
                      `).join('')}
                    </div>
                  </div>
                ` : ''}
              </div>

              <div style="padding: var(--space-5); border-top: 1px solid var(--border-color); display: flex; gap: var(--space-3);">
                <button id="tags-cancel" class="btn btn-secondary" style="flex: 1;">${window.I18n.t('common.cancel')}</button>
                <button id="tags-save" class="btn btn-primary" style="flex: 2;">${window.I18n.t('tagsModal.apply')}</button>
              </div>
            </div>
            <style>
              .tag-chip {
                padding: 6px 12px;
                border-radius: 16px;
                font-size: 13px;
                font-weight: 600;
                display: flex;
                align-items: center;
                transition: all 0.2s;
                cursor: pointer;
              }
              .tag-chip.active {
                background: var(--color-primary);
                color: var(--text-on-primary);
              }
              .tag-chip.suggestion {
                background: var(--bg-surface-sunken);
                color: var(--text-secondary);
                border: 1px solid var(--border-color);
              }
              .tag-chip.suggestion:hover {
                border-color: var(--text-tertiary);
              }
            </style>
          </div>`;
        
        const existing = document.getElementById('tags-modal');
        if (existing) existing.remove();
        container.appendChild(div.firstElementChild);
        window.StackdHydrateIcons?.();
        attachEvents();
      };

      const attachEvents = () => {
        const close = () => {
          const backdrop = document.getElementById('tags-modal');
          if (backdrop) {
            backdrop.classList.remove('open');
            setTimeout(() => backdrop.remove(), 300);
          }
        };

        const cancelBtn = document.getElementById('tags-cancel');
        const saveBtn = document.getElementById('tags-save');
        if (cancelBtn) cancelBtn.onclick = close;
        if (saveBtn) saveBtn.onclick = () => {
          if (onSave) onSave(currentTags);
          close();
        };

        const input = document.getElementById('tag-input');
        const addBtn = document.getElementById('add-tag-btn');

        const addTag = (textOverride) => {
          const raw = textOverride !== undefined ? textOverride : (input ? input.value : '');
          const val = raw.trim().toLowerCase().replace(/^#/, '');
          if (val && !currentTags.includes(val)) {
            currentTags.push(val);
            renderContent();
            const newInput = document.getElementById('tag-input');
            if (newInput) newInput.focus();
          } else if (input) {
            input.value = '';
          }
        };

        if (addBtn) addBtn.onclick = () => addTag();
        if (input) {
          input.oninput = () => {
            input.value = input.value.toLowerCase();
            if (input.value.includes(' ')) {
              const parts = input.value.split(/\s+/);
              const toAdd = parts.slice(0, -1);
              const remainder = parts[parts.length - 1];
              let addedAny = false;
              toAdd.forEach(p => {
                const cleaned = p.trim().toLowerCase().replace(/^#/, '');
                if (cleaned && !currentTags.includes(cleaned)) {
                  currentTags.push(cleaned);
                  addedAny = true;
                }
              });
              input.value = remainder;
              if (addedAny) {
                renderContent();
                const newInput = document.getElementById('tag-input');
                if (newInput) {
                  newInput.focus();
                  newInput.value = remainder;
                }
              }
            }
          };

          input.onkeydown = (e) => {
            if (e.key === ' ' || e.code === 'Space' || e.key === 'Enter') {
              e.preventDefault();
              addTag();
            }
          };
        }

        document.querySelectorAll('.tag-chip.active').forEach(chip => {
          chip.onclick = () => {
            const tag = chip.dataset.tag;
            currentTags = currentTags.filter(t => t !== tag);
            renderContent();
          };
        });

        document.querySelectorAll('.tag-chip.suggestion').forEach(btn => {
          btn.onclick = () => {
            const tag = btn.dataset.tag.toLowerCase();
            if (!currentTags.includes(tag)) {
              currentTags.push(tag);
              renderContent();
            }
          };
        });

        const backdropEl = document.getElementById('tags-modal');
        if (backdropEl) {
          backdropEl.onclick = (e) => { if (e.target.id === 'tags-modal') close(); };
          requestAnimationFrame(() => backdropEl.classList.add('open'));
        }
      };

      renderContent();
    }
  },

  // -----------------------------------------------------------------------
  // RECURRING UPDATE MODAL (rebuilt v0.67)
  // 3-choice scope sheet shown when saving ANY change to a transaction that
  // belongs to a recurrent series (mirrors RecurringDeleteModal's layout).
  // Accepts either { onSelection(scope) } with scope 'single'|'future'|'all',
  // or the delete-modal-style { onlyThis, thisAndFuture, allTransactions }
  // callbacks (the v0.32 caller used the latter shape and crashed — B3).
  // Optional flags tune the copy: dateChanged, recurrenceRemoved.
  // -----------------------------------------------------------------------
  RecurringUpdateModal: {
    show(options) {
      const { dateChanged = false, recurrenceRemoved = false } = options;
      const onSelection = options.onSelection || ((scope) => {
        if (scope === 'single' && options.onlyThis) options.onlyThis();
        else if (scope === 'future' && options.thisAndFuture) options.thisAndFuture();
        else if (scope === 'all' && options.allTransactions) options.allTransactions();
      });
      const container = document.getElementById('modal-container');

      let description = "This transaction is part of a repeating series. How far should your changes apply? Past transactions always keep their dates.";
      let futureSub = window.I18n.t('recUpdate.futureSub');
      let allSub = window.I18n.t('recUpdate.allSub');
      if (recurrenceRemoved) {
        description = "You turned off Recurrent on a transaction that belongs to a repeating series. What should happen to the series?";
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
            </div>

            <div style="display: flex; flex-direction: column; padding: var(--space-3) var(--space-4) var(--space-5); gap: var(--space-2);">
              ${optionCard('ru-only-this', window.I18n.t('recUpdate.onlyThis'), window.I18n.t(recurrenceRemoved ? 'recUpdate.onlyThisSubUnlink' : 'recUpdate.onlyThisSub'))}
              ${optionCard('ru-this-future', window.I18n.t('recUpdate.thisFuture'), futureSub)}
              ${optionCard('ru-all-series', window.I18n.t('recUpdate.allSeries'), allSub)}
              <button id="ru-cancel" class="btn btn-secondary" style="margin-top: var(--space-1);">Cancel</button>
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
    MONTHS: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
    get MONTHS_FULL() { return window.I18n.monthNames('long'); },

    show(options = {}) {
      const { initialValue, onSelect } = options;

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
        const isCurrentDecade = currentYear === now.getFullYear();
        wrapper.innerHTML = `
          <div class="modal-content" style="padding: 0; overflow: hidden;">
            <div class="modal-top-bar" style="display: flex; align-items: center; justify-content: space-between; padding: 16px; border-bottom: 1px solid var(--border-color);">
              <button class="modal-btn-top modal-btn-close" id="mp-cancel">${window.I18n.t('common.cancel')}</button>
              <h3 id="mp-title" style="margin: 0; font-weight: 800; font-size: 1rem;">${window.I18n.t('monthPicker.title')}</h3>
              <button class="modal-btn-top" id="mp-done" style="color: var(--color-accent); font-weight: 700;">Done</button>
            </div>

            <div style="padding: 16px 20px;">
              <!-- Year Navigator -->
              <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 20px;">
                <button id="mp-prev-year" class="btn-icon touch-target" style="width: 36px; height: 36px; background: var(--bg-surface-sunken); border-radius: 50%; border: none; cursor: pointer; color: var(--text-primary); display: flex; align-items: center; justify-content: center;" aria-label="Previous year">
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg>
                </button>
                <span id="mp-year-label" style="font-family: var(--font-family-display); font-weight: 800; font-size: 1.4rem; color: var(--text-primary);">${currentYear}</span>
                <button id="mp-next-year" class="btn-icon touch-target" style="width: 36px; height: 36px; background: var(--bg-surface-sunken); border-radius: 50%; border: none; cursor: pointer; color: var(--text-primary); display: flex; align-items: center; justify-content: center;" aria-label="Next year">
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
                Selected: <strong id="mp-selected-label" style="color: var(--text-primary);">${this.MONTHS_FULL[selectedMonth]} ${selectedYear}</strong>
              </div>
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
            <button class="modal-btn-top" id="csm-add-new" aria-label="Add new category" style="display: flex; align-items: center; justify-content: center; width: 36px; height: 36px; border-radius: 12px; background: var(--bg-surface-sunken); border: none; cursor: pointer; color: var(--color-primary); font-size: 1.3rem; font-weight: bold; padding: 0;">+</button>
          </div>
          
          <div class="modal-body" style="padding: var(--space-4) var(--space-4) 40px; flex: 1; overflow-y: auto;">
            <div class="list-group" id="csm-category-list">
              <div class="list-item touch-target category-select-item" data-id="" style="cursor: pointer; display: flex; align-items: center; justify-content: space-between; padding: var(--space-4); margin-bottom: var(--space-2); border-radius: var(--radius-lg); ${!selectedCategoryId ? 'background: var(--bg-surface-sunken); border: 2px solid var(--color-primary);' : ''}">
                <div style="display: flex; align-items: center; gap: var(--space-3);">
                  <div class="list-item-icon" style="flex-shrink: 0;"><i data-lucide="minus-circle"></i></div>
                  <div class="list-item-title" style="font-weight: 600; color: var(--text-secondary);">No category selected</div>
                </div>
                ${!selectedCategoryId ? '<i data-lucide="check" style="width: 20px; height: 20px; color: var(--color-primary);"></i>' : ''}
              </div>
              ${sortedCategories.map(cat => {
                const isSelected = cat.id === selectedCategoryId;
                return `
                  <div class="list-item touch-target category-select-item" data-id="${cat.id}" style="cursor: pointer; display: flex; align-items: center; justify-content: space-between; padding: var(--space-4); margin-bottom: var(--space-2); border-radius: var(--radius-lg); ${isSelected ? 'background: var(--bg-surface-sunken); border: 2px solid var(--color-primary);' : ''}">
                    <div style="display: flex; align-items: center; gap: var(--space-3);">
                      <div class="list-item-icon" style="flex-shrink: 0;"><i data-lucide="${cat.icon || 'pin'}"></i></div>
                      <div class="list-item-title" style="font-weight: 600;">${cat.name}</div>
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

      const accounts = (state && state.accounts) ? state.accounts : (window.Store.state ? window.Store.state.accounts : []);
      const categories = (state && state.categories) ? state.categories : (window.Store.state ? window.Store.state.categories : []);

      const savedFilters = (window.Store.state && window.Store.state.expandedGraphFilters)
        ? window.Store.state.expandedGraphFilters
        : { interval: 'monthly', accounts: [], categories: [] };

      let activeInterval = savedFilters.interval || 'monthly';
      let selectedAccountIds = (savedFilters.accounts && savedFilters.accounts.length > 0)
        ? [...savedFilters.accounts]
        : accounts.map(a => a.id);
      let selectedCategoryIds = (savedFilters.categories && savedFilters.categories.length > 0)
        ? [...savedFilters.categories]
        : [];

      let showFilterPanel = false;

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
        const formattedTotal = window.Store.formatCurrency(latestBalance);

        modalBackdrop.innerHTML = `
          <div class="modal-content" style="height: 92vh; border-top-left-radius: 32px; border-top-right-radius: 32px; padding: 0; display: flex; flex-direction: column; overflow: hidden; background: var(--bg-surface);">
            <!-- Top Bar with X (Left) and Filter (Right) -->
            <div class="modal-top-bar" style="display: flex; justify-content: space-between; align-items: center; padding: var(--space-4) var(--space-5); border-bottom: 1px solid var(--color-border); position: sticky; top: 0; z-index: 20; background: var(--bg-surface);">
              <button class="modal-btn-icon-left" id="egm-close" aria-label="${window.I18n.t('graphModal.closeAria')}">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-x" data-hydrated="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
              <h3 style="font-family: var(--font-family-display); font-weight: 800; font-size: 1.1rem; margin: 0; color: var(--text-primary);">Balance Trend</h3>
              <button class="modal-btn-filter-right ${showFilterPanel ? 'active' : ''}" id="egm-filter" aria-label="${window.I18n.t('graphModal.toggleFiltersAria')}">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-sliders" data-hydrated="true"><line x1="4" x2="4" y1="21" y2="14"/><line x1="4" x2="4" y1="10" y2="3"/><line x1="12" x2="12" y1="21" y2="12"/><line x1="12" x2="12" y1="8" y2="3"/><line x1="20" x2="20" y1="21" y2="16"/><line x1="20" x2="20" y1="12" y2="3"/><line x1="2" x2="6" y1="14" y2="14"/><line x1="10" x2="14" y1="8" y2="8"/><line x1="18" x2="22" y1="16" y2="16"/></svg>
                <span>${window.I18n.t('graphModal.filter')}</span>
              </button>
            </div>

            <div class="modal-body" style="padding: var(--space-5); flex: 1; overflow-y: auto;">
              <!-- Overall Metrics -->
              <div style="margin-bottom: var(--space-4);">
                <span style="font-size: var(--text-xs); font-weight: 700; text-transform: uppercase; color: var(--text-tertiary); letter-spacing: 0.05em;">Total Balance</span>
                <div style="font-family: var(--font-family-display); font-size: 2.2rem; font-weight: 850; color: var(--text-primary); margin-top: 2px;">${formattedTotal}</div>
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
                      ${accounts.map(acc => `
                        <label class="filter-checkbox-label">
                          <input type="checkbox" class="egm-acc-checkbox" data-acc-id="${acc.id}" ${selectedAccountIds.includes(acc.id) ? 'checked' : ''} />
                          <span style="width: 8px; height: 8px; border-radius: 50%; background: ${acc.color || '#64748B'}; display: inline-block; flex-shrink: 0;"></span>
                          <span style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${acc.name}</span>
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
                          <span style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${cat.name}</span>
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
              accounts: selectedAccountIds,
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

        const visibleAccounts = accounts.filter(a => selectedAccountIds.includes(a.id));
        const visibleIds = visibleAccounts.map(a => a.id);

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

        const datasets = [{
          label: window.I18n.t('analytics.totalNetBalance'),
          data: (mainResult && mainResult.points) ? mainResult.points : [],
          borderColor: isDark ? '#38bdf8' : '#111111',
          backgroundColor: isDark ? 'rgba(56, 189, 248, 0.1)' : 'rgba(17, 17, 17, 0.05)',
          borderWidth: 3,
          fill: true,
          tension: 0,
          pointRadius: activeInterval === 'weekly' ? 3 : 4,
          pointHoverRadius: 7,
          pointBackgroundColor: isDark ? '#161e2e' : '#ffffff',
          pointBorderWidth: 3,
          pointBorderColor: isDark ? '#38bdf8' : '#111111'
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
                  label: (ctx) => ` ${ctx.dataset.label}: ${window.Store.formatCurrency(ctx.parsed.y)}`
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
                  callback: (val) => window.Store.formatCurrency(val)
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
      const renderDetailStep = () => {
        const def = W.registry[selectedType];
        const sizes = def.sizes || ['small'];
        return `
          <h3 class="widget-detail-title">${esc(def.title)}</h3>
          <p class="widget-detail-desc">${esc(def.description)}</p>
          <div id="awm-preview">${W.renderPreview(selectedType, selectedSize, draft, window.Store.getState())}</div>
          ${sizes.length > 1 ? `
            <div class="widget-size-dots" role="group" aria-label="Widget size">
              ${sizes.map(s => `
                <button type="button" class="widget-size-dot ${s === selectedSize ? 'is-active' : ''}"
                        data-size="${esc(s)}" aria-pressed="${s === selectedSize}"
                        aria-label="${s === 'large' ? 'Wide size' : 'Small size'}"></button>
              `).join('')}
            </div>
            <p class="widget-size-caption">${selectedSize === 'large' ? 'Wide' : 'Small'}</p>
          ` : ''}`;
      };

      const renderAll = () => {
        // Any previous preview chart belongs to markup we are about to discard.
        W.destroyPreview();

        const def = selectedType ? W.registry[selectedType] : null;
        const isConfig = step === 'config';
        const isDetail = step === 'detail';
        const title = (isConfig && editId) ? (def ? def.title : 'Configure') : 'Add widget';
        // Only the edit-mode entry point has no earlier step to go back to.
        const canGoBack = (isDetail || isConfig) && !editId;
        const leftGlyph = canGoBack ? '‹' : '✕';
        // Detail advances to config when there is something to configure.
        const confirmLabel = editId
          ? 'Save changes'
          : (isDetail && def && def.hasConfig ? 'Next' : 'Add widget');

        backdrop.innerHTML = `
          <div class="modal-content" style="padding: 0; display: flex; flex-direction: column; width: 100%; height: 100%; max-width: 100%; max-height: 100vh; border-radius: 0; transform: translateY(0); transition: transform 0.3s cubic-bezier(0.16, 1, 0.3, 1);">
            <div class="modal-top-bar modal-top-bar--safe">
              <button class="modal-btn-top modal-btn-close" id="awm-left" aria-label="${canGoBack ? 'Back' : 'Close'}" style="display: flex; align-items: center; justify-content: center; width: 36px; height: 36px; border-radius: 12px; background: var(--bg-surface-sunken); border: none; cursor: pointer; color: var(--text-primary); font-size: 1.3rem; font-weight: bold; padding: 0;">${leftGlyph}</button>
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
        // Mount the preview chart after the markup is in the document.
        if (isDetail) {
          W.attachPreview(backdrop, selectedType, selectedSize, draft, window.Store.getState());
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

        backdrop.querySelectorAll('.widget-size-dot').forEach(dot => {
          dot.onclick = () => {
            selectedSize = dot.dataset.size;
            renderAll();
          };
        });

        // v0.79: swiping the preview flips between sizes. The preview grid
        // itself is pointer-events:none (it is a picture), so the gesture is
        // read on its wrapper — the deepest hit-testable ancestor. Handlers
        // die with each renderAll() innerHTML rebuild, so no cleanup needed.
        const previewWrap = backdrop.querySelector('#awm-preview');
        if (previewWrap && selectedType) {
          const sizes = (W.registry[selectedType] && W.registry[selectedType].sizes) || [];
          if (sizes.length > 1) {
            let swipeStartX = 0;
            let swipeStartY = 0;
            previewWrap.addEventListener('touchstart', (e) => {
              swipeStartX = e.touches[0].clientX;
              swipeStartY = e.touches[0].clientY;
            }, { passive: true });
            previewWrap.addEventListener('touchend', (e) => {
              const t = e.changedTouches && e.changedTouches[0];
              if (!t) return;
              const dx = t.clientX - swipeStartX;
              const dy = t.clientY - swipeStartY;
              // Ignore taps and mostly-vertical drags — the modal body scrolls.
              if (Math.abs(dx) < 40 || Math.abs(dx) <= Math.abs(dy)) return;
              const idx = sizes.indexOf(selectedSize);
              const next = dx < 0
                ? Math.min(idx + 1, sizes.length - 1)
                : Math.max(idx - 1, 0);
              if (next === idx) return;
              selectedSize = sizes[next];
              renderAll();
            }, { passive: true });
          }
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


