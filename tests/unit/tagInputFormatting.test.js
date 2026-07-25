// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const executeFile = (path) => {
  const content = readFileSync(resolve(__dirname, '../../src', path), 'utf8');
  const fn = new Function('window', 'document', 'localStorage', 'crypto', content);
  fn(window, document, window.localStorage, window.crypto);
};

describe('Tag Input Formatting', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="modal-container"></div><div id="app"></div>';

    if (!window.crypto || !window.crypto.randomUUID) {
      Object.defineProperty(window, 'crypto', {
        value: {
          randomUUID: () => 'test-uuid-' + Math.random().toString(36).substr(2, 9)
        },
        writable: true,
        configurable: true
      });
    }
    window.StackdHydrateIcons = vi.fn();

    executeFile('db.js');
    executeFile('store.js');
    executeFile('components.js');

    window.Store.init();
  });

  describe('TagsModal', () => {
    it('forces initial tags to lowercase', () => {
      let saved = null;
      window.Components.TagsModal.show({
        initialTags: ['FOOD', 'Groceries', 'DINNER'],
        onSave: (tags) => { saved = tags; }
      });

      const modal = document.getElementById('tags-modal');
      expect(modal).not.toBeNull();

      const activeChips = modal.querySelectorAll('.tag-chip.active');
      const activeTags = Array.from(activeChips).map(c => c.dataset.tag);
      expect(activeTags).toEqual(['food', 'groceries', 'dinner']);
    });

    it('renders guidance message explaining space prohibition and "_" delimiter', () => {
      window.Components.TagsModal.show({ initialTags: [] });
      const modal = document.getElementById('tags-modal');
      expect(modal.innerHTML).toContain("Tags cannot contain spaces (use '_' as delimiter)");
    });

    it('converts typed text to lowercase on input event', () => {
      window.Components.TagsModal.show({ initialTags: [] });
      const input = document.getElementById('tag-input');

      input.value = 'CAPITALSTAG';
      input.dispatchEvent(new Event('input'));

      expect(input.value).toBe('capitalstag');
    });

    it('submits tag on Space keydown and clears input', () => {
      let savedTags = [];
      window.Components.TagsModal.show({
        initialTags: [],
        onSave: (tags) => { savedTags = tags; }
      });

      const input = document.getElementById('tag-input');
      input.value = 'lunch';

      const spaceEvent = new KeyboardEvent('keydown', { key: ' ', code: 'Space', cancelable: true });
      input.dispatchEvent(spaceEvent);

      expect(spaceEvent.defaultPrevented).toBe(true);

      const activeChips = document.querySelectorAll('.tag-chip.active');
      const activeTags = Array.from(activeChips).map(c => c.dataset.tag);
      expect(activeTags).toContain('lunch');
    });

    it('handles multiple space-delimited tags pasted into input', () => {
      window.Components.TagsModal.show({ initialTags: [] });
      const input = document.getElementById('tag-input');

      input.value = 'Breakfast Coffee ';
      input.dispatchEvent(new Event('input'));

      const activeChips = document.querySelectorAll('.tag-chip.active');
      const activeTags = Array.from(activeChips).map(c => c.dataset.tag);
      expect(activeTags).toContain('breakfast');
      expect(activeTags).toContain('coffee');
    });
  });
});
