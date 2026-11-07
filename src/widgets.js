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
    return window.I18n.esc(value); // 1.0.2 (BUG-24): one implementation
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

  // Loan figures are integer cents (LoanEngine), transactions are float units.
  // This is the one sanctioned crossing point. (Views._DebtShared.fmtC is the
  // same conversion but lives a layer above us — widgets must not reach into Views.)
  _fmtC(cents) {
    return window.Store.formatCurrency((cents || 0) / 100);
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
    // 1.2.0 (UX-5): every caller is a section teardown (attachSection before
    // a remount, DashboardView.destroy on leaving Home), which is exactly when
    // the drag controller's document listeners and ghost must go too.
    this._endDrag();
  },

  // Set by attachSection for the duration of a same-view remount: charts play
  // their entry animation on the first mount of a dashboard visit, but a
  // dashboard re-render (any dispatch while it is open) must not replay it —
  // with view transitions on top it would read as double motion (v0.73 Phase 4).
  _suppressChartAnimation: false, // v0.93: obsolete — mounts are always animation-free now

  // 1.2.0 (UX-7): true only for the attach loop of an ENTRY render of the
  // dashboard (main.js passes isEntry; DashboardView forwards it). The ring
  // widgets read it to play their one entry sweep; a same-view re-render (any
  // dispatch while Home is open) and the add-widget preview never animate.
  _entryPass: false,

  // 1.2.0 (UX-7): mountOpts.animate lets a ring chart keep the animation
  // object Components.RingChart.config built (entry sweep). Everything else
  // stays animation-free (v0.93).
  _mountChart(id, canvas, config, mountOpts) {
    if (!canvas || !window.Chart) return null;
    this._destroyChart(id);
    // v0.93: widget charts never animate. The 600ms entry animations used to
    // play inside the navigation render pass — i.e. inside the view-transition
    // freeze — stacking motion cost on an already heavy mount.
    if (!config.options) config.options = {};
    if (!(mountOpts && mountOpts.animate)) config.options.animation = false;
    const mount = () => {
      this._destroyChart(id); // a newer mount for this id may have raced in
      // Belt and braces: if this exact canvas is somehow still registered, clear it.
      const stale = window.Chart.getChart ? window.Chart.getChart(canvas) : null;
      if (stale) stale.destroy();
      this._charts[id] = new window.Chart(canvas, config);
    };
    // v0.93: construct one frame later so the freshly swapped DOM paints before
    // Chart.js does its canvas-measuring work. rAF is suspended in hidden
    // documents (background tab, covered WebView), so a short timer races it —
    // whichever fires first mounts, the other is a no-op. A rapid double
    // navigation detaches the canvas before either fires — skip mounting then.
    // Unit tests run on a bare mock window without rAF and take the sync path.
    if (typeof window.requestAnimationFrame === 'function') {
      let ran = false;
      const run = () => {
        if (ran) return;
        ran = true;
        if (canvas.isConnected) mount();
      };
      window.requestAnimationFrame(run);
      setTimeout(run, 48);
      return null;
    }
    mount();
    return this._charts[id];
  },

  // 1.2.0 (UX-6): ids are made selector-safe — the size rail's second
  // preview is '__preview__:large', and `#widget-canvas-__preview__:large`
  // would parse as a pseudo-class.
  _canvasId(instance) {
    return `widget-canvas-${String(instance.id).replace(/[^A-Za-z0-9_-]/g, '-')}`;
  },

  // 1.2.0 (UX-2): the one size a single-size type offers ('' otherwise).
  _onlySize(def) {
    return (def && Array.isArray(def.sizes) && def.sizes.length === 1) ? def.sizes[0] : '';
  },

  // ── data helpers ────────────────────────────────────────────────────────
  // The store's aggregations all take the analytics "filters" shape; this
  // builds it once rather than each widget hand-rolling it. This is the
  // WHOLE-calendar-month shape — the EOM widgets (incomeExpense, savings as
  // of v0.94) use it as-is; the spent-so-far widgets use the clamped
  // month-to-date variant below.
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

  // v0.93: per-render-pass data memo. render() and attach() run back-to-back
  // in one synchronous pass (main.js renderView), but every chart widget used
  // to run its data builder in BOTH — doubling the store-aggregation cost of a
  // navigation to Home. renderSection/renderPreview reset the memo, so entries
  // never survive into a later pass (state may have changed by then).
  _passMemo: {},
  _memoized(instance, key, build) {
    const k = instance.id + ':' + instance.size + ':' + key;
    const m = this._passMemo;
    if (Object.prototype.hasOwnProperty.call(m, k)) return m[k];
    return (m[k] = build());
  },

  // ── shared config controls ──────────────────────────────────────────────
  // Signed percentage pill. A null pct means "no baseline to compare against"
  // (computeBalanceForecast returns null rather than a misleading 0%).
  _deltaBadge(pct) {
    if (pct === null || pct === undefined || !isFinite(pct)) {
      return `<span class="widget-delta">—</span>`;
    }
    // 1.0.1 (BUG-09): locale-aware percent; sign AND colour follow the
    // formatted value, so 0.04 reads a neutral '0.0%', never a green one.
    const text = window.Store.formatPercent(pct, { digits: 1, signed: true });
    const isZero = !/[1-9]/.test(text);
    const cls = isZero ? '' : (pct > 0 ? 'text-income' : 'text-expense');
    return `<span class="widget-delta ${cls}">${this._esc(text)}</span>`;
  },

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
    // 1.0.2 (BUG-36, D-U8-8): an explicit account selection that mixes
    // currencies sums only part of it — say so where it is chosen (the cards
    // keep their fixed heights).
    const excluded = (key === 'accountIds' && !all) ? window.Store.aggregateSelection(selectedIds).excluded : 0;
    return `<div class="multi-select-row">
      <button type="button" class="multi-select-chip ${all ? 'active' : ''}"
              data-config-multi="${this._esc(key)}" data-config-value="__all__"
              aria-pressed="${all}">${window.I18n.t('widget.cfg.all')}</button>
      ${items.map(it => {
        const on = !all && selectedIds.includes(it.id);
        return `<button type="button" class="multi-select-chip ${on ? 'active' : ''}"
                data-config-multi="${this._esc(key)}" data-config-value="${this._esc(it.id)}"
                aria-pressed="${on}">${this._esc(it.name)}</button>`;
      }).join('')}
    </div>${excluded > 0
      // 1.0.2 (live-U8-N1): a sentence, not the uppercase section-label style
      ? `<p class="widget-currency-note" style="margin: var(--space-2) 0 0; font-size: var(--text-xs); color: var(--text-secondary); line-height: 1.4;">${this._esc(window.I18n.t('common.otherCurrencyExcluded', { count: excluded }))}</p>`
      : ''}`;
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
      get title() { return window.I18n.t('widget.latest.title'); },
      get description() { return window.I18n.t('widget.latest.desc'); },
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

        if (txs.length === 0) return W._emptyState(window.I18n.t('widget.empty.noTx'));

        return `<div class="widget-rows">${txs.map(tx => {
          const cat = (state.categories || []).find(c => c.id === tx.categoryId);
          const acc = (state.accounts || []).find(a => a.id === tx.accountId);
          const isExpense = tx.type === 'expense';
          const amountClass = tx.transferRef ? 'text-transfer' : (isExpense ? 'text-expense' : 'text-income');
          const amount = (isExpense ? '-' : '+') + window.Store.formatCurrency(Math.abs(tx.amount), acc && acc.currency); // v1.02: row currency
          const title = cat ? cat.name : window.I18n.t(tx.transferRef ? 'common.transfer' : 'common.uncategorized'); // 1.0.1 (BUG-08) label, key added by the forms unit
          const dateLabel = new Date(`${tx.date}T12:00:00`).toLocaleDateString(window.Store.getLocale(), { month: 'short', day: 'numeric' });

          return `
            <div class="widget-row" data-tx-id="${W._esc(tx.id)}">
              <div class="widget-row-icon"><i data-lucide="${W._esc(cat ? cat.icon : 'receipt')}"></i></div>
              <div class="widget-row-main">
                <span class="widget-row-title">${W._esc(title)}</span>
                ${isLarge ? `<span class="widget-row-sub">${W._esc(acc ? acc.name : window.I18n.t('common.account'))} · ${W._esc(dateLabel)}</span>` : ''}
              </div>
              <span class="widget-row-value ${amountClass}">${W._esc(amount)}</span>
            </div>`;
        }).join('')}</div>`;
      },

      attach(instance, card) {
        card.addEventListener('click', (e) => {
          if (window.Store.getState().widgetEditMode) return;
          // v0.72 Phase 5: feature parity with the removed Recent Activities
          // section — tapping a row jumps to that transaction in History.
          const row = e.target.closest('.widget-row[data-tx-id]');
          if (row) sessionStorage.setItem('scrollToTx', row.dataset.txId);
          window.Router.navigate('#transactions');
        });
      }
    },

    // 1.2.0 (UX-2): every account with its balance today, grouped by type —
    // the MoneyStats account table. Large-only and the one AUTO-HEIGHT card
    // (def.autoHeight → .widget-card--auto): a fixed box would clip the list,
    // and a small auto-height card would stretch its row partner.
    accountBalances: {
      get title() { return window.I18n.t('widget.balances.title'); },
      get description() { return window.I18n.t('widget.balances.desc'); },
      icon: 'landmark',
      sizes: ['large'],
      hasConfig: true,
      defaultConfig: { accountIds: [] },
      autoHeight: true,

      caption() {
        return window.I18n.t('widget.balances.caption');
      },

      // Totals follow the aggregate rule (exclude, never convert): the Total
      // and every subtotal sum only the accounts aggregatePredicate keeps, in
      // aggregateSelection's currency; every other account is still LISTED,
      // in its own currency, and the note says how many were left out.
      _data(instance, state) {
        const W = window.Widgets;
        return W._memoized(instance, 'balances', () => {
          const S = window.Store;
          const cfg = W._cfg(instance);
          const ids = Array.isArray(cfg.accountIds) ? cfg.accountIds : [];
          const pick = ids.length ? new Set(ids) : null;
          const inScope = S.aggregatePredicate(ids);
          const sel = S.aggregateSelection(ids);
          const rows = (state.accounts || [])
            .filter(acc => !pick || pick.has(acc.id))
            .map(acc => ({ acc, balance: S.getAccountBalance(acc.id), inScope: !!inScope(acc.id) }));

          // Store.ACCOUNT_TYPES order; unknown (older/imported) types appended
          // alphabetically; accounts keep state order (alphabetical, _sortData).
          const order = S.ACCOUNT_TYPES || [];
          const byType = new Map();
          rows.forEach(r => {
            const type = r.acc.type || 'Account';
            if (!byType.has(type)) byType.set(type, { type, rows: [], subtotal: 0, inScope: 0 });
            const g = byType.get(type);
            g.rows.push(r);
            if (r.inScope) { g.subtotal += r.balance; g.inScope++; }
          });
          const rank = (t) => { const i = order.indexOf(t); return i === -1 ? order.length : i; };
          const groups = [...byType.values()].sort((a, b) =>
            (rank(a.type) - rank(b.type)) || String(a.type).localeCompare(String(b.type)));

          return {
            groups,
            count: rows.length,
            total: rows.reduce((s, r) => s + (r.inScope ? r.balance : 0), 0),
            excluded: rows.filter(r => !r.inScope).length,
            currency: sel.currency
          };
        });
      },

      render(instance, state) {
        const W = window.Widgets;
        const S = window.Store;
        const data = this._data(instance, state);
        if (data.count === 0) return W._emptyState(window.I18n.t('widget.balances.empty'));

        const signClass = (v) => (v > 0 ? 'text-income' : (v < 0 ? 'text-expense' : ''));
        const money = (v, ccy) => W._esc(S.formatCurrency(v, ccy));

        const groupsHtml = data.groups.map(g => {
          // accountTypeLabel falls through to the RAW stored string for an
          // unknown type (views.js wallets rail does the same) — escape it.
          const label = W._esc(S.accountTypeLabel(g.type));
          const sub = g.inScope > 0 ? money(g.subtotal, data.currency) : '—';
          // 1.2.2 (HG-9): the icon in the account colour on the neutral
          // circle, as on the Home tiles (was a white icon on a colour fill)
          const rows = g.rows.map(({ acc, balance }) => `
              <div class="widget-balances-row" data-account-id="${W._esc(acc.id)}" role="button" tabindex="0">
                <span class="widget-balances-icon"${acc.color ? ` style="color: ${W._esc(acc.color)};"` : ''}><i data-lucide="${W._esc(acc.icon || 'wallet')}"></i></span>
                <span class="widget-balances-name">${W._esc(acc.name)}</span>
                <span class="widget-balances-value ${signClass(balance)}">${money(balance, acc.currency)}</span>
              </div>`).join('');
          return `
            <div class="widget-balances-group">
              <div class="widget-balances-group-head">
                <span class="widget-balances-group-label">${label}</span>
                <span class="widget-balances-group-sub ${g.inScope > 0 ? signClass(g.subtotal) : ''}">${sub}</span>
              </div>
              ${rows}
            </div>`;
        }).join('');

        const note = data.excluded > 0
          ? `<p class="widget-balances-note">${W._esc(window.I18n.t('common.otherCurrencyExcluded', { count: data.excluded }))}</p>`
          : '';

        return `
          <div class="widget-balances">
            <div class="widget-balances-total">
              <span class="widget-balances-total-label">${W._esc(window.I18n.t('widget.balances.total'))}</span>
              <span class="widget-balances-total-value ${signClass(data.total)}">${money(data.total, data.currency)}</span>
            </div>
            ${groupsHtml}
            ${note}
          </div>`;
      },

      attach(instance, card) {
        // A row opens that account in History (the wallets rail's tap).
        const open = (e) => {
          if (window.Store.getState().widgetEditMode) return false;
          const row = e.target && e.target.closest ? e.target.closest('.widget-balances-row[data-account-id]') : null;
          if (!row) return false;
          window.Router.navigate(`#transactions?account=${encodeURIComponent(row.dataset.accountId)}`);
          return true;
        };
        card.addEventListener('click', open);
        card.addEventListener('keydown', (e) => {
          if ((e.key === 'Enter' || e.key === ' ') && open(e)) e.preventDefault();
        });
      },

      renderConfig(config, state) {
        const W = window.Widgets;
        return W._configSection(window.I18n.t('others.accounts'), W._multiChips('accountIds', state.accounts || [], config.accountIds));
      },

      attachConfig(root, ctx) {
        window.Widgets.attachSharedConfig(root, ctx);
      }
    },

    incomeExpense: {
      get title() { return window.I18n.t('widget.netflow.title'); },
      get description() { return window.I18n.t('widget.netflow.desc'); },
      icon: 'bar-chart-3',
      sizes: ['small', 'large'],
      hasConfig: true,
      defaultConfig: { accountIds: [] },

      // v0.94: values are whole-month (EOM) — say so on the large card.
      caption(instance) {
        return instance.size === 'large' ? window.I18n.t('widget.eomCaption') : '';
      },

      // Last 12 monthly buckets, WHOLE calendar months (v0.82): the current
      // month deliberately includes already-materialised future occurrences of
      // recurring series, so the widget answers "how does this month end up",
      // not "where am I so far". This intentionally diverges from the
      // month-to-date widgets (categories, fiftyThirtyTwenty — savings joined
      // the EOM side in v0.94) — see docs/home-widgets-plan.md §8b.
      _buckets(instance) {
        const W = window.Widgets;
        return W._memoized(instance, 'buckets', () => {
          const filters = W._monthFilters(W._cfg(instance));
          return window.Store.computeNetFlowData(filters) || [];
        });
      },

      render(instance) {
        const W = window.Widgets;
        const buckets = this._buckets(instance);
        if (buckets.length === 0) return W._emptyState(window.I18n.t('widget.empty.notEnough'));
        const ccy = window.Store.aggregateSelection(W._cfg(instance).accountIds || []).currency; // 1.0.2 (BUG-63)

        if (instance.size !== 'large') {
          const cur = buckets[buckets.length - 1];
          if (cur.income === 0 && cur.expense === 0) return W._emptyState(window.I18n.t('widget.empty.nothingMonth'));
          const peak = Math.max(cur.income, cur.expense) || 1;
          const bar = (label, value, cls) => `
            <div class="widget-minibar">
              <div class="widget-minibar-head">
                <span class="widget-minibar-label">${W._esc(label)}</span>
                <span class="widget-minibar-value ${cls}">${W._esc(window.Store.formatCurrency(value, ccy))}</span>
              </div>
              <div class="widget-minibar-track"><div class="widget-minibar-fill ${cls}" style="width: ${(value / peak) * 100}%;"></div></div>
            </div>`;
          return `
            <div class="widget-stat">
              <span class="widget-stat-value ${cur.net >= 0 ? 'text-income' : 'text-expense'}">${W._esc(window.Store.formatCurrency(cur.net, ccy))}</span>
              <span class="widget-stat-label">${W._esc(window.I18n.t('widget.netflow.net'))} · ${W._esc(cur.label)} · ${W._esc(window.I18n.t('widget.eomShort'))}</span>
            </div>
            <div class="widget-minibars">
              ${bar(window.I18n.t('widget.netflow.in'), cur.income, 'text-income')}
              ${bar(window.I18n.t('widget.netflow.out'), cur.expense, 'text-expense')}
            </div>`;
        }

        const recent = buckets.slice(-6);
        if (recent.every(b => b.income === 0 && b.expense === 0)) {
          return W._emptyState(window.I18n.t('widget.empty.notEnough'));
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
        // 1.0.2 (BUG-63): the selection's currency, captured for this mount
        const ccy = window.Store.aggregateSelection(W._cfg(instance).accountIds || []).currency;
        // Axis rounding shared with the Analytics net-flow chart.
        const yScale = window.Components.NetFlowChart._computeYScale(
          recent.flatMap(b => [b.income, b.expense])
        );

        W._mountChart(instance.id, canvas, {
          type: 'bar',
          data: {
            labels: recent.map(b => b.label),
            datasets: [
              // 1.2.2 (HG-6): the shared bar look — theme trend pair, solid, rounded
              {
                label: window.I18n.t('form.income'),
                data: recent.map(b => b.income),
                backgroundColor: window.Components.NetFlowChart.barFill(1, theme),
                borderRadius: window.Components.NetFlowChart.BAR_RADIUS,
                borderSkipped: false
              },
              {
                label: window.I18n.t('charts.expenses'),
                data: recent.map(b => b.expense),
                backgroundColor: window.Components.NetFlowChart.barFill(-1, theme),
                borderRadius: window.Components.NetFlowChart.BAR_RADIUS,
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
                  color: theme.tickColor, font: { size: 11, family: 'Manrope', weight: '700' }
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
                  label: (ctx) => `${ctx.dataset.label}: ${window.Store.formatCurrency(ctx.parsed.y, ccy)}`
                }
              }
            },
            scales: {
              x: {
                grid: { display: false },
                ticks: { color: theme.tickColor, font: { size: 10, family: 'Manrope', weight: '700' } }
              },
              y: {
                min: 0,
                max: yScale.max,
                border: { display: false },
                grid: window.Components.NetFlowChart.quietGrid(theme), // 1.2.2 (HG-6)
                ticks: {
                  stepSize: yScale.stepSize,
                  color: theme.tickColor,
                  font: { size: 10, family: 'Manrope', weight: '600' },
                  callback: (val) => `${window.Store.getCurrencySymbol(ccy)}${Math.abs(val).toLocaleString(window.Store.getLocale(), { maximumFractionDigits: 0 })}`
                }
              }
            }
          }
        });
      },

      renderConfig(config, state) {
        const W = window.Widgets;
        return W._configSection(window.I18n.t('others.accounts'), W._multiChips('accountIds', state.accounts || [], config.accountIds));
      },

      attachConfig(root, ctx) {
        window.Widgets.attachSharedConfig(root, ctx);
      }
    },

    categories: {
      get title() { return window.I18n.t('widget.categories.title'); },
      get description() { return window.I18n.t('widget.categories.desc'); },
      icon: 'pie-chart',
      sizes: ['small', 'large'],
      hasConfig: true,
      // One config covers all four reference variants: top/selected × expense/income.
      defaultConfig: { direction: 'expense', mode: 'top', categoryIds: [], accountIds: [] },

      _data(instance) {
        const W = window.Widgets;
        return W._memoized(instance, 'data', () => {
          const cfg = W._cfg(instance);
          const filters = W._monthToDateFilters(cfg);
          if (cfg.mode === 'selected' && cfg.categoryIds.length > 0) {
            filters.categories = cfg.categoryIds;
          }
          const raw = window.Store.computeCategoryDistribution(filters, cfg.direction) || [];
          const donut = window.Components.CategoryDonutChart;
          // Reuse the analytics donut's top-5 + Others capping and colour assignment.
          return donut._assignColors(donut._capData(raw));
        });
      },

      render(instance) {
        const W = window.Widgets;
        const cfg = W._cfg(instance);
        const data = this._data(instance);
        if (data.length === 0) {
          return W._emptyState(window.I18n.t(cfg.direction === 'income' ? 'widget.empty.noIncome' : 'widget.empty.noSpending'));
        }

        const total = data.reduce((sum, d) => sum + d.amount, 0);
        const ccy = window.Store.aggregateSelection(cfg.accountIds || []).currency; // 1.0.2 (BUG-63)
        const donutHtml = `
          <div class="widget-donut">
            <canvas id="${W._canvasId(instance)}"></canvas>
            <div class="widget-donut-center">
              <span class="widget-donut-total">${W._esc(window.Store.formatCurrency(total, ccy))}</span>
            </div>
          </div>`;

        if (instance.size !== 'large') return donutHtml;

        return `
          <div class="widget-donut-layout">
            ${donutHtml}
            <div class="widget-donut-legend">
              ${data.map(d => /* 1.2.2 (HG-5): the arc colour on the icon (was a dot) */ `
                <div class="widget-legend-item">
                  <span class="widget-legend-icon" style="color: ${W._esc(d._color)};" aria-hidden="true"><i data-lucide="${W._esc(d.icon || 'circle')}"></i></span>
                  <span class="widget-legend-name">${W._esc(d.name)}</span>
                  <span class="widget-legend-pct">${W._esc(window.Store.formatPercent(d.percentage, { digits: 1 }))}</span>
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

        // 1.2.0 (UX-7): the shared ring look; the sweep only on a Home entry
        // render (W._entryPass). 1.2.2 (HG-5): no icon badges on the ring.
        // 1.2.2 (HG-8 P3): no tooltip and no Chart.js events — the ring is too
        // small for the focus badge, a tap opens Analytics (whose ring has tap
        // to focus) and a long press starts the widget drag. The large card's
        // legend carries the names and shares.
        const config = window.Components.RingChart.config({
          type: 'doughnut',
          data: {
            labels: data.map(d => d.name),
            datasets: [{
              data: data.map(d => d.amount),
              backgroundColor: data.map(d => d._color),
              hoverOffset: 0
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            events: [],
            plugins: {
              legend: { display: false },
              tooltip: { enabled: false }
            }
          }
        }, {
          animate: W._entryPass,
          delay: 250 // past the view-transition snapshot
        });
        W._mountChart(instance.id, canvas, config, { animate: !!config.options.animation });
      },

      renderConfig(config, state) {
        const W = window.Widgets;
        const expenseCats = (state.categories || []).filter(c => c.id !== 'cat_balance' &&
          (config.direction === 'income'
            ? (c.typeHint === 'income' || c.typeHint === 'both')
            : (c.typeHint === 'expense' || c.typeHint === 'both')));

        return [
          W._configSection(window.I18n.t('widget.cfg.show'), W._segmented('direction', [
            { value: 'expense', label: window.I18n.t('widget.cfg.spending') },
            { value: 'income', label: window.I18n.t('form.income') }
          ], config.direction)),
          W._configSection(window.I18n.t('widget.cfg.whichCategories'), W._segmented('mode', [
            { value: 'top', label: window.I18n.t('widget.cfg.topCategories') },
            { value: 'selected', label: window.I18n.t('widget.cfg.pickCategories') }
          ], config.mode)),
          config.mode === 'selected'
            ? W._configSection(window.I18n.t('others.categories'), W._multiChips('categoryIds', expenseCats, config.categoryIds))
            : '',
          W._configSection(window.I18n.t('others.accounts'), W._multiChips('accountIds', state.accounts || [], config.accountIds))
        ].join('');
      },

      attachConfig(root, ctx) {
        // Switching direction invalidates any picked categories: an expense
        // category id means nothing in the income breakdown.
        window.Widgets.attachSharedConfig(root, ctx, (key) => {
          if (key === 'direction') ctx.setConfig({ categoryIds: [] });
        });
      }
    },

    netWorth: {
      get title() { return window.I18n.t('widget.networth.title'); },
      get description() { return window.I18n.t('widget.networth.desc'); },
      icon: 'trending-up',
      sizes: ['small', 'large'],
      hasConfig: true,
      defaultConfig: { accountIds: [] },

      // computeGraphBalances already clamps every point to today, so future
      // recurring occurrences never inflate the trend.
      _points(instance) {
        const W = window.Widgets;
        return W._memoized(instance, 'points', () => {
          const result = window.Store.computeGraphBalances({
            interval: 'monthly',
            accountIds: W._cfg(instance).accountIds || [],
            categoryIds: []
          });
          return (result && result.points) ? result.points.slice(-6) : [];
        });
      },

      render(instance) {
        const W = window.Widgets;
        const points = this._points(instance);
        if (points.length === 0) return W._emptyState(window.I18n.t('widget.empty.noHistory'));

        const latest = points[points.length - 1].balance;
        const forecast = window.Store.computeBalanceForecast(W._cfg(instance).accountIds || []);
        const ccy = window.Store.aggregateSelection(W._cfg(instance).accountIds || []).currency; // 1.0.2 (BUG-63)

        return `
          <div class="widget-stat">
            <span class="widget-stat-value">${W._esc(window.Store.formatCurrency(latest, ccy))}</span>
            <span class="widget-stat-label">${window.I18n.t('dash.vsStartOfMonth', { pct: W._deltaBadge(forecast.todayVariation) })}</span>
          </div>
          <div class="widget-chart-wrap ${instance.size === 'large' ? '' : 'widget-chart-wrap--spark'}">
            <canvas id="${W._canvasId(instance)}"></canvas>
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
        const points = this._points(instance);
        if (points.length === 0) return;

        const isLarge = instance.size === 'large';
        const theme = window.Components.NetFlowChart._themeColors();
        const line = theme.isDark ? '#38bdf8' : '#0284c7';
        const ccy = window.Store.aggregateSelection(W._cfg(instance).accountIds || []).currency; // 1.0.2 (BUG-63)

        W._mountChart(instance.id, canvas, {
          type: 'line',
          data: {
            labels: points.map(p => p.label),
            datasets: [{
              data: points.map(p => p.balance),
              borderColor: line,
              backgroundColor: theme.isDark ? 'rgba(56, 189, 248, 0.16)' : 'rgba(2, 132, 199, 0.12)',
              borderWidth: 2,
              fill: true,
              tension: 0.35,
              pointRadius: 0,
              pointHoverRadius: isLarge ? 4 : 0
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: { duration: 600, easing: 'easeOutQuart' },
            plugins: {
              legend: { display: false },
              // A sparkline has no axes to read a value against, so a tooltip
              // there would be pointing at nothing.
              tooltip: isLarge ? {
                backgroundColor: theme.tooltipBg,
                titleColor: theme.tooltipTitle,
                bodyColor: theme.tooltipBody,
                borderColor: theme.tooltipBorder,
                borderWidth: 1,
                padding: 10,
                displayColors: false,
                bodyFont: { family: 'Manrope', size: 12, weight: '700' },
                callbacks: { label: (ctx) => window.Store.formatCurrency(ctx.parsed.y, ccy) }
              } : { enabled: false }
            },
            scales: {
              x: {
                display: isLarge,
                grid: { display: false },
                ticks: { color: theme.tickColor, font: { size: 10, family: 'Manrope', weight: '700' } }
              },
              y: { display: false }
            }
          }
        });
      },

      renderConfig(config, state) {
        const W = window.Widgets;
        return W._configSection(window.I18n.t('others.accounts'), W._multiChips('accountIds', state.accounts || [], config.accountIds));
      },

      attachConfig(root, ctx) {
        window.Widgets.attachSharedConfig(root, ctx);
      }
    },

    savings: {
      get title() { return window.I18n.t('widget.savings.title'); },
      get description() { return window.I18n.t('widget.savings.desc'); },
      icon: 'piggy-bank',
      sizes: ['small', 'large'],
      hasConfig: true,
      defaultConfig: { accountIds: [] },

      // v0.94: values are whole-month (EOM) — say so on the large card.
      caption(instance) {
        return instance.size === 'large' ? window.I18n.t('widget.eomCaption') : '';
      },

      // Net saved per month = income - expenses, WHOLE calendar months.
      // v0.94: joined incomeExpense on the EOM side — the current month
      // includes already-materialised future occurrences of recurring series
      // (salary on the 29th counts), answering "how does this month end up"
      // instead of a mid-month negative that flips green after payday. The
      // v0.82 MTD divergence is gone; the two widgets can no longer disagree.
      _buckets(instance) {
        const W = window.Widgets;
        return W._memoized(instance, 'buckets', () => {
          const all = window.Store.computeNetFlowData(W._monthFilters(W._cfg(instance))) || [];
          return all.slice(-6);
        });
      },

      render(instance) {
        const W = window.Widgets;
        const buckets = this._buckets(instance);
        if (buckets.length === 0) return W._emptyState(window.I18n.t('widget.empty.notEnoughYet'));

        const current = buckets[buckets.length - 1];
        const previous = buckets.length > 1 ? buckets[buckets.length - 2] : null;
        // Percentage change against the previous month's net. A zero (or
        // absent) baseline has no meaningful percentage — show a dash instead.
        const pct = (previous && previous.net !== 0)
          ? ((current.net - previous.net) / Math.abs(previous.net)) * 100
          : null;

        const ccy = window.Store.aggregateSelection(W._cfg(instance).accountIds || []).currency; // 1.0.2 (BUG-63)
        const head = `
          <div class="widget-stat">
            <span class="widget-stat-value ${current.net >= 0 ? 'text-income' : 'text-expense'}">${W._esc(window.Store.formatCurrency(current.net, ccy))}</span>
            <span class="widget-stat-label">${previous
              ? window.I18n.t('widget.savings.vsMonth', { pct: W._deltaBadge(pct), month: W._esc(previous.label) })
              : window.I18n.t('widget.savings.vsPrev', { pct: W._deltaBadge(pct) })}</span>
          </div>`;

        if (instance.size !== 'large') {
          if (buckets.every(b => b.net === 0)) return head;
          return `${head}<div class="widget-chart-wrap widget-chart-wrap--spark"><canvas id="${W._canvasId(instance)}"></canvas></div>`;
        }
        return `${head}<div class="widget-chart-wrap"><canvas id="${W._canvasId(instance)}"></canvas></div>`;
      },

      attach(instance, card) {
        const W = window.Widgets;
        card.addEventListener('click', () => {
          if (window.Store.getState().widgetEditMode) return;
          window.Router.navigate('#analytics');
        });

        const canvas = card.querySelector(`#${W._canvasId(instance)}`);
        if (!canvas) return;
        const buckets = this._buckets(instance);
        if (buckets.length === 0) return;

        const isLarge = instance.size === 'large';
        const theme = window.Components.NetFlowChart._themeColors();
        const yScale = window.Components.NetFlowChart._computeYScale(buckets.map(b => b.net));
        const ccy = window.Store.aggregateSelection(W._cfg(instance).accountIds || []).currency; // 1.0.2 (BUG-63)

        W._mountChart(instance.id, canvas, {
          type: 'bar',
          data: {
            labels: buckets.map(b => b.label),
            datasets: [{
              data: buckets.map(b => b.net),
              // Colour per bar: a month where you overspent should read as a loss.
              // 1.2.2 (HG-6): the shared bar look (theme trend pair, solid, rounded)
              backgroundColor: buckets.map(b => window.Components.NetFlowChart.barFill(b.net, theme)),
              borderRadius: window.Components.NetFlowChart.BAR_RADIUS,
              borderSkipped: false,
              barPercentage: 0.72,
              categoryPercentage: 0.8
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: { duration: 600, easing: 'easeOutQuart' },
            plugins: {
              legend: { display: false },
              tooltip: isLarge ? {
                backgroundColor: theme.tooltipBg,
                titleColor: theme.tooltipTitle,
                bodyColor: theme.tooltipBody,
                borderColor: theme.tooltipBorder,
                borderWidth: 1,
                padding: 10,
                displayColors: false,
                bodyFont: { family: 'Manrope', size: 12, weight: '700' },
                callbacks: { label: (ctx) => window.I18n.t('widget.savedLabel', { amount: window.Store.formatCurrency(ctx.parsed.y, ccy) }) }
              } : { enabled: false }
            },
            scales: {
              x: {
                display: isLarge,
                grid: { display: false },
                ticks: { color: theme.tickColor, font: { size: 10, family: 'Manrope', weight: '700' } }
              },
              y: {
                display: isLarge,
                min: yScale.min,
                max: yScale.max,
                border: { display: false },
                grid: window.Components.NetFlowChart.quietGrid(theme), // 1.2.2 (HG-6)
                ticks: {
                  stepSize: yScale.stepSize,
                  color: theme.tickColor,
                  font: { size: 10, family: 'Manrope', weight: '600' },
                  callback: (val) => `${val < 0 ? '-' : ''}${window.Store.getCurrencySymbol(ccy)}${Math.abs(val).toLocaleString(window.Store.getLocale(), { maximumFractionDigits: 0 })}`
                }
              }
            }
          }
        });
      },

      renderConfig(config, state) {
        const W = window.Widgets;
        return W._configSection(window.I18n.t('others.accounts'), W._multiChips('accountIds', state.accounts || [], config.accountIds));
      },

      attachConfig(root, ctx) {
        window.Widgets.attachSharedConfig(root, ctx);
      }
    },

    upcoming: {
      get title() { return window.I18n.t('widget.upcoming.title'); },
      get description() { return window.I18n.t('widget.upcoming.desc'); },
      icon: 'calendar',
      sizes: ['small', 'large'],
      hasConfig: true,
      // horizonDays is a STRING on purpose: _segmented round-trips values
      // through dataset attributes, which are always strings — a numeric
      // default would never match its chip. parseInt at the one use site.
      defaultConfig: { accountIds: [], horizonDays: '30' },

      // Everything inside the horizon, BEFORE transfer dedupe and slicing.
      // Kept separate because the net-impact figure must use the un-deduped
      // set (a transfer's two legs cancel there), while the visible list
      // wants one row per occurrence.
      _matches(instance, state) {
        const W = window.Widgets;
        const cfg = W._cfg(instance);
        const today = W._todayStr();
        const days = parseInt(cfg.horizonDays, 10) || 30;
        // Store's noon-anchored date stepper — the DST-safe way to add days.
        const horizon = window.Store._calculateNextRecurrenceDate(today, days, 'days');
        const accountIds = cfg.accountIds || [];

        // Mirrors Store.computeUpcomingImpact's predicate, plus t.recurrence:
        // this widget lists SCHEDULED payments (materialised series members),
        // not manually future-dated one-offs — docs/home-widgets-plan.md §4.1.
        const txs = (state.transactions || []).filter(t =>
          t.recurrence &&
          t.date > today && t.date <= horizon &&
          t.isPaid !== false &&
          !window.Store._isTxBeforeOpeningDate(t) &&
          // v1.02: unscoped widget = primary-currency accounts only (the net
          // footer sums these rows; exclude-never-convert, plan §6)
          (accountIds.length === 0 ? window.Store._isPrimaryAccount(t.accountId) : accountIds.includes(t.accountId))
        );

        // Untracked active loans: a tracked loan's payments already exist as
        // series members caught above — adding nextPayment would double-count.
        // The guard MUST be the read-through (a deleted series un-tracks the
        // loan even though linkedSeriesId dangles forever).
        // Synthetic rows carry no accountId, so they cannot honour an account
        // filter — they appear only in the unfiltered view rather than
        // pretending to belong to whichever account is selected.
        const loanRows = [];
        if (accountIds.length === 0) {
          (state.loans || []).forEach(loan => {
            if (loan.kind === 'sim') return;
            if (window.Store.getLoanLinkedTransactions(loan) !== null) return;
            const progress = window.Store.getLoanProgress(loan);
            if (!progress || !progress.nextPayment) return;
            const np = progress.nextPayment;
            if (np.date <= today || np.date > horizon) return;
            loanRows.push({ isLoan: true, date: np.date, amount: np.amountC / 100, name: loan.name });
          });
        }

        return { txs, loanRows, days };
      },

      // One row per occurrence: transfer pairs collapse onto the expense leg
      // (the armed generator and the codebase's canonical leg). transferRef is
      // the per-occurrence pair key — seriesId would collapse the whole series.
      _dedupe(txs) {
        const rows = [];
        const seenPairs = new Set();
        txs.forEach(t => {
          if (!t.transferRef) { rows.push(t); return; }
          if (seenPairs.has(t.transferRef)) return;
          seenPairs.add(t.transferRef);
          const legs = txs.filter(o => o.transferRef === t.transferRef);
          rows.push(legs.find(l => l.type === 'expense') || legs[0]);
        });
        return rows;
      },

      render(instance, state) {
        const W = window.Widgets;
        const isLarge = instance.size === 'large';
        const { txs, loanRows, days } = this._matches(instance, state);

        const merged = [...this._dedupe(txs), ...loanRows]
          // Explicit ascending sort: state.transactions order follows the
          // user's History preference (desc by default) — not an invariant.
          .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

        if (merged.length === 0) {
          return W._emptyState(window.I18n.t('widget.empty.nothingScheduled', { count: days }));
        }

        const limit = isLarge ? 5 : 3;
        const debtCat = (state.categories || []).find(c => c.id === 'cat_debt');

        const rowsHtml = merged.slice(0, limit).map(row => {
          const dateLabel = new Date(`${row.date}T12:00:00`).toLocaleDateString(window.Store.getLocale(), { month: 'short', day: 'numeric' });
          let icon, title, amountHtml, sub;

          if (row.isLoan) {
            icon = debtCat ? debtCat.icon : 'landmark';
            title = row.name;
            amountHtml = `<span class="widget-row-value text-expense">-${W._esc(window.Store.formatCurrency(row.amount))}</span>`;
            sub = isLarge ? window.I18n.t('widget.upcoming.loanSub', { date: dateLabel }) : dateLabel; // 1.0.1 (BUG-09)
          } else {
            const cat = (state.categories || []).find(c => c.id === row.categoryId);
            const acc = (state.accounts || []).find(a => a.id === row.accountId);
            const isExpense = row.type === 'expense';
            const cls = row.transferRef ? 'text-transfer' : (isExpense ? 'text-expense' : 'text-income');
            icon = row.transferRef ? 'arrow-up-down' : (cat ? cat.icon : 'receipt');
            title = cat ? cat.name : window.I18n.t(row.transferRef ? 'common.transfer' : 'common.uncategorized'); // 1.0.1 (BUG-08) label
            // 1.0.2 (BUG-36, D-U8-13): each row in its own account's currency (as Latest)
            amountHtml = `<span class="widget-row-value ${cls}">${isExpense ? '-' : '+'}${W._esc(window.Store.formatCurrency(Math.abs(row.amount), acc && acc.currency))}</span>`;
            sub = isLarge ? `${acc ? acc.name : window.I18n.t('common.account')} · ${dateLabel}` : dateLabel;
          }

          return `
            <div class="widget-row">
              <div class="widget-row-icon"><i data-lucide="${W._esc(icon)}"></i></div>
              <div class="widget-row-main">
                <span class="widget-row-title">${W._esc(title)}</span>
                <span class="widget-row-sub">${W._esc(sub)}</span>
              </div>
              ${amountHtml}
            </div>`;
        }).join('');

        // Net impact over the whole horizon (not just the sliced rows), from
        // the UN-deduped set so transfer legs cancel — the same signed sum
        // computeUpcomingImpact uses. Loans are always outflows.
        let footer = '';
        if (isLarge) {
          // 1.0.2 (BUG-36, D-U8-13): the list keeps every selected account's
          // rows; only the SUM leaves out the accounts a mixed selection
          // excludes, and it reads in the selection's currency.
          const accountIds = W._cfg(instance).accountIds || [];
          const inScope = window.Store.aggregatePredicate(accountIds);
          const net = txs.filter(t => inScope(t.accountId)).reduce((sum, t) =>
            window.Store._isPositiveTx(t) ? sum + t.amount : sum - t.amount, 0)
            - loanRows.reduce((sum, l) => sum + l.amount, 0);
          const cls = net > 0 ? 'text-income' : (net < 0 ? 'text-expense' : '');
          footer = `
            <div class="widget-upcoming-footer">
              <span class="widget-stat-label">${W._esc(window.I18n.t('widget.upcoming.netImpact', { count: days }))}</span>
              <span class="widget-row-value ${cls}">${net > 0 ? '+' : ''}${W._esc(window.Store.formatCurrency(net, window.Store.aggregateSelection(accountIds).currency))}</span>
            </div>`;
        }

        return `<div class="widget-rows">${rowsHtml}</div>${footer}`;
      },

      attach(instance, card) {
        card.addEventListener('click', () => {
          if (window.Store.getState().widgetEditMode) return;
          window.Router.navigate('#transactions');
        });
      },

      renderConfig(config, state) {
        const W = window.Widgets;
        return [
          W._configSection(window.I18n.t('widget.cfg.lookAhead'), W._segmented('horizonDays', [
            { value: '7', label: window.I18n.t('widget.cfg.days', { count: 7 }) },
            { value: '30', label: window.I18n.t('widget.cfg.days', { count: 30 }) },
            { value: '60', label: window.I18n.t('widget.cfg.days', { count: 60 }) }
          ], config.horizonDays)),
          W._configSection(window.I18n.t('others.accounts'), W._multiChips('accountIds', state.accounts || [], config.accountIds))
        ].join('');
      },

      attachConfig(root, ctx) {
        window.Widgets.attachSharedConfig(root, ctx);
      }
    },

    budgets: {
      get title() { return window.I18n.t('widget.budget.title'); },
      get description() { return window.I18n.t('widget.budget.desc'); },
      icon: 'target',
      sizes: ['small', 'large'],
      hasConfig: true,
      // No accountIds on purpose: getBudgetForMonth has no account dimension,
      // so an account chip would render, persist and change nothing.
      defaultConfig: { mode: 'all', categoryIds: [] },

      // Active budgets for the current month. All rules live in
      // getBudgetForMonth (date bounds, cumulative carryover) — never
      // recompute them. The one rule that must live here: allocated > 0.
      // "Deleting" a budget writes amount: 0 but keeps the record, and that
      // record still reports the category's REAL spend — guarding on spent or
      // finalLimit would either count un-budgeted spending or drop a live
      // cumulative budget that is deep in the red (finalLimit <= 0).
      _rows(instance, state) {
        const W = window.Widgets;
        return W._memoized(instance, 'rows', () => {
          const cfg = W._cfg(instance);
          const ym = W._todayStr().slice(0, 7);
          const cats = state.categories || [];

          const rows = (state.budgets || []).map(b => {
            const cat = cats.find(c => c.id === b.categoryId);
            if (!cat) return null;                       // orphaned by DELETE_CATEGORY
            if (cat.id === 'cat_balance') return null;   // adjustment pseudo-category
            if (cat.typeHint === 'income') return null;  // budgets are expense-only
            if (cfg.mode === 'selected' && cfg.categoryIds.length > 0 && !cfg.categoryIds.includes(cat.id)) return null;
            const bdg = window.Store.getBudgetForMonth(cat.id, ym);
            if (bdg.allocated <= 0) return null;
            return { cat, bdg };
          }).filter(Boolean);

          // Most at-risk first. A non-positive limit with real spend is the
          // worst state there is (cumulative budget in the red).
          const usage = (r) => r.bdg.finalLimit > 0
            ? r.bdg.spent / r.bdg.finalLimit
            : (r.bdg.spent > 0 ? Infinity : 0);
          rows.sort((a, b) => usage(b) - usage(a));
          return rows;
        });
      },

      _totals(rows) {
        return {
          limit: rows.reduce((s, r) => s + r.bdg.finalLimit, 0),
          spent: rows.reduce((s, r) => s + r.bdg.spent, 0)
        };
      },

      render(instance, state) {
        const W = window.Widgets;
        const rows = this._rows(instance, state);
        if (rows.length === 0) return W._emptyState(window.I18n.t('widget.empty.noBudgets'));

        const { limit, spent } = this._totals(rows);

        if (instance.size !== 'large') {
          // 1.0.3 (BUG-164) over a non-positive total limit: how much over, not '—'
          const totalOverC = Math.round((spent - limit) * 100);
          const pctLabel = limit > 0 ? window.Store.formatPercent((spent / limit) * 100) // 1.0.1 (BUG-09)
            : (totalOverC > 0 ? window.I18n.t('budget.overBy', { amount: window.Store.formatCurrency(totalOverC / 100) }) : '—');
          return `
            <div class="widget-donut">
              <canvas id="${W._canvasId(instance)}"></canvas>
              <div class="widget-donut-center">
                <span class="widget-donut-total">${W._esc(pctLabel)}</span>
              </div>
            </div>`;
        }

        // Per-category bars, BudgetView's exact semantics (views.js renderList):
        // width capped at 100 and forced to 0 for a non-positive limit; isOver
        // computed independently so a negative-limit category shows a 0% RED bar.
        // Capped at 4 since v0.73 Phase 2: the card height is fixed, and 4 bars
        // plus the "+N more" line is what fits the box.
        const bars = rows.slice(0, 4).map(r => {
          // 1.0.1 (BUG-13): the cap is for the BAR only — the label shows the
          // real usage ('250%'), '—' when the effective limit is not positive.
          // isOver compares in cents so float drift never flips the colour.
          const usedPct = r.bdg.finalLimit > 0 ? (r.bdg.spent / r.bdg.finalLimit) * 100 : null;
          const overC = Math.round((r.bdg.spent - r.bdg.finalLimit) * 100);
          const isOver = overC > 0;
          // 1.0.3 (BUG-164) over a non-positive limit the bar is full, and the
          // label says how much over (it was an empty bar and '—')
          const pct = usedPct === null ? (isOver ? 100 : 0) : Math.min(usedPct, 100);
          const valueLabel = usedPct === null && isOver
            ? window.I18n.t('budget.overBy', { amount: window.Store.formatCurrency(overC / 100) })
            : window.Store.formatPercent(usedPct);
          // v0.83: bar fills keep the vivid --color-expense (graphics, not
          // text); the pct TEXT uses the AA-contrast pair — the raw red fails
          // 4.5:1 on light cards and the amber literal failed both themes.
          const barColor = isOver ? 'var(--color-expense)' : 'var(--color-primary)';
          const pctColor = isOver || pct >= 90 ? 'var(--color-expense-val)' : pct >= 75 ? 'var(--color-warning-text)' : 'var(--text-secondary)';
          return `
            <div class="widget-minibar">
              <div class="widget-minibar-head">
                <span class="widget-minibar-label">${W._esc(r.cat.name)}</span>
                <span class="widget-minibar-value" style="color: ${pctColor};">${W._esc(valueLabel)}</span>
              </div>
              <div class="widget-minibar-track">
                <div class="widget-minibar-fill" style="width: ${pct}%; color: ${barColor};"></div>
              </div>
            </div>`;
        }).join('');

        const overflow = rows.length > 4
          ? `<span class="widget-stat-label" style="margin-top: var(--space-2); display: block;">${W._esc(window.I18n.t('widget.budget.moreInGoals', { count: rows.length - 4 }))}</span>`
          : '';

        return `
          <div class="widget-stat">
            <span class="widget-stat-value">${W._esc(window.Store.formatCurrency(spent))}</span>
            <span class="widget-stat-label">${window.I18n.t('widget.budget.ofBudgeted', { amount: W._esc(window.Store.formatCurrency(limit)) })}</span>
          </div>
          <div class="widget-minibars">${bars}</div>
          ${overflow}`;
      },

      attach(instance, card, state) {
        const W = window.Widgets;
        card.addEventListener('click', () => {
          if (window.Store.getState().widgetEditMode) return;
          window.Router.navigate('#budget');
        });

        if (instance.size === 'large') return;
        const canvas = card.querySelector(`#${W._canvasId(instance)}`);
        if (!canvas) return;
        const rows = this._rows(instance, state);
        if (rows.length === 0) return;
        const { limit, spent } = this._totals(rows);

        const theme = window.Components.NetFlowChart._themeColors();
        // BudgetView's donut palette: remainder floored at 0 so an overspent
        // ring reads full; red pair when over budget.
        // 1.0.3 (BUG-160/164) over is decided in cents (float dust at exactly
        // the limit is not over) and includes a non-positive limit; an over
        // ring is drawn full.
        const overspent = Math.round((spent - limit) * 100) > 0;
        const colors = overspent
          ? (theme.isDark ? ['#f87171', '#1f293d'] : ['#ef4444', '#f1f5f9'])
          : (theme.isDark ? ['#94a3b8', '#1f293d'] : ['#64748b', '#e2e8f0']);
        const data = overspent || (limit === 0 && spent === 0) ? [1, 0] : [spent, Math.max(limit - spent, 0)];

        // 1.2.0 (UX-7): the shared ring look; index 1 is the remaining
        // budget, drawn in the track colour.
        const config = window.Components.RingChart.config({
          type: 'doughnut',
          data: {
            datasets: [{
              data,
              backgroundColor: colors
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false }, tooltip: { enabled: false } }
          }
        }, { animate: W._entryPass, delay: 250 });
        W._mountChart(instance.id, canvas, config, { animate: !!config.options.animation });
      },

      renderConfig(config, state) {
        const W = window.Widgets;
        const ym = W._todayStr().slice(0, 7);
        // Offer only categories that actually have an active budget — picking
        // one without a budget could never render anything.
        const budgeted = (state.budgets || []).map(b => {
          const cat = (state.categories || []).find(c => c.id === b.categoryId);
          if (!cat || cat.id === 'cat_balance' || cat.typeHint === 'income') return null;
          return window.Store.getBudgetForMonth(cat.id, ym).allocated > 0 ? cat : null;
        }).filter(Boolean);

        return [
          W._configSection(window.I18n.t('widget.cfg.whichBudgets'), W._segmented('mode', [
            { value: 'all', label: window.I18n.t('widget.cfg.allBudgets') },
            { value: 'selected', label: window.I18n.t('widget.cfg.pickCategories') }
          ], config.mode)),
          config.mode === 'selected'
            ? W._configSection(window.I18n.t('others.categories'), W._multiChips('categoryIds', budgeted, config.categoryIds))
            : ''
        ].join('');
      },

      attachConfig(root, ctx) {
        window.Widgets.attachSharedConfig(root, ctx);
      }
    },

    fiftyThirtyTwenty: {
      get title() { return window.I18n.t('widget.fifty.title'); },
      get description() { return window.I18n.t('widget.fifty.desc'); },
      icon: 'scale',
      sizes: ['large'],
      hasConfig: true,
      // v0.82 rework: a pure visual guide. The widget splits the user-entered
      // planned income into three amounts — NO actuals tracking and NO Needs
      // category classification. The old version mixed three bases in one card
      // (with the default empty Needs set every expense landed in Wants, next
      // to an actual-savings figure measured against planned income) and read
      // as nonsense. Stray needsCategoryIds keys in persisted configs are
      // ignored by _cfg's merge; no migration needed.
      defaultConfig: { plannedIncome: null, pctNeeds: 50, pctWants: 30, pctSavings: 20 },

      // 1.0.1 (BUG-09): one 'totals 100' rule for the fallback AND the config
      // hint, compared at 0.001 precision so float sums (33.3+33.3+33.4) pass.
      _splitOk(sum) {
        return Math.round(sum * 1000) === 100000;
      },

      // 1.0.1 (BUG-09): the hint shows the sum rounded EXACTLY as _splitOk
      // rounds it (to 0.001), so an invalid split (99.95, 100.04) can never
      // read 'Currently 100% — the split must total 100%'.
      _sumHint(sum) {
        return window.I18n.t('widget.fifty.sumHint', {
          pct: window.Store.formatPercent(Math.round(sum * 1000) / 1000, { maxDigits: 3 }),
          total: window.Store.formatPercent(100)
        });
      },

      _pcts(cfg) {
        const ps = [cfg.pctNeeds, cfg.pctWants, cfg.pctSavings];
        const valid = ps.every(p => typeof p === 'number' && isFinite(p) && p >= 0)
          && this._splitOk(ps[0] + ps[1] + ps[2]);
        // An incomplete split renders nonsense amounts; fall back to the
        // classic rule rather than guessing what the user meant.
        return valid
          ? { needs: cfg.pctNeeds, wants: cfg.pctWants, savings: cfg.pctSavings, fallback: false }
          : { needs: 50, wants: 30, savings: 20, fallback: true };
      },

      // Deliberately requires a planned income: falling back to actual income
      // would quietly reintroduce a monthly-shifting number into a widget
      // whose whole point is now stability.
      _data(instance) {
        const W = window.Widgets;
        const cfg = W._cfg(instance);
        const hasIncome = typeof cfg.plannedIncome === 'number'
          && isFinite(cfg.plannedIncome) && cfg.plannedIncome > 0;
        if (!hasIncome) return null;
        const pcts = this._pcts(cfg);
        const base = cfg.plannedIncome;
        return {
          base,
          pcts,
          targets: {
            needs: base * pcts.needs / 100,
            wants: base * pcts.wants / 100,
            savings: base * pcts.savings / 100
          }
        };
      },

      render(instance) {
        const W = window.Widgets;
        const d = this._data(instance);
        if (!d) return W._emptyState(window.I18n.t('widget.empty.setIncome'));

        const fmt = (v) => window.Store.formatCurrency(v);
        // Static rows: fill width IS the percentage, one neutral color — there
        // is nothing to be over or under any more.
        const row = (label, pct, amount) => `
          <div class="widget-minibar">
            <div class="widget-minibar-head">
              <span class="widget-minibar-label">${W._esc(label)} ${W._esc(window.Store.formatPercent(pct, { maxDigits: 1 }))}</span>
              <span class="widget-minibar-value">${W._esc(fmt(amount))}</span>
            </div>
            <div class="widget-minibar-track">
              <div class="widget-minibar-fill" style="width: ${pct}%; color: var(--color-primary);"></div>
            </div>
          </div>`;

        return `
          <div class="widget-stat">
            <span class="widget-stat-value">${W._esc(fmt(d.base))}</span>
            <span class="widget-stat-label">${W._esc(window.I18n.t(d.pcts.fallback ? 'widget.fifty.baseLabelFallback' : 'widget.fifty.baseLabel'))}</span>
          </div>
          <div class="widget-minibars">
            ${row(window.I18n.t('widget.fifty.needs'), d.pcts.needs, d.targets.needs)}
            ${row(window.I18n.t('widget.fifty.wants'), d.pcts.wants, d.targets.wants)}
            ${row(window.I18n.t('widget.fifty.savings'), d.pcts.savings, d.targets.savings)}
          </div>`;
      },

      attach(instance, card) {
        card.addEventListener('click', () => {
          if (window.Store.getState().widgetEditMode) return;
          window.Router.navigate('#analytics');
        });
      },

      renderConfig(config) {
        const W = window.Widgets;
        const sum = (config.pctNeeds || 0) + (config.pctWants || 0) + (config.pctSavings || 0);

        const pctInput = (key, label, value) => `
          <div>
            <label class="widget-config-label" for="fifty-${key}" style="display: block;">${label}</label>
            <input type="number" inputmode="numeric" min="0" max="100" step="1" class="form-control"
                   id="fifty-${key}" data-fifty-pct="${key}" value="${W._esc(value)}">
          </div>`;

        return [
          W._configSection(window.I18n.t('widget.cfg.plannedIncome'), `
            <input type="number" inputmode="decimal" min="0" step="0.01" class="form-control"
                   data-fifty-income value="${config.plannedIncome == null ? '' : W._esc(config.plannedIncome)}"
                   placeholder="${window.I18n.t('widget.cfg.incomePlaceholder')}" aria-label="${window.I18n.t('widget.cfg.plannedIncome')}">`),
          W._configSection(window.I18n.t('widget.cfg.split'), `
            <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: var(--space-2);">
              ${pctInput('pctNeeds', window.I18n.t('widget.fifty.needsPct'), config.pctNeeds)}
              ${pctInput('pctWants', window.I18n.t('widget.fifty.wantsPct'), config.pctWants)}
              ${pctInput('pctSavings', window.I18n.t('widget.fifty.savingsPct'), config.pctSavings)}
            </div>
            <p class="widget-stat-label" id="fifty-sum-hint" style="margin-top: var(--space-2); ${this._splitOk(sum) ? 'display: none;' : ''}">${W._esc(this._sumHint(sum))}</p>`)
        ].join('');
      },

      attachConfig(root, ctx) {
        // The number inputs update the draft WITHOUT rerendering — a rerender
        // on every keystroke would replace the input mid-typing and drop focus.
        window.Widgets.attachSharedConfig(root, ctx);

        const incomeInput = root.querySelector('[data-fifty-income]');
        if (incomeInput) {
          incomeInput.addEventListener('input', () => {
            const n = parseFloat(incomeInput.value);
            ctx.setConfig({ plannedIncome: isFinite(n) && n > 0 ? n : null });
          });
        }

        const hint = root.querySelector('#fifty-sum-hint');
        root.querySelectorAll('[data-fifty-pct]').forEach(input => {
          input.addEventListener('input', () => {
            const n = parseFloat(input.value);
            ctx.setConfig({ [input.dataset.fiftyPct]: isFinite(n) && n >= 0 ? n : 0 });
            if (hint) {
              const cfg = ctx.getConfig();
              const sum = (cfg.pctNeeds || 0) + (cfg.pctWants || 0) + (cfg.pctSavings || 0);
              hint.style.display = this._splitOk(sum) ? 'none' : 'block';
              hint.textContent = this._sumHint(sum);
            }
          });
        });
      }
    },

    // 1.2.2 (HG-7 P2, docs/smart-insights-plan.md §3.3): Smart Insights on
    // Home. Opt-in only (no seed, no migration). The engine and the markup
    // live in insights.js, which loads after this file and is called at
    // render time, so the page and the widget share one ranking. The large
    // card grows with its rows (autoHeight 'large'); the small one keeps the
    // fixed height and clamps its headline.
    insights: {
      get title() { return window.I18n.t('insights.title'); },
      get description() { return window.I18n.t('widget.insights.desc'); },
      icon: 'lightbulb',
      sizes: ['small', 'large'],
      hasConfig: false,
      defaultConfig: {},
      autoHeight: 'large',

      render(instance, state) {
        if (!window.Insights) return window.Widgets._emptyState(window.I18n.t('widget.loadFailed'));
        return window.Insights.renderWidget(instance, state);
      },

      attach(instance, card) {
        if (window.Insights) window.Insights.attachWidget(instance, card);
      }
    }
  },

  // Gallery order for the Add-widget sheet.
  listTypes() {
    return Object.keys(this.registry).map(type => ({ type, ...this.registry[type] }));
  },

  // ── section render ──────────────────────────────────────────────────────
  renderSection(state) {
    this._passMemo = {}; // v0.93: new render pass — drop last pass's data memo
    const widgets = Array.isArray(state.homeWidgets) ? state.homeWidgets : [];
    const editMode = !!state.widgetEditMode && widgets.length > 0;

    const header = `
      <div class="widgets-header">
        <p class="section-title" style="margin-bottom: 0;">${window.I18n.t('widget.section')}</p>
        <div class="widgets-header-actions">
          ${widgets.length > 0 ? `
            <button type="button" class="widget-pill-btn ${editMode ? 'is-active' : ''}" id="btn-widgets-edit"
                    aria-pressed="${editMode}">${window.I18n.t(editMode ? 'common.done' : 'common.edit')}</button>
          ` : ''}
          <button type="button" class="widget-pill-btn widget-pill-btn--accent" id="btn-widgets-add" aria-label="${window.I18n.t('widget.addAria')}">
            <i data-lucide="plus" style="width: 15px; height: 15px;"></i><span>${window.I18n.t('widget.add')}</span>
          </button>
        </div>
      </div>`;

    const body = widgets.length === 0
      ? `
        <button type="button" class="widget-empty-cta touch-target" id="btn-widgets-add-empty" aria-label="${window.I18n.t('widget.addFirst')}">
          <i data-lucide="layout-dashboard" style="width: 26px; height: 26px;"></i>
          <span class="widget-empty-cta-title">${window.I18n.t('widget.addFirst')}</span>
          <span class="widget-empty-cta-sub">${window.I18n.t('widget.addFirstSub')}</span>
        </button>`
      : `<div class="widgets-grid ${editMode ? 'is-editing' : ''}" id="widgets-grid">
          ${widgets.map((w, i) => this._renderCard(w, state, editMode, i, widgets.length)).join('')}
        </div>`;

    return `<div class="widgets-section" id="widgets-section">${header}${body}</div>`;
  },

  _renderCard(instance, state, editMode, index, total) {
    const def = this.registry[instance.type];
    // 1.2.0 (UX-2): a single-size type always lays out in its one size (a
    // stored 'small' on a large-only type is drawn wide, as it renders).
    const isLarge = instance.size === 'large' || this._onlySize(def) === 'large';
    const classes = ['widget-card', 'card', 'card-elevated'];
    if (isLarge) classes.push('widget-card--large');
    // 1.2.0 (UX-2): the one opt-in exception to the fixed card heights
    // (v0.73): the box grows with its content (accountBalances).
    // 1.2.2 (HG-7): autoHeight 'large' grows the large card only (a small
    // auto-height card would stretch its row partner).
    if (def && (def.autoHeight === true || (def.autoHeight === 'large' && isLarge))) classes.push('widget-card--auto');
    if (editMode) classes.push('is-editing');

    // Unknown type: keep the slot visible and removable rather than throwing.
    if (!def) {
      return `
        <div class="${classes.join(' ')}" data-widget-id="${this._esc(instance.id)}" data-widget-type="${this._esc(instance.type)}">
          ${editMode ? this._renderEditChrome(instance, index, total, isLarge) : ''}
          <div class="widget-card-head"><span class="widget-card-title">${window.I18n.t('widget.unavailable')}</span></div>
          <div class="widget-card-body">${this._emptyState(window.I18n.t('widget.unsupportedBody'))}</div>
        </div>`;
    }

    let bodyHtml;
    try {
      bodyHtml = def.render(instance, state);
    } catch (err) {
      // One broken widget must not take the whole dashboard down with it.
      console.error(`[widgets] render failed for "${instance.type}"`, err);
      bodyHtml = this._emptyState(window.I18n.t('widget.loadFailed'));
    }

    // v0.94: optional right-aligned caption in the head ROW (never a second
    // line — cards are fixed-height, a vertical caption would steal chart
    // space). def.caption may be a string or (instance) => string; empty
    // string = no caption (widgets gate on instance.size themselves).
    let captionText = '';
    if (def.caption) {
      try {
        captionText = typeof def.caption === 'function' ? (def.caption(instance) || '') : String(def.caption);
      } catch (err) { captionText = ''; }
    }

    return `
      <div class="${classes.join(' ')}" data-widget-id="${this._esc(instance.id)}" data-widget-type="${this._esc(instance.type)}">
        ${editMode ? this._renderEditChrome(instance, index, total, isLarge) : ''}
        <div class="widget-card-head">
          <span class="widget-card-title">${this._esc(def.title)}</span>
          ${captionText ? `<span class="widget-card-caption">${this._esc(captionText)}</span>` : ''}
        </div>
        <div class="widget-card-body">${bodyHtml}</div>
      </div>`;
  },

  _renderEditChrome(instance, index, total, isLarge) {
    const id = this._esc(instance.id);
    const def = this.registry[instance.type];
    const gearBtn = (def && def.hasConfig) ? `
        <button type="button" class="widget-chrome-btn" data-widget-action="configure" data-widget-id="${id}"
                aria-label="${window.I18n.t('widget.configureAria')}">
          <i data-lucide="settings" style="width: 15px; height: 15px;"></i>
        </button>` : '';
    // 1.2.0 (UX-2): a single-size type has no other size to flip to.
    const sizePill = this._onlySize(def) ? '' : `
        <button type="button" class="widget-size-pill" data-widget-action="toggle-size" data-widget-id="${id}"
                aria-label="${window.I18n.t('widget.toggleSizeAria')}">${window.I18n.t(isLarge ? 'widget.sizeWide' : 'widget.sizeSmall')}</button>`;
    // 1.2.0 (UX-5): the remove control is the iOS x badge (top-right, it asks
    // first — see attachSection). Reordering is a long-press drag; the
    // move-up/move-down buttons stay as the keyboard / assistive path,
    // visually hidden until they take keyboard focus.
    return `
      <button type="button" class="widget-remove-btn" data-widget-action="remove" data-widget-id="${id}" aria-label="${window.I18n.t('widget.removeAria')}">
        <i data-lucide="x" style="width: 14px; height: 14px;"></i>
      </button>
      <span class="visually-hidden">${window.I18n.t('widget.dragAria')}</span>
      <div class="widget-edit-bar">
        <button type="button" class="widget-chrome-btn widget-move-btn" data-widget-action="move-up" data-widget-id="${id}"
                ${index === 0 ? 'disabled' : ''} aria-label="${window.I18n.t('widget.moveUpAria')}">
          <i data-lucide="chevron-up" style="width: 16px; height: 16px;"></i>
        </button>
        <button type="button" class="widget-chrome-btn widget-move-btn" data-widget-action="move-down" data-widget-id="${id}"
                ${index === total - 1 ? 'disabled' : ''} aria-label="${window.I18n.t('widget.moveDownAria')}">
          <i data-lucide="chevron-down" style="width: 16px; height: 16px;"></i>
        </button>
        ${gearBtn}
        ${sizePill}
      </div>`;
  },

  // ── live preview (add-widget detail step) ───────────────────────────────
  // Renders the real card with the real state through the same _renderCard the
  // dashboard uses, so what you preview is literally what you get. The stage
  // reuses .widgets-grid so a 'small' widget occupies exactly one of two
  // columns, as it will on the dashboard.
  PREVIEW_ID: '__preview__',

  // 1.2.0 (UX-6): the size rail renders every size at once, so each preview
  // card (and its chart slot in _charts) needs its own id. The type's first
  // size keeps the historical '__preview__'; the others get ':<size>'.
  _previewId(size, type) {
    const def = type ? this.registry[type] : null;
    const first = (def && Array.isArray(def.sizes) && def.sizes[0]) || 'small';
    return size === first ? this.PREVIEW_ID : `${this.PREVIEW_ID}:${size}`;
  },

  _previewInstance(type, size, config) {
    return { id: this._previewId(size, type), type, size, config: config || {}, createdAt: '' };
  },

  renderPreview(type, size, config, state) {
    const def = this.registry[type];
    if (!def) return '';
    this._passMemo = {}; // v0.93: preview render = its own pass (config/size may differ)
    const instance = this._previewInstance(type, size, config);
    // 1.2.0 (UX-6): a small card is centred on its slide (one half-width column).
    const isSmall = size !== 'large' && this._onlySize(def) !== 'large';
    return `
      <div class="widget-preview-stage">
        <div class="widgets-grid widgets-grid--preview${isSmall ? ' is-small' : ''}">
          ${this._renderCard(instance, state, false, 0, 1)}
        </div>
      </div>`;
  },

  attachPreview(root, type, size, config, state) {
    const def = this.registry[type];
    if (!def || !def.attach) return;
    const card = root.querySelector(`.widget-card[data-widget-id="${this._previewId(size, type)}"]`);
    if (!card) return;
    try {
      def.attach(this._previewInstance(type, size, config), card, state);
    } catch (err) {
      console.error(`[widgets] preview attach failed for "${type}"`, err);
    }
  },

  // 1.2.0 (UX-6): releases every preview slot ('__preview__' and '__preview__:<size>').
  destroyPreview() {
    Object.keys(this._charts)
      .filter(id => id === this.PREVIEW_ID || id.indexOf(`${this.PREVIEW_ID}:`) === 0)
      .forEach(id => this._destroyChart(id));
  },

  // ── section events ──────────────────────────────────────────────────────
  // 1.2.0 (UX-7): opts.isEntry (DashboardView forwards main.js' flag) marks
  // the first render of a Home visit — the ring widgets play their one sweep
  // on that pass only. Optional: older callers pass (root, state).
  attachSection(root, state, opts) {
    // The section just re-rendered, so every tracked chart now points at a
    // detached canvas. Drop them all before remounting. (v0.93: the old
    // isRemount animation-suppression is gone — _mountChart never animates.)
    // 1.2.0 (UX-5): this also ends the previous grid's drag controller (its
    // document listeners, a ghost left by an interrupted gesture) and the
    // previous tap-outside listener on root, which outlives the innerHTML swap.
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
          this._confirmRemove(id);
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
    // 1.2.0 (UX-7): _entryPass is read by the ring widgets' attach, for this
    // loop only (the add-widget preview mounts later and never animates).
    this._entryPass = !!(opts && opts.isEntry);
    try {
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
    } finally {
      this._entryPass = false;
    }

    // 1.2.0 (UX-5): long-press → wiggle, press-and-drag → reorder, and a tap
    // anywhere else on the screen leaves edit mode.
    const offs = [];
    try {
      offs.push(this._attachDrag(grid, root));
    } catch (err) {
      console.error('[widgets] drag controller failed', err);
    }
    const editMode = !!state.widgetEditMode && (state.homeWidgets || []).length > 0;
    if (editMode && typeof root.addEventListener === 'function') {
      const onOutside = (e) => {
        const t = e.target;
        if (!t || typeof t.closest !== 'function') return;
        if (t.closest('#widgets-section') || t.closest('#modal-container')) return;
        if (!window.Store.getState().widgetEditMode) return;
        // The tap only leaves edit mode (as on a phone's home screen): the
        // control under it does not also fire.
        e.preventDefault();
        e.stopPropagation();
        window.Store.dispatch('TOGGLE_WIDGET_EDIT_MODE', false);
      };
      // A click, not pointerdown: a scroll that starts outside the widgets
      // never fires one, so scrolling the page keeps edit mode.
      root.addEventListener('click', onOutside, true);
      offs.push(() => root.removeEventListener('click', onOutside, true));
    }
    this._sectionTeardown = () => offs.forEach(off => { if (typeof off === 'function') off(); });
  },

  // 1.2.0 (UX-5): the x badge asks first — REMOVE_HOME_WIDGET has no undo.
  // A delete-style sheet: Cancel is the safe button, backdrop tap / Back close it.
  _confirmRemove(id) {
    const remove = () => window.Store.dispatch('REMOVE_HOME_WIDGET', { id });
    const Modal = window.Components && window.Components.Modal;
    if (!Modal || typeof Modal.show !== 'function') { remove(); return; }
    Modal.show({
      title: window.I18n.t('widget.removeTitle'),
      content: `<p style="color: var(--text-secondary); margin-bottom: 8px;">${window.I18n.t('widget.removeBody')}</p>`,
      showDelete: true,
      deleteText: window.I18n.t('widget.removeConfirm'),
      saveText: window.I18n.t('common.cancel'),
      onSave: (close) => close(),
      onDelete: (close) => { close(); remove(); }
    });
  },

  // ── 1.2.0 (UX-5) long-press + drag reorder ──────────────────────────────
  // DOM-only until release: the dashboard re-renders wholesale on every
  // dispatch, which would replace the pressed card mid-gesture. So a long
  // press outside edit mode builds the edit chrome into the live DOM itself
  // ("pseudo edit"), a drag moves the real card nodes (FLIP), and the release
  // dispatches once: REORDER_HOME_WIDGETS when the order changed, then
  // TOGGLE_WIDGET_EDIT_MODE true after a pseudo edit — the coalesced re-render
  // reproduces the DOM that was built, so nothing jumps.
  _DRAG_HOLD_ENTER: 450, // ms, outside edit mode (long press)
  _DRAG_HOLD_EDIT: 150,  // ms, in edit mode (a move before it is a scroll)
  _DRAG_SLOP: 8,         // px a press may wander before it counts as a scroll
  _DRAG_EDGE: 56,        // px from the viewport top/bottom that auto-scrolls

  _sectionTeardown: null,

  // Ends the live controller (document listeners, timer, auto-scroll) and
  // removes any ghost — idempotent, and also run defensively on every
  // attachSection / DashboardView.destroy (through destroyCharts).
  _endDrag() {
    const off = this._sectionTeardown;
    this._sectionTeardown = null;
    if (off) {
      try { off(); } catch (err) { /* already gone */ }
    }
    if (typeof document !== 'undefined' && document && typeof document.querySelectorAll === 'function') {
      document.querySelectorAll('.widget-drag-ghost').forEach(el => el.remove());
    }
  },

  _reducedMotion() {
    try {
      return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    } catch (err) {
      return false;
    }
  },

  // Pure hit test. rects = every card's layout box in DOM order
  // ({left, top, width, height, large}), the dragged one at fromIdx.
  // Returns the index the dragged card should take. The OTHER card under
  // the pointer decides — or, over a gap or the card's own slot, the nearest
  // one by centre distance (a wide card's centre alone would lose to a small
  // neighbour while the pointer is inside it). The pointer goes before/after
  // that card by the axis the two share: x for a small card in the pointer's
  // row, y for a large card (it spans the row) or a card in another row.
  _dropIndexFor(rects, x, y, fromIdx) {
    if (!Array.isArray(rects) || rects.length < 2) return fromIdx;
    let best = -1;
    let bestD = Infinity;
    rects.forEach((r, i) => {
      if (i === fromIdx || !r) return;
      const inside = x >= r.left && x <= r.left + r.width && y >= r.top && y <= r.top + r.height;
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      const d = inside ? -1 : (x - cx) * (x - cx) + (y - cy) * (y - cy);
      if (d < bestD) { bestD = d; best = i; }
    });
    if (best === -1) return fromIdx;
    const r = rects[best];
    const inRow = !r.large && y >= r.top && y <= r.top + r.height;
    const after = inRow ? x > r.left + r.width / 2 : y > r.top + r.height / 2;
    const pos = best < fromIdx ? best : best - 1; // its index among the others
    return Math.max(0, Math.min(rects.length - 1, pos + (after ? 1 : 0)));
  },

  // Moves `card` to index `to` among the grid's cards, animating every card
  // that changed place from where it WAS on screen (First → Last → Invert →
  // Play). translate is the individual property, so it never fights the
  // wiggle's rotate.
  _flipMove(grid, card, to) {
    const cards = [...grid.querySelectorAll('.widget-card[data-widget-id]')];
    const animate = !this._reducedMotion();
    const first = animate ? new Map(cards.map(c => [c, c.getBoundingClientRect()])) : null;
    if (animate) cards.forEach(c => { c.style.transition = 'none'; c.style.translate = ''; });
    const others = cards.filter(c => c !== card);
    grid.insertBefore(card, others[to] || null);
    if (!animate) return;
    const moved = [];
    cards.forEach(c => {
      const a = first.get(c);
      const b = c.getBoundingClientRect();
      const dx = a.left - b.left;
      const dy = a.top - b.top;
      if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) { c.style.transition = ''; return; }
      c.style.translate = `${dx}px ${dy}px`;
      moved.push(c);
    });
    void grid.offsetWidth; // commit the inverted positions before playing
    moved.forEach(c => {
      c.style.transition = 'translate var(--dur-view) var(--ease-spring)';
      c.style.translate = '0px 0px';
      const done = (ev) => {
        if (ev && ev.propertyName && ev.propertyName !== 'translate') return;
        c.removeEventListener('transitionend', done);
        c.style.transition = '';
        c.style.translate = '';
      };
      c.addEventListener('transitionend', done);
    });
  },

  // Injects the edit chrome into the live grid without a dispatch (see above).
  _enterPseudoEdit(grid) {
    const widgets = window.Store.getState().homeWidgets || [];
    const cards = [...grid.querySelectorAll('.widget-card[data-widget-id]')];
    grid.classList.add('is-editing');
    cards.forEach((card, i) => {
      if (card.classList.contains('is-editing')) return;
      const id = card.dataset.widgetId;
      const isLarge = card.classList.contains('widget-card--large');
      const inst = widgets.find(w => w.id === id) ||
        { id, type: card.dataset.widgetType, size: isLarge ? 'large' : 'small' };
      card.classList.add('is-editing');
      card.insertAdjacentHTML('afterbegin', this._renderEditChrome(inst, i, cards.length, isLarge));
    });
    if (window.StackdHydrateIcons) window.StackdHydrateIcons(grid);
  },

  // A fixed-position copy of the pressed card that follows the pointer. It
  // carries no ids or actions (it is a picture), and canvases are copied
  // pixel for pixel when the platform can.
  _makeGhost(card, doc) {
    const rect = card.getBoundingClientRect();
    const ghost = card.cloneNode(true);
    ghost.classList.add('widget-drag-ghost');
    ghost.classList.remove('is-dragging');
    ghost.removeAttribute('data-widget-id');
    ghost.setAttribute('aria-hidden', 'true');
    ghost.querySelectorAll('[id]').forEach(el => el.removeAttribute('id'));
    ghost.querySelectorAll('[data-widget-action], [data-widget-id]').forEach(el => {
      el.removeAttribute('data-widget-action');
      el.removeAttribute('data-widget-id');
    });
    if (window.Chart) {
      const src = card.querySelectorAll('canvas');
      ghost.querySelectorAll('canvas').forEach((c, i) => {
        try {
          c.width = src[i].width;
          c.height = src[i].height;
          const ctx = c.getContext('2d');
          if (ctx) ctx.drawImage(src[i], 0, 0);
        } catch (err) { /* a blank canvas is fine */ }
      });
    }
    ghost.style.left = `${rect.left}px`;
    ghost.style.top = `${rect.top}px`;
    ghost.style.width = `${rect.width}px`;
    ghost.style.height = `${rect.height}px`;
    (doc.getElementById('app') || doc.body).appendChild(ghost);
    return ghost;
  },

  // Returns the controller's teardown. One controller per grid: every
  // re-render replaces the grid, and attachSection tears the old one down.
  _attachDrag(grid, root) {
    const W = this;
    const S = window.Store;
    const doc = grid.ownerDocument || document;
    const win = doc.defaultView || window;
    const raf = (fn) => (typeof win.requestAnimationFrame === 'function'
      ? win.requestAnimationFrame(fn) : setTimeout(fn, 16));
    let g = null;          // the gesture in progress
    let lastTouchAt = 0;   // compat mouse events after a touch are ignored

    const idsInDom = () => [...grid.querySelectorAll('.widget-card[data-widget-id]')].map(c => c.dataset.widgetId);
    const pointOf = (e) => {
      const t = (e.touches && e.touches[0]) || (e.changedTouches && e.changedTouches[0]);
      return t ? { x: t.clientX, y: t.clientY } : { x: e.clientX, y: e.clientY };
    };

    const stopGesture = () => {
      const was = g;
      g = null;
      if (!was) return null;
      clearTimeout(was.timer);
      doc.removeEventListener('mousemove', onMouseMove);
      doc.removeEventListener('mouseup', onMouseUp);
      doc.removeEventListener('keydown', onKey);
      if (was.ghost) was.ghost.remove();
      was.card.classList.remove('is-dragging');
      return was;
    };

    const reflow = () => {
      if (!g || !g.ghost) return;
      const cards = [...grid.querySelectorAll('.widget-card[data-widget-id]')];
      const from = cards.indexOf(g.card);
      if (from < 0) return;
      const gr = grid.getBoundingClientRect();
      // Layout boxes (offset*), not the on-screen ones: a card mid-FLIP is
      // translated, and hit-testing its moving box would make it oscillate.
      const rects = cards.map(c => ({
        left: gr.left + c.offsetLeft, top: gr.top + c.offsetTop,
        width: c.offsetWidth, height: c.offsetHeight,
        large: c.classList.contains('widget-card--large')
      }));
      const to = W._dropIndexFor(rects, g.x, g.y, from);
      if (to !== from) W._flipMove(grid, g.card, to);
    };

    const autoScroll = (mine) => {
      if (g !== mine || !g.ghost) return;
      const vh = win.innerHeight || (doc.documentElement && doc.documentElement.clientHeight) || 0;
      let dy = 0;
      if (g.y < W._DRAG_EDGE) dy = -Math.ceil((W._DRAG_EDGE - g.y) / 4);
      else if (vh && g.y > vh - W._DRAG_EDGE) dy = Math.ceil((g.y - (vh - W._DRAG_EDGE)) / 4);
      if (dy && root) {
        const before = root.scrollTop;
        root.scrollTop = before + dy;
        if (root.scrollTop !== before) reflow();
      }
      raf(() => autoScroll(mine));
    };

    const hold = () => {
      if (!g) return;
      if (!g.card.isConnected) { stopGesture(); return; }
      g.held = true;
      try {
        if (win.navigator && typeof win.navigator.vibrate === 'function') win.navigator.vibrate(40);
      } catch (err) { /* no haptics */ }
      if (!g.editing) {
        W._enterPseudoEdit(grid);
        g.pseudo = true;
      }
      g.ghost = W._makeGhost(g.card, doc);
      g.card.classList.add('is-dragging');
      const mine = g;
      raf(() => autoScroll(mine));
    };

    const press = (e, kind) => {
      if (g) return;
      const target = e.target;
      if (!target || typeof target.closest !== 'function') return;
      if (target.closest('[data-widget-action]')) return; // chrome buttons are taps
      const card = target.closest('.widget-card[data-widget-id]');
      if (!card || card.parentNode !== grid) return;
      const p = pointOf(e);
      const editing = !!S.getState().widgetEditMode;
      g = {
        kind, card, editing, x0: p.x, y0: p.y, x: p.x, y: p.y,
        held: false, pseudo: false, ghost: null, order0: idsInDom(), timer: null
      };
      g.timer = setTimeout(hold, editing ? W._DRAG_HOLD_EDIT : W._DRAG_HOLD_ENTER);
      if (kind === 'mouse') {
        doc.addEventListener('mousemove', onMouseMove);
        doc.addEventListener('mouseup', onMouseUp);
      }
      doc.addEventListener('keydown', onKey);
    };

    // true = the gesture owns this move (the caller cancels the default).
    const move = (p) => {
      if (!g) return false;
      g.x = p.x;
      g.y = p.y;
      if (!g.held) {
        if (Math.abs(p.x - g.x0) > W._DRAG_SLOP || Math.abs(p.y - g.y0) > W._DRAG_SLOP) stopGesture(); // a scroll
        return false;
      }
      if (g.ghost) g.ghost.style.translate = `${p.x - g.x0}px ${p.y - g.y0}px`;
      reflow();
      return true;
    };

    // true = the press was a long press / drag (the caller swallows the click).
    const end = () => {
      const was = stopGesture();
      if (!was || !was.held) return false;
      if (!grid.isConnected) return true; // the view went away mid-gesture
      const order = idsInDom();
      if (order.join('\n') !== was.order0.join('\n')) {
        S.dispatch('REORDER_HOME_WIDGETS', { orderedIds: order });
        const saved = (S.getState().homeWidgets || []).map(w => w.id);
        // Refused (not a permutation of the stored list) or rolled back: the
        // DOM was moved by hand, so redraw it from the state.
        if (saved.join('\n') !== order.join('\n') && !was.pseudo) S.emit();
      }
      if (was.pseudo) S.dispatch('TOGGLE_WIDGET_EDIT_MODE', true);
      return true;
    };

    // touchcancel / Escape: drop the gesture and redraw from the state — the
    // original order, and no pseudo-edit chrome.
    const cancel = () => {
      const was = stopGesture();
      if (was && was.held && grid.isConnected) S.emit();
    };

    const onTouchStart = (e) => {
      lastTouchAt = Date.now();
      if (e.touches && e.touches.length > 1) { if (g) cancel(); return; }
      press(e, 'touch');
    };
    const onTouchMove = (e) => {
      if (!g || g.kind !== 'touch') return;
      if (move(pointOf(e)) && e.cancelable) e.preventDefault();
    };
    const onTouchEnd = (e) => {
      if (!g || g.kind !== 'touch') return;
      if (end() && e.cancelable) e.preventDefault(); // no click after a long press
    };
    const onTouchCancel = () => { if (g && g.kind === 'touch') cancel(); };
    const onMouseDown = (e) => {
      if (e.button !== 0 || Date.now() - lastTouchAt < 800) return;
      press(e, 'mouse');
    };
    function onMouseMove(e) {
      if (!g || g.kind !== 'mouse') return;
      if (move(pointOf(e))) e.preventDefault();
    }
    function onMouseUp() {
      if (g && g.kind === 'mouse') end();
    }
    function onKey(e) {
      if (e.key === 'Escape' && g) cancel();
    }
    const onContextMenu = (e) => { if (g) e.preventDefault(); };

    grid.addEventListener('touchstart', onTouchStart, { passive: true });
    grid.addEventListener('touchmove', onTouchMove, { passive: false });
    grid.addEventListener('touchend', onTouchEnd);
    grid.addEventListener('touchcancel', onTouchCancel);
    grid.addEventListener('mousedown', onMouseDown);
    grid.addEventListener('contextmenu', onContextMenu);

    return () => {
      stopGesture();
      grid.removeEventListener('touchstart', onTouchStart);
      grid.removeEventListener('touchmove', onTouchMove);
      grid.removeEventListener('touchend', onTouchEnd);
      grid.removeEventListener('touchcancel', onTouchCancel);
      grid.removeEventListener('mousedown', onMouseDown);
      grid.removeEventListener('contextmenu', onContextMenu);
    };
  }
};
