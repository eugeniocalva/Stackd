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

  // ── chart lifecycle ─────────────────────────────────────────────────────
  // The dashboard re-renders wholesale via innerHTML, so every canvas element
  // is replaced on each render and Chart.js' own canvas registry can't find the
  // old instance to clean up (it looks the chart up BY canvas element). Tracking
  // instances by widget id is what actually prevents the leak.
  _charts: {},

  _destroyChart(id) {
    const chart = this._charts[id];
    if (chart) {
      try { chart.destroy(); } catch (err) { /* already gone */ }
      delete this._charts[id];
    }
  },

  destroyCharts() {
    Object.keys(this._charts).forEach(id => this._destroyChart(id));
  },

  _mountChart(id, canvas, config) {
    if (!canvas || !window.Chart) return null;
    this._destroyChart(id);
    // Belt and braces: if this exact canvas is somehow still registered, clear it.
    const stale = window.Chart.getChart ? window.Chart.getChart(canvas) : null;
    if (stale) stale.destroy();
    this._charts[id] = new window.Chart(canvas, config);
    return this._charts[id];
  },

  _canvasId(instance) {
    return `widget-canvas-${instance.id}`;
  },

  // ── data helpers ────────────────────────────────────────────────────────
  // The store's aggregations all take the analytics "filters" shape. Widgets
  // are always current-month and always clamped to today, so this builds that
  // one shape rather than each widget hand-rolling it.
  _monthFilters(config) {
    return {
      period: { type: 'month', value: this._todayStr(), start: '', end: '' },
      types: [],
      accounts: (config && config.accountIds) || [],
      categories: [],
      sortOrder: 'desc'
    };
  },

  // Month-to-date, as a custom range. computeNetFlowData clamps to today itself
  // (its clampEnd argument), but the getFilteredTransactions-based aggregations
  // honour the whole calendar month — which would count future-dated members of
  // recurring series as if they had already been spent, and make two widgets
  // disagree about the same month. This is the clamped shape for those.
  _monthToDateFilters(config) {
    const today = this._todayStr();
    return {
      period: { type: 'custom', start: `${today.slice(0, 7)}-01`, end: today, value: today },
      types: [],
      accounts: (config && config.accountIds) || [],
      categories: [],
      sortOrder: 'desc'
    };
  },

  _cfg(instance) {
    const def = this.registry[instance.type];
    return { ...((def && def.defaultConfig) || {}), ...(instance.config || {}) };
  },

  // ── shared config controls ──────────────────────────────────────────────
  _configSection(label, inner) {
    return `
      <div class="widget-config-group">
        <p class="widget-config-label">${this._esc(label)}</p>
        ${inner}
      </div>`;
  },

  _segmented(key, options, value) {
    return `<div class="multi-select-row">${options.map(o => `
      <button type="button" class="multi-select-chip ${o.value === value ? 'active' : ''}"
              data-config-key="${this._esc(key)}" data-config-value="${this._esc(o.value)}"
              aria-pressed="${o.value === value}">${this._esc(o.label)}</button>
    `).join('')}</div>`;
  },

  // Multi-select where an empty array means "all" — the same convention the
  // store's filters use, so an empty selection never means "show nothing".
  _multiChips(key, items, selectedIds) {
    const all = !selectedIds || selectedIds.length === 0;
    return `<div class="multi-select-row">
      <button type="button" class="multi-select-chip ${all ? 'active' : ''}"
              data-config-multi="${this._esc(key)}" data-config-value="__all__"
              aria-pressed="${all}">All</button>
      ${items.map(it => {
        const on = !all && selectedIds.includes(it.id);
        return `<button type="button" class="multi-select-chip ${on ? 'active' : ''}"
                data-config-multi="${this._esc(key)}" data-config-value="${this._esc(it.id)}"
                aria-pressed="${on}">${this._esc(it.name)}</button>`;
      }).join('')}
    </div>`;
  },

  // Wires every shared control above. Registry entries call this from
  // attachConfig so they only have to describe their own extra behaviour.
  attachSharedConfig(root, ctx, onChange) {
    root.querySelectorAll('[data-config-key]').forEach(btn => {
      btn.addEventListener('click', () => {
        const key = btn.dataset.configKey;
        ctx.setConfig({ [key]: btn.dataset.configValue });
        // Lets a widget invalidate dependent fields before the re-render, so a
        // single click never causes two renders.
        if (onChange) onChange(key, btn.dataset.configValue, ctx);
        ctx.rerender();
      });
    });

    root.querySelectorAll('[data-config-multi]').forEach(btn => {
      btn.addEventListener('click', () => {
        const key = btn.dataset.configMulti;
        const val = btn.dataset.configValue;
        const current = ctx.getConfig()[key] || [];
        if (val === '__all__') {
          ctx.setConfig({ [key]: [] });
        } else {
          const next = current.includes(val)
            ? current.filter(v => v !== val)
            : [...current, val];
          ctx.setConfig({ [key]: next });
        }
        ctx.rerender();
      });
    });
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
    },

    incomeExpense: {
      title: 'Income vs Expenses',
      description: 'Track what comes in against what goes out, month by month.',
      icon: 'bar-chart-3',
      sizes: ['small', 'large'],
      hasConfig: true,
      defaultConfig: { accountIds: [] },

      // Last 12 monthly buckets, clamped to today so the current month does not
      // include already-materialised future occurrences of recurring series.
      _buckets(instance) {
        const W = window.Widgets;
        const filters = W._monthFilters(W._cfg(instance));
        return window.Store.computeNetFlowData(filters, W._todayStr()) || [];
      },

      render(instance) {
        const W = window.Widgets;
        const buckets = this._buckets(instance);
        if (buckets.length === 0) return W._emptyState('Not enough data to chart');

        if (instance.size !== 'large') {
          const cur = buckets[buckets.length - 1];
          if (cur.income === 0 && cur.expense === 0) return W._emptyState('Nothing this month');
          const peak = Math.max(cur.income, cur.expense) || 1;
          const bar = (label, value, cls) => `
            <div class="widget-minibar">
              <div class="widget-minibar-head">
                <span class="widget-minibar-label">${W._esc(label)}</span>
                <span class="widget-minibar-value ${cls}">${W._esc(window.Store.formatCurrency(value))}</span>
              </div>
              <div class="widget-minibar-track"><div class="widget-minibar-fill ${cls}" style="width: ${(value / peak) * 100}%;"></div></div>
            </div>`;
          return `
            <div class="widget-stat">
              <span class="widget-stat-value ${cur.net >= 0 ? 'text-income' : 'text-expense'}">${W._esc(window.Store.formatCurrency(cur.net))}</span>
              <span class="widget-stat-label">net · ${W._esc(cur.label)}</span>
            </div>
            <div class="widget-minibars">
              ${bar('In', cur.income, 'text-income')}
              ${bar('Out', cur.expense, 'text-expense')}
            </div>`;
        }

        const recent = buckets.slice(-6);
        if (recent.every(b => b.income === 0 && b.expense === 0)) {
          return W._emptyState('Not enough data to chart');
        }
        return `<div class="widget-chart-wrap"><canvas id="${W._canvasId(instance)}"></canvas></div>`;
      },

      attach(instance, card) {
        const W = window.Widgets;
        card.addEventListener('click', () => {
          if (window.Store.getState().widgetEditMode) return;
          window.Router.navigate('#analytics');
        });

        if (instance.size !== 'large') return;
        const canvas = card.querySelector(`#${W._canvasId(instance)}`);
        if (!canvas) return;

        const recent = this._buckets(instance).slice(-6);
        const theme = window.Components.NetFlowChart._themeColors();
        // Axis rounding shared with the Analytics net-flow chart.
        const yScale = window.Components.NetFlowChart._computeYScale(
          recent.flatMap(b => [b.income, b.expense])
        );

        W._mountChart(instance.id, canvas, {
          type: 'bar',
          data: {
            labels: recent.map(b => b.label),
            datasets: [
              {
                label: 'Income',
                data: recent.map(b => b.income),
                backgroundColor: 'rgba(16, 185, 129, 0.85)',
                borderRadius: 4,
                borderSkipped: false
              },
              {
                label: 'Expenses',
                data: recent.map(b => b.expense),
                backgroundColor: 'rgba(239, 68, 68, 0.85)',
                borderRadius: 4,
                borderSkipped: false
              }
            ]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: { duration: 600, easing: 'easeOutQuart' },
            plugins: {
              legend: {
                display: true,
                position: 'bottom',
                labels: {
                  boxWidth: 8, boxHeight: 8, usePointStyle: true, pointStyle: 'circle',
                  color: theme.tickColor, font: { size: 10, family: 'Manrope', weight: '700' }
                }
              },
              tooltip: {
                backgroundColor: theme.tooltipBg,
                titleColor: theme.tooltipTitle,
                bodyColor: theme.tooltipBody,
                borderColor: theme.tooltipBorder,
                borderWidth: 1,
                padding: 10,
                bodyFont: { family: 'Manrope', size: 12, weight: '700' },
                callbacks: {
                  label: (ctx) => `${ctx.dataset.label}: ${window.Store.formatCurrency(ctx.parsed.y)}`
                }
              }
            },
            scales: {
              x: {
                grid: { display: false },
                ticks: { color: theme.tickColor, font: { size: 9, family: 'Manrope', weight: '700' } }
              },
              y: {
                min: 0,
                max: yScale.max,
                grid: { color: theme.gridColor },
                ticks: {
                  stepSize: yScale.stepSize,
                  color: theme.tickColor,
                  font: { size: 9, family: 'Manrope', weight: '600' },
                  callback: (val) => `${window.Store.getCurrencySymbol()}${Math.abs(val).toLocaleString('en-US', { maximumFractionDigits: 0 })}`
                }
              }
            }
          }
        });
      },

      renderConfig(config, state) {
        const W = window.Widgets;
        return W._configSection('Accounts', W._multiChips('accountIds', state.accounts || [], config.accountIds));
      },

      attachConfig(root, ctx) {
        window.Widgets.attachSharedConfig(root, ctx);
      }
    },

    categories: {
      title: 'Categories',
      description: 'See where your money goes this month, broken down by category.',
      icon: 'pie-chart',
      sizes: ['small', 'large'],
      hasConfig: true,
      // One config covers all four reference variants: top/selected × expense/income.
      defaultConfig: { direction: 'expense', mode: 'top', categoryIds: [], accountIds: [] },

      _data(instance) {
        const W = window.Widgets;
        const cfg = W._cfg(instance);
        const filters = W._monthToDateFilters(cfg);
        if (cfg.mode === 'selected' && cfg.categoryIds.length > 0) {
          filters.categories = cfg.categoryIds;
        }
        const raw = window.Store.computeCategoryDistribution(filters, cfg.direction) || [];
        const donut = window.Components.CategoryDonutChart;
        // Reuse the analytics donut's top-5 + Others capping and colour assignment.
        return donut._assignColors(donut._capData(raw));
      },

      render(instance) {
        const W = window.Widgets;
        const cfg = W._cfg(instance);
        const data = this._data(instance);
        if (data.length === 0) {
          return W._emptyState(cfg.direction === 'income' ? 'No income this month' : 'No spending this month');
        }

        const total = data.reduce((sum, d) => sum + d.amount, 0);
        const donutHtml = `
          <div class="widget-donut">
            <canvas id="${W._canvasId(instance)}"></canvas>
            <div class="widget-donut-center">
              <span class="widget-donut-total">${W._esc(window.Store.formatCurrency(total))}</span>
            </div>
          </div>`;

        if (instance.size !== 'large') return donutHtml;

        return `
          <div class="widget-donut-layout">
            ${donutHtml}
            <div class="widget-donut-legend">
              ${data.map(d => `
                <div class="widget-legend-item">
                  <span class="widget-legend-dot" style="background: ${W._esc(d._color)};"></span>
                  <span class="widget-legend-name">${W._esc(d.name)}</span>
                  <span class="widget-legend-pct">${W._esc(d.percentage.toFixed(1))}%</span>
                </div>`).join('')}
            </div>
          </div>`;
      },

      attach(instance, card) {
        const W = window.Widgets;
        card.addEventListener('click', () => {
          if (window.Store.getState().widgetEditMode) return;
          window.Router.navigate('#analytics');
        });

        const canvas = card.querySelector(`#${W._canvasId(instance)}`);
        if (!canvas) return;
        const data = this._data(instance);
        if (data.length === 0) return;
        const theme = window.Components.NetFlowChart._themeColors();

        W._mountChart(instance.id, canvas, {
          type: 'doughnut',
          data: {
            labels: data.map(d => d.name),
            datasets: [{
              data: data.map(d => d.amount),
              backgroundColor: data.map(d => d._color),
              hoverBackgroundColor: data.map(d => d._hoverColor),
              borderWidth: 2,
              borderColor: 'transparent',
              borderRadius: 4,
              hoverOffset: 6
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '72%',
            animation: { duration: 600, easing: 'easeOutQuart' },
            plugins: {
              legend: { display: false },
              tooltip: {
                backgroundColor: theme.tooltipBg,
                titleColor: theme.tooltipTitle,
                bodyColor: theme.tooltipBody,
                borderColor: theme.tooltipBorder,
                borderWidth: 1,
                padding: 10,
                bodyFont: { family: 'Manrope', size: 12, weight: '700' },
                callbacks: {
                  label: (ctx) => {
                    const totalVal = ctx.dataset.data.reduce((a, b) => a + b, 0);
                    const pct = totalVal > 0 ? ((ctx.parsed / totalVal) * 100).toFixed(1) : 0;
                    return `  ${window.Store.formatCurrency(ctx.parsed)} (${pct}%)`;
                  }
                }
              }
            }
          }
        });
      },

      renderConfig(config, state) {
        const W = window.Widgets;
        const expenseCats = (state.categories || []).filter(c => c.id !== 'cat_balance' &&
          (config.direction === 'income'
            ? (c.typeHint === 'income' || c.typeHint === 'both')
            : (c.typeHint === 'expense' || c.typeHint === 'both')));

        return [
          W._configSection('Show', W._segmented('direction', [
            { value: 'expense', label: 'Spending' },
            { value: 'income', label: 'Income' }
          ], config.direction)),
          W._configSection('Which categories', W._segmented('mode', [
            { value: 'top', label: 'Top categories' },
            { value: 'selected', label: 'Pick categories' }
          ], config.mode)),
          config.mode === 'selected'
            ? W._configSection('Categories', W._multiChips('categoryIds', expenseCats, config.categoryIds))
            : '',
          W._configSection('Accounts', W._multiChips('accountIds', state.accounts || [], config.accountIds))
        ].join('');
      },

      attachConfig(root, ctx) {
        // Switching direction invalidates any picked categories: an expense
        // category id means nothing in the income breakdown.
        window.Widgets.attachSharedConfig(root, ctx, (key) => {
          if (key === 'direction') ctx.setConfig({ categoryIds: [] });
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
    const def = this.registry[instance.type];
    const gearBtn = (def && def.hasConfig) ? `
        <button type="button" class="widget-chrome-btn" data-widget-action="configure" data-widget-id="${id}"
                aria-label="Configure widget">
          <i data-lucide="settings" style="width: 15px; height: 15px;"></i>
        </button>` : '';
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
        ${gearBtn}
        <button type="button" class="widget-size-pill" data-widget-action="toggle-size" data-widget-id="${id}"
                aria-label="Toggle widget size">${isLarge ? 'Wide' : 'Small'}</button>
      </div>`;
  },

  // ── section events ──────────────────────────────────────────────────────
  attachSection(root, state) {
    // The section just re-rendered, so every tracked chart now points at a
    // detached canvas. Drop them all before remounting.
    this.destroyCharts();

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
        case 'configure':
          if (window.Components && window.Components.AddWidgetModal) {
            window.Components.AddWidgetModal.show({ editId: id });
          }
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
