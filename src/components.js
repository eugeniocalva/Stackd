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
              <span style="font-size: 0.8rem; font-weight: 700; color: var(--text-primary);">Add Log</span>
            </a>
            <a href="#edit-account" class="menu-action-item" style="text-decoration: none; background: var(--bg-surface-sunken); padding: var(--space-4) var(--space-2); border-radius: 20px; display: flex; flex-direction: column; align-items: center; gap: var(--space-2); transition: transform 0.2s ease;">
              <div style="width: 44px; height: 44px; border-radius: 14px; background: var(--bg-surface-dim); color: var(--color-primary); display: flex; align-items: center; justify-content: center;"><i data-lucide="landmark"></i></div>
              <span style="font-size: 0.8rem; font-weight: 700; color: var(--text-primary);">Add Account</span>
            </a>
            <a href="#debt" class="menu-action-item" style="text-decoration: none; background: var(--bg-surface-sunken); padding: var(--space-4) var(--space-2); border-radius: 20px; display: flex; flex-direction: column; align-items: center; gap: var(--space-2); transition: transform 0.2s ease;">
              <div style="width: 44px; height: 44px; border-radius: 14px; background: var(--bg-surface-dim); color: var(--color-primary); display: flex; align-items: center; justify-content: center;"><i data-lucide="percent"></i></div>
              <span style="font-size: 0.8rem; font-weight: 700; color: var(--text-primary);">Debt</span>
            </a>
            <a href="#edit-category" class="menu-action-item" style="text-decoration: none; background: var(--bg-surface-sunken); padding: var(--space-4) var(--space-2); border-radius: 20px; display: flex; flex-direction: column; align-items: center; gap: var(--space-2); transition: transform 0.2s ease;">
              <div style="width: 44px; height: 44px; border-radius: 14px; background: var(--bg-surface-dim); color: var(--color-primary); display: flex; align-items: center; justify-content: center;"><i data-lucide="tag"></i></div>
              <span style="font-size: 0.8rem; font-weight: 700; color: var(--text-primary);">Add Category</span>
            </a>
            <a href="#settings" class="menu-action-item" style="text-decoration: none; background: var(--bg-surface-sunken); padding: var(--space-4) var(--space-2); border-radius: 20px; grid-column: span 2; display: flex; align-items: center; justify-content: center; gap: var(--space-3); transition: transform 0.2s ease;">
              <div style="width: 32px; height: 32px; border-radius: 10px; background: var(--bg-surface-dim); color: var(--text-secondary); display: flex; align-items: center; justify-content: center;"><i data-lucide="more-horizontal" style="width: 18px; height: 18px;"></i></div>
              <span style="font-size: 0.8rem; font-weight: 700; color: var(--text-secondary);">Others &amp; Settings</span>
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
      const { title, content, onSave, saveText = 'Save', showDelete = false, onDelete, showClose = false } = options;
      const container = document.getElementById('modal-container');
      container.innerHTML = `
        <div class="modal-backdrop" id="active-modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">
          <div class="modal-content">
            <div class="modal-handle"></div>
            <div class="modal-header-container">
              <h2 id="modal-title" class="header-title" style="margin-bottom: 0; font-size: var(--text-2xl);">${title}</h2>
              ${showClose ? `
                <button class="modal-close-btn" id="modal-close-icon-btn" aria-label="Close modal">
                  <i data-lucide="x" style="width: 24px; height: 24px;"></i>
                </button>
              ` : ''}
            </div>
            <div class="modal-body">${content}</div>
            <div style="margin-top: var(--space-6); display: flex; flex-direction: column; gap: var(--space-3);">
              <button class="btn btn-primary" id="modal-save-btn">${saveText}</button>
              ${showDelete ? `<button class="btn btn-danger" id="modal-delete-btn" aria-label="Delete this item">Delete</button>` : ''}
              <button class="btn btn-secondary" id="modal-cancel-btn" aria-label="Cancel and close modal">Cancel</button>
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
          <input type="text" id="icon-search" class="form-control" placeholder="Search icons..." aria-label="Search icons" autocomplete="off" style="font-size: var(--text-sm); margin-bottom: var(--space-3);">
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
                <button class="btn btn-secondary" id="ip-cancel" style="flex: 1; padding: 8px 16px; min-height: 40px;" aria-label="Cancel selection">Cancel</button>
                <button class="btn btn-primary" id="ip-confirm" style="flex: 1; padding: 8px 16px; min-height: 40px;" aria-label="Confirm selection">Done</button>
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
      const dateStr = new Date(transaction.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      
      const isSelectionMode = options && options.isSelectionMode === true;
      const isSelected = options && options.isSelected === true;

      const checkboxHtml = isSelectionMode ? `
        <div class="custom-selection-checkbox tx-select-checkbox ${isSelected ? 'checked' : ''}" data-id="${transaction.id}">
          ${isSelected ? `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>` : ''}
        </div>
      ` : '';

      const selectedClass = isSelected ? 'list-item-selected' : '';
      const selectedBgStyle = isSelected ? 'background-color: var(--bg-surface-sunken); border-width: 2px; border-style: solid;' : '';

      const isPaid = transaction.isPaid === true;
      const isUnpaid = transaction.isPaid === false;

      const paidBadgeHtml = isPaid ? `
        <span class="paid-badge">
          <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
          <span>Paid</span>
        </span>
      ` : '';

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
              <span>${category ? category.name : (transaction.transferRef ? 'Transfer' : 'Unknown')}</span>
              ${paidBadgeHtml}
            </div>
            <div class="list-item-value ${amountClass}">${formattedAmount}</div>
          </div>
          <div style="display: flex; justify-content: space-between; align-items: center; gap: 8px; margin-top: 4px;">
            <div style="display: flex; align-items: center; gap: 6px; min-width: 0; flex: 1;">
              <div class="list-item-subtitle" style="flex-shrink: 0;">${accountData ? accountData.name : 'Account'}</div>
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
          <div class="list-item touch-target ${isFlush ? 'list-item-flush' : ''} ${selectedClass}" data-id="${transaction.id}" style="cursor: pointer; width: 100%; ${selectedBgStyle}" tabindex="0" role="button" aria-label="Transaction of ${formattedAmount}">
            ${innerContent}
          </div>`;
      }

      const paidBtnClass = isPaid ? 'is-paid' : (isUnpaid ? 'is-unpaid' : '');

      return `
        <div class="swipe-container" data-id="${transaction.id}">
          <div class="swipe-actions left">
            <button class="swipe-action-btn paid ${paidBtnClass}" data-id="${transaction.id}" aria-label="${isPaid ? 'Mark as unpaid' : 'Mark as paid'}">
              <i data-lucide="check" style="width: 20px; height: 20px;"></i>
            </button>
          </div>
          <div class="swipe-actions right">
            <button class="swipe-action-btn edit" data-id="${transaction.id}" aria-label="Edit transaction">
              <i data-lucide="edit-2" style="width: 20px; height: 20px;"></i>
            </button>
            <button class="swipe-action-btn delete" data-id="${transaction.id}" aria-label="Delete transaction">
              <i data-lucide="trash-2" style="width: 20px; height: 20px;"></i>
            </button>
          </div>
          <div class="list-item touch-target swipe-content ${isFlush ? 'list-item-flush' : ''} ${selectedClass}" data-id="${transaction.id}" style="cursor: pointer; width: 100%; ${selectedBgStyle}" tabindex="0" role="button" aria-label="Transaction of ${formattedAmount}">
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
        { id: 'today', label: 'Day' },
        { id: 'week', label: 'Week' },
        { id: 'month', label: 'Month' },
        { id: 'year', label: 'Year' }
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
            <button class="filter-pill filter-pill-icon" id="btn-prev-${pageKey}" data-page="${pageKey}" ${hasCustomRange ? 'disabled style="opacity:0.3"' : ''} aria-label="Previous period">
              <i data-lucide="chevron-left" style="width: 18px; height: 18px;"></i>
            </button>
            <button class="filter-pill" id="btn-today-${pageKey}" data-page="${pageKey}" ${hasCustomRange && pageKey !== 'history' ? 'disabled style="opacity:0.3"' : ''}>
              Today
            </button>
            <button class="filter-pill filter-pill-icon" id="btn-next-${pageKey}" data-page="${pageKey}" ${isFuture || hasCustomRange ? 'disabled style="opacity:0.3"' : ''} aria-label="Next period">
              <i data-lucide="chevron-right" style="width: 18px; height: 18px;"></i>
            </button>

            <div style="width: 1px; height: 24px; background: var(--border-color); margin: auto 4px; flex-shrink: 0;"></div>

            <button class="filter-pill filter-pill-icon ${hasAnyFilter ? 'active' : ''}" 
                    id="btn-clear-${pageKey}" data-page="${pageKey}" 
                    aria-label="Clear all filters" title="Clear all filters"
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
                    id="btn-calendar-${pageKey}" data-page="${pageKey}" aria-label="Calendar range">
              <i data-lucide="calendar" style="width: 18px; height: 18px;"></i>
            </button>
            
            <button class="filter-pill filter-pill-icon ${hasActiveCategoryAccountFilters ? 'active' : ''}" 
                    id="btn-filter-${pageKey}" data-page="${pageKey}" aria-label="Filter and Sort">
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
          // History defaults to Oldest First; analytics defaults to Newest First
          currentFilters.sortOrder = pageKey === 'history' ? 'asc' : 'desc';
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
        const title = recurrence.enabled ? 'Edit Recurring' : 'Recurring Settings';
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
                      <button class="freq-pill ${isWeekly ? 'active' : ''}" data-freq="weekly">Weekly</button>
                      <button class="freq-pill ${isBiWeekly ? 'active' : ''}" data-freq="biweekly">Every 2 Weeks</button>
                      <button class="freq-pill ${isMonthly ? 'active' : ''}" data-freq="monthly">Monthly</button>
                      <button class="freq-pill ${isQuarterly ? 'active' : ''}" data-freq="quarterly">Quarterly</button>
                      <button class="freq-pill ${isYearly ? 'active' : ''}" data-freq="yearly">Yearly</button>
                    </div>
                  </div>

                  <!-- Dates -->
                  <div style="display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-4);">
                    <div class="form-group" style="margin-bottom: 0;">
                      <label class="form-label" for="rs-start-date">Start Date</label>
                      <input type="date" id="rs-start-date" class="form-control" value="${recurrence.startDate}">
                    </div>
                    <div class="form-group" style="margin-bottom: 0;">
                      <label class="form-label" for="rs-end-date">Ends On</label>
                      <input type="date" id="rs-end-date" class="form-control" value="${recurrence.endDate || ''}">
                    </div>
                  </div>

                  <!-- Warning -->
                  <div id="rs-warning" style="display: none; background: var(--color-expense-bg); color: var(--color-expense); padding: var(--space-3); border-radius: var(--radius-md); font-size: var(--text-xs); line-height: 1.4; border: 1px solid rgba(255, 68, 68, 0.1);">
                    <div style="display: flex; gap: 8px;">
                      <i data-lucide="alert-circle" style="width: 14px; height: 14px; flex-shrink: 0;"></i>
                      <span>Recurring transactions are capped at <strong>5 years (60 months)</strong> to keep the app fast. The end date will be automatically adjusted when saving.</span>
                    </div>
                  </div>
                </div>

                <div style="display: flex; gap: var(--space-3); margin-top: var(--space-2);">
                  <button id="rs-cancel" class="btn btn-secondary" style="flex: 1;">Cancel</button>
                  <button id="rs-save" class="btn btn-primary" style="flex: 2;">Save Rules</button>
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
        tickColor: '#94a3b8'
      };
    },

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

      // Destroy any existing Chart.js instance on this canvas to prevent the
      // 'Canvas is already in use' error when navigating back to the Analytics view.
      const existingNetFlowChart = window.Chart.getChart ? window.Chart.getChart(canvas) : null;
      if (existingNetFlowChart) existingNetFlowChart.destroy();

      // Dynamic Y-axis scaling (multiples of 10/50/100/200/250/500) — see _computeYScale
      const yScale = this._computeYScale(values);
      const { tooltipBg, tooltipTitle, tooltipBody, tooltipBorder, gridColor, tickColor } = this._themeColors();

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
                  const formattedAbs = Math.abs(val).toLocaleString('en-US', { maximumFractionDigits: 0 });
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
      const rawCapped = this._capData(rawData);
      const data = this._assignColors(rawCapped);
      
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
                  <div class="donut-legend-color" style="background: ${item._color}; opacity: ${item.isOthers ? '0.6' : '1'}; height: 32px;"></div>
                  <div class="list-item-icon" style="width: 32px; height: 32px; min-width: 32px;"><i data-lucide="${item.icon}" style="width: 18px; height: 18px;"></i></div>
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
                <h2 class="header-title" style="margin: 0; font-size: var(--text-xl);">Tags</h2>
                <p style="color: var(--text-secondary); font-size: var(--text-sm); margin: var(--space-1) 0 0;">Categorize your transaction with tags.</p>
              </div>

              <div style="padding: var(--space-4) var(--space-5); flex: 1; overflow-y: auto;">
                <!-- Tag Input -->
                <div style="margin-bottom: var(--space-5);">
                  <div style="display: flex; gap: 8px;">
                    <div style="flex: 1; position: relative;">
                      <input type="text" id="tag-input" class="form-control" placeholder="New tag..." aria-label="New tag name" maxlength="20" style="padding-left: 32px;" autocomplete="off">
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
                <button id="tags-cancel" class="btn btn-secondary" style="flex: 1;">Cancel</button>
                <button id="tags-save" class="btn btn-primary" style="flex: 2;">Apply Tags</button>
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
      let futureSub = 'Apply the change from this point on';
      let allSub = 'Also update past transactions (their dates never move)';
      if (recurrenceRemoved) {
        description = "You turned off Recurrent on a transaction that belongs to a repeating series. What should happen to the series?";
        futureSub = 'Stop the series: upcoming scheduled transactions are removed';
        allSub = 'Also unlink past transactions (they stay in your history)';
      } else if (dateChanged) {
        futureSub = 'Upcoming transactions shift to the new day';
        allSub = 'Past dates never move; upcoming shift to the new day';
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
              <h2 id="rum-title" class="header-title" style="margin: 0 0 var(--space-1); font-size: var(--text-xl);">${recurrenceRemoved ? 'Stop Recurring?' : 'Recurring Transaction'}</h2>
              <p style="color: var(--text-secondary); font-size: var(--text-sm); margin: 0;">${description}</p>
            </div>

            <div style="display: flex; flex-direction: column; padding: var(--space-3) var(--space-4) var(--space-5); gap: var(--space-2);">
              ${optionCard('ru-only-this', 'Only this transaction', recurrenceRemoved ? 'Unlink just this one; the series continues' : 'Everything else in the series stays as it is')}
              ${optionCard('ru-this-future', 'This and future transactions', futureSub)}
              ${optionCard('ru-all-series', 'All transactions in the series', allSub)}
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
    MONTHS_FULL: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],

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
              <button class="modal-btn-top modal-btn-close" id="mp-cancel">Cancel</button>
              <h3 id="mp-title" style="margin: 0; font-weight: 800; font-size: 1rem;">Select Month</h3>
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
              <div id="mp-month-grid" style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px;" role="group" aria-label="Month selection">
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
          <div class="modal-top-bar" style="border-bottom: 1px solid var(--color-border); background: var(--bg-surface); padding: var(--space-4) var(--space-5); display: flex; align-items: center; justify-content: space-between;">
            <button class="modal-btn-top modal-btn-close" id="csm-close" aria-label="Close category selection" style="display: flex; align-items: center; justify-content: center; width: 36px; height: 36px; border-radius: 12px; background: var(--bg-surface-sunken); border: none; cursor: pointer; color: var(--text-primary); font-size: 1.1rem; font-weight: bold; padding: 0;">✕</button>
            <h2 id="csm-title" class="header-title" style="margin: 0; font-size: 1.1rem; font-family: var(--font-family-display); font-weight: 700;">Select Category</h2>
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
          if (onSelect) onSelect(cat || { id: '', name: 'No category selected' });
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
              <button class="modal-btn-icon-left" id="egm-close" aria-label="Close chart modal">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-x" data-hydrated="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
              <h3 style="font-family: var(--font-family-display); font-weight: 800; font-size: 1.1rem; margin: 0; color: var(--text-primary);">Balance Trend</h3>
              <button class="modal-btn-filter-right ${showFilterPanel ? 'active' : ''}" id="egm-filter" aria-label="Toggle chart filters">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-sliders" data-hydrated="true"><line x1="4" x2="4" y1="21" y2="14"/><line x1="4" x2="4" y1="10" y2="3"/><line x1="12" x2="12" y1="21" y2="12"/><line x1="12" x2="12" y1="8" y2="3"/><line x1="20" x2="20" y1="21" y2="16"/><line x1="20" x2="20" y1="12" y2="3"/><line x1="2" x2="6" y1="14" y2="14"/><line x1="10" x2="14" y1="8" y2="8"/><line x1="18" x2="22" y1="16" y2="16"/></svg>
                <span>Filter</span>
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
                    <div class="filter-section-title">Interval</div>
                    <div class="filter-interval-group">
                      <button class="filter-interval-btn ${activeInterval === 'weekly' ? 'active' : ''}" data-interval="weekly">Weekly</button>
                      <button class="filter-interval-btn ${activeInterval === 'monthly' ? 'active' : ''}" data-interval="monthly">Monthly</button>
                      <button class="filter-interval-btn ${activeInterval === 'quarter' ? 'active' : ''}" data-interval="quarter">Quarter</button>
                    </div>
                  </div>

                  <!-- 2. Accounts Checkboxes -->
                  <div>
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
                      <div class="filter-section-title" style="margin-bottom: 0;">Accounts</div>
                      <button id="egm-toggle-all-accounts" style="background: none; border: none; font-size: 0.75rem; font-weight: 700; color: var(--color-primary, #111); cursor: pointer;">
                        ${selectedAccountIds.length === accounts.length ? 'Deselect All' : 'Select All'}
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
                      <div class="filter-section-title" style="margin-bottom: 0;">Categories</div>
                      <button id="egm-toggle-all-categories" style="background: none; border: none; font-size: 0.75rem; font-weight: 700; color: var(--color-primary, #111); cursor: pointer;">
                        ${selectedCategoryIds.length === categories.length || selectedCategoryIds.length === 0 ? 'Select All' : 'Deselect All'}
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
                    <span>Save View</span>
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
          label: 'Total Net Balance',
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
            <div class="modal-top-bar" style="border-bottom: 1px solid var(--color-border); background: var(--bg-surface); padding: var(--space-4) var(--space-5); display: flex; align-items: center; justify-content: space-between;">
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


