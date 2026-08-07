// v0.72 Home dashboard widgets — registry + section renderer.
// docs/home-widgets-plan.md §6.2. Loaded between components.js and views.js:
// it consumes Components/Store and is consumed by views.js (DashboardView).
//
// A widget instance is { id, type, size, config, createdAt } (Store.state.homeWidgets).
// Everything visual is driven by registry[type]; an instance whose type is not
// registered renders a placeholder card instead of throwing, so opening data
// written by a newer build never bricks the dashboard.
window.Widgets = {

  // ── helpers ─────────────────────────────────────────────────────────────
  _esc(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  },

  // Local-time YYYY-MM-DD. Deliberately not toISOString(): that shifts a day
  // for anyone east/west of UTC at the edges of the day.
  _todayStr() {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  },

  _emptyState(message) {
    return `<div class="widget-empty">${this._esc(message)}</div>`;
  },

  // ── registry ────────────────────────────────────────────────────────────
  // title/description/icon feed the Add-widget gallery; render/attach drive
  // the dashboard card. hasConfig types gain a config step in Phase 2.
  registry: {
    latest: {
      title: 'Latest transactions',
      description: 'Your most recent activity at a glance, without leaving the dashboard.',
      icon: 'receipt',
      sizes: ['small', 'large'],
      hasConfig: false,
      defaultConfig: {},

      render(instance, state) {
        const W = window.Widgets;
        const isLarge = instance.size === 'large';
        const limit = isLarge ? 5 : 3;
        const todayStr = W._todayStr();

        // Future-dated members of a recurring series live in state.transactions
        // (they are materialised up front), so "latest" must clamp to today or
        // it would show scheduled rows as if they had already happened.
        const txs = (state.transactions || [])
          .filter(t => t.type !== 'opening_balance' && t.date <= todayStr)
          .slice()
          .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
          .slice(0, limit);

        if (txs.length === 0) return W._emptyState('No transactions yet');

        return `<div class="widget-rows">${txs.map(tx => {
          const cat = (state.categories || []).find(c => c.id === tx.categoryId);
          const acc = (state.accounts || []).find(a => a.id === tx.accountId);
          const isExpense = tx.type === 'expense';
          const amountClass = tx.transferRef ? 'text-transfer' : (isExpense ? 'text-expense' : 'text-income');
          const amount = (isExpense ? '-' : '+') + window.Store.formatCurrency(Math.abs(tx.amount));
          const title = cat ? cat.name : (tx.transferRef ? 'Transfer' : 'Unknown');
          const dateLabel = new Date(`${tx.date}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

          return `
            <div class="widget-row">
              <div class="widget-row-icon"><i data-lucide="${W._esc(cat ? cat.icon : 'receipt')}"></i></div>
              <div class="widget-row-main">
                <span class="widget-row-title">${W._esc(title)}</span>
                ${isLarge ? `<span class="widget-row-sub">${W._esc(acc ? acc.name : 'Account')} · ${W._esc(dateLabel)}</span>` : ''}
              </div>
              <span class="widget-row-value ${amountClass}">${W._esc(amount)}</span>
            </div>`;
        }).join('')}</div>`;
      },

      attach(instance, card) {
        card.addEventListener('click', () => {
          if (window.Store.getState().widgetEditMode) return;
          window.Router.navigate('#transactions');
        });
      }
    }
  },

  // Gallery order for the Add-widget sheet.
  listTypes() {
    return Object.keys(this.registry).map(type => ({ type, ...this.registry[type] }));
  },

  // ── section render ──────────────────────────────────────────────────────
  renderSection(state) {
    const widgets = Array.isArray(state.homeWidgets) ? state.homeWidgets : [];
    const editMode = !!state.widgetEditMode && widgets.length > 0;

    const header = `
      <div class="widgets-header">
        <p class="section-title" style="margin-bottom: 0;">Widgets</p>
        <div class="widgets-header-actions">
          ${widgets.length > 0 ? `
            <button type="button" class="widget-pill-btn ${editMode ? 'is-active' : ''}" id="btn-widgets-edit"
                    aria-pressed="${editMode}">${editMode ? 'Done' : 'Edit'}</button>
          ` : ''}
          <button type="button" class="widget-pill-btn widget-pill-btn--accent" id="btn-widgets-add" aria-label="Add widget">
            <i data-lucide="plus" style="width: 15px; height: 15px;"></i><span>Add</span>
          </button>
        </div>
      </div>`;

    const body = widgets.length === 0
      ? `
        <button type="button" class="widget-empty-cta touch-target" id="btn-widgets-add-empty" aria-label="Add your first widget">
          <i data-lucide="layout-dashboard" style="width: 26px; height: 26px;"></i>
          <span class="widget-empty-cta-title">Add your first widget</span>
          <span class="widget-empty-cta-sub">Pick what you want to see on your dashboard</span>
        </button>`
      : `<div class="widgets-grid ${editMode ? 'is-editing' : ''}" id="widgets-grid">
          ${widgets.map((w, i) => this._renderCard(w, state, editMode, i, widgets.length)).join('')}
        </div>`;

    return `<div class="widgets-section" id="widgets-section">${header}${body}</div>`;
  },

  _renderCard(instance, state, editMode, index, total) {
    const def = this.registry[instance.type];
    const isLarge = instance.size === 'large';
    const classes = ['widget-card', 'card', 'card-elevated'];
    if (isLarge) classes.push('widget-card--large');
    if (editMode) classes.push('is-editing');

    // Unknown type: keep the slot visible and removable rather than throwing.
    if (!def) {
      return `
        <div class="${classes.join(' ')}" data-widget-id="${this._esc(instance.id)}" data-widget-type="${this._esc(instance.type)}">
          ${editMode ? this._renderEditChrome(instance, index, total, isLarge) : ''}
          <div class="widget-card-head"><span class="widget-card-title">Unavailable</span></div>
          <div class="widget-card-body">${this._emptyState('This widget is not supported in this version')}</div>
        </div>`;
    }

    let bodyHtml;
    try {
      bodyHtml = def.render(instance, state);
    } catch (err) {
      // One broken widget must not take the whole dashboard down with it.
      console.error(`[widgets] render failed for "${instance.type}"`, err);
      bodyHtml = this._emptyState('Could not load this widget');
    }

    return `
      <div class="${classes.join(' ')}" data-widget-id="${this._esc(instance.id)}" data-widget-type="${this._esc(instance.type)}">
        ${editMode ? this._renderEditChrome(instance, index, total, isLarge) : ''}
        <div class="widget-card-head">
          <span class="widget-card-title">${this._esc(def.title)}</span>
        </div>
        <div class="widget-card-body">${bodyHtml}</div>
      </div>`;
  },

  _renderEditChrome(instance, index, total, isLarge) {
    const id = this._esc(instance.id);
    return `
      <button type="button" class="widget-remove-btn" data-widget-action="remove" data-widget-id="${id}" aria-label="Remove widget">
        <i data-lucide="minus" style="width: 16px; height: 16px;"></i>
      </button>
      <div class="widget-edit-bar">
        <button type="button" class="widget-chrome-btn" data-widget-action="move-up" data-widget-id="${id}"
                ${index === 0 ? 'disabled' : ''} aria-label="Move widget up">
          <i data-lucide="chevron-up" style="width: 16px; height: 16px;"></i>
        </button>
        <button type="button" class="widget-chrome-btn" data-widget-action="move-down" data-widget-id="${id}"
                ${index === total - 1 ? 'disabled' : ''} aria-label="Move widget down">
          <i data-lucide="chevron-down" style="width: 16px; height: 16px;"></i>
        </button>
        <button type="button" class="widget-size-pill" data-widget-action="toggle-size" data-widget-id="${id}"
                aria-label="Toggle widget size">${isLarge ? 'Wide' : 'Small'}</button>
      </div>`;
  },

  // ── section events ──────────────────────────────────────────────────────
  attachSection(root, state) {
    const section = root.querySelector('#widgets-section');
    if (!section) return;

    const openGallery = () => {
      if (window.Components && window.Components.AddWidgetModal) {
        window.Components.AddWidgetModal.show();
      }
    };
    ['#btn-widgets-add', '#btn-widgets-add-empty'].forEach(sel => {
      const btn = section.querySelector(sel);
      if (btn) btn.addEventListener('click', openGallery);
    });

    const editBtn = section.querySelector('#btn-widgets-edit');
    if (editBtn) {
      editBtn.addEventListener('click', () => window.Store.dispatch('TOGGLE_WIDGET_EDIT_MODE'));
    }

    const grid = section.querySelector('#widgets-grid');
    if (!grid) return;

    // Delegated so the handler count stays flat as widgets are added.
    grid.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-widget-action]');
      if (!btn || btn.disabled) return;
      e.stopPropagation(); // never let chrome clicks fall through to the card

      const id = btn.dataset.widgetId;
      const widgets = window.Store.getState().homeWidgets || [];
      const idx = widgets.findIndex(w => w.id === id);
      if (idx === -1) return;

      switch (btn.dataset.widgetAction) {
        case 'remove':
          window.Store.dispatch('REMOVE_HOME_WIDGET', { id });
          break;
        case 'move-up':
        case 'move-down': {
          const target = btn.dataset.widgetAction === 'move-up' ? idx - 1 : idx + 1;
          if (target < 0 || target >= widgets.length) return;
          const orderedIds = widgets.map(w => w.id);
          [orderedIds[idx], orderedIds[target]] = [orderedIds[target], orderedIds[idx]];
          window.Store.dispatch('REORDER_HOME_WIDGETS', { orderedIds });
          break;
        }
        case 'toggle-size':
          window.Store.dispatch('UPDATE_HOME_WIDGET', {
            id,
            size: widgets[idx].size === 'large' ? 'small' : 'large'
          });
          break;
      }
    });

    // Per-instance attach (chart mounts, navigation) — errors stay contained.
    (state.homeWidgets || []).forEach(instance => {
      const def = this.registry[instance.type];
      if (!def || !def.attach) return;
      const card = grid.querySelector(`.widget-card[data-widget-id="${instance.id}"]`);
      if (!card) return;
      try {
        def.attach(instance, card, state);
      } catch (err) {
        console.error(`[widgets] attach failed for "${instance.type}"`, err);
      }
    });
  }
};
