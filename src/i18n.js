// i18n.js - Stack'd internationalization core (v0.86, Phase 8a)
// Attaches window.I18n. Loads AFTER db.js and BEFORE store.js (the store
// needs t() for period labels). Dictionaries are flat key→string maps that
// attach themselves via src/i18n/<lang>.js as window.I18n.dicts.<lang>.
//
// Lookup chain per key: requested language → en → the key itself. A missing
// translation degrades to English (or the key), never to a blank or a crash,
// which is what makes incremental per-screen migration safe.

const I18n = {
  lang: 'en',
  dicts: {},

  // Single source of truth for both language pickers (Settings and the
  // first-launch Region Setup modal). Labels are endonyms by convention,
  // so they are the same in every language and never live in a dictionary.
  LANGUAGES: [
    { code: 'en', label: 'English' },
    { code: 'fr', label: 'Français' },
    { code: 'it', label: 'Italiano' },
    { code: 'es', label: 'Español' },
    { code: 'pt', label: 'Português' },
  ],

  // BCP 47 locale for Intl APIs (dates, numbers, currency, plural rules).
  _LOCALES: { en: 'en-US', fr: 'fr-FR', it: 'it-IT', es: 'es-ES', pt: 'pt-PT' },

  locale() {
    return this._LOCALES[this.lang] || this._LOCALES.en;
  },

  setLang(code) {
    this.lang = Object.prototype.hasOwnProperty.call(this._LOCALES, code) ? code : 'en';
  },

  // Intl.PluralRules instances are cached per locale — t() runs on every
  // wholesale re-render, so construction cost matters.
  _pluralRules: {},
  _pluralSelect(count) {
    const loc = this.locale();
    if (!this._pluralRules[loc]) this._pluralRules[loc] = new Intl.PluralRules(loc);
    return this._pluralRules[loc].select(count);
  },

  // Resolve a key against one dictionary. When params.count is a number the
  // plural variant keys are tried first: an explicit '<key>.zero' override
  // for count 0 (CLDR has no zero category for our five languages), then the
  // CLDR category ('<key>.one' / '<key>.other' — note fr/es/pt treat 0 as
  // 'one'), then '<key>.other', then the bare key.
  _resolve(dict, key, params) {
    if (!dict) return null;
    if (params && typeof params.count === 'number') {
      if (params.count === 0 && dict[key + '.zero'] != null) return dict[key + '.zero'];
      const variant = dict[key + '.' + this._pluralSelect(params.count)];
      if (variant != null) return variant;
      if (dict[key + '.other'] != null) return dict[key + '.other'];
    }
    return dict[key] != null ? dict[key] : null;
  },

  // v0.89 P8d: calendar/picker chrome had hardcoded English month and weekday
  // arrays. Intl derives them from the active locale, so they never need a
  // dictionary entry — and they stay correct for any locale added later.
  // Cached per locale+style: the pickers rebuild these on every re-render.
  _dateNameCache: {},

  monthNames(style = 'long') {
    const key = this.locale() + '|' + style;
    if (!this._dateNameCache[key]) {
      const fmt = new Intl.DateTimeFormat(this.locale(), { month: style });
      // Day 15 avoids any month-length/DST edge; the year is irrelevant here.
      this._dateNameCache[key] = Array.from({ length: 12 }, (_, m) =>
        fmt.format(new Date(2021, m, 15))
      );
    }
    return this._dateNameCache[key];
  },

  // Monday-first, matching the calendar grid's own layout.
  weekdayInitials() {
    const key = this.locale() + '|weekday-narrow';
    if (!this._dateNameCache[key]) {
      const fmt = new Intl.DateTimeFormat(this.locale(), { weekday: 'narrow' });
      // 2021-02-01 was a Monday.
      this._dateNameCache[key] = Array.from({ length: 7 }, (_, i) =>
        fmt.format(new Date(2021, 1, 1 + i))
      );
    }
    return this._dateNameCache[key];
  },

  // t('history.selection.count', { count: 3 }) → '3 selected'
  // Placeholders use {name} syntax; unknown placeholders are left intact.
  t(key, params) {
    let str = this._resolve(this.dicts[this.lang], key, params);
    if (str == null && this.lang !== 'en') str = this._resolve(this.dicts.en, key, params);
    if (str == null) return key;
    if (params) {
      str = str.replace(/\{(\w+)\}/g, (match, name) =>
        Object.prototype.hasOwnProperty.call(params, name) ? String(params[name]) : match
      );
    }
    return str;
  },
};

window.I18n = I18n;
