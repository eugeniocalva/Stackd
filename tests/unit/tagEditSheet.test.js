// @vitest-environment jsdom
// 1.2.2 (HG-14, docs/tags-page-plan.md) — the Tags page's add / edit sheet
// and the EDIT_TAG / DELETE_TAG {fromTransactions} store actions.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const executeFile = (path) => {
  const content = readFileSync(resolve(__dirname, '../../src', path), 'utf8');
  const fn = new Function('window', 'document', 'localStorage', 'crypto', content);
  fn(window, document, window.localStorage, window.crypto);
};

const S = () => window.Store;
const C = () => window.Components;
const $ = (sel) => document.querySelector(sel);
const click = (sel) => $(sel).dispatchEvent(new MouseEvent('click', { bubbles: true }));
const txs = () => S().getState().transactions.filter(t => t.type !== 'opening_balance');
const byNote = (n) => txs().find(t => t.notes === n);

let accId;
let acc2;
const addTx = (over) => S().dispatch('ADD_TRANSACTION', {
  type: 'expense', amount: 5, accountId: accId, categoryId: 'cat_groceries', date: '2026-10-02', tags: [], ...over
});

describe('Tags page edit (HG-14)', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="modal-container"></div><main id="router-view"></main>';
    window.localStorage.clear();
    window.localStorage.setItem('stackd_v1_homeWidgets', '[]');
    if (!window.crypto || !window.crypto.randomUUID) {
      let n = 0;
      Object.defineProperty(window, 'crypto', { value: { randomUUID: () => 'uuid-' + (++n) }, writable: true, configurable: true });
    }
    window.StackdHydrateIcons = vi.fn();
    window.Router = { navigate: vi.fn() };
    ['db.js', 'i18n.js', 'i18n/en.js', 'loan-engine.js', 'store.js', 'components.js', 'views.js'].forEach(executeFile);
    S().init();
    S().dispatch('ADD_ACCOUNT', { name: 'Main', openingBalance: 0, openingDate: '2026-01-01' });
    S().dispatch('ADD_ACCOUNT', { name: 'Second', openingBalance: 0, openingDate: '2026-01-01' });
    [accId, acc2] = S().getState().accounts.map(a => a.id);
    addTx({ notes: 'g1', categoryId: 'cat_groceries', tags: ['amazon'] });
    addTx({ notes: 'g2', categoryId: 'cat_groceries', tags: ['amazon', 'bulk'] });
    addTx({ notes: 'd1', categoryId: 'cat_dining', tags: ['amazon'] });
    addTx({ notes: 's1', categoryId: 'cat_shopping', tags: ['shop'] });
  });

  describe('EDIT_TAG', () => {
    it('renames the tag on every row, its links and the History filter', () => {
      S().dispatch('UPDATE_FILTERS', { page: 'history', filters: { tags: ['amazon'] } });
      S().dispatch('EDIT_TAG', { tag: 'amazon', name: 'Online', categoryIds: ['cat_groceries', 'cat_dining'] });
      expect(byNote('g2').tags).toEqual(['online', 'bulk']);
      expect(byNote('d1').tags).toEqual(['online']);
      expect(S().getAllUniqueTags()).not.toContain('amazon');
      expect(S().getState().tagLinks.online).toEqual(['cat_groceries', 'cat_dining']);
      expect(S().getState().historyFilters.tags).toEqual(['online']);
    });

    it('a name already in use merges, without a duplicate tag on a row', () => {
      addTx({ notes: 'both', categoryId: 'cat_shopping', tags: ['amazon', 'shop'] });
      S().dispatch('LINK_TAG', { tag: 'shop', categoryId: 'cat_shopping' });
      S().dispatch('EDIT_TAG', { tag: 'amazon', name: 'shop', categoryIds: ['cat_groceries'] });
      expect(byNote('both').tags).toEqual(['shop']);
      expect(byNote('g1').tags).toEqual(['shop']);
      expect(S().getState().tagLinks.shop).toEqual(['cat_shopping', 'cat_groceries']);
      expect(Object.prototype.hasOwnProperty.call(S().getState().tagLinks, 'amazon')).toBe(false);
    });

    it('a removed category: untag, keep or move its rows', () => {
      S().dispatch('EDIT_TAG', { tag: 'amazon', name: 'amazon', categoryIds: ['cat_shopping'],
        removed: { cat_groceries: { mode: 'move', to: 'cat_shopping' }, cat_dining: { mode: 'untag' } } });
      expect(byNote('g1').categoryId).toBe('cat_shopping');
      expect(byNote('g2').categoryId).toBe('cat_shopping');
      expect(byNote('g2').tags).toEqual(['amazon', 'bulk']);
      expect(byNote('d1').categoryId).toBe('cat_dining');
      expect(byNote('d1').tags).toEqual([]);
      expect(S().getTagLinks('amazon')).toEqual(['cat_shopping']);

      S().dispatch('EDIT_TAG', { tag: 'amazon', name: 'amazon', categoryIds: [], removed: { cat_shopping: { mode: 'keep' } } });
      expect(byNote('g1').tags).toEqual(['amazon']);
      expect(S().getState().tagLinks.amazon).toEqual(['cat_shopping']);
    });

    it('a move never moves a transfer leg', () => {
      S().dispatch('ADD_TRANSFER', { amount: 10, fromAccountId: accId, toAccountId: acc2, date: '2026-10-03', tags: ['amazon'] });
      const legs = () => S().getState().transactions.filter(t => t.transferRef);
      const before = legs().map(t => t.categoryId);
      const cat = before[0];
      expect(S().tagUsage('amazon').byCat[cat].movable).toBe(0);
      S().dispatch('EDIT_TAG', { tag: 'amazon', name: 'amazon', categoryIds: ['cat_shopping'],
        removed: { [cat]: { mode: 'move', to: 'cat_shopping' } } });
      expect(legs().map(t => t.categoryId)).toEqual(before);
    });

    it('creates a new tag with its categories', () => {
      S().dispatch('EDIT_TAG', { tag: null, name: 'trip', categoryIds: ['cat_dining', 'nope'] });
      expect(S().getState().tagLinks.trip).toEqual(['cat_dining']);
      expect(S().getAllUniqueTags()).toContain('trip');
    });

    it('DELETE_TAG {fromTransactions} strips the tag from its rows, which stay', () => {
      const n = txs().length;
      S().dispatch('UPDATE_FILTERS', { page: 'analytics', filters: { tags: ['amazon', 'shop'] } });
      S().dispatch('DELETE_TAG', { tag: 'amazon', fromTransactions: true });
      expect(txs().length).toBe(n);
      expect(txs().some(t => t.tags.includes('amazon'))).toBe(false);
      expect(byNote('g2').tags).toEqual(['bulk']);
      expect(S().getState().analyticsFilters.tags).toEqual(['shop']);
    });
  });

  describe('Components.TagEditSheet', () => {
    const typeName = (v) => { const i = $('#tag-name'); i.value = v; i.dispatchEvent(new Event('input', { bubbles: true })); };

    it('the page has a + button and a row opens the edit sheet, not History', () => {
      const root = $('#router-view');
      root.innerHTML = window.Views.TagsView.render(S().getState());
      window.Views.TagsView.attachEvents(root, S().getState());
      expect($('#tags-add').getAttribute('aria-label')).toBe('Add tag');
      root.querySelector('[data-tag-open="amazon"]').click();
      expect($('#tag-edit-sheet')).toBeTruthy();
      expect($('#tes-title').textContent).toBe('Edit tag');
      expect($('#tag-name').value).toBe('amazon');
      expect($('.tes-chips').textContent).toContain('Groceries');
      expect($('.tes-chips').textContent).toContain('Dining');
      expect($('[data-k="see"]').textContent).toContain('See 3 transactions');
      expect(window.Router.navigate).not.toHaveBeenCalled();
    });

    it('Save is off until something changes; a rename asks before it lands', () => {
      C().TagEditSheet.show({ tag: 'amazon' });
      expect($('#tes-save').disabled).toBe(true);
      typeName('online');
      expect($('#tes-save').disabled).toBe(false);
      click('#tes-save');
      expect($('#tes-title').textContent).toBe('Confirm changes');
      expect($('.tes-summary').textContent).toContain('#amazon becomes #online on 3 transactions.');
      expect(byNote('g1').tags).toEqual(['amazon']); // nothing yet
      click('#tes-confirm');
      expect(byNote('g1').tags).toEqual(['online']);
    });

    it('a rename onto an existing tag is announced as a merge', () => {
      C().TagEditSheet.show({ tag: 'amazon' });
      typeName('shop');
      click('#tes-save');
      expect($('.tes-summary').textContent).toContain('#shop already exists: #amazon and its 3 transactions join it.');
    });

    it('removing a used category asks what its rows do; Move offers the newest added category', () => {
      C().TagEditSheet.show({ tag: 'amazon' });
      click('[data-rm="cat_groceries"]');
      click('[data-k="add-cat"]');
      expect($('#tes-title').textContent).toBe('Add category');
      click('[data-pick="cat_shopping"]');
      click('#tes-save');
      const q = $('.tes-q');
      expect(q.querySelector('legend').textContent).toBe('2 transactions in Groceries still have #amazon. What should happen to them?');
      expect(q.querySelector('input[data-mode="keep"]').checked).toBe(true);
      const move = q.querySelector('input[data-mode="move"]');
      move.checked = true;
      move.dispatchEvent(new Event('change', { bubbles: true }));
      expect($('select[data-move="cat_groceries"]').value).toBe('cat_shopping');
      click('#tes-confirm');
      expect(byNote('g1').categoryId).toBe('cat_shopping');
      expect(byNote('d1').categoryId).toBe('cat_dining');
      expect($('#tag-edit-sheet').classList.contains('open')).toBe(false);
    });

    it('a new tag on an existing name is a field error; an empty name too', () => {
      C().TagEditSheet.show({ tag: null });
      expect($('#tes-title').textContent).toBe('New tag');
      typeName('Amazon');
      click('#tes-save');
      expect($('#tag-name-error').textContent).toBe('A tag with this name already exists.');
      expect($('#tag-name').getAttribute('aria-invalid')).toBe('true');
      typeName('   ');
      expect($('#tes-save').disabled).toBe(true);
      typeName('trip');
      click('#tes-save');
      expect(S().getAllUniqueTags()).toContain('trip');
    });

    it('Delete confirms with the row count, then strips the tag', () => {
      C().TagEditSheet.show({ tag: 'amazon' });
      click('#tes-delete');
      expect($('#tes-title').textContent).toBe('Delete #amazon?');
      expect($('.tes-body').textContent).toBe('It is removed from 3 transactions. The transactions stay.');
      click('#tes-delete-yes');
      expect(S().getAllUniqueTags()).not.toContain('amazon');
    });

    it('escapes a stored tag and category name', () => {
      S().dispatch('LINK_TAG', { tag: '<b>x', categoryId: 'cat_dining' });
      C().TagEditSheet.show({ tag: '<b>x' });
      expect($('#tag-edit-sheet b')).toBeNull();
      expect($('#tag-name').value).toBe('<b>x');
    });
  });
});
