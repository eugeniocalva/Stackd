// db.js - LocalStorage Wrapper
window.StackdDB = {
  PREFIX: 'stackd_v1_',

  load(key, defaultValue = null) {
    try {
      const item = localStorage.getItem(this.PREFIX + key);
      return item ? JSON.parse(item) : defaultValue;
    } catch (error) {
      console.error('Error loading DB key:', key, error);
      return defaultValue;
    }
  },
  save(key, data) {
    try {
      localStorage.setItem(this.PREFIX + key, JSON.stringify(data));
      return true;
    } catch (error) {
      console.error('Error saving DB key:', key, error);
      return false;
    }
  },

  // ── ID generation ─────────────────────────────────────────────────────────
  generateId() {
    // Basic fallback since crypto.randomUUID isn't always available on file:// or older environments
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      return crypto.randomUUID();
    }
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }
};
