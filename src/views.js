// views.js - Application Views

// --- Generic Helpers ---
// v0.71: escapes a value destined for a double-quoted HTML attribute. Without
// it a note like `Bob's "Big" Loan` truncates at the quote and the remainder is
// parsed as further attributes.
function escapeAttr(value) {
  return String(value == null ? '' : value).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

function createCategoryOptions(categories, selectedId, includeDefaultOption = true) {
  let options = [...categories]
    .sort((a, b) => window.Store.compareAlpha(a, b))
    .map(cat => 
      `<option value="${cat.id}" ${cat.id === selectedId ? 'selected' : ''}>${cat.name}</option>`
    ).join('');

  if (includeDefaultOption) {
    options = `<option value="" ${!selectedId ? 'selected' : ''}>${window.I18n.t('form.noCategorySelected')}</option>` + options;
  }
  return options;
}

function createAccountOptions(accounts, selectedId) {
  return [...accounts]
    .sort((a, b) => window.Store.compareAlpha(a, b))
    .map(acc => 
      `<option value="${acc.id}" ${acc.id === selectedId ? 'selected' : ''}>${acc.name}</option>`
    ).join('');
}

function captureDraftTxFormState(container) {
  const root = container || document.getElementById('router-view') || document;
  const typeInput = root.querySelector('#tx-type');
  const amountInput = root.querySelector('#tx-amount');
  const accountSelect = root.querySelector('#tx-account');
  const transferToSelect = root.querySelector('#tx-transfer-to');
  const categorySelect = root.querySelector('#tx-category');
  const dateInput = root.querySelector('#tx-date');
  const noteInput = root.querySelector('#tx-comment');
  const togglePaid = root.querySelector('#tx-is-paid');
  const toggleRecurrent = root.querySelector('#tx-is-recurrent');
  const endDateInput = root.querySelector('#tx-recurrence-end-date');
  const intervalInput = root.querySelector('#tx-recurrence-interval');
  const freqInput = root.querySelector('#tx-recurrence-freq');
  const seriesIdInput = root.querySelector('#tx-recurrence-series-id');
  const tagChips = Array.from(root.querySelectorAll('.tag-chip')).map(el => el.dataset.tag);

  if (typeInput || amountInput) {
    window._draftTxFormState = {
      type: typeInput ? typeInput.value : 'expense',
      amount: amountInput ? amountInput.value : '',
      account: accountSelect ? accountSelect.value : '',
      transferTo: transferToSelect ? transferToSelect.value : '',
      category: categorySelect ? categorySelect.value : '',
      date: dateInput ? dateInput.value : '',
      note: noteInput ? noteInput.value : '',
      tags: tagChips,
      isPaid: togglePaid ? togglePaid.checked : true,
      isRecurrent: toggleRecurrent ? toggleRecurrent.checked : false,
      recurrenceEndDate: endDateInput ? endDateInput.value : '',
      recurrenceInterval: intervalInput ? intervalInput.value : '1',
      recurrenceFreq: freqInput ? freqInput.value : 'months',
      recurrenceSeriesId: seriesIdInput ? seriesIdInput.value : ''
    };
  }
}

window.Views = {
  // -------------------------
  // ANALYTICS VIEW
  // -------------------------
  AnalyticsView: {
    // v0.64 - Shared basis for the hero balance when the selected period extends past
    // today: 'today' clamps everything to the current date, 'end' keeps the projected
    // period-end view. Used by render() and attachEvents() so charts stay consistent.
    _getBalanceModeContext(state) {
      const filters = state.analyticsFilters;
      const activePeriod = filters.period;
      const bounds = window.Store._getPeriodBounds(activePeriod.type, activePeriod.value);
      const rangeStart = activePeriod.type === 'custom' ? activePeriod.start : bounds.start;
      const rangeEnd = activePeriod.type === 'custom' ? activePeriod.end : bounds.end;
      const now = new Date();
      const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
      const straddlesToday = rangeStart <= todayStr && rangeEnd > todayStr;
      const balanceMode = straddlesToday ? (state.analyticsBalanceMode || 'today') : 'end';
      const clampToToday = straddlesToday && balanceMode === 'today';
      return {
        filters, activePeriod, bounds, rangeStart, rangeEnd, todayStr, straddlesToday, balanceMode, clampToToday,
        effectiveEnd: clampToToday ? todayStr : rangeEnd,
        effectiveFilters: clampToToday
          ? { ...filters, period: { type: 'custom', start: rangeStart, end: todayStr } }
          : filters,
        chartClampEnd: clampToToday ? todayStr : null
      };
    },

    render(state) {
      const ctx = this._getBalanceModeContext(state);
      const { filters, activePeriod, rangeStart, rangeEnd, todayStr, straddlesToday, balanceMode, clampToToday, effectiveEnd, effectiveFilters } = ctx;
      const periodLabel = window.Store._getPeriodLabel(activePeriod);
      const filterBarHtml = window.Components.AdvancedFilterBar.render('analytics', filters);

      const currentBalance = window.Store.getBalanceAtDate(effectiveEnd, filters.accounts);
      const summary = window.Store.computeAnalyticalSummary(effectiveFilters);

      // v0.64 - Future-dated transactions inside the selected period (relative to today)
      const upcoming = rangeEnd > todayStr
        ? window.Store.computeUpcomingImpact(rangeEnd, filters.accounts)
        : { count: 0, net: 0 };
      // The hero is a projection only when it actually includes future transactions
      const isProjected = balanceMode === 'end' && upcoming.count > 0;

      const prevPeriod = window.Store._getPreviousPeriod(activePeriod);
      // v0.64 - In 'today' mode compare like-for-like: clamp the previous period to the
      // same number of elapsed days, so "vs last month" means month-to-date vs month-to-date.
      let prevCompareFilters = { ...filters, period: prevPeriod };
      if (clampToToday) {
        const prevBounds = prevPeriod.type === 'custom'
          ? { start: prevPeriod.start, end: prevPeriod.end }
          : window.Store._getPeriodBounds(prevPeriod.type, prevPeriod.value);
        const elapsedDays = Math.round((new Date(todayStr + 'T00:00:00') - new Date(rangeStart + 'T00:00:00')) / 86400000);
        const prevEndDt = new Date(prevBounds.start + 'T00:00:00');
        prevEndDt.setDate(prevEndDt.getDate() + elapsedDays);
        let prevEndClamped = `${prevEndDt.getFullYear()}-${String(prevEndDt.getMonth() + 1).padStart(2, '0')}-${String(prevEndDt.getDate()).padStart(2, '0')}`;
        if (prevEndClamped > prevBounds.end) prevEndClamped = prevBounds.end;
        prevCompareFilters = { ...filters, period: { type: 'custom', start: prevBounds.start, end: prevEndClamped } };
      }
      const prevSummary = window.Store.computeAnalyticalSummary(prevCompareFilters);
      
      const delta = summary.net;
      const prevNet = prevSummary.net;
      const prevBalance = window.Store.getBalanceAtDate(prevPeriod.type === 'custom' ? prevPeriod.end : window.Store._getPeriodBounds(prevPeriod.type, prevPeriod.value).end, filters.accounts);
      
      const pct = prevNet !== 0 ? ((delta - prevNet) / Math.abs(prevNet)) * 100 : (delta !== 0 ? 100 : 0);
      
      // We'll define isPositive based on the NET FLOW being positive for this period
      const isPositive = delta >= 0;
      const sign = isPositive ? '+' : '';
      const color = isPositive ? 'var(--color-income-val)' : 'var(--color-expense)';
      const bgColor = isPositive ? 'var(--color-income-bg)' : 'var(--color-expense-bg)';
      const textColor = isPositive ? 'var(--color-income-text)' : 'var(--color-expense)';
      
      const deltaLabel = window.I18n.t(`analytics.${clampToToday ? 'vsLastToDate' : 'vsLast'}.${activePeriod.type}`);

      const chartData = window.Store.computeNetFlowData(filters, ctx.chartClampEnd);
      const chartHtml = window.Components.NetFlowChart.render(chartData, activePeriod.type === 'custom');

      // v0.93: attachEvents runs right after render in the same synchronous
      // pass and needs the same context + bar-chart series — stash, don't
      // recompute (each computeNetFlowData is a 12-bucket scan).
      this._pass = { ctx, chartData };

      const donutData = window.Store.computeCategoryDistribution(effectiveFilters, 'expense');
      const donutHtml = window.Components.CategoryDonutChart.render(donutData, 'expense');

      // v0.61 - Same autosizing as the History summary bar. The hero figure is its own
      // group; the two tiles beneath it share a size with each other.
      const balanceStr = window.Store.formatCurrency(currentBalance);
      const deltaStr   = `${sign}${window.Store.formatCurrency(Math.abs(delta))}`;
      const prevStr    = window.Store.formatCurrency(prevBalance);

      // Card content width: container inner width less the card's 32px side padding.
      const heroWidth = '(min(600px, 100vw) - 96px)';
      // Each tile: that width less the 12px grid gap, halved, less 16px side padding and
      // a small margin, so the estimate stays under the real width rather than over it.
      const statWidth = '((min(600px, 100vw) - 108px) / 2 - 38px)';

      const heroFontSize = window.Components.fitNumericFontSize([balanceStr], 2.5, 1.4, heroWidth);
      const statFontSize = window.Components.fitNumericFontSize([deltaStr, prevStr], 1.05, 0.65, statWidth);
      const statValueStyle = `font-weight: 700; font-size: ${statFontSize}; white-space: nowrap; font-variant-numeric: tabular-nums;`;

      const hasAccountFilter = filters.accounts && filters.accounts.length > 0 && filters.accounts.length < state.accounts.length;
      const accountFilterIndicatorHtml = hasAccountFilter
        ? `<div style="font-size: 0.72rem; font-weight: 600; color: var(--color-expense); opacity: 0.95; text-align: right; margin-top: 2px;" title="${window.I18n.t('history.partialAccountsTitle', { shown: filters.accounts.length, total: state.accounts.length })}">${window.I18n.t('history.partialAccounts')}</div>`
        : '';

      // v0.64 - Projection caveat + Today/period-end toggle
      const endShortLabel = new Date(rangeEnd + 'T00:00:00').toLocaleDateString(window.Store.getLocale(), { month: 'short', day: 'numeric' });
      const upcomingNetStr = `${upcoming.net >= 0 ? '+' : '-'}${window.Store.formatCurrency(Math.abs(upcoming.net))}`;
      const upcomingNoteHtml = (upcoming.count > 0 && rangeEnd > todayStr) ? `
            <div style="display: flex; align-items: center; justify-content: center; gap: 5px; font-size: 0.78rem; color: var(--text-secondary); margin-bottom: var(--space-4);">
              <i data-lucide="clock" style="width: 13px; height: 13px; flex-shrink: 0;"></i>
              <span>${window.I18n.t(balanceMode === 'end' ? 'analytics.upcomingIncluded' : 'analytics.upcomingExcluded', { count: upcoming.count, net: upcomingNetStr })}</span>
            </div>` : '';
      const balanceModeToggleHtml = straddlesToday ? `
            <div style="display: flex; justify-content: center; margin-bottom: var(--space-4);">
              <div class="chart-toggle-group" id="balance-mode-toggle">
                <button class="chart-toggle-btn ${balanceMode === 'today' ? 'active' : ''}" data-mode="today">${window.I18n.t('filter.today')}</button>
                <button class="chart-toggle-btn ${balanceMode === 'end' ? 'active' : ''}" data-mode="end">${endShortLabel}</button>
              </div>
            </div>` : '';

      return `
        <div class="container" style="padding-bottom: 100px;">
          <!-- STICKY HEADER -->
          <div class="history-header-sticky">
            <div class="page-header">
              <h1 class="page-header-title">${window.I18n.t('nav.analytics')}</h1>
              <div style="text-align: right;">
                <div style="font-family: var(--font-family-display); font-weight: 700; font-size: 0.9rem; color: var(--color-primary);">${periodLabel}</div>
                ${accountFilterIndicatorHtml}
              </div>
            </div>

            <!-- New Filter Bar -->
            ${filterBarHtml}
          </div>

          <div class="card card-elevated" style="padding: var(--space-8); text-align: center; border-radius: var(--radius-2xl); margin-top: var(--space-6); position: relative; overflow: hidden;">
            <!-- DECORATIVE BACKGROUND GRADIENT -->
            <div style="position: absolute; top: -50px; right: -50px; width: 150px; height: 150px; background: var(--color-primary); opacity: 0.05; border-radius: 30px; filter: blur(40px);"></div>
            
            <p class="section-title" style="margin-bottom: var(--space-1); text-transform: uppercase; letter-spacing: 0.05em; font-size: 0.75rem; opacity: 0.8;">${isProjected ? window.I18n.t('analytics.projectedBalance', { date: endShortLabel }) : (clampToToday ? window.I18n.t('analytics.totalNetBalanceToday') : window.I18n.t('analytics.totalNetBalance'))}</p>
            <h2 style="font-family: var(--font-family-display); font-size: ${heroFontSize}; font-weight: 800; margin-bottom: ${upcomingNoteHtml ? 'var(--space-2)' : 'var(--space-4)'}; color: var(--text-primary); letter-spacing: -0.02em; white-space: nowrap; font-variant-numeric: tabular-nums;">
              ${balanceStr}
            </h2>
            ${upcomingNoteHtml}

            <!-- DYNAMIC DELTA BADGE -->
            <div style="display: inline-flex; align-items: center; gap: var(--space-1); padding: 6px 12px; border-radius: 20px; background: ${bgColor}; color: ${textColor}; font-weight: 700; font-size: 0.85rem; margin-bottom: var(--space-6);">
              <i data-lucide="${isPositive ? 'trending-up' : 'trending-down'}" style="width: 14px; height: 14px;"></i>
              <span>${sign}${pct.toFixed(1)}%</span>
              <span style="opacity: 0.8; font-weight: 500; margin-left: 2px;">${deltaLabel}</span>
            </div>
            ${balanceModeToggleHtml}
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-3); margin-top: var(--space-2);">
              <div style="display: flex; flex-direction: column; align-items: flex-start; gap: var(--space-1); padding: var(--space-4); background: var(--bg-surface-sunken); border-radius: var(--radius-lg); min-width: 0;">
                <span class="text-secondary" style="font-size: var(--text-xs); font-weight: 600; text-transform: uppercase; opacity: 0.7;">${window.I18n.t('history.netChange')}</span>
                <span style="${statValueStyle} color: ${color};">${deltaStr}</span>
              </div>
              <div style="display: flex; flex-direction: column; align-items: flex-start; gap: var(--space-1); padding: var(--space-4); background: var(--bg-surface-sunken); border-radius: var(--radius-lg); min-width: 0;">
                <span class="text-secondary" style="font-size: var(--text-xs); font-weight: 600; text-transform: uppercase; opacity: 0.7;">${window.I18n.t('analytics.previous')}</span>
                <span style="${statValueStyle} color: var(--text-primary);">${prevStr}</span>
              </div>
            </div>
          </div>

          ${chartHtml}
          ${donutHtml}
        </div>
      `;
    },
    attachEvents(container, state) {
      window.Components.AdvancedFilterBar.attachEvents(container, 'analytics');

      // v0.64 - Use the same today/period-end basis as render() so chart interactions match.
      // v0.93: render() stashed both moments ago in this same pass — reuse them.
      const pass = this._pass;
      const ctx = (pass && pass.ctx) || this._getBalanceModeContext(state);
      const filters = ctx.filters;
      const chartData = (pass && pass.chartData !== undefined)
        ? pass.chartData
        : window.Store.computeNetFlowData(filters, ctx.chartClampEnd);
      if (filters.period.type !== 'custom') {
        window.Components.NetFlowChart.attachEvents(container, chartData, filters);
      }

      window.Components.CategoryDonutChart.attachEvents(container, ctx.effectiveFilters);

      // v0.64 - Today / period-end balance mode toggle
      container.querySelectorAll('#balance-mode-toggle .chart-toggle-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const mode = btn.dataset.mode;
          if (mode !== ctx.balanceMode) {
            window.Store.dispatch('SET_ANALYTICS_BALANCE_MODE', mode);
          }
        });
      });

      window.StackdHydrateIcons();
    },

    // v0.80: the bar chart and donut are tracked on their components; release
    // them when leaving Analytics so no detached-canvas instance lingers.
    destroy() {
      const nf = window.Components && window.Components.NetFlowChart;
      if (nf && nf._chartInstance) {
        try { nf._chartInstance.destroy(); } catch (e) { /* already gone */ }
        nf._chartInstance = null;
      }
      const donut = window.Components && window.Components.CategoryDonutChart;
      if (donut && donut._chartInstance) {
        try { donut._chartInstance.destroy(); } catch (e) { /* already gone */ }
        donut._chartInstance = null;
      }
    }
  },

  // -------------------------
  // DASHBOARD VIEW (Phase 6)
  // -------------------------
  DashboardView: {
    hiddenChartAccounts: [], // Track which account IDs are excluded from the chart
    
    render(state) {
      const savedFilters = state.expandedGraphFilters || { interval: 'monthly', accounts: [], categories: [] };
      const selectedInterval = savedFilters.interval || 'monthly';
      const selectedAccountIds = (savedFilters.accounts && savedFilters.accounts.length > 0)
        ? savedFilters.accounts
        : state.accounts.map(acc => acc.id);
      const selectedCategoryIds = savedFilters.categories || [];

      const mainResult = window.Store.computeGraphBalances({
        interval: selectedInterval,
        accountIds: selectedAccountIds,
        categoryIds: selectedCategoryIds
      });
      // v0.93: attachEvents needs this exact series for the chart datasets and
      // runs in the same synchronous pass — stash it instead of re-aggregating.
      this._passGraph = {
        key: `${selectedInterval}|${selectedAccountIds.join(',')}|${selectedCategoryIds.join(',')}`,
        result: mainResult
      };
      const points = (mainResult && mainResult.points) ? mainResult.points : [];
      const globalBalance = points.length > 0 ? points[points.length - 1].balance : 0;
      const formattedBalance = window.Store.formatCurrency(globalBalance);
      
      let walletsHtml = `
        <div class="wallets-scroll-wrapper">
          ${(() => {
            // v0.93: one balance per account, computed before the sort — the
            // comparator used to recompute full-scan balances O(A·logA) times.
            const balancesById = {};
            state.accounts.forEach(acc => { balancesById[acc.id] = window.Store.getAccountBalance(acc.id); });
            const sortedAccounts = [...state.accounts].sort((a, b) => {
              // Priority: Default first, then balance desc
              if (a.id === state.defaultAccountId) return -1;
              if (b.id === state.defaultAccountId) return 1;
              return balancesById[b.id] - balancesById[a.id];
            });

              return sortedAccounts.map(acc => {
                const balance = balancesById[acc.id];
                const formattedBal = window.Store.formatCurrency(balance);
                const isDefault = acc.id === state.defaultAccountId;
                const isHidden = this.hiddenChartAccounts.includes(acc.id);
                const balColor = balance > 0 ? 'var(--color-income)' : (balance < 0 ? 'var(--color-expense)' : 'var(--text-primary)');
                const balClass = balance > 0 ? 'text-income' : (balance < 0 ? 'text-expense' : '');

                return `
                  <div class="wallet-card ${isDefault ? 'is-default' : ''} touch-target" data-id="${acc.id}" style="--acc-color: ${acc.color};">
                    <div class="wallet-card-accent-bar"></div>
                    ${isDefault ? `<div class="wallet-card-default-badge">${window.I18n.t('dash.defaultBadge')}</div>` : ''}
                    
                    <div class="wallet-card-header">
                      <div class="wallet-card-icon-box" style="color: ${acc.color};">
                        <i data-lucide="${acc.icon || 'wallet'}" style="width: 20px; height: 20px;"></i>
                      </div>
                      <div class="account-edit-trigger touch-target" data-id="${acc.id}" style="width: 36px; height: 36px; display: flex; align-items: center; justify-content: center; opacity: 0.8;" aria-label="${window.I18n.t('common.editAccount')}">
                        <i data-lucide="more-horizontal" style="width: 18px; height: 18px;"></i>
                      </div>
                    </div>

                    <div class="wallet-card-info">
                      <div class="wallet-card-type">${window.Store.accountTypeLabel(acc.type)}</div>
                      <div class="wallet-card-name">${acc.name}</div>
                      <div class="wallet-card-balance ${balClass}" style="color: ${balColor};">${formattedBal}</div>
                    </div>
                  </div>
                `;
              }).join('');
          })()}
          <div class="btn-add-wallet-card touch-target" id="btn-dashboard-add-wallet">
            <i data-lucide="plus" style="width: 24px; height: 24px;"></i>
            <span style="font-size: 11px; font-weight: 700; text-transform: uppercase;">${window.I18n.t('dash.addWallet')}</span>
          </div>
        </div>
      `;

      // Calculate MoM % variations (as of today and as of EOM)
      const forecast = window.Store.computeBalanceForecast(selectedAccountIds);
      
      const _fmtVariation = (absVal, pct) => {
        if (pct === null || pct === undefined || absVal === null || absVal === undefined) {
          return { abs: '—', pct: '', color: 'var(--text-tertiary)' };
        }
        let color;
        if (absVal > 0 || pct > 0) color = 'var(--color-income-val)';
        else if (absVal < 0 || pct < 0) color = 'var(--color-expense)';
        else color = 'var(--text-primary)';

        const formattedAbs = window.Store.formatCurrency(absVal);
        const signedAbs = absVal > 0 ? `+${formattedAbs}` : formattedAbs;
        const signedPct = pct > 0 ? `+${pct.toFixed(1)}%` : `${pct.toFixed(1)}%`;

        return { abs: signedAbs, pct: window.I18n.t('dash.vsStartOfMonth', { pct: signedPct }), color };
      };
      
      const todayVar = _fmtVariation(forecast.todayAbsDiff, forecast.todayVariation);
      const eomVar = _fmtVariation(forecast.eomAbsDiff, forecast.eomVariation);
      
      // v0.72 Phase 5: the Recent Activities section moved into the widget area
      // (the 'latest' widget, seeded on upgrade for never-configured users).

      const hasCustomFilters = selectedInterval !== 'monthly' ||
        (savedFilters.accounts && savedFilters.accounts.length > 0 && savedFilters.accounts.length < state.accounts.length) ||
        (savedFilters.categories && savedFilters.categories.length > 0);
      const intervalLabel = window.I18n.t('dash.interval.' + selectedInterval);

      return `
        <div class="container" style="padding-top: var(--space-8); padding-bottom: 100px;">
          <div style="margin-bottom: var(--space-8);">
            <p class="section-title">${window.I18n.t('dash.totalBalance')}</p>
            <h1 class="header-title" style="margin: 0 0 var(--space-3);">${formattedBalance}</h1>
            <div style="display: flex; gap: var(--space-4); align-items: center; flex-wrap: wrap;">
              <div style="display: flex; flex-direction: column; gap: 1px;">
                <span style="font-family: var(--font-family-display); font-size: var(--text-sm); font-weight: 700; color: ${todayVar.color};">${todayVar.abs}</span>
                ${todayVar.pct ? `<span style="font-family: var(--font-family-display); font-size: var(--text-sm); font-weight: 700; color: ${todayVar.color};">${todayVar.pct}</span>` : ''}
                <span style="font-size: var(--text-xs); color: var(--text-tertiary); font-weight: 500;">${window.I18n.t('dash.asOfToday')}</span>
              </div>
              <div style="width: 1px; align-self: stretch; background: var(--color-border); flex-shrink: 0;"></div>
              <div style="display: flex; flex-direction: column; gap: 1px;">
                <span style="font-family: var(--font-family-display); font-size: var(--text-sm); font-weight: 700; color: ${eomVar.color};">${eomVar.abs}</span>
                ${eomVar.pct ? `<span style="font-family: var(--font-family-display); font-size: var(--text-sm); font-weight: 700; color: ${eomVar.color};">${eomVar.pct}</span>` : ''}
                <span style="font-size: var(--text-xs); color: var(--text-tertiary); font-weight: 500;">${window.I18n.t('dash.projectedEom')}</span>
              </div>
            </div>
          </div>
          
          ${hasCustomFilters ? `
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: var(--space-2);">
              <span style="font-size: var(--text-xs); font-weight: 700; text-transform: uppercase; color: var(--color-primary); letter-spacing: 0.05em;">
                ${window.I18n.t('dash.filteredView', { interval: intervalLabel })}
              </span>
              <button id="btn-reset-graph-filters" style="background: none; border: none; font-size: 0.75rem; font-weight: 700; color: var(--color-expense, #ef4444); cursor: pointer; display: inline-flex; align-items: center; gap: 4px; padding: 2px 6px; border-radius: 6px;" aria-label="${window.I18n.t('dash.resetViewAria')}">
                <i data-lucide="rotate-ccw" style="width: 14px; height: 14px;"></i>
                <span>${window.I18n.t('dash.resetView')}</span>
              </button>
            </div>
          ` : ''}

          <div id="chart-card-container" style="height: 160px; margin-bottom: var(--space-6); position: relative; margin-left: calc(-1 * var(--container-pad-left, var(--space-4))); margin-right: calc(-1 * var(--container-pad-right, var(--space-4))); cursor: pointer;" title="${window.I18n.t('dash.expandGraphTitle')}" role="button" aria-label="${window.I18n.t('dash.expandGraphAria')}">
            <canvas id="balanceChart"></canvas>
          </div>
          
          <div style="margin-top: var(--space-8);">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: var(--space-1);">
              <p class="section-title" style="margin-bottom: 0;">${window.I18n.t('dash.wallets')}</p>
            </div>
            ${walletsHtml}
          </div>

          ${window.Insights ? window.Insights.renderSection(state) : ''}

          ${window.Widgets ? window.Widgets.renderSection(state) : ''}
        </div>
      `;
    },
    attachEvents(container, state) {
      window.StackdHydrateIcons();

      // v0.84: smart insights section (between the Wallets rail and widgets)
      if (window.Insights) window.Insights.attachSection(container, state);

      // v0.72: home widget area (replaced the static Financial Milestone card)
      if (window.Widgets) window.Widgets.attachSection(container, state);

      // Wallet Card Interactions
      container.querySelectorAll('.wallet-card').forEach(card => {
        card.addEventListener('click', (e) => {
          // If sub-controls (3-dots) were clicked, don't navigate to history
          if (e.target.closest('.account-edit-trigger')) return;
          
          const id = card.dataset.id;
          // Navigate with account param — the router resets History filters to
          // defaults + this account (v0.94 replace semantics). The old
          // SET_PERIOD_TYPE dispatch here wrote activePeriod, which History
          // never reads — pure wasted render.
          window.Router.navigate(`#transactions?account=${id}`);
        });
      });

      container.querySelectorAll('.account-edit-trigger').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const id = btn.dataset.id;
          window.Router.navigate(`#edit-account?id=${id}`);
        });
      });

      const btnDashboardAddWallet = container.querySelector('#btn-dashboard-add-wallet');
      if (btnDashboardAddWallet) {
        btnDashboardAddWallet.addEventListener('click', () => {
          window.Router.navigate('#edit-account');
        });
      }

      // Expand Chart Modal Interaction
      const chartContainer = container.querySelector('#chart-card-container');
      if (chartContainer) {
        chartContainer.addEventListener('click', () => {
          if (window.Components && window.Components.ExpandedGraphModal) {
            window.Components.ExpandedGraphModal.show(state);
          }
        });
      }

      // Reset Graph Filters button
      const resetGraphBtn = container.querySelector('#btn-reset-graph-filters');
      if (resetGraphBtn) {
        resetGraphBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          window.Store.dispatch('RESET_EXPANDED_GRAPH_FILTERS');
        });
      }

      // 12-Month Aggregated Balance Chart
      const ctx = document.getElementById('balanceChart');
      if (ctx) {
        if (!window.Chart) {
          console.error('DashboardView: window.Chart is NOT available.');
          return;
        }

        try {
          const savedFilters = state.expandedGraphFilters || { interval: 'monthly', accounts: [], categories: [] };
          const selectedInterval = savedFilters.interval || 'monthly';
          const selectedAccountIds = (savedFilters.accounts && savedFilters.accounts.length > 0)
            ? savedFilters.accounts
            : state.accounts.map(acc => acc.id);
          const selectedCategoryIds = savedFilters.categories || [];

          // v0.93: render() computed this exact series moments ago in the same
          // synchronous pass — reuse it (key guards against filter drift).
          const graphKey = `${selectedInterval}|${selectedAccountIds.join(',')}|${selectedCategoryIds.join(',')}`;
          const graphResult = (this._passGraph && this._passGraph.key === graphKey)
            ? this._passGraph.result
            : window.Store.computeGraphBalances({
                interval: selectedInterval,
                accountIds: selectedAccountIds,
                categoryIds: selectedCategoryIds
              });

          const mainPoints = (graphResult && graphResult.points) ? graphResult.points : [];
          const monthLabels = (graphResult && graphResult.monthLabels) ? graphResult.monthLabels : [];
          const isQuarter = selectedInterval === 'quarter';

          // Theme-aware chart colors (dark mode contrast fix)
          const isDark = state.activeTheme === 'dark';
          const mainLineColor = isDark ? '#38bdf8' : '#5f5e5e';
          const mainFillColor = isDark ? 'rgba(56, 189, 248, 0.08)' : 'rgba(95, 94, 94, 0.05)';

          const datasets = [{
            label: window.I18n.t('dash.totalBalance'),
            data: mainPoints,
            borderColor: mainLineColor,
            backgroundColor: mainFillColor,
            borderWidth: 3,
            fill: true,
            tension: 0,
            pointRadius: 0,
            pointHoverRadius: 6,
            pointBackgroundColor: isDark ? '#161e2e' : '#fff',
            pointBorderWidth: 4,
            pointBorderColor: mainLineColor
          }];

          const visibleAccounts = state.accounts.filter(a => selectedAccountIds.includes(a.id));
          visibleAccounts.forEach(acc => {
            const accResult = window.Store.computeGraphBalances({
              interval: selectedInterval,
              accountIds: [acc.id],
              categoryIds: selectedCategoryIds
            });

            datasets.push({
              label: acc.name,
              data: (accResult && accResult.points) ? accResult.points : [],
              borderColor: acc.color,
              borderWidth: 1.5,
              borderDash: [5, 5],
              fill: false,
              tension: 0,
              pointRadius: 0
            });
          });

          // v0.80: destroy the previous instance first. Every dispatch re-renders
          // the view and replaces this canvas; a bare `new Chart` leaked one
          // instance (pinned to its detached canvas) into Chart.instances per
          // dispatch, which exhausted the Android WebView canvas memory budget
          // and made freshly-mounted widget canvases paint blank.
          if (this._balanceChart) {
            try { this._balanceChart.destroy(); } catch (e) { /* already gone */ }
            this._balanceChart = null;
          }
          this._balanceChart = new window.Chart(ctx, {
            type: 'line',
            data: { datasets },
            options: {
              responsive: true,
              maintainAspectRatio: false,
              animation: { duration: 0 },
              interaction: { mode: 'index', intersect: false },
              plugins: {
                legend: { display: false },
                tooltip: {
                  backgroundColor: isDark ? '#161e2e' : '#ffffff',
                  titleColor: isDark ? '#94a3b8' : '#596065',
                  bodyColor: isDark ? '#f8fafc' : '#2d3338',
                  bodyFont: { family: 'Manrope', size: 13, weight: 'bold' },
                  displayColors: true,
                  boxPadding: 4,
                  borderColor: isDark ? 'rgba(51, 65, 85, 0.8)' : '#e4e9ee',
                  borderWidth: 1,
                  padding: 10,
                  itemSort: (a, b) => b.parsed.y - a.parsed.y,
                  callbacks: {
                    title: (items) => items[0]?.raw?.fullLabel || items[0]?.raw?.label || '',
                    label: (ctx) => ` ${ctx.dataset.label}: ${window.Store.formatCurrency(ctx.parsed.y)}`
                  }
                }
              },
              scales: {
                x: {
                  type: 'linear',
                  min: 0,
                  max: isQuarter ? 3 : (selectedInterval === 'weekly' ? 51 : 11),
                  grid: { display: false },
                  ticks: {
                    stepSize: isQuarter ? 1 : (selectedInterval === 'weekly' ? 4 : 1),
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
                    color: isDark ? '#94a3b8' : '#64748b',
                    callback: (val) => {
                      const idx = Math.round(val);
                      if (Math.abs(val - idx) < 0.001 && idx >= 0 && idx < monthLabels.length) {
                        return monthLabels[idx];
                      }
                      return '';
                    }
                  }
                },
                y: { display: false, beginAtZero: false }
              }
            }
          });
        } catch (err) {
          console.error('DashboardView: FAILED to initialize Chart:', err);
        }
      }
    },

    // v0.72: main.js calls this on transition to another view. Widget charts are
    // tracked by widget id (not by canvas), so they must be released explicitly
    // or they keep detached canvases alive for the rest of the session.
    // v0.80: the balance line chart rides the same rule.
    destroy() {
      if (window.Widgets) window.Widgets.destroyCharts();
      if (this._balanceChart) {
        try { this._balanceChart.destroy(); } catch (e) { /* already gone */ }
        this._balanceChart = null;
      }
    }
  },

  // ACCOUNTS VIEW has been deleted entirely per v0.8

  // -------------------------
  // TRANSACTIONS VIEW (v0.5)
  // -------------------------
  TransactionsView: {
    _scrollListener: null,

    // NOTE: scrollToToday lives further down in this object literal (the
    // sticky-header-aware version). An older duplicate used to sit here and was
    // silently shadowed by it — removed, no behavior change.

    render(state) {
      const filters = state.historyFilters;
      const periodLabel = window.Store._getPeriodLabel(filters.period);
      const visibleTx = window.Store.getFilteredTransactions('history');

      const isSelectionMode = state.isSelectionMode === true;
      const selectedIds = Array.isArray(state.selectedTransactionIds) ? state.selectedTransactionIds : [];
      const selectedCount = selectedIds.length;
      const visibleTxIds = visibleTx.map(t => t.id);
      const allVisibleSelected = visibleTxIds.length > 0 && visibleTxIds.every(id => selectedIds.includes(id));

      const filterBarHtml = window.Components.AdvancedFilterBar.render('history', filters);

      const now = new Date();
      const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
      
      const bounds = window.Store._getPeriodBounds(filters.period.type, filters.period.value);
      // For custom, bounds might be empty, so we use start/end from period
      const rangeStart = filters.period.type === 'custom' ? filters.period.start : bounds.start;
      const rangeEnd = filters.period.type === 'custom' ? filters.period.end : bounds.end;

      const isFuture = rangeEnd > todayStr;

      const startBalance = state.transactions
        .filter(t => {
            const matchAcc = filters.accounts.length === 0 || filters.accounts.includes(t.accountId);
            return matchAcc && t.date < rangeStart;
        })
        .reduce((sum, tx) => window.Store._isPositiveTx(tx) ? sum + tx.amount : sum - tx.amount, 0);
        
      const endBalance = state.transactions
        .filter(t => {
            const matchAcc = filters.accounts.length === 0 || filters.accounts.includes(t.accountId);
            return matchAcc && t.date <= rangeEnd;
        })
        .reduce((sum, tx) => window.Store._isPositiveTx(tx) ? sum + tx.amount : sum - tx.amount, 0);

      const netChange = endBalance - startBalance;

      const startBalColor  = startBalance > 0 ? 'var(--color-income)' : (startBalance < 0 ? 'var(--color-expense)' : 'var(--color-balance-val)');
      const endBalColor    = endBalance   > 0 ? 'var(--color-income)' : (endBalance   < 0 ? 'var(--color-expense)' : 'var(--color-balance-val)');
      const netChangeColor = netChange    > 0 ? 'var(--color-income)' : (netChange    < 0 ? 'var(--color-expense)' : 'var(--color-balance-val)');
      const netChangeSign  = netChange > 0 ? '+' : '';

      // v0.61 - Autosize the three figures as one group so they stay the same size as
      // each other. Net Change was the first to wrap because its leading '+' costs a
      // whole character the other two never pay.
      const startStr = window.Store.formatCurrency(startBalance);
      const endStr   = window.Store.formatCurrency(endBalance);
      const netStr   = `${netChangeSign}${window.Store.formatCurrency(netChange)}`;

      // Usable width of one cell: container inner width (capped at 600px, less its 16px
      // side padding), split three ways, less this cell's 12px padding, its divider, and
      // a small margin so the estimate stays under the real width rather than over it.
      const summaryCellWidth = '((min(600px, 100vw) - 32px) / 3 - 28px)';
      const summaryFontSize  = window.Components.fitNumericFontSize([startStr, endStr, netStr], 0.95, 0.6, summaryCellWidth);

      // min-width:0 keeps each column at exactly one third; without it the nowrapped
      // value would widen its own column and overflow the card.
      const summaryCellStyle  = 'padding: var(--space-3); min-width: 0;';
      const summaryLabelStyle = 'font-size: 0.68rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; color: var(--text-secondary); margin-bottom: 4px;';
      const summaryValueStyle = `font-family: var(--font-family-display); font-weight: 700; font-size: ${summaryFontSize}; white-space: nowrap; font-variant-numeric: tabular-nums;`;

      const balanceSummaryHtml = `
        <div style="
          background: var(--bg-surface);
          border: 1px solid var(--color-border);
          border-radius: var(--radius-lg);
          box-shadow: 0 2px 8px rgba(15,23,42,0.04);
          margin-bottom: var(--space-4);
          overflow: hidden;
        ">
          <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; border-bottom: 1px solid var(--color-border);">

            <!-- Start Balance -->
            <div style="${summaryCellStyle} border-right: 1px solid var(--color-border);">
              <div style="${summaryLabelStyle}">${window.I18n.t('history.start')}</div>
              <div style="${summaryValueStyle} color: ${startBalColor};">${startStr}</div>
            </div>

            <!-- End Balance -->
            <div style="${summaryCellStyle} border-right: 1px solid var(--color-border);">
              <div style="${summaryLabelStyle}">${window.I18n.t('history.end')}</div>
              <div style="${summaryValueStyle} color: ${endBalColor};">${endStr}</div>
            </div>

            <!-- Net Change -->
            <div style="${summaryCellStyle} background: var(--bg-surface-sunken);">
              <div style="${summaryLabelStyle}">${window.I18n.t('history.netChange')}</div>
              <div style="${summaryValueStyle} color: ${netChangeColor};">${netStr}</div>
            </div>

          </div>
        </div>`;

      let txListHtml = balanceSummaryHtml;
      const isAsc = filters.sortOrder === 'asc';

      if (visibleTx.length === 0) {
        txListHtml += `
          <div style="text-align: center; padding: 60px 20px;">
            <div style="font-size: 3rem; margin-bottom: 16px; opacity: 0.5;">📅</div>
            <p style="color: var(--text-secondary); font-weight: 500;">${window.I18n.t('history.emptyPeriod')}</p>
          </div>
        `;
      } else {
        const groups = visibleTx.reduce((acc, tx) => {
          if (!acc[tx.date]) acc[tx.date] = [];
          acc[tx.date].push(tx);
          return acc;
        }, {});

        const sortedDates = Object.keys(groups).sort((a,b) => isAsc ? a.localeCompare(b) : b.localeCompare(a));

        sortedDates.forEach(date => {
          const dayTxs = groups[date];
          const displayDate = new Date(date + 'T00:00:00').toLocaleDateString(window.Store.getLocale(), {
            weekday: 'short', month: 'short', day: 'numeric'
          });

          const daySum = dayTxs.reduce((sum, tx) => {
            if (tx.isPaid === false) return sum;
            if (tx.transferRef || tx.type === 'transfer' || tx.type === 'transfer_in' || tx.type === 'transfer_out') {
              return sum;
            }
            const isOpeningBalance = tx.type === 'opening_balance';
            if (tx.type === 'income' || (isOpeningBalance && tx.amount >= 0)) {
              return sum + Math.abs(tx.amount);
            } else if (tx.type === 'expense' || (isOpeningBalance && tx.amount < 0)) {
              return sum - Math.abs(tx.amount);
            }
            return sum;
          }, 0);

          const sumColor = daySum > 0 ? 'var(--color-income)' : (daySum < 0 ? 'var(--color-expense)' : 'var(--text-secondary)');
          const formattedSum = window.Store.formatCurrency(daySum);

          txListHtml += `
            <div id="tx-${date}" class="date-group-container">
              <div class="date-group-header">${displayDate}</div>
              <div class="list-group">
                ${dayTxs.map(tx => {
                  const category = state.categories.find(c => c.id === tx.categoryId);
                  const account = state.accounts.find(a => a.id === tx.accountId);
                  const isSelected = selectedIds.includes(tx.id);
                  return window.Components.TransactionItem.render(tx, category, account, {
                    isSelectionMode,
                    isSelected,
                    allowSwipeReveal: true
                  });
                }).join('')}
              </div>
              <div class="day-summary-footer" style="color: ${sumColor};">
                ${window.I18n.t('history.daySum', { amount: formattedSum })}
              </div>
            </div>
          `;
        });
      }

      const hasAccountFilter = filters.accounts && filters.accounts.length > 0 && filters.accounts.length < state.accounts.length;
      // v0.94: same treatment as the tag chip below — the wallet-tile deep
      // link filters by account, and an invisible filter reads as "my
      // transactions disappeared". Shows the account names, tap to clear.
      const accountFilterIndicatorHtml = hasAccountFilter
        ? `<div id="history-account-filter-chip" role="button" tabindex="0" title="${window.I18n.t('history.clearAccountTitle')}"
                style="display: inline-flex; align-items: center; gap: 4px; margin-top: 4px; padding: 2px 8px; border-radius: var(--radius-full); background: var(--bg-surface-sunken); font-size: 0.72rem; font-weight: 700; color: var(--text-secondary); cursor: pointer;">
             ${filters.accounts.map(id => { const a = state.accounts.find(x => x.id === id); return escapeAttr(a ? a.name : id); }).join(', ')} <span aria-hidden="true">✕</span>
           </div>`
        : '';

      // v0.85: a tag filter usually arrives from a drilldown, so say so — an
      // invisible filter reads as "my transactions disappeared". Tap to clear.
      const activeTags = Array.isArray(filters.tags) ? filters.tags : [];
      const tagFilterIndicatorHtml = activeTags.length
        ? `<div id="history-tag-filter-chip" role="button" tabindex="0" title="${window.I18n.t('history.clearTagTitle')}"
                style="display: inline-flex; align-items: center; gap: 4px; margin-top: 4px; padding: 2px 8px; border-radius: var(--radius-full); background: var(--bg-surface-sunken); font-size: 0.72rem; font-weight: 700; color: var(--text-secondary); cursor: pointer;">
             ${activeTags.map(t => t === '__untagged__' ? window.I18n.t('history.noTag') : '#' + escapeAttr(t)).join(', ')} <span aria-hidden="true">✕</span>
           </div>`
        : '';

      const sortLabel = isAsc ? window.I18n.t('history.oldestFirst') : window.I18n.t('history.newestFirst');
      const sortIndicatorHtml = `<div style="font-size: 0.72rem; font-weight: 600; color: var(--text-secondary); opacity: 0.85; text-align: right; margin-top: 2px;">${window.I18n.t('history.sortedBy', { order: sortLabel })}</div>`;

      const headerContentHtml = isSelectionMode
        ? `
            <div class="page-header contextual-header-bar" style="display: flex; justify-content: space-between; align-items: center; background: var(--bg-surface); padding: 8px 10px; border-radius: var(--radius-lg); border: 1px solid var(--color-border); box-shadow: 0 4px 14px rgba(15,23,42,0.06); width: 100%; box-sizing: border-box; overflow: hidden; gap: 6px;">
              <button id="btn-cancel-selection" class="btn-selection-action" style="background: var(--bg-surface-sunken); border-color: var(--color-border);" aria-label="${window.I18n.t('history.cancelSelectionAria')}">
                ${window.I18n.t('common.cancel')}
              </button>
              <div class="selection-count-label" style="font-family: var(--font-family-display); font-weight: 700; font-size: 0.85rem; color: var(--text-primary); white-space: nowrap; flex-shrink: 0;">
                ${window.I18n.t('history.selectedCount', { count: selectedCount })}
              </div>
              <div style="display: flex; gap: 6px; align-items: center; flex-shrink: 0; min-width: 0;">
                <button id="btn-toggle-select-all" class="btn-selection-action">
                  ${allVisibleSelected ? window.I18n.t('history.deselectAll') : window.I18n.t('history.selectAll')}
                </button>
                <button id="btn-bulk-delete-header" class="btn-selection-action btn-selection-delete" ${selectedCount === 0 ? 'disabled' : ''}>
                  ${selectedCount > 0 ? window.I18n.t('history.deleteWithCount', { count: selectedCount }) : window.I18n.t('common.delete')}
                </button>
              </div>
            </div>
          `
        : `
            <div class="page-header">
              <h1 class="page-header-title">${window.I18n.t('history.title')}</h1>
              <div style="text-align: right; display: flex; flex-direction: column; align-items: flex-end; gap: 4px;">
                <button id="btn-start-selection-mode" class="btn-selection-action" aria-label="${window.I18n.t('history.selectAria')}">
                  ${window.I18n.t('history.select')}
                </button>
                <div style="font-family: var(--font-family-display); font-weight: 700; font-size: 0.9rem; color: var(--color-primary);">${periodLabel}</div>
                ${accountFilterIndicatorHtml}
                ${tagFilterIndicatorHtml}
                ${sortIndicatorHtml}
              </div>
            </div>
          `;

      return `
        <div class="container" style="padding-bottom: 120px;">
          <!-- FIXED STICKY HEADER -->
          <div class="history-header-sticky" id="history-sticky-header">
            ${headerContentHtml}
            <!-- New Filter Bar -->
            ${filterBarHtml}
          </div>

          <!-- Transactions List Container -->
          <div style="margin-top: var(--space-4);">
            ${txListHtml}
          </div>

          <!-- v0.94: floating back-to-top. Visibility is CSS-driven by
               #router-view.is-deep-scrolled (boot scroll listener in main.js);
               position:fixed escapes .container's overflow-x clip. -->
          <button type="button" id="btn-history-to-top" class="history-to-top" aria-label="${window.I18n.t('history.backToTop')}">
            <i data-lucide="chevron-up" style="width: 22px; height: 22px;"></i>
          </button>
        </div>
      `;
    },

    attachEvents(container, state, isEntry) {
      window.StackdHydrateIcons();

      window.Components.AdvancedFilterBar.attachEvents(container, 'history', state);

      // v0.85: the tag-filter chip clears the drilled-in tag in place.
      const tagChip = container.querySelector('#history-tag-filter-chip');
      if (tagChip) {
        tagChip.addEventListener('click', () => {
          window.Store.dispatch('UPDATE_FILTERS', { page: 'history', filters: { tags: [] } });
        });
      }

      // v0.94: the account chip clears the wallet-tile drilldown in place.
      const accChip = container.querySelector('#history-account-filter-chip');
      if (accChip) {
        accChip.addEventListener('click', () => {
          window.Store.dispatch('UPDATE_FILTERS', { page: 'history', filters: { accounts: [] } });
        });
      }

      // v0.94: back-to-top — native smooth scroll on the app's only scroller
      // (never ScrollUtils' multi-target sweep). Fresh node per render, so a
      // bare listener is fine; visibility is handled by CSS.
      const toTopBtn = container.querySelector('#btn-history-to-top');
      if (toTopBtn) {
        toTopBtn.addEventListener('click', () => {
          container.scrollTo({ top: 0, behavior: 'smooth' });
        });
      }

      const btnStartSelectionMode = container.querySelector('#btn-start-selection-mode');
      if (btnStartSelectionMode) {
        btnStartSelectionMode.addEventListener('click', () => {
          window.Store.dispatch('TOGGLE_SELECTION_MODE', { active: true });
        });
      }

      const handleCancelSelection = () => {
        window.Store.dispatch('TOGGLE_SELECTION_MODE', { active: false });
      };

      const btnCancelSelection = container.querySelector('#btn-cancel-selection');
      if (btnCancelSelection) btnCancelSelection.addEventListener('click', handleCancelSelection);

      const btnToggleSelectAll = container.querySelector('#btn-toggle-select-all');
      if (btnToggleSelectAll) {
        btnToggleSelectAll.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          const currentStoreState = window.Store.getState();
          const visibleTx = window.Store.getFilteredTransactions('history');
          const visibleTxIds = visibleTx.map(t => t.id);
          const selectedIds = currentStoreState.selectedTransactionIds || [];
          const allSelected = visibleTxIds.length > 0 && visibleTxIds.every(id => selectedIds.includes(id));
          window.Store.dispatch('SET_ALL_TRANSACTIONS_SELECTION', { selectAll: !allSelected, ids: visibleTxIds });
        });
      }

      const handleBulkDelete = () => {
        const currentStoreState = window.Store.getState();
        const selectedIds = currentStoreState.selectedTransactionIds || [];
        if (selectedIds.length === 0) return;

        const selectedTxs = currentStoreState.transactions.filter(t => selectedIds.includes(t.id));
        const hasRecurring = selectedTxs.some(t => t.recurrence && t.recurrence.seriesId);

        if (!hasRecurring) {
          const count = selectedIds.length;

          window.Components.Modal.show({
            title: window.I18n.t('history.bulkDelete.title', { count }),
            content: `<p style="color: var(--text-secondary); margin-bottom: 8px;">${window.I18n.t('history.bulkDelete.confirm', { count })} <strong>${window.I18n.t('common.cannotUndo')}</strong></p>`,
            saveText: window.I18n.t('common.cancel'),
            showDelete: true,
            onSave: (closeModal) => closeModal(),
            onDelete: (closeModal) => {
              window.Store.dispatch('DELETE_BULK_TRANSACTIONS', { ids: selectedIds, deleteFuture: false });
              closeModal();
            }
          });
          setTimeout(() => {
            const btnModalSave = document.getElementById('modal-save-btn');
            const btnModalDelete = document.getElementById('modal-delete-btn');
            if (btnModalSave) btnModalSave.className = 'btn btn-secondary';
            if (btnModalDelete) btnModalDelete.innerHTML = window.I18n.t('history.bulkDelete.button', { count });
          }, 10);
        } else {
          window.Components.Modal.show({
            title: window.I18n.t('history.bulkRecurring.title'),
            content: `
              <p style="margin-bottom: 16px; color: var(--text-secondary);">${window.I18n.t('history.bulkRecurring.body')}</p>
              <div style="display: flex; flex-direction: column; gap: 10px;">
                <button id="btn-delete-only-selected" class="btn btn-secondary" style="width: 100%; text-align: left; justify-content: flex-start; padding: 12px 16px; font-weight: 600;">
                  📌 ${window.I18n.t('history.bulkRecurring.onlySelected', { count: selectedIds.length })}
                </button>
                <button id="btn-delete-selected-future" class="btn" style="width: 100%; text-align: left; justify-content: flex-start; padding: 12px 16px; font-weight: 600; color: var(--color-expense); background: var(--color-expense-bg); border: 1px solid var(--color-expense);">
                  🔄 ${window.I18n.t('history.bulkRecurring.withFuture')}
                </button>
              </div>
            `,
            saveText: window.I18n.t('common.cancel'),
            showDelete: false,
            onSave: (closeModal) => closeModal()
          });

          setTimeout(() => {
            const btnOnlySelected = document.getElementById('btn-delete-only-selected');
            const btnSelectedFuture = document.getElementById('btn-delete-selected-future');

            if (btnOnlySelected) {
              btnOnlySelected.addEventListener('click', () => {
                window.Store.dispatch('DELETE_BULK_TRANSACTIONS', { ids: selectedIds, deleteFuture: false });
                if (window.Components.Modal.hide) window.Components.Modal.hide();
              });
            }
            if (btnSelectedFuture) {
              btnSelectedFuture.addEventListener('click', () => {
                window.Store.dispatch('DELETE_BULK_TRANSACTIONS', { ids: selectedIds, deleteFuture: true });
                if (window.Components.Modal.hide) window.Components.Modal.hide();
              });
            }
          }, 10);
        }
      };

      const btnBulkDeleteHeader = container.querySelector('#btn-bulk-delete-header');
      if (btnBulkDeleteHeader) btnBulkDeleteHeader.addEventListener('click', handleBulkDelete);

      // Paid action buttons handler
      container.querySelectorAll('.swipe-action-btn.paid').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          const txId = btn.dataset.id;
          if (txId) {
            window.Store.dispatch('TOGGLE_TRANSACTION_PAID', { id: txId });
          }
        });
      });

      // Edit action buttons handler
      container.querySelectorAll('.swipe-action-btn.edit').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          const txId = btn.dataset.id;
          if (txId) {
            window.Router.navigate('#edit?id=' + txId);
          }
        });
      });

      // Delete action buttons handler
      container.querySelectorAll('.swipe-action-btn.delete').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          const txId = btn.dataset.id;
          if (!txId) return;
          const currentStoreState = window.Store.getState();
          const txToDelete = currentStoreState.transactions.find(t => t.id === txId);
          if (!txToDelete) return;

          if (txToDelete.recurrence && txToDelete.recurrence.seriesId) {
            window.Components.Modal.show({
              title: window.I18n.t('history.recurringDelete.title'),
              content: `<p style="color: var(--text-secondary); margin-bottom: 12px;">${window.I18n.t('history.recurringDelete.body')}</p><div style="display: flex; flex-direction: column; gap: 10px;"><button id="btn-delete-single" class="btn btn-secondary" style="width: 100%; text-align: left;">📌 ${window.I18n.t('history.recurringDelete.onlyThis')}</button><button id="btn-delete-future-series" class="btn" style="width: 100%; text-align: left; color: var(--color-expense); background: var(--color-expense-bg); border: 1px solid var(--color-expense);">🔄 ${window.I18n.t('history.recurringDelete.withFuture')}</button></div>`,
              saveText: window.I18n.t('common.cancel'),
              showDelete: false,
              onSave: (closeModal) => closeModal()
            });
            setTimeout(() => {
              const btnSingle = document.getElementById('btn-delete-single');
              const btnFutureSeries = document.getElementById('btn-delete-future-series');
              if (btnSingle) {
                btnSingle.onclick = () => {
                  window.Store.dispatch('DELETE_TRANSACTION', { id: txId, deleteAll: false });
                  if (window.Components.Modal.hide) window.Components.Modal.hide();
                };
              }
              if (btnFutureSeries) {
                btnFutureSeries.onclick = () => {
                  window.Store.dispatch('DELETE_TRANSACTION', { id: txId, deleteFuture: true });
                  if (window.Components.Modal.hide) window.Components.Modal.hide();
                };
              }
            }, 10);
          } else {
            window.Components.Modal.show({
              title: window.I18n.t('history.deleteOne.title'),
              content: `<p style="color: var(--text-secondary);">${window.I18n.t('history.bulkDelete.confirm', { count: 1 })} <strong>${window.I18n.t('common.cannotUndo')}</strong></p>`,
              saveText: window.I18n.t('common.cancel'),
              showDelete: true,
              onSave: (closeModal) => closeModal(),
              onDelete: (closeModal) => {
                window.Store.dispatch('DELETE_TRANSACTION', { id: txId });
                closeModal();
              }
            });
          }
        });
      });

      // Bi-directional Swipe Gesture Handler
      const closeAllSwipes = (exceptContainer = null) => {
        container.querySelectorAll('.swipe-container').forEach(sc => {
          if (sc !== exceptContainer) {
            const content = sc.querySelector('.swipe-content');
            if (content) content.style.transform = 'translateX(0px)';
          }
        });
      };

      container.querySelectorAll('.swipe-container').forEach(swipeContainer => {
        const swipeContent = swipeContainer.querySelector('.swipe-content');
        if (!swipeContent) return;

        let startX = 0;
        let startY = 0;
        let isDragging = false;
        let isHorizontal = false;
        let currentOffset = 0;

        const handleStart = (clientX, clientY) => {
          const storeState = window.Store.getState();
          if (storeState.isSelectionMode) return;

          startX = clientX;
          startY = clientY;
          isDragging = true;
          isHorizontal = false;
          swipeContent.style.transition = 'none';

          const match = swipeContent.style.transform.match(/translateX\(([-?\d.]+)px\)/);
          currentOffset = match ? parseFloat(match[1]) : 0;
        };

        const handleMove = (clientX, clientY, e) => {
          if (!isDragging) return;

          const deltaX = clientX - startX;
          const deltaY = clientY - startY;

          if (!isHorizontal) {
            if (Math.abs(deltaX) > 8 && Math.abs(deltaX) > Math.abs(deltaY)) {
              isHorizontal = true;
              closeAllSwipes(swipeContainer);
            } else if (Math.abs(deltaY) > 8) {
              isDragging = false;
              return;
            }
          }

          if (isHorizontal) {
            if (e && e.cancelable) e.preventDefault();

            let targetX = currentOffset + deltaX;
            if (targetX < -130) targetX = -130;
            if (targetX > 90) targetX = 90;

            swipeContent.style.transform = `translateX(${targetX}px)`;
          }
        };

        const handleEnd = (clientX) => {
          if (!isDragging) return;
          isDragging = false;
          swipeContent.style.transition = 'transform 0.25s cubic-bezier(0.16, 1, 0.3, 1)';

          const deltaX = clientX - startX;

          if (isHorizontal) {
            if (deltaX < -40 || (currentOffset < 0 && deltaX < 20)) {
              // Swipe Left: reveal Edit & Delete
              swipeContent.style.transform = 'translateX(-110px)';
            } else if (deltaX > 40 || (currentOffset > 0 && deltaX > -20)) {
              // Swipe Right: reveal Paid
              swipeContent.style.transform = 'translateX(70px)';
            } else {
              swipeContent.style.transform = 'translateX(0px)';
            }
          }
        };

        swipeContainer.addEventListener('touchstart', (e) => {
          if (e.touches.length === 1) handleStart(e.touches[0].clientX, e.touches[0].clientY);
        }, { passive: true });

        swipeContainer.addEventListener('touchmove', (e) => {
          if (e.touches.length === 1) handleMove(e.touches[0].clientX, e.touches[0].clientY, e);
        }, { passive: false });

        swipeContainer.addEventListener('touchend', (e) => {
          const endX = e.changedTouches && e.changedTouches[0] ? e.changedTouches[0].clientX : startX;
          handleEnd(endX);
        });
      });

      // Long press & Click handling on transaction list items
      let longPressTimer = null;

      const clearLongPress = () => {
        if (longPressTimer) {
          clearTimeout(longPressTimer);
          longPressTimer = null;
        }
      };

      container.querySelectorAll('.list-item[data-id]').forEach(item => {
        const txId = item.dataset.id;
        if (!txId) return;

        const startPress = () => {
          clearLongPress();

          const currentStoreState = window.Store.getState();
          if (currentStoreState.isSelectionMode) return;

          longPressTimer = setTimeout(() => {
            if (window.navigator && window.navigator.vibrate) {
              try { window.navigator.vibrate(40); } catch (_) {}
            }
            window.Store.dispatch('TOGGLE_SELECTION_MODE', { active: true });
            window.Store.dispatch('TOGGLE_TRANSACTION_SELECTION', { id: txId });
            clearLongPress();
          }, 500);
        };

        item.addEventListener('touchstart', startPress, { passive: true });
        item.addEventListener('mousedown', startPress);

        item.addEventListener('touchend', clearLongPress);
        item.addEventListener('touchmove', clearLongPress);
        item.addEventListener('mouseup', clearLongPress);
        item.addEventListener('mouseleave', clearLongPress);

        item.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();

          const currentStoreState = window.Store.getState();
          if (currentStoreState.isSelectionMode) {
            window.Store.dispatch('TOGGLE_TRANSACTION_SELECTION', { id: txId });
          } else {
            // Close any swiped items on click if offset
            const parentSwipe = item.closest('.swipe-container');
            const match = item.style.transform.match(/translateX\(([-?\d.]+)px\)/);
            const currentOffset = match ? parseFloat(match[1]) : 0;
            if (currentOffset !== 0) {
              item.style.transform = 'translateX(0px)';
              return;
            }
            window.Router.navigate('#edit?id=' + txId);
          }
        });
      });

      // v0.80: re-tapping the History nav item while already on History fires
      // this router event (it previously had no listener — dead code); it is
      // now the explicit "take me back to today" gesture alongside the pill.
      if (container._historyReTapHandler) {
        window.removeEventListener('scroll-history-to-today', container._historyReTapHandler);
      }
      container._historyReTapHandler = () => this.scrollToToday(container);
      window.addEventListener('scroll-history-to-today', container._historyReTapHandler);

      // v0.80: scroll to today only when ENTERING History. On same-view
      // re-renders (selection mode, checkbox taps, paid/filter toggles) the
      // unconditional call yanked the list back to today and lost the user's
      // place — main.js now preserves scrollTop across those renders instead.
      if (isEntry !== false) this.scrollToToday(container);
    },

    scrollToToday(container) {
      // v0.80: local-time date parts — render() groups days in local time, and
      // the old toISOString() (UTC) targeted the wrong day near midnight.
      const now = new Date();
      const pad = (n) => String(n).padStart(2, '0');
      const today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
      const dateGroups = Array.from(container.querySelectorAll('.date-group-container[id^="tx-"]'));
      const targetGroup = dateGroups.find(g => g.id === `tx-${today}`) || 
                          dateGroups.filter(g => g.id < `tx-${today}`).sort((a,b) => b.id.localeCompare(a.id))[0];

      if (targetGroup) {
        requestAnimationFrame(() => {
          const stickyHeader = document.getElementById('history-sticky-header');
          const headerHeight = stickyHeader ? stickyHeader.offsetHeight : 180;
          // Calculate the target Y with a padding offset to ensure date header is visible
          const targetY = targetGroup.offsetTop - headerHeight - 16;
          container.scrollTo({ top: Math.max(0, targetY), behavior: 'smooth' });
        });
      } else {
        requestAnimationFrame(() => {
          container.scrollTo({ top: 0, behavior: 'smooth' });
        });
      }
    },

    destroy() {
      // Cleanup window-level listeners
      const routerView = document.getElementById('router-view');
      if (routerView && routerView._historyReTapHandler) {
        window.removeEventListener('scroll-history-to-today', routerView._historyReTapHandler);
      }
    }
  },

  // -------------------------
  // ADD TRANSACTION VIEW (Phase 4)
  // -------------------------
  AddTransactionView: {
    render(state) {
      if (state.accounts.length === 0) {
        return `
          <div class="container" style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; text-align: center;">
            <div style="font-size: 3rem; margin-bottom: 16px;">🏦</div>
            <h2 style="margin-bottom: 8px;">${window.I18n.t('form.needAccountTitle')}</h2>
            <p class="text-secondary" style="margin-bottom: 24px;">${window.I18n.t('form.needAccountBody')}</p>
            <a href="#accounts" class="btn btn-primary" style="width: auto;">${window.I18n.t('form.goToAccounts')}</a>
          </div>
        `;
      }
      
      const params = window.Router ? window.Router.getParams() : {};
      const editId = params.id;
      const txToEdit = editId ? state.transactions.find(t => t.id === editId) : null;
      
      if (editId && !txToEdit) {
        return `<div class="container" style="padding-top: 40px; text-align: center;"><p>${window.I18n.t('form.txNotFound')}</p><a href="#transactions" class="btn btn-primary" style="display: inline-block; width: auto; padding: 8px 16px;">${window.I18n.t('common.goBack')}</a></div>`;
      }
      
      const isEdit = !!txToEdit;
      
      // Setup initial values
      let initialType = 'expense';
      let initialAmount = '';
      let initialDate = new Date().toISOString().split('T')[0];
      let initialTime = (window.Store && typeof window.Store._getSystemTimeString === 'function')
        ? window.Store._getSystemTimeString().substring(0, 5)
        : new Date().toTimeString().substring(0, 5);
      let initialNote = '';
      let initialTags = [];
      let initialAccount = '';
      let initialCategory = window._pendingCategorySelection || '';
      let initialToAccount = '';
      let initialIsRecurrent = false;
      // v0.82: paid by default — absence of isPaid means paid app-wide.
      let initialIsPaid = true;
      let initialRecurrenceEndDate = '';
      let initialRecurrenceInterval = '1';
      let initialRecurrenceFreq = 'months';
      let initialRecurrenceSeriesId = '';

      if (txToEdit) {
        initialAmount = Math.abs(txToEdit.amount);
        initialIsPaid = txToEdit.isPaid !== false;
        initialDate = txToEdit.date;
        initialTime = txToEdit.time ? txToEdit.time.substring(0, 5) : initialTime;
        initialNote = txToEdit.comment || txToEdit.note || '';
        initialTags = txToEdit.tags || [];
        initialAccount = txToEdit.accountId;
        if (!initialCategory) initialCategory = txToEdit.categoryId || '';
        
        if (txToEdit.transferRef) {
          initialType = 'transfer';
          // Find the counterpart to know the other account.
          // v0.70: transferRef is the SHARED pair key, not the counterpart's id
          // (see ADD_TRANSFER — both legs are stamped with the same generated
          // ref). Matching it against t.id never hit, so initialToAccount stayed
          // '' and the select fell back to the first account alphabetically —
          // saving then sent the wrong incomeAccountId to UPDATE_TRANSFER, or
          // tripped the "Cannot transfer to the same account" alert. Match the
          // way the store does (store.js UPDATE_TRANSACTION).
          const counterpart = state.transactions.find(t => t.transferRef === txToEdit.transferRef && t.id !== txToEdit.id);
          if (counterpart) {
            // "Expense" side of a transfer is the "From" account
            if (txToEdit.type === 'expense') {
              initialAccount = txToEdit.accountId;
              initialToAccount = counterpart.accountId;
            } else {
              // We tapped the "Income" side. Flip it so the form shows cleanly.
              initialAccount = counterpart.accountId;
              initialToAccount = txToEdit.accountId;
            }
          }
        } else {
          initialType = txToEdit.type === 'opening_balance' ? 'income' : txToEdit.type;
        }

        if (txToEdit.recurrence) {
          initialIsRecurrent = true;
          initialRecurrenceEndDate = txToEdit.recurrence.endDate || '';
          initialRecurrenceInterval = txToEdit.recurrence.interval || '1';
          initialRecurrenceFreq = txToEdit.recurrence.frequency || 'months';
          initialRecurrenceSeriesId = txToEdit.recurrence.seriesId || '';
        }
      }

      // Apply temporary draft form state if available (e.g. while adding a new category)
      if (window._draftTxFormState) {
        const draft = window._draftTxFormState;
        if (draft.type) initialType = draft.type;
        if (draft.amount !== undefined) initialAmount = draft.amount;
        if (draft.date) initialDate = draft.date;
        if (draft.time) initialTime = draft.time;
        if (draft.note !== undefined) initialNote = draft.note;
        if (draft.tags) initialTags = draft.tags;
        if (draft.account) initialAccount = draft.account;
        if (draft.transferTo) initialToAccount = draft.transferTo;
        if (draft.category) initialCategory = draft.category;
        if (draft.isRecurrent !== undefined) initialIsRecurrent = draft.isRecurrent;
        if (draft.isPaid !== undefined) initialIsPaid = draft.isPaid;
        if (draft.recurrenceEndDate !== undefined) initialRecurrenceEndDate = draft.recurrenceEndDate;
        if (draft.recurrenceInterval !== undefined) initialRecurrenceInterval = draft.recurrenceInterval;
        if (draft.recurrenceFreq !== undefined) initialRecurrenceFreq = draft.recurrenceFreq;
        if (draft.recurrenceSeriesId !== undefined) initialRecurrenceSeriesId = draft.recurrenceSeriesId;
        delete window._draftTxFormState;
      }

      if (window._pendingCategorySelection) {
        initialCategory = window._pendingCategorySelection;
        delete window._pendingCategorySelection;
      }

      const disableToggles = ''; // Allow switching even in edit mode now that save logic is improved
      
      return `
        <div class="container" style="padding-bottom: 100px;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-top: var(--space-4); margin-bottom: var(--space-6);">
            <h1 class="header-title" style="margin: 0;">${isEdit ? window.I18n.t('form.editLog') : window.I18n.t('form.newLog')}</h1>
            <a href="#${isEdit ? 'transactions' : 'dashboard'}" style="color: var(--text-secondary); width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; background: var(--bg-surface); border-radius: 10px;">✕</a>
          </div>
          
          <!-- Type Toggle -->
          <div style="display: flex; background: var(--bg-surface); border-radius: var(--radius-sm); padding: 4px; margin-bottom: var(--space-8); ${disableToggles}">
            <button id="toggle-expense" class="btn ${initialType === 'expense' ? 'btn-danger' : ''}" style="flex: 1; border-radius: var(--radius-sm); padding: 8px 4px; font-size: 13px; color: ${initialType === 'expense' ? '' : 'var(--text-secondary)'}; background: ${initialType === 'expense' ? '' : 'transparent'};">${window.I18n.t('form.expense')}</button>
            <button id="toggle-income" class="btn ${initialType === 'income' ? 'btn-income' : ''}" style="flex: 1; border-radius: var(--radius-sm); padding: 8px 4px; font-size: 13px; color: ${initialType === 'income' ? '' : 'var(--text-secondary)'}; background: ${initialType === 'income' ? '' : 'transparent'};">${window.I18n.t('form.income')}</button>
            <button id="toggle-transfer" class="btn ${initialType === 'transfer' ? 'btn-primary' : ''}" style="flex: 1; border-radius: var(--radius-sm); padding: 8px 4px; font-size: 13px; color: ${initialType === 'transfer' ? '' : 'var(--text-secondary)'}; background: ${initialType === 'transfer' ? '' : 'transparent'};">${window.I18n.t('common.transfer')}</button>
          </div>
          
          <input type="hidden" id="tx-type" value="${initialType}">
          ${isEdit ? `<input type="hidden" id="tx-edit-id" value="${editId}">` : ''}
          ${isEdit && initialType==='transfer' ? `<input type="hidden" id="tx-transfer-ref" value="${txToEdit.transferRef}">` : ''}
          
          <!-- Large Amount Input -->
          <div class="amount-input-group">
            <span id="currency-symbol" style="color: var(--text-tertiary); font-size: var(--text-2xl); font-family: var(--font-family-display);" aria-hidden="true">${window.Store.getCurrencySymbol()}</span>
            <label for="tx-amount" class="sr-only">${window.I18n.t('form.amount')}</label>
            <input type="number" id="tx-amount" class="amount-input ${initialType === 'expense' ? 'text-expense' : (initialType === 'income' ? 'text-income' : 'text-transfer')}" placeholder="0.00" step="0.01" inputmode="decimal" value="${initialAmount}" style="width: auto; max-width: 200px;">
          </div>
          
          <div class="card" style="margin-bottom: var(--space-6);">
            <div class="form-group" id="group-account">
              <label class="form-label" id="label-account" for="tx-account">${initialType === 'transfer' ? window.I18n.t('form.fromAccount') : window.I18n.t('common.account')}</label>
              <select id="tx-account" class="form-control" style="appearance: none;">
                ${createAccountOptions(state.accounts, initialAccount)}
              </select>
            </div>
            
            <div class="form-group" id="group-transfer-to" style="display: ${initialType === 'transfer' ? 'block' : 'none'};">
              <label class="form-label" for="tx-transfer-to">${window.I18n.t('form.toAccount')}</label>
              <select id="tx-transfer-to" class="form-control" style="appearance: none;">
                ${createAccountOptions(state.accounts, initialToAccount)}
              </select>
            </div>
            
            <div class="form-group" id="group-category" style="display: ${initialType === 'transfer' ? 'none' : 'block'};">
              <div class="form-label" style="display:flex; justify-content: space-between;">
                <label for="tx-category">${window.I18n.t('form.category')}</label>
                <button id="btn-add-category" class="btn-text" style="color: var(--color-accent); cursor: pointer; border: none; background: transparent; font-weight: 600; font-size: inherit; padding: 0;">${window.I18n.t('form.addCustom')}</button>
              </div>
              <select id="tx-category" class="form-control" style="appearance: none;" data-initial="${initialCategory}">
                <!-- Will be populated via JS based on type -->
              </select>
            </div>
            
            <div class="form-group">
              <label class="form-label" for="tx-date">${window.I18n.t('form.date')}</label>
              <input type="date" id="tx-date" class="form-control" value="${initialDate}">
            </div>
            ${state.enableTimeInput ? `
            <div class="form-group" id="group-time">
              <label class="form-label" for="tx-time">${window.I18n.t('form.time')}</label>
              <input type="time" id="tx-time" class="form-control" value="${initialTime}">
            </div>
            ` : ''}
            
            <div class="form-group" style="position: relative;">
              <label class="form-label" for="tx-tags-input">${window.I18n.t('form.tags')}</label>
              <div id="tx-tags-container" class="form-control" style="display: flex; flex-wrap: wrap; gap: 4px; padding: 4px 8px; min-height: 44px; align-items: center; border: 1px solid var(--color-border); border-radius: var(--radius-md); width: 100%; max-width: 100%; box-sizing: border-box;">
                ${initialTags.map(t => `<span class="tag-chip" data-tag="${t}" style="background: var(--bg-surface-sunken); padding: 4px 8px; border-radius: 12px; font-size: 13px; display: inline-flex; align-items: center; gap: 4px;">#${t} <button style="cursor: pointer; color: var(--text-tertiary); background: transparent; border: none; padding: 0 4px;" class="remove-tag" aria-label="${window.I18n.t('form.removeTag', { tag: t })}">x</button></span>`).join('')}
                <input type="text" id="tx-tags-input" placeholder="${window.I18n.t('form.addTagPlaceholder')}" autocomplete="off" style="border: none; background: transparent; outline: none; flex: 1; min-width: 100px; font-family: inherit; font-size: inherit; color: var(--text-primary);">
              </div>
              <div id="tx-tags-autocomplete" style="display: none; position: absolute; top: calc(100% + 4px); left: 0; right: 0; background: var(--bg-surface); border: 1px solid var(--color-border); border-radius: var(--radius-md); max-height: 150px; overflow-y: auto; z-index: 100; box-shadow: 0 4px 12px rgba(0,0,0,0.1);" role="listbox"></div>
            </div>

            <div class="form-group" style="margin-bottom: 0; position: relative;">
              <label class="form-label" for="tx-comment">${window.I18n.t('form.noteOptional')}</label>
              <input type="text" id="tx-comment" class="form-control" placeholder="${window.I18n.t('form.notePlaceholder')}" value="${escapeAttr(initialNote)}" autocomplete="off">
              <div id="tx-comment-autocomplete" style="display: none; position: absolute; top: calc(100% + 4px); left: 0; right: 0; background: var(--bg-surface); border: 1px solid var(--color-border); border-radius: var(--radius-md); max-height: 150px; overflow-y: auto; z-index: 100; box-shadow: 0 4px 12px rgba(0,0,0,0.1);" role="listbox"></div>
            </div>

            <div class="card card-elevated" style="padding: var(--space-3); margin-top: var(--space-4); display: flex; flex-direction: column; gap: 12px; background: transparent; border: 1px solid var(--color-border); box-shadow: none;" id="group-paid">
              <div style="display: flex; align-items: center; justify-content: space-between; width: 100%;">
                <div style="flex: 1;">
                  <strong style="display: block; font-family: var(--font-family-body); font-size: 1rem; color: var(--text-primary); margin-bottom: 2px;">${window.I18n.t('form.paid')}</strong>
                  <span id="tx-paid-text" style="font-size: var(--text-sm); color: var(--text-secondary);">${initialIsPaid ? window.I18n.t('form.paidOn') : window.I18n.t('form.paidOff')}</span>
                </div>
                <label class="toggle-switch">
                  <input type="checkbox" id="tx-is-paid" ${initialIsPaid ? 'checked' : ''}>
                  <span class="slider"></span>
                </label>
              </div>
            </div>

            <div class="card card-elevated" style="padding: var(--space-3); margin-top: var(--space-4); display: flex; flex-direction: column; gap: 12px; background: transparent; border: 1px solid var(--color-border); box-shadow: none;" id="group-recurring">
              <div style="display: flex; align-items: center; justify-content: space-between; width: 100%;">
                <div style="flex: 1;">
                  <strong style="display: block; font-family: var(--font-family-body); font-size: 1rem; color: var(--text-primary); margin-bottom: 2px;">${window.I18n.t('form.recurrent')}</strong>
                  <span id="tx-recurrent-text" style="font-size: var(--text-sm); color: var(--text-secondary); cursor: pointer;">${window.I18n.t('form.recurrentDisabled')}</span>
                </div>
                <label class="toggle-switch">
                  <input type="checkbox" id="tx-is-recurrent" ${initialIsRecurrent ? 'checked' : ''}>
                  <span class="slider"></span>
                </label>
              </div>
              <div id="tx-recurrence-end-group" style="display: none; border-top: 1px solid var(--color-border); padding-top: 12px; margin-top: 4px;">
                <label class="form-label" style="font-size: 0.9rem; color: var(--text-secondary); margin-bottom: 6px;">${window.I18n.t('form.endDate')}</label>
                <input type="date" id="tx-recurrence-end-date" class="form-control" value="${initialRecurrenceEndDate}">
              </div>
              <input type="hidden" id="tx-recurrence-interval" value="${initialRecurrenceInterval}">
              <input type="hidden" id="tx-recurrence-freq" value="${initialRecurrenceFreq}">
              <input type="hidden" id="tx-recurrence-series-id" value="${initialRecurrenceSeriesId}">
            </div>
          </div>
          
          <button id="btn-save-tx" class="btn btn-primary" style="width: 100%; padding: var(--space-4); font-size: 1.1rem; border-radius: var(--radius-lg); margin-bottom: 8px;">${isEdit ? window.I18n.t('form.updateTx') : window.I18n.t('form.saveTx')}</button>

          ${isEdit ? `
            <button id="btn-delete-tx" class="btn" style="width: 100%; padding: var(--space-4); color: var(--color-expense); background: var(--color-expense-bg); border-radius: var(--radius-lg); font-weight: 600;">${window.I18n.t('form.deleteTx')}</button>
          ` : ''}
        </div>
      `;
    },
    attachEvents(container, state) {
      window.StackdHydrateIcons();
      if (state.accounts.length === 0) return;
      // v0.67: render() may emit the "Transaction not found" screen (e.g. the
      // edited tx was just deleted, which re-renders this view before the
      // delete flow navigates away). That markup has no form: bail out instead
      // of crashing on null elements — the crash aborted dispatch mid-flight
      // and stranded the user on the dead edit screen.
      if (!document.getElementById('tx-type')) return;

      const btnExpense = document.getElementById('toggle-expense');
      const btnIncome = document.getElementById('toggle-income');
      const btnTransfer = document.getElementById('toggle-transfer');
      const typeInput = document.getElementById('tx-type');
      const amountInput = document.getElementById('tx-amount');
      const categorySelect = document.getElementById('tx-category');
      const groupCategory = document.getElementById('group-category');
      const groupTransferTo = document.getElementById('group-transfer-to');
      const labelAccount = document.getElementById('label-account');
      // v0.82: live subtitle for the Paid toggle
      const paidToggleEl = document.getElementById('tx-is-paid');
      if (paidToggleEl) {
        paidToggleEl.addEventListener('change', () => {
          const txt = document.getElementById('tx-paid-text');
          if (txt) txt.textContent = paidToggleEl.checked ? window.I18n.t('form.paidOn') : window.I18n.t('form.paidOff');
        });
      }

      const btnSave = document.getElementById('btn-save-tx');
      const btnDelete = document.getElementById('btn-delete-tx');
      const btnAddCategory = document.getElementById('btn-add-category');
      
      // Update categories based on Type
      const updateCategories = () => {
        const type = typeInput.value;
        const latestCategories = window.Store.getState().categories;
        const filteredCategories = latestCategories.filter(c => c.typeHint === type || c.typeHint === 'both');
        // Retrieve initial selection constraint
        const initialSelected = categorySelect.getAttribute('data-initial') || categorySelect.value;
        categorySelect.innerHTML = createCategoryOptions(filteredCategories, initialSelected, true);
        if (initialSelected) categorySelect.value = initialSelected;
      };
      
      // Update UI visibility based on Type
      const updateUIVisibility = () => {
        const type = typeInput.value;
        
        // Reset styles for all buttons
        [btnExpense, btnIncome, btnTransfer].forEach(btn => {
          btn.className = 'btn';
          btn.style.color = 'var(--text-secondary)';
          btn.style.background = 'transparent';
        });
        
        // Apply active style
        if (type === 'expense') {
          btnExpense.className = 'btn btn-danger';
          btnExpense.style.color = ''; 
          btnExpense.style.background = '';
          amountInput.className = 'amount-input text-expense';
          groupCategory.style.display = 'block';
          groupTransferTo.style.display = 'none';
          labelAccount.textContent = window.I18n.t('common.account');
        } else if (type === 'income') {
          btnIncome.className = 'btn btn-income';
          btnIncome.style.color = '';
          btnIncome.style.background = '';
          amountInput.className = 'amount-input text-income';
          groupCategory.style.display = 'block';
          groupTransferTo.style.display = 'none';
          labelAccount.textContent = window.I18n.t('common.account');
        } else if (type === 'transfer') {
          btnTransfer.className = 'btn btn-primary';
          btnTransfer.style.color = '';
          btnTransfer.style.background = '';
          amountInput.className = 'amount-input text-transfer';
          groupCategory.style.display = 'none';
          groupTransferTo.style.display = 'block';
          labelAccount.textContent = window.I18n.t('form.fromAccount');
        }
        
        updateCategories();
      };
      
      // Initial populate
      updateUIVisibility();
      
      // Focus amount on load if not edit
      if (!document.getElementById('tx-edit-id')) {
        setTimeout(() => amountInput.focus(), 100);
      }
      
      // Recurrent Logic Display Setup
      const toggleRecurrent = document.getElementById('tx-is-recurrent');
      const recurrentText = document.getElementById('tx-recurrent-text');
      const intervalInput = document.getElementById('tx-recurrence-interval');
      const freqInput = document.getElementById('tx-recurrence-freq');
      const btnBalance = document.getElementById('toggle-balance');
      
      const updateRecurrentText = () => {
        const endGroup = document.getElementById('tx-recurrence-end-group');
        const endDateInput = document.getElementById('tx-recurrence-end-date');
        
        if (toggleRecurrent && toggleRecurrent.checked) {
          const vInt = intervalInput.value;
          const vFreq = freqInput.value;
          // Whole-sentence key per frequency: word order and gender agreement
          // differ per language ("toutes les 2 semaines" vs "tous les 2 mois").
          recurrentText.textContent = window.I18n.t('form.repeatsEvery.' + vFreq, { count: parseInt(vInt) || 1 });
          recurrentText.style.color = 'var(--text-primary)';
          recurrentText.style.fontWeight = '600';
          recurrentText.style.background = 'var(--bg-surface-sunken)';
          recurrentText.style.padding = '4px 8px';
          recurrentText.style.borderRadius = 'var(--radius-sm)';
          if (endGroup) endGroup.style.display = 'block';
          
          if (!endDateInput.value) {
            const dateInput = document.getElementById('tx-date');
            if (dateInput && dateInput.value) {
               const d = new Date(dateInput.value);
               d.setFullYear(d.getFullYear() + 5);
               endDateInput.value = d.toISOString().split('T')[0];
            }
          }
        } else if (recurrentText) {
          recurrentText.textContent = window.I18n.t('form.recurrentDisabled');
          recurrentText.style.color = 'var(--text-secondary)';
          recurrentText.style.fontWeight = 'normal';
          recurrentText.style.background = 'transparent';
          recurrentText.style.padding = '0';
          if (endGroup) endGroup.style.display = 'none';
        }
      };

      if (toggleRecurrent) {
        toggleRecurrent.addEventListener('change', updateRecurrentText);
        recurrentText.addEventListener('click', () => {
          if (!toggleRecurrent.checked) return;
          window.Components.FrequencyPicker.show({
            initialInterval: parseInt(intervalInput.value),
            initialFreq: freqInput.value,
            onSelect: (val) => {
              intervalInput.value = val.interval;
              freqInput.value = val.frequency;
              updateRecurrentText();
            }
          });
        });
        updateRecurrentText();
      }

      // Type Toggle handlers
      btnExpense.addEventListener('click', () => { typeInput.value = 'expense'; updateUIVisibility(); });
      btnIncome.addEventListener('click', () => { typeInput.value = 'income'; updateUIVisibility(); });
      btnTransfer.addEventListener('click', () => { typeInput.value = 'transfer'; updateUIVisibility(); });
      

      // Category Creation Modal logic (reusable)
      let previousCategory = categorySelect.value;
      const showNewCategoryModal = (onCreatedCallback) => {
        captureDraftTxFormState(container);
        let selectedIcon = 'pin';
        window.Components.Modal.show({
          title: window.I18n.t('form.newCategory'),
          content: `
            <div class="form-group">
              <label class="form-label">${window.I18n.t('form.categoryName')}</label>
              <input type="text" id="new-cat-name" class="form-control" placeholder="${window.I18n.t('form.categoryNamePlaceholder')}">
            </div>
            <div class="form-group">
              <label class="form-label">${window.I18n.t('form.icon')}</label>
              <div id="new-cat-icon-selector" class="touch-target" style="cursor: pointer; display: flex; align-items: center; justify-content: space-between; padding: 12px; background: var(--bg-surface-sunken); border-radius: var(--radius-md); border: 1px solid var(--border-color);">
                <span id="selected-icon-display" style="color: var(--color-primary); display: flex; align-items: center; justify-content: center;"><i data-lucide="${selectedIcon}"></i></span>
                <span style="color: var(--text-tertiary); font-size: 0.8rem;">${window.I18n.t('form.changeIcon')}</span>
              </div>
            </div>
          `,
          saveText: window.I18n.t('form.createCategory'),
          onSave: (closeModal) => {
            const name = document.getElementById('new-cat-name').value.trim();
            if (name) {
              const newId = window.StackdDB.generateId();
              window._pendingCategorySelection = newId;
              const newCat = { 
                id: newId,
                name, 
                icon: selectedIcon, 
                typeHint: typeInput.value 
              };
              window.Store.dispatch('ADD_CATEGORY', newCat);

              updateCategories();
              categorySelect.value = newId;
              categorySelect.setAttribute('data-initial', newId);
              previousCategory = newId;

              closeModal();

              if (typeof onCreatedCallback === 'function') {
                onCreatedCallback(newCat);
              }
            }
          },
          onClose: () => {
            if (categorySelect.value === 'CREATE_NEW_CATEGORY') {
              categorySelect.value = previousCategory;
            }
          }
        });

        // Attach picker listener
        const iconSelector = document.getElementById('new-cat-icon-selector');
        if (iconSelector) {
          window.StackdHydrateIcons();
          iconSelector.addEventListener('click', () => {
            window.Components.IconPicker.show({
              initialIcon: selectedIcon,
              onSelect: (icon) => {
                selectedIcon = icon;
                const display = document.getElementById('selected-icon-display');
                if (display) {
                  display.innerHTML = `<i data-lucide="${icon}"></i>`;
                  window.StackdHydrateIcons();
                }
              }
            });
          });
        }

        setTimeout(() => {
          const catNameInput = document.getElementById('new-cat-name');
          if (catNameInput) catNameInput.focus();
        }, 100);
      };

      // Category Selection Modal trigger
      const openCategoryModal = () => {
        captureDraftTxFormState(container);
        const currentVal = categorySelect.value;
        const typeHint = typeInput.value;
        window.Components.CategorySelectionModal.show({
          selectedCategoryId: currentVal,
          typeHint: typeHint,
          onSelect: (cat) => {
            const catId = cat ? (cat.id !== undefined ? cat.id : cat) : '';
            categorySelect.value = catId;
            categorySelect.setAttribute('data-initial', catId);
            previousCategory = catId;
            // v0.71: picking an existing category dispatches nothing, so no
            // re-render consumes the draft captured above. Left behind, it
            // would repopulate the NEXT #add visit — including a live
            // recurrence seriesId, which would splice an unrelated transaction
            // into that series. Only the create-category path needs the draft.
            delete window._draftTxFormState;
          },
          onAddNewCategory: (onCreated) => {
            showNewCategoryModal(onCreated);
          }
        });
      };

      categorySelect.addEventListener('mousedown', (e) => {
        e.preventDefault();
        categorySelect.blur();
        openCategoryModal();
      });
      categorySelect.addEventListener('click', (e) => {
        e.preventDefault();
        categorySelect.blur();
        openCategoryModal();
      });
      categorySelect.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          openCategoryModal();
        }
      });

      // Add custom category button
      btnAddCategory.addEventListener('click', () => showNewCategoryModal());
      
      // Tagging Logic
      let currentTags = Array.from(container.querySelectorAll('.tag-chip')).map(el => el.dataset.tag);
      const tagsInput = document.getElementById('tx-tags-input');
      const tagsContainer = document.getElementById('tx-tags-container');
      const autocompleteBox = document.getElementById('tx-tags-autocomplete');

      const renderTags = () => {
        const chipsHtml = currentTags.map(t => `<span class="tag-chip" data-tag="${t}" style="background: var(--bg-surface-sunken); padding: 4px 8px; border-radius: 12px; font-size: 13px; display: inline-flex; align-items: center; gap: 4px;">#${t} <span style="cursor: pointer; color: var(--text-tertiary);" class="remove-tag">x</span></span>`).join('');
        container.querySelectorAll('.tag-chip').forEach(el => el.remove());
        tagsInput.insertAdjacentHTML('beforebegin', chipsHtml);
        
        container.querySelectorAll('.remove-tag').forEach(btn => {
           btn.addEventListener('click', (e) => {
              const tag = e.target.closest('.tag-chip').dataset.tag;
              currentTags = currentTags.filter(t => t !== tag);
              renderTags();
           });
        });
      };
      renderTags();

      const addTag = (val) => {
         const t = val.trim().toLowerCase().replace(/[^a-z0-9\-_]/g, '');
         if (t && !currentTags.includes(t)) {
            currentTags.push(t);
            renderTags();
         }
         tagsInput.value = '';
         autocompleteBox.style.display = 'none';
      };

      tagsContainer.addEventListener('click', () => tagsInput.focus());

      tagsInput.addEventListener('keydown', (e) => {
         if (e.key === 'Enter' || e.key === ',' || e.key === ' ') {
            e.preventDefault();
            addTag(tagsInput.value);
         } else if (e.key === 'Backspace' && tagsInput.value === '' && currentTags.length > 0) {
            currentTags.pop();
            renderTags();
         }
      });

      let debounceTimer = null;
      tagsInput.addEventListener('input', (e) => {
         const val = e.target.value.trim().toLowerCase();
         clearTimeout(debounceTimer);
         
         if (!val) {
            autocompleteBox.style.display = 'none';
            return;
         }

         debounceTimer = setTimeout(() => {
            const matches = window.Store.getAllUniqueTags(val).filter(t => !currentTags.includes(t));
            if (matches.length > 0) {
               autocompleteBox.innerHTML = matches.map(t => `<div class="tag-suggestion touch-target" data-tag="${t}" style="padding: 8px 12px; cursor: pointer; border-bottom: 1px solid var(--border-color);">#${t}</div>`).join('');
               autocompleteBox.style.display = 'block';
               
               container.querySelectorAll('.tag-suggestion').forEach(item => {
                  item.addEventListener('click', () => {
                     addTag(item.dataset.tag);
                  });
               });
            } else {
               autocompleteBox.style.display = 'none';
            }
         }, 300);
      });

      document.addEventListener('click', (e) => {
         if (!tagsContainer.contains(e.target) && !autocompleteBox.contains(e.target)) {
            autocompleteBox.style.display = 'none';
         }
      });

      // Note Autocomplete Logic
      const noteInput = document.getElementById('tx-comment');
      const noteAutocomplete = document.getElementById('tx-comment-autocomplete');
      let noteDebounceTimer = null;

      noteInput.addEventListener('input', (e) => {
         const val = e.target.value.trim();
         clearTimeout(noteDebounceTimer);
         
         if (!val) {
            noteAutocomplete.style.display = 'none';
            return;
         }

         noteDebounceTimer = setTimeout(() => {
            const matches = window.Store.getAllUniqueNotes(val);
            if (matches.length > 0) {
               noteAutocomplete.innerHTML = matches.map(n => `<div class="note-suggestion touch-target" data-note="${n}" style="padding: 12px; cursor: pointer; border-bottom: 1px solid var(--border-color); font-size: 14px;">${n}</div>`).join('');
               noteAutocomplete.style.display = 'block';
               
               container.querySelectorAll('.note-suggestion').forEach(item => {
                  item.addEventListener('click', () => {
                     noteInput.value = item.dataset.note;
                     noteAutocomplete.style.display = 'none';
                  });
               });
            } else {
               noteAutocomplete.style.display = 'none';
            }
         }, 300);
      });

      // Handle Enter for first suggestion
      noteInput.addEventListener('keydown', (e) => {
         if (e.key === 'Enter' && noteAutocomplete.style.display === 'block') {
            const firstSuggestion = noteAutocomplete.querySelector('.note-suggestion');
            if (firstSuggestion) {
               e.preventDefault();
               noteInput.value = firstSuggestion.dataset.note;
               noteAutocomplete.style.display = 'none';
            }
         }
      });

      document.addEventListener('click', (e) => {
         if (!noteInput.contains(e.target) && !noteAutocomplete.contains(e.target)) {
            noteAutocomplete.style.display = 'none';
         }
      });

      // Save Transaction
      btnSave.addEventListener('click', () => {
        // Auto-add any pending tag text before saving
        if (tagsInput && tagsInput.value.trim()) {
           addTag(tagsInput.value);
        }

        const type = typeInput.value;
        const amount = parseFloat(amountInput.value);
        if (isNaN(amount) || amount <= 0) {
          amountInput.style.backgroundColor = 'var(--color-expense-bg)';
          setTimeout(() => amountInput.style.backgroundColor = 'transparent', 1000);
          return;
        }

        const accountId = document.getElementById('tx-account').value;
        const toAccountId = document.getElementById('tx-transfer-to').value;
        const categoryId = categorySelect.value;
        const date = document.getElementById('tx-date').value;
        const timeEl = document.getElementById('tx-time');
        const customTime = (timeEl && timeEl.value) ? (timeEl.value.length === 5 ? timeEl.value + ':00' : timeEl.value) : undefined;
        const comment = document.getElementById('tx-comment').value;
        const editIdInput = document.getElementById('tx-edit-id');
        const isEditSave = !!editIdInput;
        const targetId = isEditSave ? editIdInput.value : null;
        
        // Build recurrence data from DOM
        let recurrenceData = null;
        const toggleRec = document.getElementById('tx-is-recurrent');
        if (toggleRec && toggleRec.checked && type !== 'balance') {
          const sId = document.getElementById('tx-recurrence-series-id').value;
          const eDate = document.getElementById('tx-recurrence-end-date').value;
          const intervalVal = parseInt(document.getElementById('tx-recurrence-interval').value) || 1;
          const freqVal = document.getElementById('tx-recurrence-freq').value || 'months';
          recurrenceData = {
            seriesId: sId || window.StackdDB.generateId(),
            interval: intervalVal,
            frequency: freqVal,
            endDate: eDate || (() => {
               const d = new Date(date);
               d.setFullYear(d.getFullYear() + 5);
               return d.toISOString().split('T')[0];
            })(),
            nextDate: (window.Store && typeof window.Store._calculateNextRecurrenceDate === 'function') ? window.Store._calculateNextRecurrenceDate(date, intervalVal, freqVal) : undefined
          };
        }

        // v0.67: validate the recurrence window before anything dispatches
        if (recurrenceData && recurrenceData.endDate && recurrenceData.endDate < date) {
          alert(window.I18n.t('form.recurrenceEndBeforeDate'));
          return;
        }

        // --- v0.67: Recurring Edit Scope Gate (supersedes the v0.32 tag-only gate) ---
        // ANY save on a transaction that belongs to a recurrent series asks how
        // far the change should apply, mirroring the delete flow. Previously
        // only tag changes prompted (and the modal wiring was broken), so date
        // or amount edits silently re-armed the series and spawned duplicates.
        const txToEditCurrent = isEditSave
          ? window.Store.getState().transactions.find(t => t.id === targetId)
          : null;
        const seriesId = (txToEditCurrent && txToEditCurrent.recurrence) ? txToEditCurrent.recurrence.seriesId : null;
        const dateChanged = !!(txToEditCurrent && date !== txToEditCurrent.date);
        const recurrenceRemoved = !!(seriesId && !recurrenceData);

        // v0.82: Paid toggle. Lean payload semantics — absence of isPaid on a
        // record means paid, so: unchecked → false; checked → true only when
        // flipping a currently-unpaid record back (UPDATE's merge deletes
        // undefined-valued keys, leaving untouched records untouched);
        // otherwise omitted. Transfer legs share one paid state, so checking
        // the tapped leg is enough.
        const paidToggle = document.getElementById('tx-is-paid');
        const paidChecked = paidToggle ? paidToggle.checked : true;
        const wasUnpaid = !!(txToEditCurrent && txToEditCurrent.isPaid === false);
        const isPaidPayload = paidChecked ? (wasUnpaid ? true : undefined) : false;

        // Build the actual dispatch logic as a callable function
        const doDispatch = (scope) => {
          // scope: 'only' | 'future' | 'all'
          if (type === 'transfer') {
            if (accountId === toAccountId) {
              alert(window.I18n.t('form.sameAccountTransfer'));
              return;
            }

            if (isEditSave) {
              const transferRefEl = document.getElementById('tx-transfer-ref');
              const transferRef = transferRefEl ? transferRefEl.value : null;
              if (transferRef) {
                window.Store.dispatch('UPDATE_TRANSFER', {
                  transferRef,
                  amount,
                  expenseAccountId: accountId,
                  incomeAccountId: toAccountId,
                  date,
                  time: customTime,
                  note: comment,
                  recurrence: recurrenceData,
                  tags: currentTags,
                  isPaid: isPaidPayload,
                  updateFuture: scope === 'future',
                  updateAll: scope === 'all'
                });
              } else {
                // Converting a regular tx into a transfer. v0.67: the chosen
                // scope decides how much of the old series the transfer
                // replaces, and the new transfer starts its OWN series —
                // reusing the old seriesId mixed transfer pairs into the
                // original expense/income chain. Past members are NEVER
                // deleted (the scope modal promises past history is safe), so
                // 'all' behaves like 'future' here.
                if (seriesId && (scope === 'future' || scope === 'all')) {
                  window.Store.dispatch('DELETE_TRANSACTION', { id: targetId, deleteFuture: true });
                } else {
                  window.Store.dispatch('DELETE_TRANSACTION', { id: targetId });
                }
                let transferRecurrence = null;
                if (recurrenceData) {
                  if (!seriesId) {
                    // Standalone tx converted to transfer: honor the recurrence
                    // exactly as configured (no scope modal was shown)
                    transferRecurrence = recurrenceData;
                  } else if (scope !== 'only') {
                    transferRecurrence = { ...recurrenceData, seriesId: window.StackdDB.generateId() };
                  }
                }
                window.Store.dispatch('ADD_TRANSFER', {
                  amount,
                  expenseAccountId: accountId,
                  incomeAccountId: toAccountId,
                  date,
                  time: customTime,
                  note: comment,
                  recurrence: transferRecurrence,
                  tags: currentTags,
                  ...(isPaidPayload !== undefined ? { isPaid: isPaidPayload } : {})
                });
              }
            } else {
              window.Store.dispatch('ADD_TRANSFER', {
                amount,
                expenseAccountId: accountId,
                incomeAccountId: toAccountId,
                date,
                time: customTime,
                note: comment,
                recurrence: recurrenceData,
                tags: currentTags,
                ...(isPaidPayload !== undefined ? { isPaid: isPaidPayload } : {})
              });
            }
          } else if (isEditSave) {
            // v0.69: the user opened a transfer and switched the toggle to
            // Expense/Income. The store has to unlink this leg and delete the
            // counterpart — otherwise the other account keeps a phantom leg.
            const convertFromTransfer = !!(txToEditCurrent && txToEditCurrent.transferRef);
            window.Store.dispatch('UPDATE_TRANSACTION', {
              id: targetId,
              type: type,
              convertFromTransfer,
              amount: amount,
              accountId: accountId,
              categoryId: categoryId,
              date: date,
              time: customTime,
              comment: comment,
              recurrence: recurrenceData,
              tags: currentTags,
              // undefined = leave the record's paid state alone (v0.67 merge)
              isPaid: isPaidPayload,
              updateFuture: scope === 'future',
              updateAll: scope === 'all'
            });
          } else {
            window.Store.dispatch('ADD_TRANSACTION', {
              type: type,
              amount: amount,
              accountId: accountId,
              categoryId: categoryId,
              date: date,
              time: customTime,
              comment: comment,
              recurrence: recurrenceData,
              tags: currentTags,
              ...(isPaidPayload !== undefined ? { isPaid: isPaidPayload } : {})
            });
          }

          window.Router.navigate('#transactions');
        };

        // If creation of a new recurring tx with tags:
        if (!isEditSave && currentTags.length > 0 && toggleRec && toggleRec.checked) {
          window.Components.RecurringCreationModal.show({
            onlyThis: () => {
              if (recurrenceData) recurrenceData.propagateTags = false;
              doDispatch('only');
            },
            allTransactions: () => {
              if (recurrenceData) recurrenceData.propagateTags = true;
              doDispatch('only');
            }
          });
        }
        // Editing a member of a recurrent series: always ask for the scope
        else if (isEditSave && seriesId) {
          window.Components.RecurringUpdateModal.show({
            dateChanged,
            recurrenceRemoved,
            onSelection: (chosen) => doDispatch(chosen === 'single' ? 'only' : chosen)
          });
        } else {
          // Not part of a series — dispatch immediately
          doDispatch('only');
        }
      });


      if (btnDelete) {
        btnDelete.addEventListener('click', () => {
          const editIdInput = document.getElementById('tx-edit-id');
          const targetId = editIdInput ? editIdInput.value : null;
          if (!targetId) return;

          const currentTx = window.Store.getState().transactions.find(t => t.id === targetId);
          const seriesId = (currentTx && currentTx.recurrence) ? currentTx.recurrence.seriesId : null;

          const executeDelete = (options) => {
            window.Store.dispatch('DELETE_TRANSACTION', { id: targetId, ...options });
            window.Router.navigate('#transactions');
          };

          if (seriesId) {
            window.Components.RecurringDeleteModal.show({
              onlyThis:        () => executeDelete({}),
              thisAndFuture:   () => executeDelete({ deleteFuture: true }),
              allTransactions: () => executeDelete({ deleteAll: true })
            });
          } else {
            window.Components.Modal.show({
              title: window.I18n.t('history.bulkDelete.title', { count: 1 }),
              content: `<p>${window.I18n.t('form.deleteConfirmBody')}</p>`,
              saveText: window.I18n.t('form.keep'),
              showDelete: true,
              onSave: (closeModal) => closeModal(),
              onDelete: (closeModal) => {
                executeDelete({});
                closeModal();
              }
            });
          }
        });
      }
    },

    destroy() {
      // v0.71: the draft only exists to survive an in-place re-render (the
      // add-custom-category round trip). Leaving the form for another view
      // means it was abandoned — drop it so it can't repopulate a later visit
      // with stale values, including a live recurrence seriesId.
      delete window._draftTxFormState;
    }
  }
};// Extend Views with v0.3 screens
Object.assign(window.Views, {

  // -------------------------
  // CATEGORIES VIEW (v0.31 updated)
  // -------------------------
  CategoriesView: {
    render(state) {
      const renderGroup = (title, cats) => {
        if (!cats.length) return '';
        return `
          <div style="margin-bottom: var(--space-6);">
            <div class="section-title">${title}</div>
            <div class="list-group">
              ${cats.map(cat => {
                const txCount = state.transactions.filter(t => t.categoryId === cat.id).length;
                return `
                  <div class="list-item" style="padding: 0; overflow: hidden; display: flex; align-items: stretch;">
                    <div class="category-main-link touch-target" data-id="${cat.id}" style="display: flex; align-items: center; gap: var(--space-3); padding: var(--space-4); flex-grow: 1; cursor: pointer;">
                      <div class="list-item-icon"><i data-lucide="${cat.icon}"></i></div>
                      <div style="flex-grow: 1;">
                        <div class="list-item-title" style="margin-bottom: 2px;">${cat.name}</div>
                        <div class="list-item-subtitle">${window.I18n.t('cat.txCount', { count: txCount })}</div>
                      </div>
                      <div style="color: var(--text-tertiary); font-size: var(--text-sm);">›</div>
                    </div>
                    <button class="btn-edit-category" data-id="${cat.id}" style="background: transparent; border: none; padding: 0 var(--space-5); color: var(--text-tertiary); font-size: 1.4rem; cursor: pointer; display: flex; align-items: center; justify-content: center; border-left: 1px solid var(--border-color); margin: 8px 0;" aria-label="${window.I18n.t('cat.editSettingsAria')}">
                      ⋮
                    </button>
                  </div>`;
              }).join('')}
            </div>
          </div>`;
      };

      const income = state.categories.filter(c => c.typeHint === 'income').sort((a, b) => window.Store.compareAlpha(a, b));
      const expense = state.categories.filter(c => c.typeHint === 'expense').sort((a, b) => window.Store.compareAlpha(a, b));
      const both = state.categories.filter(c => c.typeHint === 'both').sort((a, b) => window.Store.compareAlpha(a, b));

      return `
        <div class="container" style="padding-bottom: 100px;">
          <div class="page-header">
            <h1 class="page-header-title">${window.I18n.t('others.categories')}</h1>
            <button class="btn btn-primary" id="btn-create-category" aria-label="${window.I18n.t('cat.newAria')}"
              style="width: 36px; height: 36px; min-width: 36px; padding: 0; border-radius: 14px; font-size: 1.4rem; line-height: 1; flex-shrink: 0; display: flex; align-items: center; justify-content: center;">+</button>
          </div>
          ${renderGroup(window.I18n.t('form.income'), income)}
          ${renderGroup(window.I18n.t('form.expense'), expense)}
          ${renderGroup(window.I18n.t('cat.allTypes'), both)}
          ${state.categories.length === 0 ? `<p class="text-secondary" style="text-align: center; padding: 40px 0;">${window.I18n.t('cat.empty')}</p>` : ''}
        </div>`;
    },

    attachEvents(container, state) {
      window.StackdHydrateIcons();
      container.querySelectorAll('.category-main-link').forEach(link => {
        link.addEventListener('click', () => {
          window.Router.navigate('#category-detail?id=' + link.dataset.id);
        });
      });

      container.querySelectorAll('.btn-edit-category').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          window.Router.navigate('#edit-category?id=' + btn.dataset.id);
        });
      });

      const createCatBtn = document.getElementById('btn-create-category');
      if (createCatBtn) {
        createCatBtn.addEventListener('click', () => {
          window.Router.navigate('#edit-category');
        });
      }
    }
  },

  // -------------------------
  // CATEGORY DETAIL VIEW
  // -------------------------
  CategoryDetailView: {
    render(state) {
      const params = window.Router ? window.Router.getParams() : {};
      const catId = params.id;
      const category = state.categories.find(c => c.id === catId);

      if (!category) {
        return `
          <div class="container" style="padding-top: 40px; text-align: center;">
            <p class="text-secondary">${window.I18n.t('cat.notFound')}</p>
            <a href="#categories" class="btn btn-primary" style="display: inline-block; width: auto; padding: 8px 16px; margin-top: 16px;">${window.I18n.t('common.goBack')}</a>
          </div>
        `;
      }

      const txs = state.transactions.filter(tx => tx.categoryId === catId);

      let listHtml = '<div class="list-group">';
      if (txs.length === 0) {
        listHtml += `
          <div style="text-align: center; padding: 40px 20px;">
            <p class="text-secondary">${window.I18n.t('cat.noTx')}</p>
          </div>
        `;
      } else {
        txs.forEach(tx => {
          const account = state.accounts.find(a => a.id === tx.accountId);
          listHtml += window.Components.TransactionItem.render(tx, category, account, '');
        });
      }
      listHtml += '</div>';

      return `
        <div class="container" style="padding-bottom: 100px;">
          <a href="#categories" class="touch-target" style="display: inline-flex; align-items: center; gap: 4px; color: var(--text-secondary); text-decoration: none; font-size: var(--text-sm); margin-bottom: var(--space-2); margin-top: var(--space-2);" aria-label="${window.I18n.t('cat.backAria')}"><i data-lucide="chevron-left" style="width: 16px; height: 16px;"></i> ${window.I18n.t('others.categories')}</a>
          
          <div style="margin-bottom: var(--space-6);">
            <div style="display: flex; align-items: center; gap: var(--space-3);">
              <div class="list-item-icon" style="color: var(--color-primary);"><i data-lucide="${category.icon}"></i></div>
              <h1 class="header-title" style="margin: 0;">${category.name}</h1>
            </div>
            <div style="color: var(--text-secondary); font-size: var(--text-sm); margin-top: var(--space-1); margin-left: 60px;">
              ${window.I18n.t('cat.txCount', { count: txs.length })}
            </div>
          </div>
          
          ${listHtml}
        </div>
      `;
    },
    attachEvents(container, state) {
      window.StackdHydrateIcons();
      container.querySelectorAll('.list-item[data-id]').forEach(item => {
        item.addEventListener('click', () => {
          const txId = item.dataset.id;
          if (txId) {
            window.Router.navigate('#edit?id=' + txId);
          }
        });
      });
    }
  },

  // -------------------------
  // EDIT CATEGORY VIEW
  // -------------------------
  EditCategoryView: {
    render(state) {
      const params = window.Router ? window.Router.getParams() : {};
      const catId = params.id;
      const isEdit = !!catId;
      const cat = isEdit ? state.categories.find(c => c.id === catId) : null;
      
      const title = isEdit ? window.I18n.t('cat.editTitle') : window.I18n.t('form.newCategory');
      const name = cat ? cat.name : '';
      const icon = cat ? cat.icon : 'pin';
      const type = cat ? cat.typeHint : 'expense';
      const txCount = isEdit ? state.transactions.filter(t => t.categoryId === catId).length : 0;

      return `
        <div class="container" style="padding-bottom: 100px;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-top: var(--space-4); margin-bottom: var(--space-6);">
            <h1 class="header-title" style="margin: 0;">${title}</h1>
            <a href="#categories" style="color: var(--text-secondary); width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; background: var(--bg-surface); border-radius: 10px;"><i data-lucide="x" style="width: 18px; height: 18px;"></i></a>
          </div>

          <div class="card" style="margin-bottom: var(--space-6);">
            <div class="form-group">
              <label class="form-label" for="edit-cat-name">${window.I18n.t('form.categoryName')}</label>
              <input type="text" id="edit-cat-name" class="form-control" value="${name}" placeholder="${window.I18n.t('cat.namePlaceholder')}" autocomplete="off">
            </div>

            <div class="form-group">
              <label class="form-label" for="edit-cat-type">${window.I18n.t('account.type')}</label>
              <select id="edit-cat-type" class="form-control" style="appearance: none;">
                <option value="expense" ${type==='expense'?'selected':''}>${window.I18n.t('form.expense')}</option>
                <option value="income" ${type==='income'?'selected':''}>${window.I18n.t('form.income')}</option>
                <option value="both" ${type==='both'?'selected':''}>${window.I18n.t('cat.both')}</option>
              </select>
            </div>

            <div class="form-group" style="margin-bottom: 0;">
              <div class="form-label" id="label-cat-icon">${window.I18n.t('form.icon')}</div>
              <div id="icon-trigger-field" tabindex="0" role="button" aria-labelledby="label-cat-icon" aria-label="${window.I18n.t('cat.currentIconAria', { icon })}" style="display:flex;align-items:center;gap:16px;padding:16px;background:var(--bg-surface);border-radius:12px;cursor:pointer;transition:background 0.2s;">
                <div id="current-icon-display" style="width:64px;height:64px;border-radius:20px;background:var(--bg-surface-elevated);display:flex;align-items:center;justify-content:center;color:var(--color-primary);box-shadow:0 4px 12px rgba(45,51,56,0.08);flex-shrink:0;" aria-hidden="true"><i data-lucide="${icon}" style="width: 32px; height: 32px;"></i></div>
                <div style="flex:1;">
                  <div style="font-weight:700;color:var(--text-primary);font-size:1rem;">${window.I18n.t('cat.tapToChangeIcon')}</div>
                  <div style="font-size:0.75rem;color:var(--text-tertiary);font-weight:600;text-transform:uppercase;letter-spacing:0.05em;margin-top:2px;">${window.I18n.t('cat.opensPicker')}</div>
                </div>
                <div style="color:var(--text-tertiary);font-size:1rem;" aria-hidden="true">›</div>
              </div>
            </div>
          </div>

          <button id="btn-save-category" class="btn btn-primary" style="width: 100%;">${isEdit ? window.I18n.t('account.saveChanges') : window.I18n.t('form.createCategory')}</button>

          ${isEdit ? `
            <button id="btn-delete-category" class="btn" style="width: 100%; margin-top: var(--space-4); color: var(--color-expense); background: var(--color-expense-bg); border: none;" ${txCount > 0 ? 'disabled' : ''}>
              ${window.I18n.t('cat.deleteCategory')}
            </button>
            ${txCount > 0 ? `<p style="font-size: 0.8rem; color: var(--text-tertiary); text-align: center; margin-top: 8px;">${window.I18n.t('cat.cannotDelete')}</p>` : ''}
          ` : ''}
        </div>
      `;
    },
    attachEvents(container, state) {
      const params = window.Router ? window.Router.getParams() : {};
      const catId = params.id;
      const isEdit = !!catId;
      const cat = isEdit ? state.categories.find(c => c.id === catId) : null;
      
      let selectedEmoji = cat ? cat.icon : 'pin';

      const display = container.querySelector('#current-icon-display');
      const trigger = container.querySelector('#icon-trigger-field');

      window.StackdHydrateIcons();

      if (trigger) {
        trigger.addEventListener("click", () => {
          window.Components.IconPicker.show({
            initialIcon: selectedEmoji,
            onSelect: (icon) => {
              selectedEmoji = icon;
              if (display) {
                display.innerHTML = `<i data-lucide="${icon}" style="width: 32px; height: 32px;"></i>`;
                window.StackdHydrateIcons();
              }
            }
          });
        });
      }

      const saveCatBtn = document.getElementById('btn-save-category');
      if (saveCatBtn) {
        saveCatBtn.addEventListener('click', () => {
          const nameInput = document.getElementById('edit-cat-name');
          const name = nameInput.value.trim();
          if (!name) {
            nameInput.style.backgroundColor = 'var(--color-expense-bg)';
            setTimeout(() => nameInput.style.backgroundColor = 'transparent', 1000);
            return;
          }

          const type = document.getElementById('edit-cat-type').value;

          if (isEdit) {
            window.Store.dispatch('UPDATE_CATEGORY', { id: catId, name, icon: selectedEmoji, typeHint: type });
          } else {
            window.Store.dispatch('ADD_CATEGORY', { name, icon: selectedEmoji, typeHint: type });
          }
          window.Router.navigate('#categories');
        });
      }

      const deleteCatBtn = document.getElementById('btn-delete-category');
      if (deleteCatBtn) {
        deleteCatBtn.addEventListener('click', () => {
          window.Components.Modal.show({
            title: window.I18n.t('cat.deleteTitle'),
            content: `<p>${window.I18n.t('cat.deleteConfirm')}</p>`,
            saveText: window.I18n.t('form.keep'),
            showDelete: true,
            onSave: (close) => close(),
            onDelete: (close) => {
              window.Store.dispatch('DELETE_CATEGORY', { id: catId });
              close();
              window.Router.navigate('#categories');
            }
          });
        });
      }
    }
  },

  // -------------------------
  // BUDGET VIEW (v0.15)
  // -------------------------
  BudgetView: {
    editCategoryId: null,
    currentBudgetFilter: 'expense',

    render(state) {
      if (this.editCategoryId) return this.renderEdit(state);
      return this.renderList(state);
    },

    renderList(state) {
      const today = new Date();
      const currentPhysicalMonthStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
      const selectedMonth = state.activeMonthFilter || currentPhysicalMonthStr;
      
      const [yearStr, monthStr] = selectedMonth.split('-');
      const d = new Date(parseInt(yearStr), parseInt(monthStr) - 1, 1);
      const currMonthLabel = d.toLocaleDateString(window.Store.getLocale(), { month: 'long', year: 'numeric' });

      const hasPrevMonth = true;
      const hasNextMonth = true;

      let totalAllocated = 0;
      let totalSpent = 0;

      let displayedCategories = state.categories.filter(c => c.typeHint === this.currentBudgetFilter || c.typeHint === 'both');

      // Sort categories: Budgeted first, then alphabetical
      displayedCategories.sort((a, b) => {
        const bdgA = window.Store.getBudgetForMonth(a.id, selectedMonth);
        const bdgB = window.Store.getBudgetForMonth(b.id, selectedMonth);
        const hasBudgetA = bdgA.allocated > 0;
        const hasBudgetB = bdgB.allocated > 0;

        if (hasBudgetA && !hasBudgetB) return -1;
        if (!hasBudgetA && hasBudgetB) return 1;
        return window.Store.compareAlpha(a, b);
      });

      const categoryCards = displayedCategories.map(cat => {
        const bdg = window.Store.getBudgetForMonth(cat.id, selectedMonth);
        const hasBudget = bdg.allocated > 0;

        if (hasBudget) {
          totalAllocated += bdg.finalLimit;
          totalSpent += bdg.spent;
        }

        const pct = hasBudget && bdg.finalLimit > 0
          ? Math.min((bdg.spent / bdg.finalLimit) * 100, 100)
          : 0;
        const isOver = hasBudget && bdg.spent > bdg.finalLimit;
        const barColor = isOver ? 'var(--color-expense)' : 'var(--color-primary)';
        const pctColor = isOver || pct >= 90 ? 'var(--color-expense)' : pct >= 75 ? '#f59e0b' : 'var(--text-secondary)';

        let carryOverBadge = '';
        if (hasBudget && bdg.carryover !== 0) {
          const sign = bdg.carryover > 0 ? '+' : '';
          const cf = window.Store.formatCurrency(Math.abs(bdg.carryover));
          carryOverBadge = `<span style="font-size: 0.7rem; padding: 2px 6px; background: var(--bg-surface-sunken); border-radius: 12px; margin-left: 6px; color: var(--text-secondary);">${window.I18n.t('budget.rolloverBadge', { amount: sign + cf })}</span>`;
        }

        if (hasBudget) {
          const limitFormatted = window.Store.formatCurrency(bdg.finalLimit);
          const spentFormatted = window.Store.formatCurrency(bdg.spent);
          return `
            <div class="list-item budget-cat-row touch-target" data-id="${cat.id}" style="cursor: pointer; flex-direction: column; align-items: stretch; gap: 10px; padding: 16px; width: 100%; box-sizing: border-box;" tabindex="0" role="button" aria-label="${window.I18n.t('budget.editForAria', { name: cat.name })}">
              <div style="display: flex; justify-content: space-between; align-items: center;">
                <div style="display: flex; align-items: center; gap: 12px;">
                  <div class="list-item-icon"><i data-lucide="${cat.icon}"></i></div>
                  <div>
                    <div class="list-item-title">${cat.name}${carryOverBadge}</div>
                    <div class="list-item-subtitle">${spentFormatted} <span style="color: var(--text-tertiary);">${window.I18n.t('budget.ofLimit', { limit: limitFormatted })}</span></div>
                  </div>
                </div>
                <div style="font-size: 0.8rem; font-weight: 700; color: ${pctColor};">${pct.toFixed(0)}%</div>
              </div>
              <div style="width: 100%; height: 8px; background: var(--bg-surface-sunken); border-radius: 4px; overflow: hidden; margin-top: 4px;">
                <div style="height: 100%; width: ${pct}%; background: ${barColor}; border-radius: 4px; transition: width 0.4s ease;"></div>
              </div>
            </div>
          `;
        } else {
          return `
            <div class="list-item budget-cat-row touch-target" data-id="${cat.id}" style="cursor: pointer; flex-direction: column; align-items: stretch; gap: 10px; padding: 16px; width: 100%; box-sizing: border-box; opacity: 0.5;" tabindex="0" role="button" aria-label="${window.I18n.t('budget.setForAria', { name: cat.name })}">
              <div style="display: flex; justify-content: space-between; align-items: center;">
                <div style="display: flex; align-items: center; gap: 12px;">
                  <div class="list-item-icon"><i data-lucide="${cat.icon}"></i></div>
                  <div>
                    <div class="list-item-title">${cat.name}</div>
                    <div class="list-item-subtitle" style="color: var(--text-tertiary);">${window.I18n.t('budget.noLimit')}</div>
                  </div>
                </div>
                <div style="font-size: 0.85rem; color: var(--text-secondary); font-weight: 600;">${window.I18n.t('budget.setBtn')}</div>
              </div>
              <div style="width: 100%; height: 8px; background: var(--bg-surface-sunken); border-radius: 4px; overflow: hidden; margin-top: 4px;">
                <div style="height: 100%; width: 0%; border-radius: 4px;"></div>
              </div>
            </div>
          `;
        }
      }).join('');

      const overspent = totalSpent > totalAllocated && totalAllocated > 0;

      return `
        <div class="container" style="padding-bottom: 100px;">
          <!-- STICKY HEADER -->
          <div class="history-header-sticky">
            <div class="page-header">
              <h1 class="page-header-title">${window.I18n.t('budget.title')}</h1>
            </div>

            <!-- Month Switcher (Modern Pill Style) -->
            <div style="display: flex; justify-content: center; align-items: center; background: var(--bg-surface-sunken); padding: 4px; border-radius: 24px; margin: 0 auto; width: fit-content; gap: 4px; border: 1px solid var(--border-color);">
              <button id="bdg-prev-month" class="btn-month-pill-arrow" ${!hasPrevMonth ? 'disabled' : ''} aria-label="${window.I18n.t('budget.prevMonth')}">
                <i data-lucide="chevron-left" style="width: 18px; height: 18px;"></i>
              </button>

              <div id="bdg-month-picker-btn" tabindex="0" role="button" aria-label="${window.I18n.t('budget.currentMonthAria', { month: currMonthLabel })}" style="cursor: pointer; display: flex; align-items: center; justify-content: center; font-family: var(--font-family-display); font-weight: 700; font-size: 0.95rem; color: var(--text-primary); padding: 0 8px; white-space: nowrap;">
                ${currMonthLabel}
              </div>

              <button id="bdg-next-month" class="btn-month-pill-arrow" ${!hasNextMonth ? 'disabled' : ''} aria-label="${window.I18n.t('budget.nextMonth')}">
                <i data-lucide="chevron-right" style="width: 18px; height: 18px;"></i>
              </button>
            </div>
          </div>

          <!-- Chart Area -->
          <div class="card card-elevated" style="margin-top: var(--space-6); margin-bottom: var(--space-6); padding: var(--space-5); text-align: center;">
            <div style="position: relative; width: 180px; height: 180px; margin: 0 auto; margin-bottom: var(--space-5);">
              <canvas id="budgetChart"></canvas>
              <div class="donut-chart-center">
                <div class="donut-total-label">${overspent ? window.I18n.t('budget.overspent') : window.I18n.t('budget.allocated')}</div>
                <div class="donut-total-value" style="font-size: 1.2rem; ${overspent ? 'color: var(--color-expense-val);' : ''}">${window.Store.formatCurrency(totalAllocated)}</div>
              </div>
            </div>
            <div style="display: flex; justify-content: space-between; font-size: var(--text-sm);">
              <div style="text-align: left;">
                <span style="color: var(--text-secondary);">${window.I18n.t('budget.totalSpent')}</span><br>
                <strong>${window.Store.formatCurrency(totalSpent)}</strong>
              </div>
              <div style="text-align: right;">
                <span style="color: var(--text-secondary);">${window.I18n.t('budget.remaining')}</span><br>
                <strong style="color: ${totalAllocated - totalSpent >= 0 ? 'var(--color-income-val)' : 'var(--color-expense-val)'};">${window.Store.formatCurrency(totalAllocated - totalSpent)}</strong>
              </div>
            </div>
          </div>

          <!-- Type Toggle -->
          <div style="display: flex; background: var(--bg-surface); border-radius: var(--radius-sm); padding: 4px; margin-bottom: var(--space-4);">
            <button id="bdg-toggle-expense" class="${this.currentBudgetFilter === 'expense' ? 'btn btn-danger' : 'btn'}" style="flex: 1; border-radius: var(--radius-sm); padding: 8px 4px; font-size: 13px; ${this.currentBudgetFilter !== 'expense' ? 'color: var(--text-secondary); background: transparent;' : ''}">${window.I18n.t('charts.expenses')}</button>
            <button id="bdg-toggle-income" class="${this.currentBudgetFilter === 'income' ? 'btn btn-income' : 'btn'}" style="flex: 1; border-radius: var(--radius-sm); padding: 8px 4px; font-size: 13px; ${this.currentBudgetFilter !== 'income' ? 'color: var(--text-secondary); background: transparent;' : ''}">${window.I18n.t('form.income')}</button>
          </div>

          <!-- Category List -->
          <div class="list-group">
            ${categoryCards.length > 0 ? categoryCards : `<p class="text-secondary text-center" style="padding: 20px;">${window.I18n.t('budget.noCategories')}</p>`}
          </div>
        </div>
      `;
    },

    renderEdit(state) {
      const cat = state.categories.find(c => c.id === this.editCategoryId);
      if (!cat) { this.editCategoryId = null; return this.renderList(state); }
      const budget = state.budgets.find(b => b.categoryId === cat.id) || {};
      const currSym = window.Store.getCurrencySymbol();

      return `
        <div class="absolute-pane animate-slide-up" style="background: var(--bg-body); z-index: 100;">
          <div class="header-nav" style="display: flex; justify-content: space-between; align-items: center; padding: var(--space-4); background: var(--bg-surface); border-bottom: 1px solid var(--border-color);">
            <button class="btn btn-icon" id="btn-bdg-back" style="color: var(--text-secondary);">
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline></svg>
            </button>
            <h2 style="font-size: 1.1rem; margin: 0; display: flex; align-items: center; gap: 8px;"><i data-lucide="${cat.icon}" style="width: 20px; height: 20px;"></i> ${cat.name}</h2>
            <button class="btn btn-icon" id="btn-bdg-save" style="color: var(--color-accent);">
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
            </button>
          </div>

          <div class="container" style="padding-top: var(--space-6); padding-bottom: 100px;">
            <div class="form-group">
              <label class="form-label" for="bdg-amount">${window.I18n.t('budget.monthlyLimit')}</label>
              <div style="position: relative;">
                <span style="position: absolute; left: 16px; top: 50%; transform: translateY(-50%); color: var(--text-tertiary); font-size: 1.5rem; pointer-events: none;" aria-hidden="true">${currSym}</span>
                <input type="number" id="bdg-amount" class="form-control" placeholder="0.00" value="${budget.amount || ''}" style="font-size: 1.5rem; padding-left: 40px; font-weight: 600;" step="0.01" inputmode="decimal">
              </div>
            </div>

            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-4);">
              <div class="form-group">
                <label class="form-label" for="bdg-start">${window.I18n.t('budget.startMonth')}</label>
                <input type="text" id="bdg-start" class="form-control" value="${budget.startDate || ''}" readonly placeholder="${window.I18n.t('budget.selectMonth')}" style="cursor: pointer; background: var(--bg-surface-sunken);">
              </div>
              <div class="form-group">
                <label class="form-label" for="bdg-end">${window.I18n.t('budget.endMonth')} <span style="font-weight: normal; color: var(--text-tertiary);">${window.I18n.t('common.optional')}</span></label>
                <input type="text" id="bdg-end" class="form-control" value="${budget.endDate || ''}" readonly placeholder="${window.I18n.t('budget.noEndDate')}" style="cursor: pointer; background: var(--bg-surface-sunken);">
              </div>
            </div>

            <div class="card card-elevated" style="margin-top: var(--space-6); padding: var(--space-4); display: flex; align-items: center; justify-content: space-between;">
              <div>
                <strong style="display: block; margin-bottom: 4px;">${window.I18n.t('budget.cumulativeRollover')}</strong>
                <span style="font-size: var(--text-sm); color: var(--text-secondary);">${window.I18n.t('budget.cumulativeRolloverDesc')}</span>
              </div>
              <label class="toggle-switch">
                <input type="checkbox" id="bdg-cumulative" ${budget.isCumulative ? 'checked' : ''}>
                <span class="slider"></span>
              </label>
            </div>

            ${budget.amount ? `
            <button id="btn-bdg-delete" class="btn" style="width: 100%; margin-top: var(--space-6); color: var(--color-expense); background: var(--color-expense-bg); border: none;">${window.I18n.t('budget.removeLimit')}</button>
            ` : ''}

            <style>
              .toggle-switch { position: relative; display: inline-block; width: 50px; height: 28px; flex-shrink: 0; }
              .toggle-switch input { opacity: 0; width: 0; height: 0; }
              .toggle-switch .slider { position: absolute; cursor: pointer; top: 0; left: 0; right: 0; bottom: 0; background-color: #ccc; transition: .3s; border-radius: 34px; }
              .toggle-switch .slider:before { position: absolute; content: ""; height: 20px; width: 20px; left: 4px; bottom: 4px; background-color: white; transition: .3s; border-radius: 50%; }
              .toggle-switch input:checked + .slider { background-color: #34c759; }
              .toggle-switch input:checked + .slider:before { transform: translateX(22px); }
            </style>
          </div>
        </div>
      `;
    },

    attachEvents(container, state) {
      window.StackdHydrateIcons();
      if (this.editCategoryId) {
        // Edit Mode Events — use container.querySelector for reliable binding
        const savedCategoryId = this.editCategoryId;

        const bdgBackBtn = container.querySelector('#btn-bdg-back');
        if (bdgBackBtn) {
          bdgBackBtn.addEventListener('click', () => {
            this.editCategoryId = null;
            window.Store.emit();
          });
        }

        setTimeout(() => {
          const amtInput = container.querySelector('#bdg-amount');
          if (amtInput) amtInput.focus();
        }, 100);

        const startInput = container.querySelector('#bdg-start');
        if (startInput) {
          startInput.addEventListener('click', () => {
            window.Components.MonthPicker.show({
              initialValue: startInput.value || (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; })(),
              onSelect: (val) => { startInput.value = val; }
            });
          });
        }

        const endInput = container.querySelector('#bdg-end');
        if (endInput) {
          endInput.addEventListener('click', () => {
            window.Components.MonthPicker.show({
                initialValue: endInput.value || (startInput ? startInput.value : '') || (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; })(),
                onSelect: (val) => { endInput.value = val; }
            });
          });
        }

        const bdgSaveBtn = container.querySelector('#btn-bdg-save');
        if (bdgSaveBtn) {
          bdgSaveBtn.addEventListener('click', () => {
            const amtElem = container.querySelector('#bdg-amount');
            const amt = amtElem ? parseFloat(amtElem.value) : 0;
            const startElem = container.querySelector('#bdg-start');
            const start = startElem ? startElem.value : '';
            const endElem = container.querySelector('#bdg-end');
            const end = endElem ? endElem.value : '';
            const cumElem = container.querySelector('#bdg-cumulative');
            const isCum = cumElem ? cumElem.checked : false;

            // CRITICAL: Reset BEFORE dispatch so the store emit re-renders the list, not the edit pane
            this.editCategoryId = null;
            window.Store.dispatch('SAVE_BUDGET', {
              categoryId: savedCategoryId,
              amount: amt,
              startDate: start,
              endDate: end || null,
              isCumulative: isCum
            });
          });
        }

        const bdgDeleteBtn = container.querySelector('#btn-bdg-delete');
        if (bdgDeleteBtn) {
          bdgDeleteBtn.addEventListener('click', () => {
            this.editCategoryId = null;
            window.Store.dispatch('SAVE_BUDGET', {
              categoryId: savedCategoryId,
              amount: 0,
              startDate: '',
              endDate: null,
              isCumulative: false
            });
          });
        }

      } else {
        // List Mode Events
        const today = new Date();
        const currentPhysicalMonthStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
        const selectedMonth = state.activeMonthFilter || currentPhysicalMonthStr;
        const [y, m] = selectedMonth.split('-');

        const prevBtn = document.getElementById('bdg-prev-month');
        if (prevBtn) {
          prevBtn.addEventListener('click', () => {
            const prevD = new Date(parseInt(y), parseInt(m) - 2, 1);
            const nextVal = `${prevD.getFullYear()}-${String(prevD.getMonth() + 1).padStart(2, '0')}`;
            window.Store.dispatch('SET_MONTH_FILTER', nextVal);
          });
        }
        const nextBtn = document.getElementById('bdg-next-month');
        if (nextBtn) {
          nextBtn.addEventListener('click', () => {
            const nextD = new Date(parseInt(y), parseInt(m), 1);
            const nextVal = `${nextD.getFullYear()}-${String(nextD.getMonth() + 1).padStart(2, '0')}`;
            window.Store.dispatch('SET_MONTH_FILTER', nextVal);
          });
        }

        const toggleExpense = document.getElementById('bdg-toggle-expense');
        if (toggleExpense) {
          toggleExpense.addEventListener('click', () => {
            this.currentBudgetFilter = 'expense';
            window.Store.emit();
          });
        }
        const toggleIncome = document.getElementById('bdg-toggle-income');
        if (toggleIncome) {
          toggleIncome.addEventListener('click', () => {
            this.currentBudgetFilter = 'income';
            window.Store.emit();
          });
        }

        const monthPickerBtn = document.getElementById('bdg-month-picker-btn');
        if (monthPickerBtn) {
          monthPickerBtn.addEventListener('click', () => {
          const today = new Date();
          const currentPhysicalMonthStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
          window.Components.MonthPicker.show({
            initialValue: state.activeMonthFilter || currentPhysicalMonthStr,
            onSelect: (val) => window.Store.dispatch('SET_MONTH_FILTER', val)
          });
          });
        }
        
        // Chart Render
        const ctx = document.getElementById('budgetChart');
        if (ctx) {
          let totalAllocated = 0;
          let totalSpent = 0;
          
          state.categories.forEach(cat => {
            const bdg = window.Store.getBudgetForMonth(cat.id, selectedMonth);
            totalAllocated += bdg.finalLimit;
            totalSpent += bdg.spent;
          });

          // Prevent 0/0 empty chart 
          const chartData = (totalAllocated === 0 && totalSpent === 0) 
            ? [1, 0] // dummy background slice 
            : [totalSpent, Math.max(totalAllocated - totalSpent, 0)];
            
          const overspent = totalSpent > totalAllocated && totalAllocated > 0;

          // Match analytics chart style: transparent-border gaps, borderRadius, slate palette
          const GAP = 3;
          const isDark = state.activeTheme === 'dark';
          // v0.80: tracked + destroy-before-create — a bare `new Chart` here
          // leaked one instance per dispatch while on #budget (see the
          // dashboard balance chart note for the failure mode).
          if (this._budgetChart) {
            try { this._budgetChart.destroy(); } catch (e) { /* already gone */ }
            this._budgetChart = null;
          }
          this._budgetChart = new window.Chart(ctx, {
            type: 'doughnut',
            data: {
              labels: ['Spent', 'Remaining'],
              datasets: [{
                data: chartData,
                backgroundColor: overspent
                  ? (isDark ? ['#f87171', '#1f293d'] : ['#ef4444', '#f1f5f9'])   // red + surface for overspent
                  : (isDark ? ['#94a3b8', '#1f293d'] : ['#64748b', '#e2e8f0']),  // slate + track (matches analytics)
                borderWidth: GAP,
                borderColor: 'transparent',
                hoverBorderColor: 'transparent',
                hoverBorderWidth: GAP,
                borderRadius: 6,
                hoverOffset: 6
              }]
            },
            options: {
              responsive: true,
              maintainAspectRatio: false,
              cutout: '74%',
              animation: false, // v0.93: no entry animation (see NetFlowChart note)
              plugins: { tooltip: { enabled: false }, legend: { display: false } }
            }
          });
        }

        container.querySelectorAll('.budget-cat-row').forEach(row => {
          row.addEventListener('click', () => {
            this.editCategoryId = row.dataset.id;
            window.Store.emit();
          });
        });
      }
    },

    // v0.80: release the doughnut on view exit (same rule as DashboardView).
    destroy() {
      if (this._budgetChart) {
        try { this._budgetChart.destroy(); } catch (e) { /* already gone */ }
        this._budgetChart = null;
      }
    }
  },

  // -------------------------
  // TAGS VIEW
  // -------------------------
  TagsView: {
    render(state) {
      const tags = window.Store.getAllUniqueTags();
      // v0.85: tags now open History filtered by that tag (all time), the same
      // destination the analytics category→tag drilldown uses — one way to
      // read a tag's transactions instead of a second, weaker list view.
      const counts = {};
      state.transactions.forEach(tx => {
        (Array.isArray(tx.tags) ? tx.tags : []).forEach(t => { counts[t] = (counts[t] || 0) + 1; });
      });
      let listHtml = tags.map(t => `
        <div class="list-item touch-target" data-tag-open="${escapeAttr(t)}" role="button" tabindex="0" style="display: flex; align-items: center; justify-content: space-between; cursor: pointer;">
          <div style="display: flex; align-items: center; gap: var(--space-3);">
            <div class="list-item-icon" style="margin: 0; background: var(--bg-surface-sunken); border-radius: 8px;"><i data-lucide="hash"></i></div>
            <div>
              <div class="list-item-title">#${escapeAttr(t)}</div>
              <div class="list-item-subtitle">${window.I18n.t('cat.txCount', { count: counts[t] || 0 })}</div>
            </div>
          </div>
          <div style="color: var(--text-tertiary);">›</div>
        </div>
      `).join('');

      if (tags.length === 0) {
        listHtml = `
          <div style="text-align: center; padding: 40px 20px;">
            <div style="font-size: 3rem; margin-bottom: 16px;">🏷️</div>
            <h3 style="margin-bottom: 8px;">${window.I18n.t('tags.emptyTitle')}</h3>
            <p class="text-secondary" style="margin-bottom: 0;">${window.I18n.t('tags.emptyBody')}</p>
          </div>
        `;
      }

      return `
        <div class="container" style="padding-bottom: 100px;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-top: var(--space-4); margin-bottom: var(--space-6);">
            <h1 class="header-title" style="margin: 0;">${window.I18n.t('form.tags')}</h1>
            <a href="#settings" style="color: var(--text-secondary); width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; background: var(--bg-surface); border-radius: 10px;">✕</a>
          </div>
          
          <div class="list-group">
            ${listHtml}
          </div>
        </div>
      `;
    },
    attachEvents(container, state) {
      window.StackdHydrateIcons();
      container.querySelectorAll('[data-tag-open]').forEach(row => {
        row.addEventListener('click', () => {
          const tag = row.dataset.tagOpen;
          if (!tag) return;
          // Span every transaction: a tag list is an all-time index, so the
          // History period must not hide older matches behind "This Month".
          const dates = state.transactions.map(t => t.date).filter(Boolean).sort();
          const pad = (n) => String(n).padStart(2, '0');
          const now = new Date();
          const todayStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
          const start = dates.length ? dates[0] : todayStr;
          const last = dates.length ? dates[dates.length - 1] : todayStr;
          const end = last > todayStr ? last : todayStr;

          const hFilters = window.Store.state.historyFilters;
          hFilters.period = { type: 'custom', value: '', start, end };
          hFilters.categories = [];
          hFilters.types = [];
          hFilters.accounts = [];
          hFilters.tags = [tag];
          window.Store.emit();
          window.Router.navigate('#transactions');
        });
      });
    }
  },

  // -------------------------
  // TAG DETAIL VIEW
  // -------------------------
  // v0.85: TagDetailView was removed — Settings → Tags now opens History
  // filtered by the tag (all time), the same destination as the analytics
  // category→tag drilldown, with day grouping, swipe actions and selection
  // that the standalone list never had.

  // -------------------------
  // OTHERS VIEW (formerly Settings)
  // -------------------------
  OthersView: {
    render(state) {
      return `
        <div class="container" style="padding-bottom: 100px;">
          <h1 class="header-title" style="margin-top: var(--space-4); margin-bottom: var(--space-8);">${window.I18n.t('others.title')}</h1>

          <div class="section-title">${window.I18n.t('others.manage')}</div>
          <div class="card card-elevated" style="margin-bottom: var(--space-6); padding: var(--space-4) var(--space-5);">
            <div id="btn-manage-accounts" class="touch-target" style="display: flex; align-items: center; justify-content: space-between; cursor: pointer; border-bottom: 1px solid var(--border-color); padding-bottom: var(--space-4); margin-bottom: var(--space-4); width: 100%;" tabindex="0" role="button" aria-label="${window.I18n.t('others.manageAccountsAria')}">
              <div style="display: flex; align-items: center; gap: var(--space-3);">
                <div class="list-item-icon" style="margin: 0;"><i data-lucide="landmark"></i></div>
                <div>
                  <div class="list-item-title">${window.I18n.t('others.accounts')}</div>
                  <div class="list-item-subtitle">${window.I18n.t('others.accountCount', { count: state.accounts.length })}</div>
                </div>
              </div>
              <i data-lucide="chevron-right" style="color: var(--text-tertiary); width: 20px; height: 20px;"></i>
            </div>
            
            <a href="#categories" style="display: flex; align-items: center; justify-content: space-between; text-decoration: none;">
              <div style="display: flex; align-items: center; gap: var(--space-3);">
                <div class="list-item-icon" style="margin: 0;"><i data-lucide="tag"></i></div>
                <div>
                  <div class="list-item-title">${window.I18n.t('others.categories')}</div>
                  <div class="list-item-subtitle">${window.I18n.t('others.categoryCount', { count: state.categories.length })}</div>
                </div>
              </div>
              <i data-lucide="chevron-right" style="color: var(--text-tertiary); width: 20px; height: 20px;"></i>
            </a>
            
            <a href="#tags" style="display: flex; align-items: center; justify-content: space-between; text-decoration: none; border-top: 1px solid var(--border-color); padding-top: var(--space-4); margin-top: var(--space-4);">
              <div style="display: flex; align-items: center; gap: var(--space-3);">
                <div class="list-item-icon" style="margin: 0;"><i data-lucide="hash"></i></div>
                <div>
                  <div class="list-item-title">${window.I18n.t('form.tags')}</div>
                  <div class="list-item-subtitle">${window.I18n.t('others.tagCount', { count: window.Store.getAllUniqueTags().length })}</div>
                </div>
              </div>
              <i data-lucide="chevron-right" style="color: var(--text-tertiary); width: 20px; height: 20px;"></i>
            </a>
          </div>

          <div class="section-title">${window.I18n.t('others.regionSetting')}</div>
          <div class="card card-elevated" style="margin-bottom: var(--space-6); padding: var(--space-4) var(--space-5);">
            <div id="btn-open-currency" class="touch-target" style="display: flex; align-items: center; justify-content: space-between; cursor: pointer; border-bottom: 1px solid var(--border-color); padding-bottom: var(--space-4); margin-bottom: var(--space-4); width: 100%;" tabindex="0" role="button" aria-label="${window.I18n.t('others.chooseCurrencyAria')}">
              <div style="display: flex; align-items: center; gap: var(--space-3);">
                <div class="list-item-icon" style="margin: 0;"><i data-lucide="coins"></i></div>
                <div>
                  <div class="list-item-title">${window.I18n.t('others.currency')}</div>
                  <div class="list-item-subtitle" id="current-currency-display">${window.I18n.t('currency.' + (['USD','EUR','JPY','GBP','CNY'].includes(state.currency) ? state.currency : 'USD'))}</div>
                </div>
              </div>
              <i data-lucide="chevron-right" style="color: var(--text-tertiary); width: 20px; height: 20px;"></i>
            </div>
            
            <div id="btn-open-language" class="touch-target" style="display: flex; align-items: center; justify-content: space-between; cursor: pointer; width: 100%;" tabindex="0" role="button" aria-label="${window.I18n.t('others.chooseLanguageAria')}">
              <div style="display: flex; align-items: center; gap: var(--space-3);">
                <div class="list-item-icon" style="margin: 0;"><i data-lucide="globe"></i></div>
                <div>
                  <div class="list-item-title">${window.I18n.t('others.language')}</div>
                  <div class="list-item-subtitle" id="current-language-display">${(window.I18n.LANGUAGES.find(l => l.code === state.language) || { label: 'English' }).label}</div>
                </div>
              </div>
              <i data-lucide="chevron-right" style="color: var(--text-tertiary); width: 20px; height: 20px;"></i>
            </div>
          </div>

          <div class="section-title">${window.I18n.t('others.dataVisualization')}</div>
          <div class="card card-elevated" style="margin-bottom: var(--space-6); padding: var(--space-4) var(--space-5);">
            <div style="display: flex; align-items: center; justify-content: space-between; width: 100%; border-bottom: 1px solid var(--border-color); padding-bottom: var(--space-4); margin-bottom: var(--space-4);">
              <div style="display: flex; align-items: center; gap: var(--space-3);">
                <div class="list-item-icon" style="margin: 0;" aria-hidden="true"><i data-lucide="arrow-up-down"></i></div>
                <div>
                  <div class="list-item-title" id="label-sort-order">${window.I18n.t('others.sortOrder')}</div>
                  <div class="list-item-subtitle">${window.I18n.t('others.sortOrderDesc')}</div>
                </div>
              </div>
              <div style="display: flex; background: var(--bg-surface-sunken); border-radius: 20px; padding: 2px;" role="group" aria-labelledby="label-sort-order">
                <button id="btn-sort-desc" class="btn" style="padding: 4px 12px; font-size: 11px; min-height: 0; height: 28px; border-radius: 18px; ${state.historySortOrder === 'desc' ? 'background: var(--color-accent); color: white;' : 'background: transparent; color: var(--text-secondary);'}" aria-pressed="${state.historySortOrder === 'desc'}">DESC</button>
                <button id="btn-sort-asc" class="btn" style="padding: 4px 12px; font-size: 11px; min-height: 0; height: 28px; border-radius: 18px; ${state.historySortOrder === 'asc' ? 'background: var(--color-accent); color: white;' : 'background: transparent; color: var(--text-secondary);'}" aria-pressed="${state.historySortOrder === 'asc'}">ASC</button>
              </div>
            </div>

            <div style="display: flex; align-items: center; justify-content: space-between; width: 100%;">
              <div style="display: flex; align-items: center; gap: var(--space-3);">
                <div class="list-item-icon" style="margin: 0;" aria-hidden="true"><i data-lucide="clock"></i></div>
                <div>
                  <div class="list-item-title" id="label-enable-time-input">${window.I18n.t('others.enableTimeInput')}</div>
                  <div class="list-item-subtitle">${window.I18n.t('others.enableTimeInputDesc')}</div>
                </div>
              </div>
              <label class="toggle-switch">
                <input type="checkbox" id="toggle-enable-time-input" ${state.enableTimeInput ? 'checked' : ''}>
                <span class="slider"></span>
              </label>
            </div>
          </div>

          <div class="section-title">${window.I18n.t('others.appearance')}</div>
          <div class="card card-elevated" style="margin-bottom: var(--space-6); padding: var(--space-4) var(--space-5);">
            <div style="display: flex; align-items: center; justify-content: space-between; width: 100%; flex-wrap: wrap; row-gap: var(--space-2);">
              <div style="display: flex; align-items: center; gap: var(--space-3);">
                <div class="list-item-icon" style="margin: 0;" aria-hidden="true"><i data-lucide="sun-moon"></i></div>
                <div>
                  <div class="list-item-title" id="label-theme-mode">${window.I18n.t('others.themePreference')}</div>
                  <div class="list-item-subtitle" id="current-theme-subtitle">${state.theme === 'light' ? window.I18n.t('others.themeLightActive') : (state.theme === 'dark' ? window.I18n.t('others.themeDarkActive') : window.I18n.t('others.themeSystemActive', { mode: window.I18n.t(state.activeTheme === 'dark' ? 'others.themeDark' : 'others.themeLight') }))}</div>
                </div>
              </div>
              <div style="display: flex; background: var(--bg-surface-sunken); border-radius: 20px; padding: 2px;" role="group" aria-labelledby="label-theme-mode">
                <button id="btn-theme-light" class="btn" style="width: auto; white-space: nowrap; padding: 4px 12px; font-size: 11px; min-height: 0; height: 28px; border-radius: 18px; ${state.theme === 'light' ? 'background: var(--color-accent); color: white;' : 'background: transparent; color: var(--text-secondary);'}" aria-pressed="${state.theme === 'light'}">${window.I18n.t('others.themeLight')}</button>
                <button id="btn-theme-dark" class="btn" style="width: auto; white-space: nowrap; padding: 4px 12px; font-size: 11px; min-height: 0; height: 28px; border-radius: 18px; ${state.theme === 'dark' ? 'background: var(--color-accent); color: white;' : 'background: transparent; color: var(--text-secondary);'}" aria-pressed="${state.theme === 'dark'}">${window.I18n.t('others.themeDark')}</button>
                <button id="btn-theme-system" class="btn" style="width: auto; white-space: nowrap; padding: 4px 12px; font-size: 11px; min-height: 0; height: 28px; border-radius: 18px; ${(!state.theme || state.theme === 'system') ? 'background: var(--color-accent); color: white;' : 'background: transparent; color: var(--text-secondary);'}" aria-pressed="${!state.theme || state.theme === 'system'}">${window.I18n.t('others.themeSystem')}</button>
              </div>
            </div>
          </div>

          <div class="section-title">${window.I18n.t('others.dataExport')}</div>
          <div class="card card-elevated" style="margin-bottom: var(--space-6); padding: var(--space-5);">
            <p style="color: var(--text-secondary); font-size: var(--text-sm); margin-bottom: var(--space-4); line-height: 1.6;">
              ${window.I18n.t('others.exportDesc')}
            </p>
            <div style="display: flex; flex-direction: column; gap: var(--space-3);">
              <button class="btn btn-secondary" id="btn-export-accounts">${window.I18n.t('others.exportAccounts')}</button>
              <button class="btn btn-secondary" id="btn-export-categories">${window.I18n.t('others.exportCategories')}</button>
              <button class="btn btn-secondary" id="btn-export-transactions">${window.I18n.t('others.exportTransactions')}</button>
              <button class="btn btn-secondary" id="btn-export-loans">${window.I18n.t('others.exportLoans')}</button>
            </div>
          </div>

          <div class="section-title">${window.I18n.t('others.dataImport')}</div>
          <div class="card card-elevated" style="margin-bottom: var(--space-6); padding: var(--space-5);">
            <p style="color: var(--text-secondary); font-size: var(--text-sm); margin-bottom: var(--space-4); line-height: 1.6;">
              ${window.I18n.t('others.importDesc', { columns: '<b>Date, Amount, Type, Account, Category, Note</b>' })}
            </p>
            <input type="file" id="import-csv-file" accept=".csv" style="display: none;">
            <button class="btn btn-primary" id="btn-import-csv" style="width: 100%;">${window.I18n.t('others.importCsv')}</button>
          </div>

          <div class="section-title">${window.I18n.t('others.support')}</div>
          <div class="card card-elevated" style="margin-bottom: var(--space-8); padding: var(--space-4) var(--space-5);">
            <div class="list-group">
              <div class="list-item" id="btn-open-faq" style="cursor: pointer;" tabindex="0" role="button" aria-label="${window.I18n.t('others.openFaqAria')}">
                <div class="list-item-content"><div class="list-item-title">${window.I18n.t('others.faq')}</div></div>
                <div style="color: var(--text-tertiary); font-size: var(--text-sm);">›</div>
              </div>
              <div class="list-item" id="btn-open-manual" style="cursor: pointer;" tabindex="0" role="button" aria-label="${window.I18n.t('others.openManualAria')}">
                <div class="list-item-content"><div class="list-item-title">${window.I18n.t('others.userManual')}</div></div>
                <div style="color: var(--text-tertiary); font-size: var(--text-sm);">›</div>
              </div>
              <div class="list-item" id="btn-send-feedback" style="cursor: pointer;" tabindex="0" role="button">
                <div class="list-item-content"><div class="list-item-title" style="color: var(--color-accent);">${window.I18n.t('others.sendFeedback')}</div></div>
                <div style="color: var(--text-tertiary); font-size: var(--text-sm);">›</div>
              </div>
              <div class="list-item" id="btn-rate-app" style="cursor: pointer;" tabindex="0" role="button">
                <div class="list-item-content"><div class="list-item-title" style="color: var(--color-accent);">${window.I18n.t('others.rateApp')}</div></div>
                <div style="color: var(--text-tertiary); font-size: var(--text-sm);">›</div>
              </div>
              <div class="list-item" id="btn-open-terms" style="cursor: pointer;" tabindex="0" role="button" aria-label="${window.I18n.t('others.openTermsAria')}">
                <div class="list-item-content"><div class="list-item-title">${window.I18n.t('others.terms')}</div></div>
                <div style="color: var(--text-tertiary); font-size: var(--text-sm);">›</div>
              </div>
            </div>
          </div>
          
          <div class="section-title" style="color: var(--color-expense);">${window.I18n.t('others.dangerZone')}</div>
          <div class="card card-elevated" style="margin-bottom: var(--space-8); padding: var(--space-4) var(--space-5); border: 1px solid rgba(239, 68, 68, 0.3);">
            <div id="btn-factory-reset" style="display: flex; align-items: center; justify-content: space-between; cursor: pointer;">
              <div style="display: flex; align-items: center; gap: var(--space-3);">
                <div class="list-item-icon" style="margin: 0; background: var(--color-expense-bg); color: var(--color-expense);"><i data-lucide="alert-triangle"></i></div>
                <div>
                  <div class="list-item-title" style="color: var(--color-expense); font-weight: 600;">${window.I18n.t('others.factoryReset')}</div>
                  <div class="list-item-subtitle text-secondary">${window.I18n.t('others.factoryResetDesc')}</div>
                </div>
              </div>
            </div>
          </div>
          
        </div>`;
    },
    attachEvents(container, state) {
      window.StackdHydrateIcons();
      const faqBtn = document.getElementById('btn-open-faq');
      if (faqBtn) {
        const openFaq = () => window.Components.FaqModal.show();
        faqBtn.addEventListener('click', openFaq);
        faqBtn.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openFaq(); } });
      }
      const manualBtn = document.getElementById('btn-open-manual');
      if (manualBtn) {
        const openManual = () => window.Components.ManualModal.show();
        manualBtn.addEventListener('click', openManual);
        manualBtn.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openManual(); } });
      }
      const termsBtn = document.getElementById('btn-open-terms');
      if (termsBtn) {
        const openTerms = () => window.Components.TermsModal.show();
        termsBtn.addEventListener('click', openTerms);
        termsBtn.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openTerms(); } });
      }
      // v0.89 P8d: these two were inline onclick="alert('…')" with the message
      // baked into the attribute, which no amount of escaping makes safe to
      // interpolate a translation into. Wired here instead.
      const feedbackBtn = document.getElementById('btn-send-feedback');
      if (feedbackBtn) {
        feedbackBtn.addEventListener('click', () => alert(window.I18n.t('others.feedbackAlert')));
      }
      const rateBtn = document.getElementById('btn-rate-app');
      if (rateBtn) {
        rateBtn.addEventListener('click', () => alert(window.I18n.t('others.rateAlert')));
      }
      const exportAccBtn = document.getElementById('btn-export-accounts');
      if (exportAccBtn) {
        exportAccBtn.addEventListener('click', () => window.StackdExport.exportAccounts(state));
      }
      const exportCatBtn = document.getElementById('btn-export-categories');
      if (exportCatBtn) {
        exportCatBtn.addEventListener('click', () => window.StackdExport.exportCategories(state));
      }
      const exportTxBtn = document.getElementById('btn-export-transactions');
      if (exportTxBtn) {
        exportTxBtn.addEventListener('click', () => window.StackdExport.exportTransactions(state));
      }

      const exportLoansBtn = document.getElementById('btn-export-loans');
      if (exportLoansBtn) {
        exportLoansBtn.addEventListener('click', () => window.StackdExport.exportLoans(state));
      }

      const toggleTimeInput = document.getElementById('toggle-enable-time-input');
      if (toggleTimeInput) {
        toggleTimeInput.addEventListener('change', (e) => {
          window.Store.dispatch('SET_ENABLE_TIME_INPUT', e.target.checked);
        });
      }

      const btnThemeSystem = document.getElementById('btn-theme-system');
      const btnThemeLight = document.getElementById('btn-theme-light');
      const btnThemeDark = document.getElementById('btn-theme-dark');
      if (btnThemeSystem) {
        btnThemeSystem.addEventListener('click', () => window.Store.dispatch('SET_THEME', 'system'));
      }
      if (btnThemeLight) {
        btnThemeLight.addEventListener('click', () => window.Store.dispatch('SET_THEME', 'light'));
      }
      if (btnThemeDark) {
        btnThemeDark.addEventListener('click', () => window.Store.dispatch('SET_THEME', 'dark'));
      }

      // Currency picker
      const btnCurrency = document.getElementById('btn-open-currency');
      if (btnCurrency) {
        const CURRENCIES = [
          { code: 'USD', symbol: '$', label: window.I18n.t('currency.USD') },
          { code: 'EUR', symbol: '\u20ac', label: window.I18n.t('currency.EUR') },
          { code: 'JPY', symbol: '\u00a5', label: window.I18n.t('currency.JPY') },
          { code: 'GBP', symbol: '\u00a3', label: window.I18n.t('currency.GBP') },
          { code: 'CNY', symbol: '\u00a5', label: window.I18n.t('currency.CNY') },
        ];
        const openCurrencyPicker = () => {
          const current = window.Store.getState().currency || 'USD';
          const optionsHtml = CURRENCIES.map(c => `
            <div class="currency-opt list-item" data-code="${c.code}" style="cursor: pointer; display: flex; align-items: center; gap: 16px; padding: 14px var(--space-4); border-bottom: 1px solid var(--bg-surface-sunken);" tabindex="0" role="button">
              <span style="font-size: 1.4rem; width: 32px; text-align: center; font-family: var(--font-family-display); flex-shrink: 0;">${c.symbol}</span>
              <span style="flex: 1; font-weight: ${c.code === current ? '700' : '400'}; color: ${c.code === current ? 'var(--text-primary)' : 'var(--text-secondary)'}">${c.label}</span>
              ${c.code === current ? '<span style="color: var(--color-accent); font-size: 1.1rem;">✓</span>' : ''}
            </div>
          `).join('');
          window.Components.Modal.show({
            title: window.I18n.t('others.chooseCurrency'),
            content: `<div>${optionsHtml}</div>`,
            saveText: window.I18n.t('common.done'),
            onSave: (close) => close()
          });
          setTimeout(() => {
            document.querySelectorAll('.currency-opt').forEach(opt => {
              opt.addEventListener('click', () => {
                window.Store.dispatch('SET_CURRENCY', opt.dataset.code);
                window.Components.Modal.hide();
              });
            });
          }, 50);
        };
        btnCurrency.addEventListener('click', openCurrencyPicker);
        btnCurrency.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openCurrencyPicker(); } });
      }

      // Language picker
      const btnLanguage = document.getElementById('btn-open-language');
      if (btnLanguage) {
        const LANGUAGES = window.I18n.LANGUAGES; // v0.86 P8a: en/fr/it/es/pt
        const openLanguagePicker = () => {
          const current = window.Store.getState().language || 'en';
          const optionsHtml = LANGUAGES.map(l => `
            <div class="language-opt list-item" data-code="${l.code}" style="cursor: pointer; display: flex; align-items: center; gap: 16px; padding: 14px var(--space-4); border-bottom: 1px solid var(--bg-surface-sunken);" tabindex="0" role="button">
              <span style="font-size: 1.4rem; width: 32px; text-align: center; flex-shrink: 0; display: flex; align-items: center; justify-content: center;"><i data-lucide="globe" style="width: 24px; height: 24px;"></i></span>
              <span style="flex: 1; font-weight: ${l.code === current ? '700' : '400'}; color: ${l.code === current ? 'var(--text-primary)' : 'var(--text-secondary)'}">${l.label}</span>
              ${l.code === current ? '<span style="color: var(--color-accent); font-size: 1.1rem;">✓</span>' : ''}
            </div>
          `).join('');
          window.Components.Modal.show({
            title: window.I18n.t('others.chooseLanguage'),
            content: `<div>${optionsHtml}</div>`,
            saveText: window.I18n.t('common.done'),
            onSave: (close) => close()
          });
          setTimeout(() => {
            document.querySelectorAll('.language-opt').forEach(opt => {
              opt.addEventListener('click', () => {
                window.Store.dispatch('SET_LANGUAGE', opt.dataset.code);
                window.Components.Modal.hide();
              });
            });
          }, 50);
        };
        btnLanguage.addEventListener('click', openLanguagePicker);
        btnLanguage.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openLanguagePicker(); } });
      }

      // History Sort Toggle
      const sortDescBtn = document.getElementById('btn-sort-desc');
      if (sortDescBtn) {
        sortDescBtn.addEventListener('click', () => {
          window.Store.dispatch('SET_HISTORY_SORT_ORDER', 'desc');
        });
      }
      const sortAscBtn = document.getElementById('btn-sort-asc');
      if (sortAscBtn) {
        sortAscBtn.addEventListener('click', () => {
          window.Store.dispatch('SET_HISTORY_SORT_ORDER', 'asc');
        });
      }
      
      // Data Import
      const fileInput = document.getElementById('import-csv-file');
      const btnImport = document.getElementById('btn-import-csv');
      
      if (btnImport && fileInput) {
        btnImport.addEventListener('click', () => {
          fileInput.click();
        });
        
        fileInput.addEventListener('change', (e) => {
          const file = e.target.files[0];
          if (!file) return;
          
          btnImport.textContent = window.I18n.t('others.importing');
          btnImport.disabled = true;
          
          if (window.StackdImport) {
            // v0.71: importCSV routes on the file's shape, so the same button
            // accepts a transactions export or a loans export.
            window.StackdImport.importCSV(file, state, (result) => {
              // v0.68: rows the importer refuses (bad dates, one-sided 'transfer'
              // rows) used to vanish silently — report them.
              let message = result.kind === 'loans'
                ? window.I18n.t('others.importedLoans', { count: result.importedCount })
                : window.I18n.t('others.importedTransactions', {
                    count: result.importedCount,
                    accounts: result.newAccounts,
                    categories: result.newCategories
                  });
              if (result.skippedCount) {
                const reasons = Object.keys(result.skipped)
                  .map(r => `• ${result.skipped[r]} — ${r}`)
                  .join('\n');
                message += '\n\n' + window.I18n.t('others.importSkipped', { count: result.skippedCount, reasons });
              }
              alert(message);
              btnImport.textContent = window.I18n.t('others.importCsv');
              btnImport.disabled = false;
              fileInput.value = ''; // reset
            }, (err) => {
              alert(window.I18n.t('others.importFailed', { message: err.message }));
              btnImport.textContent = window.I18n.t('others.importCsv');
              btnImport.disabled = false;
              fileInput.value = ''; // reset
            });
          } else {
            alert(window.I18n.t('others.importModuleMissing'));
            btnImport.textContent = window.I18n.t('others.importCsv');
            btnImport.disabled = false;
          }
        });
      }
      
      // Manage Accounts — navigate to EditAccountView for each account row
      const btnManageAccounts = document.getElementById('btn-manage-accounts');
      if (btnManageAccounts) {
        btnManageAccounts.addEventListener('click', () => {
          let accountsListHtml = [...state.accounts]
            .sort((a, b) => window.Store.compareAlpha(a, b))
            .map(acc => `
              <div class="list-item others-account-row touch-target" data-id="${acc.id}" style="cursor: pointer; display: flex; align-items: center; justify-content: space-between; width: 100%;" tabindex="0" role="button" aria-label="${window.I18n.t('others.editAccountAria', { name: acc.name })}">
                <div style="display: flex; align-items: center; gap: 12px;">
                  <div style="width: 12px; height: 12px; border-radius: 4px; background-color: ${acc.color}; flex-shrink: 0;"></div>
                  <strong>${acc.name}</strong>
                </div>
                <div style="color: var(--text-tertiary); font-size: var(--text-sm);">›</div>
              </div>
            `).join('');

          if (state.accounts.length === 0) accountsListHtml = `<p class="text-secondary text-center">${window.I18n.t('others.noAccounts')}</p>`;

          window.Components.Modal.show({
            title: window.I18n.t('others.accounts'),
            content: `
              <div class="list-group" style="margin-bottom: 24px;">
                ${accountsListHtml}
              </div>
              <button id="modal-btn-new-account" class="btn btn-primary" style="width: 100%;">${window.I18n.t('others.createNewAccount')}</button>
            `,
            saveText: window.I18n.t('common.done'),
            onSave: (closeModal) => closeModal()
          });

          setTimeout(() => {
            // Each account row navigates to the shared EditAccountView
            document.querySelectorAll('.others-account-row').forEach(row => {
              row.addEventListener('click', () => {
                window.Components.Modal.hide();
                window.Router.navigate(`#edit-account?id=${row.dataset.id}`);
              });
            });

            // Create New Account
            const innerBtn = document.getElementById('modal-btn-new-account');
            if (innerBtn) {
              innerBtn.addEventListener('click', () => {
                window.Components.Modal.hide();
                window.Router.navigate('#edit-account');
              });
            }
          }, 100);
        });
      }
      
      // Factory Reset
      const btnReset = document.getElementById('btn-factory-reset');
      if (btnReset) {
        btnReset.addEventListener('click', () => {
          window.Components.Modal.show({
            title: window.I18n.t('others.factoryResetTitle'),
            content: `<p style="color: var(--color-expense); font-weight: 500;">${window.I18n.t('others.factoryResetWarning')}</p>`,
            saveText: window.I18n.t('others.keepData'),
            showDelete: true,
            onSave: (closeModal) => closeModal(),
            onDelete: (closeModal) => {
              window.Store.dispatch('RESET_APP');
              closeModal();
              window.location.reload();
            }
          });
        });
      }
    }
  }
});

