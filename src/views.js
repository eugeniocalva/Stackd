// views.js - Application Views

// --- Generic Helpers ---
function createCategoryOptions(categories, selectedId) {
  return categories.map(cat => 
    `<option value="${cat.id}" ${cat.id === selectedId ? 'selected' : ''}>${cat.icon} ${cat.name}</option>`
  ).join('');
}

function createAccountOptions(accounts, selectedId) {
  return accounts.map(acc => 
    `<option value="${acc.id}" ${acc.id === selectedId ? 'selected' : ''}>${acc.name}</option>`
  ).join('');
}

window.Views = {
  // -------------------------
  // DASHBOARD VIEW (Phase 6)
  // -------------------------
  DashboardView: {
    hiddenChartAccounts: [], // Track which account IDs are excluded from the chart
    
    render(state) {
      const globalBalance = window.Store.getGlobalBalance();
      const formattedBalance = window.Store.formatCurrency(globalBalance);
      
      let accountsHtml = '<p class="text-secondary" style="text-align: center; padding: 20px;">No accounts yet. Create one!</p>';
      
      if (state.accounts.length > 0) {
        accountsHtml = '<div style="display: flex; flex-direction: column; gap: 12px;">';
        
        // Sort accounts by balance descending
        const sortedAccounts = [...state.accounts].sort((a, b) => {
          return window.Store.getAccountBalance(b.id) - window.Store.getAccountBalance(a.id);
        });
        
        sortedAccounts.forEach(acc => {
          const balance = window.Store.getAccountBalance(acc.id);
          const isHidden = this.hiddenChartAccounts.includes(acc.id);
          const eyeIcon = isHidden 
            ? `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color: var(--text-tertiary);"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>`
            : `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color: ${acc.color};"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`;

          accountsHtml += `
            <div class="list-item account-row" data-id="${acc.id}" style="cursor: pointer; position: relative;" tabindex="0" role="button" aria-label="View account ${acc.name} transactions">
          <div class="account-color-ball touch-target" data-id="${acc.id}" style="width: 44px; height: 44px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; cursor: pointer;" tabindex="0" role="button" aria-label="Change color for ${acc.name}"><div style="width: 10px; height: 10px; border-radius: 50%; background-color: ${acc.color}; border: 2px solid var(--bg-surface); outline: 1px solid var(--bg-surface-dim); pointer-events: none;"></div></div>
              <div class="list-item-content">
                <div class="list-item-title">${acc.name}</div>
                <div class="list-item-subtitle">${window.Store.formatCurrency(balance)}</div>
              </div>
              <div style="display: flex; align-items: center; gap: 16px; flex-shrink: 0;">
                <div class="account-visibility-toggle touch-target" data-id="${acc.id}" style="cursor: pointer; display: flex; align-items: center; justify-content: center; width: 44px; height: 44px;" title="Toggle chart visibility" tabindex="0" role="button" aria-label="Toggle chart visibility for ${acc.name}">
                  ${eyeIcon}
                </div>
                <div class="account-edit-menu touch-target" data-id="${acc.id}" style="cursor: pointer; display: flex; align-items: center; justify-content: center; width: 44px; height: 44px; color: var(--text-secondary);" title="Edit Account" tabindex="0" role="button" aria-label="Edit account ${acc.name}">
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="1"/><circle cx="12" cy="5" r="1"/><circle cx="12" cy="19" r="1"/></svg>
                </div>
              </div>
            </div>
          `;
        });
        accountsHtml += '</div>';
      }

      // Calculate MoM %
      const now = new Date();
      const firstThisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const firstLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      
      const thisMonthBalanceRow = window.Store.compute12MonthBalances().find(m => m.label === now.toLocaleDateString('en-US', { month: 'short', year: '2-digit' }));
      const lastMonthBalanceRow = window.Store.compute12MonthBalances().find(m => m.label === firstLastMonth.toLocaleDateString('en-US', { month: 'short', year: '2-digit' }));
      
      const thisMonthBal = thisMonthBalanceRow ? thisMonthBalanceRow.balance : window.Store.getGlobalBalance();
      const lastMonthBal = lastMonthBalanceRow ? lastMonthBalanceRow.balance : 0;
      
      let badgeHtml = '';
      if (lastMonthBal !== 0 && thisMonthBal >= 0 && lastMonthBal >= 0) {
        const pct = ((thisMonthBal - lastMonthBal) / Math.abs(lastMonthBal)) * 100;
        const color = pct >= 0 ? 'var(--color-income-bg)' : 'var(--color-expense-bg)';
        const textcolor = pct >= 0 ? 'var(--color-income-text)' : 'var(--color-expense)';
        const sign = pct >= 0 ? '+' : '';
        // Note: For WCAG I am using bg and text variables.
        badgeHtml = `<div style="position: absolute; top: var(--space-2); right: var(--space-4); font-size: 0.85rem; padding: 4px 8px; border-radius: 12px; background: ${color}; color: ${textcolor}; font-weight: bold; z-index: 10;">${sign}${pct.toFixed(1)}% vs last mo.</div>`;
      }
      
      // Recent Activities
      const todayStr = now.toISOString().split('T')[0];
      const yesterday = new Date(now);
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayStr = yesterday.toISOString().split('T')[0];
      
      const recentTxs = state.transactions.filter(t => t.date === todayStr || t.date === yesterdayStr).slice(0, 5);
      
      let recentHtml = '';
      if (recentTxs.length === 0) {
        recentHtml = '<p class="text-secondary text-center" style="padding: 10px;">No recent activities.</p>';
      } else {
        recentHtml = '<div class="list-group">' + recentTxs.map(tx => {
          const cat = state.categories.find(c => c.id === tx.categoryId);
          const acc = state.accounts.find(a => a.id === tx.accountId);
          const txItemStr = window.Components.TransactionItem.render(tx, cat, acc);
          return txItemStr.replace('<div class="list-item', `<div class="list-item recent-tx-row" data-date="${tx.date}" data-id="${tx.id}" tabindex="0" role="button" aria-label="Edit transaction ${tx.amount}"`);
        }).join('') + '</div>';
      }

      return `
        <div class="container animate-fade-in" style="padding-top: var(--space-8); padding-bottom: 100px;">
          <div style="margin-bottom: var(--space-8);">
            <p class="section-title">Total Balance</p>
            <h1 class="header-title" style="margin: 0;">${formattedBalance}</h1>
          </div>
          
          <div style="height: 160px; margin-bottom: var(--space-6); position: relative; margin-left: -var(--space-4); margin-right: -var(--space-4);">
            ${badgeHtml}
            <canvas id="balanceChart"></canvas>
          </div>
          
          <div class="section-title" style="margin-top: var(--space-8); margin-bottom: var(--space-2);">Your Accounts</div>
          <div class="card card-elevated" style="padding: var(--space-2) var(--space-4); margin-bottom: var(--space-6);">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: var(--space-2); margin-top: var(--space-2);">
              <h2 style="margin: 0; font-size: 1.1rem; color: var(--text-primary);">Manage</h2>
              <button class="btn btn-primary" id="btn-create-account" style="width: auto; padding: 4px 12px; font-size: 13px; min-height: 0; height: 32px; border-radius: 100px;">+ New</button>
            </div>
            ${accountsHtml}
          </div>

          <div class="section-title" style="margin-top: var(--space-8); margin-bottom: var(--space-2);">Recent Activities</div>
          <div class="card card-elevated" style="margin-bottom: var(--space-6); padding: var(--space-2) var(--space-4);">
            ${recentHtml}
          </div>

          <div class="section-title" style="margin-top: var(--space-8); margin-bottom: var(--space-2);">Financial Milestone</div>
          <div class="card card-elevated" style="padding: var(--space-5); text-align: center; margin-bottom: var(--space-8);">
             <div style="font-size: 2rem; margin-bottom: var(--space-2);">🏆</div>
             <div style="color: var(--text-primary); font-weight: 600;">Coming Soon</div>
             <p style="color: var(--text-secondary); font-size: var(--text-sm); margin-top: var(--space-2);">Track your debt payoff and savings goals!</p>
          </div>
        </div>
      `;
    },
    attachEvents(container, state) {
      // Navigate to History on row click (excluding standard action buttons)
      container.querySelectorAll('.account-row').forEach(row => {
        row.addEventListener('click', (e) => {
          if (e.target.closest('.account-visibility-toggle') || e.target.closest('.account-edit-menu') || e.target.closest('.account-color-ball')) return;
          const accountId = row.dataset.id;
          window.Store.dispatch('SET_ACCOUNT_FILTER', accountId);
          window.Router.navigate(`#transactions?account=${accountId}`);
        });
      });

      // Recent Activity Click -> Jump to History & Scroll
      container.querySelectorAll('.recent-tx-row').forEach(row => {
        row.addEventListener('click', () => {
          const txId = row.dataset.id;
          sessionStorage.setItem('scrollToTx', txId);
          window.Router.navigate('#transactions');
        });
      });

      // Account Color Picker
      container.querySelectorAll('.account-color-ball').forEach(ball => {
        ball.addEventListener('click', (e) => {
          e.stopPropagation();
          const accountId = ball.dataset.id;
          const predefinedColors = [
            '#0075EB', '#00C9A7', '#7B61FF', '#FF5C5C', '#FFB800',
            '#14B8A6', '#F97316', '#8B5CF6', '#EC4899', '#10B981',
            '#F59E0B', '#EF4444', '#6366F1', '#000000', '#9b9b9b'
          ];
          
          let gridHtml = '<div style="display: grid; grid-template-columns: repeat(5, 1fr); gap: 12px; justify-items: center; margin-bottom: 20px;">';
          predefinedColors.forEach(color => {
            gridHtml += `<div class="color-picker-opt" data-color="${color}" style="width: 32px; height: 32px; border-radius: 50%; background-color: ${color}; cursor: pointer; border: 2px solid transparent;"></div>`;
          });
          gridHtml += '</div>';

          window.Components.Modal.show({
            title: 'Choose Color',
            content: gridHtml,
            saveText: 'Done',
            onSave: (close) => close()
          });

          setTimeout(() => {
            document.querySelectorAll('.color-picker-opt').forEach(opt => {
              opt.addEventListener('click', () => {
                window.Store.dispatch('UPDATE_ACCOUNT_COLOR', { id: accountId, color: opt.dataset.color });
                window.Components.Modal.hide();
              });
            });
          }, 50);
        });
      });

      // Toggle Chart Visibility
      container.querySelectorAll('.account-visibility-toggle').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const accountId = btn.dataset.id;
          if (this.hiddenChartAccounts.includes(accountId)) {
            this.hiddenChartAccounts = this.hiddenChartAccounts.filter(id => id !== accountId);
          } else {
            this.hiddenChartAccounts.push(accountId);
          }
           // Trigger a full re-render of this view to ensure data and icons update
          container.innerHTML = this.render(state);
          // Re-attach elements since DOM was replaced
          this.attachEvents(container, state);
        });
      });

      // Create Account Modal
      const btnCreate = container.querySelector('#btn-create-account');
      if (btnCreate) {
        btnCreate.addEventListener('click', () => {
          window.Components.Modal.show({
            title: 'New Account',
            content: `
              <div class="form-group">
                <label class="form-label">Account Name</label>
                <input type="text" id="new-account-name" class="form-control" placeholder="e.g. Wallet, Checking..." autocomplete="off">
              </div>
              <div class="form-group">
                <label class="form-label">Opening Balance (optional)</label>
                <input type="number" id="new-account-balance" class="form-control" placeholder="0.00" step="0.01" inputmode="decimal">
              </div>
              <div class="form-group" style="margin-bottom: 0;">
                <label class="form-label">Opening Balance Date</label>
                <input type="date" id="new-account-date" class="form-control" value="${new Date().toISOString().split('T')[0]}">
              </div>
            `,
            saveText: 'Create Account',
            onSave: (closeModal) => {
              const name = document.getElementById('new-account-name').value.trim();
              if (name) {
                const ob = parseFloat(document.getElementById('new-account-balance').value) || 0;
                const dDate = document.getElementById('new-account-date').value;
                window.Store.dispatch('ADD_ACCOUNT', { name, openingBalance: ob, openingDate: dDate });
                closeModal();
              }
            }
          });
        });
      }

      // Edit/Delete Account Modal
      container.querySelectorAll('.account-edit-menu').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const accountId = btn.dataset.id;
          const account = state.accounts.find(a => a.id === accountId);
          if (!account) return;

          const currentOb = window.Store.getState().transactions.find(
            t => t.accountId === account.id && t.type === 'opening_balance'
          );
          const currentObAmt = currentOb ? currentOb.amount : 0;
          const currentObDate = currentOb ? currentOb.date : new Date().toISOString().split('T')[0];
          
          window.Components.Modal.show({
            title: 'Edit Account',
            content: `
              <div class="form-group">
                <label class="form-label">Account Name</label>
                <input type="text" id="edit-account-name" class="form-control" value="${account.name}" autocomplete="off">
              </div>
              <div class="form-group">
                <label class="form-label">Opening Balance</label>
                <input type="number" id="edit-account-balance" class="form-control" value="${currentObAmt}" step="0.01" inputmode="decimal">
              </div>
              <div class="form-group" style="margin-bottom: 0;">
                <label class="form-label">Opening Balance Date</label>
                <input type="date" id="edit-account-date" class="form-control" value="${currentObDate}">
              </div>
            `,
            saveText: 'Save Changes',
            showDelete: true,
            onSave: (closeModal) => {
              const name = document.getElementById('edit-account-name').value.trim();
              const ob = parseFloat(document.getElementById('edit-account-balance').value) || 0;
              const dDate = document.getElementById('edit-account-date').value;
              if (name) {
                window.Store.dispatch('UPDATE_ACCOUNT', { id: account.id, name, openingBalance: ob, openingDate: dDate });
              }
              closeModal();
            },
            onDelete: (closeModal) => {
              window.Components.Modal.show({
                title: 'Delete Account?',
                content: `<p>Are you sure you want to delete "${account.name}"? <strong>All associated transactions will be permanently deleted.</strong></p>`,
                saveText: 'Cancel', 
                showDelete: true,
                onSave: (closeConfirm) => { closeConfirm(); }, 
                onDelete: (closeConfirm) => {
                  window.Store.dispatch('DELETE_ACCOUNT', { id: account.id });
                  closeConfirm();
                  closeModal(); 
                }
              });
              setTimeout(() => {
                const btnSave = document.getElementById('modal-save-btn');
                const btnDelete = document.getElementById('modal-delete-btn');
                if (btnSave) { btnSave.className = 'btn btn-secondary'; }
                if (btnDelete) { btnDelete.innerHTML = 'Yes, Delete Everything'; }
              }, 10);
            }
          });
        });
      });

      // 12-Month Aggregated Balance Chart
      const ctx = document.getElementById('balanceChart');
      if (ctx && window.Chart) {
        // Global Balance Dataset
        const globalData = window.Store.compute12MonthBalances();
        const datasets = [{
          label: 'Total Balance',
          data: globalData.map(m => m.balance),
          borderColor: '#5f5e5e', // Dark neutral line
          borderWidth: 3, // Thicker than account lines
          borderDash: [5, 5], // Dashed to distinguish it as an aggregate
          tension: 0.4,
          fill: false,
          pointRadius: 0,
          pointHoverRadius: 6,
          pointBackgroundColor: '#ffffff',
          pointBorderColor: '#5f5e5e',
          pointBorderWidth: 2,
          order: 1 // Drawn on top
        }];

        // Account Datasets
        state.accounts.forEach(acc => {
          if (!this.hiddenChartAccounts.includes(acc.id)) {
            const accData = window.Store.computeAccount12MonthBalances(acc.id);
            datasets.push({
              label: acc.name,
              data: accData.map(m => m.balance),
              borderColor: acc.color,
              backgroundColor: `${acc.color}15`, // Hex with 15% opacity for fill
              borderWidth: 2,
              tension: 0.4,
              fill: true,
              pointRadius: 0,
              pointHoverRadius: 5,
              pointBackgroundColor: '#ffffff',
              pointBorderColor: acc.color,
              pointBorderWidth: 2,
              order: 2 // Drawn under global line
            });
          }
        });

        Chart.defaults.color = '#596065';
        Chart.defaults.font.family = "'Inter', system-ui, sans-serif";
        new Chart(ctx, {
          type: 'line',
          data: {
            labels: globalData.map(m => m.label),
            datasets: datasets
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: {
              mode: 'index', // Show tooltip for all lines at that month instance
              intersect: false,
            },
            plugins: {
              legend: { display: false },
              tooltip: {
                backgroundColor: '#ffffff',
                titleColor: '#596065',
                bodyColor: '#2d3338',
                bodyFont: { family: 'Manrope', size: 13, weight: 'bold' },
                displayColors: true,
                boxPadding: 4,
                borderColor: '#e4e9ee',
                borderWidth: 1,
                padding: 10,
                itemSort: (a, b) => b.parsed.y - a.parsed.y, // Sort tooltip items by value (descending)
                callbacks: {
                  label: (ctx) => ` ${ctx.dataset.label}: ${window.Store.formatCurrency(ctx.parsed.y)}`
                }
              }
            },
            scales: {
              x: { grid: { display: false }, ticks: { font: { size: 10 } } },
              y: { display: false, beginAtZero: false } // Auto-scale to fit
            }
          }
        });
      }
    }
  },

  // ACCOUNTS VIEW has been deleted entirely per v0.8

  // -------------------------
  // TRANSACTIONS VIEW (v0.5)
  // -------------------------
  TransactionsView: {
    render(state) {
      const selectedAccountId = state.activeAccountFilter || '';
      const selectedMonth = state.activeMonthFilter || ''; // 'YYYY-MM'

      // Account filter options
      const accountOptions = [
        `<option value="">All Accounts</option>`,
        ...state.accounts.map(a =>
          `<option value="${a.id}" ${a.id === selectedAccountId ? 'selected' : ''}>${a.name}</option>`
        )
      ].join('');

      // Month filter options
      const availableMonths = window.Store.getAvailableMonths();
      const monthOptions = availableMonths.map(m =>
        `<option value="${m.value}" ${m.value === selectedMonth ? 'selected' : ''}>${m.label}</option>`
      ).join('');

      // Determine if prev/next month buttons should be enabled
      const currMonthIdx = availableMonths.findIndex(m => m.value === selectedMonth);
      const hasNextMonth = currMonthIdx > 0; // newer months are at lower index (descending)
      const hasPrevMonth = currMonthIdx < availableMonths.length - 1;

      // Double filter
      const visibleTx = state.transactions.filter(tx => {
        const matchAccount = selectedAccountId ? tx.accountId === selectedAccountId : true;
        const matchMonth = tx.date.startsWith(selectedMonth);
        return matchAccount && matchMonth;
      });

      // Build back-button if a specific account is pre-selected
      const backBtn = selectedAccountId
        ? `<a href="#dashboard" class="touch-target" style="display: inline-flex; align-items: center; gap: 4px; color: var(--text-secondary); text-decoration: none; font-size: var(--text-sm); margin-bottom: var(--space-2);" aria-label="Back to Overview">‹ Overview</a>`
        : '';

      let contentHtml = '<div class="list-group" style="position: relative;">';

      // --- Calculate Old Balance and New Balance ---
      const [yearStr, monthStr] = selectedMonth.split('-');
      const year = parseInt(yearStr);
      const monthIndex = parseInt(monthStr) - 1; // 0-indexed
      
      const startOfMonth = new Date(year, monthIndex, 1);
      const endOfMonth = new Date(year, monthIndex + 1, 0, 23, 59, 59);
      
      // Old Balance: sum of all transactions before start of this month
      const oldBalance = state.transactions
        .filter(t => (selectedAccountId ? t.accountId === selectedAccountId : true) && new Date(t.date) < startOfMonth)
        .reduce((sum, tx) => window.Store._isPositiveTx(tx) ? sum + tx.amount : sum - tx.amount, 0);
        
      // New Balance: sum of all transactions up to end of this month
      const newBalance = state.transactions
        .filter(t => (selectedAccountId ? t.accountId === selectedAccountId : true) && new Date(t.date) <= endOfMonth)
        .reduce((sum, tx) => window.Store._isPositiveTx(tx) ? sum + tx.amount : sum - tx.amount, 0);

      // Render Old Balance Row
      contentHtml += `
        <div class="list-item" style="background: var(--bg-body); border-bottom: 2px dashed var(--border-color); border-radius: 0;">
          <div class="list-item-content">
            <div class="list-item-title" style="color: var(--text-secondary); font-weight: normal;">Old Balance</div>
            <div class="list-item-subtitle">${startOfMonth.toLocaleDateString('en-US', { day: '2-digit', month: '2-digit' })}</div>
          </div>
          <div style="font-weight: 600; font-family: var(--font-family-display); font-size: 1.1rem; color: var(--text-primary);">
            ${window.Store.formatCurrency(oldBalance)}
          </div>
        </div>
      `;

      // Track days with transactions for the calendar
      const activeDays = new Set();
      const renderedDayIds = new Set();
      
      if (visibleTx.length === 0) {
        contentHtml += `
          <div style="text-align: center; padding: 40px 20px;">
            <p class="text-secondary" style="margin-bottom: 0;">No entries for this month.</p>
          </div>
        `;
      } else {
        visibleTx.forEach(tx => {
          activeDays.add(parseInt(tx.date.split('-')[2])); // store day number
          const category = state.categories.find(c => c.id === tx.categoryId);
          const account = state.accounts.find(a => a.id === tx.accountId);
          // Add anchor ID to transaction item for scrolling
          const txHtml = window.Components.TransactionItem.render(tx, category, account);
          if (!renderedDayIds.has(tx.date)) {
            contentHtml += txHtml.replace('<div class="list-item', `<div id="tx-${tx.date}" class="list-item`);
            renderedDayIds.add(tx.date);
          } else {
            contentHtml += txHtml;
          }
        });
      }

      // Render New Balance Row
      contentHtml += `
        <div class="list-item" style="background: var(--bg-body); border-top: 2px dashed var(--border-color); border-radius: 0;">
          <div class="list-item-content">
            <div class="list-item-title" style="color: var(--text-secondary); font-weight: normal;">New Balance</div>
            <div class="list-item-subtitle">${endOfMonth.toLocaleDateString('en-US', { day: '2-digit', month: '2-digit' })}</div>
          </div>
          <div style="font-weight: 600; font-family: var(--font-family-display); font-size: 1.1rem; color: var(--text-primary);">
            ${window.Store.formatCurrency(newBalance)}
          </div>
        </div>
      </div>`;
      
      // Calculate Calendar Grid HTML
      const daysInMonth = endOfMonth.getDate();
      const firstDayOfWeek = startOfMonth.getDay(); // 0 = Sun, 1 = Mon
      // Adjust standard 0=Sun to 1=Mon, 7=Sun logic for a Mon-Sun grid:
      const startOffset = firstDayOfWeek === 0 ? 6 : firstDayOfWeek - 1; 

      let calendarGridHtml = `
        <div id="history-calendar-overlay" style="display: none; background: var(--bg-surface); border-radius: var(--radius-lg); padding: var(--space-4); margin-bottom: var(--space-4); box-shadow: 0 4px 12px rgba(0,0,0,0.05); animate-fade-in; position: relative;">
          <div style="display: grid; grid-template-columns: repeat(7, 1fr); gap: 8px; text-align: center;">
            <div style="font-size: 0.8rem; color: var(--text-tertiary); margin-bottom: 8px;">M</div>
            <div style="font-size: 0.8rem; color: var(--text-tertiary); margin-bottom: 8px;">T</div>
            <div style="font-size: 0.8rem; color: var(--text-tertiary); margin-bottom: 8px;">W</div>
            <div style="font-size: 0.8rem; color: var(--text-tertiary); margin-bottom: 8px;">T</div>
            <div style="font-size: 0.8rem; color: var(--text-tertiary); margin-bottom: 8px;">F</div>
            <div style="font-size: 0.8rem; color: var(--text-tertiary); margin-bottom: 8px;">S</div>
            <div style="font-size: 0.8rem; color: var(--text-tertiary); margin-bottom: 8px;">S</div>
      `;
      // Filler cells
      for(let i=0; i < startOffset; i++) {
        calendarGridHtml += `<div></div>`;
      }
      // Actual days
      for(let day=1; day <= daysInMonth; day++) {
        const hasTx = activeDays.has(day);
        const fullDateStr = `${yearStr}-${monthStr}-${String(day).padStart(2,'0')}`;
        calendarGridHtml += `
          <div class="calendar-day" data-date="${fullDateStr}" style="position: relative; width: 36px; height: 36px; display: flex; align-items: center; justify-content: center; border-radius: 50%; ${hasTx ? 'background: var(--bg-body); cursor: pointer; color: var(--text-primary); font-weight: bold;' : 'color: var(--text-tertiary);'} margin: 0 auto;">
            <span>${day}</span>
            ${hasTx ? `<div style="position: absolute; bottom: 4px; width: 4px; height: 4px; background: var(--color-accent); border-radius: 50%;"></div>` : ''}
          </div>
        `;
      }
      calendarGridHtml += `</div></div>`;

      return `
        <div class="container animate-fade-in">
          ${backBtn}
          <div class="page-header" style="margin-top: var(--space-2); margin-bottom: var(--space-4);">
            <h1 class="page-header-title">History</h1>
            <button id="btn-toggle-calendar" class="btn" style="width: 44px; height: 44px; padding: 0; border-radius: 50%; background: var(--bg-surface); box-shadow: 0 2px 8px rgba(0,0,0,0.05); color: var(--text-primary); flex-shrink: 0;" aria-label="Toggle calendar">
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
            </button>
          </div>

          <div style="display: flex; gap: var(--space-3); margin-bottom: var(--space-4);">
            <select id="history-account-filter" class="form-control" style="flex: 1; appearance: none; background-image: url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%23596065' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E\"); background-repeat: no-repeat; background-position: right 12px center; padding-right: 36px;">
              ${accountOptions}
            </select>
          </div>

          <div style="display: flex; justify-content: space-between; align-items: center; background: var(--bg-surface); padding: var(--space-2); border-radius: var(--radius-lg); margin-bottom: var(--space-5);">
            <button id="btn-month-prev" class="btn" style="width: 44px; height: 44px; padding: 0; background: transparent; color: var(--text-secondary);" ${!hasPrevMonth ? 'disabled' : ''}>
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
            </button>
            
            <div id="history-month-picker-btn" style="flex: 1; cursor: pointer; text-align: center; font-family: var(--font-family-display); font-weight: 600; font-size: 1.1rem; padding: 8px; border-radius: var(--radius-md); background: var(--bg-surface-sunken); display: flex; align-items: center; justify-content: center; gap: 8px;">
              ${availableMonths.length > 0 && currMonthIdx >= 0 ? availableMonths[currMonthIdx].label : 'Select Month'} <span style="font-size: 0.8rem; color: var(--text-tertiary);">▼</span>
            </div>

            <button id="btn-month-next" class="btn" style="width: 44px; height: 44px; padding: 0; background: transparent; color: var(--text-secondary);" ${!hasNextMonth ? 'disabled' : ''}>
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6"/></svg>
            </button>
          </div>

          ${calendarGridHtml}
          ${contentHtml}
        </div>
      `;
    },
    attachEvents(container, state) {
      // Account filter dropdown
      const accSelect = document.getElementById('history-account-filter');
      if (accSelect) {
        accSelect.addEventListener('change', () => {
          window.Store.dispatch('SET_ACCOUNT_FILTER', accSelect.value);
          history.replaceState(null, '', accSelect.value ? `#transactions?account=${accSelect.value}` : '#transactions');
        });
      }

      // Month dropdown
      const monthBtn = document.getElementById('history-month-picker-btn');
      if (monthBtn) {
        monthBtn.addEventListener('click', () => {
          window.Components.MonthPicker.show({
            initialValue: window.Store.getState().activeMonthFilter,
            onSelect: (val) => window.Store.dispatch('SET_MONTH_FILTER', val)
          });
        });
      }

      // Arrow navigation
      const btnPrev = document.getElementById('btn-month-prev');
      const btnNext = document.getElementById('btn-month-next');
      if (btnPrev && btnNext) {
        const availableMonths = window.Store.getAvailableMonths();
        const currMonthIdx = availableMonths.findIndex(m => m.value === state.activeMonthFilter);

        btnPrev.addEventListener('click', () => {
          if (currMonthIdx < availableMonths.length - 1) { // array is descending
            window.Store.dispatch('SET_MONTH_FILTER', availableMonths[currMonthIdx + 1].value);
          }
        });

        btnNext.addEventListener('click', () => {
          if (currMonthIdx > 0) { // array is descending
            window.Store.dispatch('SET_MONTH_FILTER', availableMonths[currMonthIdx - 1].value);
          }
        });
      }

      // Edit transaction on click
      container.querySelectorAll('.list-item[data-id]').forEach(item => {
        item.addEventListener('click', () => {
          const txId = item.dataset.id;
          if (txId) {
            window.Router.navigate('#edit?id=' + txId);
          }
        });
      });
      
      // Calendar Toggle 
      const btnCalendar = document.getElementById('btn-toggle-calendar');
      const calendarOverlay = document.getElementById('history-calendar-overlay');
      if (btnCalendar && calendarOverlay) {
        btnCalendar.addEventListener('click', () => {
          calendarOverlay.style.display = calendarOverlay.style.display === 'none' ? 'block' : 'none';
        });
      }
      
      // Calendar Day Scroller
      container.querySelectorAll('.calendar-day[data-date]').forEach(dayEl => {
        dayEl.addEventListener('click', () => {
          const dateStr = dayEl.dataset.date;
          if (!dateStr) return;
          // Find first tx block matching date
          const targetTx = document.getElementById(`tx-${dateStr}`);
          if (targetTx) {
            targetTx.scrollIntoView({ behavior: 'smooth', block: 'center' });
            // Highlight it briefly
            targetTx.style.transition = 'background-color 0.3s';
            const originalBg = targetTx.style.backgroundColor;
            targetTx.style.backgroundColor = 'var(--bg-body)';
            setTimeout(() => { targetTx.style.backgroundColor = originalBg; }, 1500);
            
            // Auto close calendar after selection
            if (calendarOverlay) {
              calendarOverlay.style.display = 'none';
            }
          }
        });
      });

      // Scroll to specific tx from Dashboard Click
      const scrollToTx = sessionStorage.getItem('scrollToTx');
      if (scrollToTx) {
        sessionStorage.removeItem('scrollToTx');
        setTimeout(() => {
          const targetTx = document.querySelector(`.list-item[data-id="${scrollToTx}"]`);
          if (targetTx) {
            targetTx.scrollIntoView({ behavior: 'smooth', block: 'center' });
            targetTx.style.transition = 'background-color 0.3s';
            const originalBg = targetTx.style.backgroundColor;
            targetTx.style.backgroundColor = 'var(--bg-surface-sunken)';
            setTimeout(() => { targetTx.style.backgroundColor = originalBg; }, 1500);
          }
        }, 100);
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
          <div class="container animate-fade-in" style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; text-align: center;">
            <div style="font-size: 3rem; margin-bottom: 16px;">🏦</div>
            <h2 style="margin-bottom: 8px;">Create an Account First</h2>
            <p class="text-secondary" style="margin-bottom: 24px;">You need an account to log a transaction.</p>
            <a href="#accounts" class="btn btn-primary" style="width: auto;">Go to Accounts</a>
          </div>
        `;
      }
      
      const params = window.Router ? window.Router.getParams() : {};
      const editId = params.id;
      const txToEdit = editId ? state.transactions.find(t => t.id === editId) : null;
      
      if (editId && !txToEdit) {
        return `<div class="container animate-fade-in" style="padding-top: 40px; text-align: center;"><p>Transaction not found.</p><a href="#transactions" class="btn btn-primary" style="display: inline-block; width: auto; padding: 8px 16px;">Go Back</a></div>`;
      }
      
      const isEdit = !!txToEdit;
      
      // Setup initial values
      let initialType = 'expense';
      let initialAmount = '';
      let initialDate = new Date().toISOString().split('T')[0];
      let initialNote = '';
      let initialAccount = '';
      let initialCategory = '';
      let initialToAccount = '';
      
      if (txToEdit) {
        initialAmount = Math.abs(txToEdit.amount);
        initialDate = txToEdit.date;
        initialNote = txToEdit.comment || txToEdit.note || '';
        initialAccount = txToEdit.accountId;
        initialCategory = txToEdit.categoryId || '';
        
        if (txToEdit.transferRef) {
          initialType = 'transfer';
          // Find the counterpart to know the other account
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
        } else if (txToEdit.isAdjustment || txToEdit.type === 'balance_adjustment' || txToEdit.categoryId === 'cat_balance') {
          initialType = 'balance';
        } else {
          initialType = txToEdit.type;
        }
      }

      const disableToggles = isEdit && (initialType === 'transfer' || initialType === 'balance') ? 'pointer-events: none; opacity: 0.5;' : '';
      
      return `
        <div class="container animate-fade-in" style="padding-bottom: 100px;">
          <div class="page-header">
            <h1 class="page-header-title">${isEdit ? 'Edit Log' : 'New Log'}</h1>
            <a href="#${isEdit ? 'transactions' : 'dashboard'}" style="color: var(--text-secondary); width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; background: var(--bg-surface); border-radius: 50%; flex-shrink: 0;">✕</a>
          </div>
          
          <!-- Type Toggle -->
          <div style="display: flex; background: var(--bg-surface); border-radius: var(--radius-sm); padding: 4px; margin-bottom: var(--space-8); ${disableToggles}">
            <button id="toggle-expense" class="btn btn-danger" style="flex: 1; border-radius: var(--radius-sm); padding: 8px 4px; font-size: 13px;">Expense</button>
            <button id="toggle-income" class="btn" style="flex: 1; color: var(--text-secondary); background: transparent; border-radius: var(--radius-sm); padding: 8px 4px; font-size: 13px;">Income</button>
            <button id="toggle-transfer" class="btn" style="flex: 1; color: var(--text-secondary); background: transparent; border-radius: var(--radius-sm); padding: 8px 4px; font-size: 13px;">Transfer</button>
            <button id="toggle-balance" class="btn" style="flex: 1; color: var(--text-secondary); background: transparent; border-radius: var(--radius-sm); padding: 8px 4px; font-size: 13px;">Balance</button>
          </div>
          
          <input type="hidden" id="tx-type" value="${initialType}">
          ${isEdit ? `<input type="hidden" id="tx-edit-id" value="${editId}">` : ''}
          ${isEdit && initialType==='transfer' ? `<input type="hidden" id="tx-transfer-ref" value="${txToEdit.transferRef}">` : ''}
          
          <!-- Large Amount Input -->
          <div class="amount-input-group" style="display: flex; align-items: baseline; justify-content: center; gap: 6px;">
            <span id="currency-symbol" style="color: var(--text-tertiary); font-size: var(--text-2xl); font-family: var(--font-family-display); font-weight: 700; flex-shrink: 0;">${window.Store.getCurrencySymbol()}</span>
            <input type="number" id="tx-amount" class="amount-input text-expense" placeholder="0.00" step="0.01" inputmode="decimal" value="${initialAmount}" style="flex: 1; max-width: 260px;">
          </div>
          
          <div class="card" style="margin-bottom: var(--space-6);">
            <div class="form-group" id="group-account">
              <label class="form-label" id="label-account">Account</label>
              <select id="tx-account" class="form-control" style="appearance: none;">
                ${createAccountOptions(state.accounts, initialAccount)}
              </select>
            </div>
            
            <div class="form-group" id="group-transfer-to" style="display: none;">
              <label class="form-label">To Account</label>
              <select id="tx-transfer-to" class="form-control" style="appearance: none;">
                ${createAccountOptions(state.accounts, initialToAccount)}
              </select>
            </div>
            
            <div class="form-group" id="group-category">
              <label class="form-label" style="display:flex; justify-content: space-between;">
                <span>Category</span>
                <span id="btn-add-category" style="color: var(--color-accent); cursor: pointer;">+ Add custom</span>
              </label>
              <select id="tx-category" class="form-control" style="appearance: none;" data-initial="${initialCategory}">
                <!-- Will be populated via JS based on type -->
              </select>
            </div>
            
            <div class="form-group">
              <label class="form-label">Date</label>
              <input type="date" id="tx-date" class="form-control" value="${initialDate}">
            </div>
            
            <div class="form-group">
              <label class="form-label">Note (Optional)</label>
              <input type="text" id="tx-comment" class="form-control" placeholder="What was this for?" value="${initialNote}">
            </div>

            <div class="card card-elevated" style="padding: var(--space-3); margin-top: var(--space-4); display: flex; flex-direction: column; gap: 12px; background: transparent; border: 1px solid var(--border-color); box-shadow: none;" id="group-recurring">
              <div style="display: flex; align-items: center; justify-content: space-between; width: 100%;">
                <div style="flex: 1;">
                  <strong style="display: block; font-family: var(--font-family-body); font-size: 1rem; color: var(--text-primary); margin-bottom: 2px;">Recurrent</strong>
                  <span id="tx-recurrent-text" style="font-size: var(--text-sm); color: var(--text-secondary); cursor: pointer;">Disabled</span>
                </div>
                <label class="toggle-switch">
                  <input type="checkbox" id="tx-is-recurrent" ${txToEdit && txToEdit.recurrence ? 'checked' : ''}>
                  <span class="slider"></span>
                </label>
              </div>
              <div id="tx-recurrence-end-group" style="display: none; border-top: 1px solid var(--border-color); padding-top: 12px; margin-top: 4px;">
                <label class="form-label" style="font-size: 0.9rem; color: var(--text-secondary); margin-bottom: 6px;">End Date</label>
                <input type="date" id="tx-recurrence-end-date" class="form-control" value="${txToEdit && txToEdit.recurrence && txToEdit.recurrence.endDate ? txToEdit.recurrence.endDate : ''}">
              </div>
              <input type="hidden" id="tx-recurrence-interval" value="${txToEdit && txToEdit.recurrence ? txToEdit.recurrence.interval : '1'}">
              <input type="hidden" id="tx-recurrence-freq" value="${txToEdit && txToEdit.recurrence ? txToEdit.recurrence.frequency : 'months'}">
              <input type="hidden" id="tx-recurrence-series-id" value="${txToEdit && txToEdit.recurrence ? txToEdit.recurrence.seriesId : ''}">
            </div>

          </div>
          
          <button id="btn-save-tx" class="btn btn-primary" style="width: 100%; padding: var(--space-4); font-size: 1.1rem; border-radius: var(--radius-lg); margin-bottom: 8px;">${isEdit ? 'Update Transaction' : 'Save Transaction'}</button>
          
          ${isEdit ? `
            <button id="btn-delete-tx" class="btn" style="width: 100%; padding: var(--space-4); color: var(--color-expense); background: var(--color-expense-bg); border-radius: var(--radius-lg); font-weight: 600;">Delete Transaction</button>
          ` : ''}
        </div>
      `;
    },
    attachEvents(container, state) {
      // Ensure ScrollView resets to top on component mount
      if (container && typeof container.scrollTo === 'function') {
        container.scrollTo(0, 0);
      }

      if (state.accounts.length === 0) return;
      
      const btnExpense = document.getElementById('toggle-expense');
      const btnIncome = document.getElementById('toggle-income');
      const btnTransfer = document.getElementById('toggle-transfer');
      const btnBalance = document.getElementById('toggle-balance');
      const typeInput = document.getElementById('tx-type');
      const amountInput = document.getElementById('tx-amount');
      const categorySelect = document.getElementById('tx-category');
      const groupCategory = document.getElementById('group-category');
      const groupTransferTo = document.getElementById('group-transfer-to');
      const labelAccount = document.getElementById('label-account');
      const btnSave = document.getElementById('btn-save-tx');
      const btnDelete = document.getElementById('btn-delete-tx');
      const btnAddCategory = document.getElementById('btn-add-category');
      
      // Update categories based on Type
      const updateCategories = () => {
        const type = typeInput.value;
        const filteredCategories = state.categories.filter(c => c.typeHint === type || c.typeHint === 'both');
        // Retrieve initial selection constraint
        const initialSelected = categorySelect.getAttribute('data-initial');
        categorySelect.innerHTML = createCategoryOptions(filteredCategories, initialSelected);
      };
      
      // Update UI visibility based on Type
      const updateUIVisibility = () => {
        const type = typeInput.value;
        
        // Reset styles for all buttons
        [btnExpense, btnIncome, btnTransfer, btnBalance].forEach(btn => {
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
          labelAccount.textContent = 'Account';
        } else if (type === 'income') {
          btnIncome.className = 'btn btn-income';
          btnIncome.style.color = '';
          btnIncome.style.background = '';
          amountInput.className = 'amount-input text-income';
          groupCategory.style.display = 'block';
          groupTransferTo.style.display = 'none';
          labelAccount.textContent = 'Account';
        } else if (type === 'transfer') {
          btnTransfer.className = 'btn btn-primary';
          btnTransfer.style.color = '';
          btnTransfer.style.background = '';
          amountInput.className = 'amount-input'; // dark text for transfer
          groupCategory.style.display = 'none';
          groupTransferTo.style.display = 'block';
          labelAccount.textContent = 'From Account';
        } else if (type === 'balance') {
          btnBalance.className = 'btn btn-balance';
          btnBalance.style.color = '';
          btnBalance.style.background = '';
          amountInput.className = 'amount-input text-balance';
          groupCategory.style.display = 'none';
          groupTransferTo.style.display = 'none';
          labelAccount.textContent = 'Target Account';
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
      
      const updateRecurrentText = () => {
        const endGroup = document.getElementById('tx-recurrence-end-group');
        const endDateInput = document.getElementById('tx-recurrence-end-date');
        
        if (toggleRecurrent && toggleRecurrent.checked) {
          const vInt = intervalInput.value;
          const vFreq = freqInput.value;
          recurrentText.textContent = `Repeats every ${vInt} ${vFreq}`;
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
          recurrentText.textContent = 'Disabled';
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
      btnBalance.addEventListener('click', () => { typeInput.value = 'balance'; updateUIVisibility(); });
      
      // Add custom category
      btnAddCategory.addEventListener('click', () => {
        window.Components.Modal.show({
          title: 'New Category',
          content: `
            <div class="form-group">
              <label class="form-label">Category Name</label>
              <input type="text" id="new-cat-name" class="form-control" placeholder="e.g. Subscriptions">
            </div>
            <div class="form-group">
              <label class="form-label">Icon (Emoji)</label>
              <input type="text" id="new-cat-icon" class="form-control" placeholder="📱" maxlength="2">
            </div>
          `,
          onSave: (closeModal) => {
            const name = document.getElementById('new-cat-name').value.trim();
            const icon = document.getElementById('new-cat-icon').value.trim() || '📌';
            if (name) {
              window.Store.dispatch('ADD_CATEGORY', { 
                name, 
                icon, 
                typeHint: typeInput.value 
              });
              
              setTimeout(() => {
                const latestState = window.Store.getState();
                const filteredCategories = latestState.categories.filter(c => 
                  c.typeHint === typeInput.value || c.typeHint === 'both'
                );
                const newestCat = latestState.categories[latestState.categories.length - 1];
                categorySelect.setAttribute('data-initial', newestCat.id);
                updateCategories();
              }, 50);
              
              closeModal();
            }
          }
        });
      });
      
      // Save Transaction
      btnSave.addEventListener('click', () => {
        const type = typeInput.value;
        const amount = parseFloat(amountInput.value);
        if (isNaN(amount) || amount <= 0 && type !== 'balance') { // Balance can be 0 or negative
          amountInput.style.backgroundColor = 'var(--color-expense-bg)';
          setTimeout(() => amountInput.style.backgroundColor = 'transparent', 1000);
          return;
        }
        
        const date = document.getElementById('tx-date').value;
        const comment = document.getElementById('tx-comment').value.trim();
        const accountId = document.getElementById('tx-account').value;
        const categoryId = categorySelect.value;
        
        const editIdInput = document.getElementById('tx-edit-id');
        const isEdit = !!editIdInput;
        const targetId = isEdit ? editIdInput.value : null;

        const performSave = (updateFuture) => {
          let recurrenceObj = undefined;
          const toggleRec = document.getElementById('tx-is-recurrent');
          if (toggleRec && toggleRec.checked && type !== 'balance') {
            const sId = document.getElementById('tx-recurrence-series-id').value;
            const eDate = document.getElementById('tx-recurrence-end-date').value;
            const intervalVal = parseInt(document.getElementById('tx-recurrence-interval').value) || 1;
            const freqVal = document.getElementById('tx-recurrence-freq').value || 'months';
            recurrenceObj = {
              seriesId: sId || window.StackdDB.generateId(),
              interval: intervalVal,
              frequency: freqVal,
              endDate: eDate || (() => {
                 const d = new Date(date);
                 d.setFullYear(d.getFullYear() + 5);
                 return d.toISOString().split('T')[0];
              })(),
              nextDate: window.Store._calculateNextRecurrenceDate ? window.Store._calculateNextRecurrenceDate(date, intervalVal, freqVal) : undefined
            };
          }

          if (type === 'transfer') {
            const toAccountId = document.getElementById('tx-transfer-to').value;
            if (accountId === toAccountId) {
              alert("Cannot transfer to the same account.");
              return;
            }
            
            if (isEdit) {
              const transferRef = document.getElementById('tx-transfer-ref').value;
              window.Store.dispatch('UPDATE_TRANSFER', {
                 transferRef: transferRef,
                 amount: amount,
                 expenseAccountId: accountId,
                 incomeAccountId: toAccountId,
                 date: date,
                 note: comment || 'Transfer',
                 recurrence: recurrenceObj,
                 updateFuture: updateFuture
              });
            } else {
               const transferId = window.StackdDB.generateId();
               window.Store.dispatch('ADD_TRANSACTION', {
                 type: 'expense', amount: amount, accountId: accountId, categoryId: null,
                 date: date, comment: comment || 'Transfer Out', transferRef: transferId, recurrence: recurrenceObj
               });
               window.Store.dispatch('ADD_TRANSACTION', {
                 type: 'income', amount: amount, accountId: toAccountId, categoryId: null,
                 date: date, comment: comment || 'Transfer In', transferRef: transferId, recurrence: recurrenceObj
               });
            }
          } else if (type === 'balance') {
            if (isEdit) {
               window.Store.dispatch('UPDATE_TRANSACTION', {
                  id: targetId, amount: amount, accountId: accountId, date: date, comment: comment || 'Manual Balance Adjustment'
               });
            } else {
              const currentBalance = window.Store.getAccountBalance(accountId);
              const difference = amount - currentBalance;
              if (difference !== 0) {
                window.Store.dispatch('ADD_TRANSACTION', {
                  type: difference > 0 ? 'balance_adjustment' : 'expense',
                  amount: Math.abs(difference), accountId: accountId, categoryId: 'cat_balance',
                  date: date, comment: comment || 'Manual Balance Adjustment', isAdjustment: true
                });
              }
            }
          } else {
            if (isEdit) {
              window.Store.dispatch('UPDATE_TRANSACTION', {
                id: targetId, type: type, amount: amount, accountId: accountId, categoryId: categoryId,
                date: date, comment: comment, recurrence: recurrenceObj, updateFuture: updateFuture
              });
            } else {
              window.Store.dispatch('ADD_TRANSACTION', {
                type: type, amount: amount, accountId: accountId, categoryId: categoryId,
                date: date, comment: comment, recurrence: recurrenceObj
              });
            }
          }
          window.Router.navigate('#transactions');
        };

        const hasSeriesId = isEdit && document.getElementById('tx-recurrence-series-id').value;
        if (isEdit && hasSeriesId) {
            window.Components.Modal.show({
                title: 'Update Recurring Series',
                content: '<p>You are editing a recurring transaction. Do you want to modify only this specific transaction, or this and all future transactions in the series?</p>',
                saveText: 'This \u0026 Future',
                showDelete: true,
                onSave: (closeModal) => { closeModal(); performSave(true); },
                onDelete: (closeModal) => { closeModal(); performSave(false); }
            });
            setTimeout(() => {
                const btnDel = document.getElementById('modal-delete-btn');
                if (btnDel) { btnDel.textContent = 'Only This One'; btnDel.className = 'btn btn-secondary'; }
            }, 50);
        } else {
            performSave(false);
        }
      });

      if (btnDelete) {
        btnDelete.addEventListener('click', () => {
          const hasSeriesId = document.getElementById('tx-recurrence-series-id').value;
          
          const doDelete = (deleteFuture) => {
            window.Store.dispatch('DELETE_TRANSACTION', { id: document.getElementById('tx-edit-id').value, deleteFuture: deleteFuture });
            window.Router.navigate('#transactions');
          };

          if (hasSeriesId) {
            window.Components.Modal.show({
                title: 'Delete Recurring Series',
                content: '<p>You are deleting a recurring transaction. Do you want to delete only this specific transaction, or this and all future transactions in the series?</p>',
                saveText: 'This \u0026 Future',
                showDelete: true,
                onSave: (closeModal) => { closeModal(); doDelete(true); },
                onDelete: (closeModal) => { closeModal(); doDelete(false); }
            });
            setTimeout(() => {
                const btnSave = document.getElementById('modal-save-btn');
                if (btnSave) { btnSave.className = 'btn btn-danger'; }
                const btnDel = document.getElementById('modal-delete-btn');
                if (btnDel) { btnDel.textContent = 'Only This One'; btnDel.className = 'btn btn-secondary'; }
            }, 50);
          } else {
            window.Components.Modal.show({
              title: 'Delete Transaction?',
              content: '<p>Do you want to delete this transaction? This action cannot be undone.</p>',
              saveText: 'Keep',
              showDelete: true,
              onSave: (closeModal) => closeModal(),
              onDelete: (closeModal) => { doDelete(false); closeModal(); }
            });
          }
        });
      }
    }
  }
};

// Extend Views with v0.3 screens
Object.assign(window.Views, {

  // -------------------------
  // CATEGORIES VIEW (v0.3)
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
                  <div class="list-item category-row touch-target" data-id="${cat.id}" style="cursor: pointer; width: 100%;" tabindex="0" role="button" aria-label="Edit category ${cat.name}">
                    <div class="list-item-icon">${cat.icon}</div>
                    <div class="list-item-content">
                      <div class="list-item-title">${cat.name}</div>
                      <div class="list-item-subtitle">${txCount} transaction${txCount !== 1 ? 's' : ''}</div>
                    </div>
                    <div style="color: var(--text-tertiary); font-size: var(--text-sm);">›</div>
                  </div>`;
              }).join('')}
            </div>
          </div>`;
      };

      const income = state.categories.filter(c => c.typeHint === 'income');
      const expense = state.categories.filter(c => c.typeHint === 'expense');
      const both = state.categories.filter(c => c.typeHint === 'both');

      return `
        <div class="container animate-fade-in">
          <div class="page-header">
            <h1 class="page-header-title">Categories</h1>
            <button class="btn btn-primary" id="btn-create-category" aria-label="New category"
              style="width: 36px; height: 36px; min-width: 36px; padding: 0; border-radius: 50%; font-size: 1.4rem; line-height: 1; flex-shrink: 0; display: flex; align-items: center; justify-content: center;">+</button>
          </div>
          ${renderGroup('Income', income)}
          ${renderGroup('Expense', expense)}
          ${renderGroup('All Types', both)}
          ${state.categories.length === 0 ? '<p class="text-secondary" style="text-align: center; padding: 40px 0;">No categories yet.</p>' : ''}
        </div>`;
    },

    attachEvents(container, state) {
      const openPickerModal = (title, saveText, initEmoji, initName, initType, onSave, showDelete, onDelete) => {
        let selectedEmoji = initEmoji;
        window.Components.Modal.show({
          title,
          content: `
            <div class="form-group">
              <label class="form-label">Name</label>
              <input type="text" id="cat-name-input" class="form-control" value="${initName}" placeholder="e.g. Subscriptions" autocomplete="off">
            </div>
            ${initType !== undefined ? `
            <div class="form-group">
              <label class="form-label">Type</label>
              <select id="cat-type-input" class="form-control" style="appearance: none;">
                <option value="expense" ${initType==='expense'?'selected':''}>Expense</option>
                <option value="income" ${initType==='income'?'selected':''}>Income</option>
                <option value="both" ${initType==='both'?'selected':''}>All Types</option>
              </select>
            </div>` : ''}
            <div class="form-group" style="margin-bottom: 0;">
              <label class="form-label">Icon</label>
              ${window.Components.EmojiPicker.render(initEmoji)}
            </div>`,
          saveText,
          showDelete,
          onSave: (close) => onSave(close, () => selectedEmoji, () => document.getElementById('cat-type-input')?.value),
          onDelete
        });
        setTimeout(() => {
          const picker = document.getElementById('emoji-picker');
          if (picker) window.Components.EmojiPicker.attachEvents(picker, (e) => { selectedEmoji = e; });
          if (showDelete && onDelete === null) {
            const btn = document.getElementById('modal-delete-btn');
            if (btn) { btn.disabled = true; btn.style.opacity = '0.4'; btn.title = 'Remove all transactions in this category first'; }
          }
        }, 50);
      };

      // Create
      document.getElementById('btn-create-category')?.addEventListener('click', () => {
        openPickerModal('New Category', 'Create Category', '📌', '', 'expense',
          (close, getEmoji, getType) => {
            const name = document.getElementById('cat-name-input').value.trim();
            if (!name) return;
            window.Store.dispatch('ADD_CATEGORY', { name, icon: getEmoji(), typeHint: getType() || 'expense' });
            close();
          }, false, null
        );
      });

      // Edit
      container.querySelectorAll('.category-row').forEach(row => {
        row.addEventListener('click', () => {
          const catId = row.dataset.id;
          const cat = state.categories.find(c => c.id === catId);
          if (!cat) return;
          const txCount = state.transactions.filter(t => t.categoryId === catId).length;
          openPickerModal('Edit Category', 'Save', cat.icon, cat.name, undefined,
            (close, getEmoji) => {
              const name = document.getElementById('cat-name-input').value.trim() || cat.name;
              window.Store.dispatch('UPDATE_CATEGORY', { id: catId, name, icon: getEmoji() });
              close();
            },
            true,
            txCount === 0 ? (close) => { window.Store.dispatch('DELETE_CATEGORY', { id: catId }); close(); } : null
          );
        });
      });
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
      const currMonthLabel = d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

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
        return a.name.localeCompare(b.name);
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
        const barColor = isOver ? 'var(--color-expense-bg)' : 'var(--color-primary)';
        const pctColor = isOver || pct >= 90 ? 'var(--color-expense-bg)' : pct >= 75 ? '#f59e0b' : 'var(--text-secondary)';

        let carryOverBadge = '';
        if (hasBudget && bdg.carryover !== 0) {
          const sign = bdg.carryover > 0 ? '+' : '';
          const cf = window.Store.formatCurrency(Math.abs(bdg.carryover));
          carryOverBadge = `<span style="font-size: 0.7rem; padding: 2px 6px; background: var(--bg-surface-sunken); border-radius: 12px; margin-left: 6px; color: var(--text-secondary);">${sign}${cf} rollover</span>`;
        }

        if (hasBudget) {
          const limitFormatted = window.Store.formatCurrency(bdg.finalLimit);
          const spentFormatted = window.Store.formatCurrency(bdg.spent);
          return `
            <div class="list-item budget-cat-row touch-target" data-id="${cat.id}" style="cursor: pointer; flex-direction: column; align-items: stretch; gap: 10px; padding: 16px; width: 100%; box-sizing: border-box;" tabindex="0" role="button" aria-label="Edit budget for ${cat.name}">
              <div style="display: flex; justify-content: space-between; align-items: center;">
                <div style="display: flex; align-items: center; gap: 12px;">
                  <div class="list-item-icon" style="margin: 0;">${cat.icon}</div>
                  <div>
                    <div class="list-item-title">${cat.name}${carryOverBadge}</div>
                    <div class="list-item-subtitle">${spentFormatted} <span style="color: var(--text-tertiary);">of ${limitFormatted}</span></div>
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
            <div class="list-item budget-cat-row touch-target" data-id="${cat.id}" style="cursor: pointer; flex-direction: column; align-items: stretch; gap: 10px; padding: 16px; width: 100%; box-sizing: border-box; opacity: 0.5;" tabindex="0" role="button" aria-label="Set budget for ${cat.name}">
              <div style="display: flex; justify-content: space-between; align-items: center;">
                <div style="display: flex; align-items: center; gap: 12px;">
                  <div class="list-item-icon" style="margin: 0;">${cat.icon}</div>
                  <div>
                    <div class="list-item-title">${cat.name}</div>
                    <div class="list-item-subtitle" style="color: var(--text-tertiary);">No limit set — tap to configure</div>
                  </div>
                </div>
                <div style="font-size: 0.85rem; color: var(--text-secondary); font-weight: 600;">+ Set</div>
              </div>
              <div style="width: 100%; height: 8px; background: var(--bg-surface-sunken); border-radius: 4px; overflow: hidden; margin-top: 4px;">
                <div style="height: 100%; width: 0%; border-radius: 4px;"></div>
              </div>
            </div>
          `;
        }
      }).join('');

      return `
        <div class="container animate-fade-in" style="padding-bottom: 100px;">
          <h1 class="header-title" style="margin-top: var(--space-4); margin-bottom: var(--space-6);">Budget</h1>
          <!-- Month Selector -->
          <div style="display: flex; justify-content: space-between; align-items: center; margin-top: var(--space-4); margin-bottom: var(--space-6); background: var(--bg-surface); padding: var(--space-2); border-radius: var(--radius-lg); box-shadow: 0 4px 12px rgba(0,0,0,0.02);">
            <button id="bdg-prev-month" class="btn" style="width: 44px; height: 44px; padding: 0; background: transparent; color: var(--text-secondary);" ${!hasPrevMonth ? 'disabled' : ''}>
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
            </button>
            <div id="bdg-month-picker-btn" style="cursor: pointer; display: flex; align-items: center; justify-content: center; font-family: var(--font-family-display); font-weight: 600; font-size: 1.1rem; color: var(--text-primary); background: var(--bg-surface-sunken); padding: 8px 16px; border-radius: var(--radius-md); gap: 8px;">
              ${currMonthLabel} <span style="font-size: 0.8rem; color: var(--text-tertiary);">▼</span>
            </div>
            <button id="bdg-next-month" class="btn" style="width: 44px; height: 44px; padding: 0; background: transparent; color: var(--text-secondary);" ${!hasNextMonth ? 'disabled' : ''}>
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6"/></svg>
            </button>
          </div>

          <!-- Chart Area -->
          <div class="card card-elevated" style="margin-bottom: var(--space-6); padding: var(--space-5); text-align: center;">
            <div style="position: relative; width: 160px; height: 160px; margin: 0 auto; margin-bottom: var(--space-4);">
              <canvas id="budgetChart"></canvas>
              <div style="position: absolute; top: 0; left: 0; right: 0; bottom: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; pointer-events: none;">
                <span style="font-size: var(--text-sm); color: var(--text-secondary);">Allocated</span>
                <strong style="font-size: 1.2rem; font-family: var(--font-family-display);">${window.Store.formatCurrency(totalAllocated)}</strong>
              </div>
            </div>
            <div style="display: flex; justify-content: space-between; font-size: var(--text-sm);">
              <div style="text-align: left;">
                <span style="color: var(--text-secondary);">Total Spent</span><br>
                <strong>${window.Store.formatCurrency(totalSpent)}</strong>
              </div>
              <div style="text-align: right;">
                <span style="color: var(--text-secondary);">Remaining</span><br>
                <strong style="color: ${totalAllocated - totalSpent >= 0 ? 'var(--color-income-val)' : 'var(--color-expense-val)'};">${window.Store.formatCurrency(totalAllocated - totalSpent)}</strong>
              </div>
            </div>
          </div>

          <!-- Type Toggle -->
          <div style="display: flex; background: var(--bg-surface); border-radius: var(--radius-sm); padding: 4px; margin-bottom: var(--space-4);">
            <button id="bdg-toggle-expense" class="${this.currentBudgetFilter === 'expense' ? 'btn btn-danger' : 'btn'}" style="flex: 1; border-radius: var(--radius-sm); padding: 8px 4px; font-size: 13px; ${this.currentBudgetFilter !== 'expense' ? 'color: var(--text-secondary); background: transparent;' : ''}">Expenses</button>
            <button id="bdg-toggle-income" class="${this.currentBudgetFilter === 'income' ? 'btn btn-income' : 'btn'}" style="flex: 1; border-radius: var(--radius-sm); padding: 8px 4px; font-size: 13px; ${this.currentBudgetFilter !== 'income' ? 'color: var(--text-secondary); background: transparent;' : ''}">Income</button>
          </div>

          <!-- Category List -->
          <div class="list-group">
            ${categoryCards.length > 0 ? categoryCards : '<p class="text-secondary text-center" style="padding: 20px;">No categories in this view.</p>'}
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
            <h2 style="font-size: 1.1rem; margin: 0;">${cat.icon} ${cat.name}</h2>
            <button class="btn btn-icon" id="btn-bdg-save" style="color: var(--color-accent);">
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
            </button>
          </div>

          <div class="container" style="padding-top: var(--space-6); padding-bottom: 100px;">
            <div class="form-group">
              <label class="form-label">Monthly Limit</label>
              <div style="position: relative;">
                <span style="position: absolute; left: 16px; top: 50%; transform: translateY(-50%); color: var(--text-tertiary); font-size: 1.5rem; pointer-events: none;">${currSym}</span>
                <input type="number" id="bdg-amount" class="form-control" placeholder="0.00" value="${budget.amount || ''}" style="font-size: 1.5rem; padding-left: 40px; font-weight: 600;" step="0.01" inputmode="decimal">
              </div>
            </div>

            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-4);">
              <div class="form-group">
                <label class="form-label">Start Month</label>
                <input type="text" id="bdg-start" class="form-control" value="${budget.startDate || ''}" readonly placeholder="Select month" style="cursor: pointer; background: var(--bg-surface-sunken);">
              </div>
              <div class="form-group">
                <label class="form-label">End Month <span style="font-weight: normal; color: var(--text-tertiary);">(Optional)</span></label>
                <input type="text" id="bdg-end" class="form-control" value="${budget.endDate || ''}" readonly placeholder="No end date" style="cursor: pointer; background: var(--bg-surface-sunken);">
              </div>
            </div>

            <div class="card card-elevated" style="margin-top: var(--space-6); padding: var(--space-4); display: flex; align-items: center; justify-content: space-between;">
              <div>
                <strong style="display: block; margin-bottom: 4px;">Cumulative Rollover</strong>
                <span style="font-size: var(--text-sm); color: var(--text-secondary);">Unused budget carries over to next month. Overspending deducts from next month.</span>
              </div>
              <label class="toggle-switch">
                <input type="checkbox" id="bdg-cumulative" ${budget.isCumulative ? 'checked' : ''}>
                <span class="slider"></span>
              </label>
            </div>

            ${budget.amount ? `
            <button id="btn-bdg-delete" class="btn" style="width: 100%; margin-top: var(--space-6); color: var(--color-expense); background: var(--color-expense-bg); border: none;">Remove Budget Limit</button>
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
      if (this.editCategoryId) {
        // Edit Mode Events — use container.querySelector for reliable binding
        const savedCategoryId = this.editCategoryId;

        container.querySelector('#btn-bdg-back')?.addEventListener('click', () => {
          this.editCategoryId = null;
          window.Store.emit();
        });

        const startInput = container.querySelector('#bdg-start');
        startInput?.addEventListener('click', () => {
          window.Components.MonthPicker.show({
            initialValue: startInput.value || (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; })(),
            onSelect: (val) => { startInput.value = val; }
          });
        });

        const endInput = container.querySelector('#bdg-end');
        endInput?.addEventListener('click', () => {
          window.Components.MonthPicker.show({
            initialValue: endInput.value || startInput?.value || (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; })(),
            onSelect: (val) => { endInput.value = val; }
          });
        });

        container.querySelector('#btn-bdg-save')?.addEventListener('click', () => {
          const amt = parseFloat(container.querySelector('#bdg-amount')?.value) || 0;
          const start = container.querySelector('#bdg-start')?.value || '';
          const end = container.querySelector('#bdg-end')?.value || '';
          const isCum = container.querySelector('#bdg-cumulative')?.checked || false;

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

        container.querySelector('#btn-bdg-delete')?.addEventListener('click', () => {
          this.editCategoryId = null;
          window.Store.dispatch('SAVE_BUDGET', {
            categoryId: savedCategoryId,
            amount: 0,
            startDate: '',
            endDate: null,
            isCumulative: false
          });
        });

      } else {
        // List Mode Events
        const today = new Date();
        const currentPhysicalMonthStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
        const selectedMonth = state.activeMonthFilter || currentPhysicalMonthStr;
        const [y, m] = selectedMonth.split('-');

        document.getElementById('bdg-prev-month')?.addEventListener('click', () => {
          const prevD = new Date(parseInt(y), parseInt(m) - 2, 1);
          const nextVal = `${prevD.getFullYear()}-${String(prevD.getMonth() + 1).padStart(2, '0')}`;
          window.Store.dispatch('SET_MONTH_FILTER', nextVal);
        });
        document.getElementById('bdg-next-month')?.addEventListener('click', () => {
          const nextD = new Date(parseInt(y), parseInt(m), 1);
          const nextVal = `${nextD.getFullYear()}-${String(nextD.getMonth() + 1).padStart(2, '0')}`;
          window.Store.dispatch('SET_MONTH_FILTER', nextVal);
        });

        document.getElementById('bdg-toggle-expense')?.addEventListener('click', () => {
          this.currentBudgetFilter = 'expense';
          window.Store.emit();
        });
        document.getElementById('bdg-toggle-income')?.addEventListener('click', () => {
          this.currentBudgetFilter = 'income';
          window.Store.emit();
        });

        document.getElementById('bdg-month-picker-btn')?.addEventListener('click', () => {
          const today = new Date();
          const currentPhysicalMonthStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
          window.Components.MonthPicker.show({
            initialValue: state.activeMonthFilter || currentPhysicalMonthStr,
            onSelect: (val) => window.Store.dispatch('SET_MONTH_FILTER', val)
          });
        });

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

          new Chart(ctx, {
            type: 'doughnut',
            data: {
              labels: ['Spent', 'Remaining'],
              datasets: [{
                data: chartData,
                backgroundColor: overspent 
                  ? ['#e91e63', '#f0f4f8'] // Red for overspent 
                  : ['#2a6bbd', '#e4e9ee'], // Blue for spent, grey for remaining
                borderWidth: 0,
                spacing: 2
              }]
            },
            options: {
              responsive: true,
              maintainAspectRatio: false,
              cutout: '80%',
              plugins: { tooltip: { enabled: false }, legend: { display: false } },
              animation: false
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
    }
  },

  // -------------------------
  // OTHERS VIEW (formerly Settings)
  // -------------------------
  OthersView: {
    render(state) {
      return `
        <div class="container animate-fade-in" style="padding-bottom: 100px;">
          <h1 class="header-title" style="margin-top: var(--space-4); margin-bottom: var(--space-8);">Others</h1>

          <div class="section-title">Manage</div>
          <div class="card card-elevated" style="margin-bottom: var(--space-6); padding: var(--space-4) var(--space-5);">
            <div id="btn-manage-accounts" class="touch-target" style="display: flex; align-items: center; justify-content: space-between; cursor: pointer; border-bottom: 1px solid var(--border-color); padding-bottom: var(--space-4); margin-bottom: var(--space-4); width: 100%;" tabindex="0" role="button" aria-label="Manage your accounts">
              <div style="display: flex; align-items: center; gap: var(--space-3);">
                <div class="list-item-icon" style="margin: 0;">🏦</div>
                <div>
                  <div class="list-item-title">Accounts</div>
                  <div class="list-item-subtitle">${state.accounts.length} account${state.accounts.length !== 1 ? 's' : ''}</div>
                </div>
              </div>
              <div style="color: var(--text-tertiary);">›</div>
            </div>
            
            <a href="#categories" style="display: flex; align-items: center; justify-content: space-between; text-decoration: none;">
              <div style="display: flex; align-items: center; gap: var(--space-3);">
                <div class="list-item-icon" style="margin: 0;">🏷️</div>
                <div>
                  <div class="list-item-title">Categories</div>
                  <div class="list-item-subtitle">${state.categories.length} categories</div>
                </div>
              </div>
              <div style="color: var(--text-tertiary);">›</div>
            </a>
          </div>

          <div class="section-title">Currency</div>
          <div class="card card-elevated" style="margin-bottom: var(--space-6); padding: var(--space-4) var(--space-5);">
            <div id="btn-open-currency" class="touch-target" style="display: flex; align-items: center; justify-content: space-between; cursor: pointer; width: 100%;" tabindex="0" role="button" aria-label="Choose currency">
              <div style="display: flex; align-items: center; gap: var(--space-3);">
                <div class="list-item-icon" style="margin: 0;">🪙</div>
                <div>
                  <div class="list-item-title">Currency</div>
                  <div class="list-item-subtitle" id="current-currency-display">${['USD','EUR','JPY','GBP','CNY'].map(c => { const names = { USD:'USD — US Dollar', EUR:'EUR — Euro', JPY:'JPY — Japanese Yen', GBP:'GBP — Pound Sterling', CNY:'CNY — Renminbi' }; return c === state.currency ? names[c] : null; }).filter(Boolean)[0] || 'USD — US Dollar'}</div>
                </div>
              </div>
              <div style="color: var(--text-tertiary);">›</div>
            </div>
          </div>

          <div class="section-title">Data Export</div>
          <div class="card card-elevated" style="margin-bottom: var(--space-6); padding: var(--space-5);">
            <p style="color: var(--text-secondary); font-size: var(--text-sm); margin-bottom: var(--space-4); line-height: 1.6;">
              Export your data as CSV files to use in Google Sheets, Excel, or any spreadsheet app.
            </p>
            <div style="display: flex; flex-direction: column; gap: var(--space-3);">
              <button class="btn btn-secondary" id="btn-export-accounts">Export Accounts</button>
              <button class="btn btn-secondary" id="btn-export-categories">Export Categories</button>
              <button class="btn btn-secondary" id="btn-export-transactions">Export Transactions</button>
            </div>
          </div>
          
          <div class="section-title">Data Import</div>
          <div class="card card-elevated" style="margin-bottom: var(--space-6); padding: var(--space-5);">
            <p style="color: var(--text-secondary); font-size: var(--text-sm); margin-bottom: var(--space-4); line-height: 1.6;">
              Import historical records from other apps or bank CSV statements. File must include columns: <b>Date, Amount, Type, Account, Category, Note</b>.
            </p>
            <input type="file" id="import-csv-file" accept=".csv" style="display: none;">
            <button class="btn btn-primary" id="btn-import-csv" style="width: 100%;">Import CSV</button>
          </div>
          
          <div class="section-title">Support</div>
          <div class="card card-elevated" style="margin-bottom: var(--space-8); padding: var(--space-4) var(--space-5);">
            <div class="list-group">
              <div class="list-item" style="cursor: pointer;" onclick="alert('FAQs coming soon in a future update!')">
                <div class="list-item-content"><div class="list-item-title">FAQ</div></div>
                <div style="color: var(--text-tertiary); font-size: var(--text-sm);">›</div>
              </div>
              <div class="list-item" style="cursor: pointer;" onclick="alert('Instructions Manual coming soon!')">
                <div class="list-item-content"><div class="list-item-title">Instructions Manual</div></div>
                <div style="color: var(--text-tertiary); font-size: var(--text-sm);">›</div>
              </div>
              <div class="list-item" style="cursor: pointer;" onclick="alert('Tutorials coming soon!')">
                <div class="list-item-content"><div class="list-item-title">Tutorials</div></div>
                <div style="color: var(--text-tertiary); font-size: var(--text-sm);">›</div>
              </div>
              <div class="list-item" style="cursor: pointer;" onclick="alert('Thank you for trying Stackd! Send feedback to hi@stackd.com')">
                <div class="list-item-content"><div class="list-item-title" style="color: var(--color-accent);">Send a Feedback</div></div>
                <div style="color: var(--text-tertiary); font-size: var(--text-sm);">›</div>
              </div>
              <div class="list-item" style="cursor: pointer;" onclick="alert('App Store rating flow coming soon.')">
                <div class="list-item-content"><div class="list-item-title" style="color: var(--color-accent);">Rate the App</div></div>
                <div style="color: var(--text-tertiary); font-size: var(--text-sm);">›</div>
              </div>
              <div class="list-item" style="cursor: pointer; border-bottom: none; padding-bottom: 0;" onclick="alert('Terms & Conditions document coming soon.')">
                <div class="list-item-content"><div class="list-item-title">Terms and Conditions</div></div>
                <div style="color: var(--text-tertiary); font-size: var(--text-sm);">›</div>
              </div>
            </div>
          </div>
          
          <div class="section-title" style="color: var(--color-expense-bg);">Danger Zone</div>
          <div class="card card-elevated" style="margin-bottom: var(--space-8); padding: var(--space-4) var(--space-5); border: 1px solid var(--color-expense-bg);">
            <div id="btn-factory-reset" style="display: flex; align-items: center; justify-content: space-between; cursor: pointer;">
              <div style="display: flex; align-items: center; gap: var(--space-3);">
                <div class="list-item-icon" style="margin: 0; background: var(--color-expense-bg); color: #fff;">⚠️</div>
                <div>
                  <div class="list-item-title" style="color: var(--color-expense-bg);">Factory Reset</div>
                  <div class="list-item-subtitle text-secondary">Erase all data and start fresh</div>
                </div>
              </div>
            </div>
          </div>
          
        </div>`;
    },
    attachEvents(container, state) {
      document.getElementById('btn-export-accounts')?.addEventListener('click', () => window.StackdExport.exportAccounts(state));
      document.getElementById('btn-export-categories')?.addEventListener('click', () => window.StackdExport.exportCategories(state));
      document.getElementById('btn-export-transactions')?.addEventListener('click', () => window.StackdExport.exportTransactions(state));

      // Currency picker
      const btnCurrency = document.getElementById('btn-open-currency');
      if (btnCurrency) {
        const CURRENCIES = [
          { code: 'USD', symbol: '$', label: 'USD — US Dollar' },
          { code: 'EUR', symbol: '\u20ac', label: 'EUR — Euro' },
          { code: 'JPY', symbol: '\u00a5', label: 'JPY — Japanese Yen' },
          { code: 'GBP', symbol: '\u00a3', label: 'GBP — Pound Sterling' },
          { code: 'CNY', symbol: '\u00a5', label: 'CNY — Chinese Renminbi' },
        ];
        const openCurrencyPicker = () => {
          const current = window.Store.getState().currency || 'USD';
          const optionsHtml = CURRENCIES.map(c => `
            <div class="currency-opt list-item" data-code="${c.code}" style="cursor: pointer; display: flex; align-items: center; gap: 16px; padding: 14px 0; border-bottom: 1px solid var(--bg-surface-sunken);" tabindex="0" role="button">
              <span style="font-size: 1.4rem; width: 32px; text-align: center; font-family: var(--font-family-display); flex-shrink: 0;">${c.symbol}</span>
              <span style="flex: 1; font-weight: ${c.code === current ? '700' : '400'}; color: ${c.code === current ? 'var(--text-primary)' : 'var(--text-secondary)'}">${c.label}</span>
              ${c.code === current ? '<span style="color: var(--color-accent); font-size: 1.1rem;">✓</span>' : ''}
            </div>
          `).join('');
          window.Components.Modal.show({
            title: 'Choose Currency',
            content: `<div>${optionsHtml}</div>`,
            saveText: 'Done',
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
          
          btnImport.textContent = "Importing...";
          btnImport.disabled = true;
          
          if (window.StackdImport) {
            window.StackdImport.importTransactions(file, state, (result) => {
              alert(`Success! Imported ${result.importedCount} transactions.\nCreated ${result.newAccounts} missing accounts, and ${result.newCategories} missing categories automatically.`);
              btnImport.textContent = "Import CSV";
              btnImport.disabled = false;
              fileInput.value = ''; // reset
            }, (err) => {
              alert(`Import failed: ${err.message}`);
              btnImport.textContent = "Import CSV";
              btnImport.disabled = false;
              fileInput.value = ''; // reset
            });
          } else {
            alert("Import module not loaded.");
            btnImport.textContent = "Import CSV";
            btnImport.disabled = false;
          }
        });
      }
      
      // Manage Accounts Sub-menu (Simplified v0.8 Accounts view embedded in modal)
      const btnManageAccounts = document.getElementById('btn-manage-accounts');
      if (btnManageAccounts) {
        btnManageAccounts.addEventListener('click', () => {
          let accountsListHtml = state.accounts.map(acc => `
            <div class="list-item" style="display: flex; justify-content: space-between; align-items: center;">
              <div style="display: flex; align-items: center; gap: 12px;">
                <div style="width: 12px; height: 12px; border-radius: 50%; background-color: ${acc.color};"></div>
                <strong>${acc.name}</strong>
              </div>
            </div>
          `).join('');
          
          if (state.accounts.length === 0) accountsListHtml = '<p class="text-secondary text-center">No accounts yet.</p>';
          
          window.Components.Modal.show({
            title: 'Manage Accounts',
            content: `
              <p class="text-secondary" style="font-size: 14px; margin-bottom: 24px;">
                Edit and Delete actions are available directly from the Overview page by tapping the ... menu on any account.
              </p>
              <div class="list-group" style="margin-bottom: 24px;">
                ${accountsListHtml}
              </div>
              <button id="modal-btn-new-account" class="btn btn-primary" style="width: 100%;">+ Create New Account</button>
            `,
            saveText: 'Done',
            onSave: (closeModal) => closeModal()
          });
          
          // Wire up the inner create button
          setTimeout(() => {
            const innerBtn = document.getElementById('modal-btn-new-account');
            if (innerBtn) {
              innerBtn.addEventListener('click', () => {
                // Assuming they close the manage modal to open the new one
                document.getElementById('global-modal').style.display = 'none';
                window.Components.Modal.show({
                  title: 'New Account',
                  content: `
                    <div class="form-group">
                      <label class="form-label">Account Name</label>
                      <input type="text" id="new-account-name" class="form-control" placeholder="e.g. Wallet, Checking..." autocomplete="off">
                    </div>
                    <div class="form-group">
                      <label class="form-label">Opening Balance (optional)</label>
                      <input type="number" id="new-account-balance" class="form-control" placeholder="0.00" step="0.01" inputmode="decimal">
                    </div>
                    <div class="form-group" style="margin-bottom: 0;">
                      <label class="form-label">Opening Balance Date</label>
                      <input type="date" id="new-account-date" class="form-control" value="${new Date().toISOString().split('T')[0]}">
                    </div>
                  `,
                  saveText: 'Create Account',
                  onSave: (closeModal) => {
                    const name = document.getElementById('new-account-name').value.trim();
                    if (name) {
                      const ob = parseFloat(document.getElementById('new-account-balance').value) || 0;
                      const dDate = document.getElementById('new-account-date').value;
                      window.Store.dispatch('ADD_ACCOUNT', { name, openingBalance: ob, openingDate: dDate });
                      closeModal();
                    }
                  }
                });
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
            title: 'Factory Reset?',
            content: '<p style="color: var(--color-expense); font-weight: 500;">WARNING: This will permanently delete ALL your accounts, budgets, and transactions across the application. This cannot be undone.</p>',
            saveText: 'Keep Data',
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

