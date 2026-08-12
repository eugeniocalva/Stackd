// i18n/en.js - English dictionary (reference locale + global fallback).
// Flat key→string map, keys namespaced by area (e.g. 'history.selection.count').
// Plural variants are sibling keys: '<key>.one' / '<key>.other' (+ optional
// explicit '<key>.zero'). Placeholders use {name} syntax.
// Populated sub-phase by sub-phase (P8c–P8f); while a key is absent, t()
// returns the key itself, and every string in the app is still a hardcoded
// English literal — so an empty dictionary means "no visible change".

window.I18n.dicts.en = {};