// -------------------------
// EDIT ACCOUNT VIEW (v0.31)
// -------------------------
Object.assign(window.Views, {
  EditAccountView: {
    render(state) {
      const params = window.Router ? window.Router.getParams() : {};
      const accountId = params.id;
      const account = accountId ? state.accounts.find(a => a.id === accountId) : null;
      const isEdit = !!account;

      const currentOb = account ? state.transactions.find(
        t => t.accountId === account.id && t.type === 'opening_balance'
      ) : null;
      const currentObAmt = currentOb ? currentOb.amount : 0;
      const isNegativeOb = currentObAmt < 0;
      const currentObDate = currentOb ? currentOb.date : new Date().toISOString().split('T')[0];
      const currentBalance = account ? window.Store.getAccountBalance(account.id) : 0;
      const currSym = window.Store.getCurrencySymbol();
      const txCount = account ? state.transactions.filter(t => t.accountId === account.id).length : 0;

      const title = isEdit ? window.I18n.t('account.editTitle') : window.I18n.t('account.newTitle');
      const nameValue = account ? account.name : '';
      const iconValue = account ? account.icon : 'wallet';
      const typeValue = account ? account.type : 'Account';
      const defaultColor = (window.Store.ACCOUNT_COLORS || [])[state.accounts.length % (window.Store.ACCOUNT_COLORS || []).length] || '#0075EB';
      const colorValue = account ? account.color : defaultColor;
      const isDefault = state.defaultAccountId === accountId;

      return `
        <div class="container" style="padding-bottom: 160px;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-top: var(--space-4); margin-bottom: var(--space-6);">
            <h1 class="header-title" style="margin: 0;">${title}</h1>
            <a href="#dashboard" style="color: var(--text-secondary); width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; background: var(--bg-surface); border-radius: 10px;"><i data-lucide="x" style="width: 18px; height: 18px;"></i></a>
          </div>

          <div class="card" style="margin-bottom: var(--space-6);">
            <div class="form-group">
              <label class="form-label" for="edit-acc-name">${window.I18n.t('account.name')}</label>
              <input type="text" id="edit-acc-name" class="form-control" value="${nameValue}" placeholder="${window.I18n.t('account.namePlaceholder')}" autocomplete="off">
            </div>

            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-4); margin-bottom: var(--space-5);">
              <div class="form-group" style="margin-bottom: 0;">
                <label class="form-label">${window.I18n.t('account.type')}</label>
                <select id="edit-acc-type" class="form-control">
                  ${window.Store.ACCOUNT_TYPES.map(v => `<option value="${v}" ${typeValue === v ? 'selected' : ''}>${window.Store.accountTypeLabel(v)}</option>`).join('')}
                </select>
              </div>
              <div class="form-group" style="margin-bottom: 0;">
                <label class="form-label">${window.I18n.t('form.icon')}</label>
                <div id="acc-icon-trigger" class="touch-target" style="width: 100%; border: 1px solid var(--color-border); border-radius: var(--radius-md); background: var(--bg-surface); cursor: pointer; display: flex; align-items: center; justify-content: center; min-height: var(--target-size);">
                  <i id="acc-icon-preview" data-lucide="${iconValue}"></i>
                </div>
              </div>
            </div>

            <div class="form-group" style="margin-bottom: var(--space-5);">
              <label class="form-label">${window.I18n.t('account.color')}</label>
              <div id="acc-color-picker" style="display: flex; flex-wrap: wrap; gap: 10px; padding: 4px 0;" role="radiogroup" aria-label="${window.I18n.t('account.color')}">
                ${(window.Store.ACCOUNT_COLORS || []).map(c => {
                  const isSelected = c.toLowerCase() === (colorValue || '').toLowerCase();
                  return `
                    <button type="button" class="color-swatch-btn ${isSelected ? 'active' : ''}" data-color="${c}" aria-label="${window.I18n.t('account.selectColorAria', { color: c })}" style="width: 34px; height: 34px; border-radius: 50%; background-color: ${c}; border: ${isSelected ? '3px solid var(--color-primary)' : '2px solid transparent'}; cursor: pointer; transition: transform 0.2s, border-color 0.2s; transform: ${isSelected ? 'scale(1.15)' : 'scale(1)'}; box-shadow: 0 2px 6px rgba(0,0,0,0.15);" role="radio" aria-checked="${isSelected}"></button>
                  `;
                }).join('')}
              </div>
            </div>

            <div class="form-group">
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
                <label class="form-label" for="edit-acc-balance" style="margin-bottom: 0;">${window.I18n.t('account.openingBalance')}</label>
                <div style="display: flex; background: var(--bg-surface-sunken); border-radius: 14px; padding: 2px;" role="group" aria-label="${window.I18n.t('account.balanceSignAria')}">
                  <button type="button" id="btn-ob-pos" class="btn" style="padding: 2px 10px; font-size: 11px; min-height: 0; height: 24px; border-radius: 12px; font-weight: 600; ${!isNegativeOb ? 'background: var(--color-primary); color: white;' : 'background: transparent; color: var(--text-secondary);'}" aria-pressed="${!isNegativeOb}">${window.I18n.t('account.positive')}</button>
                  <button type="button" id="btn-ob-neg" class="btn" style="padding: 2px 10px; font-size: 11px; min-height: 0; height: 24px; border-radius: 12px; font-weight: 600; ${isNegativeOb ? 'background: var(--color-expense); color: white;' : 'background: transparent; color: var(--text-secondary);'}" aria-pressed="${isNegativeOb}">${window.I18n.t('account.negative')}</button>
                </div>
              </div>
              <div style="position: relative;">
                <span id="ob-sign-symbol" style="position: absolute; left: 14px; top: 50%; transform: translateY(-50%); color: ${isNegativeOb ? 'var(--color-expense)' : 'var(--text-tertiary)'}; font-size: 1rem; pointer-events: none; font-family: var(--font-family-display); font-weight: 600;" aria-hidden="true">${isNegativeOb ? '-' : ''}${currSym}</span>
                <input type="text" id="edit-acc-balance" class="form-control" value="${Math.abs(currentObAmt).toFixed(2)}" placeholder="0.00" inputmode="numeric" style="padding-left: ${isNegativeOb ? '38px' : '30px'}; ${isNegativeOb ? 'color: var(--color-expense);' : ''}">
              </div>
              <p style="font-size: var(--text-xs); color: var(--text-tertiary); margin: 4px 0 0 2px;">${window.I18n.t('account.negativeHint')}</p>
            </div>

            <div class="form-group" style="margin-bottom: var(--space-5);">
              <label class="form-label" for="edit-acc-date">${window.I18n.t('account.openingBalanceDate')}</label>
              <input type="date" id="edit-acc-date" class="form-control" value="${currentObDate}">
            </div>

            <div style="display: flex; align-items: center; justify-content: space-between; padding-top: var(--space-2);">
              <div style="flex: 1;">
                <label class="form-label" style="margin-bottom: 0; cursor: pointer;" for="edit-acc-default">${window.I18n.t('account.setDefault')}</label>
                <p style="font-size: var(--text-xs); color: var(--text-tertiary); margin: 2px 0 0 4px;">${window.I18n.t('account.setDefaultHint')}</p>
              </div>
              <label class="toggle-switch">
                <input type="checkbox" id="edit-acc-default" ${isDefault ? 'checked' : ''}>
                <span class="slider"></span>
              </label>
            </div>
            
            <style>
              .toggle-switch { position: relative; display: inline-block; width: 50px; height: 28px; flex-shrink: 0; }
              .toggle-switch input { opacity: 0; width: 0; height: 0; }
              .toggle-switch .slider { position: absolute; cursor: pointer; top: 0; left: 0; right: 0; bottom: 0; background-color: #ccc; transition: .3s; border-radius: 34px; }
              .toggle-switch .slider:before { position: absolute; content: ""; height: 20px; width: 20px; left: 4px; bottom: 4px; background-color: white; transition: .3s; border-radius: 50%; }
              .toggle-switch input:checked + .slider { background-color: var(--color-primary); }
              .toggle-switch input:checked + .slider:before { transform: translateX(22px); }
            </style>
          </div>

          <button id="btn-edit-acc-save" class="btn btn-primary" style="width: 100%; padding: var(--space-4); font-size: 1.1rem; border-radius: var(--radius-lg); margin-bottom: 8px;">${isEdit ? window.I18n.t('account.saveChanges') : window.I18n.t('account.createAccount')}</button>

          ${isEdit ? `
          <button id="btn-edit-acc-delete" class="btn" style="width: 100%; padding: var(--space-4); color: var(--color-expense); background: var(--color-expense-bg); border-radius: var(--radius-lg); font-weight: 600;">${window.I18n.t('account.deleteAccount')}</button>
          ` : ''}

          <p class="text-secondary" style="text-align: center; font-size: var(--text-sm); margin-top: var(--space-4);">${isEdit ? window.I18n.t('account.txAssociated', { count: txCount }) : window.I18n.t('account.enterOpeningHint')}</p>
        </div>
      `;
    },

    attachEvents(container, state) {
      window.StackdHydrateIcons();
      const params = window.Router ? window.Router.getParams() : {};
      const accountId = params.id;
      const account = accountId ? state.accounts.find(a => a.id === accountId) : null;
      
      const currentOb = account ? state.transactions.find(
        t => t.accountId === account.id && t.type === 'opening_balance'
      ) : null;
      const currentObAmt = currentOb ? currentOb.amount : 0;
      let isNegativeOb = currentObAmt < 0;
      const currSym = window.Store.getCurrencySymbol();

      let selectedIcon = account ? account.icon : 'wallet';
      let selectedColor = account ? account.color : ((window.Store.ACCOUNT_COLORS || [])[state.accounts.length % (window.Store.ACCOUNT_COLORS || []).length] || '#0075EB');

      const swatches = container.querySelectorAll('.color-swatch-btn');
      swatches.forEach(btn => {
        btn.addEventListener('click', () => {
          selectedColor = btn.dataset.color;
          swatches.forEach(s => {
            const isSelected = s.dataset.color.toLowerCase() === selectedColor.toLowerCase();
            s.style.border = isSelected ? '3px solid var(--color-primary)' : '2px solid transparent';
            s.style.transform = isSelected ? 'scale(1.15)' : 'scale(1)';
            s.setAttribute('aria-checked', isSelected ? 'true' : 'false');
            s.classList.toggle('active', isSelected);
          });
        });
      });

      const iconTrigger = container.querySelector('#acc-icon-trigger');
      if (iconTrigger) {
        iconTrigger.addEventListener('click', () => {
          window.Components.IconPicker.show({
            context: 'account', // v0.66: banking icon set, disjoint from categories
            initialIcon: selectedIcon,
            onSelect: (icon) => {
              selectedIcon = icon;
              const preview = container.querySelector('#acc-icon-preview');
              if (preview) {
                preview.setAttribute('data-lucide', icon);
                window.StackdHydrateIcons();
              }
            }
          });
        });
      }

      const obInput  = document.getElementById('edit-acc-balance');
      const btnObPos = container.querySelector('#btn-ob-pos');
      const btnObNeg = container.querySelector('#btn-ob-neg');
      const obSignSymbol = container.querySelector('#ob-sign-symbol');

      const updateObSignUI = () => {
        if (btnObPos && btnObNeg) {
          if (isNegativeOb) {
            btnObNeg.style.background = 'var(--color-expense)';
            btnObNeg.style.color = 'white';
            btnObNeg.setAttribute('aria-pressed', 'true');
            btnObPos.style.background = 'transparent';
            btnObPos.style.color = 'var(--text-secondary)';
            btnObPos.setAttribute('aria-pressed', 'false');
          } else {
            btnObPos.style.background = 'var(--color-primary)';
            btnObPos.style.color = 'white';
            btnObPos.setAttribute('aria-pressed', 'true');
            btnObNeg.style.background = 'transparent';
            btnObNeg.style.color = 'var(--text-secondary)';
            btnObNeg.setAttribute('aria-pressed', 'false');
          }
        }
        if (obSignSymbol) {
          obSignSymbol.textContent = (isNegativeOb ? '-' : '') + currSym;
          obSignSymbol.style.color = isNegativeOb ? 'var(--color-expense)' : 'var(--text-tertiary)';
        }
        if (obInput) {
          obInput.style.paddingLeft = isNegativeOb ? '38px' : '30px';
          obInput.style.color = isNegativeOb ? 'var(--color-expense)' : '';
        }
      };

      if (btnObPos) {
        btnObPos.addEventListener('click', () => {
          isNegativeOb = false;
          updateObSignUI();
        });
      }

      if (btnObNeg) {
        btnObNeg.addEventListener('click', () => {
          isNegativeOb = true;
          updateObSignUI();
        });
      }

      const typeSelect = container.querySelector('#edit-acc-type');
      if (typeSelect && !account) {
        typeSelect.addEventListener('change', () => {
          if (typeSelect.value === 'Credit card') {
            isNegativeOb = true;
            updateObSignUI();
          }
        });
      }

      // Scenario A: Opening Balance edited → strict numeric input (0-9 only), right-to-left decimal shift
      if (obInput) {
        const processDecimalShift = () => {
          const rawDigits = obInput.value.replace(/\D/g, '').slice(0, 12);
          const cents = parseInt(rawDigits || '0', 10);
          const formatted = (cents / 100).toFixed(2);
          obInput.value = formatted;
          return isNegativeOb ? -(cents / 100) : (cents / 100);
        };

        // Strict numeric input: allow navigation/control keys, block non-digits (0-9 only)
        obInput.addEventListener('keydown', (e) => {
          if (
            e.key === 'Backspace' ||
            e.key === 'Delete' ||
            e.key === 'ArrowLeft' ||
            e.key === 'ArrowRight' ||
            e.key === 'Tab' ||
            e.key === 'Enter' ||
            e.key === 'Escape' ||
            e.key === 'Home' ||
            e.key === 'End' ||
            e.ctrlKey ||
            e.metaKey
          ) {
            return;
          }
          if (!/^[0-9]$/.test(e.key)) {
            e.preventDefault();
          }
        });

        // Decimal shift filling on input
        obInput.addEventListener('input', () => {
          processDecimalShift();
        });

        // Sanitize pasted content
        obInput.addEventListener('paste', (e) => {
          e.preventDefault();
          const pastedText = (e.clipboardData || window.clipboardData).getData('text');
          const pastedDigits = pastedText.replace(/\D/g, '');
          const currentDigits = obInput.value.replace(/\D/g, '');
          const combinedDigits = (currentDigits + pastedDigits).slice(0, 12);
          const cents = parseInt(combinedDigits || '0', 10);
          const formatted = (cents / 100).toFixed(2);
          obInput.value = formatted;
        });
      }

      const btnSave = document.getElementById('btn-edit-acc-save');
      if (btnSave) {
        btnSave.addEventListener('click', () => {
          const name = document.getElementById('edit-acc-name').value.trim();
          const absOb = parseFloat(document.getElementById('edit-acc-balance').value) || 0;
          const ob = isNegativeOb ? -absOb : absOb;
          const dDate = document.getElementById('edit-acc-date').value;
          const type = document.getElementById('edit-acc-type').value;
          const makeDefault = document.getElementById('edit-acc-default').checked;

          if (!name) {
            const nameInput = document.getElementById('edit-acc-name');
            nameInput.style.backgroundColor = 'var(--color-expense-bg)';
            setTimeout(() => nameInput.style.backgroundColor = '', 1000);
            return;
          }

          if (account) {
            window.Store.dispatch('UPDATE_ACCOUNT', { 
              id: account.id, 
              name, 
              openingBalance: ob, 
              openingDate: dDate,
              icon: selectedIcon,
              color: selectedColor,
              type: type
            });
            if (makeDefault) {
              window.Store.dispatch('SET_DEFAULT_ACCOUNT', account.id);
            } else if (state.defaultAccountId === account.id) {
              window.Store.dispatch('SET_DEFAULT_ACCOUNT', '');
            }
          } else {
            // New account logic needs to handle ID creation first or dispatch to a specific handler that returns the ID
            // For now, we'll just dispatch and hope for the best, or better, let the store handle it.
            const newId = window.StackdDB.generateId();
            window.Store.dispatch('ADD_ACCOUNT', { 
              id: newId,
              name, 
              openingBalance: ob, 
              openingDate: dDate,
              icon: selectedIcon,
              color: selectedColor,
              type: type
            });
            if (makeDefault) {
              window.Store.dispatch('SET_DEFAULT_ACCOUNT', newId);
            }
          }
          window.Router.navigate('#dashboard');
        });
      }

      const btnDelete = document.getElementById('btn-edit-acc-delete');
      if (btnDelete && account) {
        btnDelete.addEventListener('click', () => {
          window.Components.Modal.show({
            title: window.I18n.t('account.deleteTitle'),
            content: `<p>${window.I18n.t('account.deleteConfirm', { name: account.name })} <strong>${window.I18n.t('account.deleteWarning')}</strong></p>`,
            saveText: window.I18n.t('common.cancel'),
            showDelete: true,
            onSave: (closeModal) => closeModal(),
            onDelete: (closeModal) => {
              window.Store.dispatch('DELETE_ACCOUNT', { id: account.id });
              closeModal();
              window.Router.navigate('#dashboard');
            }
          });
          setTimeout(() => {
            const btnModalSave = document.getElementById('modal-save-btn');
            const btnModalDelete = document.getElementById('modal-delete-btn');
            if (btnModalSave) btnModalSave.className = 'btn btn-secondary';
            if (btnModalDelete) btnModalDelete.innerHTML = window.I18n.t('account.deleteEverything');
          }, 10);
        });
      }
    }
  },

  // ── Debt rebuild Phase 3 (v0.71): shared helpers for the loan views ───────
  // docs/debt-rebuild-plan.md §3 (nav conventions) + §8 Phase 3. All money
  // formatting goes through Store.formatCurrency; all math through LoanEngine.
  _DebtShared: {
    // v0.89 P8d: label holds an i18n KEY (resolved via I18n.t at render time so
    // live language switches reach these), never display text.
    TYPES: {
      mortgage: { label: 'debt.type.mortgage', icon: 'building-2' },
      personal: { label: 'debt.type.personal', icon: 'wallet' },
      installment: { label: 'debt.type.installment', icon: 'percent' }
    },

    // Working copy of the simulator form; lives outside the store so wholesale
    // re-renders can't wipe user input, and survives the form → results round
    // trip. Cleared by the form's ✕ and after a save/promote.
    draft: null,

    esc(s) {
      return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
      }[c]));
    },

    fmtC(cents) { return window.Store.formatCurrency((cents || 0) / 100); },

    fmtDate(ymd) {
      if (!ymd) return '';
      const p = ymd.split('-');
      return `${p[2]}/${p[1]}/${p[0].slice(2)}`;
    },

    durationLabel(config) {
      const key = config.durationUnit === 'months' ? 'debt.duration.months' : 'debt.duration.years';
      return window.I18n.t(key, { count: config.duration });
    },

    summary(config) {
      try {
        return window.LoanEngine.simulate({ ...config, computeSavings: false });
      } catch (e) {
        return null;
      }
    },

    todayYMD() {
      const d = new Date();
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    },

    newDraft(type, loan) {
      if (loan && loan.config) {
        const c = loan.config;
        return {
          key: 'id:' + loan.id,
          editingLoanId: loan.id,
          type: this.TYPES[c.type] ? c.type : 'personal',
          principal: c.principal != null ? String(c.principal) : '',
          downPayment: c.downPayment ? String(c.downPayment) : '',
          duration: c.duration != null ? String(c.duration) : '',
          durationUnit: c.durationUnit || 'years',
          annualRate: c.annualRate != null ? String(c.annualRate) : '',
          firstPaymentDate: c.firstPaymentDate || '',
          amortization: c.amortization || 'french',
          firstInstallmentInterestOnly: !!c.firstInstallmentInterestOnly,
          interestOnlyExtendsDuration: c.interestOnlyExtendsDuration !== false,
          rateChanges: (c.rateChanges || []).map(rc => ({ ...rc })),
          earlyRepayments: (c.earlyRepayments || []).map(er => ({ ...er })),
          additionalExpenses: (c.additionalExpenses || []).map(ex => ({ ...ex }))
        };
      }
      const t = this.TYPES[type] ? type : 'personal';
      const today = this.todayYMD();
      return {
        key: 'type:' + t,
        editingLoanId: null,
        type: t,
        principal: '',
        downPayment: '',
        duration: '',
        durationUnit: t === 'installment' ? 'months' : 'years',
        annualRate: t === 'installment' ? '0' : '',
        firstPaymentDate: window.LoanEngine.addMonthsClamped(today, 1, Number(today.slice(8, 10))),
        amortization: 'french',
        firstInstallmentInterestOnly: false,
        interestOnlyExtendsDuration: true,
        rateChanges: [],
        earlyRepayments: [],
        additionalExpenses: []
      };
    },

    // v0.71 Phase 4 ── progress + recurring-expense tracking ─────────────────

    // Never round up to "100%" while money is still owed — the figure sits
    // right next to a non-zero "remaining" and would read as a bug.
    pctLabel(progress) {
      if (!progress) return '0';
      if (progress.isPaidOff) return '100';
      return String(Math.min(99, Math.floor(progress.pct)));
    },

    progressBar(progress) {
      const pct = progress ? progress.pct : 0;
      return `
        <div style="height: 8px; border-radius: 4px; background: var(--bg-surface-sunken); overflow: hidden;">
          <div style="height: 100%; width: ${pct.toFixed(1)}%; background: var(--color-primary); border-radius: 4px; transition: width 0.3s ease;"></div>
        </div>`;
    },

    // Hands the loan's monthly payment to the normal New Log form, prefilled and
    // armed as a monthly series. The user picks the account and confirms there;
    // the store links the loan only once that series actually exists.
    // Only future, genuinely amortizing instalments can be armed: back-dating a
    // series would fabricate historical expenses, and the interest-only stub
    // would under-charge every month of the series.
    trackablePayment(progress) {
      return progress ? progress.nextRegularPayment : null;
    },

    startRecurringPrefill(loan) {
      const progress = window.Store.getLoanProgress(loan);
      const next = this.trackablePayment(progress);
      if (!next) return;
      const seriesId = window.StackdDB.generateId();
      const state = window.Store.getState();
      window.Store.dispatch('SET_PENDING_LOAN_LINK', { loanId: loan.id, seriesId });
      window._draftTxFormState = {
        type: 'expense',
        amount: (next.amountC / 100).toFixed(2),
        account: state.defaultAccountId || '',
        category: 'cat_debt',
        date: next.date,
        note: window.I18n.t('debt.paymentNote', { name: loan.name }),
        isRecurrent: true,
        recurrenceInterval: '1',
        recurrenceFreq: 'months',
        recurrenceEndDate: progress.lastPaymentDate,
        recurrenceSeriesId: seriesId
      };
      window.Router.navigate('#add');
    },

    // Offer shown right after a loan lands in My Loans, and from the loan's own
    // detail screen while it isn't tracked yet.
    offerRecurringExpense(loan) {
      const progress = window.Store.getLoanProgress(loan);
      const next = this.trackablePayment(progress);
      if (!next) return;
      const hasAccounts = (window.Store.getState().accounts || []).length > 0;

      // Payments only stay constant for plain French loans; anything that
      // reprices mid-schedule makes a fixed recurring amount an approximation.
      const varies = loan.config.amortization === 'italian'
        || loan.config.firstInstallmentInterestOnly
        || (loan.config.rateChanges || []).length > 0
        || (loan.config.earlyRepayments || []).length > 0;

      // The store clamps recurring series to 60 months (_clampRecurrenceEndDate)
      const monthsLeft = (Number(progress.lastPaymentDate.slice(0, 4)) - Number(next.date.slice(0, 4))) * 12
        + (Number(progress.lastPaymentDate.slice(5, 7)) - Number(next.date.slice(5, 7)));

      const noteLine = (text) => `<div style="font-size: var(--text-xs); color: var(--text-secondary); line-height: 1.5; margin-top: var(--space-2);">${text}</div>`;

      window.Components.Modal.show({
        title: window.I18n.t('debt.track.title'),
        content: `
          <p style="font-size: var(--text-sm); color: var(--text-secondary); line-height: 1.6; margin: 0 0 var(--space-3);">
            ${window.I18n.t('debt.track.body', {
              amount: `<strong style="color: var(--text-primary);">${this.fmtC(next.amountC)}</strong>`,
              date: this.fmtDate(next.date),
              name: this.esc(loan.name)
            })}
          </p>
          ${hasAccounts ? '' : noteLine(window.I18n.t('debt.track.needAccount'))}
          ${varies ? noteLine(window.I18n.t('debt.track.varies')) : ''}
          ${monthsLeft > 60 ? noteLine(window.I18n.t('debt.track.capped')) : ''}
        `,
        saveText: hasAccounts ? window.I18n.t('debt.track.cta') : window.I18n.t('common.ok'),
        onSave: (close) => {
          close();
          if (hasAccounts) this.startRecurringPrefill(loan);
        }
      });
    },

    buildConfig(d) {
      const num = (v) => { const n = parseFloat(v); return isNaN(n) ? 0 : n; };
      return {
        type: d.type,
        principal: num(d.principal),
        downPayment: d.type === 'mortgage' ? num(d.downPayment) : 0,
        duration: parseInt(d.duration, 10) || 0,
        durationUnit: d.durationUnit,
        annualRate: num(d.annualRate),
        firstPaymentDate: d.firstPaymentDate,
        amortization: d.amortization,
        firstInstallmentInterestOnly: d.firstInstallmentInterestOnly,
        interestOnlyExtendsDuration: d.interestOnlyExtendsDuration,
        rateChanges: d.rateChanges.map(rc => ({ ...rc })),
        earlyRepayments: d.earlyRepayments.map(er => ({ ...er })),
        additionalExpenses: d.additionalExpenses.map(ex => ({ ...ex }))
      };
    }
  },

  // ── Hub: type tiles + saved simulations + tracked loans (#debt) ───────────
  DebtHubView: {
    render(state) {
      const S = window.Views._DebtShared;
      const loans = state.loans || [];
      const sims = loans.filter(l => l.kind === 'sim');
      const active = loans.filter(l => l.kind !== 'sim');

      const tile = (type, extraStyle) => {
        const t = S.TYPES[type];
        return `
          <div class="card debt-type-tile" data-type="${type}" role="button" tabindex="0" aria-label="${window.I18n.t('debt.simulateAria', { type: window.I18n.t(t.label) })}" style="cursor: pointer; display: flex; align-items: center; gap: var(--space-3); ${extraStyle || ''}">
            <div class="list-item-icon" style="flex-shrink: 0;"><i data-lucide="${t.icon}"></i></div>
            <div>
              <div style="font-weight: 700; font-size: var(--text-sm);">${window.I18n.t(t.label)}</div>
              <div style="color: var(--text-tertiary); font-size: var(--text-xs);">${window.I18n.t('debt.simulate')}</div>
            </div>
          </div>`;
      };

      const loanRow = (loan, cssClass) => {
        const t = S.TYPES[(loan.config && loan.config.type)] || S.TYPES.personal;
        const sum = loan.config ? S.summary(loan.config) : null;
        const subtitle = sum
          ? `${S.fmtC(sum.financedPrincipalC)} · ${loan.config.annualRate}% · ${S.durationLabel(loan.config)}`
          : window.I18n.t('debt.invalidConfig');
        const value = sum
          ? `${S.fmtC(sum.initialPaymentC)}<div style="font-size: var(--text-xs); color: var(--text-tertiary); font-weight: 500; text-align: right;">${window.I18n.t('debt.perMonth')}</div>`
          : '—';
        return `
          <div class="list-item ${cssClass}" data-id="${loan.id}" role="button" tabindex="0" style="cursor: pointer;">
            <div class="list-item-icon"><i data-lucide="${t.icon}"></i></div>
            <div class="list-item-content">
              <div class="list-item-title">${S.esc(loan.name)}</div>
              <div class="list-item-subtitle">${subtitle}</div>
            </div>
            <div class="list-item-value">${value}</div>
          </div>`;
      };

      // v0.71 Phase 4: tracked loans get amortized paid/remaining progress
      const activeCard = (loan) => {
        const t = S.TYPES[(loan.config && loan.config.type)] || S.TYPES.personal;
        const p = window.Store.getLoanProgress(loan);
        if (!p) return loanRow(loan, 'debt-loan-item');
        const tracked = !!window.Store.getLoanLinkedTransactions(loan);
        return `
          <div class="card debt-loan-item" data-id="${loan.id}" role="button" tabindex="0" style="cursor: pointer; margin-bottom: var(--space-3);">
            <div style="display: flex; align-items: center; gap: var(--space-3); margin-bottom: var(--space-3);">
              <div class="list-item-icon" style="flex-shrink: 0;"><i data-lucide="${t.icon}"></i></div>
              <div style="flex: 1; min-width: 0;">
                <div class="list-item-title" style="display: flex; align-items: center; gap: 6px;">
                  ${S.esc(loan.name)}
                  ${tracked ? `<span class="debt-tracked-badge" title="${window.I18n.t('debt.trackedBadge')}" aria-label="${window.I18n.t('debt.trackedBadge')}" style="display: inline-flex; color: var(--text-tertiary);"><i data-lucide="refresh-cw" style="width: 13px; height: 13px;"></i></span>` : ''}
                </div>
                <div class="list-item-subtitle">${p.isPaidOff ? window.I18n.t('debt.paidOff') : window.I18n.t('debt.nextShort', { amount: S.fmtC(p.nextPayment ? p.nextPayment.amountC : p.initialPaymentC), date: S.fmtDate(p.nextPayment ? p.nextPayment.date : p.lastPaymentDate) })}</div>
              </div>
              <div style="text-align: right; flex-shrink: 0;">
                <div style="font-family: var(--font-family-display); font-weight: 700;">${S.pctLabel(p)}%</div>
                <div style="font-size: var(--text-xs); color: var(--text-tertiary);">${p.paidCount}/${p.totalCount}</div>
              </div>
            </div>
            ${S.progressBar(p)}
            <div style="display: flex; justify-content: space-between; margin-top: 6px; font-size: var(--text-xs); color: var(--text-secondary);">
              <span>${window.I18n.t('debt.amountPaid', { amount: S.fmtC(p.paidPrincipalC) })}</span>
              <span>${window.I18n.t('debt.amountRemaining', { amount: S.fmtC(p.remainingC) })}</span>
            </div>
          </div>`;
      };

      const simsHtml = sims.length ? `
        <div class="section-title" style="margin-top: var(--space-6);">${window.I18n.t('debt.simulations')}</div>
        ${sims.map(l => loanRow(l, 'debt-sim-item')).join('')}
      ` : '';

      const activeHtml = `
        <div class="section-title" style="margin-top: var(--space-6);">${window.I18n.t('debt.myLoans')}</div>
        ${active.length
          ? active.map(l => activeCard(l)).join('')
          : `<div class="card" id="debt-loans-empty" style="text-align: center; padding: var(--space-6) var(--space-4);">
               <div style="color: var(--text-secondary); font-size: var(--text-sm); max-width: 320px; margin: 0 auto;">${window.I18n.t('debt.noActiveLoans')}</div>
             </div>`}
      `;

      return `
        <div id="debt-hub" class="container" style="padding-bottom: 100px;">
          <a href="#dashboard" class="touch-target" style="display: inline-flex; align-items: center; gap: 4px; color: var(--text-secondary); text-decoration: none; font-size: var(--text-sm); margin-bottom: var(--space-2); margin-top: var(--space-2);" aria-label="${window.I18n.t('debt.backToDashboardAria')}"><i data-lucide="chevron-left" style="width: 16px; height: 16px;"></i> ${window.I18n.t('nav.dashboard')}</a>
          <h1 class="page-header-title" style="margin-bottom: var(--space-1);">${window.I18n.t('debt.loans')}</h1>
          <div style="color: var(--text-secondary); font-size: var(--text-sm); margin-bottom: var(--space-5);">${window.I18n.t('debt.hubSubtitle')}</div>
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-3);">
            ${tile('mortgage')}
            ${tile('personal')}
            ${tile('installment', 'grid-column: 1 / -1;')}
          </div>
          ${simsHtml}
          ${activeHtml}
        </div>
      `;
    },

    attachEvents(container) {
      const nav = (el, href) => {
        const go = () => window.Router.navigate(href);
        el.addEventListener('click', go);
        el.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } });
      };
      container.querySelectorAll('.debt-type-tile').forEach(el => nav(el, `#debt-sim?type=${el.dataset.type}`));
      container.querySelectorAll('.debt-sim-item, .debt-loan-item').forEach(el => nav(el, `#debt-results?id=${el.dataset.id}`));
      if (window.StackdHydrateIcons) window.StackdHydrateIcons();
    }
  },

  // ── Simulator form (#debt-sim?type=… | ?id=…) ─────────────────────────────
  DebtSimView: {
    render(state) {
      const S = window.Views._DebtShared;
      const params = window.Router.getParams();
      const key = params.id ? 'id:' + params.id : 'type:' + (params.type || 'personal');
      if (!S.draft || S.draft.key !== key) {
        const loan = params.id ? (state.loans || []).find(l => l.id === params.id) : null;
        S.draft = S.newDraft(params.type, loan);
      }
      const d = S.draft;
      const title = d.editingLoanId ? window.I18n.t('debt.editSimulation') : window.I18n.t(S.TYPES[d.type].label);

      return `
        <div id="debt-sim-form" class="container" style="padding-bottom: 100px;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-top: var(--space-4); margin-bottom: var(--space-6);">
            <h1 class="header-title" style="margin: 0;">${title}</h1>
            <a href="#debt" id="dsim-close" aria-label="${window.I18n.t('debt.closeSimAria')}" style="color: var(--text-secondary); width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; background: var(--bg-surface); border-radius: 10px; text-decoration: none;">✕</a>
          </div>

          <div class="amount-input-group">
            <span style="color: var(--text-tertiary); font-size: var(--text-2xl); font-family: var(--font-family-display);" aria-hidden="true">${window.Store.getCurrencySymbol()}</span>
            <label for="dsim-principal" class="sr-only">${window.I18n.t('debt.loanAmount')}</label>
            <input type="number" id="dsim-principal" class="amount-input text-expense" placeholder="0.00" step="0.01" inputmode="decimal" value="${d.principal}" style="width: auto; max-width: 220px;">
          </div>

          <div class="card" style="margin-bottom: var(--space-4);">
            ${d.type === 'mortgage' ? `
              <div class="form-group">
                <label class="form-label" for="dsim-down">${window.I18n.t('debt.downPayment')} <span id="dsim-down-pct" style="color: var(--text-tertiary); font-weight: 500;"></span></label>
                <input type="number" id="dsim-down" class="form-control" placeholder="0.00" step="0.01" inputmode="decimal" value="${d.downPayment}">
              </div>` : ''}
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-3);">
              <div class="form-group">
                <label class="form-label" for="dsim-duration">${window.I18n.t('debt.durationLabel')}</label>
                <input type="number" id="dsim-duration" class="form-control" placeholder="${window.I18n.t('debt.durationPlaceholder')}" step="1" inputmode="numeric" value="${d.duration}">
              </div>
              <div class="form-group">
                <label class="form-label" for="dsim-duration-unit">${window.I18n.t('debt.unit')}</label>
                <select id="dsim-duration-unit" class="form-control" style="appearance: none;">
                  <option value="years" ${d.durationUnit === 'years' ? 'selected' : ''}>${window.I18n.t('debt.unitYears')}</option>
                  <option value="months" ${d.durationUnit === 'months' ? 'selected' : ''}>${window.I18n.t('debt.unitMonths')}</option>
                </select>
              </div>
            </div>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-3);">
              <div class="form-group" style="margin-bottom: 0;">
                <label class="form-label" for="dsim-rate">${window.I18n.t('debt.annualRate')}</label>
                <input type="number" id="dsim-rate" class="form-control" placeholder="${window.I18n.t('debt.ratePlaceholder')}" step="0.01" inputmode="decimal" value="${d.annualRate}">
              </div>
              <div class="form-group" style="margin-bottom: 0;">
                <label class="form-label" for="dsim-first-date">${window.I18n.t('debt.firstPayment')}</label>
                <input type="date" id="dsim-first-date" class="form-control" value="${d.firstPaymentDate}">
              </div>
            </div>
          </div>

          <div class="card" style="margin-bottom: var(--space-6);">
            <div id="dsim-details-toggle" role="button" tabindex="0" aria-expanded="false" style="display: flex; justify-content: space-between; align-items: center; cursor: pointer;">
              <span style="font-weight: 700;">${window.I18n.t('debt.details')}</span>
              <i data-lucide="chevron-down" id="dsim-details-chevron" style="width: 20px; height: 20px; color: var(--text-tertiary); transition: transform 0.2s;"></i>
            </div>
            <div id="dsim-details-body" style="display: none; padding-top: var(--space-3);">
              <div class="form-group">
                <label class="form-label">${window.I18n.t('debt.paymentType')}</label>
                <div class="chart-toggle-group" id="dsim-amortization">
                  <button type="button" class="chart-toggle-btn ${d.amortization === 'french' ? 'active' : ''}" data-amort="french">${window.I18n.t('debt.amortFrench')}</button>
                  <button type="button" class="chart-toggle-btn ${d.amortization === 'italian' ? 'active' : ''}" data-amort="italian">${window.I18n.t('debt.amortItalian')}</button>
                </div>
              </div>
              <div style="display: flex; justify-content: space-between; align-items: center; gap: var(--space-3); padding: var(--space-2) 0;">
                <span style="font-size: var(--text-sm); font-weight: 600;">${window.I18n.t('debt.ioFirst')}</span>
                <label class="toggle-switch"><input type="checkbox" id="dsim-io" ${d.firstInstallmentInterestOnly ? 'checked' : ''}><span class="slider"></span></label>
              </div>
              <div id="dsim-io-extend-row" style="display: ${d.firstInstallmentInterestOnly ? 'flex' : 'none'}; justify-content: space-between; align-items: center; gap: var(--space-3); padding: var(--space-2) 0;">
                <span style="font-size: var(--text-sm); font-weight: 600; display: inline-flex; align-items: center; gap: 6px;">${window.I18n.t('debt.ioNoExtend')}
                  <i data-lucide="info" id="dsim-io-info" style="width: 16px; height: 16px; color: var(--text-tertiary); cursor: pointer;" role="button" tabindex="0" aria-label="${window.I18n.t('debt.ioInfoAria')}"></i>
                </span>
                <label class="toggle-switch"><input type="checkbox" id="dsim-io-noextend" ${d.interestOnlyExtendsDuration ? '' : 'checked'}><span class="slider"></span></label>
              </div>
              <div id="dsim-lists"></div>
            </div>
          </div>

          <div id="dsim-error" role="alert" style="display: none; color: var(--color-expense-val); font-size: var(--text-sm); font-weight: 600; margin-bottom: var(--space-3); text-align: center;"></div>
          <button class="btn btn-primary" id="btn-dsim-calculate" style="padding: var(--space-4); border-radius: var(--radius-lg);">${window.I18n.t('debt.calculate')}</button>
        </div>
      `;
    },

    attachEvents(container) {
      const S = window.Views._DebtShared;
      const d = S.draft;
      const $ = (id) => container.querySelector('#' + id);

      // ✕ discards the working draft
      $('dsim-close').addEventListener('click', () => { S.draft = null; });

      const updateDownPct = () => {
        const pctEl = $('dsim-down-pct');
        if (!pctEl) return;
        const p = parseFloat(d.principal), dp = parseFloat(d.downPayment);
        pctEl.textContent = p > 0 && dp > 0 ? `(${(dp / p * 100).toFixed(1)}%)` : '';
      };
      const bind = (id, prop, evt = 'input') => {
        const el = $(id);
        if (el) el.addEventListener(evt, () => { d[prop] = el.value; updateDownPct(); });
      };
      bind('dsim-principal', 'principal');
      bind('dsim-down', 'downPayment');
      bind('dsim-duration', 'duration');
      bind('dsim-rate', 'annualRate');
      bind('dsim-first-date', 'firstPaymentDate', 'change');
      bind('dsim-duration-unit', 'durationUnit', 'change');
      updateDownPct();

      // Details collapse (pure DOM, no re-render)
      const detailsBody = $('dsim-details-body');
      const detailsToggle = $('dsim-details-toggle');
      const toggleDetails = () => {
        const open = detailsBody.style.display !== 'none';
        detailsBody.style.display = open ? 'none' : 'block';
        detailsToggle.setAttribute('aria-expanded', String(!open));
        const chev = $('dsim-details-chevron');
        if (chev) chev.style.transform = open ? '' : 'rotate(180deg)';
      };
      detailsToggle.addEventListener('click', toggleDetails);
      detailsToggle.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleDetails(); } });

      container.querySelectorAll('#dsim-amortization .chart-toggle-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          d.amortization = btn.dataset.amort;
          container.querySelectorAll('#dsim-amortization .chart-toggle-btn').forEach(b => b.classList.toggle('active', b === btn));
        });
      });

      $('dsim-io').addEventListener('change', (e) => {
        d.firstInstallmentInterestOnly = e.target.checked;
        $('dsim-io-extend-row').style.display = e.target.checked ? 'flex' : 'none';
      });
      $('dsim-io-noextend').addEventListener('change', (e) => {
        d.interestOnlyExtendsDuration = !e.target.checked;
      });
      $('dsim-io-info').addEventListener('click', () => {
        window.Components.Modal.show({
          title: window.I18n.t('debt.ioModalTitle'),
          content: `<p style="font-size: var(--text-sm); color: var(--text-secondary); line-height: 1.6; margin: 0;">${window.I18n.t('debt.ioModalBody')}</p>`,
          saveText: window.I18n.t('common.ok'),
          onSave: (close) => close()
        });
      });

      // ── Dynamic lists: rate changes / early repayments / extra costs ──────
      const listsEl = $('dsim-lists');
      const ER_MODE_LABEL = { reducePayment: window.I18n.t('debt.erModeReducePayment'), reduceDuration: window.I18n.t('debt.erModeReduceDuration') };

      const listRow = (text, listName, i) => `
        <div style="display: flex; justify-content: space-between; align-items: center; gap: var(--space-2); padding: var(--space-2) 0; border-bottom: 1px solid var(--border-color);">
          <span style="font-size: var(--text-sm);">${text}</span>
          <button type="button" class="dsim-remove touch-target" data-list="${listName}" data-i="${i}" aria-label="${window.I18n.t('debt.removeEntry')}" style="background: none; border: none; color: var(--text-tertiary); cursor: pointer; display: flex; align-items: center;"><i data-lucide="trash-2" style="width: 16px; height: 16px;"></i></button>
        </div>`;

      const addBtn = (kind, label) => `<button type="button" class="btn btn-secondary dsim-add" data-add="${kind}" style="min-height: 40px; font-size: var(--text-sm); margin-top: var(--space-2);">+ ${label}</button>`;

      const renderLists = () => {
        listsEl.innerHTML = `
          <div class="form-label" style="margin-top: var(--space-3);">${window.I18n.t('debt.rateChanges')}</div>
          ${d.rateChanges.map((rc, i) => listRow(window.I18n.t('debt.rateChangeRow', { rate: rc.annualRate, date: S.fmtDate(rc.effectiveFrom) }), 'rateChanges', i)).join('')}
          ${addBtn('rate', window.I18n.t('debt.addRateChange'))}
          <div class="form-label" style="margin-top: var(--space-4);">${window.I18n.t('debt.earlyRepayments')}</div>
          ${d.earlyRepayments.map((er, i) => listRow(window.I18n.t(er.frequency === 'monthly' ? 'debt.erRowMonthly' : 'debt.erRowOnce', { amount: window.Store.formatCurrency(er.amount), date: S.fmtDate(er.date), mode: ER_MODE_LABEL[er.mode] }), 'earlyRepayments', i)).join('')}
          ${addBtn('er', window.I18n.t('debt.addEarlyRepayment'))}
          <div class="form-label" style="margin-top: var(--space-4);">${window.I18n.t('debt.extraCosts')}</div>
          ${d.additionalExpenses.map((ex, i) => listRow(window.I18n.t(ex.frequency === 'monthly' ? 'debt.exRowMonthly' : 'debt.exRowOnce', { name: S.esc(ex.name), amount: window.Store.formatCurrency(ex.amount), date: S.fmtDate(ex.date) }), 'additionalExpenses', i)).join('')}
          ${addBtn('expense', window.I18n.t('debt.addExtraCost'))}
        `;
        listsEl.querySelectorAll('.dsim-remove').forEach(btn => {
          btn.addEventListener('click', () => {
            d[btn.dataset.list].splice(Number(btn.dataset.i), 1);
            renderLists();
          });
        });
        listsEl.querySelectorAll('.dsim-add').forEach(btn => {
          btn.addEventListener('click', () => openAddModal(btn.dataset.add));
        });
        if (window.StackdHydrateIcons) window.StackdHydrateIcons();
      };

      const openAddModal = (kind) => {
        if (kind === 'rate') {
          window.Components.Modal.show({
            title: window.I18n.t('debt.addRateChangeTitle'),
            content: `
              <div class="form-group"><label class="form-label" for="dsim-rc-rate">${window.I18n.t('debt.newRate')}</label><input type="number" id="dsim-rc-rate" class="form-control" step="0.01" inputmode="decimal" placeholder="${window.I18n.t('debt.newRatePlaceholder')}"></div>
              <div class="form-group"><label class="form-label" for="dsim-rc-date">${window.I18n.t('debt.effectiveFrom')}</label><input type="date" id="dsim-rc-date" class="form-control" value="${d.firstPaymentDate}"></div>`,
            saveText: window.I18n.t('common.add'),
            onSave: (close) => {
              const rate = parseFloat(document.getElementById('dsim-rc-rate').value);
              const date = document.getElementById('dsim-rc-date').value;
              if (isNaN(rate) || rate < 0 || rate >= 100 || !date) return;
              d.rateChanges.push({ annualRate: rate, effectiveFrom: date });
              close();
              renderLists();
            }
          });
        } else if (kind === 'er') {
          window.Components.Modal.show({
            title: window.I18n.t('debt.addEarlyRepaymentTitle'),
            content: `
              <div class="form-group"><label class="form-label" for="dsim-er-amount">${window.I18n.t('form.amount')}</label><input type="number" id="dsim-er-amount" class="form-control" step="0.01" inputmode="decimal" placeholder="0.00"></div>
              <div class="form-group"><label class="form-label" for="dsim-er-freq">${window.I18n.t('debt.frequency')}</label>
                <select id="dsim-er-freq" class="form-control" style="appearance: none;">
                  <option value="once">${window.I18n.t('debt.freqOnce')}</option>
                  <option value="monthly">${window.I18n.t('debt.freqMonthly')}</option>
                </select></div>
              <div class="form-group"><label class="form-label" for="dsim-er-date">${window.I18n.t('debt.paymentDate')}</label><input type="date" id="dsim-er-date" class="form-control" value="${d.firstPaymentDate}"></div>
              <div class="form-group" id="dsim-er-end-group" style="display: none;"><label class="form-label" for="dsim-er-end">${window.I18n.t('debt.untilOptional')}</label><input type="date" id="dsim-er-end" class="form-control"></div>
              <div class="form-group" style="margin-bottom: 0;"><label class="form-label" for="dsim-er-mode">${window.I18n.t('debt.repaymentType')}</label>
                <select id="dsim-er-mode" class="form-control" style="appearance: none;">
                  <option value="reducePayment">${window.I18n.t('debt.modeReducePayment')}</option>
                  <option value="reduceDuration">${window.I18n.t('debt.modeReduceDuration')}</option>
                </select></div>`,
            saveText: window.I18n.t('common.add'),
            onSave: (close) => {
              const amount = parseFloat(document.getElementById('dsim-er-amount').value);
              const frequency = document.getElementById('dsim-er-freq').value;
              const date = document.getElementById('dsim-er-date').value;
              const endDate = document.getElementById('dsim-er-end').value || null;
              const mode = document.getElementById('dsim-er-mode').value;
              if (isNaN(amount) || amount <= 0 || !date) return;
              const er = { amount, frequency, date, mode };
              if (frequency === 'monthly' && endDate) er.endDate = endDate;
              d.earlyRepayments.push(er);
              close();
              renderLists();
            }
          });
          setTimeout(() => {
            const freqSel = document.getElementById('dsim-er-freq');
            if (freqSel) freqSel.addEventListener('change', () => {
              document.getElementById('dsim-er-end-group').style.display = freqSel.value === 'monthly' ? 'block' : 'none';
            });
          }, 20);
        } else if (kind === 'expense') {
          window.Components.Modal.show({
            title: window.I18n.t('debt.addExtraCostTitle'),
            content: `
              <div class="form-group"><label class="form-label" for="dsim-ex-name">${window.I18n.t('common.name')}</label><input type="text" id="dsim-ex-name" class="form-control" placeholder="${window.I18n.t('debt.insurancePlaceholder')}"></div>
              <div class="form-group"><label class="form-label" for="dsim-ex-amount">${window.I18n.t('form.amount')}</label><input type="number" id="dsim-ex-amount" class="form-control" step="0.01" inputmode="decimal" placeholder="0.00"></div>
              <div class="form-group"><label class="form-label" for="dsim-ex-freq">${window.I18n.t('debt.frequency')}</label>
                <select id="dsim-ex-freq" class="form-control" style="appearance: none;">
                  <option value="once">${window.I18n.t('debt.freqOnce')}</option>
                  <option value="monthly">${window.I18n.t('debt.freqMonthly')}</option>
                </select></div>
              <div class="form-group" id="dsim-ex-date-group" style="margin-bottom: 0;"><label class="form-label" for="dsim-ex-date">${window.I18n.t('debt.paymentDate')}</label><input type="date" id="dsim-ex-date" class="form-control" value="${d.firstPaymentDate}"></div>`,
            saveText: window.I18n.t('common.add'),
            onSave: (close) => {
              const name = document.getElementById('dsim-ex-name').value.trim();
              const amount = parseFloat(document.getElementById('dsim-ex-amount').value);
              const frequency = document.getElementById('dsim-ex-freq').value;
              const date = document.getElementById('dsim-ex-date').value;
              if (!name || isNaN(amount) || amount < 0) return;
              const ex = { name, amount, frequency };
              if (frequency === 'once' && date) ex.date = date;
              d.additionalExpenses.push(ex);
              close();
              renderLists();
            }
          });
          setTimeout(() => {
            const freqSel = document.getElementById('dsim-ex-freq');
            if (freqSel) freqSel.addEventListener('change', () => {
              document.getElementById('dsim-ex-date-group').style.display = freqSel.value === 'once' ? 'block' : 'none';
            });
          }, 20);
        }
      };

      renderLists();

      // keep Details open when the draft already has advanced entries
      if (d.rateChanges.length || d.earlyRepayments.length || d.additionalExpenses.length ||
          d.firstInstallmentInterestOnly || d.amortization !== 'french') {
        toggleDetails();
      }

      $('btn-dsim-calculate').addEventListener('click', () => {
        const errEl = $('dsim-error');
        errEl.style.display = 'none';
        const config = S.buildConfig(d);
        try {
          window.LoanEngine.simulate({ ...config, computeSavings: false });
        } catch (e) {
          errEl.textContent = (e && e.name === 'LoanEngineError') ? e.message : window.I18n.t('debt.checkInputs');
          errEl.style.display = 'block';
          return;
        }
        window.Store.dispatch('SET_DEBT_SIM', { config, fromForm: true, editingLoanId: d.editingLoanId });
        window.Router.navigate('#debt-results');
      });

      if (window.StackdHydrateIcons) window.StackdHydrateIcons();
    }
  },

  // ── Results: summary + savings + schedule (#debt-results[?id=…]) ──────────
  DebtResultsView: {
    // v0.71 Phase 4: the offer floats above the hub the user just landed on.
    // #modal-container lives outside #router-view, so the pending re-render
    // can't clobber it; the delay just lets the hub paint first.
    _offerAfterPromote(loanId) {
      setTimeout(() => {
        const loan = (window.Store.getState().loans || []).find(l => l.id === loanId);
        // offerRecurringExpense itself no-ops when there is nothing trackable
        // left (finished loans), so this only guards the already-linked case.
        if (loan && !loan.linkedSeriesId) window.Views._DebtShared.offerRecurringExpense(loan);
      }, 60);
    },

    _resolve(state) {
      const params = window.Router.getParams();
      const out = { loan: null, config: null, name: null, fromForm: false, editingLoanId: null, res: null, error: null };
      if (params.id) {
        out.loan = (state.loans || []).find(l => l.id === params.id) || null;
        if (out.loan) { out.config = out.loan.config; out.name = out.loan.name; }
      } else if (state.debtSim && state.debtSim.config) {
        out.config = state.debtSim.config;
        out.fromForm = !!state.debtSim.fromForm;
        out.editingLoanId = state.debtSim.editingLoanId || null;
      }
      if (out.config) {
        try { out.res = window.LoanEngine.simulate(out.config); } catch (e) { out.error = e; }
      }
      return out;
    },

    render(state) {
      const S = window.Views._DebtShared;
      const r = this._resolve(state);

      if (!r.config || r.error) {
        const msg = r.error ? window.I18n.t('debt.computeError', { message: S.esc(r.error.message) }) : window.I18n.t('debt.nothingToShow');
        return `
          <div id="debt-results-view" class="container">
            <div class="card" style="text-align: center; padding: var(--space-8) var(--space-4); margin-top: var(--space-8);">
              <div style="color: var(--text-secondary); font-size: var(--text-sm); margin-bottom: var(--space-4);">${msg}</div>
              <a href="#debt" class="btn btn-primary" style="text-decoration: none;">${window.I18n.t('debt.backToLoans')}</a>
            </div>
          </div>`;
      }

      const res = r.res;
      const config = r.config;
      const t = S.TYPES[config.type] || S.TYPES.personal;
      const backHref = r.fromForm && S.draft
        ? (S.draft.editingLoanId ? `#debt-sim?id=${S.draft.editingLoanId}` : `#debt-sim?type=${S.draft.type}`)
        : '#debt';

      const row = (label, value, opts = {}) => `
        <div style="display: flex; justify-content: space-between; align-items: baseline; gap: var(--space-3); padding: var(--space-2) 0; ${opts.last ? '' : 'border-bottom: 1px solid var(--border-color);'}">
          <span style="font-size: var(--text-sm); color: var(--text-secondary);">${label}</span>
          <span style="font-family: var(--font-family-display); font-weight: 700; ${opts.strong ? 'font-size: var(--text-xl);' : ''}">${value}</span>
        </div>`;

      let savingsHtml = '';
      if (res.savings && res.totalEarlyRepaymentsC > 0) {
        savingsHtml = res.savings.degenerate
          ? `<div class="card" style="margin-top: var(--space-4); background: var(--color-warning-bg); border-color: transparent;">
               <div style="font-size: var(--text-sm); color: var(--color-warning-text); line-height: 1.5;">${window.I18n.t('debt.savingsDegenerate')}</div>
             </div>`
          : `<div class="card" style="margin-top: var(--space-4);">
               <div class="section-title" style="margin-bottom: var(--space-2);">${window.I18n.t('debt.withEarlyRepayments')}</div>
               ${row(window.I18n.t('debt.interestSaved'), S.fmtC(res.savings.interestSavedC), res.savings.monthsSaved > 0 ? {} : { last: true })}
               ${res.savings.monthsSaved > 0 ? row(window.I18n.t('debt.monthsSaved'), String(res.savings.monthsSaved), { last: true }) : ''}
             </div>`;
      }

      const actionsHtml = r.fromForm
        ? `<div style="display: flex; flex-direction: column; gap: var(--space-3); margin-top: var(--space-6);">
             <button class="btn btn-primary" id="btn-dres-promote" style="padding: var(--space-4); border-radius: var(--radius-lg);">${window.I18n.t('debt.addToMyLoans')}</button>
             <button class="btn btn-secondary" id="btn-dres-save">${r.editingLoanId ? window.I18n.t('debt.updateSimulation') : window.I18n.t('debt.saveSimulation')}</button>
           </div>`
        : '';

      // v0.71 Phase 4: tracked loans show live progress and the recurring link
      let progressHtml = '';
      if (r.loan && r.loan.kind === 'active') {
        const p = window.Store.getLoanProgress(r.loan);
        if (p) {
          const tracked = !!window.Store.getLoanLinkedTransactions(r.loan);
          progressHtml = `
            <div class="card" id="dres-progress" style="margin-top: var(--space-4);">
              <div class="section-title" style="margin-bottom: var(--space-3);">${window.I18n.t('debt.progress')}</div>
              <div style="display: flex; justify-content: space-between; align-items: baseline; margin-bottom: var(--space-2);">
                <span style="font-family: var(--font-family-display); font-size: var(--text-xl); font-weight: 700;">${S.pctLabel(p)}%</span>
                <span style="font-size: var(--text-sm); color: var(--text-secondary);">${window.I18n.t('debt.paymentsOf', { paid: p.paidCount, total: p.totalCount })}</span>
              </div>
              ${S.progressBar(p)}
              <div style="display: flex; justify-content: space-between; margin-top: 6px; font-size: var(--text-xs); color: var(--text-secondary);">
                <span>${window.I18n.t('debt.amountPaid', { amount: S.fmtC(p.paidPrincipalC) })}</span>
                <span>${window.I18n.t('debt.amountRemaining', { amount: S.fmtC(p.remainingC) })}</span>
              </div>
              ${p.nextPayment ? `
                <div style="display: flex; justify-content: space-between; align-items: baseline; padding-top: var(--space-3); margin-top: var(--space-3); border-top: 1px solid var(--border-color);">
                  <span style="font-size: var(--text-sm); color: var(--text-secondary);">${window.I18n.t('debt.nextPaymentLabel')}</span>
                  <span style="font-family: var(--font-family-display); font-weight: 700;">${S.fmtC(p.nextPayment.amountC)} · ${S.fmtDate(p.nextPayment.date)}</span>
                </div>` : ''}
              ${tracked || S.trackablePayment(p) ? `
                <div style="padding-top: var(--space-3); margin-top: var(--space-3); border-top: 1px solid var(--border-color);">
                  ${tracked
                    ? `<div id="dres-tracked" style="display: flex; align-items: center; gap: var(--space-2); font-size: var(--text-sm); color: var(--text-secondary);">
                         <i data-lucide="refresh-cw" style="width: 16px; height: 16px;"></i>
                         <span style="flex: 1;">${window.I18n.t('debt.trackedMonthly')}</span>
                         <a href="#transactions" style="color: var(--color-accent); font-weight: 600; text-decoration: underline;">${window.I18n.t('common.view')}</a>
                       </div>`
                    : `<button class="btn btn-secondary" id="btn-dres-track" style="min-height: 44px; font-size: var(--text-sm);">${window.I18n.t('debt.trackMonthly')}</button>`}
                </div>` : ''}
            </div>`;
        }
      }

      return `
        <div id="debt-results-view" class="container" style="padding-bottom: 100px;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-top: var(--space-4); margin-bottom: var(--space-6);">
            <h1 class="header-title" style="margin: 0; font-size: var(--text-2xl);">${r.name ? S.esc(r.name) : window.I18n.t(t.label)}</h1>
            <div style="display: flex; gap: var(--space-2);">
              ${r.loan ? `<button id="btn-dres-menu" aria-label="${window.I18n.t('common.moreActions')}" style="color: var(--text-secondary); width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; background: var(--bg-surface); border: none; border-radius: 10px; cursor: pointer;"><i data-lucide="more-horizontal" style="width: 18px; height: 18px;"></i></button>` : ''}
              <a href="${backHref}" aria-label="${window.I18n.t('debt.closeResultsAria')}" style="color: var(--text-secondary); width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; background: var(--bg-surface); border-radius: 10px; text-decoration: none;">✕</a>
            </div>
          </div>

          <div style="display: flex; align-items: center; gap: var(--space-3); margin-bottom: var(--space-4);">
            <div class="list-item-icon"><i data-lucide="${t.icon}"></i></div>
            <div style="color: var(--text-secondary); font-size: var(--text-sm);">${window.I18n.t(t.label)} · ${config.annualRate}% · ${S.durationLabel(config)}</div>
          </div>

          <div class="card card-elevated">
            ${row(window.I18n.t('debt.monthlyPayment'), S.fmtC(res.initialPaymentC), { strong: true })}
            ${row(window.I18n.t('debt.loanAmount'), S.fmtC(res.financedPrincipalC))}
            ${res.downPaymentC > 0 ? row(window.I18n.t('debt.downPayment'), S.fmtC(res.downPaymentC)) : ''}
            ${row(window.I18n.t('debt.totalInterest'), S.fmtC(res.totalInterestC))}
            ${res.totalExpensesC > 0 ? row(window.I18n.t('debt.extraCosts'), S.fmtC(res.totalExpensesC)) : ''}
            ${res.totalEarlyRepaymentsC > 0 ? row(window.I18n.t('debt.earlyRepayments'), S.fmtC(res.totalEarlyRepaymentsC)) : ''}
            ${row(window.I18n.t('debt.totalAmount'), S.fmtC(res.grandTotalC))}
            ${row(window.I18n.t('debt.installments'), String(res.installmentCount))}
            ${row(window.I18n.t('debt.lastPayment'), S.fmtDate(res.lastPaymentDate), { last: true })}
          </div>

          ${progressHtml}
          ${savingsHtml}

          <div class="card" style="margin-top: var(--space-4);">
            <div id="dres-schedule-toggle" role="button" tabindex="0" aria-expanded="false" style="display: flex; justify-content: space-between; align-items: center; cursor: pointer;">
              <span style="font-weight: 700; display: inline-flex; align-items: center; gap: var(--space-2);"><i data-lucide="list" style="width: 18px; height: 18px;"></i> ${window.I18n.t('debt.paymentSchedule')}</span>
              <i data-lucide="chevron-down" id="dres-schedule-chevron" style="width: 20px; height: 20px; color: var(--text-tertiary); transition: transform 0.2s;"></i>
            </div>
            <div id="dres-schedule-body" style="display: none; padding-top: var(--space-3);">
              <div class="chart-toggle-group" id="dres-schedule-mode" style="margin-bottom: var(--space-3);">
                <button type="button" class="chart-toggle-btn active" data-mode="brief">${window.I18n.t('debt.brief')}</button>
                <button type="button" class="chart-toggle-btn" data-mode="detailed">${window.I18n.t('debt.detailed')}</button>
              </div>
              <div style="display: flex; justify-content: space-between; font-size: var(--text-xs); font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-tertiary); padding-bottom: var(--space-2); border-bottom: 1px solid var(--border-color);">
                <span>${window.I18n.t('form.date')}</span><span>${window.I18n.t('debt.payment')}</span><span>${window.I18n.t('debt.balance')}</span>
              </div>
              <div id="dres-schedule-rows"></div>
            </div>
          </div>

          ${actionsHtml}
        </div>
      `;
    },

    attachEvents(container, state) {
      const S = window.Views._DebtShared;
      const r = this._resolve(state);
      if (!r.config) { window.Router.navigate('#debt'); return; }
      if (window.StackdHydrateIcons) window.StackdHydrateIcons();
      if (r.error) return;
      const res = r.res;
      const $ = (id) => container.querySelector('#' + id);

      // ── schedule ──
      const rowsEl = $('dres-schedule-rows');
      const renderSchedule = (detailed) => {
        rowsEl.innerHTML = res.schedule.map(row => `
          <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: var(--space-2); padding: 10px 0; border-bottom: 1px solid var(--border-color); font-size: var(--text-sm);">
            <span style="color: var(--text-secondary); flex: 0 0 auto;">${S.fmtDate(row.date)}</span>
            <span style="text-align: center; flex: 1;">
              <span style="font-family: var(--font-family-display); font-weight: 700;">${S.fmtC(row.paymentC + row.extraPrincipalC)}</span>
              ${row.extraPrincipalC > 0 ? `<div style="font-size: var(--text-xs); color: var(--color-income-val);">${window.I18n.t('debt.inclExtra', { amount: S.fmtC(row.extraPrincipalC) })}</div>` : ''}
              ${detailed ? `<div style="font-size: var(--text-xs); color: var(--text-tertiary); margin-top: 2px;">${window.I18n.t('debt.interestPrincipal', { interest: S.fmtC(row.interestC), principal: S.fmtC(row.principalC + row.extraPrincipalC) })}</div>` : ''}
            </span>
            <span style="font-family: var(--font-family-display); font-weight: 600; flex: 0 0 auto;">${S.fmtC(row.balanceC)}</span>
          </div>`).join('');
      };
      const schedToggle = $('dres-schedule-toggle');
      const schedBody = $('dres-schedule-body');
      let schedRendered = false;
      const toggleSchedule = () => {
        const open = schedBody.style.display !== 'none';
        schedBody.style.display = open ? 'none' : 'block';
        schedToggle.setAttribute('aria-expanded', String(!open));
        const chev = $('dres-schedule-chevron');
        if (chev) chev.style.transform = open ? '' : 'rotate(180deg)';
        if (!open && !schedRendered) { renderSchedule(false); schedRendered = true; }
      };
      schedToggle.addEventListener('click', toggleSchedule);
      schedToggle.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleSchedule(); } });
      container.querySelectorAll('#dres-schedule-mode .chart-toggle-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          container.querySelectorAll('#dres-schedule-mode .chart-toggle-btn').forEach(b => b.classList.toggle('active', b === btn));
          renderSchedule(btn.dataset.mode === 'detailed');
        });
      });

      // ── name prompt helper ──
      const askName = (title, defaultName, cb) => {
        window.Components.Modal.show({
          title,
          content: `<div class="form-group" style="margin-bottom: 0;"><label class="form-label" for="loan-name-input">${window.I18n.t('common.name')}</label><input type="text" id="loan-name-input" class="form-control" placeholder="${window.I18n.t('debt.namePlaceholder')}" value="${S.esc(defaultName || '')}"></div>`,
          saveText: window.I18n.t('common.save'),
          onSave: (close) => {
            const v = document.getElementById('loan-name-input').value.trim();
            if (!v) return;
            close();
            cb(v);
          }
        });
        setTimeout(() => { const el = document.getElementById('loan-name-input'); if (el) el.focus(); }, 50);
      };

      // ── fresh-simulation actions ──
      if (r.fromForm) {
        const saveBtn = $('btn-dres-save');
        const promoteBtn = $('btn-dres-promote');
        const currentName = r.editingLoanId
          ? ((state.loans || []).find(l => l.id === r.editingLoanId) || {}).name
          : '';
        if (saveBtn) saveBtn.addEventListener('click', () => {
          askName(r.editingLoanId ? window.I18n.t('debt.updateSimulation') : window.I18n.t('debt.saveSimulation'), currentName, (name) => {
            if (r.editingLoanId) {
              window.Store.dispatch('UPDATE_LOAN', { id: r.editingLoanId, name, config: r.config });
            } else {
              window.Store.dispatch('ADD_LOAN', { name, kind: 'sim', config: r.config });
            }
            S.draft = null;
            window.Router.navigate('#debt');
          });
        });
        if (promoteBtn) promoteBtn.addEventListener('click', () => {
          askName(window.I18n.t('debt.addToMyLoans'), currentName, (name) => {
            let loanId = r.editingLoanId;
            if (loanId) {
              window.Store.dispatch('UPDATE_LOAN', { id: loanId, name, config: r.config });
              window.Store.dispatch('PROMOTE_LOAN', { id: loanId });
            } else {
              window.Store.dispatch('ADD_LOAN', { name, kind: 'active', config: r.config });
              const added = window.Store.getState().loans;
              loanId = added[added.length - 1].id;
            }
            S.draft = null;
            window.Router.navigate('#debt');
            // v0.71 Phase 4: offer the recurring expense over the hub
            window.Views.DebtResultsView._offerAfterPromote(loanId);
          });
        });
      }

      // ── tracked-loan actions ──
      const trackBtn = $('btn-dres-track');
      if (trackBtn && r.loan) {
        trackBtn.addEventListener('click', () => S.offerRecurringExpense(r.loan));
      }

      // ── saved-record menu (⋯): Edit / Add to My Loans / Delete ──
      const menuBtn = $('btn-dres-menu');
      if (menuBtn && r.loan) {
        menuBtn.addEventListener('click', () => {
          const opt = (act, icon, label, color) => `
            <div class="dres-menu-opt touch-target" data-act="${act}" role="button" tabindex="0" style="display: flex; align-items: center; gap: var(--space-3); padding: var(--space-3) 0; border-bottom: 1px solid var(--border-color); cursor: pointer; ${color ? 'color: ' + color + ';' : ''}">
              <i data-lucide="${icon}" style="width: 18px; height: 18px;"></i><span style="font-weight: 600; font-size: var(--text-sm);">${label}</span>
            </div>`;
          window.Components.Modal.show({
            title: S.esc(r.loan.name),
            content: `
              ${opt('edit', 'pencil', window.I18n.t('common.edit'))}
              ${r.loan.kind === 'sim' ? opt('promote', 'plus', window.I18n.t('debt.addToMyLoans')) : ''}
              ${opt('delete', 'trash-2', window.I18n.t('common.delete'), 'var(--color-expense-val)')}`,
            saveText: window.I18n.t('common.close'),
            onSave: (close) => close()
          });
          document.querySelectorAll('.dres-menu-opt').forEach(el => {
            el.addEventListener('click', () => {
              const act = el.dataset.act;
              if (act === 'edit') {
                window.Components.Modal.hide();
                S.draft = null;
                window.Router.navigate(`#debt-sim?id=${r.loan.id}`);
              } else if (act === 'promote') {
                window.Components.Modal.hide();
                window.Store.dispatch('PROMOTE_LOAN', { id: r.loan.id });
                window.Router.navigate('#debt');
                window.Views.DebtResultsView._offerAfterPromote(r.loan.id);
              } else if (act === 'delete') {
                window.Components.Modal.show({
                  title: window.I18n.t('debt.deleteLoanTitle'),
                  content: `<p style="font-size: var(--text-sm); color: var(--text-secondary); margin: 0;">${window.I18n.t('debt.deleteLoanBody', { name: S.esc(r.loan.name) })}</p>`,
                  saveText: window.I18n.t('debt.keepIt'),
                  showDelete: true,
                  onSave: (close) => close(),
                  onDelete: (close) => {
                    window.Store.dispatch('DELETE_LOAN', { id: r.loan.id });
                    close();
                    window.Router.navigate('#debt');
                  }
                });
              }
            });
          });
          if (window.StackdHydrateIcons) window.StackdHydrateIcons();
        });
      }
    }
  }
});
