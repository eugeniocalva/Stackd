// components.js - Reusable UI Components
window.Components = {
  BottomNav: {
    render() {
      return `
        <a href="#dashboard" class="nav-item touch-target" data-view="dashboard" aria-label="Overview">
          <div class="nav-icon">📊</div>
          <div class="nav-label">Overview</div>
        </a>
        <a href="#budget" class="nav-item touch-target" data-view="budget" aria-label="Budget">
          <div class="nav-icon">🎯</div>
          <div class="nav-label">Budget</div>
        </a>
        <a href="#add" class="nav-fab touch-target" data-view="add" aria-label="Add New Transaction">+</a>
        <a href="#transactions" class="nav-item touch-target" data-view="transactions" aria-label="History">
          <div class="nav-icon">📋</div>
          <div class="nav-label">History</div>
        </a>
        <a href="#settings" class="nav-item touch-target" data-view="settings" aria-label="More Options">
          <div class="nav-icon" style="font-size: 1.5rem;">•••</div>
          <div class="nav-label">Others</div>
        </a>
      `;
    },
    updateActiveState(container, activeView) {
      const items = container.querySelectorAll('.nav-item, .nav-fab');
      items.forEach(item => {
        const isActive = item.dataset.view === activeView;
        item.classList.toggle('active', isActive);
        if (isActive) {
          item.setAttribute('aria-current', 'page');
        } else {
          item.removeAttribute('aria-current');
        }
      });
    },
    attachEvents(container) {
      const handleTabAction = (e, navItem) => {
        const targetView = navItem.dataset.view;
        const currentView = window.Store.getState() ? window.Store.getState().activeView : null;

        // Visual feedback handled by CSS scale animation
        if (targetView === currentView) {
          e.preventDefault();
          if (window.Router && window.Router.handleRouteChange) {
            window.Router.handleRouteChange();
          }
          
          window.dispatchEvent(new CustomEvent('scroll-to-top', { 
            detail: { view: targetView } 
          }));
        }
      };

      // Listen for both click and touchstart for fastest mobile response
      container.addEventListener('click', (e) => {
        const navItem = e.target.closest('.nav-item, .nav-fab');
        if (navItem) handleTabAction(e, navItem);
      });
      
      container.addEventListener('touchstart', (e) => {
        // We only trigger logic on touchstart if it's the nav bar
        const navItem = e.target.closest('.nav-item, .nav-fab');
        if (navItem) {
          // Visual feedback handled by CSS scale animation
        }
      }, { passive: true });
    }
  },

  Modal: {
    show(options) {
      const { title, content, onSave, saveText = 'Save', showDelete = false, onDelete } = options;
      const container = document.getElementById('modal-container');
      container.innerHTML = `
        <div class="modal-backdrop" id="active-modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">
          <div class="modal-content">
            <div class="modal-handle"></div>
            <h2 id="modal-title" class="header-title" style="margin-bottom: var(--space-4); font-size: var(--text-2xl);">${title}</h2>
            <div class="modal-body">${content}</div>
            <div style="margin-top: var(--space-6); display: flex; flex-direction: column; gap: var(--space-3);">
              <button class="btn btn-primary" id="modal-save-btn">${saveText}</button>
              ${showDelete ? `<button class="btn btn-danger" id="modal-delete-btn" aria-label="Delete this item">Delete</button>` : ''}
              <button class="btn btn-secondary" id="modal-cancel-btn" aria-label="Cancel and close modal">Cancel</button>
            </div>
          </div>
        </div>`;
      requestAnimationFrame(() => {
        const backdrop = document.getElementById('active-modal');
        if (backdrop) backdrop.classList.add('open');
      });
      const boundClose = () => this.hide();
      document.getElementById('modal-save-btn')?.addEventListener('click', () => {
        if (onSave) onSave(boundClose); else this.hide();
      });
      document.getElementById('modal-cancel-btn')?.addEventListener('click', boundClose);
      document.getElementById('modal-delete-btn')?.addEventListener('click', () => {
        if (onDelete) onDelete(boundClose);
      });
      document.getElementById('active-modal')?.addEventListener('click', (e) => {
        if (e.target.id === 'active-modal') boundClose();
      });
    },
    hide() {
      const backdrop = document.getElementById('active-modal');
      if (backdrop) {
        backdrop.classList.remove('open');
        setTimeout(() => { document.getElementById('modal-container').innerHTML = ''; }, 300);
      }
    }
  },

  EmojiPicker: {
    GROUPS: [
      { label: '🍕 Food & Drink', emojis: [
        {e:'🍕',k:'pizza'},{e:'🍔',k:'burger'},{e:'🌮',k:'taco'},{e:'🍜',k:'noodles'},
        {e:'🍱',k:'bento food'},{e:'🥗',k:'salad'},{e:'☕',k:'coffee'},
        {e:'🍺',k:'beer'},{e:'🛒',k:'grocery cart'},{e:'🍣',k:'sushi'},{e:'🍰',k:'cake'},{e:'🥤',k:'drink soda'}
      ]},
      { label: '🚗 Transport', emojis: [
        {e:'🚗',k:'car'},{e:'🚕',k:'taxi'},{e:'🚌',k:'bus'},{e:'🚂',k:'train'},
        {e:'🚲',k:'bike bicycle'},{e:'⛽',k:'gas fuel'},{e:'🅿️',k:'parking'},
        {e:'🛵',k:'scooter'},{e:'🏎️',k:'racing car'},{e:'⛵',k:'boat'},{e:'🚁',k:'helicopter'},{e:'🛻',k:'truck'}
      ]},
      { label: '🏠 Home', emojis: [
        {e:'🏠',k:'house home'},{e:'🏡',k:'house garden'},{e:'🛋️',k:'sofa couch'},
        {e:'🔧',k:'wrench repair'},{e:'💡',k:'light bulb'},{e:'🧹',k:'broom cleaning'},
        {e:'🪴',k:'plant'},{e:'🔑',k:'key lock'},{e:'📦',k:'box package'},{e:'🧺',k:'laundry'},{e:'🛁',k:'bath'},{e:'🪟',k:'window'}
      ]},
      { label: '💊 Health', emojis: [
        {e:'💊',k:'pill medicine'},{e:'🏥',k:'hospital'},{e:'🧘',k:'yoga'},
        {e:'🏃',k:'running exercise'},{e:'💪',k:'gym muscle'},{e:'🩺',k:'doctor'},
        {e:'🧴',k:'lotion beauty'},{e:'🦷',k:'tooth dental'},{e:'👁️',k:'eye vision'},{e:'🩻',k:'xray'},{e:'🏋️',k:'weights'},{e:'🧬',k:'dna'}
      ]},
      { label: '🎮 Fun & Leisure', emojis: [
        {e:'🎮',k:'game'},{e:'🎬',k:'movie cinema'},{e:'🎵',k:'music'},
        {e:'📚',k:'books reading'},{e:'⚽',k:'sport football'},{e:'🎨',k:'art'},
        {e:'🎭',k:'theatre'},{e:'🎤',k:'singing'},{e:'🎲',k:'dice game'},{e:'🏊',k:'swim'},{e:'🎸',k:'guitar'},{e:'🧩',k:'puzzle'}
      ]},
      { label: '💳 Finance & Work', emojis: [
        {e:'💳',k:'card payment'},{e:'💰',k:'money salary'},{e:'📈',k:'chart investment'},
        {e:'💻',k:'laptop work'},{e:'🏦',k:'bank'},{e:'💼',k:'briefcase'},
        {e:'📊',k:'chart business'},{e:'🧾',k:'receipt invoice'},{e:'💵',k:'dollar cash'},{e:'🪙',k:'coin'},{e:'📑',k:'document'},{e:'🔐',k:'lock secure'}
      ]},
      { label: '🛍️ Shopping', emojis: [
        {e:'🛍️',k:'shopping bag'},{e:'👗',k:'dress clothes'},{e:'👟',k:'sneaker shoe'},
        {e:'💄',k:'lipstick beauty'},{e:'🕶️',k:'sunglasses'},{e:'⌚',k:'watch'},
        {e:'📱',k:'phone mobile'},{e:'💍',k:'ring jewellery'},{e:'🎁',k:'gift present'},{e:'🧣',k:'scarf'},{e:'👜',k:'bag'},{e:'🧢',k:'hat cap'}
      ]},
      { label: '✈️ Travel', emojis: [
        {e:'✈️',k:'airplane flight'},{e:'🏨',k:'hotel'},{e:'🗺️',k:'map travel'},
        {e:'🌍',k:'world globe'},{e:'🏖️',k:'beach vacation'},{e:'🏔️',k:'mountain hiking'},
        {e:'🎟️',k:'ticket event'},{e:'🧳',k:'luggage'},{e:'🚢',k:'ship cruise'},{e:'🗼',k:'tower'},{e:'🏕️',k:'camping'},{e:'🌴',k:'palm holiday'}
      ]},
      { label: '🌿 Other', emojis: [
        {e:'📌',k:'pin other'},{e:'🌿',k:'plant nature'},{e:'⭐',k:'star favourite'},
        {e:'🔖',k:'bookmark'},{e:'🎯',k:'target goal'},{e:'🌈',k:'rainbow'},
        {e:'🏷️',k:'label tag'},{e:'💬',k:'chat message'},{e:'🔔',k:'bell'},{e:'🎉',k:'party'},{e:'🌙',k:'moon night'},{e:'🐾',k:'paw pet'}
      ]}
    ],

    render(selectedEmoji = '📌') {
      return `
        <div class="emoji-picker" id="emoji-picker">
          <input type="text" id="emoji-search" class="form-control" placeholder="🔍 Search emoji..." autocomplete="off" style="font-size: var(--text-sm); margin-bottom: var(--space-3);">
          <div id="emoji-selected-display" style="text-align: center; font-size: 2rem; min-height: 40px; margin-bottom: var(--space-2);">${selectedEmoji}</div>
          <div id="emoji-grid" style="max-height: 180px; overflow-y: auto;">${this._renderGroups(this.GROUPS)}</div>
        </div>`;
    },

    _renderGroups(groups, filter = '') {
      return groups.map(group => {
        const filtered = filter
          ? group.emojis.filter(e => e.k.includes(filter.toLowerCase()) || e.e.includes(filter))
          : group.emojis;
        if (!filtered.length) return '';
        return `<div style="margin-bottom: var(--space-3);">
          <div class="section-title">${group.label}</div>
          <div style="display: flex; flex-wrap: wrap; gap: 4px;" role="group" aria-label="${group.label}">
            ${filtered.map(e => `<button class="emoji-btn touch-target" data-emoji="${e.e}" aria-label="Select emoji ${e.k}" aria-pressed="false" style="width: 44px; height: 44px; border-radius: var(--radius-md); background: var(--bg-surface); border: none; font-size: 1.2rem; cursor: pointer;">${e.e}</button>`).join('')}
          </div></div>`;
      }).join('');
    },

    attachEvents(container, onSelect) {
      const searchInput = container.querySelector('#emoji-search');
      const grid = container.querySelector('#emoji-grid');
      const display = container.querySelector('#emoji-selected-display');
      if (searchInput) {
        searchInput.addEventListener('input', (e) => {
          grid.innerHTML = this._renderGroups(this.GROUPS, e.target.value.trim());
          this._bindClicks(grid, display, onSelect);
        });
      }
      this._bindClicks(grid, display, onSelect);
    },

    _bindClicks(grid, display, onSelect) {
      grid.querySelectorAll('.emoji-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.preventDefault();
          const emoji = btn.dataset.emoji;
          if (display) display.textContent = emoji;
          grid.querySelectorAll('.emoji-btn').forEach(b => {
            b.style.background = 'var(--bg-surface)';
            b.setAttribute('aria-pressed', 'false');
          });
          btn.style.background = 'var(--bg-surface-sunken)';
          btn.setAttribute('aria-pressed', 'true');
          if (onSelect) onSelect(emoji);
        });
      });
    },

    show(options) {
      const { initialEmoji = '📌', onSelect } = options;
      const container = document.getElementById('modal-container');
      
      const div = document.createElement('div');
      div.innerHTML = `
        <div class="modal-backdrop" id="active-emoji-picker" style="z-index: 10000;" role="dialog" aria-modal="true" aria-labelledby="ep-title">
          <div class="modal-content" style="padding: 0; overflow: hidden; display: flex; flex-direction: column; max-height: 85vh;">
            <div style="padding: 16px; border-bottom: 1px solid var(--border-color); display: flex; justify-content: space-between; align-items: center;">
              <button class="btn btn-secondary" id="ep-cancel" style="padding: 8px 16px;" aria-label="Cancel emoji selection">Cancel</button>
              <h3 id="ep-title" style="margin: 0; font-size: 1.1rem; font-family: var(--font-family-display);">Select Icon</h3>
              <button class="btn btn-primary" id="ep-confirm" style="padding: 8px 16px;" aria-label="Confirm emoji selection">Done</button>
            </div>
            
            <div style="padding: var(--space-4); overflow-y: auto;">
              ${this.render(initialEmoji)}
            </div>
          </div>
        </div>`;
      container.appendChild(div.firstElementChild);
      
      requestAnimationFrame(() => {
        const backdrop = document.getElementById('active-emoji-picker');
        if (backdrop) {
          backdrop.classList.add('open');
          // Focus search immediately
          backdrop.querySelector('#emoji-search')?.focus();
        }
      });

      let currentSelected = initialEmoji;
      const closePicker = () => {
        const backdrop = document.getElementById('active-emoji-picker');
        if (backdrop) {
          backdrop.classList.remove('open');
          setTimeout(() => { backdrop.remove(); }, 300);
        }
      };

      const epContainer = document.getElementById('active-emoji-picker');
      this.attachEvents(epContainer, (emoji) => {
        currentSelected = emoji;
      });

      document.getElementById('ep-cancel')?.addEventListener('click', closePicker);
      document.getElementById('active-emoji-picker')?.addEventListener('click', (e) => {
        if (e.target.id === 'active-emoji-picker') closePicker();
      });

      document.getElementById('ep-confirm')?.addEventListener('click', () => {
        if (onSelect) onSelect(currentSelected);
        closePicker();
      });
    }
  },

  AccountCard: {
    render(account, balance) {
      const formattedBalance = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(balance);
      return `
        <div class="card card-elevated account-card touch-target" data-id="${account.id}" style="cursor: pointer; padding: var(--space-5); width: 100%; justify-content: space-between;" tabindex="0" role="button" aria-label="View account ${account.name}">
          <div style="display: flex; justify-content: space-between; align-items: flex-start;">
            <div>
              <p style="font-size: var(--text-sm); font-family: var(--font-family-body); color: var(--text-secondary); margin-bottom: var(--space-2);">${account.name}</p>
              <h3 style="font-size: var(--text-2xl); font-family: var(--font-family-display); font-weight: 700; color: var(--text-primary); letter-spacing: -0.02em;">${formattedBalance}</h3>
            </div>
            <div style="width: 48px; height: 48px; border-radius: var(--radius-lg); background: var(--bg-surface-sunken); display: flex; align-items: center; justify-content: center; font-size: 1.25rem;">🏦</div>
          </div>
        </div>`;
    }
  },

  TransactionItem: {
    render(transaction, category, accountData, id = '') {
      let amountClass = 'text-expense';
      let sign = '';
      
      const isOpeningBalance = transaction.type === 'opening_balance';

      // 1. Determine the Sign
      if (transaction.type === 'expense') {
        sign = '-';
      } else {
        sign = '+';
      }

      // 2. Determine Styling Class
      if (transaction.transferRef) {
        amountClass = 'text-transfer';
      } else if (isOpeningBalance) {
        amountClass = 'text-balance';
      } else if (sign === '+') {
        amountClass = 'text-income';
      } else {
        amountClass = 'text-expense';
      }

      const formattedAmount = sign + window.Store.formatCurrency(transaction.amount);
      const dateStr = new Date(transaction.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      return `
        <div ${id ? `id="${id}"` : ''} class="list-item touch-target" data-id="${transaction.id}" style="cursor: pointer; width: 100%;" tabindex="0" role="button" aria-label="Edit transaction of ${formattedAmount}">
          <div class="list-item-icon">${category ? category.icon : '💸'}</div>
          <div class="list-item-content">
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <div class="list-item-title">${category ? category.name : (transaction.transferRef ? 'Transfer' : 'Unknown')}</div>
              <div class="list-item-value ${amountClass}">${formattedAmount}</div>
            </div>
            <div style="display: flex; justify-content: space-between; margin-top: 4px;">
              <div class="list-item-subtitle">${accountData ? accountData.name : 'Account'}</div>
              <div class="list-item-subtitle">${dateStr}</div>
            </div>
            ${transaction.tags && transaction.tags.length > 0 ? `
            <div style="display: flex; flex-wrap: wrap; gap: 4px; margin-top: 6px;">
              ${transaction.tags.map(tag => `
                <span style="font-size: 0.7rem; color: var(--text-secondary); background: var(--bg-surface-sunken); padding: 2px 8px; border-radius: 12px; font-weight: 600;">#${tag}</span>
              `).join('')}
            </div>` : ''}
          </div>
        </div>`;
    }
  },

  MonthPicker: {
    show(options) {
      const { initialValue, onSelect } = options; // initialValue format '2026-03'
      const container = document.getElementById('modal-container');
      
      const now = new Date();
      let initYear = now.getFullYear();
      let initMonth = now.getMonth(); // 0-11
      
      if (initialValue && initialValue.includes('-')) {
        const [y, m] = initialValue.split('-');
        initYear = parseInt(y, 10);
        initMonth = parseInt(m, 10) - 1;
      }
      
      const years = [];
      // 5 years in the past, 5 years in the future
      for (let i = initYear - 5; i <= initYear + 5; i++) {
        years.push(i);
      }
      
      const monthsStr = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      
      // Use appendChild instead of innerHTML += to preserve existing modal listeners
      const div = document.createElement('div');
      div.innerHTML = `
        <div class="modal-backdrop" id="active-month-picker" style="z-index: 10000;" role="dialog" aria-modal="true" aria-labelledby="mp-title">
          <div class="modal-content" style="padding: 0; overflow: hidden; display: flex; flex-direction: column;">
            <div style="padding: 16px; border-bottom: 1px solid var(--border-color); display: flex; justify-content: space-between; align-items: center;">
              <button class="btn btn-secondary" id="mp-cancel" style="padding: 8px 16px;" aria-label="Cancel month selection">Cancel</button>
              <h3 id="mp-title" style="margin: 0; font-size: 1.1rem; font-family: var(--font-family-display);">Select Month</h3>
              <button class="btn btn-primary" id="mp-confirm" style="padding: 8px 16px;" aria-label="Confirm month selection">Done</button>
            </div>
            
            <div style="position: relative; display: flex; height: 200px; background: var(--bg-surface);">
              <!-- Highlight bar in the center -->
              <div style="position: absolute; top: 80px; height: 40px; width: 100%; background: var(--bg-surface-sunken); opacity: 0.6; pointer-events: none; border-top: 1px solid var(--border-color); border-bottom: 1px solid var(--border-color);"></div>
              
              <!-- Month Column -->
              <div id="mp-col-month" style="flex: 1; overflow-y: scroll; scroll-snap-type: y mandatory; padding: 80px 0; scrollbar-width: none; text-align: center;">
                ${monthsStr.map((m, i) => `<div class="mp-item" data-val="${i}" style="height: 40px; line-height: 40px; scroll-snap-align: center; font-size: 1.2rem; font-family: var(--font-family-display); font-weight: 500;">${m}</div>`).join('')}
              </div>
              
              <!-- Year Column -->
              <div id="mp-col-year" style="flex: 1; overflow-y: scroll; scroll-snap-type: y mandatory; padding: 80px 0; scrollbar-width: none; text-align: center;">
                ${years.map((y, i) => `<div class="mp-item" data-val="${i}" style="height: 40px; line-height: 40px; scroll-snap-align: center; font-size: 1.2rem; font-family: var(--font-family-display); font-weight: 500;">${y}</div>`).join('')}
              </div>
            </div>
            <style>
              #mp-col-month::-webkit-scrollbar { display: none; }
              #mp-col-year::-webkit-scrollbar { display: none; }
            </style>
          </div>
        </div>`;
      container.appendChild(div.firstElementChild);
      
      requestAnimationFrame(() => {
        const backdrop = document.getElementById('active-month-picker');
        if (backdrop) backdrop.classList.add('open');
        
        const mCol = document.getElementById('mp-col-month');
        const yCol = document.getElementById('mp-col-year');
        
        if (mCol && yCol) {
          mCol.scrollTop = initMonth * 40;
          yCol.scrollTop = years.indexOf(initYear) * 40;
        }
      });

      const closePicker = () => {
        const backdrop = document.getElementById('active-month-picker');
        if (backdrop) {
          backdrop.classList.remove('open');
          setTimeout(() => { backdrop.remove(); }, 300);
        }
      };

      document.getElementById('mp-cancel')?.addEventListener('click', closePicker);
      document.getElementById('active-month-picker')?.addEventListener('click', (e) => {
        if (e.target.id === 'active-month-picker') closePicker();
      });

      document.getElementById('mp-confirm')?.addEventListener('click', () => {
        const mCol = document.getElementById('mp-col-month');
        const yCol = document.getElementById('mp-col-year');
        
        if (mCol && yCol) {
          const mIdx = Math.round(mCol.scrollTop / 40);
          const yIdx = Math.round(yCol.scrollTop / 40);
          
          const selectedMonth = mIdx;
          const selectedYear = years[yIdx] || years[0];
          
          const val = `${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}`;
          if (onSelect) onSelect(val);
        }
        closePicker();
      });
    }
  },

  // -----------------------------------------------------------------------
  // RECURRING UPDATE MODAL (v0.32)
  // Shows a 3-choice bottom-sheet when the user saves a tag change on a
  // transaction that belongs to a recurring series.
  // -----------------------------------------------------------------------
  RecurringUpdateModal: {
    show(options) {
      const { onlyThis, thisAndFuture, allTransactions } = options;
      const container = document.getElementById('modal-container');

      const div = document.createElement('div');
      div.innerHTML = `
        <div class="modal-backdrop" id="recurring-update-modal" role="dialog" aria-modal="true" aria-labelledby="rum-title">
          <div class="modal-content" style="padding: 0; overflow: hidden;">
            <div class="modal-handle"></div>
            <div style="padding: var(--space-5) var(--space-5) var(--space-2);">
              <h2 id="rum-title" class="header-title" style="margin: 0 0 var(--space-1); font-size: var(--text-xl);">Update Recurring Tag</h2>
              <p style="color: var(--text-secondary); font-size: var(--text-sm); margin: 0;">This transaction is part of a recurring series. Which occurrences should be updated?</p>
            </div>

            <div style="display: flex; flex-direction: column; padding: var(--space-3) var(--space-4) var(--space-5); gap: var(--space-2);">

              <!-- Option 1: Only this -->
              <button id="rum-only-this" class="touch-target" style="
                display: flex; align-items: center; gap: var(--space-4);
                background: var(--bg-surface); border: 1px solid var(--border-color);
                border-radius: var(--radius-lg); padding: var(--space-4);
                cursor: pointer; text-align: left; width: 100%;
              ">
                <div style="width: 40px; height: 40px; border-radius: 50%; background: var(--bg-surface-sunken); display: flex; align-items: center; justify-content: center; font-size: 1.1rem; flex-shrink: 0;"><span role="img" aria-label="Pin">📌</span></div>
                <div style="flex: 1;">
                  <div style="font-weight: 600; color: var(--text-primary); font-size: var(--text-base);">Only this transaction</div>
                  <div style="color: var(--text-secondary); font-size: var(--text-sm); margin-top: 2px;">Update just this occurrence</div>
                </div>
                <div style="color: var(--text-tertiary); font-size: 1.2rem;">›</div>
              </button>

              <!-- Option 2: This and future -->
              <button id="rum-and-future" class="touch-target" style="
                display: flex; align-items: center; gap: var(--space-4);
                background: var(--bg-surface); border: 1px solid var(--border-color);
                border-radius: var(--radius-lg); padding: var(--space-4);
                cursor: pointer; text-align: left; width: 100%;
              ">
                <div style="width: 40px; height: 40px; border-radius: 50%; background: var(--color-accent-bg, #e8f0ff); display: flex; align-items: center; justify-content: center; font-size: 1.1rem; flex-shrink: 0;"><span role="img" aria-label="Soon arrow">🔜</span></div>
                <div style="flex: 1;">
                  <div style="font-weight: 600; color: var(--text-primary); font-size: var(--text-base);">This and future transactions</div>
                  <div style="color: var(--text-secondary); font-size: var(--text-sm); margin-top: 2px;">Update this and all later occurrences</div>
                </div>
                <div style="color: var(--text-tertiary); font-size: 1.2rem;">›</div>
              </button>

              <!-- Option 3: All transactions -->
              <button id="rum-all" class="touch-target" style="
                display: flex; align-items: center; gap: var(--space-4);
                background: var(--bg-surface); border: 1px solid var(--border-color);
                border-radius: var(--radius-lg); padding: var(--space-4);
                cursor: pointer; text-align: left; width: 100%;
              ">
                <div style="width: 40px; height: 40px; border-radius: 50%; background: var(--color-income-bg); display: flex; align-items: center; justify-content: center; font-size: 1.1rem; flex-shrink: 0;"><span role="img" aria-label="Repeat arrow">🔁</span></div>
                <div style="flex: 1;">
                  <div style="font-weight: 600; color: var(--text-primary); font-size: var(--text-base);">All transactions</div>
                  <div style="color: var(--text-secondary); font-size: var(--text-sm); margin-top: 2px;">Update every occurrence, past and future</div>
                </div>
                <div style="color: var(--text-tertiary); font-size: 1.2rem;">›</div>
              </button>

              <!-- Cancel -->
              <button id="rum-cancel" class="btn btn-secondary" style="margin-top: var(--space-1);">Cancel</button>
            </div>
          </div>
        </div>`;
      container.appendChild(div.firstElementChild);

      requestAnimationFrame(() => {
        const backdrop = document.getElementById('recurring-update-modal');
        if (backdrop) backdrop.classList.add('open');
      });

      const close = () => {
        const backdrop = document.getElementById('recurring-update-modal');
        if (backdrop) {
          backdrop.classList.remove('open');
          setTimeout(() => { backdrop.remove(); }, 300);
        }
      };

      const btnOnly = document.getElementById('rum-only-this');
      if (btnOnly) btnOnly.addEventListener('click', () => { close(); if (onlyThis) onlyThis(); });
      
      const btnFuture = document.getElementById('rum-and-future');
      if (btnFuture) btnFuture.addEventListener('click', () => { close(); if (thisAndFuture) thisAndFuture(); });
      
      const btnAll = document.getElementById('rum-all');
      if (btnAll) btnAll.addEventListener('click', () => { close(); if (allTransactions) allTransactions(); });
      
      const btnCancel = document.getElementById('rum-cancel');
      if (btnCancel) btnCancel.addEventListener('click', close);
      
      const modalBackdrop = document.getElementById('recurring-update-modal');
      if (modalBackdrop) {
        modalBackdrop.addEventListener('click', (e) => {
          if (e.target.id === 'recurring-update-modal') close();
        });
      }
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
              <h2 id="rcm-title" class="header-title" style="margin: 0 0 var(--space-1); font-size: var(--text-xl);">Initial Tag Scope</h2>
              <p style="color: var(--text-secondary); font-size: var(--text-sm); margin: 0;">You're adding tags to a new recurring transaction. Should future generated transactions also have these tags?</p>
            </div>

            <div style="display: flex; flex-direction: column; padding: var(--space-3) var(--space-4) var(--space-5); gap: var(--space-2);">

              <!-- Option 1: Only this -->
              <button id="rcm-only-this" class="touch-target" style="
                display: flex; align-items: center; gap: var(--space-4);
                background: var(--bg-surface); border: 1px solid var(--border-color);
                border-radius: var(--radius-lg); padding: var(--space-4);
                cursor: pointer; text-align: left; width: 100%;
              ">
                <div style="width: 40px; height: 40px; border-radius: 50%; background: var(--bg-surface-sunken); display: flex; align-items: center; justify-content: center; font-size: 1.1rem; flex-shrink: 0;"><span role="img" aria-label="Pin">📌</span></div>
                <div style="flex: 1;">
                  <div style="font-weight: 600; color: var(--text-primary); font-size: var(--text-base);">Only this transaction</div>
                  <div style="color: var(--text-secondary); font-size: var(--text-sm); margin-top: 2px;">Keep future transactions tag-free</div>
                </div>
                <div style="color: var(--text-tertiary); font-size: 1.2rem;">›</div>
              </button>

              <!-- Option 2: All transactions -->
              <button id="rcm-all" class="touch-target" style="
                display: flex; align-items: center; gap: var(--space-4);
                background: var(--bg-surface); border: 1px solid var(--border-color);
                border-radius: var(--radius-lg); padding: var(--space-4);
                cursor: pointer; text-align: left; width: 100%;
              ">
                <div style="width: 40px; height: 40px; border-radius: 50%; background: var(--color-income-bg); display: flex; align-items: center; justify-content: center; font-size: 1.1rem; flex-shrink: 0;"><span role="img" aria-label="Repeat arrow">🔁</span></div>
                <div style="flex: 1;">
                  <div style="font-weight: 600; color: var(--text-primary); font-size: var(--text-base);">All recurring transactions</div>
                  <div style="color: var(--text-secondary); font-size: var(--text-sm); margin-top: 2px;">Apply tags to all future generations</div>
                </div>
                <div style="color: var(--text-tertiary); font-size: 1.2rem;">›</div>
              </button>

              <!-- Cancel -->
              <button id="rcm-cancel" class="btn btn-secondary" style="margin-top: var(--space-1);">Cancel</button>
            </div>
          </div>
        </div>`;
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
              <h2 id="rdm-title" class="header-title" style="margin: 0 0 var(--space-1); font-size: var(--text-xl); color: var(--color-expense);">Delete Recurring Transaction</h2>
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
                <div style="width: 40px; height: 40px; border-radius: 50%; background: #ffffff; display: flex; align-items: center; justify-content: center; font-size: 1.1rem; flex-shrink: 0;"><span role="img" aria-label="Trash bin">🗑️</span></div>
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
                <div style="width: 40px; height: 40px; border-radius: 50%; background: #ffffff; display: flex; align-items: center; justify-content: center; font-size: 1.1rem; flex-shrink: 0;"><span role="img" aria-label="Trash bin">🗑️</span></div>
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
                <div style="width: 40px; height: 40px; border-radius: 50%; background: #ffffff; display: flex; align-items: center; justify-content: center; font-size: 1.1rem; flex-shrink: 0;"><span role="img" aria-label="Warning sign">⚠️</span></div>
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
      container.appendChild(div.firstElementChild);

      requestAnimationFrame(() => {
        const backdrop = document.getElementById('recurring-delete-modal');
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

  FrequencyPicker: {
    show(options) {
      const { initialInterval = 1, initialFreq = 'months', onSelect } = options;
      const container = document.getElementById('modal-container');
      
      const freqs = [
        { id: 'days', label: 'Days' },
        { id: 'weeks', label: 'Weeks' },
        { id: 'months', label: 'Months' },
        { id: 'years', label: 'Years' }
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
              <button class="btn btn-secondary" id="fp-cancel" style="padding: 8px 16px;" aria-label="Cancel frequency selection">Cancel</button>
              <h3 id="fp-title" style="margin: 0; font-size: 1.1rem; font-family: var(--font-family-display);">Repeats Every</h3>
              <button class="btn btn-primary" id="fp-confirm" style="padding: 8px 16px;" aria-label="Confirm frequency selection">Done</button>
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

      document.getElementById('fp-cancel')?.addEventListener('click', closePicker);
      document.getElementById('active-freq-picker')?.addEventListener('click', (e) => {
        if (e.target.id === 'active-freq-picker') closePicker();
      });

      document.getElementById('fp-confirm')?.addEventListener('click', () => {
        const iCol = document.getElementById('fp-col-interval');
        const fCol = document.getElementById('fp-col-freq');
        
        if (iCol && fCol) {
          const iIdx = Math.round(iCol.scrollTop / 40);
          const fIdx = Math.round(fCol.scrollTop / 40);
          
          const selectedInterval = intervals[iIdx] || intervals[0];
          const selectedFreq = freqs[fIdx] || freqs[0];
          
          if (onSelect) onSelect({ interval: selectedInterval, frequency: selectedFreq.id });
        }
        closePicker();
      });
    }
  }
};


