// main.js - Application Entry Point
import { App as CapacitorApp } from '@capacitor/app';

document.addEventListener('DOMContentLoaded', () => {
  // Global keyboard accessibility listener (WCAG)
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      const el = e.target;
      if (el && el.getAttribute('role') === 'button' && typeof el.click === 'function') {
        e.preventDefault();
        el.click();
      }
    }
  });

  // 1. Initialize data store
  window.Store.init();
  
  // 2. Initialize router
  window.Router.init();

  // Handle Android Native Back Button
  CapacitorApp.addListener('backButton', ({ canGoBack }) => {
    const state = window.Store.getState();
    if (state.activeView !== 'dashboard') {
      window.history.back();
    } else {
      CapacitorApp.exitApp();
    }
  });
  
  // 3. Mount static components (Bottom Nav)
  const navContainer = document.getElementById('bottom-nav');
  if (navContainer && window.Components && window.Components.BottomNav) {
    navContainer.innerHTML = window.Components.BottomNav.render();
    window.Components.BottomNav.attachEvents(navContainer);
  }
  
  const routerView = document.getElementById('router-view');
  
  // 4. Main render loop (reactive to state changes)
  window.Store.subscribe((state) => {
    if (!routerView) return;
    
    // Clear current view
    routerView.innerHTML = '';
    
    // Safely execute destroy on active view if it exists
    if (window._currentActiveView && window._currentActiveView.destroy) {
      window._currentActiveView.destroy();
    }
    
    // Choose appropriate view based on state.activeView
    let viewModule;
    switch(state.activeView) {
      case 'dashboard':
        viewModule = window.Views.DashboardView;
        break;
      case 'transactions':
        viewModule = window.Views.TransactionsView;
        break;
      case 'add':
      case 'edit':
        viewModule = window.Views.AddTransactionView;
        break;
      case 'categories':
        viewModule = window.Views.CategoriesView;
        break;
      case 'budget':
        viewModule = window.Views.BudgetView;
        break;
      case 'settings':
        viewModule = window.Views.OthersView;
        break;
      default:
        viewModule = window.Views.DashboardView;
    }
    
    if (viewModule && viewModule.render) {
      routerView.innerHTML = viewModule.render(state);
      if (viewModule.attachEvents) {
        // Need to wait for DOM update before attaching events
        requestAnimationFrame(() => {
          viewModule.attachEvents(routerView, state);
        });
      }
      window._currentActiveView = viewModule;
    }
    
    // Update active state in bottom nav
    if (navContainer && window.Components.BottomNav) {
      window.Components.BottomNav.updateActiveState(navContainer, state.activeView);
    }
  });
  
  // Initial render (force trigger the subscription)
  window.Store.emit();
});
