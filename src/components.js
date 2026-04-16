// components.js - Reusable UI Components
window.Components = {
  BottomNav: {
    render() {
      return `
        <div class="nav-overlay" id="nav-overlay" aria-hidden="true" style="opacity: 0; pointer-events: none; position: fixed; inset: 0; background-color: rgba(0,0,0,0.3); background: rgba(0,0,0,0.3); backdrop-filter: blur(4px); -webkit-backdrop-filter: blur(4px); z-index: 998; transition: opacity 0.3s ease;"></div>
        
        <div class="nav-action-menu" id="nav-action-menu" style="position: fixed; bottom: 100px; right: var(--space-4); width: 280px; background-color: #ffffff; background: rgba(255, 255, 255, 0.85); backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px); border-radius: 24px; padding: var(--space-4); box-shadow: 0 12px 40px rgba(0,0,0,0.15); border: 1px solid rgba(255, 255, 255, 0.4); z-index: 999; transform: translateY(20px) scale(0.9); opacity: 0; pointer-events: none; transition: all 0.4s cubic-bezier(0.16, 1, 0.3, 1);">
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-3);">
            <a href="#add" class="menu-action-item" style="text-decoration: none; background: var(--bg-body); padding: var(--space-4) var(--space-2); border-radius: 20px; display: flex; flex-direction: column; align-items: center; gap: var(--space-2); transition: transform 0.2s ease;">
              <div style="width: 44px; height: 44px; border-radius: 14px; background: #E3F2FD; color: #1E88E5; display: flex; align-items: center; justify-content: center;"><i data-lucide="edit-3"></i></div>
              <span style="font-size: 0.8rem; font-weight: 700; color: var(--text-primary);">Add Log</span>
            </a>
            <a href="#settings" class="menu-action-item" style="text-decoration: none; background: var(--bg-body); padding: var(--space-4) var(--space-2); border-radius: 20px; display: flex; flex-direction: column; align-items: center; gap: var(--space-2); transition: transform 0.2s ease;">
              <div style="width: 44px; height: 44px; border-radius: 14px; background: #F3E5F5; color: #8E24AA; display: flex; align-items: center; justify-content: center;"><i data-lucide="more-horizontal"></i></div>
              <span style="font-size: 0.8rem; font-weight: 700; color: var(--text-primary);">Others</span>
            </a>
            <a href="#edit-account" class="menu-action-item" style="text-decoration: none; background: var(--bg-body); padding: var(--space-4) var(--space-2); border-radius: 20px; display: flex; flex-direction: column; align-items: center; gap: var(--space-2); transition: transform 0.2s ease;">
              <div style="width: 44px; height: 44px; border-radius: 14px; background: #E8F5E9; color: #43A047; display: flex; align-items: center; justify-content: center;"><i data-lucide="landmark"></i></div>
              <span style="font-size: 0.8rem; font-weight: 700; color: var(--text-primary);">Add Account</span>
            </a>
            <a href="#edit-category" class="menu-action-item" style="text-decoration: none; background: var(--bg-body); padding: var(--space-4) var(--space-2); border-radius: 20px; display: flex; flex-direction: column; align-items: center; gap: var(--space-2); transition: transform 0.2s ease;">
              <div style="width: 44px; height: 44px; border-radius: 14px; background: #FFF3E0; color: #FB8C00; display: flex; align-items: center; justify-content: center;"><i data-lucide="tag"></i></div>
              <span style="font-size: 0.8rem; font-weight: 700; color: var(--text-primary);">Add Category</span>
            </a>
          </div>
        </div>

        <div class="nav-pill">
          <a href="#dashboard" class="nav-item touch-target" data-view="dashboard" aria-label="Dashboard">
            <div class="nav-icon"><i data-lucide="home"></i></div>
            <div class="nav-item-indicator"></div>
          </a>
          <a href="#transactions" class="nav-item touch-target" data-view="transactions" aria-label="History">
            <div class="nav-icon"><i data-lucide="list"></i></div>
            <div class="nav-item-indicator"></div>
          </a>
          <a href="#budget" class="nav-item touch-target" data-view="budget" aria-label="Goals">
            <div class="nav-icon"><i data-lucide="target"></i></div>
            <div class="nav-item-indicator"></div>
          </a>
          <a href="#analytics" class="nav-item touch-target" data-view="analytics" aria-label="Analytics">
            <div class="nav-icon"><i data-lucide="pie-chart"></i></div>
            <div class="nav-item-indicator"></div>
          </a>
        </div>
        <button id="nav-fab-toggle" class="nav-fab touch-target" aria-label="Toggle Actions" aria-expanded="false" style="border: none; cursor: pointer;">
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
        fab.style.transform = 'rotate(45deg)';
        fab.style.color = '#4285F4'; // Change icon color instead of bg
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
      fab.style.transform = 'rotate(0deg)';
      fab.style.color = 'var(--color-primary)';
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

      container.addEventListener('click', (e) => {
        const navItem = e.target.closest('.nav-item');
        if (navItem) handleTabAction(e, navItem);
        
        // Close menu if clicking menu items
        if (e.target.closest('.menu-action-item')) {
          this.closeMenu(container);
        }
      });
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
        setTimeout(() => { document.getElementById('modal-container').innerHTML = ''; }, 300);
      }
    }
  },

  IconPicker: {
    GROUPS: [
      { label: 'Finance', icons: ['wallet', 'landmark', 'banknote', 'coins', 'credit-card', 'trending-up', 'trending-down', 'receipt', 'piggy-bank', 'percent'] },
      { label: 'Food & Drink', icons: ['utensils', 'coffee', 'pizza', 'glass-water', 'beer', 'cup-soda', 'cake', 'clover', 'ice-cream', 'leaf'] },
      { label: 'Transport', icons: ['car', 'bus', 'plane', 'bike', 'fuel', 'train', 'ship', 'map-pin'] },
      { label: 'Shopping', icons: ['shopping-bag', 'shopping-cart', 'tag', 'gift', 'shirt', 'watch'] },
      { label: 'Home', icons: ['home', 'zap', 'droplets', 'wifi', 'tv', 'refrigerator'] },
      { label: 'Tech & Work', icons: ['laptop', 'smartphone', 'briefcase', 'book', 'palette', 'globe'] },
      { label: 'Education & Health', icons: ['school', 'graduation-cap', 'building', 'hospital', 'heart', 'pill', 'activity', 'dumbbell', 'baby'] },
      { label: 'Pets & Misc', icons: ['dog', 'cat', 'pin', 'package', 'star', 'bookmark', 'bell', 'flag', 'help-circle'] }
    ],

    render(selectedIcon = 'pin') {
      return `
        <div class="icon-picker" id="icon-picker-v2" style="font-size: 16px;">
          <input type="text" id="icon-search" class="form-control" placeholder="Search icons..." autocomplete="off" style="font-size: var(--text-sm); margin-bottom: var(--space-3);">
          <div id="icon-selected-display-v2" style="display: flex; align-items: center; justify-content: center; width: 64px; height: 64px; margin: 0 auto var(--space-3); color: var(--color-primary); background: var(--bg-surface-elevated); border-radius: var(--radius-lg); border: 2px dashed var(--border-color);">
            <i data-lucide="${selectedIcon}" style="font-size: 48px; width: 48px; height: 48px; display: inline-block; vertical-align: middle;"></i>
          </div>
          <div id="icon-grid-v2" style="max-height: 220px; overflow-y: auto; padding-right: 4px;">${this._renderGroups(this.GROUPS)}</div>
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
          <div style="display: grid; grid-template-columns: repeat(6, 1fr); gap: 6px;" role="group" aria-label="${group.label}">
            ${filtered.map(i => `<button class="icon-btn touch-target" data-icon="${i}" aria-label="Select icon ${i}" aria-pressed="false" style="width: 44px; height: 44px; border-radius: var(--radius-md); background: var(--bg-surface); border: none; cursor: pointer; display: flex; align-items: center; justify-content: center; color: var(--text-primary); transition: all 0.2s ease;">
              <i data-lucide="${i}" style="font-size: 24px; width: 24px; height: 24px; display: inline-block; vertical-align: middle;"></i>
            </button>`).join('')}
          </div></div>`;
      }).join('');
    },

    attachEvents(container, onSelect) {
      const grid = container.querySelector('#icon-grid-v2');
      const search = container.querySelector('#icon-search');
      const display = container.querySelector('#icon-selected-display-v2');
      
      const refreshIcons = () => {
        window.StackdHydrateIcons();
      };

      if (search) {
        search.addEventListener('input', (e) => {
          grid.innerHTML = this._renderGroups(this.GROUPS, e.target.value.trim());
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
            b.style.background = 'var(--bg-surface)';
            b.setAttribute('aria-pressed', 'false');
          });
          btn.style.background = 'var(--bg-surface-sunken)';
          btn.setAttribute('aria-pressed', 'true');
          if (onSelect) onSelect(icon);
        });
      });
    },

    show(options) {
      const { initialIcon = 'pin', onSelect } = options;
      const container = document.getElementById('modal-container');
      
      const div = document.createElement('div');
      div.innerHTML = `
        <div class="modal-backdrop" id="active-icon-picker" style="z-index: 10000;" role="dialog" aria-modal="true" aria-labelledby="ip-title">
          <div class="modal-content" style="padding: 0; overflow: hidden; display: flex; flex-direction: column; max-height: 85vh;">
            <div style="padding: 16px; border-bottom: 1px solid var(--border-color); display: flex; justify-content: space-between; align-items: center;">
              <button class="btn btn-secondary" id="ip-cancel" style="padding: 8px 16px;" aria-label="Cancel selection">Cancel</button>
              <h3 id="ip-title" style="margin: 0; font-size: 1.1rem; font-family: var(--font-family-display);">Select Icon</h3>
              <button class="btn btn-primary" id="ip-confirm" style="padding: 8px 16px;" aria-label="Confirm selection">Done</button>
            </div>
            
            <div style="padding: var(--space-4); overflow-y: auto;">
              ${this.render(initialIcon)}
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
      });

      ipContainer.querySelector('#ip-cancel').addEventListener('click', closePicker);
      ipContainer.querySelector('#ip-confirm').addEventListener('click', () => {
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
            <div style="width: 48px; height: 48px; border-radius: 14px; background: var(--bg-surface-sunken); display: flex; align-items: center; justify-content: center; color: var(--color-primary);">
              <i data-lucide="wallet" style="width: 24px; height: 24px;"></i>
            </div>
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
          <div class="list-item-icon ${transaction.transferRef ? 'bg-tint-balance' : (category && category.typeHint === 'income' ? 'bg-tint-income' : (category && category.typeHint === 'expense' ? 'bg-tint-expense' : 'bg-tint-primary'))}">
            <i data-lucide="${category ? category.icon : 'receipt'}"></i>
          </div>
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

  AdvancedFilterBar: {
    render(pageKey, filters) {
      const { type, value } = filters.period;
      const types = [
        { id: 'today', label: 'Day' },
        { id: 'week', label: 'Week' },
        { id: 'month', label: 'Month' },
        { id: 'year', label: 'Year' }
      ];
      
      const hasCustomRange = type === 'custom';
      const hasActiveFilters = filters.types.length > 0 || filters.accounts.length > 0 || filters.categories.length > 0;

      // Check if "Next" should be disabled (don't allow future navigation for period types)
      const now = new Date();
      const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
      const bounds = window.Store._getPeriodBounds(type, value);
      const isFuture = !hasCustomRange && (bounds.end >= todayStr);

      return `
        <div class="filter-bar-wrapper">
          <div class="filter-bar-scrollable">
            <!-- Navigation controls -->
            <button class="filter-pill filter-pill-icon" id="btn-prev-${pageKey}" data-page="${pageKey}" ${hasCustomRange ? 'disabled style="opacity:0.3"' : ''} aria-label="Previous period">
              <i data-lucide="chevron-left" style="width: 18px; height: 18px;"></i>
            </button>
            <button class="filter-pill" id="btn-today-${pageKey}" data-page="${pageKey}" ${hasCustomRange ? 'disabled style="opacity:0.3"' : ''}>
              Today
            </button>
            <button class="filter-pill filter-pill-icon" id="btn-next-${pageKey}" data-page="${pageKey}" ${isFuture || hasCustomRange ? 'disabled style="opacity:0.3"' : ''} aria-label="Next period">
              <i data-lucide="chevron-right" style="width: 18px; height: 18px;"></i>
            </button>

            <div style="width: 1px; height: 24px; background: var(--border-color); margin: auto 4px; flex-shrink: 0;"></div>

            ${types.map(t => `
              <button class="filter-pill ${t.id === type ? 'active' : ''}" 
                      data-type="${t.id}" data-page="${pageKey}">
                ${t.label}
              </button>
            `).join('')}
            
            <button class="filter-pill filter-pill-icon ${hasCustomRange ? 'active' : ''}" 
                    id="btn-calendar-${pageKey}" data-page="${pageKey}" aria-label="Calendar range">
              <i data-lucide="calendar" style="width: 18px; height: 18px;"></i>
            </button>
            
            <button class="filter-pill filter-pill-icon ${hasActiveFilters ? 'active' : ''}" 
                    id="btn-filter-${pageKey}" data-page="${pageKey}" aria-label="Filter and Sort">
              <i data-lucide="sliders-horizontal" style="width: 18px; height: 18px;"></i>
            </button>
          </div>
        </div>
      `;
    },
    attachEvents(container, pageKey) {
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
        const fmt = (dt) => `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
        window.Store.dispatch('UPDATE_FILTERS', { 
            page: pageKey, 
            filters: { period: { type: 'today', value: fmt(new Date()), start: '', end: '' } } 
        });
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
            <button class="modal-btn-top modal-btn-close" id="crm-close">Cancel</button>
            <h3 style="font-weight: 800; font-size: 1rem;">Custom Range</h3>
            <button class="modal-btn-top" id="crm-apply">Apply</button>
          </div>
          
          <div class="modal-body" style="padding-bottom: 20px;">
            <div style="padding: var(--space-4);">
              <div class="filter-group-title" style="margin-top: 0;">Quick Presets</div>
              <div class="multi-select-row">
                <button class="multi-select-chip" data-days="7">Last 7 Days</button>
                <button class="multi-select-chip" data-days="30">Last 30 Days</button>
                <button class="multi-select-chip" data-days="90">Last 90 Days</button>
                <button class="multi-select-chip" data-months="6">6 Months</button>
                <button class="multi-select-chip" data-years="1">1 Year</button>
                <button class="multi-select-chip" data-type="all">All Time</button>
              </div>
            </div>

            <div id="calendar-container-start"></div>
            <div id="calendar-container-end" style="margin-top: var(--space-6);"></div>
          </div>
          
          <div style="padding: var(--space-5); background: var(--bg-surface-sunken); border-top: 1px solid var(--color-border); text-align: center;">
            <div style="font-size: var(--text-xs); color: var(--text-secondary); text-transform: uppercase; font-weight: 700; margin-bottom: 4px;">Summary</div>
            <div id="crm-range-summary" style="font-weight: 700; font-size: 0.95rem; color: var(--text-primary);">
              Pick start and end dates
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
          summary.innerText = 'Pick start and end dates';
          return;
        }
        const s = new Date(currentStart);
        const e = new Date(currentEnd);
        const diff = Math.ceil((e - s) / (1000 * 60 * 60 * 24)) + 1;
        const fmt = (d) => new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
        summary.innerHTML = `${fmt(currentStart)} - ${fmt(currentEnd)} <span style="color: var(--color-primary); margin-left: 8px;">(${diff} days)</span>`;
      };

      const renderCalendars = () => {
        const startTarget = document.getElementById('calendar-container-start');
        const endTarget = document.getElementById('calendar-container-end');
        
        const startMonth = currentStart ? new Date(currentStart) : new Date();
        const endMonth = currentEnd ? new Date(currentEnd) : new Date();

        const monthsStr = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

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

        startTarget.innerHTML = navHeader('Start Date', 'start', startMonth) + this._renderCalendar(startMonth, currentStart, currentStart, currentEnd);
        endTarget.innerHTML = navHeader('End Date', 'end', endMonth) + this._renderCalendar(endMonth, currentEnd, currentStart, currentEnd);
        
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

      const monthsStr = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
      const weekdays = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
      
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

      let currentFilters = JSON.parse(JSON.stringify(filters));

      const container = document.getElementById('modal-container');
      const div = document.createElement('div');
      div.className = 'modal-backdrop';
      div.id = 'filter-advanced-modal';
      
      const renderContent = () => {
        div.innerHTML = `
          <div class="modal-content" style="padding: 0; display: flex; flex-direction: column;">
            <div class="modal-top-bar">
              <button class="modal-btn-top modal-btn-close" id="afm-close">Cancel</button>
              <h3 style="font-weight: 800; font-size: 1rem;">Filter & Sort</h3>
              <button class="modal-btn-top" id="afm-apply">Apply</button>
            </div>
            
            <div class="modal-body" style="padding: var(--space-4) var(--space-5) 40px;">
              <div style="margin-bottom: var(--space-6); display: flex; justify-content: flex-end;">
                <button id="afm-show-all" style="background: var(--bg-surface-sunken); border: none; padding: 6px 14px; border-radius: 20px; font-size: 0.75rem; font-weight: 800; color: var(--color-primary); cursor: pointer; text-transform: uppercase; letter-spacing: 0.05em; transition: all 0.2s ease;">Show All</button>
              </div>

              <div class="filter-group-title" style="margin-top: 0;">Sort Order</div>
              <div class="multi-select-row">
                <button class="multi-select-chip ${currentFilters.sortOrder === 'desc' ? 'active' : ''}" data-sort="desc">Newest First</button>
                <button class="multi-select-chip ${currentFilters.sortOrder === 'asc' ? 'active' : ''}" data-sort="asc">Oldest First</button>
              </div>

              <div class="filter-group-title">Transaction Type</div>
              <div class="multi-select-row">
                <button class="multi-select-chip ${currentFilters.types.includes('income') ? 'active' : ''}" data-type="income">Income</button>
                <button class="multi-select-chip ${currentFilters.types.includes('expense') ? 'active' : ''}" data-type="expense">Expense</button>
              </div>

              <div class="filter-group-title">Wallets</div>
              <div class="multi-select-row">
                ${accounts.map(acc => `
                  <button class="multi-select-chip ${currentFilters.accounts.includes(acc.id) ? 'active' : ''}" data-acc="${acc.id}">
                    ${acc.name}
                  </button>
                `).join('')}
              </div>

              <div class="filter-group-title">Categories</div>
              <div class="multi-select-row">
                ${categories.map(cat => `
                  <button class="multi-select-chip ${currentFilters.categories.includes(cat.id) ? 'active' : ''}" data-cat="${cat.id}">
                    ${cat.name}
                  </button>
                `).join('')}
              </div>
            </div>
          </div>
        `;

        // Attach events
        div.querySelector('#afm-close').onclick = close;
        div.querySelector('#afm-apply').onclick = apply;
        
        div.querySelector('#afm-show-all').onclick = () => {
          currentFilters.sortOrder = 'desc';
          currentFilters.types = [];
          currentFilters.accounts = [];
          currentFilters.categories = [];
          renderContent();
        };

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
      
      const monthsStr = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      
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
              <button class="btn btn-secondary" id="pp-cancel" style="padding: 8px 16px; width: auto;" aria-label="Cancel">Cancel</button>
              <h3 id="pp-title" style="margin: 0; font-size: 1.1rem; font-family: var(--font-family-display);">Select ${type.charAt(0).toUpperCase() + type.slice(1)}</h3>
              <button class="btn btn-primary" id="pp-confirm" style="padding: 8px 16px; width: auto;" aria-label="Confirm">Done</button>
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
                <div style="width: 40px; height: 40px; border-radius: 14px; background: var(--bg-surface-sunken); display: flex; align-items: center; justify-content: center; color: var(--text-secondary); flex-shrink: 0;"><i data-lucide="pin" style="width: 20px; height: 20px;"></i></div>
                <div style="flex: 1;">
                  <div style="font-weight: 600; color: var(--text-primary); font-size: var(--text-base);">Only this transaction</div>
                  <div style="color: var(--text-secondary); font-size: var(--text-sm); margin-top: 2px;">Update just this occurrence</div>
                </div>
                <i data-lucide="chevron-right" style="color: var(--text-tertiary); width: 20px; height: 20px;"></i>
              </button>

              <!-- Option 2: This and future -->
              <button id="rum-and-future" class="touch-target" style="
                display: flex; align-items: center; gap: var(--space-4);
                background: var(--bg-surface); border: 1px solid var(--border-color);
                border-radius: var(--radius-lg); padding: var(--space-4);
                cursor: pointer; text-align: left; width: 100%;
              ">
                <div style="width: 40px; height: 40px; border-radius: 14px; background: var(--color-accent-bg, #e8f0ff); display: flex; align-items: center; justify-content: center; color: var(--color-primary); flex-shrink: 0;"><i data-lucide="fast-forward" style="width: 20px; height: 20px;"></i></div>
                <div style="flex: 1;">
                  <div style="font-weight: 600; color: var(--text-primary); font-size: var(--text-base);">This and future transactions</div>
                  <div style="color: var(--text-secondary); font-size: var(--text-sm); margin-top: 2px;">Update this and all later occurrences</div>
                </div>
                <i data-lucide="chevron-right" style="color: var(--text-tertiary); width: 20px; height: 20px;"></i>
              </button>

              <!-- Option 3: All transactions -->
              <button id="rum-all" class="touch-target" style="
                display: flex; align-items: center; gap: var(--space-4);
                background: var(--bg-surface); border: 1px solid var(--border-color);
                border-radius: var(--radius-lg); padding: var(--space-4);
                cursor: pointer; text-align: left; width: 100%;
              ">
                <div style="width: 40px; height: 40px; border-radius: 14px; background: var(--color-income-bg); display: flex; align-items: center; justify-content: center; color: var(--color-income-text); flex-shrink: 0;"><i data-lucide="refresh-cw" style="width: 20px; height: 20px;"></i></div>
                <div style="flex: 1;">
                  <div style="font-weight: 600; color: var(--text-primary); font-size: var(--text-base);">All transactions</div>
                  <div style="color: var(--text-secondary); font-size: var(--text-sm); margin-top: 2px;">Update every occurrence, past and future</div>
                </div>
                <i data-lucide="chevron-right" style="color: var(--text-tertiary); width: 20px; height: 20px;"></i>
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
                <div style="width: 40px; height: 40px; border-radius: 14px; background: var(--bg-surface-sunken); display: flex; align-items: center; justify-content: center; color: var(--text-secondary); flex-shrink: 0;"><i data-lucide="pin" style="width: 20px; height: 20px;"></i></div>
                <div style="flex: 1;">
                  <div style="font-weight: 600; color: var(--text-primary); font-size: var(--text-base);">Only this transaction</div>
                  <div style="color: var(--text-secondary); font-size: var(--text-sm); margin-top: 2px;">Keep future transactions tag-free</div>
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
                  <div style="font-weight: 600; color: var(--text-primary); font-size: var(--text-base);">All recurring transactions</div>
                  <div style="color: var(--text-secondary); font-size: var(--text-sm); margin-top: 2px;">Apply tags to all future generations</div>
                </div>
                <i data-lucide="chevron-right" style="color: var(--text-tertiary); width: 20px; height: 20px;"></i>
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
                <div style="width: 40px; height: 40px; border-radius: 14px; background: #ffffff; display: flex; align-items: center; justify-content: center; color: var(--color-expense); flex-shrink: 0;"><i data-lucide="trash-2" style="width: 20px; height: 20px;"></i></div>
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
                <div style="width: 40px; height: 40px; border-radius: 14px; background: #ffffff; display: flex; align-items: center; justify-content: center; color: var(--color-expense); flex-shrink: 0;"><i data-lucide="trash-2" style="width: 20px; height: 20px;"></i></div>
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
                <div style="width: 40px; height: 40px; border-radius: 14px; background: #ffffff; display: flex; align-items: center; justify-content: center; color: var(--color-expense); flex-shrink: 0;"><i data-lucide="alert-triangle" style="width: 20px; height: 20px;"></i></div>
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
              <button class="btn-icon touch-target" id="lp-close" aria-label="Close picker" style="color: var(--text-secondary); width: 44px; height: 44px; margin-right: -10px;">
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
    render(data, isCustom = false) {
      if (isCustom) {
        return `
          <div class="card card-elevated" style="padding: var(--space-6); margin-top: var(--space-4); text-align: center; border-radius: var(--radius-2xl); border: 2px dashed var(--border-color); background: var(--bg-surface-sunken);">
            <div style="font-size: 2.5rem; margin-bottom: var(--space-3); opacity: 0.5;">📊</div>
            <p style="color: var(--text-secondary); font-weight: 500;">Chart not available for custom ranges.</p>
            <p style="font-size: 0.75rem; color: var(--text-tertiary); margin-top: var(--space-4); font-style: italic;">Note: Custom date ranges do not apply to this view</p>
          </div>
        `;
      }

      if (!data || data.length === 0) {
        return `
          <div class="card card-elevated" style="padding: var(--space-6); margin-top: var(--space-4); text-align: center; border-radius: var(--radius-2xl);">
            <p class="text-secondary">No data for the selected period.</p>
          </div>
        `;
      }

      return `
        <div class="card card-elevated" style="padding: var(--space-5); margin-top: var(--space-4); border-radius: var(--radius-2xl); position: relative; overflow: hidden;">
          <!-- DECORATIVE BACKGROUND GRADIENT -->
          <div style="position: absolute; top: -20px; right: -20px; width: 100px; height: 100px; background: var(--color-primary); opacity: 0.03; border-radius: 20px; filter: blur(30px);"></div>
          
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: var(--space-4); position: relative; z-index: 1;">
            <p class="section-title" style="margin-bottom: 0; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.05em; opacity: 0.8;">Net Flow Analysis</p>
            <span style="font-size: 10px; color: var(--text-tertiary); font-weight: 700; background: var(--bg-surface-sunken); padding: 2px 8px; border-radius: 10px;">INCOME - EXPENSES</span>
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

      new window.Chart(canvas, {
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
              backgroundColor: '#ffffff',
              titleColor: '#64748b',
              titleFont: { size: 11, weight: '600' },
              bodyColor: '#334155',
              bodyFont: { family: 'Manrope', size: 14, weight: '800' },
              borderColor: '#e2e8f0',
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
                font: { size: 10, family: 'Manrope', weight: '700' },
                color: '#94a3b8'
              } 
            },
            y: { 
              display: false,
              beginAtZero: true
            }
          }
        }
      });
    }
  },

  CategoryDonutChart: {
    _chartInstance: null,
    _currentType: 'expense',

    // Collapse raw distribution data into top-5 + 'Others' always as last entry
    _capData(rawData) {
      if (rawData.length <= 5) return rawData;
      const top5 = rawData.slice(0, 5);
      const rest = rawData.slice(5);
      const othersAmount = rest.reduce((sum, item) => sum + item.amount, 0);
      const totalAmount = rawData.reduce((sum, item) => sum + item.amount, 0);
      top5.push({
        id: '__others__',
        name: 'Others',
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
      const data = this._capData(rawData);
      
      const hasData = data && data.length > 0;
      const totalAmount = rawData.reduce((sum, item) => sum + item.amount, 0);

      let contentHtml = '';
      if (!hasData) {
        contentHtml = `
          <div style="height: 200px; display: flex; flex-direction: column; align-items: center; justify-content: center; opacity: 0.5;">
            <div style="font-size: 2.5rem; margin-bottom: var(--space-2);">🥯</div>
            <p>No ${type} data for this period.</p>
          </div>
        `;
      } else {
        const baseColor = isExpense ? '#64748b' : '#6366f1';
        const othersColor = isExpense ? '#94a3b8' : '#a5b4fc';
        contentHtml = `
          <div class="donut-chart-layout">
            <div class="donut-chart-container">
              <canvas id="categoryDonutChart"></canvas>
              <div class="donut-chart-center">
                <div class="donut-total-label">Total</div>
                <div class="donut-total-value">${window.Store.formatCurrency(totalAmount)}</div>
              </div>
            </div>
            <div class="donut-legend">
              ${data.map(item => `
                <div class="donut-legend-item touch-target" data-cat-id="${item.id}" style="cursor: pointer; padding: 8px 4px; border-radius: var(--radius-md); transition: background 0.2s; align-items: center;">
                  <div class="donut-legend-color" style="background: ${item.isOthers ? othersColor : baseColor}; opacity: ${item.isOthers ? '0.6' : '1'}; height: 32px;"></div>
                  <div class="list-item-icon ${item.isOthers ? 'bg-tint-balance' : (isExpense ? 'bg-tint-expense' : 'bg-tint-income')}" style="width: 32px; height: 32px; min-width: 32px;"><i data-lucide="${item.icon}" style="width: 18px; height: 18px;"></i></div>
                  <div class="donut-legend-info" style="margin-left: 4px;">
                    <span class="donut-legend-name" style="${item.isOthers ? 'opacity:0.65;' : ''}">${item.name}</span>
                    <span class="donut-legend-pct">${item.percentage.toFixed(1)}%</span>
                  </div>
                  <div class="donut-legend-amount" style="${item.isOthers ? 'opacity:0.65;' : ''}">${window.Store.formatCurrency(item.amount)}</div>
                  <div style="color: var(--text-tertiary); margin-left: 8px;">›</div>
                </div>
              `).join('')}
            </div>
          </div>
        `;
      }

      return `
        <div class="card card-elevated" style="padding: var(--space-5); margin-top: var(--space-4); border-radius: var(--radius-2xl); position: relative; overflow: hidden;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: var(--space-6); position: relative; z-index: 1;">
            <p class="section-title" style="margin-bottom: 0; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.05em; opacity: 0.8;">Distribution</p>
            
            <div class="chart-toggle-group">
              <button class="chart-toggle-btn ${isExpense ? 'active' : ''}" data-type="expense">Expenses</button>
              <button class="chart-toggle-btn ${!isExpense ? 'active' : ''}" data-type="income">Income</button>
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
        const newData = window.Store.computeCategoryDistribution(filters, type);
        
        // Fully re-render the card's content for simplicity and correctness
        // but we need to find the card container.
        // Actually, let's just update the internal content.
        const card = container.querySelector('.donut-chart-layout') || container.querySelector('[style*="height: 200px"]');
        if (card) {
          const parent = card.parentElement;
          // We need a way to swap the content without losing the header or the whole view.
          // Let's just re-render the whole component and swap innerHTML of the card.
          // Wait, that's messy. Let's just use the Store emit to re-render everything
          // BUT we need to persist the toggle state.
          // I'll store the toggle state in the Store's analyticsFilters or as a local var here.
          // Since it's preferred to be "integrated", maybe I should put it in the store.
          
          // Actually, let's just do a manual update for snappy feel.
          this._currentType = type;
          const html = this.render(newData, type);
          // Find the outer card
          const outerCard = container.querySelector('.donut-chart-layout')?.closest('.card') || container.querySelector('[style*="height: 200px"]')?.closest('.card');
          if (outerCard) {
            outerCard.outerHTML = html;
            // Need to re-attach events because we replaced the DOM
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

      const legendItems = container.querySelectorAll('.donut-legend-item');
      legendItems.forEach(item => {
        item.addEventListener('click', () => {
          const catId = item.dataset.catId;
          if (catId === '__others__') return; // Do not filter directly on others

          const aFilters = window.Store.state.analyticsFilters;
          const hFilters = window.Store.state.historyFilters;
          
          hFilters.period = { ...aFilters.period };
          hFilters.accounts = [...aFilters.accounts];
          hFilters.categories = [catId];
          hFilters.types = [this._currentType];
          
          window.Store.emit();
          if (window.Router) {
            window.Router.navigate('#transactions');
          }
        });
      });
      
      if (window.StackdHydrateIcons) window.StackdHydrateIcons();

      if (!canvas || !window.Chart) return;

      const rawData = window.Store.computeCategoryDistribution(filters, this._currentType);
      const data = this._capData(rawData);
      if (data.length === 0) return;

      if (this._chartInstance) {
        this._chartInstance.destroy();
      }

      const isExpense = this._currentType === 'expense';
      const baseColor = isExpense ? '#64748b' : '#6366f1';
      const othersColor = isExpense ? '#94a3b8' : '#a5b4fc';
      const hoverBase = isExpense ? '#475569' : '#4f46e5';
      const hoverOthers = isExpense ? '#64748b' : '#818cf8';

      // Use borderWidth + transparent border for EVENLY distributed gaps —
      // Chart.js `spacing` is added in absolute px per segment, so large
      // segments and small ones get visually different-looking gaps.
      // A uniform borderWidth on a transparent background creates perfectly
      // consistent physical gaps between every segment.
      const GAP = 3; // px gap on each side of every segment

      this._chartInstance = new window.Chart(canvas, {
        type: 'doughnut',
        data: {
          labels: data.map(d => d.name),
          datasets: [{
            data: data.map(d => d.amount),
            backgroundColor: data.map(d => d.isOthers ? othersColor : baseColor),
            hoverBackgroundColor: data.map(d => d.isOthers ? hoverOthers : hoverBase),
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
              backgroundColor: '#ffffff',
              titleColor: '#64748b',
              titleFont: { size: 11, weight: '600' },
              bodyColor: '#334155',
              bodyFont: { family: 'Manrope', size: 13, weight: '800' },
              borderColor: '#e2e8f0',
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
  }
};


