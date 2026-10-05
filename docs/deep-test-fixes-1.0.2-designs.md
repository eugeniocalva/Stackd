# 1.0.2 fix designs — per-unit detail

Companion to `docs/deep-test-fixes-1.0.2-plan.md`. These are the final designs after adversarial review, one section per implementation unit. Line numbers refer to commit `efcac0c` (tag v1.0.1 + docs). Each unit hands its section verbatim to its implementer; decisions marked "recommended" are the defaults the owner approves or overrides in the plan.

## U1 — Escaping and markup safety

BUG-24 is confirmed at efcac0c. The bug has three layers:
1. Stored free text is interpolated raw into innerHTML templates: account, category and tag names, account types, and series ids from a file.
2. Account colours and icons are enumerations written raw into style= and data-lucide= at about 30 sites, and no write path validates them.
3. Escaping exists, but as 13 separate copies. They are applied to notes, Smart Insights, widgets, loans and bank text, and never to these sinks.

**The final design.**
- **One escaper, `I18n.esc`, with short aliases** in each renderer: views.js `esc`/`escapeAttr`, a new `Components.esc` method, `Widgets._esc` and `Insights._esc`.
- **About 37 one-token sink edits**: names, types and tags, plus the four account-colour style sinks.
- **Store validators applied on write**: colours (palette), icons (`isSafeIcon`) and ids (`safeId`). ADD_ACCOUNT, ADD_CATEGORY and BATCH_IMPORT_TRANSACTIONS act as backstops.
- **`Store.fileId`** for every id read from a file. A safe id is kept; anything else maps to a stable safe id.
- **A boot heal for icons.** Colours are already healed at boot by store.js:258-264.
- **Names, types, tags, notes and series ids already stored are never rewritten.** They are escaped at render instead.

**Review verdicts.** All 11 issues were checked against the code. Nine are accepted in full and two in part; none is rejected outright.

1. **[major] File ids are safe only on paper, because U6 keeps CSV ids (issues 1 and 7). ACCEPTED.**
   - Confirmed: BATCH_IMPORT_TRANSACTIONS (store.js:1971-1975) spreads `...t` after `id: generateId()`, so a payload id wins.
   - Confirmed: U6's sketch does `ADD_ACCOUNT {id: csvId || generateId()}` and then `find(a => a.id === id)`. With the ADD_ACCOUNT backstop, an unsafe cell such as 'acc 1' makes that re-read return undefined.
   - Confirmed: the guard only seeded the benign 'a1', which efcac0c ignores anyway (buildAccounts at import.js:1298 passes no id).
   - Folded in: a new `Store.fileId(v)` for every file id. It keeps a safe id, maps any other value to `'f-'` plus a 64-bit hash of the trimmed cell, and maps '' to null. Because the map is deterministic, an accounts-file id still meets its AccountId, a SeriesId its LinkedSeriesId, and a re-imported Id (U6's BUG-78 dedupe) its earlier copy. U6's id logic then works unchanged on safe ids.
   - Folded in: BATCH_IMPORT_TRANSACTIONS now puts `id: this.safeId(t.id) || generateId()` after the spread.
   - Folded in: the guard seeds payload ids in the accounts and categories `id` columns and in the transactions `Id`/`AccountId` columns. It asserts that every stored id is safe, and adds a restore-by-id case ('acc 1'). That case passes on U1 alone and fails on the merged tree if U6 reads ids raw: a merge gate.

2. **[major] `_parseTags` rewrites tags on restore (issues 3 and 6). ACCEPTED.**
   - My premise was false. 1.0/1.0.1 `_parseTags` (import.js:109-112) stored any characters, so backups carry tags like 'café' and 'road trip'. The tag field also splits on space (views.js:2103).
   - Every tag sink is escaped by the sweep, so stripping adds no security. D-U1-4 is now 'keep verbatim', and import.js:109-112 is no longer edited.

3. **[minor] An unsafe LinkedSeriesId leaves the loan untracked (issues 5 and 8). ACCEPTED, using the reviewer's preferred fix.**
   - `_relinkSeries` and buildLoans both use `Store.fileId`, not the payment-note fallback. That fallback fails whenever the user edited the note.
   - The new loanLinkFileId test fails 4/4 on the draft (loan untracked) and passes on the final design.

4. **[minor] Ambiguous ?v= note (issues 2 and 10). ACCEPTED.** The targets are now explicit (see dependencies).

5. **[minor] The blind e2e typed variant hits the free 2-account limit (issue 4). ACCEPTED, with one correction.** It now runs in its own fresh context before any import. The reviewer's `__STACKD_PRO_STUB__` does not activate Pro: `Pro.isActive` reads `state.pro`. The Pro '+ Add custom' variant therefore seeds `stackd_v1_pro` `{active:true}`, as pro_paywall.spec.js:233 does.

6. **[minor] Cross-tab sync skips the guards (issue 9). PARTLY ACCEPTED.**
   - Confirmed at store.js:473-474.
   - The four colour sinks are now escaped too (views.js:437, 442, 3878; components.js:3507).
   - The in-memory icon heal in the listener is NOT added. The path needs a pre-1.0.2 tab on the same origin (web build only), and that tab already renders the same payload raw with identical privileges, so the 1.0.2 tab adds no capability. The listener (473-491) is also U5's region. Accepted residual (D-U1-9).

7. **[minor] views.js:451 escaped t() output (issue 11). ACCEPTED.** Only the stored fallback is escaped now; a known type keeps its localized label unescaped.

**Verification.** I applied the final design to a scratch copy of src. The verified diff is scratchpad/u1/u1-bug24-final.diff; the draft diff stays at u1-bug24.diff for comparison.
- The full unit suite passes 1,104/1,104: 1,089 existing tests plus 15 new. versionSync and nativeWiring fail only because the scratch copy has no tools/ or android/.
- `eslint src --max-warnings 0` is clean.
- The jsdom sink crawl finds 0 raw sinks; the same crawl on efcac0c finds 7 leaking fields.

**CSP.** The hash-based CSP stays a separate rider, and I recommend deferring it.

**Follow-up, not proposed here.** CSV formula injection in exports.

### BUG-24 — Account names, category names, tags and colours run as script, including from an imported CSV _(gate, effort M)_

**Root cause.** Confirmed in source at efcac0c.

**1. Raw free-text sinks.** These reach innerHTML through the render loop (main.js:535), Modal.show and the sheet builders.
- views.js:84 and :97: option builders `>${cat.name}</option>` and `>${acc.name}</option>`. Used by Add/Edit Log and the Import map.
- views.js:451: `accountTypeLabel(acc.type)`. It returns an unknown stored type verbatim (store.js:28-31), and buildAccounts stores the CSV `type` cell.
- views.js:452: wallet name.
- views.js:1658 and :2076: tag chips (data-tag, `#tag`, the `form.removeTag` aria-label). views.js:2125: tag autocomplete.
- views.js:1700: hidden `tx-recurrence-series-id` value. Since 1.0.1 (BUG-02), `_relinkSeries` (import.js:318) keeps the CSV SeriesId verbatim.
- views.js:2500 and :2598: Categories list and detail header.
- views.js:2848, :2853, :2866, :2871 and :2982: Budget rows, their aria-labels built with I18n.t params, and the editor header.
- views.js:3876 and :3879: Manage accounts aria-label and name.
- views.js:4307: delete-account confirm.
- components.js:828 and :831: AccountCard (dead code).
- components.js:903, :909 and :913: TransactionItem category, account and tag pills.
- components.js:1377 and :1386: FilterModal chips. Its local esc at :1336 is only applied to tags.
- components.js:2149: ListPicker (dead code).
- components.js:2830-2831 and :2844: TagsModal (dead in the app).
- components.js:3358: CategorySelectionModal.
- components.js:3508 and :3526: graph filter panel.
- components.js:4838: Bank disconnect title (broker text).

**2. Enumerations rendered raw and never validated on write.**
- Colours land in style= at views.js:437, :442, :3878 and components.js:3507.
- Icons land in about 25 `data-lucide="${…icon}"` sites.
- The write paths store payloads verbatim: ADD_ACCOUNT (store.js:1135-1138), UPDATE_ACCOUNT (:1177, :1179), UPDATE_ACCOUNT_COLOR (:1216-1217), ADD_CATEGORY (:2125, :2127), UPDATE_CATEGORY (:2142).
- The importer passes CSV cells straight through: buildAccounts (import.js:1288-1291) and buildCategories (:1365, :1370).
- The boot migration (store.js:258-264) already replaces any non-palette colour, which is why the colour payload ran only until the next start. Icons have no such heal.

**3. Ids from a file.**
- Since 1.0.1, series ids (import.js:318) and LinkedSeriesId (:423) are kept verbatim.
- BATCH_IMPORT_TRANSACTIONS (store.js:1971-1975) lets a payload `t.id` override the generated id. Today that is harmless, because buildTransactions never sets t.id, but U6 plans to keep the CSV Id.
- Every `data-id="${x.id}"` sink (about 60) and `tx-edit-id value="${editId}"` (views.js:1609) relies on ids being safe.

**4. Escaping exists, but in 13 copies:** views.js:7/16 and :4342; components.js:495, :1336, :2445, :3264, :4577, :4588, :4637 and :4695; widgets.js:12; insights.js:236; bank-connect.js:1229. None is applied to these sinks.

**Crawl results.** The jsdom crawl reproduced every raw sink on these lines. Notes, loan and extra-cost names, rule text, statement and file text, and bank labels were already escaped. main.js has no stored-text sink.

**Fix.** **1. One escaper, with aliases.**
- Add `I18n.esc(value)` to src/i18n.js, inserted after line 104. It is null-safe and escapes `& < > " '`, so it is valid both as element content and inside quoted attributes.
- views.js `escapeAttr` (7-11) delegates to it; `esc` already calls escapeAttr.
- New METHOD `Components.esc`, inserted after components.js:36. It must never be a top-level const: that would collide with views.js's global `function esc` in the classic-script (defer) build.
- `Widgets._esc` (widgets.js:12-19) and `Insights._esc` (insights.js:236-240) delegate to it.
- The method-local copies stay as they are.
- Rule: escape t() PARAMS, never t() output.

**2. Sweep, one token per line, no reflow.**
- views.js:
  - 84 and 97;
  - 437 and 442: `escapeAttr(acc.color)`;
  - 451: escape only the stored fallback, `${!acc.type || window.Store.ACCOUNT_TYPES.includes(acc.type) ? window.Store.accountTypeLabel(acc.type) : esc(acc.type)}`;
  - 452, 1658, 1700, 2076, 2125, 2500, 2598, 2848, 2853, 2866, 2871 and 2982;
  - 3876, 3878 (colour) and 3879;
  - 4307.
- components.js:
  - 828 and 831;
  - 903, 909 and 913, with `const esc = window.Components.esc;` inserted after 843;
  - 1377 and 1386 (FilterModal's local esc);
  - 2149, 2830-2831 and 2844;
  - 3358;
  - 3507 (colour), 3508 and 3526;
  - 4838 (`BC.esc`).
- Use `esc()` for content, `escapeAttr()` for attributes, and `{ name: esc(x) }` for t() params.
- Dataset reads decode the entities, so tag filtering and removal are unchanged.

**3. Store validators**, inserted after store.js:61, before `state:` at 62.
- `normalizeAccountColor(v)`: palette plus the legacy map, case-insensitive; otherwise null.
- `isSafeIcon(v)`: no whitespace, quote, bracket, `&`, backslash, backtick or `=`; 1 to 40 characters.
- `safeId(v)`: `^[A-Za-z0-9_.:-]{1,64}$` after trim; otherwise null.
- `fileId(v)`: '' → null; a safe value is returned as is; anything else becomes `'f-'` plus 16 hex characters of a 64-bit hash of the trimmed cell.
- `_healMarkupFields()`.

They are applied as follows:
- ADD_ACCOUNT: unsafe id → generated; invalid colour → the next palette colour; unsafe icon → 'wallet'.
- UPDATE_ACCOUNT and UPDATE_ACCOUNT_COLOR: an invalid colour or icon is ignored.
- ADD_CATEGORY: unsafe id → generated; unsafe icon → 'pin'.
- UPDATE_CATEGORY: an unsafe icon is ignored.
- BATCH_IMPORT_TRANSACTIONS (1971-1975): `id: this.safeId(t.id) || generateId()` moves AFTER `...t`.
- The store stays ungated.

**4. Import.**
- `_relinkSeries` (318): `const fid = Store.fileId(csvId)`; keep fid unless `taken` has it, otherwise generate. Rows still group by the original cell.
- buildLoans (423): `linkedSeriesId = Store.fileId(cell) || ''`, the same map, so a restore stays linked in either file order.
- `_parseTags` is NOT changed: tags stay verbatim and are escaped at render.
- Contract for U6: read every id cell (accounts-file `id`, transactions `AccountId` and `Id`) through `Store.fileId`.

**5. Boot.** `_healMarkupFields()` is called once after the account-migration save (insert after store.js:294). It replaces unsafe account icons with 'wallet' and unsafe category icons with 'pin', and saves through StackdDB only when something changed.

**Sketch.**

```js
// src/i18n.js — after t() (line 104)
  // 1.0.2 (BUG-24): THE HTML escaper (aliases: views.js esc/escapeAttr, Components.esc,
  // Widgets._esc, Insights._esc). Escape t() PARAMS, never t() output.
  esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  },

// src/views.js:7-11
function escapeAttr(value) {
  return window.I18n.esc(value); // 1.0.2 (BUG-24): one implementation
}
// :84 / :97
`<option value="${cat.id}" ${cat.id === selectedId ? 'selected' : ''}>${esc(cat.name)}</option>`
// :437 / :442 / :3878 (defence in depth; the store validates)
style="--acc-color: ${escapeAttr(acc.color)};"   style="color: ${escapeAttr(acc.color)};"   background-color: ${escapeAttr(acc.color)};
// :451-452 (a known type is t() output and is never escaped; a stored fallback is)
<div class="wallet-card-type">${!acc.type || window.Store.ACCOUNT_TYPES.includes(acc.type) ? window.Store.accountTypeLabel(acc.type) : esc(acc.type)}</div>
<div class="wallet-card-name">${esc(acc.name)}</div>
// :1658 / 2076 / 2125
data-tag="${escapeAttr(t)}" … #${esc(t)} … window.I18n.t('form.removeTag', { tag: esc(t) })
// :1700
<input type="hidden" id="tx-recurrence-series-id" value="${escapeAttr(initialRecurrenceSeriesId)}">
// :2848 / 3876 / 4307 (params, not output)
window.I18n.t('budget.editForAria', { name: esc(cat.name) })

// src/components.js — after line 36 (a METHOD, never a top-level const)
  esc(value) { return window.I18n.esc(value); },
// TransactionItem.render, after 843:   const esc = window.Components.esc; // 1.0.2 (BUG-24)
// :903 esc(category.name)   :909 esc(accountData.name)   :913 #${esc(tag)}
// :3507 background: ${window.Components.esc(acc.color || '#64748B')}   :3508 / :3526 / :3358 window.Components.esc(x.name)
// :4838 { bank: BC.esc(conn.institutionName) }

// src/store.js — after line 61
  normalizeAccountColor(value) {
    const c = String(value == null ? '' : value).trim().toUpperCase();
    if (this.LEGACY_ACCOUNT_COLOR_MAP[c]) return this.LEGACY_ACCOUNT_COLOR_MAP[c];
    return this.ACCOUNT_COLORS.includes(c) ? c : null;
  },
  isSafeIcon(value) { return typeof value === 'string' && /^[^\s<>"'&\\`=]{1,40}$/.test(value); },
  safeId(value) { const s = String(value == null ? '' : value).trim(); return /^[A-Za-z0-9_.:-]{1,64}$/.test(s) ? s : null; },
  // An id cell read from a file: kept when safe, else mapped to a STABLE safe id, so
  // SeriesId<->LinkedSeriesId, AccountId<->accounts id and a re-imported Id still meet.
  fileId(value) {
    const s = String(value == null ? '' : value).trim();
    if (!s) return null;
    const safe = this.safeId(s);
    if (safe) return safe;
    let h1 = 0x811c9dc5, h2 = 0x9747b28c;
    for (let i = 0; i < s.length; i++) {
      const c = s.charCodeAt(i);
      h1 = Math.imul(h1 ^ c, 0x01000193);
      h2 = Math.imul(h2 ^ c, 0x5bd1e995);
    }
    return 'f-' + (h1 >>> 0).toString(16).padStart(8, '0') + (h2 >>> 0).toString(16).padStart(8, '0');
  },
  _healMarkupFields() {
    let accs = false, cats = false;
    this.state.accounts.forEach(a => { if (!this.isSafeIcon(a.icon)) { a.icon = 'wallet'; accs = true; } });
    this.state.categories.forEach(c => { if (!this.isSafeIcon(c.icon)) { c.icon = 'pin'; cats = true; } });
    if (accs) window.StackdDB.save('accounts', this.state.accounts);
    if (cats) window.StackdDB.save('categories', this.state.categories);
  },
// init, after line 294:   this._healMarkupFields(); // 1.0.2 (BUG-24)
// ADD_ACCOUNT 1135/1137/1138
          id: this.safeId(payload.id) || window.StackdDB.generateId(),
          color: this.normalizeAccountColor(payload.color) || this.ACCOUNT_COLORS[existingCount % this.ACCOUNT_COLORS.length],
          icon: this.isSafeIcon(payload.icon) ? payload.icon : 'wallet',
// UPDATE_ACCOUNT 1177/1179, UPDATE_ACCOUNT_COLOR 1216-1217: ignore an invalid icon/colour, store the normalized colour
// ADD_CATEGORY 2125/2127, UPDATE_CATEGORY 2142: same with 'pin'
// BATCH_IMPORT_TRANSACTIONS 1971-1975: the id goes AFTER the spread
        const newTxs = payload.transactions.map(t => ({
          time: t.time || importTime,
          ...t,
          id: this.safeId(t.id) || window.StackdDB.generateId(), // 1.0.2 (BUG-24)
          createdAt: t.createdAt || new Date().toISOString()
        }));

// src/import.js:318 (_relinkSeries)
        const fid = window.Store.fileId(csvId); // 1.0.2 (BUG-24)
        seriesMap[key] = (fid && !taken.has(fid)) ? fid : window.StackdDB.generateId();
// :423 (buildLoans)
      const linkedSeriesId = window.Store.fileId(row['linkedseriesid']) || ''; // 1.0.2 (BUG-24): same map as _relinkSeries
// _parseTags (109-112): unchanged

// U6 contract (lines U6 owns): const csvId = window.Store.fileId(row['id']) || '';  (and the same for row['accountid'])

// Full verified diff: scratchpad/u1/u1-bug24-final.diff
```

**Data repair.** Colours need no new heal. The existing boot migration (store.js:258-264) already resets any non-palette colour at every start.

Icons get a new idempotent boot heal, `_healMarkupFields()`:
- it runs once per boot, right after the account migration (after line 294) and outside the 455-461 heal block that U2, U3, U5 and U6 append to;
- it replaces account icons that fail isSafeIcon with 'wallet' and category icons with 'pin';
- it saves through StackdDB only when something changed, so the native mirror stays in step.

A value that fails the rule could never render as an icon (it showed a blank box at best). Lucide names and legacy emoji are untouched.

These stored values are deliberately NOT rewritten: names, account types, tags (including non-ASCII or multi-word tags from 1.0/1.0.1 imports), notes, and series ids or LinkedSeriesIds kept verbatim by 1.0.1. They are escaped at every sink, and stored unsafe series ids still match their loans because both sides are raw. A later export and restore maps both files through Store.fileId to the same safe id, so the link survives. No migration flag is needed.

**Tests (each fails on the current code).**

- tests/unit/markupSafety.test.js (new, 11 cases; verified draft at scratchpad/u1/repo2/tests/unit/markupSafety.test.js).
- It seeds the marker `k"'><x-xss data-k="k"></x-xss>` through the real write paths: dispatch, StackdImport.importCSV for the accounts, categories and transactions CSVs, and a poisoned pre-1.0.2 localStorage booted through Store.init.
- It spies on the innerHTML and outerHTML setters and on insertAdjacentHTML, and fails on any raw '<x-xss'.
- Stub Element.prototype.scrollTo.
- It fails 10/11 on efcac0c; case (j) passes there by design, because it is the U6 merge gate.
- (a) Typed and imported names, types, tags, notes and series ids render as text on Home, History, Add and Edit Log, Categories, Category detail, Edit category, Edit account, Budget list and editor, Analytics, Settings, Tags and Debt. The seed also puts payload ids in the accounts and categories `id` columns and in the transactions `Id`/`AccountId` columns. These are ignored at efcac0c, and the case turns red if U6 keeps them raw.
- (b) Sheets render the same text: Manage accounts, the delete-account confirm, FilterModal, CategorySelectionModal, the ExpandedGraphModal filter panel and TransactionItem.
- (c) Colours and icons are validated on write (typed, accounts CSV and categories CSV): every account colour is in ACCOUNT_COLORS, and no icon contains <>"'& or whitespace.
- (d) Boot heals icons stored by 1.0 and 1.0.1 ('wallet' / 'pin'), and nothing leaks.
- (e) Names, types, tags and series ids stored by 1.0 and 1.0.1 render as text AND are not rewritten.
- (f) A raw stored tag stays text in the Edit Log chips and in the autocomplete (type into #tx-tags-input, wait 350 ms).
- (g) `_parseTags('Café|road trip')` returns ['café','road trip'], i.e. verbatim. Two rows sharing SeriesId `s1"><x>` import as ONE series whose id equals `Store.fileId('s1"><x>')`.
- (h) After the seed plus a loans CSV whose LinkedSeriesId is a payload, every id in state is safe: account, category, transaction, seriesId, transferRef, loan id and linkedSeriesId. Every view renders without a leak.
- (i) Validators:
- I18n.esc(null) === '', and all 5 characters are escaped;
- normalizeAccountColor: '#e60023' → '#E60023', legacy '#FF9500' → '#EA580C', '#16A34A' → null, a payload → null;
- isSafeIcon accepts 'hand-coins' and two emoji, and rejects 'pin"', 'a b', '', 41 characters and null;
- safeId: 'cat_salary' passes, 'a"b' → null;
- fileId: '' → null; ' cat_salary ' → 'cat_salary'; 'rent 2026' → /^f-[0-9a-f]{16}$/, stable under trim, and different from 'rent 2027'.
- (j) Restore by id (U6 merge gate): an accounts CSV with id 'acc 1' (Conto), then a transactions CSV with AccountId 'acc 1', Account Conto and Id = payload. Assert:
- the import succeeds;
- there is one Conto;
- the row's accountId equals that account's id;
- both ids are safe;
- History and Edit Log do not leak.
- (k) Store backstops:
- ADD_ACCOUNT {id:'x"y'} gets a generated id, while 'keep-1' is kept;
- ADD_CATEGORY {id:'<c>'} gets a generated id;
- UPDATE_ACCOUNT {color:'red', icon:'x"'} and UPDATE_ACCOUNT_COLOR with a payload keep the old values;
- BATCH_IMPORT_TRANSACTIONS keeps 'tx-keep' and replaces 'x"><img>'.
- tests/unit/loanLinkFileId.test.js (new, 4 cases; verified draft at scratchpad/u1/repo2/tests/unit/loanLinkFileId.test.js).
- Setup: a loan tracked on series 'rent 2026', and on `s1"><x-xss>`, with a note that is NOT debt.paymentNote, so the note fallback cannot link it. Export it, boot an empty install, and import in both orders (accounts→transactions→loans and accounts→loans→transactions).
- Assert: the loan is tracked (more than 12 linked members), its linkedSeriesId is safe, and it equals the only series id.
- Results: fails 4/4 on efcac0c (unsafe id stored), fails 4/4 on the draft design (loan untracked), passes 4/4 on the final design.
- tests/e2e/markup_safety.spec.js (new, written blind, run at integration).
- **Variant 1, fresh context, free plan, BEFORE any import (typed):** Home → Add wallet, the payload as the name, 1,200.00, Save.
- **Variant 2, new fresh context (CSV):** import the report's accounts CSV and then its transactions CSV through #btn-import-csv / #import-csv-file. Visit Home, History, Edit Log, the category picker, Categories, Budget and Settings → Manage accounts, then reload.
- **Variant 3, Pro:** seed `stackd_v1_pro` {active:true} as pro_paywall.spec.js:233 does (the stub alone does not activate Pro), then use Add Log → '+ Add custom'.
- **Payload:** `onerror="window.__xss=(window.__xss||0)+1"`.
- **Assert:** window.__xss is undefined, the wallet card's textContent equals the literal name, and there is no img[src="x"].

**Risks.** **Double escaping.** I checked every sink's caller: all pass raw values. Contract for the other units: pass raw text to NoticeSheet, TransactionItem and the option builders. U6's ambiguous-accounts line must pass raw names, because NoticeSheet escapes them.

**Global-scope collision.** components.js, widgets.js and main.js must never declare a top-level `esc`/`escapeAttr`. In the defer build, views.js's global `function esc` would then throw a redeclaration SyntaxError, and unit tests cannot see it.

**Merge with U6.**
- U6 must read the accounts-file `id`, the transactions `AccountId` and the transactions `Id` through `Store.fileId`. If it reads them raw, the ADD_ACCOUNT backstop replaces an unsafe id, U6's re-read by id finds nothing, and the import fails part-way. markupSafety (h) and (j) turn red, so the integrator must run them on the merged tree.
- U6 rewrites BATCH_IMPORT_TRANSACTIONS 1969-1982, so U1's two-line change there is an expected one-line textual conflict. U6's block must keep `id: this.safeId(t.id) || generateId()` after `...t` and run its duplicate check on that id; case (k) enforces this.

**fileId.**
- Hash collisions (64-bit) are negligible.
- A crafted cell equal to another cell's 'f-…' value would merge two series. Only a hand-built file can do that, and the result is harmless.
- A stored raw unsafe series id from 1.0.1 does not match the mapped id of the same file re-imported on the same device. Such a re-import gets its own series copy, which is the BUG-02 collision behaviour.

**Colour behaviour change.** A non-palette colour in a foreign CSV now falls back immediately instead of at the next start. Lowercase palette hex is now kept.

**Cross-tab residual.** On the web build only, a pre-1.0.2 tab on the same origin can write a raw icon that an open 1.0.2 tab renders until its next boot. That old tab already runs the payload with the same privileges, and colours are escaped at their sinks anyway. Accepted (D-U1-9).

**Icons.** Unknown but safe names are still kept and render blank, as today.

**Lines shared with other units.**
- views.js:4307 sits inside U5's 4244-4320 region; U5 and U9 edit 4298 and 4316, which are not adjacent.
- views.js 437, 442 and 451-452 sit between U8's 411-413 and 466-506 and are not adjacent.
- store.js 1135-1138 vs U2's 1155; 1177/1179 vs U2's 1189.
- components.js 3507-3508/3526 vs U8's 3449-3480.

**Residual surface.**
- Modal.show `title` is still raw HTML by contract.
- BATCH_IMPORT_BANK_TRANSACTIONS needs no backstop: bank rows never carry an id (import.js:768, :1042).
- Bank Connect text comes from the broker, and the feature is off at build time.

### Rider (defence in depth, not a report bug): hash-based Content-Security-Policy for the built app _(rider, not recommended, effort M)_

**Root cause.** index.html and the built dist/index.html carry no CSP (checked). Any raw sink that a future change reintroduces is therefore fully exploitable: inline handlers run, and fetch/img can send stored data to any origin.

The app itself is CSP-ready:
- there are no inline event-handler attributes in src;
- fonts and libraries are local;
- the only network origins are the brokers.

**Fix.** After `vite build`, build.cjs post-processes dist/index.html:
1. Compute sha256/base64 of every inline `<script>` body: the pre-paint boot script and the singlefile bundle.
2. Inject a meta CSP right after the charset meta:
   - `default-src 'self'`
   - `script-src 'self' 'sha256-…'` (no 'unsafe-inline')
   - `style-src 'self' 'unsafe-inline'`
   - `img-src 'self' data: blob: https:`
   - `font-src 'self' data:`
   - `connect-src 'self' https://api.stackdplatform.com https://api-staging.stackdplatform.com`
   - `object-src 'none'; base-uri 'none'; form-action 'none'`

Keep the injection in a testable `tools/csp.cjs`. index.html, the dev server and the defer/module toggle are untouched.

Gate it on two checks: a Playwright project that serves dist with no `securitypolicyviolation` event, and an Android emulator boot.

**Sketch.**

```js
// build.cjs, after a successful vite build
const { injectCsp } = require('./tools/csp.cjs');
const distHtml = path.join(__dirname, 'dist', 'index.html');
fs.writeFileSync(distHtml, injectCsp(fs.readFileSync(distHtml, 'utf8')));

// tools/csp.cjs
const crypto = require('crypto');
function injectCsp(html) {
  const hashes = [];
  html.replace(/<script(?![^>]*src=)[^>]*>([^]*?)<\/script>/g, (m, body) => {
    hashes.push(`'sha256-${crypto.createHash('sha256').update(body, 'utf8').digest('base64')}'`); return m; });
  const csp = ["default-src 'self'", `script-src 'self' ${hashes.join(' ')}`, "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:", "font-src 'self' data:",
    "connect-src 'self' https://api.stackdplatform.com https://api-staging.stackdplatform.com",
    "object-src 'none'", "base-uri 'none'", "form-action 'none'"].join('; ');
  return html.replace(/<meta charset[^>]*>/i, (m) => `${m}<meta http-equiv="Content-Security-Policy" content="${csp}">`);
}
module.exports = { injectCsp };
```

**Data repair.** None.

**Tests (each fails on the current code).**

- tests/unit/cspBuild.test.js (new). injectCsp hashes every inline script and none with a src; script-src has no 'unsafe-inline'; the meta comes before the first script. It fails today because tools/csp.cjs does not exist.
- tests/e2e/csp_dist.spec.js (new, separate Playwright project on `vite preview` of dist). Boot, then walk Home → History → Add → Settings → Debt with no securitypolicyviolation event. Then confirm that an `<img src=x onerror>` injected via page.evaluate does not run its handler.

**Risks.** **A wrong hash or a missing origin white-screens the native app.** The existing e2e suite runs on the dev server, which has no CSP, so it cannot catch this.

**A meta CSP cannot set frame-ancestors or reporting.**

**The web build** uses the same dist, so connect-src must keep the broker origins.

This is why it is not recommended inside a 1.0.2 patch: escaping plus validation already closes BUG-24, and the guard test pins it.

### U1 decisions

- **D-U1-1** Where does the one HTML-escaping function live?
  - One implementation, I18n.esc in src/i18n.js. views.js escapeAttr/esc, a new Components.esc method, Widgets._esc and Insights._esc become one-line aliases, and the method-local copies stay as they are.
  - No shared function: add a Components.esc copy and keep each file's own implementation (7+ identical copies remain).
  - Put it on the store as Store.esc.
  - _Recommended:_ One implementation, I18n.esc in src/i18n.js, with each renderer keeping its short alias. — i18n.js is the only module loaded before every renderer, both in index.html and in every unit-test chain.
- accountColorSelection, negativeOpeningBalance and openingBalanceDecimalShift load only i18n.js, en.js and views.js, so Store.esc would crash them.
- A property cannot collide in the shared classic-script global scope.

Verified: the full suite passes with the aliases delegating.
- **D-U1-2** Which account colours are accepted on write (form, accounts CSV, Bank Connect)?
  - Palette only: ACCOUNT_COLORS plus the legacy map, case-insensitive. Anything else falls back to the next palette colour on add and is ignored on update.
  - Any hex matching #RGB to #RRGGBBAA (the report's suggestion). The boot migration would then have to be loosened too, or a custom hex survives the import and silently changes at the next start.
  - Skip the whole CSV row when its colour is invalid.
  - _Recommended:_ Palette only, with a silent fallback to the next palette colour. — The form can only produce palette swatches, and the existing boot migration (store.js:258-264) already resets every other colour at the next start. Validating on write with the same rule makes behaviour consistent instead of 'works until restart'. The four colour sinks are also escaped as defence in depth.
- **D-U1-3** How are icons (account and category) made safe?
  - Validate on every write (no whitespace, quote, bracket, &, backslash, backtick or '='; at most 40 characters) and heal stored unsafe icons at boot to 'wallet'/'pin'. The ~25 data-lucide sites stay unedited.
  - Escape every icon sink instead (~25 more line edits, several inside other units' regions).
  - Both validate and escape.
  - _Recommended:_ Validate on every write and heal stored unsafe icons at boot, leaving the data-lucide sites unedited. — Icons are an enumeration: an unsafe value can never be a real icon, so replacing it loses nothing. One store-level rule covers every path. It also keeps the sweep out of lines other units are editing. The only gap is the cross-tab residual in D-U1-9.
- **D-U1-4** What happens to tags in an imported transactions CSV (including a restore of the user's own backup)?
  - Apply the tag field's rule: lowercase, keep only a-z, 0-9, '-' and '_'. 'café' becomes 'caf' and 'road trip' becomes 'roadtrip', so tags stored by 1.0/1.0.1 imports change on every restore.
  - Remove only the HTML-special characters < > " ' & and keep accents and spaces.
  - Keep tags verbatim (trim and lowercase, exactly as 1.0.1 does) and rely on escaping at every tag sink; _parseTags is not changed.
  - Apply a Unicode-letter rule (keep letters and digits in every language, '-' and '_') and accept that tags with spaces or punctuation change on restore.
  - _Recommended:_ Keep tags verbatim (trim and lowercase, as 1.0.1 does) and escape them at every sink; _parseTags is not changed. — The draft's premise was false. 1.0/1.0.1 `_parseTags` (import.js:109-112) stored any characters, so devices and their own backups already hold tags such as 'café' or 'viaggio roma', and the field's rule would rewrite them on restore. It would not even match typing either, because the field splits on space (views.js:2103). Every tag sink is escaped by this design (views.js 1658/2076/2125, components.js 913/1395/2830-2831/2844, TagsView 3256), so stripping adds no security. This is the same rule as names (D-U1-5).
- **D-U1-5** Names and account types containing markup characters (for example 'R&D <3', or Bob's "Big" fund): reject, strip or keep?
  - Store them verbatim and escape at every sink; they display exactly as typed.
  - Also strip '<' and '>' from imported names.
  - Reject such names in the form and the importer with an inline error.
  - _Recommended:_ Store them verbatim and escape them at every sink. — Escaping is complete and pinned by the guard test. Stripping alters user data and breaks CSV round-trips. Rejecting needs new copy (keys × 5) for a non-problem.
- **D-U1-6** How are ids that come from a file made safe? This covers series ids and LinkedSeriesId now, and the accounts-file id, transactions AccountId and transactions Id once U6 keeps them.
  - Read every id cell through Store.fileId, which keeps a safe id and maps any other value to a stable safe id ('f-' plus a 64-bit hash), so related files still meet. ADD_ACCOUNT, ADD_CATEGORY and BATCH_IMPORT_TRANSACTIONS replace any unsafe id they still receive with a generated one.
  - Replace an unsafe id with a random generated one at the import boundary (safeId or generate), and rely on the payment-note fallback (needsNoteRelink) for loans whose LinkedSeriesId is unsafe.
  - Escape every data-id and value sink instead (~60 sites).
  - _Recommended:_ Read every id cell through Store.fileId, with ADD_ACCOUNT, ADD_CATEGORY and BATCH_IMPORT_TRANSACTIONS as store backstops that replace any unsafe id with a generated one. — A random replacement breaks every cross-file reference. The loans file's LinkedSeriesId no longer finds its series (the loan comes back untracked, BUG-02 again; the new test fails 4/4 on the draft). U6's AccountId no longer finds the accounts-file account. A re-imported Id no longer dedupes. The note fallback fails whenever the user edited the note.

A deterministic map keeps every link, in either file order. It leaves every safe id, including all generated ids and 'cat_x' ids, unchanged. It gives U6 one call to make per id cell.
- **D-U1-7** Add a hash-based Content-Security-Policy to the built app now?
  - Defer it to its own change right after 1.0.2, gated by a dist-served Playwright smoke and an Android emulator / TestFlight boot.
  - Ship it in 1.0.2 with the same gates.
  - No CSP.
  - _Recommended:_ Defer it to its own change right after 1.0.2, gated by a dist-served Playwright smoke and a device boot. — Escaping plus validation fully closes BUG-24, and the guard test prevents regressions. A wrong hash or a missing origin white-screens the native app. The current e2e suite runs on the dev server without a CSP, so it would not catch that.
- **D-U1-8** Dead components that still have raw sinks (TagsModal, used only by tests; ListPicker; AccountCard): escape, delete or leave?
  - Escape their 5 lines in this sweep.
  - Delete them, together with TagsModal's tests in tagInputFormatting.test.js, as a separate cleanup.
  - Leave them raw.
  - _Recommended:_ Escape their 5 lines in this sweep; deletion can follow as a separate cleanup. — It costs five one-token edits and keeps 'every sink escapes' literally true, so a future caller cannot revive a hole.
- **D-U1-9** Cross-tab sync (web build): the storage listener (store.js:473-474) reloads accounts and categories without the colour migration or the icon heal. What do we do?
  - Escape the four account-colour style sinks (views.js 437, 442, 3878; components.js 3507), and accept that an unsafe icon written by a pre-1.0.2 tab renders raw in an open 1.0.2 tab until its next boot.
  - Also run an in-memory colour and icon heal in the storage listener, without saving to avoid storage-event ping-pong, coordinated with U5, which owns 473-491.
  - Do nothing on this path.
  - _Recommended:_ Escape the four colour sinks and accept the icon residual on the cross-tab path. — The path needs a tab still running 1.0/1.0.1 on the same origin (web build only; native has a single WebView). That old tab already renders the same payload raw with identical privileges, so the 1.0.2 tab adds no capability. The colour escapes cost four tokens next to U1's own hunks. A listener heal would edit U5's region for no real gain.

### U1 regions owned

| File | Symbol | Lines | Change |
|---|---|---|---|
| src/i18n.js | I18n.esc (new method) | insert after 104 (end of t(), before `};` at 105) | BUG-24: the one HTML escaper, null-safe, escaping & < > " '. |
| src/views.js | escapeAttr | 7-11 (body 8-10) | Delegate to window.I18n.esc. `esc` (16-18) is unchanged. |
| src/views.js | createCategoryOptions / createAccountOptions | 84, 97 | esc(cat.name) and esc(acc.name) in the option text. |
| src/views.js | DashboardView.render — wallet card | 437, 442, 451-452 | escapeAttr(acc.color) at 437 and 442. At 451, a known or empty type renders accountTypeLabel unescaped (it is t() output), and only a stored fallback is esc()'d. esc(acc.name) at 452. The icon at 443 is validated in the store. |
| src/views.js | AddTransactionView.render — initial tag chips; hidden series-id input | 1658, 1700 | data-tag=escapeAttr(t), #esc(t), form.removeTag {tag: esc(t)}; value=escapeAttr(initialRecurrenceSeriesId). |
| src/views.js | AddTransactionView.attachEvents — renderTags, tag autocomplete | 2076, 2125 | data-tag=escapeAttr(t) and #esc(t). |
| src/views.js | CategoriesView.render; CategoryDetailView.render header | 2500; 2598 | esc(cat.name); esc(category.name). |
| src/views.js | BudgetView.render — list rows and editor header | 2848, 2853, 2866, 2871, 2982 | budget.editForAria/setForAria {name: esc(cat.name)}; esc(cat.name) in the titles and the editor h2. |
| src/views.js | OthersView.attachEvents — Manage accounts sheet | 3876, 3878, 3879 | others.editAccountAria {name: esc(acc.name)}; background-color escapeAttr(acc.color); <strong>${esc(acc.name)}</strong>. |
| src/views.js | EditAccountView.attachEvents — delete confirm | 4307 | account.deleteConfirm {name: esc(account.name)}. This is one line inside U5's 4244-4320 region; U5 and U9 edit 4298 and 4316, which are not adjacent. |
| src/components.js | Components.esc (new top-level method) | insert after 36 (between fitNumericFontSize and BottomNav at 37) | Alias of I18n.esc. It must be a method, never a top-level const. |
| src/components.js | AccountCard.render (dead) | 828, 831 | account.viewAria {name: esc}, esc(account.name). |
| src/components.js | TransactionItem.render | insert after 843; 903, 909, 913 | `const esc = window.Components.esc;`, then esc(category.name), esc(accountData.name), #esc(tag). |
| src/components.js | FilterModal.show — account and category chips | 1377, 1386 | Use the existing local esc (1336) for acc.name and cat.name. |
| src/components.js | ListPicker.show (dead); TagsModal (dead in the app) | 2149; 2830-2831, 2844 | Components.esc(item.name); Components.esc(tag) in data-tag and the chip text. |
| src/components.js | CategorySelectionModal.show | 3358 | Components.esc(cat.name). |
| src/components.js | ExpandedGraphModal renderModalContent — filter panel | 3507, 3508, 3526 | Components.esc(acc.color \|\| '#64748B'), Components.esc(acc.name), Components.esc(cat.name). U8's 3449-3480/3669-3722/3756 are not touched. |
| src/components.js | BankManageModal — disconnect confirm title | 4838 | bank.disconnectTitle {bank: BC.esc(conn.institutionName)}. |
| src/widgets.js | Widgets._esc | 12-19 | Body delegates to window.I18n.esc. |
| src/insights.js | Insights._esc | 236-240 | Body delegates to window.I18n.esc. |
| src/store.js | new normalizeAccountColor / isSafeIcon / safeId / fileId / _healMarkupFields | insert after 61 (between LEGACY_ACCOUNT_COLOR_MAP and `state:` at 62) | BUG-24 validators, the stable file-id map, and the icon boot heal. U6 consumes fileId. |
| src/store.js | Store.init — heal call | insert after 294 (after the account-migration save) | this._healMarkupFields(). It sits outside the 455-461 heal block that U2, U3, U5 and U6 union. |
| src/store.js | dispatch ADD_ACCOUNT | 1135, 1137-1138 | safeId(payload.id) \|\| generateId(); normalizeAccountColor(...) \|\| palette fallback; isSafeIcon ? icon : 'wallet'. |
| src/store.js | dispatch UPDATE_ACCOUNT; UPDATE_ACCOUNT_COLOR | 1177, 1179; 1216-1217 | Ignore an unsafe icon or a non-palette colour, and store the normalized colour. |
| src/store.js | dispatch BATCH_IMPORT_TRANSACTIONS | 1971-1975 (remove 1972, add after 1974) | `id: this.safeId(t.id) \|\| generateId()` moves AFTER `...t`. U6 rewrites 1969-1982: this is an expected one-line conflict, and U6's block must keep the line (enforced by markupSafety (k)). |
| src/store.js | dispatch ADD_CATEGORY; UPDATE_CATEGORY | 2125, 2127; 2142 | safeId(payload.id) \|\| generateId(); unsafe icon → 'pin' on add, ignored on update. |
| src/import.js | _relinkSeries | 318 | fid = Store.fileId(csvId); keep fid unless already taken, otherwise generate (rows still group by the cell). |
| src/import.js | buildLoans — linkedSeriesId | 423 | Store.fileId(cell) \|\| '', the same map as _relinkSeries. U6's 354-405 and its insert after 469 are untouched. _parseTags (109-112) is NOT edited. |
| index.html | script ?v= cache-busting | 129, 138, 139, 140, 141, 142, 145 | One commit: i18n.js ?v=2 → ?v=3; store.js, components.js, widgets.js, views.js and import.js ?v=73 → ?v=74; insights.js ?v=6 → ?v=7. If another unit already bumps the same file in the merged release, one bump per file is enough. |
| tests/unit/markupSafety.test.js (new); tests/unit/loanLinkFileId.test.js (new); tests/e2e/markup_safety.spec.js (new) | guard test, file-id link test and the blind e2e | new files | BUG-24 regression guard (11 cases, including the U6 merge gate), the loan-link test for unsafe series ids (4 cases), and the e2e with a window.__xss counter. |
| tests/unit/fullRestore.test.js | buildLedger fixture | 79-80 | Optional: change the colours '#123456'/'#abcdef' to palette swatches so the colour round-trip assertion stays meaningful. The test passes either way. |

**Dependencies.** **U6 (import and restore) depends on U1's `Store.fileId`, `Store.safeId` and the BATCH_IMPORT_TRANSACTIONS backstop. This hard merge gate must also be written into U6's own design.**
- U6 reads every id cell through `window.Store.fileId(...) || ''`: the accounts-file `id` in buildAccounts, plus the transactions `AccountId` and `Id` in buildTransactions and the resolver's fileIds sets.
- With fileId, the id U6 passes to ADD_ACCOUNT is already safe, so its claim and its re-read by id work unchanged. A raw unsafe cell would be replaced by the ADD_ACCOUNT backstop, and the re-read would fail.
- Because the map is deterministic, cross-file references and U6's BUG-78 dedupe by Id still work.
- U6's rewrite of BATCH_IMPORT_TRANSACTIONS (store.js 1969-1982) keeps `id: this.safeId(t.id) || generateId()` AFTER `...t` and runs its duplicate check on that id. U1's two-line version lands first; the textual conflict is expected and one line.
- **Merge order:** U1's store.js validators land before (or together with) U6.
- **Integration gate:** run tests/unit/markupSafety.test.js, cases (h), (j) and (k), and loanLinkFileId.test.js on the fully merged tree.

**Notes for the other units.**
- **U6:** its ambiguous-accounts line passes raw names to NoticeSheet, which escapes them.
- **U2's opening-balance panel:** already uses esc(acc.name).
- **New markup in U2, U3, U5 and U8:** any new markup containing stored text uses the aliases. Extending the guard to render U2's opening-balance panel is a one-line addition.
- **U5:** owns the storage listener (473-491). No U1 change is requested there (D-U1-9).

**Region safety.** No U1 hunk is adjacent to another unit's hunk, except the planned BATCH_IMPORT_TRANSACTIONS line. U1 adds no i18n keys.

**For the integrator.**
- Bump ?v= in one commit: i18n.js 2 → 3, insights.js 6 → 7, and store.js, components.js, widgets.js, views.js and import.js 73 → 74. i18n.js is now a hard dependency of every renderer; import.js depends on Store.fileId.
- bank-connect.js is unchanged.
- Implement with line-preserving edits only.

**CLAUDE.md (Working conventions or i18n).** Add:
- Every stored or imported text placed in markup goes through I18n.esc (aliases: views.js esc/escapeAttr, Components.esc, Widgets._esc, Insights._esc). Escape t() params, never t() output.
- Account colours (palette) and icons (isSafeIcon) are validated on write; icons are also healed at boot.
- Every id read from a file goes through Store.fileId; ADD_ACCOUNT, ADD_CATEGORY and BATCH_IMPORT_TRANSACTIONS never keep an unsafe id.
- Never add a top-level esc/escapeAttr binding to any other src file.
- tests/unit/markupSafety.test.js fails on any raw sink.

**Verified artifacts (scratch only; the repo is untouched):**
- final diff: C:/Users/ecalvaresi/AppData/Local/Temp/claude/C--Users-ecalvaresi-Desktop-Projects-Stackd/cb10937b-fdd5-4705-b015-cb79e9cbf9c3/scratchpad/u1/u1-bug24-final.diff
- tests: .../scratchpad/u1/repo2/tests/unit/markupSafety.test.js and loanLinkFileId.test.js
- crawl harness: .../scratchpad/u1/harness.cjs

The CSP rider is independent of every other unit (build.cjs and tools/ only).

**Existing tests affected.** **Verified on a scratch copy of src with the final design applied:**
- The unit suite passes 1,104/1,104: the 1,089 existing tests plus 15 new. The only failing files are versionSync and nativeWiring, which fail only because the scratch copy has no tools/ or android/.
- `eslint src --max-warnings 0` is clean.
- The jsdom crawl of every view plus two levels of taps finds 0 raw sinks; on efcac0c, 7 seeded fields leak.

**New tests:**
- markupSafety.test.js: 11 cases. 10 fail on efcac0c; case (j), the restore-by-id merge gate for U6, passes there by design.
- loanLinkFileId.test.js: 4 cases. They fail on efcac0c (the unsafe id is stored), fail on the draft design (the loan comes back untracked), and pass on the final design.

**Existing tests that do not break:**
- tagInputFormatting.test.js: TagsModal chips keep `dataset.tag`, because entities decode.
- widgetsI18nGuard, homeWidgets and homeWidgetsGoals: their '<img…>' name tests still pass.
- loanRestoreLink and loanRestoreOwnership: they use generated (safe) series ids, so fileId returns them unchanged.
- No source-text test asserts an edited line, and no test replaces window.I18n wholesale.

**Optional fixture update:** fullRestore.test.js:79-80 (non-palette colours).

**E2E:** tests/e2e/markup_safety.spec.js is written blind and run at integration, because port 3000 is shared. The typed variant runs in its own fresh context before any import; the Pro variant seeds stackd_v1_pro active.

**If the CSP rider is approved later:** tests/unit/cspBuild.test.js plus a dist-served Playwright project.

## U2 — Transaction form

This is the final U2 design after the adversarial review. All four gate bugs are still confirmed at efcac0c. The fixes stay in the transaction form, the Edit Account form, the budget editor and a few store lines. One cross-unit item (part E, about 6 lines) goes into U6's buildAccounts.

**Review outcome.** I checked all 17 review entries against the code. They come down to 10 separate issues, and all 10 are valid and folded in. Several were raised twice.
1. **EditAccountView test stubs (major).** accountColorSelection, negativeOpeningBalance and openingBalanceDecimalShift render EditAccountView against a hand-built `window.Store` that has no date helper. Every test in those files would throw.
   - Fix: add `_todayYMD` to the three mock Stores. They are now listed as edited.
   - Rejected alternative: guarding the call in the view. That would be a test-only fallback.
2. **The heal moves balances when an account has undated rows (major).** A row with date '' counts today. It drops out once the account has an opening date, because `'' < obDate` (store.js:2853).
   - Fix: the heal now skips any account with an undated or earlier row.
   - The neutrality claim is reworded: no balance moves. Home's month change for an account opened this month goes back to its value from before the bug (store.js:3091-3099).
3. **A backup restore recreates the trap (major).**
   - export.js:43-44 writes 0 and an empty opening_date for an account that has no opening balance.
   - import.js:1281-1282 then dates a €0 opening balance at created_at, which hides all earlier rows.
   - New part E: a v1.19+ row with an empty opening_date and a 0 balance is restored with no opening balance. buildAccounts belongs to U6, so this is a named cross-unit item for U6.
4. **Expense candidates (minor).** cat_balance has typeHint 'both', so the user can switch the row to Expense, which stores an expense of 450. An expense of 450 counts exactly like an opening balance of −450, so the heal now accepts expense rows.
5. **Accounts that also got a later €0 opening balance (minor).** D-U2-2 now offers a narrow undo as an option. It is still not recommended, because it moves balances at boot. The accepted limit and the manual fix are recorded.
6. **Cleared Edit Account date (minor).** Today the save sends openingDate '' and UPDATE_ACCOUNT falls back to createdAt (store.js:1189). Now an empty date means the prefilled date (D-U2-8).
7. **The store guard kept accountId (minor).** accountId is now stripped too.
8. **Negative budget limit (minor).** It is now refused inline (D-U2-9).
9. **The 50/30/20 'Planned income' field (minor).** widgets.js:1311/1332 has the same parsing bug. It is added to the not-recommended rider.
10. **Edit prefill rationale and test (minor).** Under Italian, an unrounded 1.23456 reads as NaN and is blocked. 1.234 reads as 1234, which is the 1000× case. The test now seeds 1.234.

**Corrections I found while verifying** (the reviewers did not raise these):
- **Helper name.** U4 ships `Store._localYMD(value)` and keeps `Store._todayYMD()` (store.js:4270). There is no `localDateKey`.
  - U2 now uses `_todayYMD()` for every "today" default (views.js:1504 and 3964, store.js:1155), so those sites need nothing from U4.
  - U4's `_localYMD(createdAt)` is used only at store.js:1189 and in part E.
- **Heal insertion point.** `_healConvertedOpeningBalances` moves from "before 741" to after line 685, because U3 inserts its own helpers at 740.
- **D-U2-6 (lint) is withdrawn.** U4's reviewed D-U4-7 already covers the same rule.
- **Hunk boundaries are now explicit** for U3 (views.js 2235-2261), U5 (4244-4320), U8 (1519-1520) and U9 (the panel's ✕ and data-router-leave).

**The fixes**
- **BUG-25**, in five parts:
  - (A) a read-only panel for opening_balance rows;
  - (B) a store guard that pins type, account, category and sign;
  - (C) Edit Account defaults an account with no opening balance to its earliest row, and an untouched or date-cleared save creates no opening balance;
  - (D) an optional boot heal that never moves a balance;
  - (E) the restore fix, applied by U6.
- **BUG-38:** use the local `_todayYMD()`, and `_localYMD(createdAt)` for the createdAt fallback. The recurrence end becomes the noon-anchored `_calculateNextRecurrenceDate(date, 5, 'years')`.
- **BUG-39:** a new log starts on the Default Wallet if it still exists, otherwise on the first account by name.
- **BUG-50:**
  - #tx-amount and #bdg-amount become `inputmode="decimal"` text inputs read by a new `Store.parseAmount`.
  - The edit prefill is rounded to cents.
  - Ambiguous, more-than-2-decimal or negative budget values get an inline error.
- **Recommended rider:** the date is required in the transaction form.

**New i18n keys** (×5 each):
- `form.openingBalanceInfo`
- `form.amountInvalid {example}`
- `form.dateRequired`
- the `account.setDefaultHint` value changes if D-U2-5 is approved.

**Effort:** about 1.75 dev-days for U2, plus about an hour in U6 for part E.

### BUG-25 — Saving an opening balance from History without edits turns it into positive income _(gate, effort M)_

**Root cause.** Confirmed at efcac0c.

**Stage 1: the transaction form.**
- AddTransactionView.render has no opening-balance mode. Line 1522 sets `initialAmount = Math.abs(txToEdit.amount)`, so −450 shows as 450.
- Line 1554 maps `opening_balance` to 'income', and attachEvents repeats that at 1752.
- An untouched save dispatches UPDATE_TRANSACTION with `type: 'income'` and the unsigned amount (views.js:2372-2388).
- The store applies `Math.abs` to every amount (store.js:1342-1346). It then spreads `updatePayload` over the row (copy at 1368, spread at 1416-1421).
- The row becomes `{type: 'income', amount: 450}`, and the account is left with no opening_balance row.

**Stage 2: Edit Account.**
- EditAccountView.render falls back to amount 0 and the UTC today when there is no opening balance (views.js:3962-3964).
- The save always sends `openingDate` (views.js:4262-4271).
- UPDATE_ACCOUNT pushes a new opening_balance whenever `openingDate !== undefined` (store.js:1184-1206).
- getAccountOpeningDate and `_isTxBeforeOpeningDate` then exclude every earlier row (store.js:2829-2854), so the balance drops to €0.00.

**The same trap without stage 1.** I found these by reading the code; they are not reproduced in the UI. Any account created without an opening-balance row reaches stage 2 directly:
- Bank Connect 'new' accounts: `ADD_ACCOUNT {openingBalance: 0}` with no date (views.js:6880);
- accounts auto-created by the transaction CSV import (import.js:218);
- accounts whose opening balance was swipe-deleted in History.

**Backup restore** (reviewer finding, verified):
- `exportAccounts` writes opening_balance 0 and an EMPTY opening_date for such an account (export.js:41-44).
- `buildAccounts` then falls back to created_at (import.js:1281-1282).
- It dispatches ADD_ACCOUNT or UPDATE_ACCOUNT with `openingDate` (import.js:1295/1298), which creates a €0 opening balance on the creation day (store.js:1148, 1184-1206).
- Bank Connect history always predates createdAt, so a restore onto a new phone hides it. The file order does not matter.

The form is reached from three places: History tap (views.js:1420), History swipe-edit (1214) and category detail (2615). All three go to `#edit?id=`, which renders AddTransactionView.

**Fix.** Five parts. A, B, C and E are required. D depends on D-U2-2.

**A. View (views.js).**
- In AddTransactionView.render, right after `const isEdit = !!txToEdit;` (line 1499), return a read-only panel when `txToEdit.type === 'opening_balance'`.
- The panel shows the signed amount (`formatCurrency`), the account name and the date. It adds one line saying that opening balances are changed in the account.
- It has an `<a id="btn-ob-edit-account" href="#edit-account?id=…">` button labelled with `account.editTitle`, and the usual ✕ link to `#transactions`.
- The panel has no inputs:
  - attachEvents already bails at line 1720 when `#tx-type` is absent;
  - Router `_isFormDirty` stays false, so Back is plain.
- One guard covers all three entry points. Lines 1554 and 1752 become unreachable and are left as they are.
- If U9 (BUG-87) adds `data-router-leave` to the form's ✕ (line 1598), the integrator adds it to the panel's ✕ as well.

**B. Store (store.js UPDATE_TRANSACTION, 1340-1347).**
- When `existingTx.type === 'opening_balance'`, copy the payload and drop these keys: `type`, `accountId`, `categoryId`, `recurrence`, `transferRef`, `convertFromTransfer`, `updateFuture`, `updateAll` and `regenerateSeries`.
- Keep the stored sign: `absoluteAmount = -absoluteAmount` when `existingTx.amount < 0`.
- An opening balance belongs to its account. Only UPDATE_ACCOUNT may change its sign, and nothing may move it to another account, into a series or into a transfer. This holds for any caller. Pinning accountId stops a second opening balance from appearing on the target account and the first account from being left with none.

**C. Edit Account (views.js).**
- *Render (3964):* an existing account with no opening-balance row defaults its date to its earliest DATED row, never later than today (`Store._todayYMD()`). A new account defaults to the local today.
- *Save:* the change sits inside `if (account) {` (4261-4271) only, so U5's duplicate-name check (inserted after 4259) and line 4250 stay untouched:
  - `obDate = dDate || dateEl.defaultValue`: an empty date (the Android picker's Clear button) means the prefilled date (D-U2-8);
  - `openingBalance`/`openingDate` are sent only when `obTouched = !!currentOb || absOb !== 0 || obDate !== dateEl.defaultValue`;
  - an untouched save, such as a rename or a colour change, therefore changes no transaction.
- *New accounts are unchanged.* An empty date there is dated today (local) by ADD_ACCOUNT, after BUG-38.
- *UPDATE_ACCOUNT itself is unchanged,* so the CSV and statement imports keep their explicit semantics. The store stays ungated.

**D. Boot heal (store.js), decision D-U2-2.** Add `_healConvertedOpeningBalances()`. See dataRepair for the criteria.

**E. Backup restore (import.js buildAccounts 1281-1282). A cross-unit item: U6 applies it inside its buildAccounts hunk.**
- When the row comes from a v1.19+ file (the opening_date column is present), its cell is empty and the opening balance is 0, send no `openingDate`. The store then creates no opening-balance row, which mirrors the source.
- The created_at fallback is kept only for pre-v1.19 files with no column, and for a hand-edited non-zero balance with no date. It now uses the LOCAL day: `Store._localYMD(createdAt)` for an ISO timestamp (BUG-38 class).
- A restore onto an existing account that has its own opening balance no longer overwrites it with €0 dated createdAt.

Together, C and E close the trap on every UI path and on the restore path. A is the only UI writer that could convert a row, and B makes the invariant hold for any caller.

**Sketch.**

```js
// views.js: AddTransactionView, new first method (insert after line 1478 `AddTransactionView: {`)
    // 1.0.2 (BUG-25): an opening balance is owned by its account (UPDATE_ACCOUNT).
    // The form has no opening-balance mode: it showed a -€450 card opening as
    // "Income 450" and an untouched Update stored income +450.
    _renderOpeningBalancePanel(tx, state) {
      const acc = state.accounts.find(a => a.id === tx.accountId);
      const amount = window.Store.formatCurrency(tx.amount, acc && acc.currency); // signed
      let dateLabel = '';
      try { dateLabel = new Intl.DateTimeFormat(window.Store.getLocale(), { dateStyle: 'long' }).format(new Date(tx.date + 'T12:00:00')); } catch (e) { /* no date */ }
      return `
        <div class="container" id="ob-panel" style="padding-bottom: 100px;">
          <div /* same header row as the form (1595-1599) */>
            <h1 class="header-title" style="margin:0;">${esc(window.I18n.t('account.openingBalance'))}</h1>
            <a href="#transactions" aria-label="${escapeAttr(window.I18n.t('common.close'))}" /* same style as the form's close link */>✕</a>
          </div>
          <div class="card" style="text-align:center; margin-bottom:var(--space-6);">
            <div class="${tx.amount < 0 ? 'text-expense' : 'text-balance'}" /* display font, 4xl, 800 */>${esc(amount)}</div>
            <p class="text-secondary">${acc ? esc(acc.name) + ' · ' : ''}${esc(dateLabel)}</p>
            <p /* text-sm, secondary */>${esc(window.I18n.t('form.openingBalanceInfo'))}</p>
          </div>
          ${acc ? `<a id="btn-ob-edit-account" class="btn btn-primary" href="#edit-account?id=${encodeURIComponent(acc.id)}">${esc(window.I18n.t('account.editTitle'))}</a>` : ''}
        </div>`;
    },

// views.js render: insert after line 1499 (1495-1497 belong to BUG-87 and stay untouched)
      if (txToEdit && txToEdit.type === 'opening_balance') {
        return window.Views.AddTransactionView._renderOpeningBalancePanel(txToEdit, state); // 1.0.2 (BUG-25)
      }

// store.js UPDATE_TRANSACTION: replaces 1342-1346
        // 1.0.2 (BUG-25): an opening balance belongs to its account. Only
        // UPDATE_ACCOUNT changes its sign; nothing moves it to another account,
        // a series or a transfer, whatever the caller sends.
        const isOpening = existingTx.type === 'opening_balance';
        if (isOpening) {
          payload = { ...payload };
          ['type', 'accountId', 'categoryId', 'recurrence', 'transferRef', 'convertFromTransfer',
           'updateFuture', 'updateAll', 'regenerateSeries'].forEach(k => { delete payload[k]; });
        }
        // Amounts in the DB are stored as absolute numbers, except an opening
        // balance, which keeps its stored sign.
        let absoluteAmount = payload.amount;
        if (absoluteAmount !== undefined) {
          absoluteAmount = Math.abs(absoluteAmount);
          if (isOpening && existingTx.amount < 0) absoluteAmount = -absoluteAmount;
        }

// views.js EditAccountView.render: replaces 3964 (shared with BUG-38)
      // 1.0.2 (BUG-25/BUG-38): an account WITHOUT an opening-balance row (Bank
      // Connect / CSV-created, or its row was deleted) must not default to
      // today: entering an amount would date it after the account's history and
      // hide every row. Earliest DATED row, never after today; new = local today.
      const todayKey = window.Store._todayYMD();
      const firstRowDate = account
        ? state.transactions.reduce((m, t) => (t.accountId === account.id && t.date && t.date < m ? t.date : m), todayKey)
        : todayKey;
      const currentObDate = currentOb ? currentOb.date : firstRowDate;

// views.js EditAccountView save: inside `if (account) {` (4261-4271). Lines 4247-4260 (U5) stay untouched.
          if (account) {
            // 1.0.2 (BUG-25): an untouched save (rename, colour) creates no opening
            // balance on an account that has none. An empty date (the Android
            // picker's Clear) means the prefilled one (D-U2-8).
            const dateEl = document.getElementById('edit-acc-date');
            const obDate = dDate || dateEl.defaultValue;
            const obTouched = !!currentOb || absOb !== 0 || obDate !== dateEl.defaultValue;
            window.Store.dispatch('UPDATE_ACCOUNT', {
              id: account.id,
              name,
              ...(obTouched ? { openingBalance: ob, openingDate: obDate } : {}),
              icon: selectedIcon,
              color: selectedColor,
              type: type,
              currency: document.getElementById('edit-acc-currency').value // v1.02
            });

// store.js: new method inserted after line 685, before the BUG-14 comment at 686
// (U3 inserts at 740 and U5 at 710; this keeps the inserts apart)
  // 1.0.2 (BUG-25): before 1.0.2, an untouched save of an opening balance from
  // History stored it as income (+|amount|, cat_balance, comment 'Opening
  // Balance', the literal ADD_/UPDATE_ACCOUNT store, never translated). A user
  // who then tapped Expense stored an expense. Restore the type ONLY where no
  // balance moves: the account has no opening_balance row, exactly one such
  // candidate, and no other row dated before it or undated ('' sorts first and
  // would drop out). An income keeps its amount; an expense becomes negative.
  // Both count as before. The sign lost by the income conversion is not guessed:
  // Edit Account shows the amount with its Positive/Negative toggle.
  _healConvertedOpeningBalances() {
    const txs = this.state.transactions;
    const hasOb = new Set();
    const cands = Object.create(null);
    txs.forEach(t => {
      if (!t.accountId) return;
      if (t.type === 'opening_balance') hasOb.add(t.accountId);
      else if ((t.type === 'income' || t.type === 'expense') && t.categoryId === 'cat_balance'
        && t.comment === 'Opening Balance' && !t.transferRef && !t.recurrence && t.isPaid !== false) {
        (cands[t.accountId] = cands[t.accountId] || []).push(t);
      }
    });
    let now = null;
    Object.keys(cands).forEach(id => {
      const c = cands[id];
      if (hasOb.has(id) || c.length !== 1 || !c[0].date) return;
      const row = c[0];
      if (txs.some(t => t.accountId === id && t !== row && (!t.date || t.date < row.date))) return;
      if (row.type === 'expense') row.amount = -Math.abs(row.amount);
      row.type = 'opening_balance';
      row.updatedAt = now || (now = new Date().toISOString());
    });
    if (now) {
      this._openingIdx = null;
      this._budgetSpendIdx = null;
      window.StackdDB.save('transactions', txs);
    }
  },
// init: after line 460 (_healRecurrenceGenerators), before _processRecurringTransactions:
//   this._healConvertedOpeningBalances(); // 1.0.2 (BUG-25)
// (U3/U5/U6 add boot heals at 455-461 too; the integrator unions them)

// PART E, applied by U6 inside its buildAccounts hunk: import.js, replaces 1281-1282
      // 1.0.2 (BUG-25): an account exported WITHOUT an opening balance (Bank
      // Connect, CSV-created, or its row was deleted) has opening_balance 0 and an
      // EMPTY opening_date (export.js:43-44). Dating a €0 opening balance at
      // created_at put it after the account's history and hid every earlier row.
      // Only a pre-v1.19 file (no opening_date column) or a hand-edited non-zero
      // amount still falls back to created_at, now as its LOCAL day (BUG-38).
      const hasDateCol = Object.prototype.hasOwnProperty.call(row, 'openingdate');
      const created = String(row['createdat'] || '').trim();
      const createdDay = created.includes('T') ? window.Store._localYMD(created) : created;
      const openingDate = this._normalizeDate(row['openingdate'])
        || ((!hasDateCol || openingBalance !== 0) ? this._normalizeDate(createdDay) : null);
// lines 1284-1285 unchanged: `if (openingDate) fields.openingDate = openingDate;`
// With openingBalance 0 and no openingDate, ADD_ACCOUNT and UPDATE_ACCOUNT create
// nothing (store.js:1148, 1184).
```

**Data repair.** Part D runs only if D-U2-2 option 1 or 3 is approved; option 1 is recommended.

`_healConvertedOpeningBalances()` runs at boot after `_healRecurrenceGenerators()` and before `_processRecurringTransactions()`. It saves only when it healed something, and it nulls `_openingIdx` and `_budgetSpendIdx`.

**Criteria (all required).** The account has no opening_balance row, and it has exactly one candidate row, counting income and expense candidates together. A candidate:
- has type 'income' or 'expense', `categoryId 'cat_balance'` and `comment === 'Opening Balance'`, the literal that ADD_ACCOUNT/UPDATE_ACCOUNT store and that is never translated;
- has no transferRef and no recurrence;
- does not have `isPaid === false`;
- has a non-empty date.

In addition, no other row of the account is undated or dated before the candidate.

**Action.** Set the type to opening_balance. An income keeps its amount. An expense becomes `-Math.abs(amount)`. Date and time are unchanged.

**Why no balance moves.**
- `_isPositiveTx` adds an income and an opening balance alike (store.js:2826). An expense of X subtracts exactly what an opening balance of −X adds.
- The new opening date equals the earliest row, and no undated row exists, so `_isTxBeforeOpeningDate` excludes nothing new.
- Analytics and budgets exclude cat_balance in every form (store.js:1001, 3483).
- One figure does change: Home's month change for an account whose candidate is dated in the current month. computeBalanceForecast (store.js:3091-3099) again uses the opening-balance amount as that account's baseline, which is its value from before the bug.

**What the heal does not do.**
- It does not restore the minus sign lost by the income conversion; that sign is unrecoverable. Edit Account shows the amount with its Positive/Negative toggle, so one tap fixes it.
- It does not repair accounts that ALSO received a €0 opening balance from a later Edit Account save, unless D-U2-2 option 3 is chosen. They are skipped because they already have an opening_balance row.
  - Accepted limit, for the plan's follow-ups.
  - Manual fix (corrected at integration, U2 review round 1): open Edit Account for the account, enter the original opening amount, choose Positive or Negative, set the Opening Balance Date to the ORIGINAL opening day (the form may prefill a different date) and save. Then, in History, open the Adjustment row noted "Opening Balance" on that day and delete it. Edit Account must come first: until the opening date is restored, History hides every row dated before the €0 opening balance, including the row to delete, and the €0 row itself opens the read-only panel, which has no Delete button.

**False positives.** An income or expense row that the user hand-labelled Adjustment with the exact note 'Opening Balance', on an account without an opening balance. The heal is balance-neutral even then.

**Part E (restore)** changes only future restores. Accounts already restored with a €0 opening balance dated createdAt cannot be told apart from a deliberate €0 opening date, so they are not repaired. Manual fix: set the Opening Balance Date back in Edit Account.

**Tests (each fails on the current code).**

- tests/unit/openingBalanceForm.test.js (new). formValidation-style boot with the real store, en/EUR, Date pinned at 2026-10-01 12:00 local. Test 'an opening balance opens a read-only panel, not the form':
- Setup: Visa Card opened at −450 on 2026-09-01. Render AddTransactionView with params {id: <its opening_balance row>}.
- Expect: no #btn-save-tx and no #tx-amount; #btn-ob-edit-account href === '#edit-account?id=<visaId>'; the panel text contains '-€450.00'.
- Fails today: the form renders with Income 450.
- openingBalanceForm.test.js: 'UPDATE_TRANSACTION cannot turn an opening balance into income, move it or make it a series'.
- Setup: Main Checking (opening balance 2500) and Visa Card (opening balance −450, plus an expense of 62.50). Dispatch {id: visaOb.id, type: 'income', amount: 450, accountId: mainId, categoryId: 'cat_groceries', recurrence: {interval: 1, frequency: 'months'}, updateAll: true}.
- Expect on the row: type 'opening_balance', amount −450, accountId still Visa, categoryId 'cat_balance', no recurrence.
- Expect overall: the transaction count is unchanged; Main has exactly one opening_balance row; getAccountBalance(visa) stays −512.50 and Main stays 2500.
- Fails today: income +450 and a balance of 387.50.
- openingBalanceForm.test.js: 'Edit Account on an account without an opening balance defaults to its earliest row, and an untouched rename creates none'.
- Setup: ADD_ACCOUNT {name: 'Bank Sync', openingBalance: 0} with no date, so there is no opening-balance row. Add an expense of 20 on 2026-09-12 and an income of 100 on 2026-09-20.
- Render EditAccountView: #edit-acc-date === '2026-09-12'.
- Rename to 'Revolut' and Save: still no opening_balance row for the account, and the balance is 80.
- Fails today: the date shows the UTC today, the save creates an opening balance on 2026-10-01 and the balance becomes 0.
- openingBalanceForm.test.js: 'typing an opening balance on such an account dates it at the earliest row'.
- Same setup. Type '10000' into #edit-acc-balance (the cents mask gives 100.00) and Save.
- Expect an opening_balance of 100 dated 2026-09-12 and a balance of 180.
- Fails today: it is dated today and the balance is 100.
- openingBalanceForm.test.js: 'a cleared Opening Balance Date means the prefilled date' (D-U2-8). Same setup.
- (a) Set #edit-acc-date to '' and Save: no opening_balance row is created and the balance is 80.
- (b) Re-render, set the date to '', type '10000' and Save: the opening balance is dated 2026-09-12.
- Fails today: (a) creates a €0 opening balance dated the createdAt day and the balance becomes 0.
- openingBalanceForm.test.js: 'boot heal restores converted opening balances only where no balance moves'. Seed stackd_v1_accounts/transactions in localStorage, record getAccountBalance per account before the heal from a parallel boot without it (or compute by hand), then run Store.init().
- Visa: income 450, cat_balance, 'Opening Balance', 2026-09-01, plus an expense of 62.50 on 2026-09-12. Expect it healed to type opening_balance with amount 450; the balance stays 387.50.
- Card: expense 450, cat_balance, 'Opening Balance', 2026-09-01. Expect an opening balance of −450; the balance stays −450.
- Cash: has an opening_balance row plus a look-alike row. Untouched.
- Loan: the candidate has an earlier row on 2026-08-20. Untouched.
- Undated: a candidate plus an expense with date ''. Untouched; the balance is unchanged.
- Twin: one income and one expense candidate. Both untouched.
- Note: the comment is 'Opening balance adj'. Untouched.

It is one test, so it fails today: Visa and Card are not healed.
- Part E, written by U6 in tests/unit/restoreAccounts.test.js (or by U2 as tests/unit/restoreNoOpeningBalance.test.js if U6 prefers): 'an account exported without an opening balance restores without one'.
- Setup: ADD_ACCOUNT {name: 'Bank Sync', openingBalance: 0}. Force its createdAt to '2026-09-20T10:00:00.000Z'. Add an expense of 20 on 2026-09-12 and an income of 100 on 2026-09-15.
- Export accounts and transactions, with Export._download stubbed to capture the text. Run RESET_APP, then import the transactions file and then the accounts file. Repeat in the reverse order.
- Expect in both orders: no opening_balance row for Bank Sync, and a balance of 80.
- Fails today: a €0 opening balance dated 2026-09-20 and a balance of 0.
- (optional e2e) tests/e2e/opening_balance_panel.spec.js, with page.clock pinned. Tap the Adjustment row in History: the panel shows. 'Edit Account' lands on #edit-account?id=… with the stored sign selected.

**New i18n keys (×5).** `form.openingBalanceInfo (new, ×5): en 'An opening balance belongs to its account. To change its amount or date, edit the account.' / fr 'Un solde initial appartient à son compte. Pour modifier son montant ou sa date, modifiez le compte.' / it 'Il saldo iniziale appartiene al suo conto. Per cambiarne importo o data, modifica il conto.' / es 'El saldo inicial pertenece a su cuenta. Para cambiar su importe o su fecha, edita la cuenta.' / pt 'O saldo inicial pertence à sua conta. Para alterar o valor ou a data, edite a conta.'`, `reuses account.openingBalance, account.editTitle and common.close, unchanged`, `D-U2-8 option 2 only, if chosen instead of the recommendation: reuses the rider's form.dateRequired under #edit-acc-date`

**Risks.** **Behaviour changes**
- An opening balance can no longer be deleted from the form, because the panel has no Delete button. The History swipe-delete stays. After a swipe-delete, part C keeps the next Edit Account save from hiding the history.
- Accounts without an opening-balance row no longer get one implicitly from an Edit Account save or a restore.
- The CSV transaction import (import.js:207) and the statement import (views.js:6195) still send explicit values to UPDATE_ACCOUNT and are unaffected.
- A restore onto an existing account that has its own opening balance keeps that balance when the file's row has none; before, it was overwritten with €0 dated createdAt.

**Accepted limits (for the plan's follow-ups)**
- Accounts hit by both stages are not auto-repaired unless D-U2-2 option 3 is chosen; the manual fix is in dataRepair.
- The History swipe ✓ can still mark an opening balance unpaid, which excludes it.
- Bulk-delete can still remove opening balances.
- Rows already stored with date '' stay hidden by any opening balance. This predates 1.0.2, and the rider stops new ones.

**Merge boundaries**
- *U9 (BUG-87):* owns views.js 1495-1497 and 1598. The panel guard is inserted after line 1499. The panel's ✕ follows whatever BUG-87 does to the form's ✕ (integrator).
- *U5:* declares views.js 4244-4320 and inserts its duplicate-name check after 4259. U2 edits only inside `if (account) {` from 4262 and leaves 4247-4261 as they are.
- *U8:* edits views.js 1519-1520. U2 edits 1522; line 1521 is the unchanged boundary.
- *U3:* edits UPDATE_TRANSACTION at 1383-1411 and 1468-1494. U2 touches only 1340-1347. U3's helper insert at store.js:740 is why the heal now goes after 685.
- *U7:* renames `dispatch(` to `_reduce(` and leaves the body untouched. U2's head reassigns the `payload` parameter, whose name does not change.
- *Boot heal calls:* U3, U5 and U6 also add calls at store.js 455-461. The integrator unions them, and U2's call stays after `_healRecurrenceGenerators()`.
- *U6:* part E lives in U6's buildAccounts hunk. If it is dropped, a restore still recreates the trap for every Bank Connect, CSV-created or swipe-deleted account.

### BUG-38 — New Log and New Account prefill the UTC date instead of the local date _(gate, effort S)_

**Root cause.** Confirmed at efcac0c.

`toISOString()` formats in UTC. In UTC+1/+2 it gives yesterday until 01:00/02:00, and in UTC−4 it gives tomorrow from 20:00. Every aggregate, by contrast, compares against a local today: getAccountBalance (store.js:2947-2951), `_isTxBeforeOpeningDate` (2849-2854) and `_getSystemTimeString`.

**Affected sites**
- views.js:1504, AddTransactionView: `let initialDate = new Date().toISOString().split('T')[0];`
- views.js:3964, the EditAccountView `currentObDate` fallback.
- store.js:1155, ADD_ACCOUNT: `newAccount.createdAt.split('T')[0]`, which is the UTC day of 'now'. It is reached when an import, the statement flow or the account form passes a non-zero amount or an empty date without an opening date.
- store.js:1189: the same createdAt fallback in UPDATE_ACCOUNT.
- The recurrence end default, at views.js:1883-1889 (recurrence toggle) and 2247-2251 (save). It builds `new Date('YYYY-MM-DD')` (UTC midnight), then `setFullYear(+5)` (local), then `toISOString()`. Besides inheriting the wrong day, it loses a day at DST edges: 2026-10-26 gives 2031-10-25 in Europe/Rome.

**Empty date.** Line 2248 also throws RangeError on an empty date (`new Date('')`), so a recurring save with no date silently does nothing. See the date-required rider.

**Fix.** Use the local-date helpers U4 sanctions, and the existing noon-anchored date math. Do not add a formatter of U2's own.

**Today defaults: `Store._todayYMD()`.** It is already on main at store.js:4270, so these sites have no dependency on U4.
- views.js:1504: `window.Store._todayYMD()`.
- views.js:3964: the new-account default is `_todayYMD()`. It is folded into the BUG-25 part C sketch: an existing account with no opening balance uses its earliest row, never after today.
- store.js:1155: `payload.openingDate || this._todayYMD()`. createdAt was set to 'now' a few lines earlier, so this is its local day.

**Timestamp to local day: U4's `Store._localYMD(value)`.**
- store.js:1189 falls back to `createdAt ? this._localYMD(createdAt) : this._todayYMD()`. This is the guard U4's review asked for, so a missing createdAt never gives 1970 or ''.
- Part E of BUG-25 (import.js, applied by U6) uses `_localYMD` the same way for created_at.

**Recurrence end: the existing v0.67 helper, which supports 'years'.**
- views.js:1883-1889: `endDateInput.value = window.Store._calculateNextRecurrenceDate(dateInput.value, 5, 'years') || ''`.
- views.js:2247-2251: `endDate: eDate || window.Store._calculateNextRecurrenceDate(date, 5, 'years')`.

The createdAt fields stay ISO timestamps; only the date keys change.

**Lint guard.** The draft's D-U2-6 is withdrawn. The rule is decided once under U4's D-U4-7, whose reviewed version is an AST selector limited to `toISOString()` results.

**Sketch.**

```js
// views.js:1504
      let initialDate = window.Store._todayYMD(); // 1.0.2 (BUG-38): the LOCAL day that balances and History use

// views.js:1883-1889 (updateRecurrentText)
          if (!endDateInput.value) {
            const dateInput = document.getElementById('tx-date');
            if (dateInput && dateInput.value) {
              // 1.0.2 (BUG-38): noon-anchored local math. new Date('YYYY-MM-DD') +
              // toISOString() lost a day at DST edges (2026-10-26 -> 2031-10-25).
              endDateInput.value = window.Store._calculateNextRecurrenceDate(dateInput.value, 5, 'years') || '';
            }
          }

// views.js:2247-2251 (save; U3 inserts after 2254, so 2252-2254 stay untouched)
            endDate: eDate || window.Store._calculateNextRecurrenceDate(date, 5, 'years'), // 1.0.2 (BUG-38)

// store.js:1155 (ADD_ACCOUNT)
            date: payload.openingDate || this._todayYMD(), // 1.0.2 (BUG-38): createdAt is now; use its LOCAL day

// store.js:1189 (UPDATE_ACCOUNT)
            const createdAt = this.state.accounts[accountIndex].createdAt;
            const newDate = payload.openingDate || (existingObIdx !== -1
              ? this.state.transactions[existingObIdx].date
              : (createdAt ? this._localYMD(createdAt) : this._todayYMD())); // 1.0.2 (BUG-38): local day (U4 helper)

// views.js:3964: see the BUG-25 sketch (todayKey = window.Store._todayYMD())
```

**Data repair.** None.
- A row saved on the UTC day cannot be told apart from one the user dated on purpose.
- An opening balance dated 'tomorrow' in a UTC− zone, and the rows that now sit before it, cannot be told apart from a deliberate opening date either.

A boot heal would have unbounded false positives. Affected users fix the date in Edit Account, which still shows the stored opening-balance date after BUG-25 part C.

**Tests (each fails on the current code).**

- tests/unit/localDateDefaults.test.js (new). Setup for every test:
- set process.env.TZ per test, as tests/unit/periodLabelYear.test.js:21-27 does, and restore it afterwards;
- use vi.useFakeTimers({toFake: ['Date']}) and call setSystemTime AFTER setting TZ;
- boot as formValidation does (db, i18n, en, loan-engine, store, components, views);
- in the U2 worktree, cherry-pick U4's `_localYMD` commit first.
- 'Rome 1 Nov 00:30: New Log prefills the local day'. TZ=Europe/Rome, new Date(2026, 10, 1, 0, 30). Render AddTransactionView: #tx-date === '2026-11-01'. Fails today with '2026-10-31'.
- 'Martinique 3 Oct 21:00: new account and the store fallbacks use the local day'. TZ=America/Martinique, new Date(2026, 9, 3, 21, 0).
- EditAccountView (new account): #edit-acc-date === '2026-10-03'.
- ADD_ACCOUNT {name: 'Main Bank', openingBalance: 1000} with no openingDate creates an opening balance dated '2026-10-03', and getAccountBalance is 1000.
- ADD_ACCOUNT {name: 'B', openingBalance: 0}, then UPDATE_ACCOUNT {id, openingBalance: 50} with no date, gives an opening balance dated '2026-10-03' (createdAt is 2026-10-04T01:00Z).
- Fails today: '2026-10-04' and a balance of 0.
- 'the recurrence end default is start + 5 years, local'. TZ=Europe/Rome, any pinned time.
- Render New Log, set #tx-date to '2026-10-26', check #tx-is-recurrent and dispatch change: #tx-recurrence-end-date === '2031-10-26'.
- Clear the end field, pick Groceries, enter amount 10 and Save: the stored recurrence.endDate is '2031-10-26'.
- Fails today with '2031-10-25'.

**Risks.** **Helper dependency on U4: store.js:1189 only.** U4 commits `_localYMD` first as a pure addition after store.js:859, and U2 cherry-picks that commit into its worktree. The hunks are identical, so they merge cleanly. Every other BUG-38 site uses `_todayYMD()`, which is already on main.

**Merge boundaries**
- ADD_ACCOUNT (store.js:1132-1171) is also edited by BUG-24 (colour validation) and BUG-34 (save order). U2 changes only line 1155.
- views.js 2235-2261 belongs to U3, which inserts after 2254. U2's 2247-2251 edit leaves 2252-2254 untouched.

**Other UTC date keys** stay with their owners or with D-U4-7:
- store.js:3418, 3438 and 3450 (BUG-28, U4);
- components.js CustomRangeModal (BUG-67, U4);
- the dead RecurringSettingsModal;
- the export filename (export.js:318);
- the deliberate bank-connect `_isoDay`.

**Feb 29 edge.** `_calculateNextRecurrenceDate('2028-02-29', 5, 'years')` gives 2033-03-01, the same rollover as the old code.

**Empty date.** Without the rider, an empty date with Recurrent on would now save a series with no date instead of throwing. See the date-required rider.

### BUG-39 — New Log ignores the Default Wallet and preselects the alphabetically first account _(gate, effort S)_

**Root cause.** Confirmed at efcac0c.
- AddTransactionView.render starts with `let initialAccount = '';` (views.js:1510). It is filled only from an edited row (1528) or from a draft (1575). Nothing reads `state.defaultAccountId` for a plain new log.
- `createAccountOptions` (views.js:93-99) sorts with `Store.compareAlpha` and marks `selected` only on the option equal to `initialAccount`. With '' nothing matches, so the browser shows the first account by name.
- The amount prefix (views.js:1614) calls `getAccountCurrency('')`, which returns the base currency. If the first account is in USD, the form shows '€' and books −$30.00, which then drops out of every euro total.
- The change listener (1846-1852) fixes the prefix only after the user changes the select.
- syncTransferTo (1827-1844) derives To from the shown From, so Transfer From is also the first account by name.
- The loan prefill (views.js:4456, `account: state.defaultAccountId || ''`) passes a stale id when the default account was deleted. No option matches, so the prefix again falls back to the base currency.

**Fix.** Add one guard in AddTransactionView.render, after the pending-category block (insert after line 1590). It applies to a NEW log whose `initialAccount` is not an existing account id: none was set, a draft carries no account, or a stale loan prefill or draft carries a deleted id. In that case use:
- `state.defaultAccountId`, when that account still exists;
- otherwise the first account by `Store.compareAlpha`, which is the order the select shows.

The guard runs after the draft is applied, so the add-category round trip keeps the user's choice. Edit mode is untouched, so an edited row keeps its own account.

The currency prefix (1614), the initial `selected` option, the Transfer From and syncTransferTo's To (the first other account) all follow `initialAccount`. This one change therefore fixes all three symptoms.

The loan prefill at 4456 needs no edit, because the guard repairs a stale id; that line belongs to the loans region. The guard also agrees with U5's BUG-29 reassignment of `defaultAccountId`, and does not depend on it.

The Default Wallet hint text is optional (D-U2-5).

**Sketch.**

```js
// views.js AddTransactionView.render, insert after line 1590
      // 1.0.2 (BUG-39): a NEW log starts on the Default Wallet; if none is set or
      // it was deleted, on the first account by name (createAccountOptions' order).
      // Placed after the draft so the add-category round trip keeps the user's
      // pick. It also repairs a draft or loan prefill carrying a deleted id.
      // The currency prefix (1614) and the transfer From follow initialAccount.
      if (!isEdit && !state.accounts.some(a => a.id === initialAccount)) {
        const def = state.accounts.find(a => a.id === state.defaultAccountId);
        const first = [...state.accounts].sort((a, b) => window.Store.compareAlpha(a, b))[0];
        initialAccount = (def || first).id; // accounts is non-empty here (1480 returns otherwise)
      }
```

**Data repair.** None. Rows booked to the wrong wallet cannot be identified. Balances are not otherwise affected.

**Tests (each fails on the current code).**

- tests/unit/defaultWalletPreselect.test.js (new; formValidation-style boot, EUR, Date pinned). 'a new log preselects the Default Wallet'.
- Setup: accounts Revolut (created first, so it becomes the default) and Cash.
- Render AddTransactionView: #tx-account.value === the Revolut id.
- Set amount 18.20 and Groceries, then Save: the expense's accountId is Revolut, and Cash's balance is unchanged.
- Fails today: Cash.
- 'the prefix follows the preselected account, including the fallback'.
- Setup: Main (EUR, default) and Amex ({currency: 'USD'}).
- First render: #tx-account is Main and #currency-symbol is '€'.
- Then SET_DEFAULT_ACCOUNT to 'gone', a deleted id: #tx-account is Amex (first by name) and #currency-symbol is '$'.
- Fails today: the symbol is '€'.
- 'Transfer From is the default; To differs'.
- Setup: the default is Savings Pot, plus Main Checking.
- Render, then click #toggle-transfer: #tx-account is Savings Pot, and #tx-transfer-to is not empty and differs from it.
- Fails today: From is Main Checking.
- 'a stale draft account falls back; a valid draft and an edited row keep theirs'.
- window._draftTxFormState = {account: 'gone', amount: '436.48', type: 'expense'} renders with #tx-account = the default.
- A draft with account Cash keeps Cash.
- Editing a row on Cash (params {id}) keeps Cash.

It is one test, so it fails today on the stale-draft assertion.
- (optional e2e) tests/e2e/default_wallet.spec.js. Seed two accounts, with the default second by name, and open #add. Expect #tx-account toHaveValue(defaultAccountId) and #currency-symbol to match that account's currency.

**New i18n keys (×5).** `account.setDefaultHint (value change only, ×5, if D-U2-5 is approved): en 'Shown first on the Dashboard and preselected for new logs.' / fr 'Affiché en premier sur le tableau de bord et présélectionné pour les nouvelles opérations.' / it 'Mostrato per primo nella dashboard e preselezionato per i nuovi movimenti.' / es 'Aparece primero en el panel y se preselecciona en los nuevos movimientos.' / pt 'Aparece primeiro no painel e é pré-selecionado nos novos movimentos.' The lines are en.js:555 and fr/it/es/pt.js:548.`

**Risks.** **Intended change.** Users who relied on the first-by-name account now land on their default. I found no existing unit test or e2e spec that saves a new log without choosing the account while having two or more accounts and a default that is not first by name. Re-check after integration.

**Interactions with other units**
- U8 (BUG-35) adds a received-amount field that compares the From and To currencies. Its initial check must run after `syncTransferTo(true)` (views.js:1845) so that it sees the preselected default. U8 inserts at 1632-1633, which does not overlap.
- BUG-24 escapes `createAccountOptions`. U2 does not touch views.js:93-99.

### BUG-50 — Amounts typed with a thousands separator are saved about 1,000 times too small _(gate, effort M)_

**Root cause.** Confirmed at efcac0c.
- #tx-amount is `<input type="number" step="0.01">` (views.js:1616). Chromium's number sanitising keeps only one separator, so '1,234.56' and '1.234,56' both become the value 1.23456.
- The save handler reads `parseFloat(amountInput.value)` (views.js:2211). It rejects only NaN and values ≤ 0 (2214), ignores `validity.stepMismatch` and `badInput`, and never rounds to cents. ADD_TRANSACTION stores 1.23456.
- '12,500' becomes 12.5 and '2.500' becomes 2.5.
- The budget editor repeats the pattern. #bdg-amount is `type="number"` (views.js:2993) and is read with `parseFloat` (3079) with no validation. SAVE_BUDGET (store.js:2222-2232) stores what it receives, so an empty field saves NaN and a negative value saves a negative limit.
- The edit prefill writes the raw stored float (views.js:1522), so legacy values with more than two decimals are shown as they are.

**Fix.** Stop trusting browser number parsing for money.

**1. Inputs.**
- #tx-amount (1616) and #bdg-amount (2993) become `type="text" inputmode="decimal" autocomplete="off"`, with `step` removed. The mobile keyboard stays numeric, and the raw text reaches the parser.
- The value is escaped with `escapeAttr`, because a restored draft is raw user text.

**2. `Store.parseAmount(raw)`,** a new method inserted after formatCurrency (after store.js:2794). It returns null for empty input, NaN when the text cannot be read without guessing, and otherwise a Number rounded to cents. A leading '-' is kept, so callers can refuse it. The rules:
- strip every space flavour and apostrophes (grouping), and one leading or trailing €/$/£/¥;
- when both '.' and ',' appear, the LAST one is the decimal point; the other must group the integer part in threes, with a non-zero first group;
- when one separator kind appears several times, it is grouping, and proper groups are required;
- one separator followed by 0–2 digits is a decimal ('12,5', '12.50', '12.', ',5');
- one separator followed by exactly 3 digits is grouping only if it is the UI locale's grouping character, taken from `Intl.NumberFormat(getLocale()).formatToParts(12345.6)` and cached per locale (',' for en, '.' for it/es, U+202F or NBSP for fr/pt-PT). Otherwise the result is NaN (D-U2-3);
- more than 2 decimals gives NaN (D-U2-4).

**`Store.amountExample()`** returns the locale's 2-decimal format of 1234.56 for the error text. That is '1,234.56' in en, '1 234,56' in fr, and '1234,56' in it/es/pt-PT (minimum grouping digits).

**3. Transaction form save (2209-2223).** `amount = Store.parseAmount(...)`.
- NaN shows `form.amountInvalid {example}` under the amount, with the existing `{after}` placement.
- null or ≤ 0 shows the existing `form.amountRequired`.

**4. Edit prefill (1522).** `Number.isFinite(a) ? String(Math.round(Math.abs(a) * 100) / 100) : ''`.
- Without the rounding, a legacy 1.234 (what the old number input stored when an Italian user typed '1.234') would be re-read under the Italian UI as 1234: a silent 1000× inflation on an untouched save.
- A legacy 1.23456 would read as NaN and block the save.
- With the rounding, the field shows '1.23' and an untouched save stores 1.23.

**5. Budget save (3077-3096).** Parse before `this.editCategoryId = null`.
- NaN or a negative value shows `showFieldError(amtElem, form.amountInvalid)` and returns, so the editor stays open (D-U2-9).
- null saves 0, the same 'no limit' sentinel that the Remove-limit button sends.
- The budget prefill is rounded the same way.

**Why this design.** It is the smallest correct change: the browser can no longer drop a separator, and no reading is silently a guess. Unambiguous inputs ('1,234.56', '1.234,56', '1234,56', '1 234,56') all save as 1234.56.

**Sketch.**

```js
// store.js: insert after formatCurrency (after line 2794)
  // 1.0.2 (BUG-50): the one reader for a typed or pasted money amount. The
  // transaction and budget fields are text inputs: a type=number input kept one
  // separator of '1,234.56' and the form saved 1.23456. Returns a Number
  // rounded to cents, null when empty, NaN when the text can't be read without
  // guessing (both separators: the last one is decimal; a lone separator + 3
  // digits is grouping only when it's the UI locale's grouping char; >2
  // decimals -> NaN).
  _amountSepCache: {},
  _numberSeparators() {
    const loc = this.getLocale();
    let s = this._amountSepCache[loc];
    if (!s) {
      s = { group: ',', decimal: '.' };
      try {
        new Intl.NumberFormat(loc).formatToParts(12345.6).forEach(p => {
          if (p.type === 'group') s.group = p.value;
          if (p.type === 'decimal') s.decimal = p.value;
        });
      } catch (e) { /* very old WebView: en separators */ }
      this._amountSepCache[loc] = s;
    }
    return s;
  },
  parseAmount(raw) {
    let s = String(raw == null ? '' : raw).replace(/[\s'’]/g, '');
    if (!s) return null;
    s = s.replace(/^[€$£¥]|[€$£¥]$/g, '');
    let neg = false;
    if (/^[-−]/.test(s)) { neg = true; s = s.slice(1); }
    if (!/^[0-9.,]*[0-9][0-9.,]*$/.test(s)) return NaN;
    // '1,234,567' with sep ',' -> true; first group 1-3 digits, no leading 0
    const grouped = (str, sep) => {
      const g = str.split(sep);
      return g.length > 1 && /^[1-9][0-9]{0,2}$/.test(g[0]) && g.slice(1).every(x => /^[0-9]{3}$/.test(x));
    };
    const dot = s.lastIndexOf('.'), comma = s.lastIndexOf(',');
    let int = s, frac = '';
    if (dot !== -1 && comma !== -1) {
      const dec = dot > comma ? '.' : ',', grp = dec === '.' ? ',' : '.';
      const i = s.lastIndexOf(dec);
      int = s.slice(0, i); frac = s.slice(i + 1);
      if (!grouped(int, grp)) return NaN;
      int = int.split(grp).join('');
    } else if (dot !== -1 || comma !== -1) {
      const sep = dot !== -1 ? '.' : ',';
      const parts = s.split(sep);
      if (parts.length > 2) { if (!grouped(s, sep)) return NaN; int = parts.join(''); }
      else if (parts[1].length <= 2) { int = parts[0]; frac = parts[1]; }
      else if (parts[1].length === 3 && sep === this._numberSeparators().group && grouped(s, sep)) int = parts.join('');
      else return NaN;
    }
    if (frac.length > 2) return NaN;
    const n = Number((int || '0') + (frac ? '.' + frac : ''));
    if (!isFinite(n)) return NaN;
    const r = Math.round(n * 100) / 100;
    return neg ? -r : r;
  },
  amountExample() {
    return new Intl.NumberFormat(this.getLocale(), { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(1234.56);
  },

// views.js:1616
            <input type="text" id="tx-amount" class="amount-input ..." placeholder="0.00" inputmode="decimal" autocomplete="off" value="${escapeAttr(initialAmount)}" style="width: auto; max-width: 200px;">

// views.js:1522 (edit prefill)
        // 1.0.2 (BUG-50): cents only. Under it/es a legacy 1.234 would be re-read as 1234.
        initialAmount = Number.isFinite(txToEdit.amount) ? String(Math.round(Math.abs(txToEdit.amount) * 100) / 100) : '';

// views.js:2210-2221 (save validation)
        const amount = window.Store.parseAmount(amountInput.value); // 1.0.2 (BUG-50)
        const amountAfter = { after: amountInput.closest('.amount-input-group') };
        if (Number.isNaN(amount)) invalid.push([amountInput, 'form.amountInvalid', amountAfter, { example: window.Store.amountExample() }]);
        else if (amount === null || amount <= 0) invalid.push([amountInput, 'form.amountRequired', amountAfter]);
        ... (category check unchanged; date rider appended here)
          invalid.forEach(([el, key, o, vars], i) => showFieldError(el, window.I18n.t(key, vars), Object.assign({ focus: i === 0 }, o)));

// views.js:2993
                <input type="text" id="bdg-amount" class="form-control" placeholder="0.00" inputmode="decimal" autocomplete="off" value="${budget.amount ? Math.round(budget.amount * 100) / 100 : ''}" style="...unchanged...">

// views.js:3078-3095 (before editCategoryId is cleared)
            const amtElem = container.querySelector('#bdg-amount');
            // 1.0.2 (BUG-50): same reader as the transaction form; an error keeps
            // the editor open (D-U2-9: a negative limit is refused too).
            const amt = amtElem ? window.Store.parseAmount(amtElem.value) : null;
            if (Number.isNaN(amt) || amt < 0) {
              showFieldError(amtElem, window.I18n.t('form.amountInvalid', { example: window.Store.amountExample() }));
              return;
            }
            ... (start/end/cumulative unchanged)
            this.editCategoryId = null;
            window.Store.dispatch('SAVE_BUDGET', { categoryId: savedCategoryId, amount: amt === null ? 0 : amt, startDate: start, endDate: end || null, isCumulative: isCum });
```

**Data repair.** No automatic repair.
- A stored amount with more than two decimals, such as 1.23456 or 1.234, cannot be re-scaled, because the intended value (1234.56 or 1.23) is unknowable.
- The rounded edit prefill means any later edit of such a row stores at most 2 decimals, and the user sees the rounded figure before saving.
- Budgets saved as NaN by an empty field remain 'no limit'.

**Tests (each fails on the current code).**

- tests/unit/amountParse.test.js (new; boots db, i18n plus all five dictionaries, and the store). A table test with I18n.setLang per block. It fails today because Store.parseAmount is undefined.
- en:
  - '1,234.56', '1.234,56' and '1234,56' → 1234.56;
  - '12,500' → 12500;
  - '2.500' and '1.23456' → NaN;
  - '12.' → 12 and ',5' → 0.5;
  - '€ 12,50' → 12.5 and "1'234.50" → 1234.5;
  - '1,234,567.89' → 1234567.89;
  - '1,2,3' and 'abc' → NaN;
  - '' and '  ' → null;
  - '-5' → -5.
- it: '2.500' → 2500; '1,234' → NaN; '0.125' → NaN; '1.234.567' → 1234567.
- fr: '2.500' → NaN; '1 234,56' with NBSP and with U+202F → 1234.56.
- pt (pt-PT, NBSP grouping): '2.500' → NaN; '1234,56' → 1234.56.
- amountParse.test.js: 'each language's example parses back'. For every one of en/fr/it/es/pt, `Store.parseAmount(Store.amountExample()) === 1234.56`. This guards the `form.amountInvalid {example}` copy. Fails today: undefined.
- tests/unit/amountInput.test.js (new; formValidation boot): 'a grouped amount saves in full'.
- #tx-amount.type === 'text'.
- '1,234.56' with Groceries saves 1234.56.
- '1.234,56' also saves 1234.56.
- Fails today: jsdom sanitises the type=number value to '', so amountRequired blocks the save.
- amountInput.test.js: 'an ambiguous amount is refused inline'. Under en, enter '1.234' with Groceries and Save.
- Nothing is saved.
- #tx-amount-error reads 'Enter a valid amount, like 1,234.56.'
- Focus is on #tx-amount.
- Fails today: it saves 1.234.
- amountInput.test.js: 'a legacy 3-decimal row is prefilled at cents and never re-read 1000× larger'. I18n.setLang('it').
- Seed an expense with amount 1.234 and render with params {id}: #tx-amount.value === '1.23'. An untouched save stores 1.23, not 1234.
- Second case: a seeded 1.23456 is also prefilled as '1.23'.
- Fails today: the value is '1.234' and the save stores 1.234.
- amountInput.test.js: 'budget limit uses the same reader'. Set Views.BudgetView.editCategoryId = 'cat_groceries' and render BudgetView.
- '1,500.00' plus #btn-bdg-save gives a budget amount of 1500.
- Re-open with '1.5.0', then with '-50': each time #bdg-amount-error is shown, editCategoryId is still set, and SAVE_BUDGET is not dispatched.
- Re-open with '' and save: the amount is 0 (no limit).
- Fails today: the first case stores 1.5.
- tests/e2e/amount_input.spec.js (new; page.clock pinned; real Chromium typing). Seed one account. On #add, run `locator('#tx-amount').pressSequentially('1,234.56')`, pick Groceries and save.
- The stored expense amount is 1234.56, and History shows −€1,234.56.
- Fails today: it stores 1.23456 because of Chromium's number sanitising.
- This is the only test faithful to the reported browser behaviour.

**New i18n keys (×5).** `form.amountInvalid (new, ×5, placeholder {example}): en 'Enter a valid amount, like {example}.' / fr 'Saisissez un montant valide, par exemple {example}.' / it 'Inserisci un importo valido, ad esempio {example}.' / es 'Introduce un importe válido, por ejemplo {example}.' / pt 'Introduza um valor válido, por exemplo {example}.'`, `reuses form.amountRequired (unchanged)`

**Risks.** **Text input instead of a number input**
- Desktop browsers lose the number spinner and letter blocking. The parser rejects junk inline instead.
- iOS `inputmode=decimal` shows only the region's decimal key. That is fine, because any separator followed by 1–2 digits is read as a decimal.
- A user whose phone region differs from the app language may type '1,250' meaning 1.25. Example: Italian region with the English UI, where '1,250' is read as 1250, the en grouping reading. A 3-decimal entry with a trailing zero is very unlikely; this is documented as accepted.

**The same text can be valid in one language and an error in another.** '2.500' is valid in it/es and an error in en/fr/pt-PT. This is by design: it never produces a silent 1000× misread. Brazilian-style '2.500' typed under the pt (pt-PT) UI gets the inline error with the example '1234,56'.

**Edit prefill.** Rounding changes a legacy row with more than two decimals to cents on its next edit. The change is visible in the field.

**Interactions with other units**
- U8 (BUG-35) should read its 'Amount received' field with `Store.parseAmount`, so that both legs follow one rule. U8's captureDraftTxFormState (views.js:101-136) keeps the raw text, which is compatible.
- U3 (BUG-27) edits isPaidPayload at 2286-2295 in the same save handler. U2's hunk (2209-2223) is separate.
- U9 (BUG-86/87) owns BudgetView 2770-2771, 3038-3048 and 3229-3235, plus views.js:2404. U2 touches only 2993 and 3077-3096 in BudgetView.

**Not in this unit.** The debt simulator and the 50/30/20 widget keep the old pattern; see the rider-not-recommended entry.

### Rider (BUG-38 follow-on): Save accepts an empty date: a non-recurring log is stored with date '' (invisible in every period); a recurring one currently throws RangeError  _(rider, recommended, effort S)_

**Root cause.** The save validation (views.js:2209-2223) checks only the amount and the category, never `#tx-date`. Android's native date picker has a Clear button that sets the value to ''.

**Non-recurring log.** It goes to ADD_TRANSACTION with `date: ''` (views.js:2390-2401). No period, balance or History filter ever shows it, so it looks like data loss. Once the account has an opening balance, `'' < obDate` also excludes it from the balance.

**Recurring log.** The end default builds `new Date('')`, calls `setFullYear` and then `toISOString()` (views.js:2248-2250), which throws RangeError. The tap does nothing, with no feedback. After the BUG-38 change, `_calculateNextRecurrenceDate('', 5, 'years')` returns undefined, so the series would be saved with no date, start, end or nextDate.

**Fix.** Add a required-date check to the same one-pass validation, after amount and category so that focus order follows the page:

`if (!dateEl.value) invalid.push([dateEl, 'form.dateRequired', {}])`

It runs before the recurrence object is built (2235). It uses the existing `showFieldError` helpers, and the message clears on input or change. The store stays ungated, so imports are unaffected.

**Sketch.**

```js
// views.js, inside the 1.0.1 validation block (after the category check, ~2219)
        // 1.0.2 (BUG-38 rider): a cleared date used to save an invisible row (or,
        // for a series, throw RangeError on the end default).
        const dateEl = document.getElementById('tx-date');
        if (!dateEl.value) invalid.push([dateEl, 'form.dateRequired', {}]);
```

**Data repair.** None. Rows already saved with `date: ''` are not touched by this rider, and a boot heal cannot guess their date. A possible follow-up is to list them under a 'No date' filter.

**Tests (each fails on the current code).**

- formValidation.test.js (append): 'a cleared date is refused inline'.
- Render New Log, set amount 10, pick Groceries and set #tx-date to ''. Save.
- Nothing is stored, #tx-date-error reads 'Choose a date.' and focus is on #tx-date.
- Fails today: the row is stored with date ''.

**New i18n keys (×5).** `form.dateRequired (new, ×5): en 'Choose a date.' / fr 'Choisissez une date.' / it 'Scegli una data.' / es 'Elige una fecha.' / pt 'Escolha uma data.'`

**Risks.** Minimal: one extra inline check in the existing pass. It blocks a save that today 'succeeds' silently, which is the intent.

### Rider (BUG-50 class, not reported): the loan simulator's money fields and the 50/30/20 widget's Planned income field are also type=number read by parseFloat, so '1,234.56 _(rider, not recommended, effort S)_

**Root cause.** These fields are `type="number"` inputs. They suffer the same Chromium single-separator sanitising as BUG-50.

**Debt simulator:**
- #dsim-principal (views.js:4677), #dsim-down (4684), #dsim-er-amount (4900) and #dsim-ex-amount (4939);
- read with `parseFloat` at 4519 (`num`), 4791, 4915 and 4949.

**50/30/20 widget (reviewer finding, verified):**
- the Planned income input (widgets.js:1311, `type="number" inputmode="decimal"`);
- read with `parseFloat` on input (widgets.js:1332);
- '1,500.00' becomes 1.5, a planned income 1000× too small, which skews the widget's split.

**Fix.** Leave this to a later round. Then read these fields with `Store.parseAmount` and convert them to text inputs with inputmode=decimal.
- *Simulator:* the loan draft keeps raw strings, so LoanEngine receives the parsed number.
- *Widget:* keep `null` for empty input.

Not recommended for 1.0.2:
- the simulator region belongs to the loans owner (BUG-74), and the simulator shows its result before anything is saved, so a misread is visible;
- the widget's figure is a display-only planning input, owned by the widgets region.

**Sketch.**

```js
// follow-up only, e.g. views.js:4791
        const p = window.Store.parseAmount(d.principal), dp = window.Store.parseAmount(d.downPayment);
// widgets.js:1332
            const n = window.Store.parseAmount(incomeInput.value); // null = no planned income
```

**Data repair.** None. Simulations are recomputed from their config. The 50/30/20 planned income is a widget config value that the user re-types.

**Tests (each fails on the current code).**

- (follow-up) debtView.test.js: typing '25.000' under it gives a principal of 25000, and '1,234.56' under en gives 1234.56.
- (follow-up) a widgets test: Planned income '1,500.00' under en is stored as 1500 in the widget config.

**Risks.** It would touch views.js 4500-4960 (loans) and widgets.js 1300-1340 (widgets), which are owned by other regions this round. Out of scope for U2.

### U2 decisions

- **D-U2-1** BUG-25: what happens when the user opens an opening balance (the 'Adjustment' row) from History or category detail?
  - A read-only 'Opening Balance' panel in place of the transaction form. It shows the signed amount, account and date, one line of explanation, and an 'Edit Account' button that links to #edit-account?id=…
  - Navigate straight to Edit Account from the three tap sites (History tap views.js:1420, swipe-edit 1214, category detail 2615), keeping the panel as a fallback
  - Give the transaction form an opening-balance mode (signed amount, sign toggle, no type toggle, no recurrence)
  - _Recommended:_ A read-only 'Opening Balance' panel in place of the transaction form. It shows the signed amount, account and date, one line of explanation, and an 'Edit Account' button that links to #edit-account?id=… — One guard in AddTransactionView covers every entry point and stays inside U2's region. It needs no redirect, which with push navigation would make Back bounce back to the redirect, and it does not depend on BUG-87's Router changes. It also tells the user why the row is not editable here.
- The second option saves one tap, but it edits History and category-detail code owned by other units and lands the user on a screen they did not tap.
- The third option duplicates Edit Account's sign and date rules in a second place.
- **D-U2-2** BUG-25: should installs that already hold a converted opening balance be repaired at boot?
  - A balance-neutral heal. It restores type opening_balance only when the account has no opening-balance row, exactly one converted row (income or expense, category Adjustment, note 'Opening Balance') and no other row dated before it or undated. An expense becomes a negative opening balance. The sign lost by the income conversion is left for the user to set in Edit Account. Accounts that also received a €0 opening balance from a later Edit Account save are left alone, and the manual fix is documented.
  - No heal: users fix it by hand (delete the converted Adjustment row in History, then set the opening balance, sign and date in Edit Account)
  - The balance-neutral heal plus a narrow undo of the later €0 opening balance. When the account's only opening-balance row is €0 (time 00:00, note 'Opening Balance') and exactly one converted row is dated before it, with nothing earlier or undated, delete the €0 row and restore the converted one. This moves balances at boot: the rows between the two dates count again.
  - _Recommended:_ A balance-neutral heal. It restores type opening_balance only when the account has no opening-balance row, exactly one converted row (income or expense, category Adjustment, note 'Opening Balance') and no other row dated before it or undated. An expense becomes a negative opening balance. The sign lost by the income conversion is left for the user to set in Edit Account. Accounts that also received a €0 opening balance from a later Edit Account save are left alone, and the manual fix is documented. — This heal cannot move a balance:
- an income or expense counts exactly like the restored opening balance;
- the restored date excludes no row;
- undated rows block the heal.

It makes Edit Account show the real opening balance, so one sign tap fixes the account.

The narrow undo (third option) would repair the worst case, an account that sits at €0 with its history hidden. However, it changes balances at boot. Every boot heal in this codebase (orphan transfer legs, generator invariant) moves no balance, and the 1.0.1 round declined boot repairs that carry false-positive risk. The pre-1.0.2 installed base is the closed test plus early store users, who can be given the two-step manual fix. The narrow signature is specified, so the owner can choose it.
- **D-U2-3** BUG-50: how should a lone separator followed by exactly three digits be read ('12,500', '2.500', '1.234')?
  - As grouping when it is the UI language's grouping character (',' in English, '.' in Italian/Spanish); otherwise an inline 'Enter a valid amount, like …' error
  - Always an inline error (the user retypes without the separator)
  - Always as grouping (the import's parseBankAmount 'auto' rule)
  - _Recommended:_ As grouping when it is the UI language's grouping character (',' in English, '.' in Italian/Spanish); otherwise an inline 'Enter a valid amount, like …' error — It matches what the user means in their own language: '2.500' is 2,500 in Italian, and '12,500' is 12,500 in English. When the reading is unclear it shows an error, so it can never silently save a value 1000× off.
- Always erroring adds friction for pasted statement amounts.
- Always grouping turns '1.234' typed by an English user into 1234 without a word.
- **D-U2-4** BUG-50: what happens to amounts with more than two decimals ('1.23456', or '12,345' read as a decimal)?
  - An inline error ('Enter a valid amount, like 1,234.56.')
  - Round silently to cents
  - _Recommended:_ An inline error ('Enter a valid amount, like 1,234.56.') — With a text input, more than 2 decimals only appear from a typo or from a value with another meaning. Rounding would hide exactly the kind of misread this bug is about. Valid inputs are still rounded to cents internally to remove float noise.
- **D-U2-5** BUG-39: should the Default Wallet hint (account.setDefaultHint) be reworded in all 5 dictionaries to say the wallet is preselected for new logs?
  - Yes: change the values only, with no new key (en: 'Shown first on the Dashboard and preselected for new logs.')
  - No: keep 'Primary account for dashboard overview.'
  - _Recommended:_ Yes: change the values only, with no new key (en: 'Shown first on the Dashboard and preselected for new logs.') — The setting now has a visible effect on every new log. The hint should say so, so that users understand why the account field starts where it does. It is a value-only change, with no i18n test impact.
- **D-U2-7** BUG-25: which Opening Balance Date should Edit Account prefill for an existing account that has no opening-balance row (Bank Connect or CSV-created accounts, or one whose row was deleted)?
  - Its earliest dated transaction, never later than today (local)
  - Today (local). An untouched save still creates nothing, but typing an amount dates the new opening balance today
  - _Recommended:_ Its earliest dated transaction, never later than today (local) — If the user enters an opening balance for an account that already has history, dating it today would put that history before the opening date and hide it, which is the same trap again. The earliest row keeps every row counted. An untouched save sends nothing, so the prefilled date has no effect unless the user enters an amount or picks a date.
- **D-U2-8** BUG-25: what should Edit Account do when the Opening Balance Date field is empty on save (the Android picker's Clear button)?
  - Treat it as unchanged and use the prefilled date: the account's opening-balance date, otherwise its earliest row, otherwise today
  - Refuse the save inline with 'Choose a date.' under the date field (reusing the rider's form.dateRequired key)
  - _Recommended:_ Treat it as unchanged and use the prefilled date: the account's opening-balance date, otherwise its earliest row, otherwise today — An empty date has only one sensible meaning in this form, because most users never touch the field.
- For an account with an opening balance, the store already keeps the existing date in this case (store.js:1189), so nothing changes.
- For an account without one, today's '' falls back to createdAt and hides the account's history. Using the prefilled date closes that door with no new UI state and no extra tap.

The inline error is also safe, but it blocks a rename for a field the user did not mean to change.
- **D-U2-9** BUG-50: what should the budget limit field do with a negative value ('-50')?
  - Refuse it inline with 'Enter a valid amount, like 1,234.56.' and keep the editor open; an empty field still saves 'no limit'
  - Save it as today (a negative monthly limit)
  - _Recommended:_ Refuse it inline with 'Enter a valid amount, like 1,234.56.' and keep the editor open; an empty field still saves 'no limit' — A negative limit has no meaning: every category reads as over budget. The handler is being rewritten anyway, so the check costs one condition and reuses the new key. The transaction form already refuses values ≤ 0.

### U2 regions owned

| File | Symbol | Lines | Change |
|---|---|---|---|
| src/views.js | AddTransactionView (object head): new _renderOpeningBalancePanel(tx, state) | 1478-1479 (insert as the first method, after `AddTransactionView: {`) | BUG-25: read-only opening-balance panel showing the signed amount, account, date, an info line and an 'Edit Account' link. |
| src/views.js | AddTransactionView.render: OB guard and initialDate | 1499-1504 (insert after 1499; edit 1504) | BUG-25: return the panel for opening_balance rows. Lines 1495-1497 (BUG-87, U9) stay untouched. BUG-38: initialDate = Store._todayYMD(). |
| src/views.js | AddTransactionView.render: edit prefill amount | 1522 | BUG-50: round the prefill to cents, with a finite guard. U8 edits 1519-1520; line 1521 stays as the unchanged boundary. |
| src/views.js | AddTransactionView.render: new-log account fallback | 1590-1591 (insert after 1590) | BUG-39: the Default Wallet if it exists, otherwise the first account by name. New logs only, after the draft is applied. |
| src/views.js | AddTransactionView.render: amount input markup | 1616 | BUG-50: type=text inputmode=decimal autocomplete=off, no step, value escaped with escapeAttr. Line 1614 (the currency symbol) is unchanged. |
| src/views.js | AddTransactionView.attachEvents: updateRecurrentText end default | 1883-1890 | BUG-38: Store._calculateNextRecurrenceDate(date, 5, 'years'). |
| src/views.js | AddTransactionView.attachEvents: save validation | 2209-2223 | BUG-50: Store.parseAmount with amountInvalid/amountRequired. Rider: the date is required. |
| src/views.js | AddTransactionView.attachEvents: recurrenceData endDate default | 2247-2251 | BUG-38: endDate = eDate \|\| Store._calculateNextRecurrenceDate(date, 5, 'years'). This is inside U3's 2235-2261 region; U3 inserts after 2254, and 2252-2254 stay untouched. |
| src/views.js | BudgetView edit pane: #bdg-amount markup | 2993 | BUG-50: type=text inputmode=decimal autocomplete=off, prefill rounded to cents. |
| src/views.js | BudgetView.attachEvents: #btn-bdg-save handler | 3077-3096 | BUG-50: parse with Store.parseAmount before editCategoryId is cleared. NaN or a negative value shows an inline error and keeps the editor open (D-U2-9). An empty field saves 0. |
| src/views.js | EditAccountView.render: opening-balance date default | 3964 | BUG-25/BUG-38: an account with no opening balance uses its earliest dated row, never after today (Store._todayYMD()). A new account uses the local today. |
| src/views.js | EditAccountView.attachEvents: save, UPDATE_ACCOUNT payload | 4261-4271 (inside `if (account) {`) | BUG-25: obDate = dDate \|\| defaultValue (D-U2-8). openingBalance/openingDate are sent only when an opening balance exists, an amount was entered, or the date changed. U5's duplicate-name check (insert after 4259) and lines 4247-4260 are not touched. |
| src/store.js | Store.init: boot heal call | 460-461 (insert after 460) | BUG-25: this._healConvertedOpeningBalances(), after _healRecurrenceGenerators() and before _processRecurringTransactions(). U3, U5 and U6 also add calls in 455-461; the integrator unions them. |
| src/store.js | new Store._healConvertedOpeningBalances() | insert after 685 (between _calculateNextRecurrenceDate, which ends at 684, and the BUG-14 comment at 686) | BUG-25: balance-neutral restore of converted opening balances, income or expense (D-U2-2). Moved here from 'before 741' because U3 inserts at 740 and U5 at 710. |
| src/store.js | dispatch ADD_ACCOUNT: opening-balance date fallback | 1155 | BUG-38: payload.openingDate \|\| this._todayYMD(). Only this line; BUG-24 and BUG-34 also edit this case. |
| src/store.js | dispatch UPDATE_ACCOUNT: opening-balance date fallback | 1189 | BUG-38: createdAt ? this._localYMD(createdAt) : this._todayYMD(), using U4's helper. |
| src/store.js | dispatch UPDATE_TRANSACTION: head (payload/absoluteAmount) | 1340-1347 | BUG-25: opening_balance rows keep their type, account, category and sign, and never join a series or a transfer. U3 owns 1383-1411 and 1468-1494; U8 owns 1361. |
| src/store.js | new Store._amountSepCache/_numberSeparators()/parseAmount()/amountExample() | insert after 2794 (end of formatCurrency) | BUG-50: the shared money-amount reader and the error example. |
| src/import.js | buildAccounts: openingDate fallback (PART E, applied by U6 inside its buildAccounts hunk 1252-1305) | 1281-1282 | BUG-25: a v1.19+ row with an empty opening_date and a 0 balance gets no openingDate, so no €0 opening balance is created at created_at. The created_at fallback stays for pre-v1.19 files, now as the local day via Store._localYMD (BUG-38). U2 supplies the sketch and the test spec; U6 owns the lines. |
| src/i18n/en.js, fr.js, it.js, es.js, pt.js | end-of-dictionary block '// ── 1.0.2 (BUG-25, BUG-38, BUG-50) ──' | append before '};' (en.js 1346, the others 1325) | New keys form.openingBalanceInfo, form.amountInvalid {example} and form.dateRequired. If D-U2-5 is approved, the account.setDefaultHint value changes in place (en 555, fr/it/es/pt 548). |
| tests/unit/accountColorSelection.test.js, tests/unit/negativeOpeningBalance.test.js, tests/unit/openingBalanceDecimalShift.test.js | mock window.Store in beforeEach | accountColorSelection 18-35, negativeOpeningBalance 18-37, openingBalanceDecimalShift 20-32 | Add `_todayYMD: () => '2026-07-01'`. EditAccountView.render now calls it unconditionally, and without it every test in these files throws a TypeError. |
| tests/unit (new) + tests/e2e (new) | openingBalanceForm.test.js, localDateDefaults.test.js, defaultWalletPreselect.test.js, amountParse.test.js, amountInput.test.js, e2e/amount_input.spec.js (+ optional default_wallet.spec.js, opening_balance_panel.spec.js); formValidation.test.js (rider case appended) | new files; formValidation.test.js append only | Regression tests listed per bug. The part E round-trip test goes to U6's restoreAccounts.test.js. |

**Dependencies.** **U4: date helpers (narrowed).**
- Every "today" default uses `Store._todayYMD()`, which is already on main at store.js:4270: views.js:1504, views.js:3964 and store.js:1155. U2 therefore needs nothing from U4 for these.
- Only store.js:1189, and part E in import.js, call U4's new `Store._localYMD(value)`. 1189 is guarded as `createdAt ? _localYMD(createdAt) : _todayYMD()`, as U4's review asked.
- U4 commits `_localYMD` first, as a pure addition after store.js:859. U2 cherry-picks that commit into its worktree for localDateDefaults.test.js; the hunks are identical, so they merge cleanly.
- U2 defines no formatter of its own. The draft's `Store.localDateKey` is dropped.
- The lint rule is decided under D-U4-7. D-U2-6 is withdrawn.

**U6: part E of BUG-25, a named cross-unit item.**
- U6 owns buildAccounts (import.js 1252-1305) and rewrites lines 1271-1300 this round. It applies part E (the BUG-25 codeSketch) inside its hunk.
- U6 adds the round-trip case to restoreAccounts.test.js from U2's spec.
- If U6 does not take it, the integrator applies it after U6 merges. It must not be dropped: without it, a restore recreates the BUG-25 trap for every account exported without an opening balance.
- U6's strict `_parseRestoreAmount` replaces the `parseFloat` at 1276. Part E only needs the resulting `openingBalance` value.

**U2 provides `Store.parseAmount(raw)` and `Store.amountExample()`.**
- U8 (BUG-35) reads its new "Amount received" field with parseAmount and shows `form.amountInvalid` on NaN.
- U8's currency comparison runs after syncTransferTo (views.js:1845), so it sees U2's preselected From.
- The debt-simulator and 50/30/20 follow-up will reuse both.

**Neighbouring owners: hunk boundaries U2 respects**
- *U3 (BUG-26/27/74):*
  - views.js 1557-1563, 2235-2261 (U3 inserts after 2254; U2 edits only 2247-2251) and 2286-2295;
  - store.js UPDATE_TRANSACTION 1383-1411 and 1468-1494 (U2 edits only 1340-1347), and UPDATE_TRANSFER;
  - U3's helper insert at store.js:740. U2's heal goes after 685.
- *U5 (BUG-29/30/40):*
  - store.js `_pruneAccountRefs` insert at 710, and boot heals at 455-461 (union);
  - views.js 4244-4320: U5 inserts its name check after 4259, and U2 edits only inside `if (account) {` from 4262;
  - BankMapView 6876-6883 still creates accounts with no opening balance, which part C covers.
- *U6:* its boot-heal append after 460 (union).
- *U8 (BUG-35/36):*
  - views.js 1519-1520 (U2 edits 1522), 1541-1552, 1576-1577, the insert at 1632-1633, 1808-1853, and 2263-2273/2305-2365;
  - store.js:1361 and 3080-3082. No line overlap with U2.
- *U9 (BUG-86/87):*
  - views.js 1495-1497, 1598, 2404 and 2445;
  - BudgetView 2770-2771, 3038-3048 and 3229-3235;
  - EditAccountView 3983, 4298 and 4316.
  - If BUG-87 adds `data-router-leave` to the form's ✕, the integrator adds it to the panel's ✕.
- *U7:* `dispatch` is renamed to `_reduce` and the body is untouched. U2's head reassigns the `payload` parameter, which keeps its name.
- *BUG-24's owner:* views.js:80-99 and the ADD_ACCOUNT validation. U2 touches only store.js:1155.
- *Loans owner:* views.js:4456 is left alone, because the BUG-39 render guard covers a stale id.

**Rules for this round**
- Do not bump `?v=`, and do not edit CLAUDE.md or docs; the integrator does both.
- Append new i18n keys at the end of all 5 dictionaries, with `merge=union`.
- No e2e inside the worktree: the specs are written blind and run after integration.

**Integrator notes for CLAUDE.md**
- An opening balance is owned by its account. UPDATE_TRANSACTION pins its type, account, category and sign, and the form shows a read-only panel.
- Edit Account sends an opening balance only when it is touched.
- `_healConvertedOpeningBalances` is a boot heal.
- `Store.parseAmount` is the reader for typed money. Never use type=number for money.

**Follow-ups to add to the plan**
- Stage-2 accounts and their manual fix (unless D-U2-2 option 3 is chosen).
- The swipe ✓ can mark an opening balance unpaid.
- Bulk-delete of opening balances.
- Existing dateless rows.
- The simulator and 50/30/20 money fields.

**Existing tests affected.** **Existing tests edited: 3 files (reviewer finding, verified).**
- tests/unit/accountColorSelection.test.js (mock Store 18-35), negativeOpeningBalance.test.js (18-37) and openingBalanceDecimalShift.test.js (20-32) render EditAccountView against a hand-built Store with no store.js. EditAccountView.render now calls `window.Store._todayYMD()` unconditionally (BUG-25 part C / BUG-38), so every test in these files would throw a TypeError.
- Fix: add `_todayYMD: () => '2026-07-01'` to each mock Store. There is no fallback in the view.
- Their assertions survive the obTouched rule:
  - negativeOpeningBalance has an opening balance, so it still sends `openingBalance` (objectContaining);
  - accountColorSelection checks only id and color;
  - openingBalanceDecimalShift renders a new account, whose ADD_ACCOUNT branch is unchanged.
- Re-run all three in the U2 worktree.

**Existing tests: no other failure expected.** Reviewed:
- `formValidation.test.js`: amount and category messages are unchanged. '' and '0' still give amountRequired, and setting `.value` works on a text input. The rider appends one case.
- `draftTxPreservation.test.js`: `value=\"88.50\"` still renders (escapeAttr leaves it unchanged), and a draft with an existing account still wins.
- `transferEditCounterpart.test.js`, `accountDeleteTransfers.test.js`, `recurrenceEditing.test.js`, `conditionalTimePickerUI.test.js` and `manualTimeInputToggle.test.js` use the real store and `_todayYMD` is on main. Edit mode is unchanged.
- `debtView.test.js`: the prefill draft is unchanged.
- `androidBack.test.js`: builds its own type=number markup and is unaffected.
- `accountBalanceRefactor.test.js`: #edit-acc-date still exists, and its ADD/UPDATE_ACCOUNT calls pass explicit dates.
- `statementImport.test.js`: passes openingDate explicitly.
- `fullRestore.test.js` 'still reads an accounts file from before v1.19': there is no opening_date column, so the created_at fallback is kept. `_localYMD('2025-11-20T09:12:00.000Z')` is still '2025-11-20' in any zone from UTC−9 to UTC+14 (this line is owned by U6/part E).

**Existing e2e: compatible, re-check after integration**
- `debt_simulator.spec.js:166`: #tx-amount '436.48' with the default account, which is now also guaranteed when the default is stale.
- `user_flow.spec.js:58, 91`: fill and selectOption on #tx-amount, #tx-account and #bdg-amount, which work on text inputs.
- `i18n_core.spec.js:45` and `recurring_edit_scope.spec.js:91`: fill amounts.
- `recurring_edit_scope.spec.js:21`: an account with no openingDate now gets the local date, which matters only near midnight.
- Any spec that saves a new log without choosing an account, where the default is not first by name, now books to the default. I found none.

**New unit tests**
- openingBalanceForm.test.js: 6 tests (panel; store guard including accountId; earliest-row default plus untouched rename; typed amount dated at the earliest row; cleared date per D-U2-8; boot heal with 7 account cases including undated and expense).
- localDateDefaults.test.js: 3 tests, with TZ switched at runtime as in periodLabelYear.test.js. Needs U4's `_localYMD` commit cherry-picked.
- defaultWalletPreselect.test.js: 4 tests.
- amountParse.test.js: 2 tests (the table, and the example round-trip in 5 languages).
- amountInput.test.js: 4 tests (grouped amount; ambiguous amount refused; legacy 1.234 under it prefilled as '1.23'; budget with '1.5.0', '-50' and '').
- formValidation.test.js: +1 (rider).
- U6's restoreAccounts.test.js: +1 case (part E round trip, both file orders).

**New e2e.** amount_input.spec.js types '1,234.56' in real Chromium. Optional: default_wallet.spec.js and opening_balance_panel.spec.js.

All new tests fail on efcac0c. Guard-style negative assertions are folded into tests whose positive assertion fails today. The i18n.test.js placeholder check covers `form.amountInvalid {example}` in all five dictionaries.

## U3 — Recurring series integrity

I checked all 14 review issues against efcac0c. 12 are accepted, 1 is accepted in part (D-U3-1 now states its trade-off but keeps option a), and 1 proposed fix is rejected (raising the series end on an 'Only this' move). Three changes matter most:\n- BUG-74 now marks hand-edited loan payments explicitly instead of guessing from amounts.\n- The form no longer traps a payment that 'Only this' moved past its series end.\n- The scope sheet now says when rebuilt payments come back as paid.\n\n**BUG-74 blocker (two reviewers): accepted.** Confirmed.\n- How it happens: _moveSeriesEnd (store.js:4157-4172) creates the months a longer loan adds by cloning the tail. _applyLoanFinalInstalment (:1326) has already set that tail to the final amount.\n- The added months have no old instalment (oldC null), so the draft's rule counted them as changed by hand and never re-priced them.\n- loanSyncInPlace :152, :237 and :423 fail under that rule. Plan and apply also used different lists.\n- The suggested oldC != null guard does not fix the Italian case. I dropped the amount-frequency guess and took the reviewers' preferred fix: an amountEdited mark.\n  - Set by an 'Only this' amount change on a payment linked to a loan.\n  - Dropped by the generator's clones (next to :803/:832), by scoped amount edits and by a re-price.\n  - A payment is kept when it is marked, its month's instalment changed, and its amount is not that month's old instalment.\n- The plan exposes customIds. SYNC 'update' keeps today's rule and skips exactly those ids.\n\n**BUG-74 major (Italian, second sync) and minor (declined sync): accepted.** The mark fixes both: unmarked payments behave as in 1.0.1.\n\n**BUG-26 major (two reviewers): accepted for the form; the store change asked for under 'Only this' is rejected.**\n- Confirmed: views.js:2257 compared the pre-filled series end with the moved date, so every later save of a payment that 'Only this' moved past its series end was refused.\n- Now:\n  - That check runs only for a save that is not a series member or that changed the schedule.\n  - The D-U3-5 end shift moves into doDispatch and applies to 'This and future'/'All' only.\n  - A store floor in both regenerate branches keeps the re-armed member from ending before its own date. That covers store-level callers, such as the draft's loan test.\n- Rejected: raising the series end and re-arming the tail on an 'Only this' move.\n  - It changes a series value from an 'Only this' edit, which contradicts D-U3-2a.\n  - It needs a re-arm, or the tail generates a payment between the old date and the new one.\n  - It still misses a mid payment moved past the armed tail.\n  - It is unnecessary: a payment past the end is inert. Generation reads only the armed nextDate against its end (:754-757), and _moveSeriesEnd lifts the end to its tail (:4151).\n- Also rejected: an inline error for 'single'. It would appear after the scope sheet closes, because validation runs before the sheet.\n\n**BUG-26 minor (60-month cap, two reviewers): accepted as a limit.**\n- Confirmed: _clampRecurrenceEndDate (:646-661) counts months.\n- A series at the 5-year cap still loses its last payment when a move crosses a month boundary.\n- The wording is corrected and a guard test pins the behaviour.\n\n**BUG-26 minor (own-copy clause): accepted.**\n- _healSeriesSchedules also runs after BATCH_IMPORT_TRANSACTIONS. This is one line in U6's block.\n- The own-copy clause is dropped. The only production caller is the form, and it now sends the series values, never a member's own copy.\n- The stale-copy test moves to the view.\n\n**BUG-26 minor (impossible transfer test): accepted.** It now shortens from the 6th pair.\n\n**BUG-26 minor (unguarded getSeriesSchedule, risk wording): accepted.**\n- The save handler guards the call and falls back to the member's copy.\n- The risk text now reads: counts and amounts unchanged; the varies wording for a stopped chain reads up to its last payment (:3910, :3988).\n\n**BUG-27 minor (two reviewers): accepted.** Rebuilt payments still start paid (D-U3-3a), but the sheet now says so.\n- A new key, recUpdate.rebuildPaidNote, appears when the edit rebuilds (date or schedule changed) and either Paid was flipped or a later payment is unpaid.\n- recUpdate.paidNote appears only on edits that do not rebuild.\n\n**BUG-27 minor (isPaid key): accepted.** The two UPDATE sites use a conditional spread.\n\n**BUG-27 minor (D-U3-1): accepted in part.**\n- The decision now says that (b) is the report's literal expected behaviour and that (a) removes the bulk repair.\n- (a) stays recommended, for the reasons given in the decision.\n\nKeys (5, all five dictionaries):\n- recUpdate.onlyThisSubSchedule\n- recUpdate.paidNote\n- recUpdate.rebuildPaidNote\n- debt.sync.customKept.one\n- debt.sync.customKept.other\n\nEffort: BUG-26 M, BUG-27 S, BUG-74 M.\n\nTests: only loanSyncInPlace.test.js:302 changes. With the mark, :152, :237, :423 and the plan toEqual tests pass unchanged.\n\nIntegrator (not this unit):\n- Bump ?v= together for store.js, views.js, components.js and i18n/*.js.\n- Update CLAUDE.md: the recurrence rules and the loan amountEdited rule.\n- Add a note to refactor-plan §4.3: paid no longer propagates.

### BUG-26 — Ended recurring series come back after a later 'This and future' or 'All' edit _(gate, effort M)_

**Root cause.** Confirmed. Every member keeps its own copy of recurrence.endDate, interval and frequency. Only the armed member's copy limits generation: _processRecurringTransactions (store.js:754-757) runs while nextDate <= endDate.

No path that shortens a series updates the members it keeps:
- the 'This and future' regenerate (1509-1540);
- DELETE_TRANSACTION deleteFuture (1836-1847);
- DELETE_BULK_TRANSACTIONS deleteFuture (1932-1943);
- Recurrent off with a scope (1483-1484, 1717-1718);
- DELETE_LOAN (2479-2488), which goes through deleteFuture.

The form pre-fills the tapped member's own copy (views.js:1559-1561) and sends it back (2239-2253). The store compares that payload with the same member's copy (1407-1411; 1638-1642 for transfers), so an outdated end counts as unchanged. From there:
- (a) An amount-only future/all edit merges memberRec (1488; 1720) and writes the old end onto the still-armed tail, which then regenerates.
- (b) A date edit re-arms the edited member (1524-1527; 1744-1756) and rebuilds the series up to its old end.

**Fix.** endDate, interval and frequency become series-level values.

**1. Store helpers** (new, inserted at store.js:740):
- **_scheduleOf / getSeriesSchedule:** returns {endDate, interval, frequency, live, lastDate}.
  - A live series takes the armed member's values; when two members are armed, the latest one wins.
  - A stopped series takes the last member's interval and frequency, and its endDate is that member's date (the rule SYNC 'finish' already follows).
- **_stampSchedule / _syncSeriesSchedule:** write that schedule onto every member, both legs, past ones included.
- **_resolveSeriesRec(rec, sched, scoped):** fills missing values from the series. Without a future/all flag it always forces the series values, so 'Only this' never reschedules (D-U3-2a). There is no own-copy clause.
- **_healSeriesSchedules:** an O(T) pass that returns true when it healed something.

**2. Store call sites:**
- **UPDATE_TRANSACTION / UPDATE_TRANSFER:**
  - Read sched before anything mutates, and resolve the payload against it.
  - Classify scheduleChanged against the series.
  - In the transfer case, legRecurrence and the propagated memberRec read the resolved value.
  - In both regenerate branches, the re-armed member never ends before its own date (store floor).
  - Call _syncSeriesSchedule(seriesId) before the save.
- **DELETE_TRANSACTION:** after the filter, call _disarmSeries (deleteFuture only), then _syncSeriesSchedule. This also covers DELETE_LOAN, SYNC 'finish', DELETE_RECURRING_FUTURE and the form's conversion.
- **DELETE_BULK_TRANSACTIONS:** the same, per affected series.
- **SYNC 'update':** call _syncSeriesSchedule before its save.
- **Heal:** at boot, between _healRecurrenceGenerators and _processRecurringTransactions, and inside BATCH_IMPORT_TRANSACTIONS.

**3. Form:**
- Pre-fill End Date, interval and frequency from getSeriesSchedule (1557-1563).
- On save, compute scheduleChanged against the series (getSeriesSchedule guarded, with a fallback to the member's copy).
- Run the end-before-date check (2257) only when the save is not a series-member edit, or when scheduleChanged.
- In doDispatch, for 'future'/'all' only: when End Date is untouched and the payment moves later, move the end by the same number of days (D-U3-5a).
- Pass scheduleChanged to RecurringUpdateModal, which then shows a different 'Only this' subtitle (D-U3-2a).

**Rejected suggestions:**
- Disarming a tail past its end: it would make every finished live series look stopped, which breaks BUG-07's chainLive and wasLive.
- Pre-filling the latest endDate: on a shortened series that copy is the outdated one.
- Raising the end or re-arming on an 'Only this' move: reasons are in the summary.

**Sketch.**

```js
// store.js — after _healRecurrenceGenerators (insert at :740)
// 1.0.2 (BUG-26): endDate/interval/frequency are SERIES-level. Members carry copies, but only the
// armed member's is real (it alone bounds generation, :754-757); a series with no armed member was
// stopped and ends ON its last payment (the SYNC 'finish' rule, :2415-2424).
_scheduleOf(members) {
  let armed = null, last = null;
  members.forEach(t => {
    if (t.recurrence.nextDate && (!armed || t.date > armed.date)) armed = t;
    if (!last || t.date > last.date || (t.date === last.date && t.type === 'expense')) last = t;
  });
  if (!last) return null;
  const r = (armed || last).recurrence;
  return { endDate: armed ? r.endDate : last.date, interval: r.interval, frequency: r.frequency, live: !!armed, lastDate: last.date };
},
getSeriesSchedule(seriesId) {
  return seriesId ? this._scheduleOf(this.state.transactions.filter(t => t.recurrence && t.recurrence.seriesId === seriesId)) : null;
},
_stampSchedule(members, s) { // mutates; the caller saves
  const K = ['endDate', 'interval', 'frequency'];
  let changed = false;
  members.forEach(t => {
    const next = { ...t.recurrence };
    K.forEach(k => { if (s[k] != null) next[k] = s[k]; });
    if (K.some(k => String(next[k]) !== String(t.recurrence[k]))) { t.recurrence = next; changed = true; }
  });
  return changed;
},
_syncSeriesSchedule(seriesId) {
  if (!seriesId) return false;
  const m = this.state.transactions.filter(t => t.recurrence && t.recurrence.seriesId === seriesId);
  const s = this._scheduleOf(m);
  return s ? this._stampSchedule(m, s) : false;
},
// UPDATE_TRANSACTION + UPDATE_TRANSFER: a missing value is the series'; 'Only this' never reschedules (D-U3-2a)
_resolveSeriesRec(rec, sched, scoped) {
  const out = { ...rec };
  ['endDate', 'interval', 'frequency'].forEach(k => { if (sched[k] != null && (out[k] == null || !scoped)) out[k] = sched[k]; });
  return out;
},
_healSeriesSchedules() { // boot + restore; metadata only, no updatedAt bump; true = caller saves
  const by = {};
  this.state.transactions.forEach(t => { const sid = t.recurrence && t.recurrence.seriesId; if (sid) (by[sid] = by[sid] || []).push(t); });
  let healed = false;
  Object.values(by).forEach(m => { const s = this._scheduleOf(m); if (s && this._stampSchedule(m, s)) healed = true; });
  return healed;
},

// init :460-461
this._healRecurrenceGenerators();
if (this._healSeriesSchedules()) window.StackdDB.save('transactions', this.state.transactions); // 1.0.2 (BUG-26)
this._processRecurringTransactions();

// UPDATE_TRANSACTION :1390-1411
const existingRec = existingTx.recurrence || null;
const sched = existingRec && existingRec.seriesId ? this.getSeriesSchedule(existingRec.seriesId) : null; // before any mutation
const scoped = !!(payload.updateFuture || payload.updateAll);
if (sched && updatePayload.recurrence) updatePayload.recurrence = this._resolveSeriesRec(updatePayload.recurrence, sched, scoped);
// ... v0.67 merge + clamp unchanged ...
const scheduleChanged = !!(updatePayload.recurrence && existingRec && ['endDate', 'interval', 'frequency']
  .some(k => String(updatePayload.recurrence[k]) !== String((sched || existingRec)[k])));
// regenerate :1525-1527
if (updatedTx && updatedTx.recurrence && !recurrenceRemoved) {
  // 1.0.2 (BUG-26): the re-armed member never ends before its own date
  if (updatedTx.recurrence.endDate && updatedTx.recurrence.endDate < updatedTx.date) updatedTx.recurrence.endDate = updatedTx.date;
  updatedTx.recurrence.nextDate = this._calculateNextRecurrenceDate(updatedTx.date, updatedTx.recurrence.interval, updatedTx.recurrence.frequency);
}
// :1543, before _sortTransactions/save
if (seriesId) this._syncSeriesSchedule(seriesId);

// UPDATE_TRANSFER :1635-1643
const schedT = existingRecT && existingRecT.seriesId ? this.getSeriesSchedule(existingRecT.seriesId) : null;
const scopedT = !!(payload.updateFuture || payload.updateAll);
const rec = (schedT && payload.recurrence) ? this._resolveSeriesRec(payload.recurrence, schedT, scopedT) : payload.recurrence;
const scheduleChanged = !!(rec && existingRecT && ['endDate', 'interval', 'frequency']
  .some(k => String(rec[k]) !== String((schedT || existingRecT)[k])));
// legRecurrence :1652-1654 and memberRec :1719-1720 read rec instead of payload.recurrence
// re-arm :1749-1750
const r = { ...t.recurrence };
if (r.endDate && r.endDate < t.date) r.endDate = t.date; // 1.0.2 (BUG-26) floor
r.nextDate = this._calculateNextRecurrenceDate(t.date, r.interval, r.frequency);
t.recurrence = r;
// :1760
if (seriesId) this._syncSeriesSchedule(seriesId);

// DELETE_TRANSACTION, after the filter :1849
const cutSid = txToDelete.recurrence && txToDelete.recurrence.seriesId;
if (cutSid) {
  if (payload.deleteFuture) this._disarmSeries(cutSid); // the live tail was on/after the cut: an armed survivor is poison
  this._syncSeriesSchedule(cutSid);                     // survivors end ON their last payment
}
// DELETE_BULK_TRANSACTIONS: before the filter collect touched = series of deleted rows, cut = series of the
// targets when deleteFuture; after the filter (:1955): cut.forEach(s => this._disarmSeries(s)); touched.forEach(s => this._syncSeriesSchedule(s));
// BATCH_IMPORT_TRANSACTIONS before its save (:1979, U6's block): this._healSeriesSchedules();
// SYNC_LOAN_SERIES 'update' before its save (:2451): this._syncSeriesSchedule(loan.linkedSeriesId);

// views.js :1557-1563
const sched = (window.Store && typeof window.Store.getSeriesSchedule === 'function'
  && window.Store.getSeriesSchedule(txToEdit.recurrence.seriesId)) || txToEdit.recurrence;
initialRecurrenceEndDate = sched.endDate || '';
initialRecurrenceInterval = sched.interval || '1';
initialRecurrenceFreq = sched.frequency || 'months';

// views.js after :2254 (editTx replaces txToEditCurrent at :2279-2281)
const editTx = isEditSave ? window.Store.getState().transactions.find(t => t.id === targetId) : null;
const editRec = editTx && editTx.recurrence;
const sched = editRec ? ((typeof window.Store.getSeriesSchedule === 'function' && window.Store.getSeriesSchedule(editRec.seriesId))
  || { ...editRec, lastDate: editTx.date }) : null;
const scheduleChanged = !!(sched && recurrenceData && (recurrenceData.endDate !== sched.endDate ||
  String(recurrenceData.interval) !== String(sched.interval) || recurrenceData.frequency !== sched.frequency));
// :2257 — 1.0.2 (BUG-26): only a window the user set; an untouched End Date on a series member never blocks
if (recurrenceData && recurrenceData.endDate && recurrenceData.endDate < date && (!sched || scheduleChanged)) { /* inline error, unchanged */ }

// doDispatch(scope), first lines — D-U3-5a, future/all only (local-noon YMD math)
let rec = recurrenceData;
if (rec && sched && !scheduleChanged && scope !== 'only' && date > editTx.date) {
  const noon = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d, 12); };
  const days = Math.round((noon(date) - noon(editTx.date)) / 86400000);
  const e = noon(sched.lastDate); e.setDate(e.getDate() + days);
  const shifted = `${e.getFullYear()}-${String(e.getMonth() + 1).padStart(2, '0')}-${String(e.getDate()).padStart(2, '0')}`;
  if (shifted > rec.endDate) rec = { ...rec, endDate: shifted }; // the store's 60-month clamp still applies
}
// recurrence: rec at :2313 (UPDATE_TRANSFER), :2333-2339 (conversion), :2382 (UPDATE_TRANSACTION)

// :2422 RecurringUpdateModal.show({ dateChanged, recurrenceRemoved, scheduleChanged, paidNote, onSelection })
// components.js :2998 destructure scheduleChanged; :3042 'Only this' sub =
//   recurrenceRemoved ? 'recUpdate.onlyThisSubUnlink' : scheduleChanged ? 'recUpdate.onlyThisSubSchedule' : 'recUpdate.onlyThisSub'
```

**Data repair.** _healSeriesSchedules() runs in Store.init between _healRecurrenceGenerators() and _processRecurringTransactions(), and saves only when it healed something. It runs again inside BATCH_IMPORT_TRANSACTIONS, so a pre-1.0.2 backup is healed when it is restored, not at the next boot.

It groups members by seriesId in one O(T) pass and rewrites only endDate, interval and frequency:
- a live series gets the armed member's values;
- a stopped series gets its last payment's date as the end.

It never adds, removes or re-arms a row. It never touches an amount, a date or the paid flag, and it does not bump updatedAt. Balances, forecasts and budgets therefore cannot move. The visible effects are:
- the form's End Date;
- the per-row EndDate, Interval and Frequency columns of a CSV export.

Residual case: an unarmed series from a very old backup with no NextDate column now ends on its last payment. A later 'future' date edit then rebuilds only up to that end, plus the D-U3-5a shift.

Payments the bug already brought back cannot be told apart from real ones, so they are not repaired. Users remove them with Delete → 'This and future'.

**Tests (each fails on the current code).**

- store (new tests/unit/recurringSeriesSchedule.test.js, recurrenceEditing harness, clock pinned at noon): StreamFlix 12.99 monthly 2026-10-20 → 2031-10-20 (61). Shorten from the Jan 2027 member to 2027-06-30 (updateFuture), then Dec amount 13.99 via formEditPayload (its own copy, now stamped) + updateFuture → 9 members, last 2027-06-20, Dec–Jun at 13.99, every member endDate 2027-06-30, exactly 1 armed. Fails today: 61.
- store: the same flow with updateAll → 9 members. Fails today: 61.
- store (restore): BATCH_IMPORT_TRANSACTIONS of a stopped 4-member series whose rows carry endDate 2031-10-20 (pre-1.0.2 backup shape) → right after the dispatch every member's endDate is the last member's date. Fails today.
- store: Rent 2026-10-01 → 2027-09-01 (12). DELETE_TRANSACTION deleteFuture from 2027-07-01 → 9 left, every endDate 2027-06-01, none armed. Then 2027-03-01 → 2027-03-05 via formEditPayload + updateFuture → nothing dated after 2027-06-01, count <= 9. Fails today: Jul 5 / Aug 5 return.
- store: tracked loan (48 from 2026-10-03, clock 2026-10-03) → DELETE_LOAN {deleteFuturePayments:true} → kept member's endDate equals its date. Move it to 2026-10-04 (own end) + updateFuture → exactly 1 member, endDate 2026-10-04 (store floor). Fails today: 47.
- store: Gym monthly on the 12th, recurrence:null + updateFuture from Jan → survivors end on the Dec payment; then Nov → 14th + updateFuture → no member in Jan 2027 or later. Fails today: Jan 14 – Aug 14 return.
- store: recurring transfer Auto-save, 12 pairs. UPDATE_TRANSFER from the 6th pair with an endDate on/after its date and before the 7th pair's date (updateFuture) → 6 pairs. Then UPDATE_TRANSFER updateAll amount edit from the 2nd pair (own copy) → still 6 pairs, both legs of every pair carry the new end, exactly 1 armed leg and it is an expense. Fails today: 12 pairs.
- store: DELETE_BULK_TRANSACTIONS {ids:[jul], deleteFuture:true} → survivors end on their last payment, none armed. Fails today: old end kept.
- store: a stray armed PAST member (poison) survives a deleteFuture → it is disarmed and nothing regenerates. Fails today: the deleted months come back.
- store (D-U3-2a): 'only' with a changed endDate on a mid member leaves every member on the series end; 'only' on the armed tail with a LONGER end does not grow the series. Fails today.
- store guard: 12-payment series ending on its last payment, last moved +5 days with 'only' → count unchanged, series end unchanged, no generation; a later updateFuture amount edit from the 3rd member keeps the count.
- boot (stored JSON + executeFile('store.js') + init, as recurrenceEditing.test.js:313): a stopped series with later ends and a live series whose past members carry another end → after init every member carries the schedule; ids, dates, amounts and balances unchanged. Fails today.
- view (new tests/unit/recurringSeriesForm.test.js, formValidation harness): after the StreamFlix shorten, poke Dec's own endDate to 2031-10-20 (no reboot), render AddTransactionView {id: dec.id} → #tx-recurrence-end-date is 2027-06-30; change only #tx-amount to 13.99, save, click #ru-this-future → 9 members. Fails today: 2031-10-20 and 61.
- view: after a deleteFuture that keeps one payment, set #tx-date to the next day with End Date untouched → no #tx-recurrence-end-date-error; #ru-this-future → 1 member whose End Date re-renders as the moved date. Fails today.
- view (D-U3-5a): Rent stopped at 2027-06-01, open 2027-03-01, date 2027-03-05, End Date untouched, #ru-this-future → Mar–Jun on the 5th, nothing in Jul/Aug 2027. Fails today.
- view (review): live 12-payment series ending on its last payment; move the last payment +5 days with #ru-only-this, reopen, change only #tx-amount, save → no #tx-recurrence-end-date-error and #recurring-update-modal opens. Fails today (the first move is refused).
- view guard (accepted 60-month limit): StreamFlix 2026-10-20 → 2031-10-20 (61). Jan 20 → Feb 2 with #ru-this-future → 60 payments, last 2031-10-02; from a fresh setup, Jan 20 → Jan 25 → 61, last 2031-10-25.
- e2e (tests/e2e/recurring_edit_scope.spec.js, written blind): StreamFlix via the UI — shorten from Jan with 'This and future', reopen Dec (End Date shows 2027-06-30), amount 13.99 with 'This and future' → 9 members after reload. Fails today.
- update tests/unit/loanSyncInPlace.test.js:291-302: line 302 now expects past members to carry the series end sim(shorter).lastPaymentDate; the title drops 'even when past payments carry a later end'. The plan assertions (endDate 2028-07-01, addCount 8) stay.

**New i18n keys (×5).** `recUpdate.onlyThisSubSchedule (D-U3-2a). en 'Your other changes apply to this one only; the series keeps its end date and frequency' | fr 'Vos autres modifications ne s’appliquent qu’à celle-ci ; la série garde sa date de fin et sa fréquence' | it 'Le altre modifiche valgono solo per questo; la serie mantiene data di fine e frequenza' | es 'Los demás cambios solo se aplican a este; la serie mantiene su fecha de fin y su frecuencia' | pt 'As outras alterações aplicam-se só a este; a série mantém a data de fim e a frequência'`

**Risks.** - **Rejected on purpose:**
  - disarming a tail past its end;
  - pre-filling the latest endDate;
  - raising the end or re-arming on an 'Only this' move.
- **'Only this' move past a live series' end:** the payment is allowed and sits after the series end. Generation ignores it (:754-757). The form no longer blocks it, and the loan sync lifts the end to its tail (:4151).
- **60-month cap (accepted limit, 1.0.1 BUG-16 cap stays global):** _clampRecurrenceEndDate counts months (:646-661). On a series at the 5-year cap, which is the default End Date, a 'This and future' move across a month boundary still drops the last payment, as F31 does today. D-U3-5a keeps the count only below the cap; a test pins this.
- **Past members get interval/frequency stamped:** after a months → weeks change with 'future', earlier payments say 'weeks'. This is metadata only and shows up only in the CSV columns.
- **Single delete of the armed last payment:** the series stops and its end becomes the previous payment's date, so a later 'future' date edit no longer brings the deleted payment back.
- **'future' date edit on a stopped series:** it re-arms a dormant tail. The store floor keeps that tail's end on or after its date.
- **Loan sync:** counts and amounts are unchanged. For a stopped chain, curEnd (:3910) now equals the last payment, so the varies wording (:3988) reads up to that payment. Only loanSyncInPlace.test.js:302 flips.
- **DELETE_LOAN / SYNC 'finish':** both get the disarm and stamp through the nested DELETE_TRANSACTION. Their own blocks (2414-2424, 2484) become no-ops and are left as they are.
- **Cross-tab old-code writers:** they can leave outdated copies until the next boot. This is harmless, because the form and the store both read getSeriesSchedule.
- **Keep UPDATE_TRANSACTION and UPDATE_TRANSFER in sync:** both use _resolveSeriesRec, the floor and _syncSeriesSchedule.
- **Overlaps:**
  - U8 (UPDATE_TRANSFER 1643-1684, 1707);
  - U2 (views.js 2243-2253 end default, 2209-2223; store insert before 741);
  - U7 (doDispatch wrapped at 2298);
  - U6 (BATCH_IMPORT 1969-1982, init);
  - U5 (init).
- **Performance:** getSeriesSchedule is O(T) per form render and per series edit.

### BUG-27 — Changing an unpaid series member's amount with 'This and future' or 'All' un-pays the series _(gate, effort S)_

**Root cause.** Confirmed. Two pieces combine.

**The form.** `const isPaidPayload = paidChecked ? (wasUnpaid ? true : undefined) : false;` (views.js:2293-2295) sends isPaid:false whenever the switch is off, including a switch only pre-filled from an unpaid record (1523). It goes out with updateFuture/updateAll on UPDATE_TRANSACTION (2385) and UPDATE_TRANSFER (2315).

**The store.**
- UPDATE_TRANSACTION's propagate() spreads updatePayload, isPaid included (1469; applied at 1496-1507).
- UPDATE_TRANSFER spreads paid explicitly (1710-1714, 'v0.82: paid propagates with future/all').

An untouched off switch therefore un-pays the whole scope. A Paid tick clears every unpaid mark in the scope.

The regenerate path follows a third rule: generated members drop isPaid (803, 832).

**Fix.** Paid state becomes per payment (D-U3-1a).

**1. Form** (2292-2295):
- isPaidFlip = (paidChecked === !wasUnpaid) ? undefined : paidChecked, for UPDATE_*. Conditionally spread at 2315 and 2385, so an untouched switch sends no isPaid key.
- isPaidNew = paidChecked ? undefined : false, for every ADD_* (2351, 2364, 2400), the regular → transfer conversion included.

**2. Store:**
- In UPDATE_TRANSACTION propagate(), delete tUpdate.isPaid next to delete tUpdate.type (1476).
- In UPDATE_TRANSFER, remove the 1710-1714 block.
- The edited payment, and both legs of the tapped pair (1685-1690), still take the flip.

**3. Scope sheet** (paidNote option):
- 'rebuild' when the edit rebuilds (dateChanged or scheduleChanged, recurrence not removed) and either Paid was flipped or a later same-series payment is unpaid → recUpdate.rebuildPaidNote (D-U3-3a, made visible).
- 'only' when only Paid was flipped → recUpdate.paidNote.

**Sketch.**

```js
// views.js :2292-2295 (txToEditCurrent === editTx, see BUG-26)
// 1.0.2 (BUG-27): an edit carries isPaid only when the user FLIPPED the switch; new rows keep its absolute state
const paidChecked = paidToggle ? paidToggle.checked : true;
const wasUnpaid = !!(txToEditCurrent && txToEditCurrent.isPaid === false);
const isPaidFlip = paidChecked === !wasUnpaid ? undefined : paidChecked; // UPDATE_*
const isPaidNew = paidChecked ? undefined : false;                       // ADD_*
const paidChanged = isPaidFlip !== undefined;
// :2315 and :2385 (replaces isPaid: isPaidPayload)
...(isPaidFlip !== undefined ? { isPaid: isPaidFlip } : {}),
// :2351, :2364, :2400
...(isPaidNew !== undefined ? { isPaid: isPaidNew } : {})

// :2420-2426
const rebuilds = (dateChanged || scheduleChanged) && !recurrenceRemoved;
const from = date < txToEditCurrent.date ? date : txToEditCurrent.date;
const unpaidAhead = rebuilds && window.Store.getState().transactions.some(t => t.recurrence && t.recurrence.seriesId === seriesId
  && t.id !== targetId && !(txToEditCurrent.transferRef && t.transferRef === txToEditCurrent.transferRef)
  && t.date >= from && t.isPaid === false);
const paidNote = rebuilds && (paidChanged || unpaidAhead) ? 'rebuild' : (paidChanged ? 'only' : null);
window.Components.RecurringUpdateModal.show({ dateChanged, recurrenceRemoved, scheduleChanged, paidNote, onSelection: ... });

// components.js :2998 + after the description <p> (:3038)
const { dateChanged = false, recurrenceRemoved = false, scheduleChanged = false, paidNote = null } = options;
${paidNote ? `<p style="color: var(--text-secondary); font-size: var(--text-xs); margin: var(--space-2) 0 0;">${window.I18n.t(paidNote === 'rebuild' ? 'recUpdate.rebuildPaidNote' : 'recUpdate.paidNote')}</p>` : ''}

// store.js UPDATE_TRANSACTION propagate, after delete tUpdate.type (:1476)
delete tUpdate.isPaid; // 1.0.2 (BUG-27): paid state is per occurrence; the edited payment still takes its flip
// store.js UPDATE_TRANSFER: remove :1710-1714, leave
// 1.0.2 (BUG-27): paid is per occurrence — only the tapped pair (above) changes
```

**Data repair.** None. There is no safe signal: a run of unpaid future payments can be deliberate, such as a paused bill.

Under D-U3-1a there is no bulk re-pay. Series that 1.0/1.0.1 already un-paid are re-marked payment by payment with the History swipe; the decision states this explicitly.

**Tests (each fails on the current code).**

- store (new tests/unit/recurringPaidScope.test.js, clock 2026-11-15 noon): Rent 900 monthly 2026-11-01 → 2027-10-01 (12), account 3000. TOGGLE_TRANSACTION_PAID marks Dec unpaid. UPDATE_TRANSACTION {id: dec, amount: 950, isPaid: false, updateAll: true} → only Dec isPaid false, every other member has no isPaid key, getAccountBalance 2100. Fails today: all 12 unpaid, 3000.
- store: the same with updateFuture → Jan–Oct 2027 paid; January's filtered transactions count the 950 rent. Fails today: 11 unpaid.
- store: Feb and Apr unpaid. UPDATE_TRANSACTION {id: feb, isPaid: true, updateFuture: true} → Feb paid, Apr still unpaid. Fails today: Apr cleared.
- store: recurring transfer (Auto-save 200, 12 pairs), Dec pair unpaid. UPDATE_TRANSFER {transferRef: dec, amount: 250, isPaid: false, updateFuture: true} → only the Dec pair's 2 legs unpaid. Fails today: 22 legs.
- view (formValidation harness): unpaid 1 Dec rent, render AddTransactionView {id}, change only #tx-amount to 950, save, click #ru-all-series → only Dec unpaid, Nov paid. A Store.dispatch spy shows 'isPaid' in the UPDATE_TRANSACTION payload is false. Fails today.
- view: on a series member flip #tx-is-paid only, save → #recurring-update-modal shows the recUpdate.paidNote text and not rebuildPaidNote. Fails today: no note.
- view: flip #tx-is-paid AND change #tx-date, save → the sheet shows recUpdate.rebuildPaidNote, not paidNote. Untouched switch + date change with a later unpaid member → rebuildPaidNote. Untouched switch + amount-only edit → no note. Fails today.
- guard (passes today): an unpaid one-off expense converted to a transfer with the switch untouched → both new legs isPaid false (isPaidNew).
- guard: unpaidTransactionFiltering.test.js:181 (UPDATE_TRANSFER mirrors isPaid on both legs of the tapped pair) unchanged.

**New i18n keys (×5).** `recUpdate.paidNote (D-U3-1a). en 'Paid status changes on this transaction only.' | fr 'Le statut payé ne change que pour cette opération.' | it 'Lo stato di pagamento cambia solo per questo movimento.' | es 'El estado de pago solo cambia en este movimiento.' | pt 'O estado de pagamento muda apenas neste movimento.'`, `recUpdate.rebuildPaidNote (D-U3-3a). en 'If you apply this to upcoming transactions, they are rebuilt and start as paid.' | fr 'Si vous l’appliquez aux opérations suivantes, elles sont recréées et comptées comme payées.' | it 'Se lo applichi ai movimenti futuri, vengono ricreati e risultano pagati.' | es 'Si lo aplicas a los movimientos futuros, se vuelven a crear como pagados.' | pt 'Se aplicar aos movimentos futuros, estes são recriados como pagos.'`

**Risks.** - **Reverses v0.82:** refactor-plan §4.3 says isPaid carries 'future/all propagation included'. Needs owner sign-off (D-U3-1) and a doc note from the integrator.
- **No bulk re-pay** for series already poisoned; accepted in D-U3-1.
- **ADD paths must use isPaidNew;** the flip-only value would drop an unpaid state on conversion.
- **Rebuilt payments still lose unpaid marks (D-U3-3a),** now announced by rebuildPaidNote.
- **Hard-coded English description:** components.js:3006-3010 stays as it is (report T4-4).
- **Performance:** unpaidAhead is one O(T) scan when the sheet opens.
- **Overlaps:**
  - BUG-26 shares the propagate blocks (same unit);
  - U8 edits the transfer dispatch block (views.js 2305-2365) and UPDATE_TRANSFER 1707, next to the removed 1710-1714;
  - U7 wraps doDispatch.

### BUG-74 — "Update linked payments" silently resets a loan payment the user edited by hand _(rider, recommended, effort M)_

**Root cause.** Confirmed, new in 1.0.1. The plan and the apply step compare a payment's current amount only with the NEW instalment:
- _loanSeriesAmountChanges: `if (oldC === toC || fromC === toC) return;` (store.js:4104; comment 4086-4090).
- The SYNC_LOAN_SERIES re-price loop: the same test at 2446.

A rate change touches every month, so every hand-edited payment is re-priced. The plan has no list of such payments, so `count` includes them and the sheet (views.js:5086-5093) cannot name them.

No stored data says which payment was edited by hand. Guessing it from amounts fails on three cases the review found:
- the months _moveSeriesEnd clones from a final-stamped tail (:4157-4172, :1326);
- Italian schedules that were partly re-priced;
- declined syncs.

**Fix.** Record the hand edit explicitly; never infer it.

1. **Mark.** UPDATE_TRANSACTION and UPDATE_TRANSFER set `amountEdited: true` when the amount changes:
   - with no scope flag;
   - on a member of a series that a loan names in linkedSeriesId;
   - on the edited row, or for a transfer on its expense leg (the leg getLoanFuturePayments reads).
   A scoped amount change deletes the mark, on the edited payment and on every member the amount propagates to (1493, 1707). The amount becomes the series' own again, which BUG-07 re-prices and names. Generated clones drop the mark (next to :803 and :832).
2. **Rule.** _loanSeriesAmountChanges returns {changes, custom}. A payment goes into custom when all of these hold:
   - it has the mark;
   - its month's instalment changed;
   - its amount differs from that month's old instalment.
   A payment typed back to the regular amount is re-priced.
3. **Plan.** getLoanSeriesSyncPlan leaves custom out of changes, so it is also out of count, varies and the prompt. Only when custom is non-empty does it add customIds, customCount, customDate and customC. A plan with nothing but custom payments returns null.
4. **Apply.** SYNC 'update' keeps today's loop and skips plan.customIds. The plan is recomputed at 2410, before the move, so plan and apply share one decision. Each re-priced payment loses its mark.
5. **Sheet.** _offerSeriesSync adds a debt.sync.customKept note after `if (!lead) return;` (5136), so the note never opens a sheet on its own.

The mark is not exported. A restore, or a payment edited before 1.0.2, behaves as in 1.0.1.

**Sketch.**

```js
// store.js UPDATE_TRANSACTION, after the target update (:1421)
// 1.0.2 (BUG-74): an 'Only this' amount change on a loan's linked payment is a hand edit — the loan
// sync keeps it. A scoped amount change makes the amount the series' own again.
const amountMoved = absoluteAmount !== undefined &&
  Math.round(absoluteAmount * 100) !== Math.round(Math.abs(Number(existingTx.amount)) * 100);
if (amountMoved && seriesId) {
  const edited = this.state.transactions[index];
  if (scoped) delete edited.amountEdited;
  else if ((this.state.loans || []).some(l => l.linkedSeriesId === seriesId)) edited.amountEdited = true;
}
// propagate (:1493)
const next = { ...t, ...tUpdate, updatedAt: new Date().toISOString() };
if (tUpdate.amount !== undefined) delete next.amountEdited;
this.state.transactions[i] = next;

// UPDATE_TRANSFER: const oldAmountC = Math.round(Math.abs(Number(items[0].amount)) * 100); before :1667; after :1693
if (seriesId && payload.amount !== undefined && Math.round(Math.abs(payload.amount) * 100) !== oldAmountC) {
  const exp = this.state.transactions.find(t => t.transferRef === payload.transferRef && t.type === 'expense');
  if (exp && scopedT) delete exp.amountEdited;
  else if (exp && (this.state.loans || []).some(l => l.linkedSeriesId === seriesId)) exp.amountEdited = true;
}
// propagate (:1707, next to U8's per-leg line): if (payload.amount !== undefined) delete t.amountEdited;

// _processRecurringTransactions (:803, :832)
delete generatedTx.amountEdited; // 1.0.2 (BUG-74): a clone is not a hand edit
delete cpGen.amountEdited;

// _loanSeriesAmountChanges (:4097) — returns { changes, custom }
const changes = [], custom = [];
members.forEach(m => {
  const toC = this._loanMonthRegularC(config, newSim, m.date);
  if (toC == null) return;
  const oldC = this._loanMonthRegularC(prevConfig, oldSim, m.date);
  const fromC = Math.round(Math.abs(Number(m.amount)) * 100);
  if (oldC === toC || fromC === toC) return;
  // 1.0.2 (BUG-74): a payment the user set by hand keeps it, unless it is back at its month's old instalment.
  // Never inferred from amounts: clones, Italian schedules and declined syncs carry no mark.
  (m.amountEdited === true && fromC !== oldC ? custom : changes).push({ id: m.id, date: m.date, fromC, toC });
});
return { changes, custom };

// getLoanSeriesSyncPlan :3934 / after :4048
const { changes, custom } = this._loanSeriesAmountChanges(loan.config, prevConfig, newSim, oldSim, future);
if (custom.length) {
  plan.customIds = custom.map(c => c.id);
  plan.customCount = custom.length; plan.customDate = custom[0].date; plan.customC = custom[0].fromC;
}

// SYNC_LOAN_SERIES 'update' :2440-2450
const keep = new Set(plan.customIds || []); // decided once, on the plan (pre-move)
this.getLoanFuturePayments(loan).forEach(m => {
  if (keep.has(m.id)) return;
  const toC = this._loanMonthRegularC(loan.config, newSim, m.date);
  if (toC == null) return;
  const oldC = this._loanMonthRegularC(payload.prevConfig, oldSim, m.date);
  if (oldC === toC || Math.round(Math.abs(Number(m.amount)) * 100) === toC) return;
  delete m.amountEdited; // back on the schedule
  this._setLoanMemberAmount(m, toC, now);
  repriced = true;
});

// views.js _offerSeriesSync, after if (!lead) return; (:5136)
if (plan.customCount) {
  lead += note(window.I18n.t('debt.sync.customKept', { count: plan.customCount,
    date: S.fmtDate(plan.customDate), amount: S.fmtC(plan.customC) }));
}
```

**Data repair.** None.
- Amounts already reset by a 1.0.1 sync cannot be recovered.
- Payments hand-edited before 1.0.2 carry no mark, and there is no safe signal to backfill one, so they are re-priced as in 1.0.1.

**Tests (each fails on the current code).**

- loanSyncReview.test.js ('the payments follow the schedule month by month'): trackKitchen(), Dec set to 300 with UPDATE_TRANSACTION {id, amount: 300} (no scope) → dec.amountEdited === true. Edit to {...KITCHEN, annualRate: 9} → plan.count === future().length - 1, customCount 1, customDate '2026-12-01', customIds [dec.id]. After SYNC Dec is still 30000 and every other future payment equals regularOf(cfg). Fails today.
- loanSyncReview.test.js: the same setup via openSyncSheet → the body names 01/12/26 and $300.00 (customKept.one). Fails today.
- guard against the review's blocker: trackKitchen(), Dec 300 'only', duration 24 → 30 → Dec stays 30000; every other future payment, including the 6 added Aug 2028 – Jan 2029, equals regularOf(cfg); 1 armed. Fails today on Dec, and fails under the draft's heuristic on the added months.
- mark lifecycle: (a) Dec 300 'only', then Nov amount 280 with updateFuture → Dec is 280 and unmarked, and a rate change re-prices it; (b) tail 2028-07-01 set to 300 'only', duration 30 → the tail stays 300, the added months carry no mark and equal regularOf(cfg); (c) Dec 300 'only', then 263.23 'only' → a rate change re-prices Dec and clears its mark.
- guard (Italian, second sync): Italian tracked at its first instalment; rate change from 2027-06 synced; then the change moved to 2026-11 → plan is not null and the Nov 2026 – May 2027 payments equal the new schedule. Passes today; failed under the draft's heuristic.
- view: an 'Only this' amount change through AddTransactionView (#ru-only-this) on a loan-linked payment sets amountEdited. The same edit on a series no loan links sets nothing.
- guards unchanged: loanSyncReview.test.js:344; loanSyncInPlace.test.js:109-121, :152, :237, :423; the exact plan toEqual tests (loanLinkedPayments.test.js:332, loanSyncReview.test.js:218 — no custom keys without a mark); a series tracked at a rounded amount is still fully re-priced.
- csvRoundTrip: the export has no new column (the mark is not exported).

**New i18n keys (×5).** `debt.sync.customKept.one — en 'The {date} payment you changed by hand keeps its amount ({amount}).' | fr 'L’échéance du {date}, modifiée à la main, garde son montant ({amount}).' | it 'La rata del {date}, modificata a mano, mantiene il suo importo ({amount}).' | es 'La cuota del {date}, que cambiaste a mano, mantiene su importe ({amount}).' | pt 'A prestação de {date}, alterada manualmente, mantém o valor ({amount}).'`, `debt.sync.customKept.other — en '{count} payments you changed by hand keep their amounts.' | fr '{count} échéances modifiées à la main gardent leur montant.' | it '{count} rate modificate a mano mantengono il loro importo.' | es '{count} cuotas que cambiaste a mano mantienen su importe.' | pt '{count} prestações alteradas manualmente mantêm o seu valor.'`

**Risks.** - **New stored field:** amountEdited on transaction rows, loan-linked series only, never exported. A CSV restore drops it, so those payments are re-priced as in 1.0.1.
- **A scoped edit overwrites hand-set amounts:** a 'This and future'/'All' edit from an earlier payment already overwrites later amounts (existing propagate behaviour) and now also clears their marks.
- **'finish' mode** still deletes every future payment, marked ones included, because the loan ends before them.
- **_loanSeriesAmountChanges' return shape changes.** Its only caller is store.js:3934, and no test calls it directly.
- **Plan keys** are added only when a kept payment exists, so the exact plan toEqual tests are unaffected.
- **Transfer-converted series:** only the expense leg is marked, because getLoanFuturePayments reads only that leg.
- **Overlaps:**
  - U8 edits _setLoanMemberAmount (4193-4199) and UPDATE_TRANSFER 1669/1677/1707. The mark is cleared in the SYNC loop to stay out of _setLoanMemberAmount, and at 1707 it sits on its own guarded line.
  - SYNC_LOAN_SERIES, getLoanSeriesSyncPlan and _offerSeriesSync belong to no other unit.

### U3 decisions

- **D-U3-1** BUG-27: when the user flips Paid on a recurring payment and picks 'This and future' or 'All', should the paid state spread to the other payments?
  - (a) No: paid state is per payment. A flip changes only the tapped payment (both legs of a transfer), whatever the scope. An untouched switch sends nothing. The sheet says 'Paid status changes on this transaction only'. There is no bulk re-pay: series already un-paid by 1.0/1.0.1 are re-marked payment by payment with the History swipe.
  - (b) Only a deliberate flip spreads with 'This and future'/'All'; an untouched switch never does. This is the report's literal expected behaviour. The sheet names the spread (2 keys: paid/unpaid). The regenerate path must also stamp the flip on rebuilt payments to stay consistent (about 10 more store lines). It keeps a one-tap bulk repair.
  - (c) Form fix only: an untouched switch never sends anything, and a deliberate flip still spreads silently, as in v0.82.
  - _Recommended:_ (a) Paid state is per payment: a flip changes only the tapped payment whatever the scope, an untouched switch sends nothing, the sheet says so, and poisoned series are repaired payment by payment with the swipe. — The report allows either option. Its expected line describes (b), and its fix list calls per-occurrence paid state 'better still'.

(a) is one rule everywhere: the v0.82 rule that generated payments never inherit paid state, applied to propagate and regenerate alike.

(b) has two costs:
- it needs extra regenerate code to stay consistent;
- a deliberate 'unpaid' spread still blanks Upcoming and the EOM forecast for up to 60 months, as refactor-plan §4.3 warns.

The cost of (a) is no one-tap repair for the few series 1.0/1.0.1 already un-paid.
- **D-U3-2** BUG-26: the user changes End Date or frequency on a recurring payment and picks 'Only this transaction'. What happens to the schedule?
  - (a) Ignored: the payment stays on the series' schedule and the other edits apply. The 'Only this' subtitle switches to 'Your other changes apply to this one only; the series keeps its end date and frequency' (1 key). The end-before-date check now runs only when the schedule was changed, so a plain 'Only this' move of the last payment past the series end is allowed and stays inert.
  - (b) Keep today's behaviour. A mid payment's copy changes and is then overwritten by the series sync, while the same edit on the last payment silently extends or shortens the whole series.
  - (c) Disable or hide 'Only this' in the scope sheet when the schedule changed (1 key for the reason).
  - _Recommended:_ (a) Ignore the schedule change under 'Only this', apply the other edits, and say so in the 'Only this' subtitle. — End date and frequency are series-level now, so applying them to one payment has no meaning. (b) behaves differently for the last payment and for the others. (c) changes the sheet's three-button layout, which tests and e2e rely on.
- **D-U3-3** BUG-27 (adjacent): a date or schedule edit with 'This and future'/'All' rebuilds the later payments. Should their manual unpaid marks carry over?
  - (a) No: rebuilt payments start paid, like every other per-payment customisation a rebuild resets (amount, note, account). The scope sheet says so: recUpdate.rebuildPaidNote appears when the edit rebuilds and Paid was flipped or a later payment is unpaid (1 key).
  - (b) Yes: carry each unpaid mark to the rebuilt payment in the same month (monthly/yearly) or the same position (daily/weekly). About 25 more lines in both UPDATE cases, plus tests; no note needed.
  - (c) No, and say nothing (the draft): rebuilt payments start paid silently.
  - _Recommended:_ (a) Rebuilt payments start paid, and the scope sheet says so with recUpdate.rebuildPaidNote. — A rebuild already resets every per-payment customisation of the payments it replaces. Carrying only paid state would need a fuzzy month/position mapping. The report's complaint was three silent rules; the note makes the remaining rule visible where it happens, and recUpdate.paidNote no longer contradicts it.
- **D-U3-4** BUG-74: should this unit include the rider, and how should 'Update linked payments' treat a payment the user changed by hand?
  - (a) Include it. An 'Only this' amount change on a loan-linked payment stores an amountEdited mark (not exported). The sync keeps marked payments, leaves them out of the count and names them in one note line (2 keys).
  - (b) Include it with the same mark, but keep the payments silently (store only, no keys).
  - (c) Include it with the mark plus an opt-in checkbox 'Also reset N payments you changed' (unticked; new SYNC payload flag; 2-3 more keys).
  - (d) Do not include it in 1.0.2.
  - _Recommended:_ (a) Include it: mark 'Only this' amount changes on loan-linked payments, keep those payments on sync, leave them out of the count and name them in one note. — It is a 1.0.1 regression of BUG-07. An explicit mark is the only rule that cannot misfire on the cases the review found: the cent-adjusted final cloned by an extension, Italian schedules partly re-priced, and a declined sync. Plan and apply read the same ids. Naming the kept payment meets the tester's expectation without a new control; (c) adds UI for an edge case. Payments edited before 1.0.2, or restored from CSV, behave as in 1.0.1.
- **D-U3-5** Fold a light fix for BUG-52 (F31: moving a payment later with 'This and future' drops the series' last payment) into this unit's form change?
  - (a) Yes. For 'This and future'/'All' only, when End Date is untouched and the payment moves later, the form moves the series end by the same number of days (about 10 lines in doDispatch). This keeps the remaining payments, except on a series at the 60-month cap (most series with the default 5-year end): there, a move across a month boundary still drops the last payment, because the window is fixed. 'Only this' never moves the end. The BUG-26 Rent retest shows Mar–Jun on the 5th.
  - (b) No. Only the store floor applies (a rebuilt payment never ends before its own date), so moving the last kept payment of a stopped series later works. The BUG-26 Rent retest then shows Mar–May on the 5th, with June dropped as F31 does today.
  - _Recommended:_ (a) Yes: for 'This and future'/'All' with an untouched End Date, move the series end by the same number of days, and accept that a series at the 60-month cap still loses its last payment. — Both options keep the store floor, and no other unit owns BUG-52. Without (a), the report's BUG-26 retest (Rent Mar–Jun moved to the 5th) still fails, now on F31. The cap is the 1.0.1 BUG-16 global window. A guard test documents and pins the case (a) cannot help.
- **D-U3-6** BUG-26: what End Date does a stopped series store and show (after 'Delete → This and future', Recurrent off, a loan deleted with its payments)?
  - (a) The date of its last kept payment, e.g. 01/06/2027 for the Rent and 03/10/2026 for the loan.
  - (b) The day before the next payment would have been due, e.g. 30/06/2027, or 02/11/2026 for the loan.
  - _Recommended:_ (a) The date of its last kept payment. — It is what the report expects the form to show. It matches the 1.0.1 loan 'finish' rule (store.js:2415-2424) and the loan sync's treatment of a stopped chain (effCur = tail.date). Nothing needs (b) any more: the store floor and the form's end-check rule already handle moving the last payment later.

### U3 regions owned

| File | Symbol | Lines | Change |
|---|---|---|---|
| src/store.js | Store.init — boot heal sequence | 455-461 | Between _healRecurrenceGenerators() (460) and _processRecurringTransactions() (461), add: if (this._healSeriesSchedules()) save (BUG-26). |
| src/store.js | new helpers after _healRecurrenceGenerators | insert at 740 (between 739 and 741) | Add _scheduleOf, getSeriesSchedule, _stampSchedule, _syncSeriesSchedule, _resolveSeriesRec(rec, sched, scoped) and _healSeriesSchedules (returns a boolean) (BUG-26). |
| src/store.js | _processRecurringTransactions (clone cleanup) | 798-809, 832-834 | Delete amountEdited on generatedTx and cpGen, next to the isPaid/importKey deletes (BUG-74). |
| src/store.js | dispatch UPDATE_TRANSACTION | 1336-1548 (edits at 1390-1411, after 1421, 1468-1494, 1524-1527, 1543) | - Resolve payload.recurrence against getSeriesSchedule and classify scheduleChanged against it (BUG-26). - Set or clear the amountEdited mark (BUG-74). - In propagate: delete tUpdate.isPaid (BUG-27) and clear the mark when the amount propagates (BUG-74). - Add the regenerate floor and call _syncSeriesSchedule before the save (BUG-26). |
| src/store.js | dispatch UPDATE_TRANSFER | 1624-1765 (edits at 1633-1665, 1667/1693, 1701-1727, 1744-1756, 1760) | - Resolve rec against the series; legRecurrence and memberRec read rec; add the regenerate floor and _syncSeriesSchedule (BUG-26). - Mark or clear the expense leg (BUG-74). - Clear the mark at 1707 (BUG-74). - Remove the paid spread at 1710-1714 (BUG-27). |
| src/store.js | dispatch DELETE_TRANSACTION | 1814-1854 (insert after 1849) | For a series member: _disarmSeries (deleteFuture only), then _syncSeriesSchedule. This also covers DELETE_LOAN, SYNC 'finish', DELETE_RECURRING_FUTURE and the form's conversion (BUG-26). |
| src/store.js | dispatch DELETE_BULK_TRANSACTIONS | 1916-1967 (collect at 1921-1945, apply after 1955) | Collect touched and cut series ids, disarm the cut ones, sync the touched ones, then save (BUG-26). |
| src/store.js | dispatch BATCH_IMPORT_TRANSACTIONS | 1969-1982 (one line before the save at 1979) | Call this._healSeriesSchedules() before the save. U6 owns and rewrites this block for BUG-78; this unit adds one line (BUG-26). |
| src/store.js | dispatch SYNC_LOAN_SERIES ('update' branch) | 2426-2452 (edit 2440-2451; 'finish' block 2412-2425 untouched) | - The re-price loop skips plan.customIds and clears the mark on the payments it re-prices (BUG-74). - Call _syncSeriesSchedule(loan.linkedSeriesId) before the save (BUG-26). |
| src/store.js | dispatch DELETE_LOAN | 2469-2493 | No code change; it is covered through the nested DELETE_TRANSACTION. Regression test only. |
| src/store.js | getLoanSeriesSyncPlan | 3818-4081 (JSDoc 3828; edits at 3934 and after 4048) | Destructure {changes, custom}. When custom is non-empty, add customIds, customCount, customDate and customC (BUG-74). |
| src/store.js | _loanSeriesAmountChanges | 4083-4108 | Use the mark-based rule and return {changes, custom}; update the JSDoc (BUG-74). |
| src/views.js | AddTransactionView.render — recurrence pre-fill | 1557-1563 | Pre-fill End Date, interval and frequency from Store.getSeriesSchedule (guarded), with a fallback to the member's copy (BUG-26). |
| src/views.js | AddTransactionView save handler — schedule, end check, paid split | 2235-2295 (insert after 2254; condition at 2256-2261; dedupe 2279-2281; 2292-2295) | - Compute editTx, sched and scheduleChanged (BUG-26). - Run the end-before-date check only for a non-series save or a changed schedule (BUG-26). - Split isPaidFlip and isPaidNew, and add paidChanged (BUG-27). |
| src/views.js | AddTransactionView save handler — doDispatch | 2298-2405 (top of doDispatch; 2313, 2315, 2333-2339, 2351, 2364, 2382, 2385, 2400) | - D-U3-5a end shift for future/all, and recurrence: rec (BUG-26). - Conditional isPaid spreads: flip on UPDATE_*, new on ADD_* (BUG-27). |
| src/views.js | AddTransactionView save handler — scope sheet call | 2420-2426 | Pass scheduleChanged (BUG-26) and paidNote ('rebuild' \| 'only' \| null, computed with unpaidAhead) (BUG-27). |
| src/views.js | DebtResultsView._offerSeriesSync | 5047-5151 (insert between 5136 and 5137) | Add the debt.sync.customKept note after `if (!lead) return;` (BUG-74). |
| src/components.js | RecurringUpdateModal.show | 2994-3044 (2994 comment, 2998 destructure, after 3038, 3042) | - Accept scheduleChanged and paidNote. - The 'Only this' subtitle becomes recUpdate.onlyThisSubSchedule when the schedule changed. - Add one note paragraph: recUpdate.rebuildPaidNote or recUpdate.paidNote. - The hard-coded description (3006-3010) stays as it is. |
| src/i18n/en.js, fr.js, it.js, es.js, pt.js | dictionary tail | before `};` (en 1346; fr/it/es/pt 1325) | Add a 1.0.2 (BUG-26/27/74) block with recUpdate.onlyThisSubSchedule, recUpdate.paidNote, recUpdate.rebuildPaidNote, debt.sync.customKept.one and debt.sync.customKept.other. |
| tests/unit/recurringSeriesSchedule.test.js (new), tests/unit/recurringPaidScope.test.js (new), tests/unit/recurringSeriesForm.test.js (new) | BUG-26/27 store, restore, boot and view tests | new files | Regression tests listed per bug; the guards pass today. |
| tests/unit/loanSyncReview.test.js | 'the payments follow the schedule month by month' describe | 293-370 (add after 358) | BUG-74: regression tests, the extension guard, mark lifecycle and the Italian second-sync guard. |
| tests/unit/loanSyncInPlace.test.js | review 4 'a longer end grows the chain even when past payments carry a later end' | 291-302 | Line 302 now expects the series end on past members; reword the title. |
| tests/e2e/recurring_edit_scope.spec.js | new test | append | StreamFlix shorten followed by an amount edit through the UI. Written blind; verified at integration. |

**Dependencies.** **No hard dependency on another unit.** BUG-26 and BUG-27 share the UPDATE_TRANSACTION and UPDATE_TRANSFER blocks inside this unit, and BUG-74 touches the same two blocks for the mark. BUG-52 (F31) is not a gate bug, and no other unit owns it, so it stays here as D-U3-5.

**Soft overlaps:**
- **U2:**
  - store.js 458-461 (init heal) and its _healConvertedOpeningBalances, which is inserted before 741 — the same spot as this unit's helpers at 740. Merge both helper blocks.
  - views.js 2243-2253 (end default) and 2209-2223 (validation), adjacent to the insert after 2254.
  - UPDATE_TRANSACTION head 1336-1347.
- **U5 and U6:** each adds one boot heal next to 460. Order is free, as long as _healSeriesSchedules runs after _healRecurrenceGenerators and before _processRecurringTransactions.
- **U6:** owns BATCH_IMPORT_TRANSACTIONS 1969-1982. This unit adds one line, `this._healSeriesSchedules();`, before its save.
- **U7:**
  - wraps doDispatch at 2298 in Store.batch; this unit's end shift sits inside doDispatch;
  - renames dispatch to _reduce; the nested DELETE_TRANSACTION calls from DELETE_LOAN and SYNC 'finish' must still run the new disarm and sync.
- **U8:**
  - UPDATE_TRANSFER 1643-1684 and line 1707. The mark clear at 1707 goes on its own guarded line.
  - views.js transfer dispatches 2305-2365, the same lines as the isPaid spreads.
  - views.js 1519-1552, next to the pre-fill at 1557.
  - _setLoanMemberAmount, which this unit deliberately leaves alone.
- **U9:** views.js 2404 (doDispatch tail), adjacent.

**Integrator (not this unit):**
- Bump ?v= together for store.js, views.js, components.js and i18n/*.js. They are co-dependent through getSeriesSchedule, the modal options and the new keys.
- Update the CLAUDE.md 'Recurring transactions' section with the 1.0.2 rules:
  - endDate, interval and frequency are series-level; the armed member is the authority, and a stopped series ends on its last payment;
  - _syncSeriesSchedule runs after every UPDATE/DELETE of a member and after SYNC 'update';
  - _healSeriesSchedules runs at boot and after BATCH_IMPORT_TRANSACTIONS;
  - the form pre-fills from getSeriesSchedule;
  - 'Only this' never changes the schedule, and an untouched End Date never blocks a series edit;
  - a regenerated member never ends before its own date;
  - a later 'future'/'all' move shifts the end by the same days, except at the 60-month cap;
  - paid state is per occurrence and never spread by a scope; rebuilt payments start paid, and the sheet says so.
- Add to the CLAUDE.md Loans section: amountEdited marks an 'Only this' amount change on a loan-linked payment; SYNC keeps it through plan.customIds; clones, scoped amount edits and a re-price drop it; it is not exported.
- Add a note to docs/refactor-plan.md §4.3 that paid no longer propagates.
- Merge the dictionary key blocks with merge=union.

**Existing tests affected.** **Existing test that must change:** tests/unit/loanSyncInPlace.test.js:291-302 (review 4).
- Line 302 asserts that a past member still carries the stale 2028-07-01 after a future-scope shorten, which is exactly the BUG-26 state.
- It now expects sim(shorter).lastPaymentDate, and the title drops 'even when past payments carry a later end'.
- Its plan assertions (endDate 2028-07-01, addCount 8) are unchanged, because the plan reads the live tail.

**Expected to pass unchanged** (checked against the code paths):
- loanSyncInPlace.test.js, all other tests. The draft's majority-amount rule would have broken :152, :237 and :423; with the mark, no payment in those tests is marked, so they run today's rule. :109-121 marks Nov, but Nov's month is untouched by that edit.
- loanSyncReview.test.js:344, and the exact plan toEqual tests (loanLinkedPayments.test.js:332, loanSyncReview.test.js:218): custom keys appear only when a payment is marked.
- recurrenceEditing.test.js, all, including the 'only' edits, the straggler and stray-armed sweeps, the 60-month clamp and the boot generator heal.
- recurringTransfers.test.js, including months → weeks: past members now say 'weeks', which nothing reads.
- recurrenceMigration.test.js: the poisoned stopped series resolves to its last member's end, which equals its copies.
- accountDeleteTransfers.test.js, bulkSelectionMode.test.js, recurrenceTypeConversion.test.js, csvRoundTrip.test.js, fullRestore.test.js.
- unpaidTransactionFiltering.test.js:181.
- formValidation.test.js:280-292: a new row, so there is no series and the end check still runs.
- e2e recurring_edit_scope.spec.js: the existing tests keep End Date untouched.

No existing test asserts isPaid propagation across a scope or opens the scope sheet in a unit test (grep-verified).

**New tests,** listed per bug. Each fails on efcac0c except the marked guards:
- tests/unit/recurringSeriesSchedule.test.js: BUG-26 store, restore and boot.
- tests/unit/recurringSeriesForm.test.js: BUG-26 and BUG-27 view tests, using the formValidation harness, including the 60-month-cap guard and the 'Only this' trap test.
- tests/unit/recurringPaidScope.test.js: BUG-27 store.
- loanSyncReview.test.js additions: BUG-74, including the extension guard against the review's blocker and the Italian second-sync guard.
- recurring_edit_scope.spec.js addition: e2e, written blind and run at integration.

i18n.test.js enforces the 5 new keys, their placeholders and the customKept plural pair in all five dictionaries. widgetsI18nGuard is unaffected.

## U4 — Local dates in aggregates

This is the final U4 design. I checked all 11 review items against efcac0c. Five pairs are duplicates (1/7, 5/8, 4/11, 6/10, 3/9). Every item is valid in substance: I accepted 8 as written and 3 in modified form (the stale-day roll, the e2e label checks and the donut drill-down).

**Verification.** I applied the whole final design to a scratch copy (scratchpad/u4f2, via patch-u4.cjs; the repo was not touched).
- Full unit suite: 103 files and 1,119 tests pass, with versionSync and nativeWiring running this time. The total includes 16 new tests.
- eslint reports nothing on store.js, components.js and main.js.
- All 16 new tests fail on efcac0c.
- Targeted mutation checks: reverting only the FilterModal hunk, or only the NAVIGATE_PERIOD roll, fails that hunk's test.

**Review verdicts**
1. **FilterModal undoes a roll (items 1 and 7). Confirmed and accepted.**
   - components.js:1340 deep-copies the period, Apply (1461-1466) sends it back, and UPDATE_FILTERS spreads it over the rolled period.
   - Fix: Apply sends the filters without the period: `const { period: _period, ...rest }`. The leading `_` keeps no-unused-vars quiet.
   - This is still needed after item 2's fix, because a payload that carries a period counts as the user's choice.
2. **A stale `_liveDay` rolls a period the user chose (item 7). Confirmed; accepted with a change.**
   - A plain roll at the top of NAVIGATE_PERIOD would first move a stale October to November. Then › would show December, and ‹ would show October again, the month already on screen.
   - So NAVIGATE_PERIOD, CLEAR_ALL_FILTERS, and UPDATE_FILTERS carrying a period or `replace` call `_rollLivePeriods(page)`. That rolls the other page and stamps today, but leaves alone the page being set.
   - UPDATE_FILTERS without a period rolls both pages first.
   - The effect equals the reviewer's per-page-stamp alternative, using one field.
3. **Stale-window actions (item 2).**
   - (a) **Today: accepted.** It dispatches ROLL_PERIODS. If the period rolled, it fires 'scroll-history-to-today' after 100 ms; otherwise it scrolls synchronously as before, so todayNavigation.test.js stays green.
   - (c) **Resume scroll: accepted.** The resume helper fires the same event after a roll while History is shown.
   - (b) **Donut drill-down: accepted as a documented limit, not code (D-U4-8).** It only occurs when Analytics stayed visible across midnight with no tap, ‹ ›, navigation or resume, because resume re-renders first. Copying the period as a custom range would change the header of every drill-down.
4. **Resume trigger never tested on a device (items 5 and 8). Accepted.** Capacitor App 'resume' is added alongside visibilitychange.
   - Both live in one self-contained hunk after the boot emit (main.js:614), with its own native check, not inside the backButton block.
   - This stays clear of Android Back code and of nativeWiring's 600-character backButton slice.
5. **`_localYMD` null/undefined contract (items 4 and 11). Confirmed and accepted, in the `arguments.length` form.**
   - `_localYMD()` returns today. `_localYMD(null)`, `_localYMD(undefined)` and `_localYMD('')` return ''.
   - U2 guards its createdAt fallback.
6. **Lint rule (items 6 and 10). Confirmed: too broad, and it misses split('T') on stored timestamps. Accepted with the AST selector.**
   - A trial run on the patched copy flags exactly bank-connect.js:807, components.js:1822, export.js:318 and U2's views.js:1504, 1888, 2250 and 3964.
   - It flags none of the `.slice(0, 10)` false positives.
7. **E2E (items 3 and 9). All valid.**
   - Clocks use explicit offsets, and resume gets its own test.
   - Correction to the reviewers: a stale screen still reads 'This Month', because it was rendered before midnight. So the tests assert the store period plus a figure that differs between the months. 'Expect Today' on a Day period is rejected for the same reason.
   - The reviewers disagree on the New Log date. The BUG-69 test types 2026-11-01, which isolates U4 and matches the report. A separate, integration-only test checks that the default is 1 Nov (U2, BUG-38).
   - The integrator runs the spec on efcac0c and confirms it fails.

**Coordination.** U2's draft asks for `Store.localDateKey(input?)`, with null or undefined returning today. The sanctioned helper is `Store._localYMD`, with the contract above. U2 uses it and does not add its own helper (see dependencies).

### BUG-28 — Net-flow buckets start a day early east of UTC, so month-end rows land in the wrong month _(gate, effort S)_

**Root cause.** The fault is in src/store.js:3403, computeNetFlowData.

**What goes wrong.** Every bucket edge is built as a local-midnight Date:
- anchorDt at :3410;
- the Day loop at :3416-3417;
- the Week start and end at :3433-3436;
- the Month new Date(y, m-i, 1) and new Date(y, m+1, 0) at :3448-3449.

Each edge is then written with toISOString().split('T')[0] (:3418 Day, :3438 Week, :3450 Month), which is the UTC day. East of UTC, local 00:00 falls on the previous UTC day, so every start and end is one day early. The filter at :3479 compares stored local dates against these strings. As a result:
- month-end rows land in the next bucket;
- the newest bucket's last day lands in no bucket at all;
- the labels (:3420, :3440, :3452) come from the local Date, so they disagree with the data.

**Verified in Node with TZ=Europe/Rome:**
- 'Oct 26' covers 2026-09-30..2026-10-30;
- weeks run Sunday to Saturday;
- the '3 Sat' bar starts on 2 Oct.

UTC and America/Martinique give correct buckets.

**Consumers.** None needs a change:
- widgets.js:320 (incomeExpense) and widgets.js:734 (savings);
- views.js:238 and 350 (Analytics);
- components.js:2347-2370 (NetFlowChart drill-down from bucket.start/end).

**History.** The code is the same in 1.0. 1.0.1 BUG-19 fixed this pattern only in _getPeriodLabel and Store.init.

**Fix.** 1. Add the shared helper `Store._localYMD(value)` to the Period Helpers section of src/store.js, between line 860 and _getPeriodBounds at 861. The final contract (reviews 4 and 11):
   - a call with no arguments returns now;
   - null, undefined, '' or an invalid value returns '';
   - a Date, epoch ms or ISO timestamp returns its local calendar day;
   - a bare 'YYYY-MM-DD' is returned unchanged and is never parsed as UTC.
2. Switch the three bucket formatters in computeNetFlowData to this helper: :3418, :3438 and :3450.

The Date objects are already correct local midnights. Once they are formatted locally:
- weeks run Monday to Sunday;
- the buckets match _getPeriodBounds, which History, NET CHANGE and Home's projected EOM use.

Not changed:
- the filter predicate (:3474-3487), which is U8's (BUG-36);
- any consumer.

**Sketch.**

```js
// src/store.js, Period Helpers: insert between 860 and 861 (_getPeriodBounds)
  // 1.0.2 (BUG-28) THE local calendar-day formatter: a Date, epoch ms or ISO
  // timestamp -> 'YYYY-MM-DD' in the device zone. No argument = now (same as
  // _todayYMD()); null, undefined, '' or an invalid value -> '' (a missing
  // timestamp never silently becomes 1970 or today: guard at the call site).
  // A bare 'YYYY-MM-DD' is already a local day and comes back unchanged.
  // Never toISOString().split('T')[0]: that is the UTC day. Shift a
  // 'YYYY-MM-DD' with _calculateNextRecurrenceDate (negative steps are fine).
  _localYMD(value) {
    if (arguments.length === 0) value = new Date();
    if (value == null || value === '') return '';
    if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
    const d = value instanceof Date ? value : new Date(value);
    if (isNaN(d)) return '';
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  },

// computeNetFlowData
-        const dStr = d.toISOString().split('T')[0];                 // :3418
+        const dStr = this._localYMD(d); // 1.0.2 (BUG-28) local day, not the UTC day
-        const fmt = (dt) => dt.toISOString().split('T')[0];        // :3438 and :3450
+        const fmt = (dt) => this._localYMD(dt); // 1.0.2 (BUG-28)
```

**Data repair.** None. Bucket edges are computed at render time. The drill-down's custom History period is transient, because historyFilters are not persisted (only sortOrder is).

**Tests (each fails on the current code).**

- New file tests/unit/netFlowLocalDates.test.js: executeFile chain db → i18n → en → loan-engine → store → components → widgets, with a Chart stub. TZ is set to 'Europe/Rome' in beforeAll and restored afterwards, as in periodLabelYear.test.js, and only Date is faked.
- Month buckets at 2026-10-03 12:00+02:00: b[11] is 2026-10-01..2026-10-31, b[10] is 2026-09-01..2026-09-30, and March, across the DST change, is 2026-03-01..2026-03-31.
- Report scenario: account opened 2026-09-01, +2000 cat_salary on 2026-09-30, −80 cat_utilities on 2026-10-31. Expect October {income 0, expense 80, net −80} and September net +2000. Invariant: October's net equals computeBalanceForecast().eomAbsDiff.
- Clock at 2026-10-31T12:00+01:00: −60 on 15 Oct and +2400 dated today. Expect October {income 2400, expense 60, net 2340}.
- Day buckets, value 2026-10-03: starts are ['2026-09-27' … '2026-10-03'] and start === end. The 3 Oct bar is −25 and the 2 Oct bar is −10.
- Week buckets: the last is 2026-09-28..2026-10-04, every start is a Monday and every end a Sunday.
- Widgets: small incomeExpense renders '-€80.00' and no '€2,000.00'; small savings renders '-€80.00'.
- Drill-down: NetFlowChart onClick on index 11 dispatches UPDATE_FILTERS with period {type 'custom', start '2026-10-01', end '2026-10-31'}.
- Helper contract at 2026-11-01T00:30+01:00:
- '2026-11-01' from _localYMD(), _todayYMD(), _localYMD(new Date().toISOString()) and _localYMD(Date.now());
- _localYMD('2026-10-03') is returned unchanged;
- '' from _localYMD('not a date'), _localYMD(null), _localYMD(undefined) and _localYMD('').

Run on the scratch copy: these fail on efcac0c and pass with the fix.
- E2E, written blind and verified at integration: tests/e2e/local_dates.spec.js with test.use({ timezoneId: 'Europe/Rome' }) and page.clock.install({ time: new Date('2026-10-03T12:00:00+02:00') }). Seed the report data and a small incomeExpense widget, then expect the card to contain '-€80.00' and not '€2,000.00'.

**Risks.** **Visible change.** In UTC+ zones (the whole EU):
- week bars move from Sunday–Saturday to Monday–Sunday;
- day bars move onto their own day;
- month totals change.

This is the fix. The bars now match History, NET CHANGE and projected EOM.

**Other units.** U8 edits the account predicate in the same function (3474-3484); U4 owns only bucket construction (3403-3472).

**Test zone.** The owner's machine (Lisbon, UTC+0 in winter) and CI (UTC) hide the bug, so the new tests must pin TZ.

### BUG-67 — 'Last N Days' presets cover N+1 days, and the range sheet's 'today' is the UTC date _(rider, recommended, effort S)_

**Root cause.** The fault is in src/components.js, CustomRangeModal.show.

1. **UTC 'today'.** :1131-1132 sets todayStr from now.toISOString(), the UTC day, and uses it as the default start and end.
2. **Presets** (:1243-1258):
   - fmt is toISOString (:1245);
   - the start is now minus N days, months or years, and the custom filter includes both ends (store.js:972, store.js:991-994), so 'Last 7 Days' covers 8 days;
   - 6 Months and 1 Year cover 184 and 366 days.
3. **Bare date parses.** updateSummary (:1185-1188) and renderCalendars (:1196-1197) call new Date('YYYY-MM-DD'), which is UTC midnight. West of UTC they show the previous day and month, and Math.ceil lets DST skew the day count.
4. **Month arrows (BUG-68).** The handlers at :1264-1280 are bound before renderCalendars() (:1283) creates the buttons, so they are dead. They also round-trip through toISOString.

**Same class, in the store.** _getPreviousPeriod (store.js:1052) counts custom-range days with Math.ceil over local midnights. In Rome, 1–31 Oct therefore gets a 32-day previous period (Aug 30 – Sep 30).

**Verified in jsdom:**
- Rome, 3 Oct 15:00: 'Last 7 Days' gives 'Sep 26 – Oct 3 (8 days)'.
- Rome, 1 Nov 00:30: the sheet defaults to Oct 31.
- Martinique, 1 Oct: the summary shows Sep 30 and the calendars show September.

**Fix.** Use local dates throughout the sheet:
- todayStr = Store._todayYMD();
- a local helper ymdDate(s) = new Date(s + 'T12:00:00') replaces every bare parse in updateSummary and renderCalendars;
- the day count uses Math.round.

Presets end today, and both ends are included:
- 'Last N Days': start = today − (N−1) days;
- 6 Months and 1 Year: start = today − N months (years as −12·N months, so 29 Feb clamps), + 1 day (D-U4-1);
- every shift goes through Store._calculateNextRecurrenceDate, the noon-anchored local string maths;
- 'All Time' is unchanged.

Month arrows (D-U4-2, BUG-68):
- each calendar keeps a viewed month (viewStart, viewEnd as 'YYYY-MM-01') separate from the selection;
- the arrows are bound inside renderCalendars, after the buttons exist, and step the viewed month with _calculateNextRecurrenceDate(view, ±1, 'months');
- a preset resets both viewed months to the selection;
- the old dead block at :1264-1280 is removed.

D-U4-4: store.js:1052 changes Math.ceil to Math.round.

The Apply payload shape is unchanged.

**Sketch.**

```js
// CustomRangeModal.show, :1131-1132
-      const now = new Date();
-      const todayStr = now.toISOString().split('T')[0];
+      // 1.0.2 (BUG-67) local dates throughout this sheet: the device's day,
+      // never toISOString() or a bare 'YYYY-MM-DD' parse (both are UTC).
+      const S = window.Store;
+      const todayStr = S._todayYMD();
+      const ymdDate = (ymd) => new Date(ymd + 'T12:00:00'); // noon: no UTC/DST edge

// after :1177 (let currentEnd = end;)
+      // 1.0.2 (BUG-68) each calendar shows its own month, separate from the
+      // selection, so ‹ › browse without moving the range.
+      const monthOf = (ymd) => ymd.slice(0, 7) + '-01';
+      let viewStart = monthOf(currentStart);
+      let viewEnd = monthOf(currentEnd);

// updateSummary, :1185-1188
-        const s = new Date(currentStart); const e = new Date(currentEnd);
-        const diff = Math.ceil((e - s) / (1000 * 60 * 60 * 24)) + 1;
-        const fmt = (d) => new Date(d).toLocaleDateString(...);
+        const diff = Math.round((ymdDate(currentEnd) - ymdDate(currentStart)) / 86400000) + 1; // 1.0.2 (BUG-67)
+        const fmt = (d) => ymdDate(d).toLocaleDateString(...);

// renderCalendars, :1196-1197
+        const startMonth = ymdDate(viewStart); // 1.0.2 (BUG-67/68)
+        const endMonth = ymdDate(viewEnd);
// after the day-click bindings (:1222)
+        // 1.0.2 (BUG-68) bound here: the buttons only exist after this render
+        div.querySelectorAll('.btn-month-nav').forEach(btn => {
+          btn.onclick = () => {
+            const step = parseInt(btn.dataset.offset, 10);
+            if (btn.dataset.target === 'start') viewStart = S._calculateNextRecurrenceDate(viewStart, step, 'months');
+            else viewEnd = S._calculateNextRecurrenceDate(viewEnd, step, 'months');
+            renderCalendars();
+          };
+        });

// presets, :1243-1258
        btn.onclick = () => {
          // 1.0.2 (BUG-67) N units ENDING today, both ends included
          currentEnd = S._todayYMD();
          const shift = (ymd, n, unit) => S._calculateNextRecurrenceDate(ymd, n, unit);
          if (btn.dataset.days) {
            currentStart = shift(currentEnd, -(parseInt(btn.dataset.days, 10) - 1), 'days');
          } else if (btn.dataset.months || btn.dataset.years) {
            const months = btn.dataset.months ? parseInt(btn.dataset.months, 10) : 12 * parseInt(btn.dataset.years, 10);
            currentStart = shift(shift(currentEnd, -months, 'months'), 1, 'days');
          } else if (btn.dataset.type === 'all') {
            currentStart = '2000-01-01';
          }
          viewStart = monthOf(currentStart); // 1.0.2 (BUG-68)
          viewEnd = monthOf(currentEnd);
          renderCalendars(); updateSummary();
        };

// :1264-1280 old dead 'Month navigation' block → removed
+      // Month navigation: bound inside renderCalendars (1.0.2 BUG-68).

// store.js:1052 (D-U4-4)
-      const diffDays = Math.ceil((eDt - sDt) / (1000 * 60 * 60 * 24)) + 1;
+      const diffDays = Math.round((eDt - sDt) / (1000 * 60 * 60 * 24)) + 1; // 1.0.2 (BUG-67) DST days are 23/25 h

// Checked: Oct 3 → 7d Sep 27 (7), 30d Sep 4, 90d Jul 6, 6m Apr 4 (183), 1y Oct 4 2025 (365);
// Aug 31 → 6m Mar 1; Feb 29 2028 → 1y Mar 1 2027; Rome 1 Nov 00:30 → Nov 1, 30d Oct 3 (30).
```

**Data repair.** None. Custom ranges are transient filter state.

**Tests (each fails on the current code).**

- New file tests/unit/customRangePresets.test.js (jsdom):
- document.body holds #modal-container;
- StackdHydrateIcons is stubbed;
- chain db → i18n → en → store → components;
- Date is faked and TZ is set per test.
- Rome, Sat 3 Oct 2026 15:00 (+02:00):
- Last 7 Days: summary contains 'Sep 27, 2026 - Oct 3, 2026' and '(7 days)';
- Last 30 Days starts on 'Sep 4, 2026';
- Last 90 Days starts on 'Jul 6, 2026';
- 6 Months shows 'Apr 4, 2026 - Oct 3, 2026';
- 1 Year shows '(365 days)', and #crm-apply then dispatches period {type 'custom', start '2025-10-04', end '2026-10-03', value ''}.
This pins D-U4-1.
- Rome, 1 Nov 2026 00:30 (+01:00), which is 23:30 UTC on 31 Oct:
- the default summary is 'Nov 1, 2026 - Nov 1, 2026';
- both .calendar-nav-title read 'November 2026';
- Last 30 Days gives 'Oct 3, 2026 - Nov 1, 2026 (30 days)', across the DST change.
- America/Martinique, 1 Oct 2026 12:00: the default summary is 'Oct 1, 2026 - Oct 1, 2026' and both titles read 'October 2026'.
- BUG-68 (D-U4-2): tapping the start calendar's ‹ changes the titles to ['September 2026', 'October 2026'] and leaves the summary unchanged. Tapping 2026-09-14 then sets the summary to 'Sep 14, 2026 - Oct 3, 2026'.
- D-U4-4, TZ Europe/Rome: _getPreviousPeriod({type:'custom', start:'2026-10-01', end:'2026-10-31'}) gives start '2026-08-31' and end '2026-09-30'. The current code gives '2026-08-30'.

Run on the scratch copy: all of these fail on efcac0c and pass with the fix.
- E2E (blind) in local_dates.spec.js. Clock: new Date('2026-10-03T12:00:00+02:00'). Steps: History → #btn-calendar-history → 'Last 7 Days'. Expect #crm-range-summary to contain '(7 days)'; after Apply, the History header reads 'Sep 27 – Oct 3'.

**Risks.** **Preset length.** With D-U4-1, 6 Months and 1 Year shrink from 184/366 days to 183/365. This is a product choice.

**Shared sheet.** History and Analytics both use this sheet. Analytics' previous-period window for a custom range follows the corrected length.

**Month arrows.** With D-U4-2, the arrows only browse; they no longer move the selection, which the dead code originally intended. Without D-U4-2, users still cannot build a range that ends before the current month.

**Existing test.** i18n_core.spec.js:113-119 (the calendar title is the current local month) keeps passing.

**Back-dismiss.** The sheet already carries .modal-btn-close.

**Other units.** The BUG-24 escaping unit may touch components.js widely. This sheet renders no user strings.

### BUG-69 — After midnight on the 1st, History and Analytics stay on last month and hide a new expense _(rider, recommended, effort M)_

**Root cause.** historyFilters.period.value and analyticsFilters.period.value are set from today only in Store.init (src/store.js:325-339).

After boot, only user actions write them:
- UPDATE_FILTERS (2674-2700);
- NAVIGATE_PERIOD (2636-2663);
- CLEAR_ALL_FILTERS (2702-2721).

Nothing re-anchors them when the date changes:
- Router re-anchors only the budget month (router.js:182-187);
- SET_VIEW (store.js:2168-2176) leaves the filters alone;
- after a save, the form navigates to #transactions (views.js:2404);
- main.js's only visibilitychange listener (619-623) calls BankConnect.refreshOnOpen;
- History's Today button only scrolls (components.js:1096-1098 → views.js:1441).

So a 'month' period anchored on 2026-10-01 stays on October after midnight. The filters are not persisted, which is why a restart fixes it.

**Verified in Node:** booted at 23:58 on 31 Oct (Rome), moved the clock to 00:03 on 1 Nov, then SET_VIEW add → transactions. The period stays 2026-10-01, labelled 'October 2026'.

**Two more ways the stale period survives** (reviews 1, 2 and 7):
- FilterModal snapshots the whole filters object at open (components.js:1340) and writes it back on Apply (1461-1466).
- A period the user moves after midnight would still be judged against the stale reconcile day.

**Fix.** **Store.** Add `_rollLivePeriods(keepPage)` next to _localYMD.
- It keeps `_liveDay`, the local day of the last reconcile; Store.init sets it after :339.
- On a new local day, each non-custom History or Analytics period that contained `_liveDay`, but not today, moves to the period containing today:
  - months anchor on 'YYYY-MM-01' and years on 'YYYY-01-01', as at boot;
  - Day and Week anchor on today.
- `keepPage` skips one page, the one whose period the current action is about to set from what is on screen. `_liveDay` is still stamped to today, so that choice is then judged against today's calendar.

**Where it runs:**
1. Top of SET_VIEW, on every route. This covers entering History or Analytics and the post-save return. It re-renders only if the target is History or Analytics.
2. A new action, ROLL_PERIODS. It re-renders only when History or Analytics is the active view, so a half-filled form is never wiped.
3. Before each filter action, so a stale reconcile day can never roll a period the user chose (review 7):
   - NAVIGATE_PERIOD and CLEAR_ALL_FILTERS call `_rollLivePeriods(page)`: ‹ › step from the period on screen, and the other page reconciles;
   - UPDATE_FILTERS calls `_rollLivePeriods(page)` when it carries a period or `replace`;
   - otherwise UPDATE_FILTERS calls `_rollLivePeriods()`, so a types/accounts/tags change lands on the rolled period.

**Components:**
- FilterModal Apply sends the filters without `period`. The sheet never edits the period, and the snapshot taken at open would undo a roll (reviews 1 and 7).
- History's Today dispatches ROLL_PERIODS first. If the period rolled, it fires 'scroll-history-to-today' after 100 ms, after the same-view re-render. Otherwise it keeps today's synchronous scrollToToday(container) (review 2a).

**main.js.** One hunk after the boot emit (:614):
- a rollPeriodsOnResume helper that dispatches ROLL_PERIODS, then fires the scroll event if History is active and its period rolled (review 2c);
- the helper is wired to document visibilitychange (which also covers the web build) and to Capacitor App 'resume' on native (reviews 5 and 8).

ROLL_PERIODS is idempotent, so the second trigger does nothing.

**Not changed:**
- router.js;
- the post-save 'row outside the period' case (D-U4-3);
- the donut drill-down (D-U4-8);
- Today on a deliberately past period (BUG-115).

**Sketch.**

```js
// src/store.js, Store.init after :339
+    this._liveDay = todayStr; // 1.0.2 (BUG-69) the local day both periods were last reconciled on

// src/store.js, Period Helpers (after _localYMD, before _getPeriodBounds at 861)
  // 1.0.2 (BUG-69) A History/Analytics period that showed the CURRENT day,
  // week, month or year follows the calendar: once the local date has moved
  // past it (app left open across midnight, resumed the next morning) it
  // rolls to the period containing today. A period the user moved away from
  // or a custom range is a choice and stays. `_liveDay` = the local day of
  // the last reconcile (boot, every SET_VIEW / ROLL_PERIODS / filter action).
  // `keepPage` is skipped: the action is about to set that page's period
  // from what is on screen. Returns true when a period moved.
  _rollLivePeriods(keepPage) {
    const today = this._todayYMD();
    const prevDay = this._liveDay;
    this._liveDay = today;
    if (!prevDay || prevDay === today) return false;
    let rolled = false;
    [['history', 'historyFilters'], ['analytics', 'analyticsFilters']].forEach(([page, key]) => {
      if (page === keepPage) return;
      const p = this.state[key] && this.state[key].period;
      if (!p || p.type === 'custom' || !p.value) return;
      if (!this.isDateInPeriod(prevDay, p) || this.isDateInPeriod(today, p)) return;
      const value = p.type === 'month' ? today.slice(0, 7) + '-01'      // boot-style anchors:
        : (p.type === 'year' ? today.slice(0, 4) + '-01-01' : today);   // never a 29th-31st
      this.state[key] = { ...this.state[key], period: { ...p, value } };
      rolled = true;
    });
    return rolled;
  },

// dispatch, case 'SET_VIEW' (:2168), first lines
+        // 1.0.2 (BUG-69) a new local day rolls live periods; re-render only where they show
+        if (this._rollLivePeriods() && (payload === 'transactions' || payload === 'analytics')) changed = true;
// new case, before 'SET_DEBT_SIM' (:2178)
+      case 'ROLL_PERIODS':
+        // 1.0.2 (BUG-69) main.js on resume, History's Today. Silent on other
+        // views: a half-filled form must never re-render under the user.
+        if (this._rollLivePeriods() &&
+            (this.state.activeView === 'transactions' || this.state.activeView === 'analytics')) changed = true;
+        break;
// NAVIGATE_PERIOD, after :2639 (const page = payloadObj.page;)
+        // 1.0.2 (BUG-69) ‹ › step from the period ON SCREEN (this page is kept);
+        // the other page reconciles, and the result is judged against today.
+        this._rollLivePeriods(page);
// UPDATE_FILTERS, after :2676 (const key = ...)
+        // 1.0.2 (BUG-69) reconcile first. A period set here is the user's
+        // choice against today's calendar, so that page is kept; any other
+        // change (types, accounts, tags...) lands on the rolled period.
+        this._rollLivePeriods(replace || (filters && filters.period) ? page : undefined);
// CLEAR_ALL_FILTERS, after :2704 (const key = ...)
+        this._rollLivePeriods(page); // 1.0.2 (BUG-69) this page resets to today; the other reconciles

// src/components.js, AdvancedFilterBar Today, :1097-1098
         if (pageKey === 'history') {
-          window.Views.TransactionsView.scrollToToday(container);
+          // 1.0.2 (BUG-69) a period still on yesterday rolls first; the
+          // same-view re-render keeps the old scrollTop, so scroll after it.
+          const before = window.Store.state.historyFilters.period.value;
+          window.Store.dispatch('ROLL_PERIODS');
+          if (window.Store.state.historyFilters.period.value !== before) {
+            setTimeout(() => window.dispatchEvent(new CustomEvent('scroll-history-to-today')), 100);
+          } else {
+            window.Views.TransactionsView.scrollToToday(container);
+          }

// src/components.js, FilterModal apply, :1461-1465
       const apply = () => {
+        // 1.0.2 (BUG-69) this sheet never edits the period: sending back the
+        // snapshot taken at open would undo a roll that happened meanwhile.
+        const { period: _period, ...rest } = currentFilters;
         window.Store.dispatch('UPDATE_FILTERS', {
           page: pageKey,
-          filters: currentFilters
+          filters: rest
         });

// src/main.js, insert after :614 (window.Store.emit({ sync: true });)
+  // 1.0.2 (BUG-69): a WebView kept in memory resumes on a new day with
+  // History/Analytics still on yesterday's period. Two triggers (the page
+  // visibility event, also the web build, and Capacitor's native 'resume')
+  // because ROLL_PERIODS is idempotent: whichever fires second is a no-op.
+  const rollPeriodsOnResume = () => {
+    const before = window.Store.state.historyFilters.period.value;
+    window.Store.dispatch('ROLL_PERIODS');
+    if (window.Store.state.activeView === 'transactions' &&
+        window.Store.state.historyFilters.period.value !== before) {
+      // the same-view re-render keeps the old scrollTop: land on today instead
+      setTimeout(() => window.dispatchEvent(new CustomEvent('scroll-history-to-today')), 100);
+    }
+  };
+  document.addEventListener('visibilitychange', () => {
+    if (document.visibilityState === 'visible') rollPeriodsOnResume();
+  });
+  if (window.Capacitor && typeof window.Capacitor.isNativePlatform === 'function' && window.Capacitor.isNativePlatform()
+      && window.Capacitor.Plugins && window.Capacitor.Plugins.App) {
+    window.Capacitor.Plugins.App.addListener('resume', rollPeriodsOnResume);
+  }
```

**Data repair.** None.
- historyFilters and analyticsFilters are transient; only the History sort order is saved.
- `_liveDay` is a field on the Store object and is never persisted.
- ROLL_PERIODS writes no StackdDB slice.

**Tests (each fails on the current code).**

- New file tests/unit/periodRollover.test.js:
- store-only chain with TZ Europe/Rome;
- only Date is faked;
- a subscribe counter with an awaited flush;
- clocks use explicit offsets.
- Boot at 2026-10-31T23:58+01:00, then:
- SET_VIEW dashboard;
- NAVIGATE_PERIOD −1 on analytics (September);
- move the clock to 00:03 on 1 Nov;
- SET_VIEW add, then SET_VIEW transactions.
Expect: history '2026-11-01', label 'This Month', isDateInPeriod('2026-11-01') true, and analytics still '2026-09-01'.
- Day period: UPDATE_FILTERS history {type 'today', value '2026-10-15'}. Move the clock to 16 Oct, then SET_VIEW transactions. Expect '2026-10-16' and the label 'Today'.
- Custom range: history custom 2026-10-01..31. After midnight, SET_VIEW analytics. History is unchanged and analytics rolls to '2026-11-01'.
- ROLL_PERIODS on Analytics after midnight:
- it rolls, with exactly one emit;
- a second ROLL_PERIODS emits nothing (idempotent);
- on 'add', history rolls with zero emits.
- Stale ‹ › (review 7). Boot 23:58 on 31 Oct, SET_VIEW transactions, move the clock to 00:03 on 1 Nov, then:
- NAVIGATE_PERIOD +1 on history gives '2026-11-01', and analytics reconciles to '2026-11-01';
- NAVIGATE_PERIOD −1 gives '2026-10-01';
- SET_VIEW edit then transactions leaves '2026-10-01'.
Separately, a stale ‹ gives '2026-09-01', not October again.
- A non-period UPDATE_FILTERS ({types:['expense']}) on a stale History lands on '2026-11-01' with types ['expense'].
- FilterModal, in jsdom with components.js loaded (review 1): show('history'), then midnight passes, then ROLL_PERIODS, then click #afm-apply. The period stays '2026-11-01'.
- History's Today (review 2a), with setTimeout faked:
- on a stale period, the click rolls to '2026-11-01', does not call scrollToToday synchronously, and fires 'scroll-history-to-today' after 100 ms;
- a second click on the same day calls scrollToToday(container) as before.
- Source wiring: src/main.js must match all three patterns:
- /const rollPeriodsOnResume = \(\) => \{[\s\S]{0,200}dispatch\('ROLL_PERIODS'\)[\s\S]{0,300}scroll-history-to-today/
- /addEventListener\('visibilitychange'[\s\S]{0,120}rollPeriodsOnResume\(\)/
- /addListener\('resume', rollPeriodsOnResume\)/

Run on the scratch copy: every test above fails on efcac0c. Reverting only the FilterModal hunk, or only the NAVIGATE_PERIOD roll, fails its own test.
- E2E (blind), tests/e2e/local_dates.spec.js, with test.use({ timezoneId: 'Europe/Rome' }). Every clock is new Date('<ISO with offset>'), never local fields (review items 3 and 9).

(1) Report path:
- install at '2026-10-31T23:58:00+01:00';
- seed Main €3,000 opened 2026-09-01, October expenses and monthly Rent €950 from 2026-10-01;
- open #transactions and assert 'This Month' and that an October row is visible;
- fastForward('05:00');
- + → New Log, €7.50 Dining Out, type the date 2026-11-01, Save;
- expect the €7.50 row listed and page.evaluate(Store.state.historyFilters.period.value) to be '2026-11-01';
- tap Analytics and expect its period to be '2026-11-01'.

(2) Resume, as its own test:
- boot on #analytics at 23:58 with October rows and a plain −€12.00 expense dated 2026-11-01;
- assert October's NET CHANGE;
- fastForward('05:00'), then dispatch visibilitychange;
- expect the analytics period to be '2026-11-01' and NET CHANGE to read −€12.00.
The label alone proves nothing, because the stale DOM also reads 'This Month'.

(3) Stale Today: boot on #transactions at 23:58, fastForward, tap #btn-today-history. Expect the period '2026-11-01' and the 1 Nov row visible.

(4) Integration-only (needs U2 BUG-38): after midnight, New Log's date input defaults to '2026-11-01'. Skip it if U2's own spec already asserts this.

The integrator runs the spec against efcac0c and confirms (1)–(3) fail there.

**Risks.** **Behaviour change.** SET_VIEW and the three filter actions now change periods, but only when the local date has changed since the last reconcile. No existing test combines these actions with a change of day, and the full suite stays green.

**Accepted limits:**
- A screen left on History or Analytics across midnight, with no tap, navigation or resume, keeps yesterday's period until the next interaction. A midnight timer was rejected as extra machinery.
- The donut drill-down in that same window (D-U4-8) copies the stale period. The SET_VIEW roll then shows the new month's rows for that category.
- A clock moved backwards (travel west, or a manual date change) rolls a live period backwards too, which is consistent with 'follows today'.

**Native resume.** Both triggers are installed, so no device check is needed before release. A device pass should still confirm that History lands on today after an overnight background.

**Other units:**
- BUG-86/87 units: if they edit case 'SET_VIEW', keep U4's two lines at its top.
- U9's leaveTo('#transactions') still goes through handleRouteChange → SET_VIEW, so the post-save roll holds.

**Outside this round:**
- BUG-115: Today on a deliberately past period still only scrolls; its eventual fix subsumes U4's Today change.
- BUG-64: rolled months anchor on the 1st, so they never create a 29th–31st anchor.

### U4 decisions

- **D-U4-1** How long are the Custom Range sheet's '6 Months' and '1 Year' presets?
  - N months or years ending today, starting the day after the same date N months earlier. 6 Months on 3 Oct = Apr 4 – Oct 3 (183 days); 1 Year = Oct 4, 2025 – Oct 3, 2026 (365 days).
  - Keep the same-day anchor and fix only the local date: Apr 3 – Oct 3 (184 days); 1 Year shows '(366 days)'.
  - Whole calendar months: 6 Months = May 1 – Oct 3 (this month plus the 5 before).
  - _Recommended:_ N months or years ending today, starting the day after the same date N months earlier (183 and 365 days). — It matches the corrected 'Last N Days' rule (N units ending today, both ends included), so the sheet's '(N days)' count is no longer one too many. Month-end clamping comes free from _calculateNextRecurrenceDate: on Aug 31, 6 Months starts Mar 1; on Feb 29, 1 Year starts Mar 1. Verified in the scratch run.
- **D-U4-2** Should BUG-68 (the dead month arrows in the same Custom Range sheet) be folded into U4?
  - Yes. Bind the arrows inside renderCalendars and give each calendar a viewed month separate from the selection, stepped with local month maths (about 15 lines plus 1 unit test).
  - No. Leave it for a later round, and only swap the dead toISOString lines (components.js:1270-1276) for local maths.
  - _Recommended:_ Yes: fold BUG-68 into U4, with arrows that browse a per-calendar viewed month without moving the range. — U4 already rewrites every date line of this function. Without the arrows, users cannot pick a range ending before the current month, because every preset ends today. No i18n keys and no other file. Verified in the scratch run.
- **D-U4-3** After a save, if the new row falls outside History's current period, what should happen? (BUG-69's write-up suggests it as a separate improvement.)
  - Nothing extra in 1.0.2: the live-period roll already fixes the reported after-midnight case.
  - Move History to the period that contains the saved row.
  - Show a NoticeSheet 'Saved to October 2026' with a Show action (new keys ×5).
  - _Recommended:_ Nothing extra in 1.0.2: the live-period roll fixes the reported case. — The reported failure (a row dated today hidden after midnight) is fully fixed by the roll. Saving into a period the user is deliberately not viewing is a separate UX question. Either alternative adds new behaviour, and the NoticeSheet adds keys, late in a patch release.
- **D-U4-4** Should U4 also fix the DST day count of custom ranges in _getPreviousPeriod (store.js:1052, Math.ceil → Math.round)?
  - Yes: one line, plus one Rome-pinned test that fails now.
  - No: list it as a follow-up.
  - _Recommended:_ Yes: fix it in U4 (one line, one test). — It is the same local-date arithmetic class and feeds an aggregate: Analytics' previous-period comparison and its PREVIOUS tile for custom ranges. In Rome, 1–31 Oct currently gets a 32-day previous period (Aug 30 – Sep 30). The full suite stays green with the change.
- **D-U4-5** What makes a History or Analytics period 'live', so that it follows today?
  - Derived. A period is live if it contained the day of the last reconcile: boot, any SET_VIEW, resume, History's Today, and every filter action. A filter action reconciles the other page and judges its own new period against today. No flag; the pills, ‹ › and Clear need no new code beyond one reconcile call.
  - Explicit. Add a period.live flag, set by boot, the pills, Today and Clear, and cleared by ‹ ›. Edits five dispatch sites and AdvancedFilterBar.
  - _Recommended:_ Derived: live means the period contained the last reconcile day, and every filter action reconciles first (keeping the page it is setting). — It behaves the same in every reported case with one method and one transient field. Review 7's stale-stamp hole is closed by the reconcile calls in the three filter actions, and the scratch tests pin it. A flag would touch every period-setting call site near BUG-64/BUG-29 code.
- **D-U4-6** When the app resumes on a new day, which screens re-render?
  - Only History and Analytics, and only when a period actually rolled.
  - Also Home, so 'Today' groupings and month-to-date widgets refresh.
  - _Recommended:_ Only History and Analytics, when a period actually rolled. — This is what BUG-69 needs, and it can never wipe a form. Re-rendering Home on every resume is reasonable but unreported, and it would remount charts each time. Better as a follow-up.
- **D-U4-7** Add a lint rule against date-only toISOString() use in src/, as BUG-38 suggests?
  - Yes, narrowed (reviews 6 and 10). The integrator adds a no-restricted-syntax rule to the src block of eslint.config.cjs (after line 145) after U2 and U4 merge. The selector is CallExpression[callee.property.name=/^(split|slice|substring|substr)$/][callee.object.callee.property.name='toISOString'], with a message pointing to Store._localYMD / _todayYMD. Alongside the rule: U4 switches export.js:318 and the dead RecurringSettingsModal's components.js:1822 to window.Store._todayYMD(), and the integrator marks bank-connect.js:807 (_isoDay, a deliberate UTC fetch window) with an eslint-disable-next-line comment that gives the reason.
  - Yes, but with the draft's broad ban on any .slice(0, 10). That would flag components.js:2843 (an array), import.js:874 and 890 (XML date text) and bank-connect.js:834, and fail lint.
  - No lint; rely on the TZ-pinned tests.
  - _Recommended:_ Yes, with the narrowed AST selector on toISOString() results only. The integrator lands it after U2 and U4 merge; U4 fixes export.js:318 and components.js:1822, and bank-connect.js:807 is annotated. — This pattern has caused bugs in three releases (the recurrence drift, BUG-19, and BUG-28/38/67). A trial run of the narrowed selector on the patched copy flags exactly the expected sites: bank-connect.js:807, components.js:1822, export.js:318 and U2's views.js 1504/1888/2250/3964. None of them is a slice(0,10) false positive. The createdAt.split('T')[0] fallbacks (store.js:1155, 1189) are not toISOString calls; U2's TZ-pinned tests cover them.
- **D-U4-8** An Analytics donut or tag drill-down tapped before any other interaction after midnight copies the stale period into History (components.js:2639-2650, direct mutation); the SET_VIEW roll then moves it to the new month. What should happen?
  - Accept and document it as a limit. It needs Analytics to stay visible across midnight with no tap, ‹ ›, navigation or resume (resume re-renders first), and the result is consistent with the 'This Month' label.
  - Copy the Analytics bounds into History as a custom range, which never rolls. Every drill-down header would change from 'This Month' or 'October 2026' to 'Oct 1 – Oct 31'.
  - _Recommended:_ Accept and document it as a limit; leave the drill-down code unchanged. — The window is minutes wide and needs no interaction at all after midnight. The alternative changes the visible header of every drill-down, a common path, to fix a rare edge.

### U4 regions owned

| File | Symbol | Lines | Change |
|---|---|---|---|
| src/store.js | Store.init (boot period anchor) | 337-339 (+1 line after 339) | BUG-69: `this._liveDay = todayStr;`. |
| src/store.js | Period Helpers: new _localYMD + _rollLivePeriods | insert between 860 and 861 (_getPeriodBounds) | BUG-28: the shared helper `_localYMD(value)`. A no-argument call returns now; null, undefined or '' returns ''. U4 owns it; U2 calls it and must not redefine it. BUG-69: `_rollLivePeriods(keepPage)`. |
| src/store.js | _getPreviousPeriod (custom branch) | 1052 | D-U4-4: Math.ceil → Math.round. |
| src/store.js | dispatch: case 'SET_VIEW' + new case 'ROLL_PERIODS' | 2168-2176 (2 lines at the top); new case inserted before 'SET_DEBT_SIM' at 2178 | BUG-69: the roll at the top of SET_VIEW, plus the ROLL_PERIODS case. Other units appending to SET_VIEW add their lines below U4's. |
| src/store.js | dispatch: NAVIGATE_PERIOD | insert after 2639 | BUG-69 (review 7): `this._rollLivePeriods(page);`. |
| src/store.js | dispatch: UPDATE_FILTERS | insert after 2676 | BUG-69 (review 7): `this._rollLivePeriods(replace \|\| (filters && filters.period) ? page : undefined);`, placed before `let base`. |
| src/store.js | dispatch: CLEAR_ALL_FILTERS | insert after 2704 | BUG-69 (review 7): `this._rollLivePeriods(page);`. |
| src/store.js | computeNetFlowData (bucket construction only) | 3403-3472 (edits at 3418, 3438, 3450) | BUG-28: the three formatters switch to `this._localYMD(...)`. Lines 3474-3487 stay U8's. |
| src/store.js | _todayYMD | 4270-4273 | Not edited (already local), listed so nobody duplicates it. The tail of the Store object stays free for other units. |
| src/components.js | AdvancedFilterBar.attachEvents: History Today button | 1096-1098 | BUG-69 (review 2a): dispatch ROLL_PERIODS first. If the period rolled, fire 'scroll-history-to-today' after 100 ms; otherwise call scrollToToday(container) synchronously, as now. |
| src/components.js | CustomRangeModal.show | 1126-1285 (edits at 1131-1132, after 1177, 1185-1188, 1196-1197, after 1222, 1243-1260; 1264-1280 removed) | BUG-67: local today, noon-anchored parses, Math.round day count, presets via _calculateNextRecurrenceDate. BUG-68 (D-U4-2): per-calendar viewed months and arrows bound inside renderCalendars; the dead block is removed. |
| src/components.js | FilterModal.show: apply() | 1461-1466 | BUG-69 (reviews 1 and 7): dispatch the filters without `period` (`const { period: _period, ...rest } = currentFilters`). |
| src/components.js | RecurringSettingsModal.show (dead: no callers) | 1822 | Only if D-U4-7 is accepted: startDate becomes window.Store._todayYMD(). |
| src/export.js | PDF export filename | 318 | Only if D-U4-7 is accepted: `stackd_export_${window.Store._todayYMD()}.pdf`. Outside U7's 3-13 hunk. |
| src/main.js | boot: rollPeriodsOnResume + visibilitychange + Capacitor 'resume' | insert after 614 (before the v1.08 B4 block at 616) | BUG-69 (reviews 2c, 5 and 8): one self-contained hunk with its own native check. It is not inside the backButton block (392-404) and not inside `if (window.BankConnect)`. |
| eslint.config.cjs + src/bank-connect.js | src rules block; _isoDay | after 145; 807 | Integrator only, after U2 and U4 merge, if D-U4-7 is accepted: the no-restricted-syntax rule, plus an eslint-disable-next-line comment with its reason on bank-connect.js:807. |
| tests/unit/netFlowLocalDates.test.js | new file | new | BUG-28 tests and the _localYMD contract (TZ Europe/Rome). |
| tests/unit/customRangePresets.test.js | new file | new | BUG-67 (Rome and Martinique), BUG-68 arrows and D-U4-4. |
| tests/unit/periodRollover.test.js | new file | new | BUG-69 store tests, plus the stale ‹ ›, FilterModal and Today tests and the main.js source wiring. |
| tests/e2e/local_dates.spec.js | new file | new | One spec with timezoneId Europe/Rome and explicit-offset clocks: - BUG-28 widget; - BUG-67 preset; - BUG-69 report path; - BUG-69 resume (its own test); - BUG-69 stale Today; - one integration-only default-date check (U2).  Written blind and verified at integration, including a run on efcac0c that must fail. |

**Dependencies.** **U2 (BUG-38) consumes U4's helper.**
- U2's draft asks for `Store.localDateKey(input?)` with null/undefined → today. The sanctioned helper is `Store._localYMD(value)`; U2 must not define another one.
- Contract:
  - a call with no arguments returns today;
  - null, undefined or '' returns '';
  - a bare 'YYYY-MM-DD' passes through unchanged;
  - a Date, epoch ms or ISO timestamp returns its local day.
- Today defaults (views.js:1504, views.js:3964, and the ADD_ACCOUNT fallback at store.js:1155): use `Store._todayYMD()` (already on main at 4270).
- UPDATE_ACCOUNT fallback (store.js:1189): use `createdAt ? Store._localYMD(createdAt) : Store._todayYMD()` (reviews 4 and 11).
- Recurrence-end defaults (views.js:1886-1888, 2248-2250): use `_calculateNextRecurrenceDate(date, 5, 'years')`.
- U4 commits the helper first, as a pure addition, so U2 can cherry-pick it. If U2's code says `localDateKey`, the integrator renames the calls at merge.
- The e2e default-date check in local_dates.spec.js needs U2's BUG-38 fix.

**U7 (BUG-34) renames `dispatch(` to `_reduce(` and leaves its body untouched.** U4's edits sit inside that body, at SET_VIEW, the new ROLL_PERIODS, NAVIGATE_PERIOD, UPDATE_FILTERS and CLEAR_ALL_FILTERS; only the context lines shift. ROLL_PERIODS and the rolls write no StackdDB slice, so the journal records nothing. export.js:318 is outside U7's 3-13 hunk.

**U8.** U8 owns the computeNetFlowData predicate (3474-3484); U4 owns 3403-3472. U8's optional currency rider in CategoryDonutChart sits near openInHistory (2639-2650), which U4 deliberately leaves unchanged (D-U4-8).

**U9 (BUG-86/87).**
- U4 does not edit router.js, so 182-187 is free.
- leaveTo('#transactions') still goes through handleRouteChange → SET_VIEW, which is where the post-save roll lives.
- U4's main.js hunk (after 614) is away from the backButton block.
- If a unit edits case 'SET_VIEW', keep U4's two lines at its top.

**BUG-24 (escaping) owner, if it edits components.js widely.** U4's components.js hunks are 1096-1098, 1126-1285, 1461-1466 and, under D-U4-7, 1822.

**Outside this round:**
- BUG-115: Today on a deliberately past period. Its fix subsumes U4's Today change.
- BUG-64: setMonth overflow; rolled periods anchor on the 1st.

**Integrator:**
- one ?v= bump for store.js, components.js and main.js (plus export.js under D-U4-7);
- the D-U4-7 lint rule after U2 and U4 merge, then `npm run lint`;
- run local_dates.spec.js on efcac0c and confirm it fails;
- CLAUDE.md notes:
  - `Store._localYMD(x)` / `_todayYMD()` are the only local 'YYYY-MM-DD' formatters, and `_calculateNextRecurrenceDate` shifts dates (negative steps allowed);
  - History and Analytics periods that contain today follow the calendar: `_rollLivePeriods` on SET_VIEW, ROLL_PERIODS (resume, History's Today) and before every filter action;
  - FilterModal never sends the period.

**Existing tests affected.** **No existing test needs to change.** I applied the final design to a scratch copy, scratchpad/u4f2 (the repo was not touched), with android/, ios/ and tools/ copied so versionSync and nativeWiring run too.
- The whole unit suite passes: 103 files and 1,119 tests, including 16 new ones.
- eslint reports nothing on the edited files.

**Why existing tests stay green:**
- **todayNavigation.test.js:** the clock does not change between init and the click, so ROLL_PERIODS is a no-op and the synchronous scrollToToday(container) path the test asserts is unchanged.
- **Filter suites** (clearFilters, periodFiltering, datetimeSorting): they keep a fixed clock after init, so every new reconcile call is a no-op. The numeric NAVIGATE_PERIOD payload still works, because its page is null and both pages reconcile.
- **nativeWiring:** its backButton test slices 600 characters after addListener('backButton'). The resume listener lives in a separate hunk after the boot emit, so that slice is unaffected.
- **Widget and insight suites:** they pin mid-month noon, so the bucket fix cannot change them.
- **periodLabelYear:** its boot-month assertions hold.

**E2E:**
- No existing spec crosses midnight. history_scroll, wallet_account_filter, bank_connect, loan_restore and debt_simulator all install mid-month or noon clocks.
- i18n_core.spec.js:113-119 (the calendar title is the current local month) keeps passing.
- home_widgets.spec.js:381 only checks that the canvas renders.

**New tests, all failing on efcac0c:**
- netFlowLocalDates.test.js: BUG-28, plus the _localYMD contract including null, undefined and ''.
- customRangePresets.test.js: BUG-67, BUG-68 and D-U4-4.
- periodRollover.test.js: BUG-69, including stale ‹ ›, FilterModal Apply, stale Today and the main.js source wiring.
- Targeted mutation checks confirmed that the FilterModal and NAVIGATE_PERIOD tests each fail when only their hunk is reverted.

**One blind e2e spec,** tests/e2e/local_dates.spec.js:
- timezoneId Europe/Rome, and every clock is an ISO string with an explicit offset;
- resume is its own test, and it asserts the store period and a month-specific figure, not just the label;
- verified at integration, including a run on efcac0c that must fail.

**TZ pinning:** every new unit test sets process.env.TZ, following periodLabelYear.test.js. The owner's Lisbon machine (UTC+0 in winter) and CI (UTC) both hide these bugs.

## U5 — Accounts lifecycle and onboarding

This is the final U5 design after the adversarial review. I checked each of the 15 review issues against efcac0c. Every one is right in substance (several are duplicates of each other). Two of them carried a wrong detail, which I corrected instead of adopting.

Accepted and folded into the design:
- BUG-29, filter write path (issues 1 and 8). router.js:174-180 re-dispatches `?account=<id>` without checking it. A stale `#transactions?account=<deleted>` entry (web Back/Forward, reload, bookmark) therefore put the dead id back after the prune.
  - UPDATE_FILTERS now keeps only ids that name an account (D-U5-9).
  - One existing fixture changes: clearFilters.test.js:41-54 filters by a fake 'acc-1' that names no account.
- BUG-29, cross-tab (issues 2 and 8). The `stackd_v1_accounts` listener branch now prunes the other tab's session-only History and Analytics filters. It saves nothing; the tab that deleted saves the persisted slices.
- BUG-29, default promotion (issues 4 and 13). D-U5-1 now promotes the first primary-currency account by name. A foreign account no longer becomes the DEFAULT that New Log and the loan prefill (views.js:4456) preselect.
- BUG-29, boot robustness (issue 12):
  - Array.isArray guards on homeWidgets, bankConnections and each mapping list, so a corrupt key cannot crash boot.
  - The boot heal is skipped when there are no accounts but there are transactions. Only an unreadable accounts key produces that state, and pruning then would wipe every reference for good, file mirror included.
- BUG-29, e2e (issue 6). The History check could not fail before: on Home the chip never renders, and with two accounts it is hidden (views.js:982). It now runs in History with three accounts (Pro seeded) and also covers a stale `?account=` hash.
- BUG-30, existing test (issue 9). accountColorSelection.test.js mocks Store without findAccountByName, so its new-account test would throw. The mock gains `findAccountByName: () => null`, which keeps BUG-11's unguarded call pattern.
- Bank Connect rider (issues 5 and 11):
  - The Import click validates every row before it creates anything. A currency mismatch used to throw after 'new' rows had already created accounts, outside the try, and every retry created another account.
  - The 'Create “…”' option shows the suffixed name that will actually be created.
- BUG-24 sink (issue 14). views.js:4307 puts account.name unescaped into the delete sheet's innerHTML, and BUG-24's sink list misses it. U5 escapes it in a new rider.
- BUG-40 layout (issue 15). The welcome sheet keeps its drag handle as an invisible spacer, so the first screen does not shift up by about 28 px.
- Back rider (issues 7 and 10): dropped. U9's BUG-87 design already changes views.js:4298 and 4316 to `leaveTo('#dashboard')`. The rider was web-only anyway: both handlers land on #dashboard, where Android Back exits (router.js:153).

Corrected rather than adopted:
- Issue 3 (import draft). The draft's "already guarded" claim was wrong and is withdrawn: the guard at views.js:5520-5523 runs only when a draft is created. The issue cannot be handed to U6 as the reviewer suggested, because U6's only views.js region is 3816-3844, not ImportMapView. It becomes a web-only accepted limit with a follow-up (D-U5-10). Android cannot reach it, because every account delete lands on Home and Back there exits.
- Issue 1's Android path (through U9's history.back()) cannot happen, for the same reason. The store-side fix still covers the web paths.

Kept from the draft:
- BUG-40: the `dismissible` option and the SET_LANGUAGE dispatch. That change also fixes a factory reset in Italian, which today reopens the welcome sheet reading 'Lingua: English' and switches the app back to English on Get Started.
- BUG-30: findAccountByName and the inline form check.
- The RESET_APP prefs reset (D-U5-3).

This round also closes the 1.0.1 follow-up "stale deleted-account ids remain in widget configs, filters and defaultAccountId" (docs/deep-test-fixes-plan.md:275-276). New i18n keys: one, `account.duplicateName`, in all five dictionaries.

### BUG-29 — Deleting an account leaves its id in saved views and widgets, so Home's total reads €0.00 _(gate, effort M)_

**Root cause.** Confirmed at efcac0c. src/store.js:1224-1276 DELETE_ACCOUNT filters only state.accounts (1226) and state.transactions (1269). It never touches the other slices that name accounts by id:
- expandedGraphFilters.accounts: persisted, loaded at store.js:244-248.
- historyFilters.accounts and analyticsFilters.accounts: session only, defaults at store.js:86-103.
- homeWidgets[].config.accountIds: persisted, store.js:229-234.
- defaultAccountId: persisted, store.js:220.
- bankConnections[].accounts[].stackdAccountId: persisted, store.js:238.

Every reader treats an empty list as all accounts and a non-empty list as an explicit selection, so a list holding only the dead id matches nothing:
- views.js:395-397 passes savedFilters.accounts as is. getBalanceAtDate's explicit branch is `accountIds.includes(t.accountId)` (store.js:2967), so TOTAL BALANCE reads €0.00 (views.js:412).
- views.js:491-493 hasCustomFilters compares counts, so Reset View is hidden.
- views.js:982-989: the History chip falls back to the raw id. It shows only while the selection is shorter than the account list.
- widgets.js:115, 131, 614 and 627 pass config.accountIds as is, so _multiChips shows neither All nor any account active.
- store.js:1162-1168: ADD_ACCOUNT sets a default only for the first account, so a stale default is never replaced.

Three more paths put or keep a dead id in place:
- router.js:174-180 dispatches UPDATE_FILTERS {accounts:[params.account], replace:true} for any `#transactions?account=` hash, and UPDATE_FILTERS (store.js:2674-2700) never checks the id. The wallet tile pushes exactly that hash (views.js:571). On the web, Back/Forward to that entry, a reload or a bookmark re-applies the dead id after any prune. Android cannot reach such an entry: every account delete lands on #dashboard, and Back there returns 'exit' (router.js:153).
- The storage listener (store.js:466-498) has no case for stackd_v1_expandedGraphFilters or stackd_v1_defaultAccountId. Its accounts branch (473) also leaves the other tab's session filters holding the dead id.
- RESET_APP (store.js:2299-2326) keeps expandedGraphFilters and defaultAccountId. Restoring a pre-1.0.2 backup re-creates the accounts under new ids (import.js:1298), so a reset followed by a restore shows €0.00 again.

**Fix.** One store helper, `_pruneAccountRefs(opts)`, inserted after _healOrphanTransferLegs (after store.js:709). Its rule: drop every id that no longer names an account in state.accounts, and save only the slices that changed. Anything that is not an array (a corrupt key) is left alone, never iterated. It covers:
- historyFilters and analyticsFilters accounts: session only, never saved. These are the only slices touched when `{sessionOnly: true}`.
- expandedGraphFilters.accounts: saved.
- every homeWidgets[].config.accountIds: saved once.
- defaultAccountId, when it names no account (D-U5-1): the first remaining primary-currency account by name, else the first by name, else ''. A deliberately cleared '' is never touched.
- bankConnections mappings: stackdAccountId set to null (D-U5-8).

Call sites:
(1) DELETE_ACCOUNT, right after the accounts save at store.js:1228. Unconditional.
(2) Store.init, inserted after store.js:453, before the v0.98 heals. This is the boot heal for installs that already hold stale ids. It is skipped when there are transactions but no accounts: DELETE_ACCOUNT removes the account's rows and a reset removes all of them, so only an unreadable accounts key produces that state.
(3) The storage listener's accounts branch (store.js:473) calls it with {sessionOnly: true}. It saves nothing; the tab that deleted saves the persisted slices, and this tab reloads them through their own events.

Also:
(4) UPDATE_FILTERS (insert after store.js:2693) keeps only ids that name an account (D-U5-9). This covers the router's `?account=` deep link and any other tab's filter sheet. An emptied list means unfiltered, which is the report's expected 'History opens unfiltered'.
(5) Two new storage-listener cases (after store.js:481) reload expandedGraphFilters and defaultAccountId in other tabs.
(6) RESET_APP (insert after store.js:2318) saves the fresh-install expandedGraphFilters and defaultAccountId '' next to the widget re-seed (D-U5-3).

Why this is the smallest correct change: one rule, in one store helper, applied where ids enter or outlive their account: delete, boot, cross-tab, and the one write path that accepts ids from a URL. An empty list already means "all", so dropping an id can only widen a selection and never hides a live account. The read-side alternative needs 7+ edits in BUG-36's regions and still leaves wrong values on disk. No view, widget, router or component file changes.

**Sketch.**

```js
// store.js — new method, insert after line 709 (_healOrphanTransferLegs)
  // 1.0.2 (BUG-29): every slice that names accounts by id. Readers treat an
  // empty list as "all accounts", so a list left holding only a deleted id
  // matched nothing (Home and scoped widgets read €0.00, History showed a
  // raw-id chip). Drops every id that no longer names an account and saves
  // only what changed; dropping an id only widens a selection back towards
  // "all", it never hides a live account. { sessionOnly: true } (cross-tab)
  // touches only the never-saved History/Analytics filters: the tab that
  // deleted saves the persisted slices itself. Non-array slices (a corrupt
  // key) are left alone rather than crash boot.
  _pruneAccountRefs(opts) {
    const known = new Set(this.state.accounts.map(a => a.id));
    const stale = (ids) => Array.isArray(ids) && ids.some(id => !known.has(id));
    const live = (ids) => ids.filter(id => known.has(id));
    ['historyFilters', 'analyticsFilters'].forEach(key => {
      const f = this.state[key];
      if (f && stale(f.accounts)) this.state[key] = { ...f, accounts: live(f.accounts) };
    });
    if (opts && opts.sessionOnly) return;
    const eg = this.state.expandedGraphFilters;
    if (eg && stale(eg.accounts)) {
      this.state.expandedGraphFilters = { ...eg, accounts: live(eg.accounts) };
      window.StackdDB.save('expandedGraphFilters', this.state.expandedGraphFilters);
    }
    const ws = this.state.homeWidgets;
    if (Array.isArray(ws) && ws.some(w => w && w.config && stale(w.config.accountIds))) {
      this.state.homeWidgets = ws.map(w => (w && w.config && stale(w.config.accountIds))
        ? { ...w, config: { ...w.config, accountIds: live(w.config.accountIds) } } : w);
      window.StackdDB.save('homeWidgets', this.state.homeWidgets);
    }
    const def = this.state.defaultAccountId;
    if (def && !known.has(def)) {
      // D-U5-1: the first primary-currency account by name (the test
      // _ensureForeignIdx uses, inlined: at boot the memo may predate this
      // state), else the first by name, else ''.
      const byName = this.state.accounts.slice().sort((a, b) => this.compareAlpha(a, b));
      const pick = byName.find(a => !a.currency || a.currency === this.state.currency) || byName[0];
      this.state.defaultAccountId = pick ? pick.id : '';
      window.StackdDB.save('defaultAccountId', this.state.defaultAccountId);
    }
    const dead = (m) => m && m.stackdAccountId && !known.has(m.stackdAccountId);
    const hasDead = (c) => c && Array.isArray(c.accounts) && c.accounts.some(dead);
    const cs = this.state.bankConnections;
    if (Array.isArray(cs) && cs.some(hasDead)) { // D-U5-8
      this.state.bankConnections = cs.map(c => hasDead(c)
        ? { ...c, accounts: c.accounts.map(m => dead(m) ? { ...m, stackdAccountId: null } : m) } : c);
      window.StackdDB.save('bankConnections', this.state.bankConnections);
    }
  },

// init(), insert after line 453 (before the v0.98 heal comment at 455):
    // 1.0.2 (BUG-29): installs that deleted an account on 1.0/1.0.1 still
    // hold its id in the saved Home view, widget scopes, default wallet and
    // bank mappings. Skipped when there are rows but no accounts: only an
    // unreadable accounts key gives that state (DELETE_ACCOUNT removes the
    // account's rows, a reset removes all), and pruning then would wipe every
    // reference for good, file mirror included.
    if (this.state.accounts.length > 0 || this.state.transactions.length === 0) this._pruneAccountRefs();

// storage listener — line 473 becomes:
        if (e.key === 'stackd_v1_accounts') {
          this.state.accounts = window.StackdDB.load('accounts', []);
          this._pruneAccountRefs({ sessionOnly: true }); // 1.0.2 (BUG-29): this tab's History/Analytics filters
          changed = true;
        }
// and after line 481:
        if (e.key === 'stackd_v1_expandedGraphFilters') { this.state.expandedGraphFilters = window.StackdDB.load('expandedGraphFilters', { interval: 'monthly', accounts: [], categories: [] }); changed = true; } // 1.0.2 (BUG-29)
        if (e.key === 'stackd_v1_defaultAccountId') { this.state.defaultAccountId = window.StackdDB.load('defaultAccountId', ''); changed = true; } // 1.0.2 (BUG-29)

// DELETE_ACCOUNT, insert after line 1228 (window.StackdDB.save('accounts', ...)):
        this._pruneAccountRefs(); // 1.0.2 (BUG-29)

// RESET_APP, insert after line 2318 (D-U5-3):
        // 1.0.2 (BUG-29): reset = fresh install. The saved Home view and the
        // default wallet name accounts and categories the reset wipes (a
        // restore from a pre-1.0.2 backup re-creates them under new ids).
        this.state.expandedGraphFilters = { interval: 'monthly', accounts: [], categories: [] };
        window.StackdDB.save('expandedGraphFilters', this.state.expandedGraphFilters);
        this.state.defaultAccountId = '';
        window.StackdDB.save('defaultAccountId', '');

// UPDATE_FILTERS, insert after line 2693 (this.state[key] = { ...base, ...filters };) — D-U5-9:
        // 1.0.2 (BUG-29): never keep an account id that names no account. A
        // stale #transactions?account=<deleted> entry (web Back/Forward,
        // reload, bookmark; router.js:174-180) or another tab's filter sheet
        // re-applied it, and History showed a raw-id chip and no rows. An
        // emptied list means unfiltered.
        if (Array.isArray(this.state[key].accounts)) {
          const known = new Set(this.state.accounts.map(a => a.id));
          this.state[key].accounts = this.state[key].accounts.filter(id => known.has(id));
        }
```

**Data repair.** Yes: a boot heal. `_pruneAccountRefs()` runs once in Store.init, inserted after store.js:453.
- Timing: it runs after every slice it reads has loaded (lines 209-248) and before the first render.
- It is idempotent and saves only the slices it actually changed, so a consistent install writes nothing. Writes go through StackdDB, so the native mirror follows.

No false positives:
- These lists only ever hold account ids. There is no sentinel: the widget "All" chip stores [] (widgets.js:222-223), and Select All in the expanded graph stores real ids.
- Pruning only widens a selection, or turns it into "all".
- Session filters are rebuilt at boot anyway.

The one dangerous input is an unreadable accounts key: StackdDB.load returns [], and pruning would null every scope, mapping and the default. The guard skips the heal when there are no accounts but there are transactions.
- On a fresh install, after a reset, or after the last account was deleted, the transactions are empty too, so the heal still runs.
- On an install whose last account was deleted while orphan rows survived, the heal waits until the next boot with an account, when it runs normally.
- If U6's id-keeping restore later brings the accounts back, the preserved references are valid again.

The RESET_APP reset (D-U5-3) needs no repair for old installs, because the heal covers them.

**Tests (each fails on the current code).**

- NEW tests/unit/accountDeleteRefs.test.js. Setup:
- executeFile chain db → i18n → i18n/en → loan-engine → store, adding components → widgets → views for the cases that render;
- fake Date 2026-10-04 12:00;
- mapStorage like accountDeleteTransfers.test.js:15, with stackd_v1_homeWidgets '[]' unless a case seeds widgets.
Every case fails on efcac0c unless marked as a guard.
- 1. Saved Home view holding only the deleted account. Main Checking 2500 and Savings Pot 5000, both opened 2026-09-01. SAVE_EXPANDED_GRAPH_FILTERS {accounts:[savingsId]}, then DELETE_ACCOUNT savingsId.
- state.expandedGraphFilters.accounts is [], and the stored stackd_v1_expandedGraphFilters equals it.
- Views.DashboardView.render(state) shows formatCurrency(2500) under TOTAL BALANCE, not formatCurrency(0), and contains no 'Reset View'.
- 2. A multi-account saved view keeps its live ids: [mainId, savingsId], delete Savings → [mainId], persisted.
- 3. History and Analytics filters drop the id on delete.
- UPDATE_FILTERS {page:'history', filters:{accounts:[holidayId]}, replace:true}, and the same for analytics.
- Add a €42.50 Main expense, then DELETE_ACCOUNT holidayId.
- Both .accounts are [], and getFilteredTransactions('history') contains the €42.50 row.
- 4. UPDATE_FILTERS drops unknown ids (D-U5-9).
- After DELETE_ACCOUNT holidayId, dispatch {page:'history', filters:{accounts:[holidayId]}, replace:true}, which is what router.js:174-180 sends for a stale #transactions?account= hash. historyFilters.accounts is [], and the €42.50 Main row is listed.
- {page:'analytics', filters:{accounts:[mainId, holidayId]}} gives [mainId].
- 5. Widget scopes.
- netWorth {accountIds:[savingsId]} becomes [].
- categories {accountIds:[mainId, savingsId]} becomes [mainId], and its other config keys are kept.
- latest {} is untouched (deep-equal).
- stackd_v1_homeWidgets is saved once.
- Widgets.registry.netWorth renders formatCurrency(2500), not formatCurrency(0).
- 6. Default promotion (D-U5-1). SET_CURRENCY 'EUR'; add 'Amex' (USD), 'Main' (EUR) and 'Savings' (EUR); SET_DEFAULT_ACCOUNT Savings.
- Delete Savings: defaultAccountId is Main's id, not Amex's (Amex sorts first by name), and it is saved.
- Make Main the default and delete it, leaving only Amex: Amex becomes the default.
- Delete Amex: defaultAccountId is ''.
- 7. Guard: deleting a non-default account keeps the default, and a deliberately cleared default ('') stays '' after a delete.
- 8. A Bank Connect mapping to the deleted account becomes stackdAccountId null; a mapping to Main is untouched; bankConnections is saved.
- 9. Guard: DELETE_ACCOUNT {id:'no-such-account'} on a consistent install saves none of expandedGraphFilters, homeWidgets, defaultAccountId or bankConnections (spy on StackdDB.save).
- 10. Boot heal. Seed storage with:
- accounts [Main];
- expandedGraphFilters {accounts:['gone']};
- homeWidgets [{type:'netWorth', config:{accountIds:['gone']}}];
- defaultAccountId '"gone"';
- bankConnections [{ref:'r', accounts:[{bankAccountId:'b', stackdAccountId:'gone'}]}].
After Store.init(), every reference is pruned in state and in the stored JSON, and defaultAccountId is Main's id.
- 11. Guard: the boot heal on a consistent seeded install calls StackdDB.save for none of those four keys.
- 12. Guard: unreadable accounts key. Seed the same storage as case 10, but with stackd_v1_accounts '{broken' and one transaction row. After Store.init(), the widget scope, defaultAccountId 'gone' and the bank mapping are unchanged in state and in storage.
- 13. Guard: non-array slices. homeWidgets '{}' and bankConnections '{"x":1}': Store.init() does not throw, and neither key is re-saved.
- 14. RESET_APP saves {interval:'monthly', accounts:[], categories:[]} and an empty defaultAccountId (D-U5-3). Today both keep their previous values.
- 15. Cross-tab reload: with window.addEventListener captured by a stub, a storage event for stackd_v1_expandedGraphFilters reloads that slice into state, and one for stackd_v1_defaultAccountId does the same. Today both are ignored.
- 16. Cross-tab session filters:
- With historyFilters and analyticsFilters at [holidayId], write stackd_v1_accounts without Holiday into storage and fire {key:'stackd_v1_accounts'} on the captured listener.
- Both .accounts become [], and StackdDB.save is not called for any key.
Today the dead id stays.
- NEW tests/e2e/accounts_lifecycle.spec.js, test 'deleting an account resets every view scoped to it'.
Setup:
- addInitScript sets stackd_v1_setup_done '1', stackd_v1_homeWidgets '[]' and stackd_v1_pro {active:true, productId:'stackd_pro', platform:'play', purchasedAt:'2026-09-01T00:00:00.000Z'} (as pro_paywall.spec.js:233 does);
- page.clock.install({ time: new Date(2026, 9, 4, 12, 0, 0) }).
Steps:
- Create Main Checking €2,500.00, Savings Pot €5,000.00 and Holiday Fund €800.00, all dated 01/09/2026.
- Add a €42.50 Groceries expense on Main Checking dated 02/10/2026 (Store.dispatch is fine).
- Add a Net worth widget scoped to Savings Pot through the configure sheet.
- Chart → Filter → untick Main Checking and Holiday Fund → Save View.
- Tap the Savings Pot wallet tile, then the Home tab.
- Savings Pot ⋯ → Delete Account → Yes, Delete Everything.
Expect:
- The Home TOTAL BALANCE and the widget value contain 3,257.50.
- The History tab shows no #history-account-filter-chip and lists the 42.50 row.
- After setting location.hash to '#transactions?account=' + savingsId: still no chip, and the row is listed.
- After page.reload(): Home and the widget still read 3,257.50.
Fails today: €0.00 on Home and on the widget, and a raw-UUID chip in History.

**Risks.** Product-visible changes:
- When the deleted account was the default, a remaining primary-currency account gets the DEFAULT badge and moves first on Home (views.js:421-425) (D-U5-1).
- A widget or saved view scoped only to the deleted account silently widens to All (D-U5-2).
- A History link to a deleted account opens History unfiltered (D-U5-9).
- Factory reset also forgets the saved chart interval and category filter (D-U5-3).

Accepted limit, web only (D-U5-10): an import draft (Views._ImportShared.draft) keeps its accountId. The guard at views.js:5520-5523 runs only when a draft is created. On the web, browser Back/Forward into an abandoned #import-map or #import-preview after deleting that account would commit rows to the dead id (views.js:6196, 6228). Those rows count as primary (store.js:2885-2887).
- Android cannot reach it: every account delete lands on Home, and Back there exits.
- Follow-up for whoever owns the import views: re-validate d.accountId when ImportMapView and ImportPreviewView render, with the same fallback as startCsv.
- The store must not reach into Views.

Interaction with BUG-36 (U8): once stale ids are gone, an explicit list of only foreign-currency accounts still hits BUG-36's raw-sum problem. U5 deliberately leaves the read side to U8.

Interaction with BUG-39 (U2): its New Log fallback applies only when no default exists. After U5 the default is never stale, so the two rules never contradict each other.

Sibling issue, not fixed here: stale CATEGORY ids in the saved view and in widget categoryIds. DELETE_CATEGORY deletes only unused categories (store.js:2157-2166), so no total changes; this is a follow-up.

Invariants kept:
- StackdDB only.
- The store stays ungated, and no stored data is translated.
- No memo invalidation is needed: the helper changes no accounts or transactions, and it runs inside dispatch or before init's _sortData (store.js:502).
- UPDATE_FILTERS still persists only historyFilterSortOrder.

### BUG-40 — Mandatory welcome sheet closes on an outside tap or swipe, leaving USD and mixed languages _(gate, effort S)_

**Root cause.** Confirmed at efcac0c. Components.Modal.show binds swipe-to-dismiss on every sheet: touchstart, touchmove and touchend on the backdrop (components.js:261-263), and onEnd closes once the drag exceeds 150 px (components.js:252-254). It also binds a backdrop click that calls boundClose → hide() (components.js:286-291). Its options (components.js:191-197) cannot turn either off.

_showRegionSetupModal (main.js:831-858) passes only showCancel:false (from 1.0.1 BUG-20). D4h covers Back only, through _BACK_SWALLOW matching #setup-row-currency (components.js:329, 342). hide() runs none of onSave, so SET_LANGUAGE (840), setup_done (843) and SET_CURRENCY (855) are all skipped, and the EUR the sheet showed is never applied.

The language row's onSelect (main.js:890-897) calls window.I18n.setLang(code) at line 895 without dispatching SET_LANGUAGE. I18n.lang becomes 'it' while state.language and storage stay 'en'. Settings then reads 'Lingua: English', and the bottom nav, which is rebuilt only when state.language changes (main.js:549), stays English.

Related: the sheet always preselects 'en' (main.js:736), whatever the stored language. RESET_APP keeps the language key and clears setup_done (store.js:2299-2326). A factory reset in Italian therefore reopens the sheet in Italian but reading 'Lingua: English', and Get Started dispatches SET_LANGUAGE 'en'.

**Fix.** Components.Modal.show gets a `dismissible` option, default true, so every existing caller is unchanged. With dismissible:false it:
- binds neither the three touch handlers nor the backdrop click handler;
- renders the .modal-handle with visibility:hidden and aria-hidden="true". It stays as a spacer, so the layout matches every other sheet (components.css:921-927: 4 px plus a var(--space-6) margin), but nothing invites a drag;
- puts `data-back-swallow` on #active-modal, which makes D4h generic. _BACK_SWALLOW already matches it (components.js:329), and dismissTopSheet returns early on it (342).

_showRegionSetupModal passes dismissible:false. The sheet then closes only through Get Started, or through its owner's own Modal.hide() in the language re-show path (main.js:896), which still works because hide() is not a handler.

The language row dispatches SET_LANGUAGE instead of calling I18n.setLang (main.js:895). SET_LANGUAGE (store.js:2520-2528) sets I18n.lang, persists, and emits, which re-renders the view under the sheet and rebuilds the nav. All of that happens outside #modal-container, so the sheet is untouched.

Because the language is now saved before Get Started, the sheet preselects it: main.js:736 becomes `initialLanguage || _st.language || 'en'`. Two cases then behave consistently:
- a relaunch before Get Started reopens the sheet in Italian, reading 'Lingua: Italiano';
- after a factory reset the sheet keeps the language in use, and Get Started no longer switches it back to English.

This is the smallest change: two guarded handler bindings and two attributes in a shared helper, plus 3 lines in main.js. No new sheet component, no CSS change and no Router change.

**Sketch.**

```js
// components.js Modal.show — options (lines 191-197) gain:
        deleteText,
        // 1.0.2 (BUG-40): false = a mandatory sheet (first-run welcome): no
        // backdrop-tap or swipe-down close, and Android Back swallowed via
        // [data-back-swallow] (D4h). Only its own buttons, or its owner's
        // Modal.hide(), close it. The drag handle stays as an invisible
        // spacer so the layout matches every other sheet.
        dismissible = true
      } = options;
// markup (lines 200-202):
        <div class="modal-backdrop" id="active-modal" role="dialog" aria-modal="true" aria-labelledby="modal-title"${dismissible ? '' : ' data-back-swallow'}>
          <div class="modal-content">
            <div class="modal-handle"${dismissible ? '' : ' style="visibility: hidden;" aria-hidden="true"'}></div>
// lines 261-263:
      if (dismissible) { // 1.0.2 (BUG-40)
        backdrop.addEventListener('touchstart', onStart, { passive: true });
        backdrop.addEventListener('touchmove', onMove, { passive: true });
        backdrop.addEventListener('touchend', onEnd);
      }
// lines 286-291:
      const backdropEl = document.getElementById('active-modal');
      if (backdropEl && dismissible) { // 1.0.2 (BUG-40)
        backdropEl.addEventListener('click', (e) => { if (e.target === backdropEl) boundClose(); });
      }

// main.js _showRegionSetupModal
  // 1.0.2 (BUG-40): the language is saved the moment it is picked, so a
  // relaunch before Get started (or after a Factory reset, which keeps the
  // language) reopens the sheet in it instead of claiming 'English'.
  let selectedLanguage  = initialLanguage || _st.language || 'en';          // line 736
  ...
    showCancel: false,
    dismissible: false, // 1.0.2 (BUG-40): a tap outside or a swipe used to close it unsaved   (insert after line 837)
    onSave: (close) => { ...unchanged... }
  ...
        onSelect: (code) => {
          if (code === selectedLanguage) return;
          selectedLanguage = code;
          // 1.0.2 (BUG-40): through the store, so I18n.lang, state.language,
          // storage and the bottom nav switch together (setLang alone left
          // Settings reading 'Lingua: English' in an Italian UI).
          window.Store.dispatch('SET_LANGUAGE', code);                        // was window.I18n.setLang(code), line 895
          window.Components.Modal.hide();
          setTimeout(() => _showRegionSetupModal(selectedCurrency, selectedLanguage), 320);
        }
```

**Data repair.** None needed.
- Installs where the sheet was tapped away never saved setup_done, so _finishBoot re-shows the sheet at the next launch (main.js:659-663).
- The I18n/state divergence was never persisted.
- 1.0.1 BUG-01 already preselects the base currency those installs use (main.js:733-735).
- Accounts created in USD by mistake are left as they are. Changing them would be a currency decision, which BUG-01's confirm owns.

**Tests (each fails on the current code).**

- tests/unit/modalButtons.test.js, new describe 'Non-dismissible sheets (1.0.2 BUG-40)':
(a) Modal.show({dismissible:false}): add .open, then dispatch a backdrop MouseEvent click → the sheet is still .open. Fails today.
(b) Synthetic touch events with .touches on #active-modal (touchstart y=100, touchmove y=350, touchend), then vi.advanceTimersByTime(300) → still .open, and #modal-container is not emptied. Fails today.
(c) The .modal-handle is present with style.visibility 'hidden' and aria-hidden="true", and #active-modal has the data-back-swallow attribute. A default sheet's handle has no inline visibility, and its #active-modal has no data-back-swallow. Fails today.
(d) Guard: a default sheet still closes on a backdrop tap and on a swipe longer than 150 px.
- tests/unit/androidBack.test.js, swallowed sheets (D4h): a dismissible:false Modal with no setup rows and no Cancel → Components.dismissTopSheet() returns true and the sheet stays .open. Fails today: the backdrop fallback closes it.
- tests/unit/currencySwitch.test.js, new describe 'Welcome sheet stays put (1.0.2 BUG-40)', reusing loadRegionSetup and freshWindow. Load i18n/it.js after i18n/en.js in this describe.
(a) A backdrop click and a 250 px synthetic swipe leave #setup-row-currency in the DOM, never save stackd_v1_setup_done, and leave the currency at the store default. Fails today.
(b) Open the language row and pick data-code="it": SET_LANGUAGE 'it' is dispatched, state.language === 'it', I18n.lang === 'it', and stackd_v1_language is saved. Fails today: state stays 'en'.
(c) freshWindow returns '"it"' for stackd_v1_language and null for setup_done. This covers both a relaunch before Get Started and the state after a factory reset. show() renders #setup-language-subtitle 'Italiano' and the Italian welcome title, and Get Started leaves state.language 'it'. Fails today: the subtitle reads 'English' and Get Started switches to 'en'.
(d) Guard: Get Started still applies EUR and the language and saves setup_done (existing 'fresh install' test).
- tests/e2e/welcome_modal.spec.js, new test 'a tap outside or a swipe never closes the welcome sheet'. Use test.use({ hasTouch: true, viewport: { width: 412, height: 839 } }) and the Touch-constructor pattern from home_widgets.spec.js:141-148.
- page.touchscreen.tap(200, 150) on the dimmed area.
- A synthetic touchstart/touchmove/touchend swipe of 300 px down from the sheet's top, then wait 400 ms.
- Expect #setup-row-currency visible and localStorage stackd_v1_setup_done null.
- Pick Italiano, then expect Store.getState().language === 'it'.
- Inizia → setup_done '1' and currency EUR.
Fails today.

**Risks.** - Co-dependent cache-busting: main.js passes an option that only the new components.js honours. Under a stale cached components.js the sheet behaves as today, with no crash. The integrator must bump ?v= for main.js and components.js together.
- Saving the language before Get Started is a product choice (D-U5-5). It cannot leak a half-finished onboarding, because the sheet can no longer be closed without Get Started.
- Existing behaviour that stays the same:
  - the language re-show path (hide → 320 ms → show);
  - the CurrencySwitchConfirm hand-off, which is a normal dismissible sheet. Cancelling it still finishes onboarding with the base unchanged (1.0.1 design);
  - the setup picker over the welcome sheet still closes on Back (existing androidBack test).
- Pre-existing, out of scope: any other Modal.show during onboarding replaces #modal-container and so removes the welcome sheet without setup_done. Examples are a Pro purchase-replay notice about 3 s after native boot, or a storage warning that BUG-34's unit (U7) might add. U7 should not open sheets before setup_done.
- Interaction with U9 (BUG-86/87 Back): U5 does not touch dismissTopSheet or _BACK_SWALLOW. It relies on '[data-back-swallow]' staying in _BACK_SWALLOW.

### BUG-30 — Duplicate account names are accepted, and a backup restore merges them into one account _(gate, effort S)_

**Root cause.** Confirmed at efcac0c:
- The EditAccountView save handler (views.js:4244-4300) reads the trimmed name (4247) and rejects only an empty one (4254-4259), both for new accounts (ADD_ACCOUNT, 4284) and for renames (UPDATE_ACCOUNT, 4262).
- Store.findCategoryByName (store.js:596-606, 1.0.1 BUG-11) has no account counterpart.
- Bank Connect's map step creates its account from BC.accountLabel without any check (views.js:6878-6880). The same label can repeat, for example after a reconnect, or for two IBAN-less accounts at one bank.
- The importer resolves accounts by lower-cased name (import.js:184-185, 1293). Any duplicate created in the UI therefore becomes one merged account on restore. That is U6's half.

**Fix.** Mirror BUG-11.
1) Add `Store.findAccountByName(name, exceptId)` right after findCategoryByName (insert after store.js:606). It trims and lower-cases both sides and checks across every currency and type (D-U5-6). It is UI-only: ADD_ACCOUNT and UPDATE_ACCOUNT stay ungated for imports, tests and Bank Connect.
2) In the EditAccountView save handler, keep a reference to the name input. After the empty check, compute `nameChanged` the same way as views.js:2728. If the name changed and findAccountByName(name, account && account.id) finds a clash, call showFieldError(nameInput, I18n.t('account.duplicateName', {name: clash.name})) and return before any dispatch or navigation.
   - The check runs only when the name actually changes. An existing duplicate pair can therefore still save colour, type or opening-balance edits (D-U5-7), and re-casing an account's own name ('visa' → 'Visa') is allowed.
   - showFieldError writes textContent, so the message must NOT be escaped (it is XSS-safe as is).
3) Bank Connect's 'Create account' keeps names unique too. See the Bank Connect rider, which lands with this bug.

Why this is the smallest change: one 7-line read helper and one guarded early return, the pattern the category forms already use. The store, import and export are untouched, because those belong to U6.

**Sketch.**

```js
// store.js — insert after findCategoryByName (after line 606)
  // 1.0.2 (BUG-30): same rule for accounts — trimmed, case-insensitive,
  // across every currency and type, because backups name an account by its
  // name. UI-only like findCategoryByName: ADD_ACCOUNT/UPDATE_ACCOUNT stay
  // ungated (imports, tests, Bank Connect).
  findAccountByName(name, exceptId) {
    const key = String(name == null ? '' : name).trim().toLowerCase();
    if (!key) return null;
    return (this.state.accounts || []).find(a =>
      a.id !== exceptId && String(a.name == null ? '' : a.name).trim().toLowerCase() === key
    ) || null;
  },

// views.js EditAccountView save handler (lines 4246-4259)
        btnSave.addEventListener('click', () => {
          const nameInput = document.getElementById('edit-acc-name');
          const name = nameInput.value.trim();
          ...(absOb, ob, dDate, type, makeDefault unchanged)
          if (!name) {
            // 1.0.1 (BUG-18) comment unchanged
            showFieldError(nameInput, window.I18n.t('account.nameRequired'));
            return;
          }
          // 1.0.2 (BUG-30): unique names (trimmed, case-insensitive, any
          // currency/type) — backups identify accounts by name, and a restore
          // merged two "Visa" accounts into one. Checked only when the name
          // changes, so an existing duplicate can still save other edits.
          const nameChanged = !account || name.toLowerCase() !== String(account.name == null ? '' : account.name).trim().toLowerCase();
          const clash = nameChanged ? window.Store.findAccountByName(name, account ? account.id : undefined) : null;
          if (clash) {
            showFieldError(nameInput, window.I18n.t('account.duplicateName', { name: clash.name }));
            return;
          }
          ...unchanged (UPDATE_ACCOUNT / ADD_ACCOUNT; line 4298 belongs to U9)
```

**Data repair.** None at boot (D-U5-7).
- Existing duplicates stay. Renaming them is the user's choice, and edits that do not rename still save.
- New backups are protected by U6's half: an AccountId column and id-first matching on import.
- Pickers keep showing both names until the user renames one.

**Tests (each fails on the current code).**

- NEW tests/unit/accountDuplicate.test.js. The harness is copied from categoryDuplicate.test.js: db, i18n, en, fr, loan-engine, store, components, views, and a Router stub {getParams, navigate: vi.fn()}. Every case fails on efcac0c unless marked as a guard.
1. Store.findAccountByName:
- it is trimmed, case-insensitive and currency/type-agnostic: ' visa ' finds 'Visa' (EUR, Credit card);
- it honours exceptId;
- '' and null return null.
Fails today: the function does not exist.
- 2. New mode: with 'Visa' existing, saving the name ' visa ' shows:
- #edit-acc-name-error reading 'An account called "Visa" already exists.';
- the field focused, with aria-invalid="true";
- still one account;
- Router.navigate not called.
- 3. Same name in another currency is refused (D-U5-6): 'Revolut' (USD) exists, and the new account 'revolut' has #edit-acc-currency EUR.
- 4. Renaming account B onto account A's name is refused, and A keeps its name. Re-casing an account's own name ('visa' → 'Visa') saves (UPDATE_ACCOUNT is dispatched).
- 5. Guard: an existing duplicate pair seeded via ADD_ACCOUNT can still save a colour-only edit without a rename.
- 6. In French (SET_LANGUAGE 'fr'), the error reads 'Un compte nommé « Visa » existe déjà.'
- EDITED tests/unit/accountColorSelection.test.js: the hand-written Store mock (lines 17-35) gains `findAccountByName: () => null`. Without it, 'dispatches ADD_ACCOUNT with selected color for new accounts' (84-106) throws a TypeError inside the click listener, because new mode always looks the name up. This keeps BUG-11's unguarded call pattern.
- tests/e2e/accounts_lifecycle.spec.js, test 'the account form refuses a duplicate name': create 'Visa', then open #edit-account and save 'visa' → #edit-acc-name-error is visible and there is still exactly one .wallet-card containing Visa. Fails today.

**New i18n keys (×5).** `account.duplicateName. Values:
- en: 'An account called "{name}" already exists.'
- fr: 'Un compte nommé « {name} » existe déjà.'
- it: 'Esiste già un conto chiamato "{name}".'
- es: 'Ya existe una cuenta llamada "{name}".'
- pt: 'Já existe uma conta chamada "{name}".'
The wording matches cat.duplicateName in each dictionary (en.js:1287, others :1266). Append it at the end of each of the five dictionaries, before the closing `};` (en.js:1346, the others :1325), under a `// ── 1.0.2 (BUG-30) ──` header.`

**Risks.** - Users who deliberately keep 'Revolut' in two currencies must now name the second one differently (D-U5-6). The inline message says why. The owner may want a hint such as "add the currency to the name".
- U6 coordination: U6's resolver applies the same trimmed, case-insensitive rule internally and does not call findAccountByName. If U6 later calls it, it must not redefine it.
- BUG-30 is closed only when both halves land. The UI check alone does not protect installs that already hold duplicates.
- Neighbours in the account form:
  - BUG-24's unit edits ADD_ACCOUNT (store.js:1132-1171) and the name sinks; there are no shared lines;
  - BUG-38 (U2) edits EditAccountView.render (views.js:3964); there are no shared lines;
  - U9 edits views.js:4298, 4316 and 3983; U5's hunk is 4246-4259.

### Rider: Bank Connect 'Create account' maps the bank account to the alphabetically LAST Stack'd account, creates duplicate names, and on a currency mismatch creates account _(rider, recommended, effort S)_

**Root cause.** BankMapView's import handler (views.js:6871-6908) has three defects.
- Wrong account. 6880-6882 dispatches ADD_ACCOUNT without an id, then takes `accounts.slice(-1)[0]`. ADD_ACCOUNT re-sorts accounts by name before saving (store.js:1143-1145). Whenever an existing account sorts after the new bank label (for example 'Zeta'), the mapping points at that other account. Every later Bank Connect import (bank-connect.js:915-929) then lands in the wrong wallet.
- Duplicate names. The label comes from BC.accountLabel, unchecked (BUG-30). The option text at 6832 promises 'Create “<label>”'.
- Unmapped accounts on a mismatch. Accounts are created inside the `.map` (6875-6891). A later row's currency check then throws 'currency_mismatch' (6888), outside the try at 6900-6907, so the click handler's promise is rejected and never handled. The account created earlier is never mapped, and each retry after the mismatch message creates another one.

No test covers the 'new' choice: bank_connect.spec.js:187 picks 'skip'.

**Fix.** Split the click handler into two passes.
1. Validate first, with no side effects.
   - If any non-skip, non-new choice is in another currency, show bank.mapCurrencyMismatch and return.
   - If every row is 'skip', show bank.mapNothing and return.
2. Then create and map.
   - Every 'new' row gets an id from StackdDB.generateId(), passed as payload.id (ADD_ACCOUNT honours it, store.js:1135), and is mapped to that id.
   - Then dispatch UPDATE_BANK_CONNECTION. The rest of the handler is unchanged.

Names come from one new view helper, `BankMapView._newAccountNames(conn)`.
- For each bank account in row order it takes BC.accountLabel and appends ' (2)', ' (3)'… while Store.findAccountByName finds a clash or an earlier row has reserved the name.
- render uses it for the 'Create “…”' option (6832), and the click uses it for the name, so the label always shows exactly the name that is created.
- Every row reserves a name whatever its choice. A skipped row can therefore make a later name skip a number, which is harmless and keeps the label and the result identical.
- The suffix is language-neutral, so no key is needed.

**Sketch.**

```js
// views.js BankMapView — new helper after `_selection: null,` (line 6800)
    // 1.0.2 (BUG-30): account names are unique (trimmed, case-insensitive, as
    // Store.findAccountByName). The name each bank account would be created
    // under, in row order, each row reserving its own — so the "Create “…”"
    // option shows exactly the name the import creates.
    _newAccountNames(conn) {
      const BC = window.BankConnect;
      const key = (s) => String(s).trim().toLowerCase();
      const reserved = new Set();
      const out = {};
      (conn.accounts || []).forEach(a => {
        const base = BC.accountLabel(conn, a);
        let name = base;
        for (let n = 2; window.Store.findAccountByName(name) || reserved.has(key(name)); n++) name = `${base} (${n})`;
        reserved.add(key(name));
        out[a.bankAccountId] = name;
      });
      return out;
    },

// render — after line 6819:
      const newNames = this._newAccountNames(conn); // 1.0.2 (BUG-30)
// line 6832:
          `<option value="new" ${sel === 'new' ? 'selected' : ''}>${esc(t('bank.mapCreate', { name: newNames[a.bankAccountId] }))}</option>`,

// attachEvents click handler — lines 6874-6896 become:
          const err = container.querySelector('#bank-map-error');
          const baseCcy = window.Store.getState().currency;
          // 1.0.2 (BUG-30): validate every row BEFORE creating anything. A
          // currency mismatch used to throw (unhandled, outside the try below)
          // after earlier 'new' rows had created their accounts, and every
          // retry created another one.
          const rows = (conn.accounts || []).map(a => ({ a, choice: sel.choices[a.bankAccountId] || 'skip', ccy: a.currency || baseCcy }));
          const bad = rows.find(r => r.choice !== 'skip' && r.choice !== 'new' && window.Store.getAccountCurrency(r.choice) !== r.ccy);
          if (bad) {
            if (err) { err.textContent = t('bank.mapCurrencyMismatch', { currency: bad.ccy }); err.hidden = false; }
            return;
          }
          if (!rows.some(r => r.choice !== 'skip')) {
            if (err) { err.textContent = t('bank.mapNothing'); err.hidden = false; }
            return;
          }
          const names = this._newAccountNames(conn);
          const mapped = rows.map(({ a, choice, ccy }) => {
            if (choice === 'skip') return { ...a, stackdAccountId: null };
            if (choice !== 'new') return { ...a, stackdAccountId: choice };
            // 1.0.2: explicit id — ADD_ACCOUNT re-sorts by name, so slice(-1)
            // was whichever account sorts last, not the one just created.
            const newId = window.StackdDB.generateId();
            window.Store.dispatch('ADD_ACCOUNT', { id: newId, name: names[a.bankAccountId], openingBalance: 0, currency: ccy });
            return { ...a, stackdAccountId: newId };
          });
          window.Store.dispatch('UPDATE_BANK_CONNECTION', { ref: conn.ref, accounts: mapped });
          ...unchanged from line 6897 (the startImport try/catch keeps its currency_mismatch branch)
```

**Data repair.** None. The feature has never shipped enabled (A-04), so no device holds a wrong mapping or an orphan account from this path. The BUG-29 prune also nulls mappings to deleted accounts.

**Tests (each fails on the current code).**

- tests/unit/bankConnectB3.test.js, describe 'BankMapView'. boot() seeds 'Main' (USD base). Add 'Mock ASPSP · Ella Virtanen' (EUR) and 'Zeta' (EUR), then recordConnection(PUBLIC).
(a) The render contains '<option value="new" selected>Create “Mock ASPSP · Ella Virtanen (2)”</option>'. Fails today: the label has no suffix.
- (b) Set choices acc_1 'skip' and acc_2 'new', stub BankConnect.startImport with vi.fn(async () => {}), render and attach, then click #bank-map-import.
- A NEW EUR account named 'Mock ASPSP · Ella Virtanen (2)' exists.
- bankConnections[0] maps acc_2 to its id: not Zeta's, and not the existing same-named account's.
Fails today on both counts.
- (c) Validate first: choices acc_1 'new' (USD) and acc_2 = Main's id (USD, while acc_2 is EUR). Click.
- #bank-map-error reads 'Pick an account in EUR, or create a new one.'
- The account count is still 1, and no mapping is saved.
- Then set acc_2 to 'skip' and click again: exactly one new account (2 in total), mapped to acc_1.
Fails today: the first click creates an account and rejects with an unhandled 'currency_mismatch'.
- Guard: the existing 'defaults each bank account…' test still expects 'Create “Mock ASPSP · Ella Virtanen”', which has no clash with 'Main'.

**Risks.** - No shipped user is affected: the code is unreachable while __STACKD_BANK_CONNECT__ is off. The B3/B4 suites run with the flag on.
- views.js now calls Store.findAccountByName, so views.js and store.js are co-dependent for cache-busting.
- Out of scope (product question, latent under A-04): Bank Connect's 'new' rows are not limited by the free plan's 2-account cap (Pro.canAddAccount). Pro gating is UI-only by design, and Bank Connect is a separate paid subscription.

### Rider (BUG-24 sink inside U5's region): The account delete confirmation puts the account name into the sheet's innerHTML unescaped (views.js:4307) _(rider, recommended, effort S)_

**Root cause.** views.js:4307 builds the delete sheet's content as `<p>${I18n.t('account.deleteConfirm', { name: account.name })} …</p>`. I18n.t does not escape params (i18n.js:97-100), and Components.Modal.show assigns the content through innerHTML (components.js:199-210). An account name holding markup (typed, or imported from a CSV, as BUG-24 shows) therefore runs when the user opens Delete Account.

The BUG-24 write-up's sink list (views.js:84, 97, 444, 452, 2500, 2598, 2853, 2871, 2982, 3876-3879; components.js:831, 903-913, …) does not include this line. It sits inside U5's EditAccountView delete-handler region.

**Fix.** Wrap the parameter in the existing views.js `esc()` helper (views.js:16). It is one token, inside the region U5 already owns, so BUG-24's unit does not need to edit U5's lines. A normal name renders exactly as today.

**Sketch.**

```js
// views.js:4307 — EditAccountView delete confirmation
            // 1.0.2 (BUG-24): the name is user text going into the sheet's
            // innerHTML, and I18n.t does not escape params.
            content: `<p>${window.I18n.t('account.deleteConfirm', { name: esc(account.name) })} <strong>${window.I18n.t('account.deleteWarning')}</strong></p>`,
```

**Data repair.** None. Stored names are not changed; only this one sink escapes them.

**Tests (each fails on the current code).**

- tests/unit/accountDuplicate.test.js, a new case:
- ADD_ACCOUNT {name: 'Pot<img src=x id="inj">'}; render EditAccountView for it (params {id}); click #btn-edit-acc-delete.
- document.getElementById('inj') is null, and the .modal-body text contains 'Pot<img src=x id="inj">' literally.
Fails today: the img element is created.
- Guard: modalButtons.test.js 'account delete: "Yes, Delete Everything" first…' is unchanged, because esc('Checking') === 'Checking'.

**Risks.** - BUG-24's unit must not escape this line again (no double escaping). Both units' regions must say that U5 owns views.js:4307.
- The 1.0.1 BUG-14 transfer note written in DELETE_ACCOUNT stores the name as plain text, and notes are already escaped where they are rendered, so it is untouched.

### U5 decisions

- **D-U5-1** When the account marked DEFAULT is deleted (or a stale default is found at boot), what becomes the default wallet?
  - (a) The first remaining primary-currency account by name. If every remaining account is in another currency, the first account by name. Empty ('') when no account is left.
  - (b) The first remaining account by name, whatever its currency; '' when none is left
  - (c) Clear it: no default until the user picks one
  - (d) Promote only when exactly one account remains, otherwise clear
  - _Recommended:_ (a) Promote the first remaining primary-currency account by name, falling back to the first account by name when every remaining account is foreign, and to no default when no account is left — - The report expects that "a remaining account becomes the default".
- A foreign-currency default would get the DEFAULT badge and sort first on Home (views.js:421-425). It would also become BUG-39's New Log preselection and the loan prefill (views.js:4456), inviting entries in the wrong currency while every total excludes that account.
- The primary test is the one _ensureForeignIdx uses.
- BUG-39's fallback applies only when no default exists, so the two rules never contradict each other.
- A deliberately cleared default ('') is never touched.
- **D-U5-2** What happens to a widget or the saved Home view whose ONLY scoped account is deleted?
  - (a) It silently widens to All (an empty list means all accounts, as everywhere else)
  - (b) Remove the widget, or reset the view
  - (c) Keep it and show an "its account was removed" empty state (new keys ×5)
  - _Recommended:_ (a) Silently widen to All accounts — - (a) follows the codebase's existing "empty = all" convention and matches the report's expected result (Home €2,500.00, and the widget falls back to All).
- It needs no new UI or keys.
- (b) destroys the user's layout.
- (c) adds a state that would almost always just be dismissed.
- **D-U5-3** Should Factory reset (RESET_APP) also reset the saved Home view (interval, account and category filters) and the default wallet?
  - (a) Yes: fresh-install values, like the widget re-seed it already does
  - (b) No: rely on the boot heal, which fixes account ids only (stale custom-category ids and the interval survive)
  - _Recommended:_ (a) Yes, reset both to fresh-install values — - Reset is defined as a fresh install: RESET_APP already re-seeds the widgets and drops scoped widgets.
- A restore from a pre-1.0.2 backup re-creates the accounts and custom categories under new ids, so their old ids are meaningless.
- With U6's id-keeping restore, (a) stays consistent with the widget re-seed instead of resurrecting a view from before the reset.
- It costs 4 lines, and it also clears stale custom-category ids in the saved view.
- **D-U5-4** What does a tap outside, or a swipe down, on the mandatory welcome sheet do?
  - (a) Nothing: the sheet stays put. Its drag handle is kept only as an invisible spacer (no layout shift), and Android Back stays swallowed, as today.
  - (b) Treat it as Get Started: apply the shown currency and language and finish onboarding
  - (c) Nothing, plus a small bounce animation to signal that the sheet is mandatory
  - _Recommended:_ (a) Nothing happens: the sheet stays open with an invisible handle spacer, and Back stays swallowed — - It is the report's primary expectation and matches D4h.
- A stray tap should not commit a currency, and (b) could also trigger the BUG-01 confirm by accident.
- (c) adds animation code for little gain.
- The invisible handle keeps the first screen aligned with every other sheet (review issue 15).
- **D-U5-5** When a language is picked in the welcome sheet, is it saved at once or only on Get Started?
  - (a) At once through SET_LANGUAGE. The sheet preselects the stored language, so a relaunch before Get Started (or a factory reset) reopens it in that language.
  - (b) Only on Get Started: keep the I18n preview, and roll it back if the sheet ever closes another way
  - _Recommended:_ (a) Save it at once through SET_LANGUAGE and preselect the stored language — - The sheet already re-renders itself in the picked language, so the user sees the choice as applied.
- One dispatch keeps I18n.lang, state, storage, Settings and the bottom nav in step.
- It also stops a factory reset in Italian from reopening the sheet as 'Lingua: English' and switching back to English on Get Started.
- (b) needs rollback code for a close path that BUG-40's fix removes anyway.
- **D-U5-6** How strict is account-name uniqueness?
  - (a) Unique across all currencies and types, trimmed and case-insensitive (the same rule as categories in 1.0.1)
  - (b) Unique per currency (allows 'Revolut' EUR + 'Revolut' USD)
  - _Recommended:_ (a) Unique across all currencies and types, trimmed and case-insensitive — - Backups and pickers identify an account only by its name, and import's by-name lookups ignore currency (import.js:184-185, 1293).
- Per-currency uniqueness would keep the merge-on-restore risk for old backups, and keep identical entries in the pickers.
- Users can still write 'Revolut EUR' and 'Revolut USD'.
- **D-U5-7** What happens to installs that already hold duplicate account names?
  - (a) Leave them. Edits that don't rename still save, and U6's id-based restore protects new backups.
  - (b) A one-time sheet at boot that lists the duplicates and asks for a rename
  - (c) A non-blocking warning on the edit form of an account that shares its name
  - _Recommended:_ (a) Leave existing duplicates as they are; edits that don't rename still save — - It is the smallest change, and consistent with BUG-11, which did not prompt about existing duplicate categories.
- Once U6 makes restores id-based, new backups are safe.
- If the owner rejects U6's id-based restore, revisit with (c), which costs one key in five dictionaries.
- **D-U5-8** Bank Connect is switched off at build time (A-04). Should its account paths be fixed in this round?
  - (a) Yes. 'Create account' validates every row before creating anything, gives each new account an explicit id and a unique name with a ' (2)' suffix that the option label already shows, and the BUG-29 prune nulls mappings to deleted accounts.
  - (b) Defer all of it until Bank Connect is switched on
  - _Recommended:_ (a) Yes: validate first, explicit ids, unique suffixed names shown in the option label, and null the mappings to deleted accounts — - About 30 lines, covered by the existing B3 suite (which runs with the flag on).
- It removes three latent bugs before the feature ships: imports routed into the wrong wallet, accounts that are created but never mapped, and duplicate names.
- It keeps the uniqueness and prune rules true for every way an account is created.
- Shipped users are not exposed at all.
- **D-U5-9** What should a History link to an account that no longer exists open? (A stale #transactions?account= entry: web Back/Forward, reload or bookmark, or another tab's filter sheet.)
  - (a) History unfiltered (current month, all accounts): UPDATE_FILTERS drops account ids that name no account, so an emptied list means unfiltered
  - (b) Keep today's behaviour: History filtered to the dead id, with a raw-id chip and no rows, until the user clears it (leave it to BUG-36's read side)
  - _Recommended:_ (a) Open History unfiltered, by dropping unknown account ids whenever filters are written — - It is the report's expected result ('History opens unfiltered').
- It is one store rule on the only write path for these filters, so it covers the router, other tabs and any future caller, with no view or router edits.
- The cost is one fixture line in clearFilters.test.js, which used a fake account id.
- **D-U5-10** On the web only, an import draft left open can be revisited with browser Back/Forward after its target account was deleted, and its commit would write rows to the dead id. Fix it in 1.0.2?
  - (a) No. Record it as an accepted limit (web only; Android cannot reach it because every account delete lands on Home, where Back exits), with a follow-up for the import views' owner.
  - (b) Yes. ImportMapView and ImportPreviewView re-validate d.accountId when they render, with the startCsv fallback (views.js:5520-5523). This adds an unowned region of views.js to U5.
  - _Recommended:_ (a) Record it as a web-only accepted limit with a follow-up, and do not fix it in this round — - It needs the web build, an abandoned import draft, a delete, and then browser Back or Forward into the draft. No user reported it.
- Android cannot reach it at all.
- The import views belong to no unit this round: U6 owns only views.js:3816-3844, so the reviewer's hand-off to U6 does not apply.
- (b) is still small if the owner prefers to close it now.

### U5 regions owned

| File | Symbol | Lines | Change |
|---|---|---|---|
| src/store.js | findAccountByName (new, after findCategoryByName) | 596-606 (insert after 606) | Add Store.findAccountByName(name, exceptId): trimmed, case-insensitive, across every currency and type (BUG-30). Used by EditAccountView and BankMapView. U6 does not redefine it. |
| src/store.js | _pruneAccountRefs (new, after _healOrphanTransferLegs) | 694-709 (insert after 709) | New helper (BUG-29). It drops ids not in state.accounts from the history/analytics filters (always), and from expandedGraphFilters, homeWidgets[].config.accountIds, defaultAccountId (primary-first promotion, D-U5-1) and the bankConnections mappings (skipped with {sessionOnly:true}). It guards non-array slices and saves only what changed. |
| src/store.js | init() — boot heal | insert after 453 (before the v0.98 heal comment at 455-458) | Call this._pruneAccountRefs() unless there are transactions but no accounts (BUG-29 boot heal). U6 appends its own heals after 460, so the hunks stay apart. |
| src/store.js | init() — storage listener | 473; insert after 481 | The accounts branch (473) becomes a block that also calls _pruneAccountRefs({sessionOnly:true}). New cases after 481 reload stackd_v1_expandedGraphFilters and stackd_v1_defaultAccountId (BUG-29 cross-tab). |
| src/store.js | dispatch DELETE_ACCOUNT | 1224-1276 (insert after 1228) | Call this._pruneAccountRefs() after the accounts save (BUG-29). The 1.0.1 transfer-leg logic is unchanged. |
| src/store.js | dispatch RESET_APP | 2299-2326 (insert after 2318) | Save the fresh-install expandedGraphFilters and defaultAccountId '' next to the widget re-seed (D-U5-3). |
| src/store.js | dispatch UPDATE_FILTERS | 2674-2700 (insert after 2693) | Keep only account ids that name an account, after the merge (BUG-29, D-U5-9). This covers router.js:174-180's ?account= deep link without touching router.js. |
| src/components.js | Components.Modal.show | 191-197, 200-202, 261-263, 286-291 | New `dismissible` option, default true (BUG-40). With false: data-back-swallow on #active-modal; the .modal-handle is kept with visibility:hidden and aria-hidden; the touch handlers and the backdrop click are not bound. Modal.hide, dismissTopSheet and _BACK_SWALLOW are not touched. |
| src/main.js | _showRegionSetupModal | 736, 837 (insert after), 895 | Preselect state.language (736); pass dismissible:false (after 837); the language pick dispatches SET_LANGUAGE instead of calling I18n.setLang (895) (BUG-40). |
| src/views.js | EditAccountView.attachEvents — save handler | 4246-4259 | Keep a reference to the name input, and add the duplicate-name check after the empty-name check (BUG-30). Lines 4298 and 4316 belong to U9 (BUG-87 leaveTo), and 3983 to U9 as well. EditAccountView.render (3951-4077) is not owned; BUG-38 (U2) edits 3964. |
| src/views.js | EditAccountView.attachEvents — delete confirmation content | 4307 | esc(account.name) in the account.deleteConfirm param (BUG-24 rider). BUG-24's unit must not edit this line. |
| src/views.js | BankMapView: new _newAccountNames; render 'Create' option; attachEvents import click | insert after 6800; insert after 6819 and line 6832; 6874-6896 | Unique names, suffixed with ' (2)'…, are shown in the option label and used on create. The click validates every row first, then creates each account with an explicit id and maps to it (BUG-30 UI + Bank Connect rider). |
| src/i18n/en.js, fr.js, it.js, es.js, pt.js | end-of-dictionary 1.0.2 block | append before the closing `};` (en.js 1346, the others 1325) | Add 'account.duplicateName' under a `// ── 1.0.2 (BUG-30) ──` header in all five dictionaries (merge=union with the other units). |
| tests/unit/accountDeleteRefs.test.js (new), tests/unit/accountDuplicate.test.js (new), tests/e2e/accounts_lifecycle.spec.js (new) | new test files | new | BUG-29 store, boot-heal, cross-tab, filter and render tests (16); BUG-30 UI tests and the BUG-24 rider test (7); e2e for both (2). |
| tests/unit/modalButtons.test.js, tests/unit/androidBack.test.js, tests/unit/currencySwitch.test.js, tests/unit/bankConnectB3.test.js, tests/e2e/welcome_modal.spec.js | appended describes/tests | append only | BUG-40 dismissible and welcome-sheet tests, and the Bank Connect 'Create account' tests. Existing tests in these files are unchanged. |
| tests/unit/accountColorSelection.test.js | Store mock in beforeEach | 17-35 | Add `findAccountByName: () => null` to the mock, which new-mode saves now call (BUG-30). |
| tests/unit/clearFilters.test.js | 'resets analyticsFilters back to default state…' | 39-54 (insert before 41) | Seed ADD_ACCOUNT {id:'acc-1', name:'Acc 1', openingBalance:0} first, because UPDATE_FILTERS now drops ids that name no account and line 54 asserts ['acc-1'] (D-U5-9). |

**Dependencies.** - U6 (BUG-30 import half):
  - BUG-30 is closed only when both halves land.
  - U5 defines Store.findAccountByName (store.js, inserted after 606). U6's draft applies the same trimmed, case-insensitive rule inside its restore resolver and does not call the helper. If U6 switches to calling it, U6 must not redefine it.
  - U6 appends its boot heals after store.js:460, and U5's heal is inserted after 453, so the hunks stay apart.
  - With U6, a restore keeps account ids. D-U5-3 still resets the saved view and the default on Factory reset (the fresh-install rule), and the boot heal covers restores from pre-1.0.2 backups.
  - U5 does not touch the import result sheet (views.js:3816-3844).

- U9 (BUG-87) owns views.js:4298 and 4316 (`leaveTo('#dashboard')`) and the ✕ link at 3983. Its write-up says the fix applies "the same way to the account form", so U5's former Back rider is dropped. U5's hunks in EditAccountView are 4246-4259 and 4307 only. U9's note naming 'BUG-30 (4244-4258)' as its neighbour still holds.

- BUG-24's unit:
  - U5 escapes the account name in the delete confirmation (views.js:4307). That line is missing from BUG-24's sink list, and BUG-24's unit must not edit it or escape it again.
  - That unit keeps ADD_ACCOUNT write validation (store.js:1132-1171) and every other sink.
  - U5's new duplicate-name error goes through showFieldError (textContent) and is correctly left unescaped.

- U8 (BUG-36) owns the read side, which U5 does not touch:
  - views.js:267, 395-397, 491-493, 503 and 982-989;
  - components.js:3440-3442 and 3588-3594;
  - the aggregate helpers in store.js.
  Pruning on write and on filter update makes the count checks and chips correct again. Optional for U8: its aggregateAccountIds helper could also drop ids unknown to state.accounts.

- U2 (BUG-39):
  - Its New Log fallback applies only when no default exists. After U5 the default is never stale, and D-U5-1 always picks a primary-currency account when one exists, so the rules agree.
  - Optional for U2: use the same primary-first order in its fallback, for the case where the user cleared the default.
  - No shared lines.

- U7 (BUG-34): `_pruneAccountRefs` saves through StackdDB.save like every other path, so whatever save-failure reporting U7 adds applies here too. Any sheet opened before setup_done replaces the welcome sheet (Modal.show swaps #modal-container), so storage-full notices should wait for onboarding.

- Integrator:
  - Bump ?v= together for store.js, components.js, main.js, views.js and the five dictionaries. main.js passes an option that only the new components.js honours, and views.js calls Store.findAccountByName.
  - Update CLAUDE.md:
    - Modal.show gains `dismissible` (false = no backdrop or swipe close, an invisible handle, and data-back-swallow).
    - DELETE_ACCOUNT prunes account references through `_pruneAccountRefs`. It also runs as a boot heal before `_healOrphanTransferLegs`, and cross-tab for the session filters.
    - UPDATE_FILTERS drops unknown account ids.
    - Account names are unique through findAccountByName (UI-only; the store stays ungated).
    - Update the key count (+1).
  - Record in the 1.0.2 plan that the 1.0.1 follow-up 'Stale deleted-account ids remain in widget configs, filters and defaultAccountId' is closed, and add the D-U5-10 accepted limit.

**Existing tests affected.** Two existing unit tests need a one-line fixture change. Both changes come from deliberate behaviour:
- tests/unit/accountColorSelection.test.js:17-35. The hand-written Store mock has no findAccountByName, so 'dispatches ADD_ACCOUNT with selected color for new accounts' (84-106) would throw a TypeError in the click listener. Add `findAccountByName: () => null`.
- tests/unit/clearFilters.test.js:41-54. UPDATE_FILTERS now drops 'acc-1', which names no account, so line 54 would read []. Seed ADD_ACCOUNT {id:'acc-1', …} before line 41. Its sibling test (acc-2, 69-87) asserts only the cleared state and passes unchanged.

Checked and unchanged:
- modalButtons and androidBack (D4h cases): `dismissible` defaults to true.
- currencySwitch.test.js:292-372 welcome tests: a fresh state.language is 'en'.
- welcome_modal.spec.js: picks 'en', which returns early, and still expects the 'English' default.
- emitCoalescing.test.js: passes 'acc_x' (no such account) but asserts only render counts.
- expandedGraphModal.test.js: SAVE_EXPANDED_GRAPH_FILTERS is not pruned on write.
- negativeOpeningBalance.test.js: edit mode with an unchanged name skips the lookup, and the new-mode test never clicks Save.
- formValidation, categoryDuplicate and modalButtons' account-delete test use the real store, and esc('Checking') is unchanged.
- accountDeleteTransfers.test.js:
  - the prune touches only prefs;
  - deleting the auto-default first account now also saves defaultAccountId, which no test asserts against;
  - its save spy (327) calls _healOrphanTransferLegs directly.
- homeWidgets.test.js RESET_APP tests: the change only adds saves.
- bankConnect, B3 and B4: map only to existing accounts, and the 'Create “Mock ASPSP · Ella Virtanen”' label has no clash with 'Main'.
- debt_simulator.spec.js:169: reads an existing default.
- Every other e2e spec pre-sets setup_done, and none taps the welcome sheet away or creates duplicate account names (user_flow, pro_paywall and i18n_core checked).
- i18n.test.js enforces the new key in all five dictionaries.

New tests:
- unit, new files: accountDeleteRefs.test.js (16 cases) and accountDuplicate.test.js (7 cases, including the BUG-24 rider).
- unit, appended: modalButtons (+4), androidBack (+1), currencySwitch (+3) and bankConnectB3 (+3).
- e2e: accounts_lifecycle.spec.js (2, new) and welcome_modal.spec.js (+1, hasTouch context). Write the e2e specs blind and verify them after integration, because port 3000 is shared.

Expected net: about +34 unit tests and +3 e2e tests, plus 2 edited fixtures.

## U6 — Import and restore

U6 fixes the CSV restore path: import.js and export.js, a few store.js hooks, and the import block of the Settings result sheet. Every line number below was checked again at efcac0c. The design keeps the draft's shape (an RFC 4180 reader, one strict amount reader, id-based restore, key rebasing, dedup) and folds in two review rounds: 12 earlier issues and 13 new ones, many of which overlap.

**Accepted and folded in.** Each item was checked against the code.
- **Ids are trusted only in a Stack'd export (N1/E1, new U6-D10).** A transactions file must carry TransferRef, SeriesId, NextDate, ImportKey and AccountCurrency, which every export since 1.0 writes. Otherwise its Id and AccountId columns are ignored. I extended the same check to the accounts file's `id` column (full 1.0 header), which has the same hazard.
- **Every row the id check does not match goes through the fallback (N2/E7).** The order is: id → series held here → ImportKey (rebased) → multiset fingerprint. The fingerprint pool leaves out store rows whose id the file names, and the store keys are read straight from state: tests wipe `state.transactions` directly, which leaves the memoized `_importKeyIdx` stale.
- **The fingerprint is normalised (N3/E2/E11):**
  - whitespace-collapsed notes;
  - ISO dates through `_normalizeDate`;
  - a missing time on either side matches any time;
  - the pool covers every same-named, same-currency account that existed before the import (E3), so installs that hold two 'Visa' accounts dedup too.
- **Series and transfers held here are owned here (N4/E4, U6-D11).** I added the transfer-pair half myself: if one leg of a transfer is already here, the other leg is never re-added alone. The concrete case is BUG-14's DELETE_ACCOUNT, which keeps the surviving leg's id.
- **Notes are one line (N3/E5, U6-D12).** Every import path flattens line breaks, a restore included, so the BUG-33 tests now expect 'Supermercato Rossi — Spesa'.
- **Opening-balance rows never create a second account (N5, U6-D13).** This rule applies to both the legacy path and the trusted path.
- **On an id match, the file's name is applied only when no other live account uses it and it contains no '�' (N6, U6-D5).** The check calls U5's `findAccountByName`.
- **A D9 merge requires the same currency (N7, U6-D9).** The legacy path uses the same rule.
- **A repeated Id inside one file is imported under a fresh id (N8).**
- **Keys are rebased through the resolver (N9/E6).**
- **ADD_IMPORT_RULE's replace filter compares whitespace-collapsed matches (N10/E13).**
- **The test rewrites are rebuilt (N11/E12).**
- **Ambiguity wording and counting are fixed (N12/E8b).**
- **Amount evidence is read from the normalised cell, and U+FFFD is stripped (N13/E9).**
- **In the legacy path, an account created by the same import only matches its exact spelling (E8a).** This splits 'Revolut'/'revolut' and 'Cash'/' cash ' correctly in either file order.

**Rejected or changed:**
- **N2, "a key that already appeared in the file is a duplicate": rejected.** A backup repeats a key only when that ledger already holds two copies (a 1.0.1 double import). A faithful restore keeps both, as N8 does for repeated Ids, and "already in Stack'd" would be false on an empty phone. A second import is still idempotent, because each copy then matches the store.
- **E4's own correction (skip future members, re-attach past survivors): replaced by N4's whole-series rule.** A schedule edit made on a past member regenerates past dates too, so re-attached survivors would still double.
- **E10's trigger, "more fields than the header": changed.** The merged span parses to exactly the header's width, so that trigger would never fire. Instead, a multi-line record is read line by line when any of its inner lines is a complete row on its own. The fallback is never worse than 1.0.1.
- **N4's optional `_healSeriesSchedules` call after BATCH_IMPORT_TRANSACTIONS: left to the integrator.** That method is U3's and does not exist in this worktree.

**My additions:**
- `_splitRecords` resets `atStart` when a quoted field closes.
- BATCH_IMPORT_TRANSACTIONS writes the id after the spread, so an explicit `id: undefined` can never overwrite the generated one.

The plan adds 4 i18n keys (2 plural pairs, all 5 languages given), keeps the store ungated and adds no new globals. `import.js` now calls `Store.rebaseImportKey` and `Store.findAccountByName`.

### BUG-33 — Line breaks in quoted CSV fields split rows, corrupting backup restores and bank imports _(gate, effort M)_

**Root cause.** Confirmed in src/import.js. Four sites split the file with `csvText.split(/\r?\n/)` before `_parseRow` (:18-40) runs:
- parseCSV :43;
- analyzeBankCSV :598;
- _stackdKindOfHeaderOnly :1386;
- the importCSV bank-candidate check :1520.

_parseRow tracks quotes only within one physical line, so a quoted line break ends the record early. export.js `_toRow` (:15-21) writes that line break correctly (RFC 4180). Every column after Note is lost: Tags, IsPaid, TransferRef, the series columns, ImportKey, BankRef, AccountCurrency. The remainder becomes a bogus row, skipped as 'missing date, amount or account'. Scratchpad repro: a 3-transaction bank CSV gives 6 rows, and the guess is {date:-1, amount:0, dateFormat:'dmy'}.

Line breaks reach the store only through camt. parseCamt's `text()` (:855) only trims, and :894-896 join party, Ustrd and AddtlNtryInf without collapsing internal whitespace. MT940 (`_mt940Narrative` :1007) and Bank Connect both flatten.

The note field is a single-line `<input type=text id=tx-comment>` (views.js:1666), so editing such a row merges the words.

Rules take the line break too:
- suggestRuleMatch (:794-797) and ADD_IMPORT_RULE (store.js:2102) copy it into the rule match;
- matchImportRule (store.js:2935-2945) compares raw strings;
- ADD_IMPORT_RULE removes the rule it replaces by raw compare (store.js:2107).

**Fix.** 1) **RFC 4180 records.** Add `_splitRecords(text, delimiter)`, a char loop that ends a record only at an LF (with an optional CR before it) outside quotes.
- A quote opens a quoted field only at the start of a field, so a stray quote inside a value ('5" screen') stays literal and line-local, as today.
- `""` is kept for _parseRow, a CRLF inside a field becomes LF, and `atStart` resets when a quoted field closes.

Add `_readRecords(text)`:
- it strips the BOM and detects the delimiter on the first non-empty physical line;
- it falls back to today's line split when a quote never closes (D8);
- a record that spans 3 or more physical lines, any of whose INNER lines parses on its own into at least the header's field count, is read line by line, as in 1.0.1 (E10). A stray opening quote closed many lines later then cannot swallow rows that 1.0.1 read. A legit note's inner line never has the 20+ fields of a backup row.

Use it at all four sites. _parseRow, _detectDelimiter and the empty-record filter are unchanged.

2) **Notes are one line (D12).**
- parseCamt collapses all whitespace in the party name, each Ustrd and AddtlNtryInf, like MT940 and Bank Connect.
- A new `_oneLine(s)` (line breaks with their surrounding blanks become one space, then trim) is applied to the mapped description in buildBankTransactions (:752) and in buildStatementTransactions (:1041, the builder shared with Bank Connect). It is also applied to the restored note in buildTransactions.
- fp keys do not change, because `_stampImportKey` normDesc (:814-815) already collapses non-alphanumerics, and ref keys ignore the description.

3) **Rules.**
- suggestRuleMatch collapses whitespace.
- ADD_IMPORT_RULE stores the collapsed match and drops the rule it replaces by collapsed compare (N10), so re-teaching never leaves a legacy 'supermercato\nrossi' next to 'supermercato rossi'.
- matchImportRule collapses both sides, so stored legacy rules keep matching. No rule rewrite is needed.

4) export.js `_toRow` also quotes a value containing '\r'.

**Sketch.**

```js
// import.js, after _parseRow (:40)
// 1.0.2 (BUG-33): RFC 4180 records: a line break inside quotes is part of the field.
_splitRecords(text, delimiter) {
  const out = []; let cur = ''; let inQ = false; let atStart = true;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQ) {
      if (ch === '"') {
        if (text[i + 1] === '"') { cur += '""'; i++; }
        else { inQ = false; atStart = false; cur += ch; }
      } else if (!(ch === '\r' && text[i + 1] === '\n')) cur += ch; // CRLF in a field -> LF
      continue;
    }
    if (ch === '\n') { out.push(cur.replace(/\r$/, '')); cur = ''; atStart = true; continue; }
    if (ch === '"' && atStart) { inQ = true; cur += ch; continue; }
    cur += ch;
    if (ch === delimiter) atStart = true; else if (ch !== ' ' && ch !== '\t') atStart = false;
  }
  if (inQ) return null; // never closed: not RFC 4180 (D8)
  out.push(cur.replace(/\r$/, ''));
  return out.filter(r => r.trim() !== '');
},
_physicalLines(text) { return text.split(/\r?\n/).filter(l => l.trim() !== ''); },
_readRecords(csvText) {
  const text = String(csvText).replace(/^﻿/, '');
  const delimiter = this._detectDelimiter(this._physicalLines(text)[0] || '');
  const recs = this._splitRecords(text, delimiter);
  if (!recs) return { delimiter, records: this._physicalLines(text) }; // the 1.0.1 reading
  // A record whose INNER lines are complete rows on their own is a stray quote,
  // not a multi-line field: read that span line by line, as 1.0.1 did.
  const width = recs.length ? this._parseRow(recs[0], delimiter).length : 0;
  const records = [];
  recs.forEach(r => {
    const parts = r.split('\n');
    const stray = width > 1 && parts.length > 2 &&
      parts.slice(1, -1).some(l => this._parseRow(l, delimiter).length >= width);
    if (stray) parts.forEach(l => { if (l.trim() !== '') records.push(l); }); else records.push(r);
  });
  return { delimiter, records };
},
// 1.0.2 (BUG-33): the note field is one line; every import writes notes that way.
_oneLine(s) { return String(s == null ? '' : s).replace(/[ \t]*[\r\n]+[ \t]*/g, ' ').trim(); },

// parseCSV (:42-59)
const { delimiter, records } = this._readRecords(csvText); // 1.0.2 (BUG-33)
if (records.length < 2) throw new Error('File is empty or missing headers');
const headers = this._parseRow(records[0], delimiter).map(h => h.toLowerCase().replace(/[^a-z0-9]/g, ''));
const rows = records.slice(1).map(rec => { const values = this._parseRow(rec, delimiter); /* same row build */ });
Object.defineProperty(rows, 'delimiter', { value: delimiter }); // 1.0.2 (BUG-31) reads it
return rows;
// analyzeBankCSV :598-603, _stackdKindOfHeaderOnly :1386-1389 and importCSV :1520-1521 use
// const { delimiter, records } = this._readRecords(csvText); in place of lines/_detectDelimiter(lines[0]).

// parseCamt :894-896
const flat = (s) => String(s || '').replace(/\s+/g, ' ').trim(); // 1.0.2 (BUG-33), as MT940 / Bank Connect
const party = flat(type === 'expense' ? text(first(ntry, 'Cdtr'), 'Nm') : text(first(ntry, 'Dbtr'), 'Nm'));
const ustrd = kids(ntry, 'Ustrd').map(u => flat(u.textContent)).filter(Boolean).join(' ');
const description = [party, ustrd].filter(Boolean).join(' — ') || flat(text(ntry, 'AddtlNtryInf'));
// buildBankTransactions :752
const description = this._oneLine(row[mapping.description] !== undefined ? row[mapping.description] : '');
// buildStatementTransactions :1041
const description = this._oneLine(e.description);
// suggestRuleMatch :796
return base.toLowerCase().replace(/\s+/g, ' ').trim().slice(0, 60).trim();

// store.js ADD_IMPORT_RULE :2102-2107
const norm = (m) => String(m || '').toLowerCase().replace(/\s+/g, ' ').trim().slice(0, 60);
const match = norm(payload && payload.match);
...
].concat(rules.filter(r => norm(r.match) !== match)).slice(0, 100); // 1.0.2 (BUG-33): a legacy multi-line rule is replaced, not kept
// store.js matchImportRule :2936-2939
const desc = String(description || '').toLowerCase().replace(/\s+/g, ' ');
...
const m = r.match ? String(r.match).replace(/\s+/g, ' ') : '';
if (m && desc.indexOf(m) !== -1 && this.state.categories.some(c => c.id === r.categoryId)) return r.categoryId;

// export.js _toRow :18
const needsQuotes = str.includes(delimiter) || str.includes('"') || str.includes('\n') || str.includes('\r');
```

**Data repair.** No heal is needed for the reader. Backups written by 1.0 and 1.0.1 are valid RFC 4180 and restore correctly once the reader is fixed. Their multi-line notes are flattened on the way in (D12).

Installs that already restored on 1.0.1 lost fields that exist only in the backup file, so the store cannot rebuild them. Release-note advice: Factory reset, then import the same files again on 1.0.2.

Legacy rules containing '\n' keep matching through the collapsed compare and are replaced cleanly when re-taught, so no rule rewrite is needed. Notes already stored with line breaks are flattened by rider R1.

**Tests (each fails on the current code).**

- csvRecords.test.js: parseCSV keeps a quoted LF inside a field. Bank-style file with 'CARD PAYMENT\nLIDL 1234 MILANO' and 'TRANSFER TO\nJOHN DOE\nREF 99' → 3 rows, description intact. Fails today (6 rows).
- csvRecords.test.js: the same file with CRLF endings and a CRLF inside quotes → 3 rows, the field normalised to '\n'. Fails today.
- csvRecords.test.js: analyzeBankCSV on that file → rowsRaw.length 3, guess {date:0, description:1, amount:2, dateFormat:'ymd'}. Fails today (6 rows, date -1, amount 0, dmy).
- csvRecords.test.js: buildBankTransactions on that file stores 'CARD PAYMENT LIDL 1234 MILANO' (one line), and its fp importKey equals the key built from the multi-line text. Fails today (the row is split).
- csvRecords.test.js: backup round trip onto a fresh boot (per-boot id prefixes). The ledger has a note 'Supermercato\nRossi — Spesa', an isPaid:false bill with a multi-line note, a transfer pair with a multi-line note, and a bank row with importKey/bankRef. importCSV → skippedCount 0, note 'Supermercato Rossi — Spesa', isPaid false, transferRef pair, importKey and bankRef intact, balances equal. Fails today ('missing date, amount or account'; the bill comes back paid).
- csvRecords.test.js: a rules file with a quoted multi-line Match → importedCount 1, rule match 'supermercato rossi'. Fails today (0 imported, 'missing match or category').
- statementImport.test.js (new case): parseCamt flattens Cdtr/Nm 'Supermercato\n  Rossi' + Ustrd 'Spesa\nsettimanale' → 'Supermercato Rossi — Spesa settimanale', and AddtlNtryInf 'PAGAMENTO POS\nBAR CENTRALE' → 'PAGAMENTO POS BAR CENTRALE'. Fails today.
- importRules.test.js (new cases): matchImportRule with a stored legacy rule 'supermercato\nrossi' matches 'Supermercato Rossi — Spesa'. ADD_IMPORT_RULE stores 'supermercato rossi' for 'Supermercato\nRossi'. Re-teaching 'supermercato rossi' over a stored 'supermercato\nrossi' leaves exactly one rule. All three fail today.
- csvRecords.test.js guards (pass today): an unterminated quote reads line by line exactly as 1.0.1 did; a mid-field stray quote stays on its own line; the fp importKey of a flattened camt entry equals the key built from the multi-line description.
- csvRecords.test.js guard (E10): a 3-column bank CSV whose line 5 opens a stray quote at the start of a field, closed at the end of a field on line 9 → lines 6–8 are still read as their own rows, as in 1.0.1.
- csvRecords.test.js: StackdExport._toRow quotes a value containing '\r'. Fails today.
- e2e full_restore.spec.js: 'multi-line bank notes survive a backup'. Seed camt-shaped rows via StackdImport.buildStatementTransactions + BATCH_IMPORT_BANK_TRANSACTIONS, mark the €120 row unpaid, export through the buttons, freshInstall, then import transactions and then accounts through #import-csv-file. The sheet contains no 'Skipped', the totals equal the pre-export figures, and the row is still unpaid. Fails today.

**Risks.** - **No regression on malformed files.** A field that opens a quote and never closes it falls back to the 1.0.1 reading for the whole file. A stray opening quote closed many lines later is read line by line for that span. The only remaining merge is a stray quote closed on the very next line, and both of those lines are broken in 1.0.1 too.
- **Bank CSV false positive.** A legit multi-line description whose inner line holds as many delimiters as the header falls back to the 1.0.1 reading for that one record. That is never worse than today.
- **Presets are unaffected.** Bank presets keyed by header signature still match, because header parsing is unchanged.
- **Stored notes change shape.** Notes from camt, bank CSV, statements and restores are now one line (D12). Dedup keys are unchanged.

Interactions:
- BUG-31 reads the `rows.delimiter` exposed by parseCSV.
- BUG-78's fingerprint normalises whitespace, so legacy multi-line notes still match flattened ones.
- The dead entry points importLoans/importTransactions (:1401-1436, no callers) inherit the fix through parseCSV.

### BUG-31 — Importing a CSV with decimal-comma amounts drops the cents and turns 1.850,00 into 1.85 _(gate, effort M)_

**Root cause.** Confirmed. Three restore readers truncate amounts:
- buildTransactions reads Amount with `Math.abs(parseFloat(amountStr))` (src/import.js:169) and the opening-balance branch with `parseFloat(amountStr)` (:196). The only check is isNaN (:170), and a truncated prefix is never NaN.
- buildAccounts uses `parseFloat(obRaw.replace(',', '.'))` (:1276).
- `_num` (:354-358) does the same. It is used by buildBudgets (:1210) and by buildLoans' flat columns (:379-395).

The last two read '120,5' correctly, but '1.850,00' becomes 1.85. The delimiter detected in parseCSV (:46) is never used to choose a decimal separator. Scratchpad check: parseFloat('12,50') is 12 and parseFloat('1.850,00') is 1.85.

parseBankAmount (:500-567) must not be reused blind in 'auto' mode on app-written files: '1234.567' would become 1234567.

**Fix.** One strict reader for every restore amount, with one decimal convention per file (D6).

`_restoreAmountText(raw)` is the normalisation shared by both functions below. It strips every space flavour, apostrophe groups (' and ’), € $ £ ¥ and U+FFFD (the character a cp1252 '€' becomes when the file is read as UTF-8, N13), and maps U+2212 to '-'.

`_restoreDecimal(rows, keys)` reads that same normalised text, with a trailing '%' and the sign also removed (N13/E9):
- a cell ending in ',' plus 1–2 digits, or ',' plus 4 or more digits, counts as comma evidence;
- a cell ending in '.' plus 1–2 digits, or '.' plus 4 or more digits, counts as dot evidence;
- the majority wins;
- a tie (all integers, or only ambiguous '1.850') is settled by the delimiter: ';' means comma (an EU spreadsheet), ',' means dot (the app's own export: JS number strings, no grouping).

`_parseRestoreAmount(raw, decimal)` accepts the whole cell or nothing: /^[+-]?(\d{1,3}(\.\d{3})+|\d+)(,\d+)?$/ for comma, /^[+-]?(\d{1,3}(,\d{3})+|\d+)(\.\d+)?$/ for dot. It returns null for an empty cell and NaN for an unreadable one.

Use it in:
- buildTransactions (:169/:196): one signed value serves both the row (its absolute value) and the opening balance (signed);
- buildAccounts (:1276), keeping 'invalid opening balance';
- `_num(raw, decimal)`. buildBudgets passes _restoreDecimal(rows,['amount']), and buildLoans passes _restoreDecimal(rows,['principal','downpayment','duration','annualrate']).

In buildLoans, the flat AnnualRate drops a trailing '%' before parsing. A present-but-unreadable flat cell skips the row with 'invalid amount' instead of falling to `|| 0`, which would silently give a 0% rate. The JSON Config column, the trusted source, is unchanged.

The delimiter reaches the builders as the non-enumerable `rows.delimiter` set by parseCSV, so both importCSV and the tests' buildX(parseCSV(csv)) pick it up with no signature change. Hand-built row arrays default to ','. The bank-import parseBankAmount is untouched.

**Sketch.**

```js
// import.js, replacing _num (:354-358)
// 1.0.2 (BUG-31): a restore file has ONE decimal convention. The app writes dot
// decimals with ','; an EU spreadsheet re-saves with ';', '1.850,00' and '12,50 €'.
_restoreAmountText(raw) {
  return String(raw == null ? '' : raw).trim()
    .replace(/[\s   '’€$£¥�]/g, '')
    .replace(/−/g, '-');
},
_restoreDecimal(rows, keys) {
  let comma = 0, dot = 0;
  rows.forEach(r => keys.forEach(k => {
    const s = this._restoreAmountText(r[k]).replace(/%$/, '').replace(/^[+-]/, '');
    if (/,\d{1,2}$/.test(s) || /,\d{4,}$/.test(s)) comma++;
    else if (/\.\d{1,2}$/.test(s) || /\.\d{4,}$/.test(s)) dot++;
  }));
  if (comma !== dot) return comma > dot ? 'comma' : 'dot';
  return rows.delimiter === ';' ? 'comma' : 'dot';
},
// The whole cell or nothing: null = empty, NaN = not ONE number in that convention.
_parseRestoreAmount(raw, decimal) {
  if (String(raw == null ? '' : raw).trim() === '') return null;
  const s = this._restoreAmountText(raw);
  const re = decimal === 'comma'
    ? /^[+-]?(?:\d{1,3}(?:\.\d{3})+|\d+)(?:,\d+)?$/
    : /^[+-]?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?$/;
  if (!re.test(s)) return NaN;
  return Number(decimal === 'comma' ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, ''));
},
_num(raw, decimal) { return this._parseRestoreAmount(raw, decimal || 'dot'); },

// buildTransactions: before rows.forEach
const decimal = this._restoreDecimal(rows, ['amount']); // 1.0.2 (BUG-31)
// :169-170
const signed = this._parseRestoreAmount(amountStr, decimal);
if (signed === null || isNaN(signed)) { skip('invalid amount'); return; }
const amount = Math.abs(signed); // the opening-balance branch uses `signed` (a card can open in debt)
// buildAccounts :1275-1277
const decimal = this._restoreDecimal(rows, ['openingbalance']); // before rows.forEach
const openingBalance = obRaw === '' ? 0 : this._parseRestoreAmount(obRaw, decimal);
if (openingBalance === null || isNaN(openingBalance)) { skip('invalid opening balance'); return; }
// buildBudgets :1210
const amount = this._num(row['amount'], decimal); // decimal = this._restoreDecimal(rows, ['amount'])
// buildLoans flat branch :379-395
const principal = this._num(row['principal'], decimal);
const duration = this._num(row['duration'], decimal);
const down = this._num(row['downpayment'], decimal);
const rate = this._num(String(row['annualrate'] || '').trim().replace(/\s*%$/, ''), decimal);
if (principal === null || duration === null || !firstPaymentDate) { skip('missing principal, duration or first payment date'); return; }
if ([principal, duration, down, rate].some(v => v !== null && isNaN(v))) { skip('invalid amount'); return; }
// config: downPayment: down || 0, annualRate: rate || 0 (null only for an empty cell)
```

**Data repair.** None possible. A truncated amount (54 instead of 54.30) looks like any other value in the store, and no marker tells it apart from a real integer amount, so any heuristic would rewrite legitimate rows. Release note: users who restored an EU-formatted file on 1.0/1.0.1 should Factory reset and import again on 1.0.2.

**Tests (each fails on the current code).**

- restoreAmounts.test.js: ';' migration file (BOM, CRLF, dd/mm/yyyy) with 12,50 / 7,95 / 1.850,00 through importCSV → stored 12.5 / 7.95 / 1850, and the Conto BPM balance is 1829.55. Fails today (−17.15).
- restoreAmounts.test.js: fullRestore-style. Ledger with cents (54.30, 39.90, 8.95, 12.40, opening 120.50) → export → rewrite both files as an EU spreadsheet would (';', decimal comma, dd/mm/yyyy) → fresh boot → import transactions, then accounts → snapshot equals the one taken before. Fails today (Main Bank 4257.00).
- restoreAmounts.test.js: accounts ';' file with opening_balance '1.850,00' → 1850. Fails today (1.85).
- restoreAmounts.test.js (N13): a ',' file whose Amount cells are quoted, formatted "12,50 €" → _restoreDecimal gives 'comma' and the row stores 12.5. A cell '12,50 �' (an ANSI '€' read as UTF-8) also gives 12.5. Fails today.
- budgetCsvRoundTrip.test.js (new case): ';' budgets file with amount '1.200,50' → 1200.5. Fails today (1.2).
- loanCsvRoundTrip.test.js (new case): ';' flat loans file with Principal '200.000' and AnnualRate '3,5 %' → principal 200000, rate 3.5. Fails today (200).
- restoreAmounts.test.js: in a comma-convention file, '12abc', '1,2,3' and '54.3' are each skipped as 'invalid amount' while the other rows import. Fails today ('12abc' → 12, '54.3' imported).
- restoreAmounts.test.js: _restoreDecimal decisions. ';' integers → 'comma'; ',' integers → 'dot'; a ',' file with a quoted "12,50" → 'comma'; '3,125' in a ';' file → 'comma'.
- restoreAmounts.test.js guard (passes today): the app's own ',' export with 12.345 and 0.30000000000000004 reads back exactly.
- e2e full_restore.spec.js: 'an EU spreadsheet file restores to the cent'. setInputFiles migration_eu.csv → the sheet says 'Imported 3 transactions' → Store total 1829.55. Fails today (−17.15).

**Risks.** - **Stricter reader.** A cell that 1.0.1 accepted loosely ('12 EUR', '3%' outside AnnualRate, '1000abc') is now skipped and reported instead of truncated. That is the intended behaviour, and the reason text 'invalid amount' already exists.
- **Ambiguous 3-digit decimals.** A ',' file whose only decimals have exactly 3 digits ('1.850') reads as 1.85, but the app never writes that. A ',' file of quoted, unformatted 3-decimal rates ("3,125") with no other evidence reads as grouping (3125). This needs a hand-made loans sheet, and the loan engine rejects an absurd rate.
- **Mixed conventions.** In a mixed-convention file, the minority cells are skipped and reported, never mis-scaled.
- The bank-import parser is untouched.

Order dependency: this needs BUG-33's `rows.delimiter`. BUG-78's fingerprint uses the parsed amount, so both must use the same reader, and they do.

### BUG-30 — Duplicate account names are accepted, and a backup restore merges them into one account _(gate, effort L)_

**Root cause.** Confirmed (scratchpad repro: [Visa Credit −345, Visa Debit 880] → [Visa Debit 835]). Inside the app an account is identified by its id; in the backup, only by its name:
- exportTransactions writes only `acc.name` (src/export.js:194). The transactions file has no account id.
- findAccount matches `a.name.toLowerCase() === accountName.toLowerCase()` (src/import.js:184-185), so every 'Visa' row lands on one account.
- A second same-named opening-balance row UPDATE_ACCOUNTs the account the first one created in the same import (:206-208), overwriting −300 with 1000.
- buildAccounts never reads `row['id']` and upserts by lower-cased name (:1293-1300). The second row overwrites the first one's type, colour and opening balance, and the update is counted as 'imported' (:1301).
- ADD_ACCOUNT already honours `payload.id` (src/store.js:1135), but the importer never passes it.

The UI half (no uniqueness check in EditAccountView, views.js:4244-4258, and `Store.findAccountByName`) belongs to U5.

**Fix.** 1) **Export** (export.js:154-160, 185-214): append the columns 'AccountId' (`acc ? acc.id : ''`) and 'Id' (BUG-78). Columns are only ever appended. The accounts file already carries `id`.

2) **Trust (D10).** Id/AccountId are read only when `_isStackdTxFile(rows)` holds: the header has transferref, seriesid, nextdate, importkey and accountcurrency. The accounts file's `id` is read only when its full 1.0 header is present (`_isStackdAccountsFile`: id, createdat, currency, type, icon, color, openingdate). Any other file's ids are ignored, so a migration file's 'ID' or 'Account ID' column ('1', '2'…) never becomes an account id.

3) **New `_restoreAccountResolver(fileIds)`**, next to `_currencyCode` (:1252). `find(fileKey, csvId, name, currency)` resolves:
- (a) the account whose id is csvId;
- (b) otherwise the first account with the same trimmed, case-insensitive name and the same currency when the file gives one (D9/N7). It must not be named by any id in this file, and no other file id may have claimed it in this pass;
- (c) otherwise null, and the caller creates the account under the file's id (ADD_ACCOUNT {id}).

Claims map file key → local id, so every row of one id lands on one account.

4) **buildAccounts.**
- fileIds = the trusted `id` cells. fileKey = the id, or 'row'+i for an id-less row, so two id-less rows never fold.
- On a match: UPDATE_ACCOUNT with type, icon, colour, currency and opening balance from the file, and stats.updated++.
- On an id match, the file's name is applied only when `window.Store.findAccountByName(name, acc.id)` (U5's helper) finds no other live account, and the name has no '�' (D5/N6). Otherwise the local name stays.
- Otherwise: ADD_ACCOUNT {id: csvId || generateId(), …}, claim it, and stats.created++.

5) **buildTransactions, trusted rows (with an AccountId).**
- They resolve through the resolver. fileIds = the AccountId cells.
- Creation always passes an explicit id (the CSV's) and re-reads the account by that id, never by name.
- An account is created only when the row is actually imported (see BUG-78's loop order), never as a side effect of a duplicate.

6) **buildTransactions, legacy rows (no AccountId; D4).**
- Candidates are the accounts with the same trimmed, case-insensitive name and the same currency when AccountCurrency is given. An account created by THIS import answers only to its exact trimmed spelling (E8a), because the file is internally consistent. That splits 'Revolut'/'revolut' and 'Cash'/' cash ' in either file order.
- A row is placed by: the account named inside its own ImportKey; then the single exact spelling; then the first candidate.
- Opening-balance rows (D13/N5): if any candidate existed before this import, the row is skipped as owned. Otherwise the k-th same-spelt opening balance goes to the k-th account this import created, and is created when there is none. Two openings therefore never fold into one, and a name that already exists never gets a second account from an opening balance.
- The same D13 rule applies to trusted rows: an opening balance whose account was not found creates it only when no account with that name and currency existed before the import. Otherwise it is skipped, and the accounts file (ids plus its own opening balance) brings the account.

7) **Ambiguity (N12).** After the dedup drops, a legacy row counts in stats.ambiguousRows/ambiguousAccounts only when it was actually imported, was not placed by its ImportKey, and either was a guess (several candidates shared the spelling) or its exact name ends with more than one account. The result sheet (views.js 3816-3844) adds the line and uses tone 'info'.

**Sketch.**

```js
// import.js, next to _currencyCode (:1252)
// 1.0.2 (BUG-30): ids in a file are trusted only in a Stack'd export (D10).
_isStackdTxFile(rows) {
  const r = rows[0] || {};
  return ['transferref', 'seriesid', 'nextdate', 'importkey', 'accountcurrency']
    .every(k => Object.prototype.hasOwnProperty.call(r, k));
},
_isStackdAccountsFile(rows) {
  const r = rows[0] || {};
  return ['id', 'createdat', 'currency', 'type', 'icon', 'color', 'openingdate']
    .every(k => Object.prototype.hasOwnProperty.call(r, k));
},
// A restore identifies an account by its id; names are not unique ('Visa' credit
// + 'Visa' debit), and upserting by name folded them into one.
_restoreAccountResolver(fileIds) {
  const claimed = new Map(), taken = new Set();
  const key = (n) => String(n || '').trim().toLowerCase();
  return {
    find(fileKey, csvId, name, currency) {
      const accs = window.Store.getState().accounts;
      if (claimed.has(fileKey)) return { acc: accs.find(a => a.id === claimed.get(fileKey)) || null, byId: false };
      let acc = csvId ? (accs.find(a => a.id === csvId) || null) : null;
      const byId = !!acc;
      // D9: the phone's own same-named, same-currency account that no id of THIS file names
      if (!acc) acc = accs.find(a => key(a.name) === key(name) && (!currency || a.currency === currency)
        && !fileIds.has(a.id) && !taken.has(a.id)) || null;
      if (acc) this.claim(fileKey, acc.id);
      return { acc, byId };
    },
    claim(fileKey, localId) { claimed.set(fileKey, localId); taken.add(localId); }
  };
},
// buildAccounts (:1264-1305)
const trusted = this._isStackdAccountsFile(rows);
const fileIds = new Set(trusted ? rows.map(r => String(r['id'] || '').trim()).filter(Boolean) : []);
const resolve = this._restoreAccountResolver(fileIds);
rows.forEach((row, i) => {
  /* name, fields as today; opening balance via BUG-31 */
  const csvId = trusted ? String(row['id'] || '').trim() : '';
  const fileKey = csvId || ('row' + i);
  const { acc, byId } = resolve.find(fileKey, csvId, name, fields.currency);
  if (acc) {
    const upd = Object.assign({ id: acc.id }, fields);
    // D5 (N6): the file's name only on an id match, never one another account uses, never mis-decoded
    if (byId && name !== acc.name && name.indexOf('�') === -1 && !window.Store.findAccountByName(name, acc.id)) upd.name = name;
    window.Store.dispatch('UPDATE_ACCOUNT', upd); stats.updated++;
  } else {
    const id = csvId || window.StackdDB.generateId();
    window.Store.dispatch('ADD_ACCOUNT', Object.assign({ id, name }, fields));
    resolve.claim(fileKey, id); stats.created++;
  }
  stats.importedCount++;
});

// buildTransactions: account part (the full loop order is in BUG-78's sketch)
const trusted = this._isStackdTxFile(rows);
const idCell = (row, k) => trusted ? String(row[k] || '').trim() : '';
const fileAccIds = new Set(rows.map(r => idCell(r, 'accountid')).filter(Boolean));
const resolve = this._restoreAccountResolver(fileAccIds);
const before = window.Store.getState().accounts.slice(); // accounts that existed before this import
const obNth = {};
// per row:
const accountName = String(row['account'] || '').trim(), nk = accountName.toLowerCase();
const csvAccId = idCell(row, 'accountid');
const sameName = (a) => a.name.trim().toLowerCase() === nk && (!accountCurrency || a.currency === accountCurrency);
const preNamed = before.filter(sameName);
// legacy: an account THIS import created answers only to its exact spelling
const legacyCands = () => window.Store.getState().accounts
  .filter(a => sameName(a) && (!createdHere.has(a.id) || a.name.trim() === accountName));
const create = (fields) => {
  const id = csvAccId || window.StackdDB.generateId();
  window.Store.dispatch('ADD_ACCOUNT', Object.assign({ id, name: accountName }, accountCurrency ? { currency: accountCurrency } : {}, fields));
  if (csvAccId) resolve.claim(csvAccId, id);
  createdHere.add(id);
  return window.Store.getState().accounts.find(a => a.id === id);
};
if (type === 'opening_balance') {
  let acc = null;
  if (csvAccId) acc = resolve.find(csvAccId, csvAccId, accountName, accountCurrency).acc;
  else {
    const c = legacyCands();
    if (c.some(a => !createdHere.has(a.id))) { skip('opening balance rows are owned by the account'); return; }
    const k = accountName + '|' + (accountCurrency || '');
    obNth[k] = (obNth[k] || 0) + 1;
    acc = c[obNth[k] - 1] || null; // the k-th opening never overwrites the first
  }
  if (acc && createdHere.has(acc.id)) { window.Store.dispatch('UPDATE_ACCOUNT', { id: acc.id, openingBalance: signed, openingDate: date }); return; }
  // D13 (N5): an opening balance creates an account only for a name this install did not have
  if (acc || preNamed.length) { skip('opening balance rows are owned by the account'); return; }
  create({ openingBalance: signed, openingDate: date }); stats.newAccounts++; return;
}
// non-opening rows: place without creating
let account = null, byId = false, hinted = false, guess = false;
if (csvAccId) ({ acc: account, byId } = resolve.find(csvAccId, csvAccId, accountName, accountCurrency));
else {
  const c = legacyCands();
  const seg = (/^(?:ref|fp):([^|]*)\|/.exec(key0) || [])[1];
  account = (seg && c.find(a => a.id === seg)) || null; hinted = !!account;
  if (!account) { const exact = c.filter(a => a.name.trim() === accountName); const pick = exact.length ? exact : c;
                  account = pick[0] || null; guess = pick.length > 1; }
}
// … dedup checks (BUG-78) …; then: if (!account) { account = create({ openingBalance: 0 }); stats.newAccounts++; }

// export.js TX_HEADERS (:154-160): ..., 'AccountCurrency', 'AccountId', 'Id'   // 1.0.2 (BUG-30, BUG-78)
// row (:212): acc ? (acc.currency || '') : '', acc ? acc.id : '', t.id || ''

// views.js result sheet (:3833-3844), after the skipped block
if (result.ambiguousRows) message += '\n\n' + window.I18n.t('others.importAmbiguousAccounts', { count: result.ambiguousRows, names: result.ambiguousAccounts.join(', ') });
```

**Data repair.** No boot heal is possible. An install that already restored on 1.0.1 holds one merged account, and nothing in the store says how to split it.

Re-restoring the original files on 1.0.2 after a Factory reset brings both accounts back, because the accounts file has always carried `id` (trusted under the 1.0 header). Each account keeps its own type, colour and opening balance.

On a merged install that is NOT reset (D13/N5):
- the old transactions file alone keeps the total, because no second account is created from an opening balance;
- importing the accounts file after it gives two accounts and the right total (the expense split stays a guess, and the sheet reports it).

Rows from a pre-1.0.2 transactions file are split by ImportKey and exact-spelling hints where possible. Otherwise they go on one of the same-named accounts, the total is preserved, and the sheet says so. Installs that still hold duplicate names now write unambiguous backups (AccountId). The prompt to rename duplicates is U5's UI.

**Tests (each fails on the current code).**

- restoreAccounts.test.js: two 'Visa' accounts (Credit card −300, Debit card 1000; expenses 45 and 120) → export all → fresh boot (per-boot id prefixes) → accounts then transactions → two accounts at −345 / 880 with types Credit card / Debit card, total 535. Fails today (one Debit card Visa, 835).
- restoreAccounts.test.js: same ledger, transactions file first, then accounts → same result. Fails today.
- restoreAccounts.test.js: the transactions file alone restores two accounts, each with its own opening balance. Fails today.
- restoreAccounts.test.js: 'Cash'/' cash ', and 'Revolut'/'revolut' with a €200 transfer between them (new-format files) → two accounts each; the transfer legs stay on their own accounts; totals equal the ones before. Fails today.
- restoreAccounts.test.js (E8a): the same Revolut/revolut ledger as a pre-1.0.2 file (AccountId and Id stripped), transactions first and then accounts first → Revolut 100 and revolut 1400 both ways, result.ambiguousRows 0. Fails today (one account at 1200).
- restoreAccounts.test.js: restored accounts keep their backup ids. Fails today (fresh ids).
- restoreAccounts.test.js: importing the accounts file again into the same install leaves both Visas' types and opening balances intact. Fails today (the second row overwrites the first).
- restoreAccounts.test.js: pre-1.0.2 transactions file (AccountId and Id stripped), accounts first → two accounts, total 535, result.ambiguousAccounts ['Visa'], ambiguousRows 2. Fails today (one account, 835).
- restoreAccounts.test.js: pre-1.0.2 transactions file first, then accounts → two accounts, total 535. Fails today (the second opening balance overwrote the first).
- restoreAccounts.test.js (N12): importing that pre-1.0.2 file a second time imports nothing and reports no ambiguity (ambiguousRows 0).
- restoreAccounts.test.js (N5): an install holding the 1.0.1-merged 'Visa' (Debit card, €835) imports the pre-1.0.2 transactions file without a reset → still one account, total 835, both expenses counted as duplicates. Then the accounts file → two accounts, total 535. Fails today for the accounts step (the second row overwrites the first). With the draft design, the first step gives 1835.
- restoreAccounts.test.js (N7): a phone with its own EUR 'Revolut' (one expense) restores a backup whose 'Revolut' is USD (accounts + transactions) → two accounts; the local one keeps EUR, its balance and its row; the USD rows are on the USD account. Fails today (one account relabelled USD).
- restoreAccounts.test.js (N6): after the user renames one of two 'Visa' accounts to 'Visa Credit', re-importing the older accounts file keeps 'Visa Credit' (another 'Visa' exists) while type and opening balance follow the file. A row whose name contains '�' never overwrites the local name. A plain rename with no clash is applied.
- restoreAccounts.test.js (N1): an accounts-shaped file 'ID,Name,Opening Balance' with ids '1','2', imported twice, gives four... no: upserts by name as 1.0.1 did (two accounts), and no account gets id '1'.
- restoreAccounts.test.js guard (passes today): restoring onto a phone that has its own uniquely named EUR 'Cash' merges into it, as before.
- restoreAccounts.test.js: StackdExport.TX_HEADERS ends with 'AccountId','Id', and the cells equal acc.id / t.id. Fails today.
- e2e full_restore.spec.js: 'two wallets with the same name come back as two'. Seed two 'Visa' wallets, export through the buttons, freshInstall, import accounts + transactions → two wallets at −345 / 880. Fails today.

**New i18n keys (×5).** `others.importAmbiguousAccounts.one — en: "{count} row names an account that shares its name with another ({names}). The backup can't tell them apart, so it went to one of them. Check those balances." · fr: "{count} ligne désigne un compte dont le nom est partagé par un autre ({names}). La sauvegarde ne permet pas de les distinguer : elle a été placée sur l'un d'eux. Vérifiez ces soldes." · it: "{count} riga indica un conto che ha lo stesso nome di un altro ({names}). Il backup non permette di distinguerli, quindi è finita su uno dei due. Controlla quei saldi." · es: "{count} fila indica una cuenta que comparte nombre con otra ({names}). La copia de seguridad no permite distinguirlas, así que se asignó a una de ellas. Revisa esos saldos." · pt: "{count} linha indica uma conta que partilha o nome com outra ({names}). A cópia de segurança não permite distingui-las, por isso foi atribuída a uma delas. Verifique esses saldos."`, `others.importAmbiguousAccounts.other — en: "{count} rows name accounts that share a name with another account ({names}). The backup can't tell them apart, so each went to one of them. Check those balances." · fr: "{count} lignes désignent des comptes dont le nom est partagé par un autre compte ({names}). La sauvegarde ne permet pas de les distinguer : chacune a été placée sur l'un d'eux. Vérifiez ces soldes." · it: "{count} righe indicano conti che hanno lo stesso nome di un altro conto ({names}). Il backup non permette di distinguerli, quindi ognuna è finita su uno di essi. Controlla quei saldi." · es: "{count} filas indican cuentas que comparten nombre con otra cuenta ({names}). La copia de seguridad no permite distinguirlas, así que cada una se asignó a una de ellas. Revisa esos saldos." · pt: "{count} linhas indicam contas que partilham o nome com outra conta ({names}). A cópia de segurança não permite distingui-las, por isso cada uma foi atribuída a uma delas. Verifique esses saldos."`

**Risks.** - **Restores over the same install update by id.** A rename made since the backup is kept when another account already uses the file's name (D5). Otherwise it reverts, like type, icon and colour.
- **No collision guard on ADD_ACCOUNT {id}.** The resolver only creates an id it has just failed to find, and a unit test pins this.
- **Test fixtures.** New fixtures must use per-boot id prefixes, as fullRestore.test.js does, or kept ids from boot 1 collide with boot 2 counters.
- **The store stays ungated.** An import may still create same-named accounts, faithful to the backup; only U5's form rejects them.

Accepted limits:
- **A local currency change since the backup** (Edit account or a relabel) makes a legacy or id-less restore over the same install create a second account with the same name in the backup's currency. It is visible and never merges or relabels local history. A new-format file resolves by id and is unaffected.
- **On an install restored before 1.0.2, an account renamed since then** is not matched by name, so a later import of the old file brings its rows back on a new account under the old name.
- **D13 trade-off.** A backup holding two same-named accounts, restored onto a phone with its own account of that name, gets the second account from its first imported row (or from the accounts file) rather than from its opening-balance row.

Interactions:
- BUG-32's key rebase maps through this resolver.
- BUG-78's fingerprint uses the resolved and pre-existing same-named accounts.
- U5 defines Store.findAccountByName; U6 only calls it.

### BUG-32 — After a backup restore, re-importing a bank statement duplicates every row _(gate, effort S)_

**Root cause.** Confirmed (scratchpad repro):
- A re-import into the same install shows 3 duplicates.
- After export → fresh boot → restore, the account id changed and the same statement showed 0 duplicates. Re-importing took Main Bank from €2,165.60 to €2,831.20.

Why:
- `_stampImportKey` embeds the local account id in every key: 'ref:' + accountId + '|' … (src/import.js:808) and 'fp:' + accountId + '|' … (:816).
- buildTransactions restores the key verbatim (:261-262).
- The restore recreates accounts under new ids: buildAccounts ignores `row['id']` (:1293-1299), and the transactions file's auto-create (:216-224) uses a fresh id too.
- So `Store.hasImportKey` (store.js:2870, an exact Set lookup) and BATCH_IMPORT_BANK_TRANSACTIONS (store.js:1994) never match.

Bank Connect builds its keys through the same builder (bank-connect.js:698 → buildStatementTransactions), so a reconnect after a restore duplicates history too.

**Fix.** Keep the key format; make restored keys follow their account.
- (a) Id-keeping from BUG-30 makes new-format restores match by construction.
- (b) A new `Store.rebaseImportKey(key, accountId)` swaps the account segment between 'ref:'/'fp:' and the first '|'.
- (c) The import-time mapping `_restoredKey(key, ctx)` (N9/E6) maps the key's segment through this import:
  - a segment that is an account of the file maps to the local account the resolver gives for it: itself when ids are kept, the merge target under D9, or the file id when the account is about to be created under it;
  - a segment that names a live account here is unchanged, so a row the user moved to another account keeps its key, as in D7;
  - anything else maps to the account the row lands on.

  This covers pre-1.0.2 backups and the transactions-first order without rewriting keys that still name a live account.
- (d) A boot heal `_healRestoredImportKeys()`, called in init after `_healRecurrenceGenerators()` (store.js:460). It re-points a key only when its segment names NO account in this install and the row's own account is live (D7).

Both helpers live in store.js so the boot heal and import.js share one implementation. import.js runs after store.js, both at boot and in tests.

Option 2 from the report (account-free keys scoped by accountId) would change every stored key and the index semantics in three store cases, so it is not proposed.

**Sketch.**

```js
// store.js, after hasImportKey (:2870-2872)
// 1.0.2 (BUG-32): statement keys embed the account they were imported into
// ('ref:<accountId>|…' / 'fp:<accountId>|…', import.js _stampImportKey).
rebaseImportKey(key, accountId) {
  const m = /^(ref|fp):[^|]*\|/.exec(String(key || ''));
  return m ? m[1] + ':' + accountId + key.slice(m[0].length - 1) : key;
},
// A restore before 1.0.2 gave every account a new id but kept the old keys, so the
// same statement imported again matched nothing and was added twice. Only a key
// naming NO account of this install is re-pointed (a moved row keeps its key, D7).
_healRestoredImportKeys() {
  const live = new Set(this.state.accounts.map(a => a.id));
  let healed = false;
  this.state.transactions.forEach(t => {
    if (!t.importKey || !live.has(t.accountId)) return;
    const m = /^(?:ref|fp):([^|]*)\|/.exec(t.importKey);
    if (!m || live.has(m[1])) return;
    t.importKey = this.rebaseImportKey(t.importKey, t.accountId);
    healed = true;
  });
  if (healed) { this._importKeyIdx = null; window.StackdDB.save('transactions', this.state.transactions); }
},
// store.js init, after :460
this._healRestoredImportKeys(); // 1.0.2 (BUG-32)

// import.js, next to the resolver
// 1.0.2 (BUG-32): map a restored key's account through this import. A file
// account → what it resolves to here (itself when ids are kept); a live
// account → unchanged (a moved row keeps its key); else the landing account.
// null = the landing account does not exist yet (stamped after it is created).
_restoredKey(key, ctx) {
  const m = /^(?:ref|fp):([^|]*)\|/.exec(key);
  if (!m) return key;
  const seg = m[1];
  let to;
  if (ctx.fileAcc[seg]) { const { acc } = ctx.resolve.find(seg, seg, ctx.fileAcc[seg].name, ctx.fileAcc[seg].ccy); to = acc ? acc.id : seg; }
  else if (window.Store.getState().accounts.some(a => a.id === seg)) to = seg;
  else to = ctx.landingId;
  return to ? window.Store.rebaseImportKey(key, to) : null;
},
// buildTransactions (replaces :261-262); fileAcc = { fileAccountId: {name, ccy} } from each id's first row
const key0 = String(row['importkey'] || '').trim();
let key = key0 ? this._restoredKey(key0, { resolve, fileAcc, landingId: account ? account.id : (csvAccId || null) }) : '';
// … BUG-78 checks storeKeys.has(key) …
if (key0 && !key) key = window.Store.rebaseImportKey(key0, account.id); // account created just now
if (key) tx.importKey = key;
```

**Data repair.** Yes, via `_healRestoredImportKeys` at boot.

Why there are no false positives: a stale segment appears only after a restore. Every path builds a key for its row's own account:
- CSV and statement import;
- APPLY_IMPORT_MATCHES links (filtered to `t.accountId === accountId`, import.js:1099);
- Bank Connect (stackdAccountId);
- generated clones, which strip importKey since 1.0.1.

A row moved to another account keeps a live segment, so it is skipped. If the original account was later deleted, the moved row now follows its current account, which is correct. A key a 1.0.2 restore points at a file account that never got created (all its rows were duplicates) is repaired the same way at the next boot.

The heal is idempotent, O(T), and saves only when something changed.

Accepted limit: duplicates already added by a re-import after a 1.0.1 restore stay in the store. Both copies now carry the same key, so future imports dedup, but the heal cannot know which copy the user edited.

**Tests (each fails on the current code).**

- importKeyRestore.test.js: a camt-shaped statement (3 entries, 2 with bankRef, 1 fp) imported into Main Bank → export all → fresh boot → restore in export order → buildStatementTransactions(sameStatement, accountId) reports stats.duplicates 3, ok 0. Fails today (0 / 3).
- importKeyRestore.test.js: same, with the transactions file restored first. Fails today.
- importKeyRestore.test.js: a pre-1.0.2 transactions file (AccountId and Id stripped) imported before the accounts file → still 3 duplicates. Only the import-time mapping makes this pass. Fails today.
- importKeyRestore.test.js: a bank-CSV fp-keyed import (buildBankTransactions) → export → restore → re-build → all duplicates. Fails today.
- importKeyRestore.test.js (N9): a ref-keyed bank row imported into A and then moved to B (UPDATE_TRANSACTION accountId B) → export (1.0.2) → fresh boot → restore → its key still names A, and re-importing A's statement reports that row as a duplicate (nothing new lands in A). With the draft's always-landing rebase it would be offered again.
- importKeyRestore.test.js: boot heal. Seed a stored row on live account A with importKey 'ref:GONE|BK1#2' → Store.init → key 'ref:A|BK1#2', hasImportKey true, transactions saved. Fails today (key unchanged).
- importKeyRestore.test.js guards: a stored key naming another LIVE account (a moved row) is left alone at boot; a store with nothing stale does not call StackdDB.save for transactions; rebaseImportKey leaves keys that are not ref:/fp: untouched.
- e2e (in the BUG-33 full_restore case): after the restore, page.evaluate buildStatementTransactions on the seeded statement reports every row as a duplicate. Fails today.

**Risks.** - **Co-dependent ?v= bumps.** import.js now calls Store.rebaseImportKey, so the integrator must bump store.js and import.js together.
- **Index invalidation.** `_importKeyIdx` is invalidated in the heal, and `_sortData()` at the end of init also nulls it.
- **A key may name a file account that is never created**, when its rows were all duplicates and D13 skipped its opening balance. Such a key self-heals at the next boot.
- Bank Connect (newestImportedDate, countNew) benefits with no change in bank-connect.js.
- Depends on BUG-30's resolver.

### BUG-78 — Importing the same backup file twice silently duplicates every transaction, series and loan _(gate, effort L)_

**Root cause.** Confirmed (scratchpad repro: after a restore, a second import of the transactions file took the store from 4 to 7 transactions and Main Bank from €2,165.60 to €2,831.20).
- buildTransactions (src/import.js:142-277) never compares incoming rows with the store. The comment at :258-260 says 'No dedup happens here'.
- importCSV dispatches BATCH_IMPORT_TRANSACTIONS unconditionally (:1508-1514).
- BATCH_IMPORT_TRANSACTIONS (src/store.js:1969-1982) appends every row under a fresh id.
- The export carries no per-row id (export.js:154-160), so nothing could recognise a row anyway.
- `_relinkTransfers`/`_relinkSeries` (:281-340) deliberately re-key colliding refs and series so that a re-imported copy coexists with the original.
- Loans: every row becomes an ADD_LOAN (:1466-1470), and ADD_LOAN always mints an id (store.js:2337). 1.0.1's `_releaseOwnedLoanLinks` only stops the copy from sharing the series.

Also verified: BATCH_IMPORT_TRANSACTIONS spreads `...t` after the generated id (:1971-1976), so a payload row that carries an existing id is stored as a second row with the SAME id. That becomes a live hazard once restores keep ids.

Three local edits replace series members with new ids under the same seriesId:
- a this-and-future date or schedule change;
- SYNC_LOAN_SERIES 'finish' / DELETE_LOAN {deleteFuturePayments} (store.js:2413, 2483), which delete members;
- converting a member into a transfer (views.js:2328).

The form also stores notes untrimmed (views.js:2230), and BATCH_IMPORT stamps the import time on a row without one (store.js:1973). Both matter for recognising rows that carry no known id.

**Fix.** 1) **Export:** an 'Id' column, added with BUG-30's AccountId. It is trusted only in a Stack'd export (D10).

2) **buildTransactions loop order** for a non-opening row. Opening-balance rows keep their own branch first (owned by the account, D13). Each check below runs before anything is created:
- (a) **Id.** A trusted Id already in the store → duplicate (D1). A repeat of an Id earlier in the same file is NOT a duplicate: it is imported under a fresh id (N8).
- (b) **Series held here (D11).** A SeriesId this install already holds → duplicate.
- (c) **Placement.** The account is resolved without creating it (BUG-30).
- (d) **Bank key.** The ImportKey, rebased through this import (BUG-32), is already a store key → duplicate. Store keys are read from `state.transactions` directly, not the memoized `_importKeyIdx`, which tests that wipe state leave stale. The store row holding that key leaves the fingerprint pool.
- (e) **Fingerprint (D2, N2/N3/E3).** A multiset pool is built from store rows. It leaves out opening balances and rows whose id the file names, so a row matched by id can never absorb another. The key is account | ISO date | type | cents | whitespace-collapsed note, with each entry's normalised time. A file row is absorbed by the first entry in its landing account (only that account when matched by id; otherwise also every same-named, same-currency account that existed before the import) whose time equals the row's, or where either side has no time. Each store row absorbs one file row, so genuine twins survive.
- (f) **New row.** Only now are the account (BUG-30) and the category created. The CSV id is kept, and the note is flattened (D12).

Every duplicate counts in stats.duplicateCount and records its CSV SeriesId and TransferRef.

3) **After the loop (D11/N4)**, before _relinkTransfers/_relinkSeries, drop every built row that:
- belongs to a CSV series one of whose rows was recognised (this covers 1.0-era restores whose series ids differ); or
- is the other leg of a transfer one of whose legs was recognised.

Each dropped row counts as a duplicate. Both legs of a recurring transfer go together, and a deleted, regenerated or converted member never comes back as a detached copy next to the local chain. A row with a repeated ImportKey inside the file is still imported (faithful restore; see the summary).

4) **Loans:** a new route-level `_skipKnownLoans(loans, stats)`, run before `_releaseOwnedLoanLinks` in importCSV. It skips a loan whose kind + trimmed lower-cased name + key-sorted config JSON equals one already in the store. It is a multiset, so an empty phone still restores two identical loans from one file. No loans-file format change (D3).

5) **BATCH_IMPORT_TRANSACTIONS** drops a payload row whose id is already in the store, as a last line of defence that keeps ids unique (it mirrors BATCH_IMPORT_BANK_TRANSACTIONS). The id is written after the spread, so `id: undefined` cannot erase the generated one.

6) **Result sheet:** a localised line "N rows were already in Stack'd…", and tone 'info' when it, skipped rows or the ambiguity line appear.

**Sketch.**

```js
// import.js — buildTransactions (:142-277), 1.0.2 shape (BUG-30/31/32/33/78)
buildTransactions(rows) {
  const stats = { importedCount: 0, newAccounts: 0, newCategories: 0, skippedCount: 0, skipped: {},
    duplicateCount: 0, ambiguousRows: 0, ambiguousAccounts: [] };
  /* skip(), txs, createdHere as today; BUG-30 setup: trusted, idCell, fileAccIds, resolve, before, obNth */
  const st0 = window.Store.getState();
  const decimal = this._restoreDecimal(rows, ['amount']);                       // BUG-31
  const fileTxIds = new Set(rows.map(r => idCell(r, 'id')).filter(Boolean));
  const fileAcc = {};
  rows.forEach(r => { const id = idCell(r, 'accountid');
    if (id && !fileAcc[id]) fileAcc[id] = { name: String(r['account'] || '').trim(), ccy: this._currencyCode(r['accountcurrency']) }; });
  const storeIds = new Set(st0.transactions.map(t => t.id));
  const storeKeys = new Set(st0.transactions.map(t => t.importKey).filter(Boolean)); // not _importKeyIdx
  const heldSeries = new Set(st0.transactions.map(t => t.recurrence && t.recurrence.seriesId).filter(Boolean));
  const pool = this._fingerprintPool(st0.transactions, fileTxIds);
  const seenIds = new Set(), matchedSeries = new Set(), dupRefs = new Set(), legacy = [];

  rows.forEach(row => {
    /* date, signed/amount (BUG-31), type, transfer guard, accountName/accountCurrency as today */
    const note = this._oneLine(row['note'] || row['comment'] || '');          // D12
    const csvId = idCell(row, 'id'), csvAccId = idCell(row, 'accountid');
    const sid = String(row['seriesid'] || '').trim(), ref = String(row['transferref'] || '').trim();
    /* opening_balance branch: BUG-30 sketch (D13) */
    if (type !== 'expense' && type !== 'income') type = 'expense';
    const dup = () => { stats.duplicateCount++; if (sid) matchedSeries.add(sid); if (ref) dupRefs.add(ref); };
    if (csvId && storeIds.has(csvId)) { dup(); return; }          // (a) D1: this row is here
    if (sid && heldSeries.has(sid)) { dup(); return; }            // (b) D11: this series is owned here
    /* (c) placement without creating: account, byId, hinted, guess (BUG-30 sketch) */
    const key0 = String(row['importkey'] || '').trim();
    let key = key0 ? this._restoredKey(key0, { resolve, fileAcc, landingId: account ? account.id : (csvAccId || null) }) : '';
    if (key && storeKeys.has(key)) { this._dropFromPool(pool, key); dup(); return; }   // (d)
    const fpAccs = byId ? [account.id]
      : [...new Set([account && account.id].concat(preNamed.map(a => a.id)).filter(Boolean))];
    if (this._takeFingerprint(pool, fpAccs, { date, time: row['time'], type, amount, note })) { dup(); return; } // (e)
    if (!account) { account = create({ openingBalance: 0 }); stats.newAccounts++; }      // (f)
    if (key0 && !key) key = window.Store.rebaseImportKey(key0, account.id);
    /* category resolution as today (:226-236) */
    const tx = { type, amount, accountId: account.id, categoryId: category ? category.id : '', date, comment: note };
    if (csvId && !seenIds.has(csvId)) { tx.id = csvId; seenIds.add(csvId); }         // N8: a repeat gets a fresh id
    /* time, tags, isPaid, _csvTransferRef as today */
    if (key) tx.importKey = key;
    /* bankRef, recurrence as today */
    if (!csvAccId) legacy.push({ tx, name: accountName, ccy: accountCurrency, hinted, guess });
    txs.push(tx); stats.importedCount++;
  });

  // D11: a series one of whose rows was here, and the other leg of a transfer one of
  // whose legs was here, are owned here (one pass: recurring-transfer legs share a series)
  const out = txs.filter(t => {
    const owned = (t.recurrence && matchedSeries.has(t.recurrence.seriesId)) || (t._csvTransferRef && dupRefs.has(t._csvTransferRef));
    if (owned) { stats.duplicateCount++; stats.importedCount--; }
    return !owned;
  });
  // BUG-30 (N12): only imported legacy rows that were placed by a guess
  const kept = new Set(out), names = new Set(), accs = window.Store.getState().accounts;
  legacy.forEach(r => {
    if (!kept.has(r.tx) || r.hinted) return;
    const same = accs.filter(a => a.name.trim() === r.name && (!r.ccy || a.currency === r.ccy)).length;
    if (r.guess || same > 1) { stats.ambiguousRows++; names.add(r.name); }
  });
  stats.ambiguousAccounts = [...names];
  this._relinkTransfers(out);
  this._relinkSeries(out);
  return { transactions: out, stats };
},

// 1.0.2 (BUG-78): rows Stack'd already holds under another id (old backups,
// spreadsheet rows, installs restored before 1.0.2). Whitespace-collapsed note,
// ISO date, cents; each entry keeps its time so a time-less row matches any time.
_fpBase(date, type, amount, note) {
  return [this._normalizeDate(date) || '', type, Math.round(Math.abs(Number(amount)) * 100),
    String(note || '').replace(/\s+/g, ' ').trim()].join('|');
},
_fingerprintPool(storeTxs, excludeIds) {
  const lists = new Map(), byKey = new Map();
  storeTxs.forEach(t => {
    if (t.type === 'opening_balance' || excludeIds.has(t.id)) return;
    const k = t.accountId + '|' + this._fpBase(t.date, t.type, t.amount, t.comment);
    const e = { time: this._normalizeTime(t.time) || '' };
    if (!lists.has(k)) lists.set(k, []);
    lists.get(k).push(e);
    if (t.importKey) byKey.set(t.importKey, { k, e });
  });
  return { lists, byKey };
},
_takeFingerprint(pool, accountIds, r) {
  const base = this._fpBase(r.date, r.type, r.amount, r.note);
  const time = this._normalizeTime(r.time) || '';
  for (const id of accountIds) {
    const list = pool.lists.get(id + '|' + base);
    const i = list ? list.findIndex(e => !time || !e.time || e.time === time) : -1;
    if (i !== -1) { list.splice(i, 1); return true; }
  }
  return false;
},
_dropFromPool(pool, key) {
  const hit = pool.byKey.get(key);
  if (!hit) return;
  const list = pool.lists.get(hit.k), i = list ? list.indexOf(hit.e) : -1;
  if (i !== -1) list.splice(i, 1);
  pool.byKey.delete(key);
},

// import.js, after _releaseOwnedLoanLinks (:469)
// 1.0.2 (BUG-78): a loan already in Stack'd (same kind, name and terms) is not added
// again. A multiset: two identical loans in a file still restore onto an empty phone.
_skipKnownLoans(loans, stats) {
  const sig = (l) => [l.kind === 'sim' ? 'sim' : 'active', String(l.name || '').trim().toLowerCase(), this._stableJson(l.config)].join('|');
  const have = new Map();
  (window.Store.getState().loans || []).forEach(l => have.set(sig(l), (have.get(sig(l)) || 0) + 1));
  stats.duplicateCount = 0;
  return loans.filter(l => { const k = sig(l), n = have.get(k) || 0; if (!n) return true;
    have.set(k, n - 1); stats.duplicateCount++; stats.importedCount--; return false; });
},
_stableJson(v) {
  if (Array.isArray(v)) return '[' + v.map(x => this._stableJson(x === undefined ? null : x)).join(',') + ']';
  if (v && typeof v === 'object') return '{' + Object.keys(v).filter(k => v[k] !== undefined).sort()
    .map(k => JSON.stringify(k) + ':' + this._stableJson(v[k])).join(',') + '}';
  return JSON.stringify(v);
},
// importCSV loans branch (:1466-1477)
const { loans, stats } = this.buildLoans(rows);
const fresh = this._skipKnownLoans(loans, stats); // 1.0.2 (BUG-78)
this._releaseOwnedLoanLinks(fresh);
fresh.forEach(loan => window.Store.dispatch('ADD_LOAN', loan));
if (fresh.length > 0) window.Store.dispatch('RELINK_LOAN_SERIES');

// store.js BATCH_IMPORT_TRANSACTIONS (:1969-1982)
// 1.0.2 (BUG-78): a restore keeps each row's id; one id is one transaction.
const importTime = this._getSystemTimeString();
const ids = new Set(this.state.transactions.map(t => t.id));
const newTxs = [];
payload.transactions.forEach(t => {
  if (t.id && ids.has(t.id)) return;
  const row = { time: t.time || importTime, ...t, id: t.id || window.StackdDB.generateId(), createdAt: t.createdAt || new Date().toISOString() };
  ids.add(row.id); newTxs.push(row);
});
if (!newTxs.length) break;
this.state.transactions.push(...newTxs);
/* _sortTransactions, save, changed = true as today */

// views.js result sheet (:3833-3844)
if (result.duplicateCount) message += '\n\n' + window.I18n.t('others.importDuplicates', { count: result.duplicateCount });
/* BUG-30 ambiguity line */
tone: (result.skippedCount || result.duplicateCount || result.ambiguousRows) ? 'info' : 'success',
```

**Data repair.** None. Duplicates created by a 1.0/1.0.1 double import got fresh ids on both copies, and the store cannot safely tell them apart from genuine twins. Automatic deletion could remove real money movements.

Accepted limit: the user deletes them, or factory-resets and restores once on 1.0.2. A backup taken after such a double import restores both copies faithfully (repeated keys are not collapsed). A cleanup tool would be a separate feature.

**Tests (each fails on the current code).**

- restoreDedup.test.js: restore onto a new phone, then import the transactions file again → result.importedCount 0, result.duplicateCount N; transaction count, balances and series count unchanged; exactly one armed member per series. Fails today (doubled).
- restoreDedup.test.js: same-install re-import (no reset) → same. Fails today.
- restoreDedup.test.js: a pre-1.0.2 file (Id/AccountId stripped) imported twice → the second import is all duplicates via the fingerprint. Fails today.
- restoreDedup.test.js (N2): ledger exported in the 1.0.2 format → restored onto boot 2 with the Id and AccountId columns stripped (a 1.0.1-style restore: fresh ids) → import of the full 1.0.2 file gives importedCount 0 and every non-opening row counted as a duplicate. Fails with the draft (fingerprint off when the Id column exists).
- restoreDedup.test.js (N2): in a 1.0.2 file, a row with an empty Id cell copying an existing row's content is a duplicate; a row with an empty Id and new content is imported.
- restoreDedup.test.js (N2/E7): a bank row deleted locally and re-imported from its statement (new id, same key), then the older backup restored → the backup's row is skipped by its ImportKey; one row with that key. Fails today.
- restoreDedup.test.js (N3): store notes 'Coffee ' (typed with a trailing space) and a flattened camt note, against a pre-1.0.2 file holding 'Coffee' and the multi-line 'Supermercato\nRossi — Spesa' → 0 imported, 2 duplicates.
- restoreDedup.test.js (N3): a time-less migration file (Date,Type,Amount,Account,Category,Note) imported twice → the second import is all duplicates (the first import stamped times).
- restoreDedup.test.js: the fingerprint is a multiset: the store holds one €3.50 coffee, an id-less file holds two identical ones → importedCount 1, duplicateCount 1.
- restoreDedup.test.js (E3): an install holding two 'Visa' accounts restores an id-stripped re-export of itself → 0 imported, every row a duplicate, both balances unchanged.
- restoreDedup.test.js: restored transactions keep their backup ids. Fails today.
- restoreDedup.test.js (N1): two foreign files 'ID,Date,Type,Amount,Account,Category,Note', each numbered from 1 with different rows → every row of both imports onto the named accounts; no transaction or account takes id '1'.
- restoreDedup.test.js (N8): a 1.0.2 file in which two rows share one Id that the store does not hold → both import, the second under a fresh id, duplicateCount 0.
- restoreDedup.test.js (N4, rewritten partial-series case): delete one past member locally, restore the backup → no row comes back (duplicateCount counts it); one series, one armed member, the original seriesId. Fails today (the whole series is duplicated).
- restoreDedup.test.js (N4): change a monthly series' date from the 7th to the 5th with 'this and future' (from a past member) after the backup, then restore the backup → exactly one member per month, one armed member, no new series id. Fails with the draft (old members come back re-keyed).
- restoreDedup.test.js (N4): SYNC_LOAN_SERIES 'finish' (or DELETE_LOAN {deleteFuturePayments}) after the backup, then restore → the deleted payments stay deleted; the loan's linked count is unchanged.
- restoreDedup.test.js (D11, transfer pair): delete the account on one side of a transfer after the backup (BUG-14 turns the other leg into a plain row with the same id), then restore → the deleted side's leg does not come back alone.
- restoreDedup.test.js: loans file imported twice → one loan; the second result has duplicateCount 1, importedCount 0. Fails today (two loans).
- restoreDedup.test.js guard: a loans file holding two identical loans restores both onto an empty phone.
- restoreDedup.test.js: BATCH_IMPORT_TRANSACTIONS with a row whose id already exists leaves exactly one row with that id; a row with id undefined still gets a generated id. Fails today (two rows with one id).
- noticeSheet.test.js (new case): importCSV stub returning duplicateCount 3 → the sheet body contains the importDuplicates line and the tone is 'info'.
- e2e full_restore.spec.js: 'the same transactions file twice'. Import stackd_transactions.csv a second time → the sheet contains "already in Stack'd" and summary() is unchanged. Fails today.

**New i18n keys (×5).** `others.importDuplicates.one — en: "{count} row was already in Stack'd, so it was skipped." · fr: "{count} ligne était déjà dans Stack'd, elle a donc été ignorée." · it: "{count} riga era già in Stack'd, quindi è stata saltata." · es: "{count} fila ya estaba en Stack'd, así que se ha omitido." · pt: "{count} linha já estava no Stack'd, por isso foi ignorada."`, `others.importDuplicates.other — en: "{count} rows were already in Stack'd, so they were skipped." · fr: "{count} lignes étaient déjà dans Stack'd, elles ont donc été ignorées." · it: "{count} righe erano già in Stack'd, quindi sono state saltate." · es: "{count} filas ya estaban en Stack'd, así que se han omitido." · pt: "{count} linhas já estavam no Stack'd, por isso foram ignoradas."`

**Risks.** - **Test churn is expected.** Same-install round-trip tests that re-import their own export now get 0 rows (see testImpact).
- **D1 (local wins).** Restoring an older backup over edited rows keeps the local version. Deleted one-off rows come back, as a restore should.
- **D11.** Members of a series held here, and the partner leg of a transfer already here, never come back.

Accepted limits:
- **Edited rows in files without ids.** In a pre-1.0.2 file, a row edited since the backup does not match the fingerprint and comes back as a second copy. New-format files match by id.
- **Deleted and recreated series.** A series deleted entirely since the backup comes back on a restore over the same install, like any deleted row. If it was replaced by a new series (re-created, or converted to a transfer), both then run.
- **Series changed on another phone.** Members that exist only in the backup are not imported (local wins), for example after the series was extended there.
- **Changed loan terms.** A loan whose terms changed since the backup still imports as a second loan; _releaseOwnedLoanLinks keeps its series single-owned (1.0.1 behaviour).

Other notes:
- **Result sheet.** An all-duplicate import reads 'Imported 0 transactions' plus the duplicates line. The owner may want a different headline later (not proposed).
- **Series re-key.** `_relinkSeries`' collision re-key can no longer trigger for a CSV series id (held series are skipped first). It stays as a defence.
- **Dead code.** importLoans (:1401-1416) has no callers and is left as is.

Depends on BUG-30 (placement, pre-existing same-named accounts), BUG-31 (one amount reader), BUG-32 (rebased keys) and BUG-33 (full notes, one-line notes).

### R1: Multi-line bank notes already stored (camt imports before 1.0.2) get their words merged when the row is edited _(rider, recommended, effort S)_

**Root cause.** Before 1.0.2, parseCamt kept raw line breaks (src/import.js:855 text(), :894-896). The transaction form's note field is a single-line `<input type="text" id="tx-comment">` (src/views.js:1666), and browsers strip CR/LF from its value. Opening and saving such a row therefore stores 'SupermercatoRossi — Spesa settimanale' (observed by the G6-F01 verifier). BUG-33 (D12) stops every 1.0.2 import from writing line breaks, a restore included, but rows already on devices keep them.

**Fix.** A boot heal `_healMultilineNotes()` in store.js, called right after `_healRestoredImportKeys()`. It replaces /[ \t]*[\r\n]+[ \t]*/g with one space in any transaction comment that contains CR or LF (the same rule as StackdImport._oneLine), and saves only when something changed.

No key is affected: importKey and bankRef are stored values, and fp normDesc already collapses whitespace. Rule matches are not rewritten. BUG-33's collapsed compare in ADD_IMPORT_RULE/matchImportRule already handles legacy rules, and the rules list renders them on one line (components.js:3272, white-space: nowrap).

**Sketch.**

```js
// store.js, next to _healRestoredImportKeys
// 1.0.2 (BUG-33 follow-up): camt imports before 1.0.2 stored line breaks the
// one-line note field drops on save (words merged). Flatten them once — the
// same rule StackdImport._oneLine applies to every import since 1.0.2.
_healMultilineNotes() {
  let healed = false;
  this.state.transactions.forEach(t => {
    if (typeof t.comment === 'string' && /[\r\n]/.test(t.comment)) {
      t.comment = t.comment.replace(/[ \t]*[\r\n]+[ \t]*/g, ' ').trim();
      healed = true;
    }
  });
  if (healed) window.StackdDB.save('transactions', this.state.transactions);
},
// store.js init, after _healRestoredImportKeys()
this._healMultilineNotes(); // 1.0.2 (BUG-33 follow-up)
```

**Data repair.** This rider is itself the repair. It is safe because, from 1.0.2, no write path can store a line break: the UI cannot, and every import flattens (D12). So every affected row is a legacy camt import, or a legacy multi-line note restored on 1.0.1, and flattening it is what the edit form would do anyway, minus the merged words.

**Tests (each fails on the current code).**

- multilineNotesHeal.test.js: a stored comment 'Supermercato\nRossi — Spesa' becomes 'Supermercato Rossi — Spesa' after Store.init; importKey unchanged. Fails today.
- multilineNotesHeal.test.js guard: a store without line breaks does not call save for transactions.

**Risks.** It touches the same store.js init lines as BUG-32 and other units' heals; it is append-only and the integrator unions the calls. BUG-78's fingerprint compares whitespace-collapsed notes, so a pre-1.0.2 backup still dedups against healed rows.

### R2: CSV import skip reasons are shown in English in every language _(rider, not recommended, effort M)_

**Root cause.** Every restore builder uses English reason strings both as stats keys and as display text (skip('invalid amount') and so on in src/import.js). The Settings result sheet prints them verbatim (src/views.js:3834-3836). docs/deep-test-fixes-plan.md already listed this as out of scope for 1.0.1 ('the untranslated CSV-import skip reasons').

**Fix.** Keep the English strings as stable codes in stats.skipped, and map them to `others.skip.<code>` keys at display time in the result sheet.

**Sketch.**

```js
// views.js :3834-3836
const reasons = Object.keys(result.skipped).map(r => `• ${result.skipped[r]} — ${window.I18n.t('others.skip.' + SKIP_CODES[r]) || r}`).join('\n');
```

**Data repair.** None.

**Tests (each fails on the current code).**

- The i18n guard covers the new keys. Existing tests that assert English reason keys (csvRoundTrip, fullRestore, budgetCsvRoundTrip, loanCsvRoundTrip, localeFormatting) keep passing, because the codes do not change.

**New i18n keys (×5).** `others.skip.* — about 13 keys × 5 languages (missing date/amount/account, unrecognised date format, invalid amount, transfer row, opening balance owned, missing name, invalid opening balance, missing category, unreadable month, end before start, duplicate category name, missing match or category, missing loan essentials)`

**Risks.** Wide and cosmetic, and it touches the result sheet shared with the new 1.0.2 lines. It is better shipped as its own change than inside a gate round.

### U6 decisions

- **U6-D1** A backup row's Id is already in Stack'd: the same file imported twice, or a backup restored 'to be safe' over the same install. What happens to the row?
  - Skip it and report "N rows were already in Stack'd" (the local version wins)
  - Overwrite the local row with the backup's version (full 'restore' semantics; loses edits made since the backup)
  - Ask before importing when most rows are already present
  - _Recommended:_ Skip it and report "N rows were already in Stack'd" (the local version wins) — This matches the bank import's dedup and the report's expected behaviour, and it never destroys edits made since the backup. Overwriting would also have to reconcile recurrence chains and transfer pairs, which is how the duplicate-chain bugs started.
- **U6-D2** Some rows carry no Id that Stack'd knows: backups from before 1.0.2, rows added in a spreadsheet, or rows on installs restored on 1.0/1.0.1, whose ids are all new. How are such rows recognised as already in Stack'd?
  - Every row the Id did not match goes through a fallback. First its bank ImportKey, re-pointed to the account it lands on, is checked against the store. Then a multiset fingerprint: date + time + type + amount + account + note, whitespace-normalised; a missing time matches any time; the account may be any same-named, same-currency account that existed before the import. Each store row absorbs one file row
  - Fingerprint only files that have no Id column at all (the draft); rows with unknown ids are always added
  - No dedup for rows without a known Id (accept duplicates, document it)
  - Show a confirm sheet when most rows match the store
  - _Recommended:_ Every row the Id did not match goes through a fallback. First its bank ImportKey, re-pointed to the account it lands on, is checked against the store. Then a multiset fingerprint: date + time + type + amount + account + note, whitespace-normalised; a missing time matches any time; the account may be any same-named, same-currency account that existed before the import. Each store row absorbs one file row — Every backup users hold today is in the old format. Users who restored on 1.0.1 hold only fresh ids, so a fix that relied on ids alone would leave the reported scenario open for exactly those users.

The fingerprint holds up:
- a match to the second, plus amount, account and note, is effectively the same entry;
- the bank key is exact for bank rows;
- the multiset keeps genuine twins;
- normalising trailing spaces, legacy multi-line notes and import-stamped times removes the false misses the reviewers found.

A confirm sheet adds new UI and still has to decide row by row. A key repeated inside one file is not treated as a duplicate: a faithful restore keeps the copies the ledger held.
- **U6-D3** How is a loan in the loans file recognised as already in Stack'd?
  - Same kind + name + terms (config) as a loan already here, counted as a multiset; no file-format change
  - Add an Id column to the loans file and make ADD_LOAN keep the id (a store change; about 5 test helpers that strip the last column must change)
  - Both
  - _Recommended:_ Same kind + name + terms (config) as a loan already here, counted as a multiset; no file-format change — This fixes the reported case for old and new files alike, with no store change and no format change. A loan whose terms changed after the backup still comes in as a second loan, and _releaseOwnedLoanLinks already keeps its series safe.
- **U6-D4** A pre-1.0.2 transactions file (no AccountId) names two accounts with the same name. What should the restore do?
  - Restore every account separately (by id from the accounts file). Place each row by the best hint available: the account inside its ImportKey, then the exact spelling of the name, always within the row's currency. Otherwise use the first match, and warn in the result sheet with the names and the row count
  - Skip the ambiguous rows and report them
  - Refuse the whole transactions file
  - _Recommended:_ Restore every account separately (by id from the accounts file). Place each row by the best hint available: the account inside its ImportKey, then the exact spelling of the name, always within the row's currency. Otherwise use the first match, and warn in the result sheet with the names and the row count — No account or opening balance is lost, net worth comes out right, and the user is told exactly which balances to check. The exact spelling settles the realistic 'Revolut'/'revolut' and 'Cash'/' cash ' cases outright. Skipping or refusing would lose real money movements from the only backup the user has.
- **U6-D5** A restored account matched by its id was renamed on this phone after the backup. Whose name wins?
  - The backup's name, unless another account here already uses it or the name was mis-decoded (contains the replacement character �); in those cases keep the local name. Type, icon, colour and opening balance follow the file either way
  - Always the backup's name, as for type, icon, colour and opening balance (the draft)
  - Always keep the local name
  - _Recommended:_ The backup's name, unless another account here already uses it or the name was mis-decoded (contains the replacement character �); in those cases keep the local name. Type, icon, colour and opening balance follow the file either way — A restore brings every other account field back to what the file says (the v1.19 A-17 rule), so the name follows too. There are two exceptions:
- If another account already uses the name, the backup's name would recreate the duplicate that U5 now prevents and that users are asked to rename away.
- If the name contains �, the file was mis-decoded (an ANSI spreadsheet read as UTF-8), and that name would corrupt a good local one.
- **U6-D6** An amount cell in a restore file is not one complete number in the file's convention, for example '12abc', or '54.3' in a decimal-comma file. What should happen, and which formatting is tolerated?
  - Skip the row and report 'invalid amount'. Tolerate spaces, apostrophe groups, € $ £ ¥, the � a mis-decoded € becomes, and '%' in a loan's rate
  - Skip the row and report it, accepting digits and separators only (no symbols)
  - Refuse the whole file
  - _Recommended:_ Skip the row and report 'invalid amount'. Tolerate spaces, apostrophe groups, € $ £ ¥, the � a mis-decoded € becomes, and '%' in a loan's rate — This is what the report expects: never truncate, always say why. Google Sheets and Excel in EU locales write currency-formatted cells as '12,50 €', and an ANSI re-save turns the '€' into �. A symbol is not part of the number. Refusing the whole file punishes good rows for one bad cell.
- **U6-D7** Boot repair of bank-import keys that still name an old account id (installs restored on 1.0/1.0.1). Which keys are re-pointed?
  - Only keys whose account no longer exists in this install
  - Every key whose account differs from its row's account (this also re-points rows the user moved between accounts)
  - _Recommended:_ Only keys whose account no longer exists in this install — Only a restore leaves a key naming a missing account, so this is free of false positives. Re-pointing moved rows would change how re-importing the source account's statement behaves. The import-time mapping follows the same rule (a key naming a live account is kept).
- **U6-D8** A CSV is not valid RFC 4180: a quote never closes, or a stray opening quote is closed many lines later. What should the reader do?
  - Fall back to the 1.0.1 line-by-line reading: for the whole file when a quote never closes, and for any multi-line record whose inner lines are complete rows on their own
  - Fall back only when a quote never closes (the draft)
  - Fail with 'The file could not be read'
  - _Recommended:_ Fall back to the 1.0.1 line-by-line reading: for the whole file when a quote never closes, and for any multi-line record whose inner lines are complete rows on their own — No file that imports today can regress. Bank exports in the wild are not always valid. Without the span rule, a stray quote closed later would silently swallow every row in between, and lower the 'could not be read' count while doing so. A backup's 20-plus columns never appear on one line of a note, so restores are unaffected.
- **U6-D9** The phone already has its own account with the same name as a backup account (for example 'Cash' created before restoring). Merge, or keep them apart?
  - Merge only when the phone's account has the same name (trimmed, case-insensitive), is in the same currency, and is not one of the backup's own accounts (named by id in the file). Otherwise create the backup's account under its own id
  - Merge by name whatever the currency (1.0.1 behaviour, the draft)
  - Never merge: always create the backup's account when its id is unknown
  - _Recommended:_ Merge only when the phone's account has the same name (trimmed, case-insensitive), is in the same currency, and is not one of the backup's own accounts (named by id in the file). Otherwise create the backup's account under its own id — Merging keeps the documented v1.19 A-17 rule ('restoring means bringing that account to what the file says'). Without it, an old-format transactions file imported before the accounts file would end with every account twice.

Currency is part of an account's identity under 'exclude, never convert'. Merging a USD 'Revolut' into a EUR one puts dollar rows on the euro account, and the accounts file then relabels the local euro history as dollars. A local currency change made since the backup instead gives a visible second account, which never touches local history.
- **U6-D10** When are the Id and AccountId columns of a transactions file, and the id column of an accounts file, trusted as Stack'd ids?
  - Only in a Stack'd export. A transactions file must have TransferRef, SeriesId, NextDate, ImportKey and AccountCurrency, which every export since 1.0 writes. An accounts file must have its full 1.0 header (id, created_at, currency, type, icon, color, opening_date). In any other file these columns are ignored
  - Trust any column whose header squashes to 'id' / 'accountid' (the draft)
  - Trust only values shaped like a Stack'd id (UUID)
  - _Recommended:_ Only in a Stack'd export. A transactions file must have TransferRef, SeriesId, NextDate, ImportKey and AccountCurrency, which every export since 1.0 writes. An accounts file must have its full 1.0 header (id, created_at, currency, type, icon, color, opening_date). In any other file these columns are ignored — The manual invites migration files from other apps, and many carry a numeric 'ID' column. Trusting it would skip a second file's rows numbered from 1 as 'already in Stack'd', and would put a later file's rows on the first file's account '1'. In 1.0.1, every such row imported.

The header check is certain for every public backup. A UUID-shape check would also reject the unit-test harness ids ('b1-uuid-1'), so every restore test would need a new harness.
- **U6-D11** Some backup rows belong to a series or a transfer that is already in Stack'd: a series this install holds or recognised from another row, or a transfer with one leg already here. What happens to the rows that are missing locally (deleted, regenerated by a schedule edit, removed by a loan sync, or converted)?
  - The series or transfer is owned here: its missing members and the other leg are not brought back, and they count as already in Stack'd
  - Bring back missing past members, unarmed and attached to the local series, and skip future ones (the first review's correction)
  - Bring back every missing member as a detached, unarmed copy (the draft)
  - _Recommended:_ The series or transfer is owned here: its missing members and the other leg are not brought back, and they count as already in Stack'd — These edits all replace members with new ids under the same series id:
- a this-and-future date or schedule change;
- SYNC_LOAN_SERIES or DELETE_LOAN with future payments;
- converting a member into a transfer.

Re-adding the old members gives 'Rent on both the old and the new day' (the BUG-78 symptom), or a second armed chain. A schedule edit made on a past member regenerates past dates too, so re-attaching only past members still doubles.

A transfer is one movement, so it follows the same rule. For example, after deleting one side's account (BUG-14), the deleted side's leg must not come back alone.
- **U6-D12** Can a stored note contain a line break?
  - No. Every import writes a note on one line (line breaks become a space): camt, bank CSV, statements and a backup restore. Notes already stored are flattened once at boot (R1)
  - A restore keeps line breaks field for field; only the bank parsers flatten (the edit form then merges the words of restored rows)
  - _Recommended:_ No. Every import writes a note on one line (line breaks become a space): camt, bank CSV, statements and a backup restore. Notes already stored are flattened once at boot (R1) — The note field is a one-line input, so a stored line break cannot be shown or kept, and saving the row merges the words. One rule also keeps dedup simple: the BUG-33 write-up itself proposes flattening stored notes. Dedup keys do not change.
- **U6-D13** An opening-balance row's account is not found by the restore. Should the row create that account?
  - Create it only when no account with that name (and currency) existed before this import. Otherwise skip the row as 'opening balance rows are owned by the account', and let the accounts file, which carries ids and its own opening balance, bring the missing account
  - Always create the account when the row's account is not found (the draft)
  - _Recommended:_ Create it only when no account with that name (and currency) existed before this import. Otherwise skip the row as 'opening balance rows are owned by the account', and let the accounts file, which carries ids and its own opening balance, bring the missing account — Installs restored on 1.0.1 hold the merged 'Visa'. With the draft rule, re-importing the old transactions file there adds a second Visa with the €1,000 opening balance, and net worth jumps from €835 to €1,835.

A fresh restore is unaffected: every name is new there, and accounts created earlier in the same import still get their opening balance.

### U6 regions owned

| File | Symbol | Lines | Change |
|---|---|---|---|
| src/import.js | _detectDelimiter/_parseRow + new _splitRecords/_physicalLines/_readRecords/_oneLine | 1-40 (insert after 40) | BUG-33: RFC 4180 record splitter with the D8 fallbacks (unclosed quote, stray-quote span) and the one-line note helper; _parseRow and _detectDelimiter unchanged |
| src/import.js | parseCSV | 42-59 | BUG-33: use _readRecords; BUG-31: attach non-enumerable rows.delimiter |
| src/import.js | buildTransactions | 140-277 | BUG-31 strict amount reader; BUG-30 trust check, resolver placement (no side effects before dedup), exact-spelling legacy candidates, D13 opening-balance rule, ambiguity stats; BUG-32 _restoredKey; BUG-33 one-line note; BUG-78 id → held series → importKey → fingerprint checks, kept/fresh ids, post-loop series/transfer ownership, duplicateCount |
| src/import.js | new _fpBase/_fingerprintPool/_takeFingerprint/_dropFromPool/_restoredKey | insert after 277 (before _relinkTransfers 281; _relinkTransfers/_relinkSeries 281-340 unchanged) | BUG-78 fingerprint multiset; BUG-32 import-time key mapping |
| src/import.js | _num + new _restoreAmountText/_restoreDecimal/_parseRestoreAmount; buildLoans flat columns | 354-405 | BUG-31: one strict per-file decimal reader; '%' tolerated in AnnualRate; an unreadable flat cell skips the row |
| src/import.js | new _skipKnownLoans/_stableJson | insert after 469 (_releaseOwnedLoanLinks 455-469 unchanged) | BUG-78: skip loans already in Stack'd (kind+name+config multiset) |
| src/import.js | analyzeBankCSV | 597-603 | BUG-33: _readRecords instead of split(/\r?\n/) |
| src/import.js | buildBankTransactions (description) | 752 | BUG-33: _oneLine on the mapped description |
| src/import.js | suggestRuleMatch | 794-797 | BUG-33: collapse whitespace |
| src/import.js | parseCamt (party/Ustrd/AddtlNtryInf) | 892-896 | BUG-33: collapse whitespace like _mt940Narrative and Bank Connect |
| src/import.js | buildStatementTransactions (description) | 1041 | BUG-33: _oneLine (the builder Bank Connect shares) |
| src/import.js | buildBudgets (amount) | 1208-1214 | BUG-31: _num(raw, decimal) with the per-file convention |
| src/import.js | _currencyCode area + new _isStackdTxFile/_isStackdAccountsFile/_restoreAccountResolver; buildAccounts | 1252-1305 | BUG-30: trusted ids only (D10), id-first resolution with currency-aware D9 merge, keep the CSV id, never fold two file rows, guarded rename (D5); BUG-31 strict opening balance |
| src/import.js | _stackdKindOfHeaderOnly | 1385-1390 | BUG-33: _readRecords |
| src/import.js | importCSV routing body only (loans branch, bank-candidate check) | 1466-1477, 1518-1521 | BUG-78: _skipKnownLoans before _releaseOwnedLoanLinks; BUG-33: _readRecords. Lines 1444-1446 and 1530-1531 (head/tail) belong to U7 (BUG-34 Store.batch) and are not touched |
| src/export.js | _toRow | 15-21 | BUG-33: also quote values containing '\r' |
| src/export.js | TX_HEADERS + exportTransactions row | 154-160, 185-214 | BUG-30/78: append 'AccountId' and 'Id' columns (U7 owns only _download 3-13) |
| src/store.js | init heal calls | 459-461 (append after 460) | BUG-32: this._healRestoredImportKeys(); R1: this._healMultilineNotes(). Append-only; U2/U3/U5 also add heals here and the integrator unions them before _processRecurringTransactions (461) |
| src/store.js | findAccountByName (U5's definition) | after 606 | Not owned by U6. buildAccounts calls window.Store.findAccountByName; if the U6 worktree needs it before integration, copy U5's identical block at this spot and the integrator keeps one |
| src/store.js | BATCH_IMPORT_TRANSACTIONS | 1969-1982 | BUG-78: drop payload rows whose id already exists; id written after the spread; break when nothing is new |
| src/store.js | ADD_IMPORT_RULE | 2097-2111 (2102, 2107) | BUG-33: store the collapsed match and replace by collapsed compare |
| src/store.js | hasImportKey area + new rebaseImportKey/_healRestoredImportKeys (+ R1 _healMultilineNotes) | 2856-2872 (insert after 2872) | BUG-32: shared key-rebase helper and the boot heal; R1 note heal |
| src/store.js | matchImportRule | 2935-2945 | BUG-33: whitespace-collapsed compare on both sides so legacy multi-line rules still match |
| src/views.js | SettingsView import result message (NoticeSheet) | 3816-3844 | BUG-78 duplicates line, BUG-30 ambiguity line, tone 'info' when either appears (the NoticeSheet body is escaped, components.js:4708). U6 owns this block |
| src/i18n/en.js, fr.js, it.js, es.js, pt.js | end-of-dictionary append block | before the closing '};' (en.js 1346, the others 1325) | // ── 1.0.2 (BUG-30, BUG-78) restore results ── : others.importDuplicates.one/.other, others.importAmbiguousAccounts.one/.other (texts in the bug entries) |
| tests/unit (new) | csvRecords.test.js, restoreAmounts.test.js, restoreAccounts.test.js, importKeyRestore.test.js, restoreDedup.test.js, multilineNotesHeal.test.js | new files | Failing-first tests listed per bug; per-boot id prefixes and a Map-backed localStorage as in fullRestore/loanRestoreOwnership |
| tests/unit (edited) | csvRoundTrip, bankImport, loanRestoreOwnership, loanRestoreLink, statementImport, importRules, budgetCsvRoundTrip, loanCsvRoundTrip, noticeSheet | see testImpact | Same-install re-import expectations rebuilt; new cases appended |
| tests/e2e/full_restore.spec.js | new tests | append after 96 | Four new cases: same-name wallets, EU file to the cent, multi-line camt notes survive a restore and still dedup, the same file twice |

**Dependencies.** **Order inside U6:**
1. BUG-33 (_readRecords, rows.delimiter, _oneLine)
2. BUG-31 (reads rows.delimiter)
3. BUG-30 (export columns, trust check, resolver, D13)
4. BUG-32 (Store.rebaseImportKey, _restoredKey through the resolver, boot heal)
5. BUG-78 (loop order id → held series → key → fingerprint, ownership pass, loans, BATCH_IMPORT guard)
6. Result-sheet lines
7. i18n
8. R1

**U5** owns the UI half of BUG-30 and `Store.findAccountByName` (store.js, after 606):
- U6 calls it in buildAccounts (D5) and does not redefine it. If U6's worktree needs it before integration, copy U5's identical block at the same spot; the integrator keeps one.
- U5 already carries the Bank Connect 'Create account' explicit-id rider.
- U5 must not edit the import result block (views.js 3816-3844).

**U7:**
- BUG-34 wraps importCSV's head and tail (import.js 1444-1446 and 1530-1531) in Store.batch. U6 edits only the routing body (1466-1477, 1518-1521) and the builders, so the hunks do not overlap.
- BUG-37 owns export.js `_download` (3-13). U6 edits `_toRow` (15-21) and TX_HEADERS/exportTransactions (154-214).
- U7's journaling renames dispatch to `_reduce`; the BATCH_IMPORT_TRANSACTIONS body moves with it unchanged.

**U3:**
- U3 adds `_healSeriesSchedules()` to init and optionally asks for a call after BATCH_IMPORT_TRANSACTIONS. That method does not exist in U6's worktree, so the integrator adds the call (one line after the BATCH_IMPORT_TRANSACTIONS dispatch in importCSV, or inside the case) once both land. D11 already prevents restored members from carrying a stale schedule next to a held series.

**Boot heals:** U2, U3, U5 and U6 all append calls after store.js:460. U6's two heals are independent of series state; the integrator unions them before `_processRecurringTransactions()` (461).

**i18n:** keys go at the end of each dictionary under a `// 1.0.2` header, merged with merge=union. Use each dictionary's existing quoting for "Stack'd".

**Integrator:**
- Bump ?v= together for import.js, store.js, export.js, views.js and the i18n files. import.js calls Store.rebaseImportKey and Store.findAccountByName, so it is co-dependent with store.js.
- Update CLAUDE.md:
  - backups carry AccountId/Id, trusted only in a Stack'd export, and a restore keeps account and transaction ids;
  - restore dedup order: id → held series → rebased ImportKey → fingerprint; series and transfers already here are owned locally; loans are skipped by kind+name+terms;
  - importKeys are mapped on restore and healed at boot (_healRestoredImportKeys);
  - parseCSV is RFC 4180 via _readRecords;
  - every restore amount goes through _parseRestoreAmount with one decimal convention per file;
  - notes are one line (_oneLine, _healMultilineNotes);
  - an opening-balance row never creates a second account for a name the install already has.
- docs/bank-import-plan.md §3.1's promise ('a restored backup must keep its dedup protection') now holds.
- Release notes: tell 1.0/1.0.1 users who restored EU-formatted files, multi-line camt notes or same-named accounts to Factory reset and restore again on 1.0.2. Their backup files are intact.

**Existing tests affected.** **New unit tests.** Each case listed under its bug fails at efcac0c unless it is marked as a guard:
- csvRecords.test.js (BUG-33)
- restoreAmounts.test.js (BUG-31)
- restoreAccounts.test.js (BUG-30)
- importKeyRestore.test.js (BUG-32)
- restoreDedup.test.js (BUG-78)
- multilineNotesHeal.test.js (R1)

Plus appended cases in statementImport, importRules, budgetCsvRoundTrip, loanCsvRoundTrip and noticeSheet. All new restore tests use per-boot id prefixes (restores now keep ids). The N6 case needs Store.findAccountByName (U5's block, copied into U6's worktree if needed).

**New e2e:** four cases appended to tests/e2e/full_restore.spec.js:
- two wallets with the same name come back as two;
- an EU-format file restores to the cent;
- multi-line camt notes survive a restore and still dedup;
- the same transactions file imported twice.

**Existing tests that change**, because a same-install re-import of the app's own export now skips every row as already in Stack'd:

csvRoundTrip.test.js:
- 'round-trips time, tags and isPaid' and 're-pairs transfer legs under a fresh transferRef': wipe the non-opening rows (as 'preserves balance' already does) BEFORE buildTransactions, which reads the store. The assertions stay; transferRef is still re-keyed.
- 'rebuilds a recurring series with exactly one armed tail' (N11): wipe first and flip the series-id assertion to `toBe(originalSeriesId)`. A series no longer held keeps its CSV id; the one-armed-tail checks stay. The collision semantics move to loanRestoreLink below.

bankImport.test.js, 'round-trips importKey/bankRef through a CSV backup and keeps dedup alive':
- Move the ledger wipe before buildTransactions.
- buildTransactions reads store keys from state directly, so the stale `_importKeyIdx` left by the direct wipe does not matter.

loanRestoreOwnership.test.js:
- 'a loans file imported twice…' (2 loans → now 1, duplicateCount 1) and 'a loans file imported twice in the install it came from' (3 → 1): rewrite to assert no duplication. Keep the _releaseOwnedLoanLinks coverage with a second import whose Config cell has a changed annualRate (a non-identical copy still comes in and must not share the series).
- Both 'a full backup re-imported into the same install' cases: rewrite to assert 1 loan, 0 transactions imported, duplicateCount equal to the non-opening rows, the series members unchanged and one armed generator.

loanRestoreLink.test.js, 're-keys the series on a collision (re-import into the same install)' (N11):
- Rebuild it from a hand-made, id-less file whose SeriesId equals the held series and whose rows match no store row (different amounts and dates).
- Assert the D11 rule: every member is skipped (duplicateCount equals the rows), seriesIds() stays [sid], and the loan still tracks `members`. Rename the case accordingly.
- 'keeps the CSV series id when this install has no series by that id' keeps covering the path where the series is not held.

**Expected to stay green** (checked by reading them):
- fullRestore.test.js, including 're-importing into the SAME phone does not add a second opening balance'. Its OB rows resolve by id to live accounts and are still skipped as owned (2); the other rows now count as duplicates. 'still reads an accounts file from before v1.19' is untrusted (no 1.0 header) and upserts by name as before.
- categoryDuplicateImport.test.js: its hand-made transactions file is untrusted, the store is empty, and nothing is held.
- localeFormatting.test.js: it wipes before building, and only the OB skip is asserted.
- The existing loanCsvRoundTrip and budgetCsvRoundTrip cases: their 'invalid amount' rows still fail (NaN or 0).
- backgroundTimestampLogging (BATCH_IMPORT without ids or time).
- importRules: single-line matches are unchanged by the collapse.
- The existing full_restore and loan_restore e2e specs (fresh installs).
- The bank_import and statement_import e2e specs: well-formed files parse identically.

Run lint and the full unit suite after integration. The e2e cases are written blind in the unit's worktree (port 3000 is shared) and verified at integration.

## U7 — Native storage and export

**Review verdicts.** I checked all 12 review issues against efcac0c and against the native library that the bundled Filesystem plugin uses. All 12 are valid. Four are folded in with a different mechanism than the reviewer proposed; none is rejected outright.

**BUG-90: issues 1, 2, 7 and 8. Accepted, with a different mechanism.**

I disassembled ionfilesystem-android 1.1.0, the jar that @capacitor/filesystem 8.1.3 pulls in:
- **saveFile** does `new FileOutputStream(file, false)` and writes through a BufferedWriter/OutputStreamWriter. That is truncate-then-write in place, with no temp file. A kill mid-write therefore leaves a torn file.
- **renameFile** is not an atomic replace either. It calls `destination.delete()`, then `source.renameTo(destination)`, with a copy+delete fallback. So the reviewers' "tmp + rename, never torn" is true, but a window with no file at all remains.

Also confirmed in the code:
- ADD_ACCOUNT writes accounts at store.js:1145 and then transactions at :1160.
- A recurring ADD_TRANSACTION saves at :1309 and again at :855.
- `_mirrorDelete` swallows every deleteFile error (db.js:45).
- The draft restore trusted any string and applied it in arbitrary order.

**Final BUG-90 design: a staged commit per change (D-U7-9).** The revision now counts changes, not writes. Each change is mirrored as follows:
1. Its files are written as `<key>.json.<rev>.tmp`.
2. One commit record `_rev.json {rev, writes, deletes}` is written. This is the commit point.
3. The tmps are promoted.

What this gives:
- A kill before the commit point leaves the previous change intact.
- A kill after it is rolled forward at boot.
- The mirror therefore only ever holds whole changes.
- This also closes the "two changes within 1 s" case that the reviewers offered to accept as a limit.

All of the reviewers' boot-side corrections are kept:
- JSON.parse on every file.
- An all-or-nothing mirror-newer restore that falls back to the local path.
- Shrink-first apply, with a snapshot put back on any throw.
- `stackd_mirror_rev` written only after success.
- Per-key best effort only in the evicted path.
- Stale `.tmp` files cleaned at boot.
- Only "does not exist" treated as delete success.

**BUG-34 issues**
- **Issue 3 (SET_PRO): accepted.** If SET_PRO fails, Pro._activate claims the failure and holds the unlock for the session through `SET_PRO {sessionOnly}` (D-U7-11).
- **Issue 4 (read-back): accepted.**
  - The promote flow (views.js:5406-5414) runs in Store.batch and returns when the change fails.
  - The account form is fixed in the store, not in U5's views.js:4244-4320: SET_DEFAULT_ACCOUNT now ignores an id that names no account.
  - Bank Connect's :6881 stays with U5 (explicit id).
- **Issue 5 (throw mid-import): accepted.** Store.batch now catches a throw, aborts the journal, rolls back and rethrows. importCSV turns a failed route into a throw inside the batch.
- **Issue 6 (region): accepted.** The region is 6191-6215, with `if (!landed) return;` before 6216.
- **Issue 9 (RESET_APP): accepted.**
  - The reorder is handed to U5, which owns store.js:2299-2326 and must write transactions first.
  - views.js:3935-3937 reloads only when the dispatch did not fail.
  - D-U7-8 is reworded.
- **Issue 10 (boot): accepted, as D-U7-10.** Store.init runs inside Store.batch through a new `init()` wrapper; line 208 becomes `_initState`. `_reloadSlice` mirrors init's seeds, so the session starts with memory equal to disk.
- **Issue 11 (callback throw): accepted.** A throw from onComplete still ends in onError.

**BUG-37: issue 12. Accepted.** The unit ships export.js, exportNative.test.js and the keys. The integrator does the rest in main, in one commit:
- npm install;
- package.json and package-lock.json together;
- the cap-sync-generated gradle files and Podfile;
- the nativeWiring test.

**Note for U5.** U5's onboarding heads-up does not apply here. NoticeSheet appends through `_bankSheet` (components.js:4112-4130) and never replaces #modal-container the way Modal.show does.

**Totals.** 9 i18n keys, each in all five dictionaries. Effort: BUG-34 L, BUG-37 M, BUG-90 L.

### BUG-34 — When storage is full, saves fail silently and new entries vanish at the next restart _(gate, effort L)_

**Root cause.** **src/db.js:112-122.** save() calls localStorage.setItem at :115. On QuotaExceededError the catch logs at :119 and returns false. _mirrorWrite at :116 runs only after a successful setItem, so the native mirror misses the write too.

**src/store.js:1122-2751.** dispatch never reads that return value. There are 83 save calls in store.js plus main.js:843. Every case mutates this.state in place: ADD_TRANSACTION pushes at :1307 and saves at :1309, ADD_ACCOUNT pushes at :1143. It then sets changed, and the method emits at :2750. The UI shows writes that never reached disk.

**No grouping of the saves inside one action.** ADD_ACCOUNT saves 'accounts' at :1145 (fits), then 'transactions' at :1160 (fails), then 'defaultAccountId' at :1167. That is the account that came back without its opening balance. Each save rewrites the whole slice, so once the transactions JSON reaches the roughly 5 Mi-character quota, every later save that grows it fails.

**Multi-dispatch flows are not atomic either:**
- the transaction form's type conversion (views.js:2298-2405, a delete plus an add);
- the bank-statement commit (views.js:6193-6214);
- the loan promote flow (views.js:5406-5414);
- importCSV (import.js:1444-1533).

**Boot-time saves are unchecked.** That covers the seeds, migrations and heals in Store.init :229-461, so memory can carry boot results that disk lacks.

**Callers read back entities that a failed save never stored.** views.js:5412-5413 reads `loans[length-1]`. views.js:4295 sets the default to a just-added id.

**Fix.** One generic mechanism at the single choke point, not checks at 84 call sites.

**(1) db.js write journal**
- `begin()`/`end()` nest by depth.
- save() and remove() record the key in `touched` and its prior raw value, with one getItem on the first write of a key in a change.
- After a failure, later saves of the same change return false without writing.
- `abort(err)` marks the open change failed.
- `end()` at depth 0 rolls a failed change back with `_applyShrinkFirst(prior)`: the most-shrinking key first, so no intermediate total exceeds max(before, after), and both of those fit.
- It then closes the change for the mirror (BUG-90: one commit, rollback included).
- `isQuotaError` recognises QuotaExceededError, NS_ERROR_DOM_QUOTA_REACHED, and codes 22 and 1014.

**(2) store.js**
- `dispatch` becomes `return this.batch(() => this._reduce(...))`. The old body is renamed `_reduce` and is otherwise untouched.
- `batch(fn)` opens a journal. A throw from fn aborts the change, settles it and is rethrown.
- On failure, the outermost scope reloads every touched slice through `_reloadSlice`, so memory equals disk again. That map mirrors init, including init's seeds: default categories when empty, and the widget seed when the key is absent.
- It then calls `_sortData()` (which nulls all four indexes), emits, schedules one deferred NoticeSheet and returns false. A caller that reports the failure itself claims it with `takeSaveFailure()`.
- Nested scopes join the outer change.
- Doubles without begin() take a pass-through path.
- `init()` becomes a wrapper that runs the old body (renamed `_initState`) inside batch (D-U7-10). A boot save that does not fit therefore resets memory to disk before the first render, and shows the launch variant of the sheet.
- `SET_PRO {sessionOnly}` updates memory without saving.
- SET_DEFAULT_ACCOUNT ignores an id that names no account. This fixes the account form's read-back after a rolled-back ADD_ACCOUNT without touching U5's views.js:4244-4320.

**(3) pro.js:63-70.** If SET_PRO returns false, `_activate` claims the failure and re-dispatches with `sessionOnly` (D-U7-11). A paying user is never locked out, and no unexplained sheet appears at each launch.

**(4) Call sites**
- **Transaction form, views.js:2298.** `doDispatch = (scope) => Store.batch(() => applyChange(scope))`. Line 2404 is untouched (BUG-87).
- **Bank-statement commit, views.js:6191-6215.** The opening balance, matches, rows and preset go into one batch, with `if (!landed) return;` before 6216. The preview stays up for a retry.
- **Promote flow, views.js:5406-5414.** Wrapped in one batch, followed by `if (!landed) return;`. Inside the batch the loan is still in memory, so the read-back cannot throw.
- **Factory reset, views.js:3935-3937.** Reload only when RESET_APP did not return false, so the storage sheet stays visible.
- **importCSV, import.js head and tail.** The routing body becomes `route` and runs inside Store.batch. It reports through holders. A route that ends in onError (a caught throw, or 'unrecognised file') rethrows inside the batch, so whatever it wrote is rolled back.
- **importCSV callbacks.** They run after the change settles:
  - landed: onComplete. A throw from onComplete still goes to onError.
  - quota: onError('others.importStorageFull').
  - other: the route's own error, or storage.failedBody.

**(5) Hand-off to U5, which owns store.js:2299-2326.** RESET_APP must write the emptied transactions slice first, then loans, accounts, budgets, importPresets, importRules, bankConnect and bankConnections. Growing writes go last: categories, homeWidgets, and U5's expandedGraphFilters/defaultAccountId resets. Otherwise, at the quota, a growing categories write aborts the reset.

The report's reorder of ADD_ACCOUNT is unnecessary: the journal makes the order irrelevant.

**Sketch.**

```js
// db.js — 1.0.2 (BUG-34) write journal (mirror staging: _stageMirror/_closeChange/_applyShrinkFirst in BUG-90)
_journal: null,
begin() {
  if (this._journal) this._journal.depth += 1;
  else this._journal = { depth: 1, prior: new Map(), touched: new Set(), failed: null };
},
abort(error) { const j = this._journal; if (j && !j.failed) j.failed = error || new Error('change aborted'); },
end() {
  const j = this._journal;
  if (!j || --j.depth > 0) return null;           // nested: the outermost scope settles
  if (j.failed) {                                  // put back every key this change wrote
    const err = this._applyShrinkFirst(j.prior);  // most-shrinking first: every step fits
    if (err) console.error('StackdDB rollback failed:', err);
    j.prior.forEach((v, k) => this._stageMirror(k, localStorage.getItem(k))); // mirror follows the disk
  }
  this._journal = null;
  this._closeChange();                             // 1.0.2 (BUG-90): change + rollback = ONE mirror commit
  return j;
},
isQuotaError(e) { return !!e && (e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED' || e.code === 22 || e.code === 1014); },
save(key, data) {
  const fullKey = this.PREFIX + key, j = this._journal;
  if (j) { j.touched.add(key); if (j.failed) return false; } // this change is already lost
  try {
    const json = JSON.stringify(data);
    if (j && !j.prior.has(fullKey)) j.prior.set(fullKey, localStorage.getItem(fullKey));
    localStorage.setItem(fullKey, json);
    this._stageMirror(fullKey, json);
    return true;
  } catch (error) {
    console.error('Error saving DB key:', key, error);
    if (j) j.failed = error;
    return false;
  }
},
// remove(key): same bookkeeping, localStorage.removeItem(fullKey), this._stageMirror(fullKey, null)

// store.js — inserted before :208; line 208 `init() {` -> `_initState() {` (body untouched)
init() {
  // 1.0.2 (BUG-34): the boot (seeds, migrations, heals, recurring pass) is one change too —
  // a boot save that does not fit puts memory back to what is on disk before the first render
  this._booting = true;
  try { return this.batch(() => this._initState()); } finally { this._booting = false; }
},

// store.js — inserted after emit() (ends :1120); :1122 `dispatch(action, payload) {` -> `_reduce(action, payload) {`
dispatch(action, payload) { return this.batch(() => this._reduce(action, payload)); },
batch(fn) {
  const db = window.StackdDB;
  if (!db || typeof db.begin !== 'function') { fn(); return true; } // unit-test doubles
  db.begin();
  let thrown = null;
  try { fn(); } catch (error) { thrown = error; db.abort(error); }
  const ok = this._settleChange(db.end());
  if (thrown) throw thrown;
  return ok;
},
_settleChange(j) {
  const db = window.StackdDB;
  if (!j) return !(db._journal && db._journal.failed); // nested
  if (!j.failed) return true;
  j.touched.forEach(key => { if (!this._reloadSlice(key)) console.error('Store: no reload for', key); });
  if (j.touched.size) { this._sortData(); this.emit(); } // memory = disk again
  this._announceSaveFailure(j.failed);
  return false;
},
_reloadSlice(key) { // must list every persisted key (static-scan test)
  const L = (k, d) => window.StackdDB.load(k, d), s = this.state;
  switch (key) {
    case 'accounts': case 'transactions': case 'budgets': case 'loans':
    case 'importPresets': case 'importRules': case 'bankConnections': s[key] = L(key, []); return true;
    case 'categories': s.categories = L('categories', []); if (!s.categories.length) s.categories = [...DEFAULT_CATEGORIES]; return true; // as init :251
    case 'homeWidgets': s.homeWidgets = localStorage.getItem(window.StackdDB.PREFIX + 'homeWidgets') === null ? this._defaultHomeWidgets() : L('homeWidgets', []); return true; // as init :229
    case 'currency': s.currency = L('currency', 'USD'); return true;
    case 'language': s.language = L('language', 'en'); if (window.I18n) window.I18n.setLang(s.language); return true;
    case 'theme': s.theme = L('theme', 'system'); this.applyTheme(); return true;
    case 'enableTimeInput': s.enableTimeInput = L('enableTimeInput', false); return true;
    case 'historySortOrder': s.historySortOrder = L('historySortOrder', 'desc'); return true;
    case 'historyFilterSortOrder': s.historyFilters.sortOrder = L('historyFilterSortOrder', 'asc'); return true;
    case 'defaultAccountId': s.defaultAccountId = L('defaultAccountId', ''); return true;
    case 'analyticsBalanceMode': s.analyticsBalanceMode = L('analyticsBalanceMode', 'today'); return true;
    case 'expandedGraphFilters': s.expandedGraphFilters = L('expandedGraphFilters', { interval: 'monthly', accounts: [], categories: [] }); return true;
    case 'bankConnect': s.bankConnect = this._loadBankConnect(); return true;
    case 'pro': s.pro = this._loadPro(); return true;
    case 'catDebtSeeded': case 'setup_done': return true; // flags with no state
    default: return false;
  }
},
_saveFailure: null,
takeSaveFailure() { const f = this._saveFailure; this._saveFailure = null; return f; },
_announceSaveFailure(error) {
  const pending = !!this._saveFailure;
  this._saveFailure = { quota: window.StackdDB.isQuotaError(error), boot: !!this._booting };
  if (pending) return; // one sheet per burst
  setTimeout(() => { // after this change's render; a caller may have claimed it
    const f = this.takeSaveFailure(), C = window.Components, I = window.I18n;
    if (!f || !C || !C.NoticeSheet || !I) return;
    C.NoticeSheet.show({ id: 'storage-full-modal', tone: 'error',
      title: I.t(f.quota ? 'storage.fullTitle' : 'storage.failedTitle'),
      body: I.t(f.quota ? (f.boot ? 'storage.bootBody' : 'storage.fullBody') : 'storage.failedBody') });
  }, 0);
},

// store.js SET_PRO (:2553-2560)
case 'SET_PRO': {
  // 1.0.2 (BUG-34): {sessionOnly} holds the unlock in memory when storage is full (Pro._activate)
  const { sessionOnly, ...fields } = payload || {};
  const next = Object.assign({}, this.state.pro || this._proDefaults(), fields);
  this.state.pro = next;
  if (!sessionOnly) window.StackdDB.save('pro', next);
  changed = true;
  break;
}
// store.js SET_DEFAULT_ACCOUNT (:2740-2745), first line of the case
// 1.0.2 (BUG-34): a default names a live account ('' clears) — never an id a rolled-back ADD_ACCOUNT left behind
if (payload && !this.state.accounts.some(a => a.id === payload)) break;

// pro.js _activate (:63-70)
_activate(info) {
  const fields = Object.assign({ active: true, productId: this.PRODUCT_ID,
    platform: window.BankConnect ? window.BankConnect.platform() : 'web',
    purchasedAt: new Date().toISOString() }, info || {});
  if (window.Store.dispatch('SET_PRO', fields) !== false) return;
  // 1.0.2 (BUG-34): storage is full. The store re-signals ownership at every launch
  // (_onProductUpdated), so hold the unlock for this session — and no storage sheet:
  // the user paid, they did not make a change that failed.
  window.Store.takeSaveFailure();
  window.Store.dispatch('SET_PRO', Object.assign({ sessionOnly: true }, fields));
},

// import.js importCSV — head (:1444-1446) and tail (:1530-1531); routing body 1447-1529 untouched
importCSV(file, state, onComplete, onError) {
  // 1.0.2 (BUG-34): a restore is ONE change — a file that does not fit, or a route that
  // fails part-way, lands nothing. The body reports through these holders; the caller's
  // callbacks run once the change has settled.
  const done = onComplete, fail = onError;
  let outcome = null;
  onComplete = (result) => { outcome = { result }; };
  onError = (error) => { outcome = { error }; };
  const reader = new FileReader();
  const route = (e) => {          // was: reader.onload = (e) => {
    /* ... unchanged ... */
  };
  reader.onload = (e) => {
    let landed = false, thrown = null;
    try {
      landed = window.Store.batch(() => {
        route(e);
        if (outcome && outcome.error) throw outcome.error; // roll back whatever the route wrote
      });
    } catch (error) { thrown = error; }
    if (landed) {
      try { if (done && outcome) done(outcome.result); }
      catch (error) { if (fail) fail(error); } // as before: a throwing callback still ends in 'Import failed'
      return;
    }
    const f = window.Store.takeSaveFailure(); // this flow reports it itself
    if (fail) fail(thrown || new Error(window.I18n.t(f && f.quota ? 'others.importStorageFull' : 'storage.failedBody')));
  };
  reader.onerror = () => { if (fail) fail(new Error("Failed to read file")); };
  reader.readAsText(file);
}

// views.js:2298 (tx form) — :2297 and :2404 untouched
const doDispatch = (scope) => window.Store.batch(() => applyChange(scope)); // 1.0.2 (BUG-34): a type conversion lands whole or not at all
const applyChange = (scope) => { // former doDispatch body, unchanged

// views.js:5406-5414 (promote) — 5415-5418 untouched
let loanId = r.editingLoanId;
// 1.0.2 (BUG-34): one change; when it does not land there is nothing to open or track
const landed = window.Store.batch(() => {
  if (loanId) {
    window.Store.dispatch('UPDATE_LOAN', { id: loanId, name, config: r.config });
    window.Store.dispatch('PROMOTE_LOAN', { id: loanId });
  } else {
    window.Store.dispatch('ADD_LOAN', { name, kind: 'active', config: r.config });
    const added = window.Store.getState().loans;
    loanId = added[added.length - 1].id; // still in memory inside the change
  }
});
if (!landed) return;

// views.js:3935-3937 (factory reset)
const reset = window.Store.dispatch('RESET_APP');
closeModal();
if (reset !== false) window.location.reload(); // 1.0.2 (BUG-34): a reset that did not fit leaves the storage sheet up

// views.js:6191-6215 (statement commit)
let imported = 0;
const landed = window.Store.batch(() => { // 1.0.2 (BUG-34): opening balance, matches, rows, preset = one change
  /* :6193-6200 UPDATE_ACCOUNT; const before = ...; APPLY_IMPORT_MATCHES; BATCH_IMPORT_BANK_TRANSACTIONS;
     imported = after - before; SAVE_IMPORT_PRESET (:6213-6215) */
});
if (!landed) return; // nothing landed; the store's sheet says why; the preview stays for a retry
// :6216 const acc = ... (unchanged)
```

**Data repair.** None.

The rows lost before 1.0.2 never reached disk. A half-saved account (account present, opening-balance row missing) cannot be told apart from a legitimate account without one:
- ADD_ACCOUNT only adds the row when the amount is not 0 or a date is given (store.js:1148).
- Import (import.js:201, 220, 1298) and Bank Connect (views.js:6880) create accounts with an opening balance of 0.

A boot heal would therefore have false positives. The user can fix the balance with Edit account. Journaling the boot does not repair anything: it only keeps memory equal to disk.

**Tests (each fails on the current code).**

- NEW tests/unit/storageFull.test.js. Harness:
- a functional localStorage mock (db-native.test.js makeLocalStorage) with a character quota that throws {name:'QuotaExceededError'};
- loads db.js, i18n.js, i18n/en.js, loan-engine.js, store.js and pro.js;
- window.Components = { NoticeSheet: { show: vi.fn() } };
- fake timers to flush the deferred sheet.
- storageFull: ADD_TRANSACTION that does not fit returns false. The row is in neither state.transactions nor stackd_v1_transactions, and the disk value is byte-identical. Fails today: returns undefined and the row stays in memory.
- storageFull: ADD_ACCOUNT lands whole or not at all. With the quota set so 'accounts' fits but the opening-balance row does not, 'Fund 1' is on neither disk nor state, and defaultAccountId is unchanged. Fails today: the account is saved without its balance.
- storageFull: three failing dispatches in one tick give exactly one NoticeSheet.show({id:'storage-full-modal', tone:'error', title:'Storage is full', body: storage.fullBody}) after the timer flush. Fails today: never shown.
- storageFull: Store.takeSaveFailure(), called synchronously after a failed dispatch, returns {quota:true, boot:false}, and no sheet appears after the timer. Fails today: the method does not exist.
- storageFull: a non-quota error (setItem throws {name:'SecurityError'}) still rolls back. The sheet uses storage.failedTitle and storage.failedBody. Fails today.
- storageFull: Store.batch(() => { DELETE_TRANSACTION t1; ADD_TRANSFER big }) returns false when the transfer does not fit, and t1 is back in state and on disk. Fails today: batch does not exist.
- storageFull: Store.batch(() => { dispatch ADD_ACCOUNT; throw new Error('boom') }) rethrows 'boom'. The account is in neither state nor disk, and the 'Couldn't save' sheet is shown. Fails today.
- storageFull, db level: begin(); save('a', larger) and save('b', smaller) succeed; save('c', huge) fails; save('d') returns false without writing. end() restores a and b byte-identically, at a quota that a b-first order would exceed, with no 'rollback failed' error. Fails today: begin and end do not exist.
- storageFull, boot: disk has an armed recurring tail whose next members are not yet materialized, and the quota cannot hold them. Store.init() returns false, state.transactions equals the disk value with no generated rows, and the sheet shows storage.bootBody after the timer. A following DELETE_TRANSACTION of an existing row returns true and lands. Fails today: memory carries the generated rows, the delete's save fails, and there is no sheet.
- storageFull, boot seed: stackd_v1_homeWidgets is absent and there is no room for the seed. init returns false, the key is still absent on disk, and state.homeWidgets equals _defaultHomeWidgets() (the _reloadSlice rule). Fails today: init returns undefined.
- storageFull, Pro: Pro._activate({}) at a quota where SET_PRO cannot be written. Pro.isActive(Store.getState()) is true for the session, stackd_v1_pro is unchanged on disk, and no NoticeSheet appears after the timer. This guard passes today, and would fail with a plain rollback.
- storageFull: SET_DEFAULT_ACCOUNT with an id that no account has leaves state.defaultAccountId and stackd_v1_defaultAccountId unchanged. Fails today: the dangling id is persisted.
- storageFull (static guard): every key matched by StackdDB\.(save|remove)\('(\w+)' in src/store.js and src/main.js gives Store._reloadSlice(key) === true. Fails today: _reloadSlice does not exist. At integration it also catches new keys from other units.
- storageFull, import: importCSV of a two-account backup at a quota that cannot hold its rows calls onError with the 'others.importStorageFull' text and never calls onComplete. Neither the file's accounts nor its rows are in localStorage. Fails today: onComplete reports the import and the accounts land.
- storageFull, import: importCSV of a backup whose buildTransactions (spied) dispatches ADD_ACCOUNT and then throws calls onError with that error, and the account is in neither state nor disk. Fails today: the account lands.
- storageFull, import guard (passes today): importCSV whose onComplete throws calls onError with that error.
- debtView.test.js harness with a quota-limited localStorage. Promoting a fresh simulation, with no loans yet, when ADD_LOAN does not fit:
- throws no TypeError;
- leaves no loan in state or on disk;
- never calls DebtResultsView._offerAfterPromote.
Fails today: the loan is shown and offered for tracking, but is not on disk.
- formValidation.test.js harness with a quota-limited localStorage: converting a saved expense to a transfer that does not fit keeps the expense in state and on disk. Fails today: the expense is deleted and the transfer is lost.
- db-native.test.js: a rolled-back change on native also rolls back the mirror. After the chain, stackd_db/stackd_v1_accounts.json holds the prior value. Fails today.
- Guard: an ordinary dispatch writes the same keys and values as before (passes today) and returns true (new). On web, no stackd_mirror_rev key is written.
- Post-integration test, added by the integrator once U5's RESET_APP reorder has merged: RESET_APP at the quota, with stored categories smaller than DEFAULT_CATEGORIES, returns true and empties stackd_v1_transactions.
- NEW e2e tests/e2e/storage_full.spec.js:
1. Fresh install with one account.
2. Fill localStorage with a filler key to within about 150 characters of the quota, using a binary-search setItem in page.evaluate.
3. Add an expense through + → Add Log.
4. Expect the 'Storage is full' sheet. History must not list the row, before or after page.reload().
5. Second case: Add wallet 'Fund 1' with €1,000 shows the sheet, and after a reload no 'Fund 1' exists.
Fails today: no sheet, and the row shows until the reload.

**New i18n keys (×5).** `storage.fullTitle — 'Storage is full'`, `storage.fullBody — 'This change was not saved. Export a backup in Settings, then delete transactions or accounts you no longer need to free up space.'`, `storage.bootBody — 'Stack'd couldn't save its latest updates to your data because storage is full. Export a backup in Settings, then delete transactions or accounts you no longer need to free up space.'`, `storage.failedTitle — 'Couldn't save'`, `storage.failedBody — 'Your latest change was not saved. Please try again.'`, `others.importStorageFull — 'Storage is full, so nothing from this file was imported. Free up space, then try again.'`

**Risks.** **Semantics.**
- After a failed change, the touched slices are reloaded from disk, and the boot is journaled too. A failed boot save therefore drops that boot's seeds, heals and recurring pass for the session; they re-run idempotently at the next launch.
- Caveat: the shape migrations at store.js:251-453 only fire on pre-1.0 data. If one ever failed at the quota, the session would run on the shape that is on disk.

**API.**
- Store.dispatch returns a boolean; it returned undefined, and no caller reads it.
- Store.init returns a boolean.
- A reducer throw is now rolled back before it propagates.
- The store calls Components.NoticeSheet (guarded, deferred by setTimeout 0). The sheet is appended through _bankSheet and never replaces another sheet, including onboarding's welcome sheet.

**Pro.** At the quota, the entitlement holds for the session only. pro.js:87 re-activates it at every launch with no sheet.

**Factory reset.** At the quota it now depends on U5 writing transactions first in RESET_APP. Until that lands it returns false and shows the sheet instead of reloading. On that failure path, the BankConnect.revokeAll at views.js:3934 has already run; Bank Connect is switched off at build time.

**importCSV.** The callbacks still run synchronously inside onload, and a throwing callback still reaches onError.

**Cost.**
- One extra getItem per key written per change.
- Rollback re-parses the touched slices, only on failure.

**Maintenance.**
- _reloadSlice must list every persisted key; a static-scan test enforces it.
- The storage listener (store.js:467-500) keeps its own list and is deliberately not refactored.

**Merge points.**
- views.js:2298 sits two lines below U3's 2292-2295 and above U3/U8's dispatch-site edits.
- views.js:5406-5414 sits next to U9's possible leaveTo at 5416.
- store.js:208 and :1122 are renames only.
- import.js head and tail are outside U6's 1466-1477 and 1518-1521.

**Not changed.** The storage ceiling itself (about 19-21k rows). Compaction and IndexedDB are follow-ups.

### BUG-37 — CSV export does nothing on Android: no file, no share sheet, no message _(gate, effort M)_

**Root cause.** **src/export.js:3-13.** StackdExport._download builds a Blob with a BOM (:4) and an object URL (:5), then clicks a hidden `<a download>` (:6-11). That is the only delivery path for all six exporters (export.js:47, 55, 100, 117, 145, 216), which the Settings buttons bind at views.js:3612-3642.

**Android.** The Android WebView hands downloads only to a DownloadListener. MainActivity is a bare `public class MainActivity extends BridgeActivity {}` (android/app/src/main/java/com/stackd/app/MainActivity.java:5), and Capacitor Android 8 never sets a listener, so the click is dropped. Even with a listener, DownloadManager cannot fetch blob: URLs.

**iOS.** Capacitor 8's WKWebView navigation handler has no download delegate.

**Missing pieces.** There is no native branch and no feedback, and no share plugin is installed:
- package.json:35-44;
- android/capacitor.settings.gradle;
- android/app/capacitor.build.gradle;
- ios/App/Podfile.

**Prerequisites that are already present.**
- @capacitor/filesystem 8.1.3 (writeFile returns {uri}).
- A FileProvider `${applicationId}.fileprovider` (AndroidManifest.xml:58-64) whose file_paths.xml:4 covers cache-path.

**Fix.** Add a native branch in _download only. All six exporters, their CSV bodies and the Settings buttons stay untouched, which keeps U7 clear of U6's export.js edits at :15-21 and :154-214.

**When Capacitor.isNativePlatform():**
1. Write '﻿' + content to Directory.Cache at exports/<filename> (utf8, recursive) through Capacitor.Plugins.Filesystem.
2. Call Capacitor.Plugins.Share.share({ title: filename, files: [uri], dialogTitle: I18n.t('export.shareTitle', {file}) }). Android's default chooser title is a hard-coded English 'Share', hence the key.
3. Use plugin proxies only, the db.js pattern, so no JS wrapper is bundled.

**Behaviour.**
- A `_busy` flag ignores a second tap while the sheet is open.
- A rejection matching /cancel/i is silent.
- Any other failure, including a missing Share plugin in a build that missed cap sync, shows NoticeSheet({id:'export-result-modal', tone:'error'}).
- _download returns a Promise; the web path is unchanged.

**What the unit ships (worktree).** export.js, tests/unit/exportNative.test.js and the three keys. Plugins are mocked through window.Capacitor.Plugins, so nothing needs the npm package.

**Integrator steps (main checkout).** Worktrees resolve the main node_modules, and iOS CI runs `npm ci` (ios-testflight.yml:92), which aborts on a package.json/lock mismatch.
1. `npm install @capacitor/share@^8` (the major must match @capacitor/core 8).
2. `npx cap sync android` and `npx cap sync ios`.
3. Commit package.json, package-lock.json, android/capacitor.settings.gradle, android/app/capacitor.build.gradle and ios/App/Podfile together.
4. Then extend nativeWiring.test.js (:186).
5. Rebuild the AAB locally and iOS via Actions, with a PATCH bump to 1.0.2 (10002).

No manifest or plist change is needed.

**Sketch.**

```js
// export.js — replaces :3-13
_busy: false,
_download(filename, content, type = 'text/csv;charset=utf-8;') {
  // 1.0.2 (BUG-37): Android's WebView has no DownloadListener and iOS's no download
  // delegate, so the <a download> below was silently dropped in the native apps.
  // There the file goes through the system share sheet (Save to Files / Drive / mail).
  const cap = window.Capacitor;
  if (cap && typeof cap.isNativePlatform === 'function' && cap.isNativePlatform()) {
    return this._shareNative(filename, '﻿' + content);
  }
  const blob = new Blob(['﻿' + content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url; link.download = filename;
  document.body.appendChild(link); link.click(); document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return Promise.resolve(true);
},
async _shareNative(filename, text) {
  if (this._busy) return false; // a second tap while the sheet is up
  this._busy = true;
  try {
    const P = window.Capacitor.Plugins || {};
    if (!P.Filesystem || !P.Share) throw new Error('export plugins unavailable');
    const { uri } = await P.Filesystem.writeFile({ path: 'exports/' + filename, data: text, directory: 'CACHE', encoding: 'utf8', recursive: true });
    await P.Share.share({ title: filename, files: [uri], dialogTitle: window.I18n.t('export.shareTitle', { file: filename }) });
    return true;
  } catch (error) {
    if (/cancel/i.test(String((error && error.message) || error))) return false; // user closed the sheet
    console.error('Export failed:', error);
    const C = window.Components;
    if (C && C.NoticeSheet) C.NoticeSheet.show({ id: 'export-result-modal', tone: 'error', title: window.I18n.t('export.failedTitle'), body: window.I18n.t('export.failedBody') });
    return false;
  } finally {
    this._busy = false;
  }
},
// integrator, main checkout: npm install @capacitor/share@^8 && npx cap sync android && npx cap sync ios
// -> commit package.json + package-lock.json + both gradle files + Podfile together, then extend nativeWiring.test.js
```

**Data repair.** None. No stored data is involved.

**Tests (each fails on the current code).**

- NEW tests/unit/exportNative.test.js (ships with the unit). Harness:
- window.Capacitor = { isNativePlatform: () => true, Plugins: { Filesystem: { writeFile: vi.fn(async ({path}) => ({ uri: 'file:///cache/' + path })) }, Share: { share: vi.fn(async () => ({})) } } };
- Components.NoticeSheet.show = vi.fn();
- loads db, i18n, en, store and export;
- awaits the promise returned by _download (vi.spyOn(StackdExport, '_download').mock.results[0].value).
- exportNative: exportTransactions writes {path:'exports/stackd_transactions.csv', directory:'CACHE', encoding:'utf8'}, with data starting '﻿Date,Time,Type'. Share.share gets files ['file:///cache/exports/stackd_transactions.csv'] and dialogTitle 'Save or send stackd_transactions.csv'. No anchor is clicked. Fails today: writeFile is never called, and URL.createObjectURL is undefined in jsdom.
- exportNative: each of the other five exporters (accounts, categories, loans, budgets, rules) reaches Share.share with its own file name. Fails today.
- exportNative: Share.share rejecting with new Error('Share canceled') shows no NoticeSheet and resolves false, and Share was called. Fails today.
- exportNative: Filesystem.writeFile rejecting shows NoticeSheet.show({id:'export-result-modal', tone:'error', title:'Export failed'}). Fails today.
- exportNative: with Plugins.Share missing, the export-failed sheet is shown instead of nothing. Fails today.
- exportNative: two taps while the first share is pending make one Share.share call. Fails today.
- Guard (passes today): on web (no Capacitor) the blob path still runs. URL.createObjectURL is stubbed, and the anchor is clicked with download='stackd_accounts.csv'.
- nativeWiring.test.js, an integrator step after npm install and cap sync in main. Extend 'the three native plugins…' (:186):
- package.json dependencies contain '@capacitor/share';
- capacitor.settings.gradle contains "include ':capacitor-share'";
- capacitor.build.gradle contains "implementation project(':capacitor-share')";
- the Podfile contains "pod 'CapacitorShare'";
- guard: file_paths.xml has a cache-path.
It cannot pass in the unit worktree.
- No e2e is possible: Chromium takes the web path, which full_restore.spec.js already covers. Device checklist:
- Android emulator API 36 and a real phone: each of the six buttons opens the chooser. Saving to Drive or Files gives a CSV with a BOM that re-imports through Import CSV. Cancel does nothing.
- iOS TestFlight: the share sheet offers Save to Files, and on iPad the popover anchors.

**New i18n keys (×5).** `export.shareTitle — 'Save or send {file}' (Android chooser title)`, `export.failedTitle — 'Export failed'`, `export.failedBody — 'The file couldn't be created. Please try again.'`

**Risks.** **Native rebuild.** This is the only part of U7 that needs one. A build that missed `npx cap sync` has no Plugins.Share and now shows 'Export failed' instead of doing nothing. The nativeWiring test guards the declarations; only a device run proves the wiring.

**Lockfile.** iOS CI runs `npm ci`, which aborts if package.json and package-lock.json are committed apart.

**Android share targets.** They vary by device (Drive, Gmail, Quick Share, OEM file managers), and there is no guaranteed 'Save to Downloads'. A Storage Access Framework dialog (on iOS, a UIDocumentPicker export) is the follow-up if testers ask.

**Exported copies.** They stay in the app-private cache, which is excluded from backups, until overwritten or purged. Deleting them right after share() resolves could break receivers that read the URI lazily.

**Unrelated paths, out of scope.**
- jsPDF `doc.save` (export.js:318) has the same native flaw, but nothing calls it.
- The export.pdfOffline alert() (export.js:247) is untouched.

**Merge point.** export.js:3-13 ends one blank line above U6's _toRow (15-21).

### BUG-90 — A kill within a second of a save or delete reverts it, and boot overwrites the file mirror _(rider, recommended, effort L)_

**Root cause.** **src/db.js:112-132.** save() and remove() write localStorage synchronously (:115, :125) and queue the mirror write (:116, :126) on the serialized chain (:21-46). The mirror file lands in about 0.4 s, but the Android WebView flushes localStorage to leveldb about 1 s later. A process death in that gap leaves the mirror newer than localStorage.

**src/db.js:49-101.** initNative cannot tell which copy is newer, because neither carries a revision. It restores only when localStorage has no stackd_v1_ keys (:73-84). Otherwise it treats the stale localStorage as authoritative: it rewrites every mirror file from it (:90-92) and deletes the files of keys absent locally (:93-96). That destroys the newer add, or undoes the newer delete. main.js:366 awaits it before Store.init.

**The mirror is not crash-safe either.** This was verified in ionfilesystem-android 1.1.0, which @capacitor/filesystem 8.1.3 uses:
- writeFile truncates and writes in place, so a kill mid-write leaves a torn file;
- rename deletes the destination before renameTo.

A multi-key change (ADD_ACCOUNT :1145 then :1160) is written file by file. Any revision per write would therefore restore torn files or half-changes.

**Fix.** Every change reaches the mirror as ONE commit (D-U7-9). The mirror only ever holds whole changes, so boot can trust a newer one. Everything below is native only: web and the localStorage-mock tests see no extra writes.

**Revision**
- `_rev` counts changes, not writes.
- StackdDB.end() at depth 0, after any rollback, closes the change. It runs `_rev += 1` and setItem('stackd_mirror_rev', _rev) in the same task as the data, so leveldb flushes them together. It then queues one commit op.
- A save or remove outside a journal (main.js:843) is a one-key change.
- The key has no stackd_v1_ prefix, so it is never enumerated, mirrored, restored or reset as data. A failing setItem of it is ignored: boot then just restores an identical mirror.

**Commit op (serialized chain)**
1. Write each changed value to `stackd_db/<key>.json.<rev>.tmp`.
2. Write `stackd_db/_rev.json` = {rev, writes, deletes}. This is the commit point.
3. Promote. For each write: delete `<key>.json` (only 'does not exist', code OS-PLUG-FILE-0008, counts as success), then rename the tmp onto it. For each delete: delete `<key>.json` the same way.

What a kill does at each step:
- before step 2: the previous commit stays intact, and the tmps are junk;
- during step 2: the record is torn, the revision is unknown, and boot takes the local path, which is today's behaviour;
- during step 3: boot finishes the commit.

Any failure puts the change's keys in `_mirrorDirty`. The next change re-stages them from localStorage, so the mirror catches up while staying consistent.

**Boot (initNative)**
1. Read the listing and `_rev.json`: null when absent (a pre-1.0.2 mirror) or torn. Roll its commit forward, which is idempotent. When that succeeds, the mirror revision is known. Delete `.tmp` files no commit owns. Set `_rev` = max(local revision, meta revision).
2. **Evicted** (no local stackd_v1_ key, files present). Restore every file that JSON.parses, per key and best effort, because nothing else exists. A torn file is skipped. Set the local revision to the mirror's.
3. **Mirror newer** (known revision greater than the local one).
   - Read and JSON.parse every file first. If any fails, abort and take the local path; local is at most one flush behind.
   - Snapshot the affected local values.
   - Apply the mirror shrink-first (the rollback's order), removing local keys the newer mirror no longer has.
   - On any throw, put the snapshot back and take the local path.
   - Write stackd_mirror_rev only after every setItem succeeded.
4. **Otherwise.** Today's refresh runs, committed as one change.

**Upgrade.** On the first 1.0.2 boot there is no meta file and no local revision, so the local path runs and commits revision 1. No false restore can happen.

**Sketch.**

```js
// db.js — 1.0.2 (BUG-90) committed mirror (native only); replaces _mirrorWrite/_mirrorDelete (:30-46)
_REV_KEY: 'stackd_mirror_rev',   // NOT stackd_v1_: never enumerated, mirrored, restored or reset as data
_META: 'stackd_db/_rev.json',    // last commit record {rev, writes, deletes}; the PREFIX filter (:67) skips it
_rev: 0,
_stage: null,                    // Map fullKey -> string | null (delete) for the open change
_mirrorDirty: new Set(),         // keys of a commit that failed: re-staged from localStorage next time
_tmpName(k, rev) { return k + '.json.' + rev + '.tmp'; },
_tmpPath(k, rev) { return this._FS_FOLDER + '/' + this._tmpName(k, rev); },
async _deleteIfPresent(path) {
  try { await this._fs.deleteFile({ path, directory: this._FS_DIR }); }
  catch (e) { if (!/does not exist|OS-PLUG-FILE-0008/i.test(String((e && e.code) || '') + ' ' + String((e && e.message) || e))) throw e; }
},
_stageMirror(fullKey, value) {
  if (!this._fs) return;
  (this._stage || (this._stage = new Map())).set(fullKey, value);
  if (!this._journal) this._closeChange(); // a save outside a change is a one-key change
},
_closeChange() {
  const stage = this._stage; this._stage = null;
  if (!this._fs || !stage || !stage.size) return;
  this._mirrorDirty.forEach(k => { if (!stage.has(k)) stage.set(k, localStorage.getItem(k)); });
  this._mirrorDirty.clear();
  const rev = ++this._rev;
  try { localStorage.setItem(this._REV_KEY, String(rev)); } catch (e) { /* metadata only */ }
  this._enqueueMirror(() => this._commit(rev, stage));
},
async _commit(rev, stage) {
  const writes = [], deletes = [];
  stage.forEach((v, k) => (v === null ? deletes : writes).push(k));
  try {
    for (const k of writes) await this._fs.writeFile({ path: this._tmpPath(k, rev), data: stage.get(k), directory: this._FS_DIR, encoding: 'utf8', recursive: true });
    // the commit point: before it the mirror is still the previous change; after it boot finishes this one
    await this._fs.writeFile({ path: this._META, data: JSON.stringify({ rev, writes, deletes }), directory: this._FS_DIR, encoding: 'utf8', recursive: true });
    await this._rollForward({ rev, writes, deletes }, null);
  } catch (error) {
    stage.forEach((v, k) => this._mirrorDirty.add(k));
    throw error; // logged by _enqueueMirror; the chain stays usable
  }
},
async _rollForward(meta, listed) { // idempotent: also finishes a commit a kill interrupted
  for (const k of meta.writes) {
    if (listed && !listed.has(this._tmpName(k, meta.rev))) continue; // already promoted
    await this._deleteIfPresent(this._mirrorPath(k)); // Android's rename does this itself; iOS's may refuse to replace
    await this._fs.rename({ from: this._tmpPath(k, meta.rev), to: this._mirrorPath(k), directory: this._FS_DIR });
  }
  for (const k of meta.deletes) await this._deleteIfPresent(this._mirrorPath(k));
},
async _readMeta() {
  try {
    const m = JSON.parse((await this._fs.readFile({ path: this._META, directory: this._FS_DIR, encoding: 'utf8' })).data);
    return m && Number.isInteger(m.rev) && m.rev > 0 && Array.isArray(m.writes) && Array.isArray(m.deletes) ? m : null;
  } catch (e) { return null; } // pre-1.0.2 mirror, or a torn record: revision unknown
},
async _readValid(fullKey) { // a torn or empty file is never restored
  try {
    const res = await this._fs.readFile({ path: this._mirrorPath(fullKey), directory: this._FS_DIR, encoding: 'utf8' });
    if (!res || typeof res.data !== 'string') return null;
    JSON.parse(res.data);
    return res.data;
  } catch (e) { console.error('StackdDB mirror read failed:', fullKey, e); return null; }
},
_applyShrinkFirst(values) { // Map fullKey -> string|null. Most-shrinking first: no step exceeds max(before, after). Returns the first error.
  const len = (v) => (v == null ? 0 : v.length);
  let first = null;
  [...values].filter(([k, v]) => localStorage.getItem(k) !== v)
    .map(([k, v]) => [k, v, len(v) - len(localStorage.getItem(k))])
    .sort((a, b) => a[2] - b[2])
    .forEach(([k, v]) => {
      try { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); }
      catch (error) { if (!first) first = error; }
    });
  return first;
},
async _restoreNewer(fileKeys, localKeys) {
  const next = new Map();
  for (const k of fileKeys) {
    const v = await this._readValid(k);
    if (v === null) return false; // all or nothing: keep local (at most one flush behind)
    next.set(k, v);
  }
  localKeys.forEach(k => { if (!next.has(k)) next.set(k, null); }); // deleted after the last flush
  const prior = new Map(); next.forEach((v, k) => prior.set(k, localStorage.getItem(k)));
  if (!this._applyShrinkFirst(next)) return true;
  this._applyShrinkFirst(prior); // byte for byte back, then the local path
  return false;
},

// initNative — after the localKeys scan (:56-60); replaces :62-97
const list = async () => {
  try { return ((await fs.readdir({ path: this._FS_FOLDER, directory: this._FS_DIR })).files || []).map(f => (typeof f === 'string' ? f : f.name)).filter(Boolean); }
  catch (e) { return null; } // no folder yet
};
let names = await list();
const meta = names ? await this._readMeta() : null;
let mirrorRev = 0;
if (meta) {
  try { await this._rollForward(meta, new Set(names)); mirrorRev = meta.rev; names = (await list()) || []; }
  catch (e) { console.error('StackdDB mirror roll-forward failed:', e); } // revision unknown
}
const fileKeys = (names || []).filter(n => n.indexOf(this.PREFIX) === 0 && n.slice(-5) === '.json').map(n => n.slice(0, -5));
if (!meta || mirrorRev) (names || []).filter(n => n.indexOf(this.PREFIX) === 0 && n.slice(-4) === '.tmp')
  .forEach(n => this._enqueueMirror(() => this._deleteIfPresent(this._FS_FOLDER + '/' + n))); // staging no commit owns
const localRev = parseInt(localStorage.getItem(this._REV_KEY), 10) || 0;
this._rev = Math.max(localRev, meta ? meta.rev : 0);
if (!localKeys.length && fileKeys.length) { // evicted / never flushed: the mirror is the only copy
  for (const k of fileKeys) { const v = await this._readValid(k); if (v !== null) localStorage.setItem(k, v); }
  if (mirrorRev) localStorage.setItem(this._REV_KEY, String(mirrorRev));
  await this._mirrorChain;
  return;
}
// 1.0.2 (BUG-90): a kill inside the WebView's lazy flush left the mirror NEWER — it wins, deletes included
if (fileKeys.length && mirrorRev > localRev && await this._restoreNewer(fileKeys, localKeys)) {
  try { localStorage.setItem(this._REV_KEY, String(mirrorRev)); } catch (e) { /* next boot restores the same */ }
  await this._mirrorChain;
  return;
}
// Normal boot: localStorage is authoritative — refresh the mirror as ONE committed change
this._stage = new Map();
localKeys.forEach(k => this._stage.set(k, localStorage.getItem(k)));
fileKeys.forEach(k => { if (!this._stage.has(k)) this._stage.set(k, null); });
this._closeChange();
await this._mirrorChain;
```

**Data repair.** None for past losses: the boot that lost them had already overwritten the mirror.

The revision is introduced lazily. The first 1.0.2 boot has no meta file and no local revision, takes today's local path, and commits revision 1. Protection starts there, and no false restore is possible on upgrade.

**Tests (each fails on the current code).**

- db-native.test.js harness changes:
- makeFilesystem gains `rename({from, to})` with Android semantics: delete the destination, then move; throw 'does not exist' if `from` is missing.
- A gate `cutAfter(n)` makes the n-th fs call hang forever, simulating a kill mid-chain.
- Helper killAndReboot(snapshot): replace localStorage with a copy taken earlier (what leveldb held), re-execute db.js, bootNative, then initNative.
- The six existing cases keep passing unchanged. In particular, 'survives a mirror write failure' passes through the dirty re-staging.
- db-native: boot, save('transactions',[t0]), await. Snapshot. save([t0,t1]), await, killAndReboot(snapshot). load('transactions') equals [t0,t1], stackd_mirror_rev equals the mirror revision, and the mirror still holds t1. Fails today: t1 is lost and the mirror is overwritten.
- db-native: delete variant. save([t0,t1]), snapshot, save([t0]), kill. After reboot the result is [t0]. Fails today: t1 comes back.
- db-native: key removal. save('setup_done',1), snapshot, remove('setup_done'), kill. stackd_v1_setup_done is absent from localStorage and from the mirror. Fails today: it is resurrected.
- db-native, half change cut before the commit point: snapshot; begin(); save('accounts', +Fund 1); save('transactions', +opening row); end(); with cutAfter stopping the chain after the accounts staging file. After killAndReboot(snapshot) there is no 'Fund 1', and accounts and transactions equal the snapshot. Fails today: 'Fund 1' would be saved without its opening balance, or the change lost wholesale.
- db-native, cut during promotion: the same change, with the chain stopped after the commit record and the accounts rename. Reboot rolls the commit forward, and both 'Fund 1' and its opening row are restored. Fails today.
- db-native, torn staging file: the commit's writeFile of the transactions .tmp stores half the JSON, then hangs. killAndReboot keeps the previous revision. No stackd_v1_ key is ever set to invalid JSON, and the half .tmp is deleted. Fails today: today's chain would leave a torn live file.
- db-native, torn live file: seed a truncated stackd_v1_transactions.json with _rev.json {rev:5, writes:[], deletes:[]} and local revision 4. Local is kept byte-identical, and the mirror file is rewritten from local. Fails with a per-write revision design; passes today only because today never restores.
- db-native, evicted with one torn file: accounts.json truncated, transactions.json valid, localStorage empty. transactions is restored, accounts is not, and nothing invalid is written. Fails today: the torn text is copied into localStorage.
- db-native, restore that throws: mirror newer, and localStorage.setItem throws QuotaExceededError on the second key. localStorage ends byte-identical to before boot, stackd_mirror_rev is not advanced, and the mirror is refreshed from local. Fails today: there is no such path.
- db-native, delete failure: deleteFile throws Error('EACCES') for setup_done during a commit. The key goes into _mirrorDirty, and a reboot never restores a mirror whose delete was not applied: the roll-forward fails, so the revision is unknown and the local path runs. Fails today: the catch-all swallows the error.
- Guard (passes today): local newer than the mirror. A commit fails after a save, and the kill keeps the full localStorage. The reboot keeps local and refreshes the mirror as one commit.
- Guard (passes today): a pre-1.0.2 mirror (no _rev.json) with a non-empty localStorage. Local wins: the existing 'does NOT restore from the mirror when localStorage has data' test, unchanged.
- Guard: readdir throws, so no local key is removed and no restore happens.
- Guard: on web (no Capacitor), save() writes no stackd_mirror_rev key.
- Device re-check on the Android emulator with the verifier's adb repro:
1. Save, force-stop 0.5 s later, relaunch.
2. Main Bank must show €2,926.43, and the mirror must still contain KILLV2.
3. Repeat with the swipe-delete variant (it stays deleted) and the 2.0 s control.
4. run-as ls files/stackd_db shows the live .json files, _rev.json and no leftover .tmp.

iOS (TestFlight with the Safari Web Inspector): after a save, Filesystem.readdir('stackd_db') shows the promoted .json and no .tmp. This proves rename works on iOS.

**Risks.** **Commit atomicity of localStorage.** The design assumes the WebView commits the data setItems and the stackd_mirror_rev setItem of one task together: Chromium's batched StorageArea commit, WebKit's SQLite transaction. If only the data lands, boot restores a mirror that holds the same data.

**Remaining windows.** A kill in the microseconds between truncating and writing _rev.json leaves the revision unknown, so boot takes today's local path. A kill during a change's staging writes loses only that change, which never reached the mirror.

**Filesystem.rename is new to the app.**
- Android was verified: delete, then renameTo, with a copy fallback.
- iOS's IONFilesystemLib renameItem is not in the repo. The explicit delete before rename covers a move that refuses to replace.
- If rename failed persistently on a platform, the mirror would stop advancing. Every boot would then take the local path, which is today's behaviour, and the evicted path would restore the last promoted state. The iOS device check covers this.

**I/O.**
- Each change adds one tiny commit-record write plus a delete and a rename per key.
- A commit briefly needs twice the disk space of the slices it rewrites. ENOSPC fails the staging write, and the keys stay dirty.
- The full refresh at every normal boot (today :90-92) is kept, now as one commit. Skipping it when the revisions match is a follow-up.

**Edge cases.**
- A legacy non-JSON value (pre-v0.71 raw defaultAccountId) would make every mirror-newer restore abort, which is today's behaviour. Public installs never had one.
- Removing local keys absent from a committed newer mirror is safe, because every stackd_v1_ write goes through StackdDB. Raw writes use only unprefixed keys (bank-connect.js:260, 284-285).

**Verification.** No browser e2e is possible, because initNative is a no-op on web. The device repro must be re-run on the emulator.

### U7 decisions

- **D-U7-1** BUG-37: how should the native apps deliver an exported CSV?
  - Share sheet via the official @capacitor/share plugin. The file is written to the app cache, and the user picks Save to Files, Drive, mail and so on. The flow is the same on both platforms. Needs a new native plugin and a rebuild.
  - Storage Access Framework 'Save as…' dialog on Android, plus a UIDocumentPicker export on iOS. Needs custom native code on both platforms; no official plugin exists.
  - Write into the public Documents or Download folder with the bundled Filesystem plugin. No new plugin, but:
- Android 10 needs requestLegacyExternalStorage;
- re-exporting after a reinstall hits scoped-storage ownership errors;
- iOS needs UIFileSharingEnabled, which would also expose the stackd_db data mirror in the Files app.
  - _Recommended:_ Share sheet via the official @capacitor/share plugin — It is the only cross-platform option backed by an official plugin. It needs no manifest or plist change, because the FileProvider already covers the cache, and it never exposes the private data mirror. A dedicated 'Save to device' dialog can follow if testers ask for one.
- **D-U7-2** BUG-37: what should the app show after a successful native share?
  - Nothing. The system sheet is the confirmation, a cancel is silent, and only a failure shows an 'Export failed' sheet.
  - Also show a success NoticeSheet ('Exported stackd_transactions.csv') after the share sheet closes.
  - _Recommended:_ Nothing after a success; show a sheet only when the export fails — Android and iOS already confirm through their own sheet, and the web build shows no confirmation either. A second sheet after every export is noise, and it would need another key in all five languages.
- **D-U7-3** BUG-37: should a one-tap 'Export everything' action ship in 1.0.2, sharing all six CSVs in one sheet?
  - Not in 1.0.2. The six buttons each work, which makes the store-listing claim true; add the action later.
  - Add it now: one new button in Data Export and StackdExport.exportAll. Needs one new key in all five dictionaries and a Settings view edit.
  - _Recommended:_ Not in 1.0.2; add the one-tap action later — It is a feature, not the fix. It adds a Settings edit that could conflict with other units, and a multi-download prompt on web. The gate is met without it.
- **D-U7-4** BUG-34: when a transaction save fails because storage is full, where should the user end up?
  - History, as today. The row is not there, and the 'Storage is full' sheet explains why.
  - Stay on the form with the typed values restored. That means moving the navigate at views.js:2404, which BUG-87 (U9) rewrites, so the two would conflict.
  - _Recommended:_ History, as today, with the 'Storage is full' sheet on top — The user has to leave the form anyway to free space, so keeping the draft buys little. This option needs no change near U9's line, and History then shows exactly what is saved.
- **D-U7-5** BUG-34: when a CSV restore does not fit, or fails part-way, should the whole file be all-or-nothing?
  - Yes. importCSV runs inside Store.batch, and a route that ends in an error rethrows inside the batch. Nothing from the file lands, and the import sheet says 'Import failed', with 'storage is full, so nothing from this file was imported' or the original error.
  - Per change only. Accounts and categories the file creates may land without their rows, as today, and the error sheet has to say so.
  - _Recommended:_ Yes: the whole file is all-or-nothing, for a full storage and for a file that fails part-way — A half-restored backup (accounts without balances or rows) is exactly the corruption the bug describes. The change is a wrapper around importCSV's head and tail; the routing body that U6 edits is untouched.
- **D-U7-6** BUG-34: should 1.0.2 show storage use in Settings › Data and warn before storage is full?
  - Not in 1.0.2. The failure is now loud and loses nothing. Do the meter as a follow-up, together with row compaction or IndexedDB.
  - Add a 'Storage used: N%' line only, against an assumed quota of about 5 Mi characters.
  - Add the line plus a one-time warning sheet above about 90%.
  - _Recommended:_ Not in 1.0.2; ship the meter later with compaction or IndexedDB — The WebView does not expose the quota, so any percentage is an estimate, and the meter adds UI and keys. The gate only requires that a failed save is visible and safe. Raising the ceiling is the real long-term fix.
- **D-U7-7** Should the BUG-90 rider (kill-window revert) ship in U7?
  - Yes, in U7, together with BUG-34.
  - Defer it to a later release.
  - _Recommended:_ Yes, ship it in U7 together with BUG-34 — It shares db.js's save()/remove() and the journal's change boundary with BUG-34, so splitting it across units would conflict. It touches db.js only, with no UI and no keys, and makes the v0.97 mirror do the job it was built for.
- **D-U7-8** BUG-34: what should the storage-full message contain?
  - A one-button NoticeSheet: 'Storage is full' / 'This change was not saved. Export a backup in Settings, then delete transactions or accounts you no longer need to free up space.' A launch variant (storage.bootBody) is used when a boot update did not fit.
  - A two-button sheet with an 'Open Settings' button. Needs a new component and a Back-dismiss review.
  - _Recommended:_ The one-button NoticeSheet, with a launch variant of the body — It reuses the 1.0.1 NoticeSheet, which meets the Back-dismiss rule (data-back-dismiss on OK). It is appended to #modal-container, so it survives re-renders and never replaces another sheet.

The advice is actionable:
- Export writes nothing to storage.
- Changes that shrink the data (deleting transactions or accounts) fit, because memory equals disk from the first render (the boot is journaled too) and both rollback and restore apply the most-shrinking key first.
- Factory reset fits once RESET_APP writes the emptied transactions first (U5 hand-off).
- **D-U7-9** BUG-90: how should the mirror stay consistent when the app is killed in the middle of writing it?
  - Staged commit per change. Each change's files are written as staging copies, then one commit record names them, then they replace the live files. Boot finishes a commit that a kill interrupted, so the mirror only ever holds whole changes. No accepted residual. Uses Filesystem.rename, which is new to the app, so both platforms need a device check.
  - Bracketed revision. A 'pending' marker is written before a change's first file and the new revision after its last; files are written in place; boot restores only from a clean, newer mirror. Accepted limits:
- two changes within about 1 s, with a kill during the second one's mirror writes, revert the first (today's behaviour);
- in the evicted case, a file torn by a kill is lost.
  - A revision per write, as in the draft. Rejected by review: it restores torn files and half-applied multi-key changes.
  - _Recommended:_ Staged commit per change — It costs about the same code as the bracketed design with tmp+rename, which the reviewers also asked for: one more boot loop, and the same two record writes per change. It is correct by construction: no torn file and no half change is ever restored, and the 'two quick changes' revert needs no accepted limit.

The only new dependency is Filesystem.rename. The explicit delete before rename makes it work whether or not a platform's rename replaces an existing file.
- **D-U7-10** BUG-34: what should happen when a save made at launch (seeds, migrations, heals, the recurring pass) does not fit?
  - Journal the whole boot: Store.init runs inside Store.batch. A boot save that does not fit rolls every boot write back, so memory equals disk from the first render, and a launch variant of the 'Storage is full' sheet appears. It repeats at each launch until space is freed.
  - Leave boot saves unjournaled, as an accepted limit. Memory may carry boot updates that disk lacks. The first change to that slice can fail even when it is a delete; after that failure memory is reset to disk. No launch sheet.
  - _Recommended:_ Journal the whole boot and show the launch variant of the sheet — Otherwise the user's first delete can report 'Storage is full', which contradicts the advice in the sheet. The rolled-back boot work (heals, recurring members) is exactly what the next launch re-runs idempotently. The shape migrations only target pre-1.0 data, so on public installs they never run.
- **D-U7-11** BUG-34: what should happen to a Stack'd Pro unlock that cannot be saved because storage is full?
  - Keep the unlock for this session without saving it (SET_PRO {sessionOnly}) and show no storage sheet. The app store re-signals ownership at every launch (pro.js:87), so it is re-applied each time.
  - Treat it like any other change: roll it back, so Pro stays locked, and show 'Storage is full' at every launch while storage is full.
  - _Recommended:_ Keep the unlock for this session without saving it, and show no storage sheet — The entitlement can be re-derived from the store's owned signal, so nothing is lost by not persisting it. Locking a user who has just paid would be a regression from 1.0.1, which held it in memory, and a contextless sheet at every launch would confuse them.

### U7 regions owned

| File | Symbol | Lines | Change |
|---|---|---|---|
| src/db.js | StackdDB (whole object). Changes:
- header comment;
- _mirrorWrite/_mirrorDelete replaced by _stageMirror/_closeChange/_commit/_rollForward/_deleteIfPresent;
- initNative;
- save/remove;
- new journal: begin/end/abort/isQuotaError/_applyShrinkFirst;
- new revision members: _REV_KEY/_META/_rev/_stage/_mirrorDirty/_readMeta/_readValid/_restoreNewer. | 1-145 (U7 owns the whole file) | BUG-34: write journal with rollback in end(). BUG-90: per-change committed mirror, roll-forward, and a validated, all-or-nothing, shrink-first restore of a newer mirror in initNative. |
| src/store.js | Store.init → new init() wrapper + _initState | insert before 208; line 208 `init() {` renamed `_initState() {` (body 209-504 untouched) | BUG-34 (D-U7-10): the boot runs inside Store.batch. |
| src/store.js | Store.dispatch header plus new batch, _settleChange, _reloadSlice, takeSaveFailure, _announceSaveFailure, _saveFailure | insert between emit() (1105-1120) and line 1122; line 1122 `dispatch(` renamed `_reduce(` (body 1123-2751 untouched) | BUG-34: every change is journaled. On failure (storage error or throw): rollback, reload from disk, emit, one deferred sheet, return false; a throw is rethrown. The storage listener at 467-500 is not touched. |
| src/store.js | dispatch case SET_PRO | 2553-2560 | BUG-34 (D-U7-11): a {sessionOnly} payload updates memory without saving. |
| src/store.js | dispatch case SET_DEFAULT_ACCOUNT | 2740-2745 (one guard line at the top of the case) | BUG-34: an id that names no account is ignored, so a read-back after a rolled-back ADD_ACCOUNT (views.js:4295) never persists a dangling default. |
| src/pro.js | Pro._activate | 63-70 | BUG-34 (D-U7-11): when SET_PRO returns false, claim the failure and hold the unlock for the session. |
| src/export.js | StackdExport._download plus new _shareNative and _busy | 3-13 (exporters at 32-217 and U6's _toRow at 15-21 untouched) | BUG-37: the native branch writes the CSV to the cache and opens the share sheet, with a failure sheet. The web path is unchanged. |
| src/import.js | StackdImport.importCSV, head and tail only | 1444-1446 and 1530-1531, routing body 1447-1529 untouched:
- head: callback holders; `reader.onload = (e) => {` becomes `const route = (e) => {`;
- tail: new reader.onload wrapper with Store.batch; reader.onerror uses the saved `fail`. | BUG-34 (D-U7-5): a restore is one all-or-nothing change, including a route that fails part-way. A file that did not fit reports 'Import failed', and a callback throw still reaches onError. |
| src/views.js | AddTransactionView save handler: doDispatch | 2298 only (becomes doDispatch + applyChange); 2292-2297 (U3) and 2404 (U9, BUG-87) not touched | BUG-34: doDispatch = (scope) => Store.batch(() => applyChange(scope)), so a type conversion (delete plus add) is atomic. |
| src/views.js | SettingsView factory reset onDelete | 3935-3937 | BUG-34: reload only when RESET_APP did not return false, so the storage sheet stays visible. |
| src/views.js | DebtResultsView promote handler (askName callback) | 5406-5414 (5415-5418 untouched; U9 may edit 5416) | BUG-34: UPDATE_LOAN+PROMOTE_LOAN or ADD_LOAN run in one Store.batch, with `if (!landed) return;`, so there is no read-back of a rolled-back loan and no tracking offer for it. |
| src/views.js | ImportPreviewView #btn-iprev-confirm commit | 6191-6215 wrapped in one Store.batch (opening balance, matches, rows, `imported`, preset), with `if (!landed) return;` inserted before 6216 | BUG-34: the statement lands as one change. On failure there is no navigation and no success sheet, and the preview stays up for a retry. |
| src/i18n/en.js, fr.js, it.js, es.js, pt.js | appended block `// 1.0.2 (BUG-34/BUG-37) storage & export` | end of each dictionary, before `};` (en 1346, others 1325) | 9 keys: storage.fullTitle/fullBody/bootBody/failedTitle/failedBody, others.importStorageFull, export.shareTitle/failedTitle/failedBody. |
| tests/unit/db-native.test.js, NEW tests/unit/storageFull.test.js, NEW tests/unit/exportNative.test.js, tests/unit/debtView.test.js (append), tests/unit/formValidation.test.js (append), NEW tests/e2e/storage_full.spec.js | tests | db-native: the makeFilesystem mock gains rename and a cut gate, and cases are appended; the other files are new or append-only | Regression and guard tests for BUG-34, BUG-37 and BUG-90. |
| package.json, package-lock.json, android/capacitor.settings.gradle, android/app/capacitor.build.gradle, ios/App/Podfile, tests/unit/nativeWiring.test.js (:186) | native wiring for @capacitor/share (INTEGRATOR step in the main checkout, not in the unit branch) | package.json 35-44; generated files whole; nativeWiring 186-200 | BUG-37: npm install @capacitor/share@^8, cap sync android and ios, commit all five files together (npm ci on iOS CI needs the lock), then extend the nativeWiring test. |

**Dependencies.** **Internal co-dependencies**
- db.js and store.js depend on each other: Store.batch calls StackdDB.begin, end and abort.
- views.js, import.js and pro.js call Store.batch and takeSaveFailure.
- At integration their `?v=` values move together with the five dictionaries. Today: db.js?v=14; store, views, export, import and i18n ?v=73; pro.js?v=1 (index.html:128-147). One integrator bump, as in 1.0.1.

**Hand-offs to other units**
- **U5 (owns store.js RESET_APP 2299-2326).** Write the emptied transactions slice FIRST, then loans, accounts, budgets, importPresets, importRules, bankConnect and bankConnections. Write the growing slices last: categories, homeWidgets, and U5's expandedGraphFilters/defaultAccountId resets. Without this, at the quota a growing categories write aborts the whole reset (it returns false and the sheet shows). If U5's final design lacks the order, the integrator applies it, then adds the post-integration RESET_APP test.
- **U5 (views.js:6876-6883, Bank Connect 'new' choice).** Pass an explicit id to ADD_ACCOUNT and look it up by id, not with `accounts.slice(-1)[0]`, so a rolled-back add maps to null.
- **U5 (account form, views.js:4244-4320).** No change is needed: U7's SET_DEFAULT_ACCOUNT guard covers the read-back at :4295.
- **U5's onboarding heads-up.** Not applicable. The storage sheet is a NoticeSheet appended through _bankSheet (components.js:4112-4130); only Modal.show replaces #modal-container.
- **U2, U3, U5 and U6 boot heals (store.js:455-461).** They now run inside the boot batch; no change is needed on their side.
- **Any unit adding a saved key.** It must add a `_reloadSlice` entry. The static-scan test in storageFull.test.js fails until it does.
- **Any unit adding a multi-dispatch flow that must be atomic.** It should wrap the flow in Store.batch.

**Line adjacency, no overlap**
- U3 edits views.js:2292-2295; U7 edits 2298.
- U3 and U8 edit the dispatch sites inside applyChange; their lines move by +1.
- U9 edits views.js:2404, 2445 and possibly 5416; U7 edits 5406-5414.
- U6 edits export.js 15-21 and 154-214; U7 edits 3-13.
- U6 edits import.js 1466-1477 and 1518-1521; U7 edits the head and tail only.
- store.js:208 and :1122 are renames, so every case body other units edit (ADD_ACCOUNT, UPDATE_*/ADD_TRANSFER, DELETE_ACCOUNT, BATCH_IMPORT_TRANSACTIONS, SET_VIEW and the rest) is unaffected.

**Native steps (integrator, main checkout; worktrees share the main node_modules)**
1. `npm install @capacitor/share@^8`.
2. `npm run build`.
3. `npx cap sync android` and `npx cap sync ios`.
4. Commit package.json, package-lock.json, both gradle files and the Podfile together.
5. Enable the nativeWiring extension.
6. Build the Android AAB locally (TMP=C:\Windows\Temp plus the Studio JBR) and iOS via GitHub Actions.
7. `npm run version:sync` to 1.0.2 (10002).

BUG-34 and BUG-90 need no native code, but they ship only inside the rebuilt binaries.

Device checks:
- BUG-37 on the emulator, a real Android phone and iOS TestFlight.
- BUG-90 with the verifier's adb force-stop repro, plus the iOS rename check.

**Docs (integrator)**

Update the CLAUDE.md StackdDB row and Store bullets:
- changes are journaled, and Store.dispatch returns false when a change was not saved; it is rolled back, memory is reloaded from disk and a sheet is shown;
- Store.batch(fn) makes multi-dispatch flows atomic, and the boot runs inside it;
- takeSaveFailure() lets a flow report a failure itself;
- _reloadSlice must list every persisted key;
- native changes are committed to the mirror as one unit (`stackd_db/<key>.json.<rev>.tmp`, then `_rev.json`, then promotion), with the revision in `stackd_mirror_rev`, and boot restores a newer committed mirror;
- a raw localStorage write bypasses the journal and the revision as well as the mirror.

Also update the export note: native export goes through the share sheet. Update the key count.

**Existing tests affected.** **Existing tests that change**
- **tests/unit/db-native.test.js.** The makeFilesystem mock gains `rename({from, to})` (Android semantics) and a cut gate. The six existing cases then pass unchanged:
  - the mock readdir also lists `_rev.json` and `.tmp` names, which the filters ignore;
  - 'survives a mirror write failure' passes through the `_mirrorDirty` re-staging.
- **tests/unit/nativeWiring.test.js:186-200.** Extended only by the integrator, after the npm install and cap sync in main. It cannot pass in the unit worktree.

**Existing tests that should need no edits**
- **Tests that mock StackdDB without begin()** take the pass-through path in Store.batch: periodLogic, absoluteVarianceDisplay, dynamicNumericTileSizing, historySummary, openingBalanceForecastVariation, overviewBalanceFix, periodLabelYear, storeLinks and transactionSwipeActions.
- **Tests that stub window.Store with `dispatch: vi.fn()`** (accountColorSelection, negativeOpeningBalance, androidBack): they don't drive any flow U7 changes, and Pro._activate and the factory reset compare with `!== false`. No stubbed-store test drives the promote, statement-commit or transaction-form paths that now call Store.batch.
- **Tests that stub StackdExport._download** keep working, because the signature is unchanged: accountCurrency, bankImport, budgetCsvRoundTrip, categoryDuplicateImport, csvRoundTrip, fullRestore, importRules, loanCsvRoundTrip, loanRestoreLink, loanRestoreOwnership and localeFormatting.
- **Tests that filter `localStorage.setItem.mock.calls` by key** are unaffected (bankConnect, bankImport, currencySwitch, importRules, store, accountCurrency). On web no stackd_mirror_rev write happens. The only extra traffic is one getItem per written key per change, and nothing counts getItem calls.
- **importCSV callers** (fullRestore, categoryDuplicateImport, loanRestoreLink, loanRestoreOwnership, budgetCsvRoundTrip) keep working: their FileReader mocks are synchronous, so the callbacks still fire before importCSV returns. noticeSheet and reviewFixesMisc stub StackdImport wholesale.
- **Real-store tests that call Store.init()** now pass through the boot batch, which is identical when nothing fails. pro.test.js and redeemCode.test.js dispatch SET_PRO without sessionOnly, so behaviour is unchanged.
- **formValidation.test.js and debtView.test.js** use the real store and exercise the new batch paths unchanged.
- **e2e.** These should pass unchanged:
  - full_restore.spec.js (web export path unchanged);
  - bank_import, statement_import and import_matching (the commit now runs inside Store.batch; the success path is identical);
  - debt_simulator (the promote path);
  - crosstab_sync.
  Re-run all of them after integration.

**New tests**
- storageFull.test.js: about 17 cases, including the boot, Pro, default-account, import-throw and static-scan cases, plus one post-integration RESET_APP case added by the integrator.
- exportNative.test.js: 6 failing-today cases plus the web guard.
- db-native: 11 new cases plus 4 guards.
- debtView.test.js and formValidation.test.js: one appended case each.
- tests/e2e/storage_full.spec.js: 2 cases, written blind in the worktree and verified after integration, per the 1.0.1 unit rules.

## U8 — Multi-currency money

Final design. Both gate bugs are confirmed at efcac0c, and both break v1.02's "exclude, never convert" rule.

BUG-35: a transfer carries one amount for both legs.
- ADD_TRANSFER writes it at store.js:1584 and 1604.
- UPDATE_TRANSFER writes it at 1669 and 1677, and its series propagation at 1707.
- The other copy paths are UPDATE_TRANSACTION's counterpart sync (1361) and its future/all propagate() (1477-1482), plus the loan re-price mirrors (4195, 4260).
- The form never compares the From and To currencies.
Fix:
- Add an optional `receivedAmount`.
- Across currencies, the income leg stores what arrived. Within one currency the legs mirror whenever the amount or an account changes.
- No code path copies a figure from one currency into another.
- The form shows a required "Amount received (USD)" field only for a transfer between two currencies.
- There is no heal, because no rate can be inferred.

BUG-36: every aggregate applies the base-currency guard only to an EMPTY account list.
Fix: add Store.aggregateSelection(ids) → {ids, currency, excluded}, plus aggregatePredicate(ids) and isPrimarySelection(ids). They are used:
- at the five store choke points;
- in the Upcoming widget's net;
- in the History sums.
Captions key on `excluded`. Totals are formatted in the selection's currency. A selection in one currency is returned unchanged.

Review outcome: 13 issues, of which 3 are duplicates (4≈8, 5≈10, 6≈9). All were checked against the code.
- (1) ACCEPTED. The Upcoming widget's _matches (widgets.js:861-903) feeds both the rows (927) and the net (975). Filtering there would silently drop the rows of an account the user picked. The rows now keep the explicit filter, and only the net uses the predicate. Rows show in their own currency (955 moves from the BUG-63 rider into the gate). New D-U8-13.
- (2) ACCEPTED. A pre-1.0.2 1:1 pair would prefill the wrong 100, and an unchanged save would pass. The field now opens EMPTY when a cross-currency pair's legs are equal. D-U8-4 is amended, and no new key is needed.
- (3) ACCEPTED. The expanded graph's y-ticks (components.js:3797) take the selection currency.
- (4/8) ACCEPTED. syncReceived never reset the value, and syncTransferTo's swap (views.js:1840) left 100 under $ and 117 labelled EUR. A figure is now tied to the To currency it was typed for: it is parked on a change and restored on return. A From/To swap swaps the two figures. New D-U8-12.
- (5/10) ISSUE ACCEPTED, but reviewer 5's literal correction is REJECTED. "Leave income alone when the amount is unchanged":
  - would turn a normal series with a hand-edited 80/80 member into 100/80 on a this-and-future note edit (expense members get 100, income members are left alone);
  - would leave 117 on a € account when To moves from USD to EUR with the amount unchanged.
  Reviewer 10's option (b) is also REJECTED. It needs a received field within one currency, new hint copy, and a relaxed store invariant.
  Adopted instead (D-U8-11): within one currency, a save that changes neither the sent amount nor an account writes the pair's OWN income amount to the pair and its propagated income members. That is identical to today for equal legs, and keeps 100/117 after a relabel. Any amount or account change mirrors.
- (6/9) ACCEPTED as an invariant gap that no UI path reaches. One line in propagate()'s counterpart branch.
- (7) ACCEPTED. Add a csvRoundTrip case. Pre-1.0.2 backups restore their 1:1 pairs unchanged (noted in dataRepair).
- (11) ACCEPTED. The received field joins the 1.0.1 BUG-08/18 one-pass `invalid` list. This puts one block inside U2's 2209-2223 hunk.
- (12) ACCEPTED.
  - initExpandedChart (3660) cannot see renderModalContent's locals, so a shared resolveSel() closure is used.
  - The modal's default expansion showed no caption.
  - An interval-only Save persisted the base ids, which dropped Home's caption.
  isPrimarySelection fixes all three: the modal captions and saves an exactly-base selection as [], and Home captions a saved base-only list. D-U8-7 is revised.
- (13) ACCEPTED. D-U8-6(a)'s largest-group branch is correct only with the BUG-63 rider. D-U8-10 now lands the rider with U8. If the owner declines it, D-U8-6 falls back to (b) with a one-line change.

Owner approvals needed:
- D-U8-6: reverses bank-import-plan §6a, "explicit selection is the user's call".
- D-U8-4: amended.
- D-U8-7: revised.
- D-U8-10: the rider.
- D-U8-11.

Riders:
- BUG-63: recommended, and required by D-U8-6(a).
- BUG-48 and BUG-121: not recommended.

### BUG-35 — A cross-currency transfer stores the same number on both legs: €100.00 out, $100.00 in _(gate, effort M)_

**Root cause.** Confirmed at efcac0c: a transfer carries one amount for both legs, and every copy path writes it across currencies.

Store:
- ADD_TRANSFER: the expense leg gets `amount: Math.abs(payload.amount)` (src/store.js:1584) and the income leg gets the same expression (1604).
- UPDATE_TRANSFER: payload.amount goes to the expense leg (1669) and the income leg (1677). The updateFuture/updateAll propagation writes it to every series member on either leg (1707).
- UPDATE_TRANSACTION:
  - The direct counterpart sync copies the amount onto the other leg (1361).
  - The future/all propagate() copies `amount` onto the counterpart legs of later pairs too: its counterpart branch (1477-1482) deletes only accountId and categoryId.
  - No UI reaches either path today. The form edits a transfer through UPDATE_TRANSFER, a conversion drops the counterparts first, and UPDATE_RECURRING_SERIES (1807-1811) has no dispatcher.
- The loan re-price helpers mirror onto the counterpart: _setLoanMemberAmount (4190-4201, mirror at 4195) and _applyLoanFinalInstalment (mirror at 4258-4264).

Form (AddTransactionView):
- initialAmount comes from the TAPPED leg (views.js:1522), but the transfer branch flips From/To to the expense side (1542-1552). Tapping the USD leg therefore shows its amount under the From account's € symbol (1614).
- The save handler reads one #tx-amount (2211) and both account ids (2225-2226). It sends that single amount in UPDATE_TRANSFER (2305-2318) and in both ADD_TRANSFER calls (2342-2352, 2355-2365), and it never compares Store.getAccountCurrency of From and To.

The recurrence chain itself is correct. _processRecurringTransactions clones the counterpart from its own leg (`...cp`, store.js:815-835), so a series repeats whatever the seed legs hold, which today is 100/100.

v1.02 added currency to aggregates, formatting and the import pairing guard, but not to transfers.

**Fix.** Rule: each leg is stored in its own currency and nothing is converted.
- Across currencies, the income leg holds the amount that arrived.
- Within one currency, the legs mirror whenever the sent amount or an account changes.
- No code path copies a figure from one currency into another.

Store (only the income-leg amount changes; no nextDate, regeneration or disarm logic changes):
1. Add helpers after foreignAccountCount() (2908-2910):
   - `_sameCurrency(a, b)`: unknown ids count as base, as in _ensureForeignIdx;
   - `_receivedAmount(payload)`: a finite value above 0, else undefined.
2. ADD_TRANSFER: the income leg (1604) takes the received amount when the two accounts' currencies differ and one was sent. Otherwise it keeps Math.abs(payload.amount).
   - A stray receivedAmount on a same-currency pair is ignored.
   - A cross-currency call without one (imports, tests, old callers) keeps 1:1. The store stays ungated and the form is the gate, as with the Pro gates.
3. UPDATE_TRANSFER: compute one `incomeAmount`, eagerly, at a new block inserted at 1666 (after legRecurrence, before items.forEach). It must be eager because the loop mutates the legs in place. It is judged on the pair's accounts AFTER the edit.
   - Across currencies: `_receivedAmount(payload)`. Undefined leaves every income leg alone.
   - Within one currency: |payload.amount| (mirror, as before), EXCEPT when the save changes neither the sent amount nor either account. Then use the pair's own income amount (D-U8-11). For equal legs that is the same number. A pair whose legs differ after a relabel (SET_CURRENCY {relabel}, or an Edit Account currency change) keeps its received side on a note, tag, date or paid edit.
   - The edited income leg (1677) and the propagated income members (1707) take incomeAmount. Expense members keep |amount|.
   - Regeneration needs nothing: the generator clones each leg from the edited seed pair.
4. UPDATE_TRANSACTION counterpart sync (1361): mirror only within one currency, and only when the amount or this leg's account changed (the same rule as 3).
5. UPDATE_TRANSACTION propagate(): inside the counterpart branch (after 1481), `delete tUpdate.amount` when the counterpart sits in another currency than the edited leg. Both actions now share the never-across-currencies rule.
6. Loan mirrors: _setLoanMemberAmount (4195) and _applyLoanFinalInstalment (4260) write the counterpart only within one currency (D-U8-5).

Form, render (AddTransactionView):
7. Add `let initialReceived = ''` after 1519.
8. In the counterpart branch (1542-1552):
   - initialAmount = the EXPENSE leg's amount, rounded to cents as U2 does at 1522. The field shows the sent side under From's symbol.
   - initialReceived = the income leg's amount ONLY when the pair is cross-currency AND its legs differ.
   - Equal legs across currencies are the pre-1.0.2 1:1 signature, so the field opens empty and any save of that pair requires the amount that arrived (D-U8-4).
9. Restore draft.receivedAmount after 1576.
10. Insert #group-received after #group-transfer-to (after 1632), hidden by default. It holds:
   - a label;
   - a To-currency symbol span;
   - #tx-received-amount, with the same input type and attributes as #tx-amount and data-ccy = the rendered To account's currency;
   - a hint line.

Form, attachEvents:
11. After 1769, before updateUIVisibility, add `const receivedInput`, `let receivedCcy` (from data-ccy: the currency the field's figure belongs to), a per-currency memo, and `const syncReceived = () => {…}`.
   - It reads #tx-account and #tx-transfer-to by id, because those consts are declared at 1823-1824, after updateUIVisibility's first call at 1816 (TDZ).
   - It shows the group only for a transfer whose From and To currencies differ.
   - It sets the label, symbol and hint for To's currency, and clears the field error when the group is hidden.
   - When To's currency differs from receivedCcy, it parks the current figure under receivedCcy and shows that currency's memo or an empty field. So 117 typed for USD is never saved as £117, and moving back to USD restores 117.
12. Call syncReceived:
   - at the end of updateUIVisibility (before updateCategories, 1812);
   - after syncTransferTo(true) (1845);
   - in the From change listener;
   - in a new To change listener.
13. From change listener (1846-1852): when the group was visible and From moved onto To, syncTransferTo swaps the accounts (BUG-21). Swap #tx-amount and #tx-received-amount and set receivedCcy to the new To's currency, so each figure stays with its account (D-U8-12).

Form, save:
14. The received field joins the 1.0.1 BUG-08/BUG-18 one-pass list, inserted before `if (invalid.length)` (2220).
   - crossCurrency comes from the select values: type is transfer, To is set and differs from From, and the currencies differ.
   - Parse with U2's Store.parseAmount: NaN gives form.amountInvalid {example}; null or ≤0 gives form.receivedRequired.
   - An empty amount plus an empty received field shows both errors at once.
   - The same-account To check (2267-2272) keeps its own later return. crossCurrency is false in that case, so no stray received error appears.
   - Spread `...(crossCurrency ? { receivedAmount } : {})` right after `amount,` in UPDATE_TRANSFER (2307) and both ADD_TRANSFER payloads (2343, 2356).
15. captureDraftTxFormState (101-136): also capture receivedAmount.

There is no new sheet, so no Back-dismiss work. The router's dirty snapshot picks up the new input (router.js:69-87).

**Sketch.**

```js
// ── store.js, after foreignAccountCount() (2908-2910), before currencySwitchImpact (2912)
// 1.0.2 (BUG-35): unknown ids count as base (same rule as _ensureForeignIdx)
_sameCurrency(a, b) { return this.getAccountCurrency(a) === this.getAccountCurrency(b); },
_receivedAmount(payload) {
  const r = Number(payload && payload.receivedAmount);
  return Number.isFinite(r) && r > 0 ? r : undefined;
},

// ── UPDATE_TRANSACTION counterpart sync: replaces 1361 (inside `if (counterpartIndex !== -1)`)
// 1.0.2 (BUG-35): UPDATE_TRANSFER's rule — never copy a figure into another
// currency; a save changing neither the amount nor this leg's account leaves
// the other leg alone (D-U8-11).
const legAccountId = payload.accountId !== undefined ? payload.accountId : existingTx.accountId;
const amountTouched = absoluteAmount !== undefined &&
  (absoluteAmount !== Math.abs(existingTx.amount) || legAccountId !== existingTx.accountId);
if (amountTouched && this._sameCurrency(legAccountId, counterpartTx.accountId)) counterpartTx.amount = absoluteAmount;

// ── UPDATE_TRANSACTION propagate(), counterpart branch: insert after 1481 (`delete tUpdate.categoryId;`)
if (!this._sameCurrency(payload.accountId || existingTx.accountId, t.accountId)) delete tUpdate.amount; // 1.0.2 (BUG-35)

// ── ADD_TRANSFER, before "// Income side (To)" (1600)
// 1.0.2 (BUG-35): each leg in its OWN currency, never converted. Across
// currencies the income leg holds what arrived; within one currency the legs
// mirror (a stray receivedAmount is ignored). No receivedAmount from an old
// caller = the old 1:1 behaviour; the form requires it.
const received = this._sameCurrency(payload.expenseAccountId, payload.incomeAccountId)
  ? undefined : this._receivedAmount(payload);
//   1604 → amount: received !== undefined ? received : Math.abs(payload.amount),

// ── UPDATE_TRANSFER: insert at 1666 (after legRecurrence ends at 1665, before items.forEach at 1667)
// 1.0.2 (BUG-35): judged on the pair's accounts AFTER the edit; computed now
// because the loop below mutates the legs in place.
const expLeg = items.find(t => t.type === 'expense');
const incLeg = items.find(t => t.type === 'income');
const fromId = payload.expenseAccountId !== undefined ? payload.expenseAccountId : (expLeg && expLeg.accountId);
const toId = payload.incomeAccountId !== undefined ? payload.incomeAccountId : (incLeg && incLeg.accountId);
const sentAbs = payload.amount !== undefined ? Math.abs(payload.amount) : undefined;
let incomeAmount; // undefined = leave every income leg's amount alone
if (this._sameCurrency(fromId, toId)) {
  // Mirror, as before — but a save that changes neither the sent amount nor an
  // account keeps the pair's own received side (equal legs: the same number;
  // legs that differ after a relabel: kept, D-U8-11).
  const untouched = !!(expLeg && incLeg) && sentAbs === Math.abs(expLeg.amount) &&
    fromId === expLeg.accountId && toId === incLeg.accountId;
  incomeAmount = untouched ? Math.abs(incLeg.amount) : sentAbs;
} else {
  incomeAmount = this._receivedAmount(payload); // the form requires it; else untouched
}
//   1677 → if (incomeAmount !== undefined) item.amount = incomeAmount;
//   1707 → if (t.type === 'income') { if (incomeAmount !== undefined) t.amount = incomeAmount; }
//          else if (payload.amount !== undefined) t.amount = Math.abs(payload.amount);

// ── loan mirrors (D-U8-5)
//   4195 → if (t !== member && t.transferRef === member.transferRef && this._sameCurrency(t.accountId, member.accountId)) {
//   4260 → if (t !== tail && t.transferRef === tail.transferRef && this._sameCurrency(t.accountId, tail.accountId)) {

// ── views.js AddTransactionView.render
let initialReceived = '';                                   // after 1519
// inside `if (counterpart) {` (1542-1552), after the From/To flip:
// 1.0.2 (BUG-35): the amount field is the SENT side (From's symbol); the
// received side has its own field. Equal legs across currencies = the
// pre-1.0.2 1:1 signature → open EMPTY so a save needs what arrived (D-U8-4).
const sent = txToEdit.type === 'expense' ? txToEdit : counterpart;
const got  = txToEdit.type === 'expense' ? counterpart : txToEdit;
initialAmount = String(Math.round(Math.abs(sent.amount) * 100) / 100);
if (!window.Store._sameCurrency(sent.accountId, got.accountId) && Math.abs(sent.amount) !== Math.abs(got.amount)) {
  initialReceived = String(Math.round(Math.abs(got.amount) * 100) / 100);
}
// after 1576: if (draft.receivedAmount !== undefined) initialReceived = draft.receivedAmount;
// after 1632 (</div> of #group-transfer-to):
<!-- 1.0.2 (BUG-35): only for a transfer between two currencies -->
<div class="form-group" id="group-received" style="display: none;">
  <label class="form-label" id="label-received" for="tx-received-amount"></label>
  <div style="display: flex; align-items: center; gap: var(--space-2);">
    <span id="received-currency-symbol" aria-hidden="true" style="color: var(--text-tertiary); font-weight: 700;"></span>
    <input type="number" id="tx-received-amount" class="form-control" placeholder="0.00" step="0.01" inputmode="decimal"
           data-ccy="${escapeAttr(window.Store.getAccountCurrency(initialToAccount))}" value="${escapeAttr(initialReceived)}">
    <!-- after U2 (BUG-50): type="text" inputmode="decimal" autocomplete="off", no step — same as #tx-amount -->
  </div>
  <p id="tx-received-hint" style="margin: var(--space-2) 0 0; font-size: var(--text-xs); color: var(--text-tertiary);"></p>
</div>

// ── attachEvents: insert after 1769 (before updateUIVisibility)
// 1.0.2 (BUG-35): a received figure belongs to the To currency it was typed
// for — a To change parks it and shows that currency's own (or an empty) field.
const receivedInput = document.getElementById('tx-received-amount');
let receivedCcy = receivedInput ? receivedInput.dataset.ccy : '';
const receivedMemo = {};
const syncReceived = () => {
  const group = document.getElementById('group-received');
  const from = document.getElementById('tx-account');      // by id: the consts at 1823-1824 are in TDZ at 1816
  const to = document.getElementById('tx-transfer-to');
  if (!group || !receivedInput || !from || !to) return;
  const fromCcy = window.Store.getAccountCurrency(from.value);
  const toCcy = to.value ? window.Store.getAccountCurrency(to.value) : fromCcy;
  const cross = typeInput.value === 'transfer' && fromCcy !== toCcy;
  group.style.display = cross ? 'block' : 'none';
  if (!cross) { clearFieldError(receivedInput); return; }
  if (toCcy !== receivedCcy) {
    receivedMemo[receivedCcy] = receivedInput.value;
    receivedInput.value = receivedMemo[toCcy] || '';
    receivedCcy = toCcy;
    clearFieldError(receivedInput);
  }
  document.getElementById('label-received').textContent = window.I18n.t('form.amountReceived', { currency: toCcy });
  document.getElementById('received-currency-symbol').textContent = window.Store.getCurrencySymbol(toCcy);
  document.getElementById('tx-received-hint').textContent = window.I18n.t('form.crossCurrencyHint', { from: fromCcy, to: toCcy });
};
// updateUIVisibility: syncReceived(); before updateCategories() (1812)
// after syncTransferTo(true) (1845): syncReceived();
// From listener (1846-1852):
accountSelect.addEventListener('change', () => {
  const prevFrom = lastFrom, prevTo = transferToSelect.value;              // 1.0.2 (BUG-35)
  const wasCross = !!receivedInput && document.getElementById('group-received').style.display !== 'none';
  syncTransferTo(false);
  // From moved onto To → the accounts swapped (BUG-21): each figure follows its account (D-U8-12)
  if (wasCross && accountSelect.value === prevTo && transferToSelect.value === prevFrom) {
    const s = amountInput.value; amountInput.value = receivedInput.value; receivedInput.value = s;
    receivedCcy = window.Store.getAccountCurrency(transferToSelect.value);
  }
  clearFieldError(transferToSelect);
  /* existing symbol update (1850-1851) */
  syncReceived();
});
transferToSelect.addEventListener('change', syncReceived);                 // 1.0.2 (BUG-35)

// ── save handler: insert before `if (invalid.length) {` (2220)
// 1.0.2 (BUG-35): "Amount received" is a plain required field of a transfer
// between two currencies — validated in the same pass (1.0.1 BUG-08/BUG-18).
const receivedEl = document.getElementById('tx-received-amount');
const fromSel = document.getElementById('tx-account').value;
const toSel = document.getElementById('tx-transfer-to').value;
const crossCurrency = type === 'transfer' && !!toSel && toSel !== fromSel && !window.Store._sameCurrency(fromSel, toSel);
let receivedAmount;
if (crossCurrency && receivedEl) {
  receivedAmount = window.Store.parseAmount(receivedEl.value); // U2 (BUG-50); parseFloat in the worktree until it lands
  if (Number.isNaN(receivedAmount)) invalid.push([receivedEl, 'form.amountInvalid', {}, { example: window.Store.amountExample() }]);
  else if (receivedAmount === null || receivedAmount <= 0) invalid.push([receivedEl, 'form.receivedRequired', {}]);
}
// UPDATE_TRANSFER (2307) and both ADD_TRANSFER payloads (2343, 2356), right after `amount,`:
...(crossCurrency ? { receivedAmount } : {}),
// captureDraftTxFormState (101-136): receivedAmount: (root.querySelector('#tx-received-amount') || {}).value,
```

**Data repair.** No boot heal.
- A cross-currency pair stored 1:1 cannot be repaired without an exchange rate, and the never-convert rule forbids inventing one.
- Before 1.0.2 every cross-currency pair is 1:1 by construction.

The edit form now opens such a pair (equal legs across currencies) with the sent € figure and an EMPTY received field (D-U8-4). Any save of it therefore asks for the amount that arrived. "This and future" corrects a whole series: propagated and regenerated members follow the edited pair.

Pre-1.0.2 CSV backups restore their 1:1 pairs exactly as stored, and later backups keep 100/117:
- export.js:186-209 writes each leg's own Amount and AccountCurrency;
- import.js:279-297 re-pairs the legs by TransferRef without touching amounts.

The 1.0.2 release notes should mention the 1:1 history and the correction path.

**Tests (each fails on the current code).**

- Every unit test pins the clock with C-49 (vi.useFakeTimers({toFake:['Date']}) at 2026-10-03 local noon). Data: SET_CURRENCY 'EUR'; Main (EUR, 2000, opened 2026-09-01), US Checking (USD, 1000), Savings (EUR, 300), UK Savings (GBP, 500).
- tests/unit/crossCurrencyTransfers.test.js: 'ADD_TRANSFER EUR→USD stores the amount that arrived'. {amount:100, receivedAmount:117} gives expense 100 and income 117; getAccountBalance(US) is 1117 and Main is 1900. Today the income leg is 100 and US is 1100.
- crossCurrencyTransfers: 'a recurring cross-currency transfer materializes every pair as 100/117'. Monthly from 2026-10-25 to 2031-10-25: 61 pairs, every income leg 117, every expense leg 100, exactly one armed generator (the expense tail). Today every income leg is 100.
- crossCurrencyTransfers: 'UPDATE_TRANSFER writes each leg from its own field'. On a 100/117 pair, {amount:110, receivedAmount:125} gives 110/125. Today it gives 110/110.
- crossCurrencyTransfers: 'UPDATE_TRANSFER without receivedAmount leaves a cross-currency income leg alone'. {amount:120} gives 120/117. Today it gives 120/120.
- crossCurrencyTransfers: 'this-and-future amount edit keeps each side in its own currency'. On the 3rd pair of a 100/117 series, updateFuture {amount:105, receivedAmount:121} gives members from that date 105/121 and earlier members 100/117. Today the income members become 105.
- crossCurrencyTransfers: 'a date-moving this-and-future edit regenerates with the received amount'. Every regenerated income leg is 121 and one generator stays armed. Today they are 105.
- crossCurrencyTransfers: 'UPDATE_TRANSACTION on one leg never copies its amount across currencies'. {id: expense leg, amount:130} leaves the income leg at 117. Today it becomes 130.
- crossCurrencyTransfers: 'UPDATE_TRANSACTION future scope never copies an amount across currencies' (review 6/9). {id: expense leg of pair 3, amount:130, updateFuture:true} leaves every later income leg at 117. Today they become 130.
- crossCurrencyTransfers: 'loan re-price never writes a figure into a leg in another currency'. Store._setLoanMemberAmount(expenseLeg, 42000, now) on a 100/117 pair leaves the income leg at 117. Today it becomes 420.
- crossCurrencyTransfers: 'a relabelled pair keeps its received side on a save that changes neither amount nor accounts' (D-U8-11).
- Setup: a 100/117 EUR→USD pair, then SET_CURRENCY {code:'USD', relabel:true}, so Main becomes USD.
- UPDATE_TRANSFER {amount:100, same accounts, note:'rent'} keeps 100/117.
- On a relabelled 100/117 series, an updateFuture note-only edit keeps every member at 100/117.
- {amount:110} gives 110/110.
This fails today, because the setup already stores 100/100.
- crossCurrencyTransfers: 'moving To from a $ account to a € account mirrors'. UPDATE_TRANSFER {amount:100, incomeAccountId: Savings} on a 100/117 pair gives 100/100, with the income leg on Savings. This guards the account-change half of D-U8-11.
- Pins (pass today and must keep passing):
- A same-currency ADD_TRANSFER or UPDATE_TRANSFER with a stray receivedAmount still mirrors.
- A normal same-currency series whose future member was edited singly to 80/80 becomes 100/100 on an updateFuture note-only edit of an earlier pair. This is today's propagation; reviewer 5's literal rule would give 100/80.
- tests/unit/crossCurrencyTransferForm.test.js (formValidation.test.js harness, jsdom, store + components + views, i18n en): 'From and To in different currencies show Amount received (USD)'. Toggle Transfer, pick From Main and To US Checking: #group-received is visible, the label reads 'Amount received (USD)' and the symbol is '$'. To Savings (EUR) hides it. Today there is no such element.
- crossCurrencyTransferForm: 'a cross-currency save without the received amount is refused inline'. Amount 100 with an empty received field gives #tx-received-amount-error 'Enter the amount received, greater than zero.'. No transfer is stored and no alert appears. Today 100/100 is stored.
- crossCurrencyTransferForm: 'one pass: empty amount and empty received both show at once' (review 11). Two .field-error elements appear and focus goes to #tx-amount. Today the received field does not exist.
- crossCurrencyTransferForm: 'a cross-currency save stores 100 / 117'. Today it stores 100/100.
- crossCurrencyTransferForm: 'editing the USD leg opens with €100 sent and $117 received'. params.id is the income leg of a seeded 100/117 pair. Expect #tx-amount '100', #currency-symbol '€', #tx-received-amount '117' and the group visible. Today #tx-amount is 117 under '€'.
- crossCurrencyTransferForm: 're-saving that edit unchanged keeps 100 / 117'. Today both legs become 117.
- crossCurrencyTransferForm: 'a 1:1 cross-currency pair opens with an EMPTY received field and an unchanged save is refused inline' (review 2, D-U8-4). The seeded pair is 100/100 EUR→USD. Today it opens as '€ 100' and saves.
- crossCurrencyTransferForm: 'switching To from a € account to a $ account shows an empty received field', with no silent 1:1 prefill.
- crossCurrencyTransferForm: 'a received figure belongs to its currency' (review 4/8). Type 117 with To = US Checking. Picking UK Savings (GBP) empties the field and the label reads 'Amount received (GBP)'. Picking US Checking again restores 117.
- crossCurrencyTransferForm: 'moving From onto To swaps the two figures' (D-U8-12). Start with From Main, To US Checking, amount 100, received 117. Pick From = US Checking: To becomes Main, #tx-amount reads 117, #tx-received-amount reads 100 and the label reads 'Amount received (EUR)'.
- tests/unit/csvRoundTrip.test.js (new case, review 7): 'a cross-currency pair and series keep their per-leg amounts'. Export a 100/117 EUR→USD pair and a monthly 100/117 series, then import into a fresh install. The legs are still paired at 100/117, the series has one armed generator, and the account currencies are restored.
- tests/e2e/cross_currency_transfer.spec.js (page.clock.install; written blind, run after integration):
- Seed base EUR, Main EUR €2,000 and US Checking USD $1,000.
- Use + → Transfer, 100, From Main, To US Checking. The $ received field appears; an empty Save shows the inline error; enter 117 and Save.
- History shows −€100.00 and +$117.00, and the tile reads $1,117.00.
- Opening the USD leg shows € 100 and $ 117.

**New i18n keys (×5).** `form.amountReceived: en 'Amount received ({currency})' / fr 'Montant reçu ({currency})' / it 'Importo ricevuto ({currency})' / es 'Importe recibido ({currency})' / pt 'Valor recebido ({currency})'`, `form.receivedRequired: en 'Enter the amount received, greater than zero.' / fr 'Saisissez le montant reçu, supérieur à zéro.' / it "Inserisci l'importo ricevuto, maggiore di zero." / es 'Introduce el importe recibido, mayor que cero.' / pt 'Introduza o valor recebido, superior a zero.'`, `form.crossCurrencyHint: en 'This transfer goes from {from} to {to}. Enter the amount that arrived — nothing is converted.' / fr "Ce virement va de {from} vers {to}. Saisissez le montant arrivé — aucune conversion n'est effectuée." / it "Questo trasferimento va da {from} a {to}. Inserisci l'importo arrivato — nessuna conversione viene effettuata." / es 'Esta transferencia va de {from} a {to}. Introduce el importe que llegó — no se realiza ninguna conversión.' / pt 'Esta transferência vai de {from} para {to}. Introduza o valor que chegou — não é feita qualquer conversão.'`, `Appended at the end of each dictionary under a '// ── 1.0.2 (BUG-35) cross-currency transfers ──' header. The NaN case reuses U2's form.amountInvalid {example}; no key is added for it here.`

**Risks.** Merge adjacency. Keep every hunk to the cited lines.
- U2 (BUG-50/25/38/39):
  - The received block is inserted INSIDE U2's save-validation hunk (2209-2223), before `if (invalid.length)` (2220). The integrator merges it by hand onto U2's `[el, key, o, vars]` tuple form.
  - #tx-received-amount must follow U2's #tx-amount: type=text, inputmode=decimal, escapeAttr value, Store.parseAmount.
  - The transfer prefill rounding mirrors U2's line 1522.
  - U8 edits 1519, 1542-1552, 1576 and after 1632, and leaves 1504/1510/1522/1554 alone.
- U3 (BUG-26/27):
  - U3 rewrites UPDATE_TRANSFER 1633-1665, so U8's block goes in at 1666 instead.
  - U8's 1707 edit sits next to U3's removal of 1710-1714. Do not reflow 1708-1709.
  - U3 adds `delete tUpdate.isPaid` after 1476, and U8 adds one line after 1481 in the same propagate(). Union them.
  - U3 renames isPaidPayload at the dispatch sites 2315/2351/2364, and U8 adds a spread after `amount,` at 2307/2343/2356.

Invariants:
- UPDATE_TRANSACTION (sync and propagate) and UPDATE_TRANSFER now share the never-across-currencies rule.
- No nextDate, regeneration or disarm logic changes. The per-leg clone (815-835) carries the amounts.
- `incomeAmount` must be computed before items.forEach mutates the legs.

Accepted limits (record in docs/deep-test-fixes-plan follow-ups):
- After a relabel, a pair with unequal legs is mirrored once its sent amount or an account changes. The hidden field cannot express a received side within one currency.
- UPDATE_TRANSACTION's future/all propagate() (no UI caller) still mirrors such a pair within one currency.
- The store deliberately stays permissive: imports and old callers without receivedAmount still record 1:1.

Conversion semantics: converting a transfer to Income/Expense keeps the tapped leg with the form's From account and amount (store.js:1423-1456). The form now shows the sent side, so what is saved is what is on screen.

BUG-48: an account whose currency is later changed turns its same-currency transfers into 1:1 cross-currency pairs. The form then opens them with an empty received field (D-U8-4).

### BUG-36 — Selecting accounts in different currencies adds € and $ into one € total, with no warning _(gate, effort M)_

**Root cause.** Confirmed at efcac0c: every aggregate applies the v1.02 base-currency guard only to an EMPTY account list. An explicit list is summed raw and formatted with the base symbol.

Store:
- getBalanceAtDate (src/store.js:2959-2972; explicit branch 2967). It also feeds History START/END, the Analytics hero/PREVIOUS, computeGraphBalances and compute12MonthBalances.
- computeUpcomingImpact (2983).
- computeBalanceForecast targetAccounts (3080-3082) and its getBalanceAtDate calls (3107-3108).
- getFilteredTransactions, analytics branch (1006-1013). It feeds computeAnalyticalSummary, computeCategoryDistribution and computeCategoryTagBreakdown.
- computeNetFlowData (3484).

Outside the store:
- The Upcoming widget's own scan (src/widgets.js:880). Its `txs` feeds both the rows (927) and the net (975).
- The History footers and filtered summary (src/views.js:814).

The signals are keyed to an empty list too:
- The caption needs `accounts.length === 0` (views.js:270, 503, 889).
- The filter labels need fewer than all accounts (views.js:267, 491-493, 982).

Home and the expanded graph expand [] to the explicit base ids (views.js:395-397, components.js:3440-3442):
- Select All stores every id (3592, saved at 3634-3638).
- Even an interval-only Save persists the base ids as an explicit list, after which Home's caption disappears.

The modal formats its total (3459), tooltip (3756) and y-axis (3797) with the base symbol.

This is the documented v1.02 choice (docs/bank-import-plan.md §6a: an explicit selection is "the user's call"). It is not an accepted limit in docs/deep-test-fixes-plan.md, and nothing tells the user.

**Fix.** Rule: base wins, and a selection in one currency is returned unchanged.

1. Store helpers, after foreignAccountCount():
   - Store.aggregateSelection(ids) → {ids, currency, excluded}:
     - [] stays [] (every base account) with currency = base and excluded = foreignAccountCount();
     - a selection in one currency is returned as given (a single foreign account keeps its own figures);
     - a mixed selection that includes a base account keeps the base accounts;
     - a mixed selection with no base account keeps its largest same-currency group, ties going to the first in account order (D-U8-6(a), which requires the BUG-63 rider; if the rider is declined, this one line returns no ids, per D-U8-6(b));
     - unknown ids do not vote.
   - Store.aggregatePredicate(ids) → `id => bool`. [] maps to _isPrimaryAccount, a single id compares directly (the per-account fast path), and otherwise it builds a Set of the resolved ids. Callers filter with the predicate and never pass `.ids` back into a store aggregate, where [] means every base account.
   - Store.isPrimarySelection(ids) → true when ids is exactly the base-currency accounts, which is the default expansion of [].
2. Store choke points build the predicate once per call:
   - getBalanceAtDate (2967) and computeUpcomingImpact (2983);
   - computeBalanceForecast targetAccounts (3080-3082);
   - getFilteredTransactions, analytics only: keep the includes() test, then apply the predicate. History stays a ledger;
   - computeNetFlowData: hoist the predicate before `return buckets.map` (3474) and use it at 3484.
   This fixes Home, History START/END, Analytics (hero, NET, PREVIOUS, net-flow, donut, tags), Smart Insights and every widget total.
3. Upcoming widget (review 1, D-U8-13):
   - _matches (861-903) is UNCHANGED, so the list keeps every selected account's scheduled rows.
   - Each row is formatted in its own account's currency (955), as Latest does at 269.
   - The net footer (972-983) sums only `txs.filter(t => inScope(t.accountId))` and is formatted in aggregateSelection(accountIds).currency.
4. History (views.js):
   - histSel = aggregateSelection(filters.accounts).
   - signedRowAmount (814) uses the predicate, so the day footers and In/Out/Net drop excluded accounts. Rows stay visible.
   - The caption (889-891) shows when histSel.excluded > 0.
   - START/END/NET and the footers (872-874, 957) are formatted in histSel.currency.
5. Home (views.js):
   - aggSel = aggregateSelection(isPrimarySelection(saved) ? [] : saved), so a saved base-only list reads as the default.
   - The header (413) and _fmtVariation (478) are formatted in aggSel.currency.
   - The caption (501-506) shows when aggSel.excluded > 0.
   - In attachEvents, the dashed per-account lines (660) are filtered by aggregatePredicate (D-U8-9). Each dataset carries `currency`, and the tooltip (720) formats with ctx.dataset.currency.
6. Analytics (views.js):
   - aggSel = aggregateSelection(filters.accounts).
   - The hero, delta, previous and upcoming note (251, 254, 255, 276) are formatted in aggSel.currency.
   - The indicator (267-272) shows the Partial label AND the caption, instead of either one.
7. ExpandedGraphModal (components.js, review 12):
   - Add a closure helper `resolveSel()` after 3447: aggregateSelection(isPrimarySelection(selectedAccountIds) ? [] : selectedAccountIds). renderModalContent and initExpandedChart both call it, because initExpandedChart (3660) cannot see renderModalContent's locals.
   - The total (3459) is formatted in aggSel.currency, with a caption under it (after 3479) when excluded > 0. The untouched default now captions like Home.
   - Save (3634-3638) persists [] when isPrimarySelection(selectedAccountIds) (D-U8-7). Select All with foreign accounts keeps the explicit list, which the resolver makes honest.
   - initExpandedChart:
     - the account lines (3705) come only from accounts passing aggregatePredicate;
     - datasets carry `currency`;
     - the tooltip (3756) formats with the dataset currency;
     - the y-axis ticks (3797) format with aggSel.currency (review 3).
8. Widget config sheet: _multiChips (widgets.js:188-201) appends the common.otherCurrencyExcluded note when key === 'accountIds' and the explicit selection excludes accounts (D-U8-8). The cards keep their fixed heights.

When every account is in the base currency, every branch resolves to today's code path. The one deliberate exception is that saving the expanded graph with every account ticked now stores [], so accounts added later join the Home total (D-U8-7).

**Sketch.**

```js
// ── store.js, after foreignAccountCount() (2908-2910)
// 1.0.2 (BUG-36): exclude, never convert, for an EXPLICIT selection too. v1.02
// guarded only [], so Main (EUR) + US Checking (USD) summed € and $ 1:1.
//   []                   → [] (= every base-currency account, unchanged)
//   one currency         → as given (a single foreign account's own figures)
//   mixed, base included → the base-currency accounts
//   mixed, no base       → the largest same-currency group (tie: account order)
//                          [D-U8-6(a); needs the BUG-63 rider — (b): keep none]
// excluded → common.otherCurrencyExcluded; currency → formatCurrency's 2nd arg.
// Filter with aggregatePredicate; never feed .ids back to an aggregate ([] = all base).
aggregateSelection(accountIds) {
  const base = this.state.currency;
  const ids = Array.isArray(accountIds) ? accountIds : [];
  if (ids.length === 0) return { ids, currency: base, excluded: this.foreignAccountCount() };
  const picked = new Set(ids);
  const groups = new Map(); // currency → ids, in account order
  let known = 0;
  this.state.accounts.forEach(a => {
    if (!picked.has(a.id)) return;
    known++;
    const c = a.currency || base;
    if (!groups.has(c)) groups.set(c, []);
    groups.get(c).push(a.id);
  });
  if (groups.size <= 1) return { ids, currency: groups.size ? [...groups.keys()][0] : base, excluded: 0 };
  let currency = base;
  if (!groups.has(base)) {
    let best = 0;
    groups.forEach((g, c) => { if (g.length > best) { best = g.length; currency = c; } });
  }
  const kept = groups.get(currency);
  return { ids: kept, currency, excluded: known - kept.length };
},
aggregatePredicate(accountIds) {
  const ids = Array.isArray(accountIds) ? accountIds : [];
  if (ids.length === 0) return (id) => this._isPrimaryAccount(id);
  if (ids.length === 1) { const only = ids[0]; return (id) => id === only; } // per-account fast path
  const keep = new Set(this.aggregateSelection(ids).ids);
  return (id) => keep.has(id);
},
// true when `ids` is exactly the base-currency accounts — what Home and the
// expanded graph expand [] to (views.js:395-397, components.js:3440-3442)
isPrimarySelection(ids) {
  const prim = this.primaryAccountIds();
  if (!Array.isArray(ids) || !prim.length || ids.length !== prim.length) return false;
  const picked = new Set(ids);
  return prim.every(id => picked.has(id));
},

// getBalanceAtDate / computeUpcomingImpact
const inScope = this.aggregatePredicate(accountIds); // 1.0.2 (BUG-36)
//   2967 / 2983 → inScope(t.accountId) &&
// computeBalanceForecast 3080-3082
const inScope = this.aggregatePredicate(accountIds);
const targetAccounts = this.state.accounts.filter(a => inScope(a.id));
// getFilteredTransactions, after the bounds (994)
const inAggregate = pageKey === 'analytics' ? this.aggregatePredicate(accounts) : null;
//   1006-1013 →
if (accounts.length > 0 && !accounts.includes(tx.accountId)) return false;
if (inAggregate && !inAggregate(tx.accountId)) return false; // History stays a ledger
// computeNetFlowData: before `return buckets.map` (3474)
const inScope = this.aggregatePredicate(accounts);
//   3484 → if (!inScope(t.accountId)) return false;

// ── widgets.js upcoming.render — _matches (861-903) unchanged: the LIST keeps every selected account (D-U8-13)
//   955 → formatCurrency(Math.abs(row.amount), acc && acc.currency)   // row's own currency, as Latest (269)
// footer (972-983):
const accountIds = W._cfg(instance).accountIds || [];
const inScope = window.Store.aggregatePredicate(accountIds); // 1.0.2 (BUG-36): only the SUM excludes
const net = txs.filter(t => inScope(t.accountId)).reduce((sum, t) =>
  window.Store._isPositiveTx(t) ? sum + t.amount : sum - t.amount, 0)
  - loanRows.reduce((sum, l) => sum + l.amount, 0);
//   982 → formatCurrency(net, window.Store.aggregateSelection(accountIds).currency)
// _multiChips (188-201)
const note = (key === 'accountIds' && !all) ? window.Store.aggregateSelection(selectedIds).excluded : 0;
// append `<p class="widget-config-label" style="opacity:.8">${this._esc(window.I18n.t('common.otherCurrencyExcluded', { count: note }))}</p>` when note > 0

// ── views.js TransactionsView.render (after 805)
const histSel = window.Store.aggregateSelection(filters.accounts);
const inSums  = window.Store.aggregatePredicate(filters.accounts);
//   814 → if (!inSums(tx.accountId)) return 0;
//   872-874, 957 → window.Store.formatCurrency(x, histSel.currency)
//   889 → const foreignNote = histSel.excluded > 0 ? `<div …>${window.I18n.t('common.otherCurrencyExcluded', { count: histSel.excluded })}</div>` : '';
// DashboardView.render (after 397)
const saved = savedFilters.accounts || [];
const aggSel = window.Store.aggregateSelection(window.Store.isPrimarySelection(saved) ? [] : saved);
//   413, 478 → formatCurrency(x, aggSel.currency)
//   501-506 → aggSel.excluded > 0 ? `<p …>${window.I18n.t('common.otherCurrencyExcluded', { count: aggSel.excluded })}</p>` : ''
// DashboardView.attachEvents (660, 720)
const inAgg = window.Store.aggregatePredicate(selectedAccountIds);
const visibleAccounts = state.accounts.filter(a => selectedAccountIds.includes(a.id) && inAgg(a.id));
// main dataset: currency: <aggregateSelection as in render>.currency; account datasets: currency: acc.currency
//   720 → label: (ctx) => ` ${ctx.dataset.label}: ${window.Store.formatCurrency(ctx.parsed.y, ctx.dataset.currency)}`
// AnalyticsView.render (near 173)
const aggSel = window.Store.aggregateSelection(filters.accounts);
//   251/254/255/276 → formatCurrency(x, aggSel.currency)
//   267-272 → (hasAccountFilter ? partialHtml : '') + (aggSel.excluded > 0 ? captionHtml(aggSel.excluded) : '')

// ── components.js ExpandedGraphModal.show
// after 3447: 1.0.2 (BUG-36) ticking exactly the base accounts IS the default view
const resolveSel = () => window.Store.aggregateSelection(
  window.Store.isPrimarySelection(selectedAccountIds) ? [] : selectedAccountIds);
// renderModalContent: const aggSel = resolveSel();
//   3459 → formatCurrency(latestBalance, aggSel.currency)
//   after 3479 → ${aggSel.excluded > 0 ? `<div style="font-size: var(--text-xs); color: var(--text-tertiary); margin-top: 2px;">${window.I18n.t('common.otherCurrencyExcluded', { count: aggSel.excluded })}</div>` : ''}
// Save (3634-3638) → accounts: window.Store.isPrimarySelection(selectedAccountIds) ? [] : selectedAccountIds,
// initExpandedChart (3660-3800)
const aggSel = resolveSel();
const inAgg = window.Store.aggregatePredicate(selectedAccountIds);
// main dataset: currency: aggSel.currency
//   3705 → visibleAccounts.filter(acc => inAgg(acc.id)).forEach(acc => { … currency: acc.currency … })
//   3756 → label: (ctx) => ` ${ctx.dataset.label}: ${window.Store.formatCurrency(ctx.parsed.y, ctx.dataset.currency)}`
//   3797 → callback: (val) => window.Store.formatCurrency(val, aggSel.currency)
```

**Data repair.** None; the fix is purely computational.
- Saved expandedGraphFilters, History/Analytics filters and widget configs that list mixed currencies stay as they are. Their figures become base-only, with the caption.
- A Home view saved before 1.0.2 as the explicit base list reads as the default through isPrimarySelection, so it now shows the caption. The next Save stores it as [].
- No migration is needed, and stale ids are tolerated (BUG-29 prunes them).

**Tests (each fails on the current code).**

- Every unit test pins the clock at 2026-10-04 noon. Data: base EUR; Main (EUR, 2000, opened 2026-09-01) and US Checking (USD, 1000); Groceries −50 on Main and −40 on US, both dated 2026-10-02.
- tests/unit/mixedCurrencySelection.test.js: 'aggregateSelection resolves a selection'.
- [] gives {ids:[], currency:'EUR', excluded:1}.
- [us] gives ids [us], USD, excluded 0.
- [main, us] gives [main], EUR, excluded 1.
- With a GBP account and a second USD account added, [us, us2, gbp] gives USD, excluded 1.
- A tie [us, gbp] goes to the first in account order.
- [main, us, 'gone'] gives excluded 1.
Fails today: the function does not exist.
- mixedCurrencySelection: 'isPrimarySelection'. [main] with Main the only base account is true; [main, us] is false; [] is false; [] with no base accounts is false.
- mixedCurrencySelection: 'an explicit mixed list sums only the base-currency accounts'. getBalanceAtDate('2026-10-31', [main, us]) is 1950. Today it is 2910.
- mixedCurrencySelection: 'computeBalanceForecast([main, us]) equals computeBalanceForecast([main])'. Today the absolute diffs are −90 and −50.
- mixedCurrencySelection: 'computeUpcomingImpact excludes the foreign account from a mixed selection'. Seed a future €10 on Main and $15 on US: count 1, net −10. Today it is count 2, net −25.
- mixedCurrencySelection: 'computeNetFlowData with [main, us] counts only € rows'. The October expense is 50. Today it is 90.
- mixedCurrencySelection: 'Analytics summary and distribution exclude the foreign account from a mixed selection'. Groceries is 50. Today it is 90.
- Pins (pass today): getFilteredTransactions('history', {accounts:[main, us]}) still returns both rows, and getAccountBalance(us) and getBalanceAtDate(d, [us]) stay 960.
- tests/unit/mixedCurrencyViews.test.js (jsdom; Chart stub as in expandedGraphModal.test.js): 'Home with a saved mixed selection shows the € total and the caption'. With expandedGraphFilters.accounts = [main, us], the header contains '€1,950.00' and '1 account in another currency is excluded from these totals.'. Today it shows €2,910.00 with no caption.
- mixedCurrencyViews: 'Home with a saved list equal to the base accounts shows the caption' (review 12). With accounts = [main], the caption is present. Today it is absent.
- mixedCurrencyViews: 'History filtered to Main + US Checking'. START '€2,000.00', END '€1,950.00', footer 'sum: -€50.00', both rows still listed, and the caption. Today: €3,000.00 / €2,910.00 / −€90.00, with no caption.
- mixedCurrencyViews: 'History opened from the US Checking tile formats in $'. With accounts [us], START is '$1,000.00'. Today it is €1,000.00.
- mixedCurrencyViews: 'Analytics with a partial mixed selection shows the € hero, the Partial label AND the caption'. Add a third account and filter [main, us]. Today: €2,910.00 and no caption.
- mixedCurrencyViews: 'Net Worth widget configured [main, us] reads €1,950.00'. Today it reads €2,910.00.
- mixedCurrencyViews: 'large Upcoming widget configured [main, us] lists both rows and nets only the € rows' (review 1). Seed recurring −€10 on Main and −$15 on US. The rows show '-€10.00' AND '-$15.00', and the footer reads −€10.00. Today the rows are −€10.00 / −€15.00 and the footer is −€25.00.
- mixedCurrencyViews: 'the widget config sheet notes the excluded account'. renderConfig with accountIds [main, us] contains the caption. Today it does not.
- tests/unit/expandedGraphModal.test.js (new cases):
- 'Select All with a foreign account keeps the € total and explains it': the total is '€1,950.00', the caption is present, and the datasets are the total plus Main's line only. Today: €2,910.00 and a US line.
- 'the y-axis follows the selection currency' (review 3): with savedFilters.accounts = [us], the y tick callback from window.Chart.mock.calls returns a string starting with '$'. Today it returns '€'.
- 'the default view shows the caption' (saved []).
- 'Save View on the untouched default persists []': stub querySelector('#egm-save-filters') and call its onclick; expect expandedGraphFilters.accounts toEqual []. Today the base ids are persisted.
- 'Save after Select All persists the full list' (pin).
- tests/e2e/mixed_currency_totals.spec.js (page.clock.install, written blind):
- Home → chart → Filter → Select All → Save View gives Total Balance €1,950.00 with the caption.
- History → Wallets: Main + US Checking gives START €2,000.00, END €1,950.00, 'sum: -€50.00' and the caption.
- The US Checking tile → History gives START $1,000.00.
Today: €2,910.00 / €3,000.00 / €1,000.00.

**New i18n keys (×5).** `None new. Every caption, including the modal caption and the widget config-sheet note, reuses the existing plural common.otherCurrencyExcluded.one/.other, which is already in all five dictionaries.`

**Risks.** This reverses a documented v1.02 decision (bank-import-plan §6a), so D-U8-6 needs owner approval. The integrator then:
- updates §6a and CLAUDE.md's currency bullet: exclusion also covers explicit selections; new aggregates use Store.aggregatePredicate; lists keep rows and only sums exclude;
- marks §6a's two "known accepted imperfections" as superseded by 1.0.2.

Coupling: D-U8-6(a)'s no-base branch is correct only with the BUG-63 rider (D-U8-10). If the rider is declined, apply D-U8-6(b) instead, a one-line change in aggregateSelection. Otherwise a [US, GBP] widget shows a USD sum under €.

Per-account callers stay on the single-id fast path, never the resolver:
- tiles (getAccountBalance);
- forecast baselines (store.js:3093);
- the per-account chart lines;
- statement reconciliation (views.js:5604).

The resolved `ids` must never be passed back into an aggregate, because [] there means every base account. Use aggregatePredicate.

Performance: getBalanceAtDate runs up to 52× per chart. The predicate costs O(accounts) per call, which is negligible next to the O(transactions) scan.

The one all-base behaviour change: saving the expanded graph with every account ticked stores [] (D-U8-7). Home figures are identical, and an account added later now joins the total instead of being silently left out.

Adjacent units:
- BUG-28 (U4) owns computeNetFlowData's bucket bounds (3403-3472); U8 owns 3474-3484.
- BUG-24's unit edits account-name markup in the same modal (3508) and createAccountOptions; those are separate hunks.
- BUG-29 (U5) prunes stale ids; no ordering constraint.

### BUG-63 — figures for a single foreign-currency selection, or the largest-group selection, carry the base € symbol. After the U8 gate this covers the remaining widget totals and the Analytics charts. The Upcoming widget's rows and footer moved into BUG-36. _(rider, recommended, effort M)_

**Root cause.** Store.formatCurrency(amount, code) defaults to state.currency (store.js:2775-2793), and these aggregate sites never pass a selection currency:
- widgets.js: incomeExpense 337, 343, 420; categories 492, 558; netWorth 631, 687; savings 754, 810;
- components.js: NetFlowChart tooltip 2385; CategoryDonutChart 2555, 2575, 2668, 2677, 2782, plus the type-toggle re-render paths (2615, 2726).

BUG-36's gate edits already cover History, the Home header and chart, the Analytics hero/NET/PREVIOUS/upcoming, the expanded-graph modal (total, tooltip, y-axis) and the Upcoming widget's rows and net.

**Fix.** Reuse BUG-36's resolver; no new logic.
- Each account-configurable widget computes `const ccy = window.Store.aggregateSelection(W._cfg(instance).accountIds || []).currency` inside its builder. It passes ccy to formatCurrency and to its chart callbacks, captured per mount via Widgets._mountChart.
- AnalyticsView passes aggSel.currency as a new optional last argument to NetFlowChart.render/attachEvents and CategoryDonutChart.render/attachEvents (views.js:239, 247, 352, 355).
- The components store the currency, so the type toggle (2615/2726), drilldown and tag breakdown reuse it.
- Budgets stay in the base currency, since they have no account dimension.

This rider is REQUIRED by D-U8-6(a) (D-U8-10). If it is declined, D-U8-6 must be (b).

**Sketch.**

```js
// widgets.js, e.g. netWorth.render (631)
const ccy = window.Store.aggregateSelection(W._cfg(instance).accountIds || []).currency; // 1.0.2 (BUG-63)
`<span class="widget-stat-value">${W._esc(window.Store.formatCurrency(latest, ccy))}</span>`
// netWorth chart (687): callbacks: { label: (ctx) => window.Store.formatCurrency(ctx.parsed.y, ccy) }
// components.js
CategoryDonutChart.render(data, type, currency) { this._currency = currency; … formatCurrency(totalAmount, this._currency) … }
NetFlowChart.attachEvents(container, data, filters, currency) { … label: (ctx) => `Net: ${window.Store.formatCurrency(ctx.parsed.y, currency)}` }
```

**Data repair.** None (presentation only).

**Tests (each fails on the current code).**

- mixedCurrencyViews: the netWorth widget configured [us] shows '$960.00'. Today it shows €960.00.
- mixedCurrencyViews: the incomeExpense widget configured [us] shows its net in $. Today it shows €.
- mixedCurrencyViews: the Analytics donut total with filter [us] shows '$40.00'. Today it shows €40.00.
- Pin: with all-base data every widget's markup is unchanged, and widgetsI18nGuard passes.

**New i18n keys (×5).** `None.`

**Risks.** Chart callbacks are closures created at mount, so the currency must be captured per mount, not read from a global. The donut and net-flow components are singletons with re-render paths (type toggle, drilldown) that must reuse the stored currency. No data changes. widgetsI18nGuard is unaffected because no strings are added.

### BUG-48 — changing an account's currency in Edit Account relabels its history with no impact warning; changing the last € account sets every total to €0.00. _(rider, not recommended, effort M)_

**Root cause.** EditAccountView's save handlers pass the select's value to UPDATE_ACCOUNT unchecked (src/views.js:4262-4271). UPDATE_ACCOUNT assigns it (src/store.js:1180). The 1.0.1 BUG-01 impact sheet (currencySwitchImpact store.js:2919, Components.CurrencySwitchConfirm) guards only SET_CURRENCY.

**Fix.** Before UPDATE_ACCOUNT, when an existing account's currency changes and it has non-opening rows, show a confirm built on the CurrencySwitchConfirm layout. Back it with a new Store.accountCurrencyImpact(id, code) that returns:
- the row count;
- whether this is the last base-currency account (with an offer to switch the base too);
- the number of transfer pairs whose currency relationship flips.
Cancel applies nothing.

**Sketch.**

```js
// views.js EditAccountView save (4262-4271)
if (isEdit && newCcy !== acc.currency && window.Store.accountCurrencyImpact(acc.id, newCcy).rows > 0) {
  window.Components.CurrencySwitchConfirm.show({ /* per-account copy */ onConfirm: doSave });
  return;
}
```

**Data repair.** None.

**Tests (each fails on the current code).**

- Edit Account: changing the last EUR account to USD opens the confirm, and Cancel leaves the currency unchanged. Today the change saves immediately.

**New i18n keys (×5).** `About 4–6 new plural keys (confirm title, body, last-base note, transfer note) ×5. The wording is an owner decision.`

**Risks.** Not recommended for U8. It is a different surface (the EditAccountView save flow plus the BUG-01 confirm), needs its own copy and owner decisions, and does not block either gate bug.

U8 already handles both transfer consequences of a currency change:
- a same-currency 1:1 pair that becomes cross-currency opens with an empty received field (D-U8-4);
- a 100/117 pair that becomes same-currency keeps its received side on an untouched save (D-U8-11).

### BUG-121 — loans have no currency. Tracking one on a USD account copies the € instalment 1:1 as dollars, and the loan screens keep showing €. _(rider, not recommended, effort L)_

**Root cause.** Loan records hold only a LoanEngine config with no currency. _DebtShared.fmtC (src/views.js:4347) and the Upcoming loan row (src/widgets.js:946) format with the base currency. startRecurringPrefill (src/views.js:4446) copies the amount whatever the account's currency.

**Fix.** Add an optional config.currency (default base, or taken from the tracked account). fmtC and the loan row format with it, and the prefill or New Log form shows an inline note when the account's currency differs.

**Sketch.**

```js
fmtC(cents, ccy) { return window.Store.formatCurrency((cents || 0) / 100, ccy); }
```

**Data repair.** None: loans without a currency stay in the base currency.

**Tests (each fails on the current code).**

- The debt hub for a loan with config.currency 'USD' shows $. Today it shows €.

**New i18n keys (×5).** `1 inline note key ×5`

**Risks.** Not recommended for U8. It needs a loan config schema change, touches every debt screen and the linked-series sync (U3's BUG-74 region), and is Low severity. BUG-35's loan guard (D-U8-5) already stops loan re-pricing from writing a figure into a leg in another currency. The Upcoming loan row (946) stays in the base currency; loan rows appear only in the unscoped widget.

### U8 decisions

- **D-U8-1** BUG-35: how should the form record a transfer between accounts in different currencies?
  - (a) A REQUIRED 'Amount received (USD)' field that appears only when the From and To currencies differ; each leg is stored in its own currency
  - (b) An optional received field; left empty, the transfer is recorded 1:1 with a visible 'recorded 1:1, not converted' warning
  - (c) A warning only; keep one amount (1:1) on both legs
  - _Recommended:_ A required 'Amount received' field, shown only when From and To use different currencies, with each leg stored in its own currency (option a). — It is the only option that keeps both balances true without converting, and it fits the never-convert rule: the user types what the bank shows. (b) and (c) still let a recurring top-up add the same error every month.
- **D-U8-2** BUG-35: should the form show the implied exchange rate (e.g. '1 EUR = 1.17 USD') under the received field?
  - (a) No
  - (b) Yes, read-only and recomputed as the user types (1 new key ×5 plus Intl number formatting)
  - _Recommended:_ No implied-rate line (option a). — The two amounts are the record. A rate line adds a formatting and rounding surface, suggests the app knows rates, and changes nothing that is stored. It can come later.
- **D-U8-3** BUG-35: show each account's currency code in the From/To pickers (e.g. 'Main · EUR')?
  - (a) No; the hint under the received field names both currencies
  - (b) Yes, when the user has accounts in more than one currency
  - _Recommended:_ No currency codes in the pickers; the received field's hint names both currencies (option a). — The received field and its hint say 'from EUR to USD' at the moment it matters. (b) edits createAccountOptions (views.js:93-99), which BUG-24's escaping fix owns in this round.
- **D-U8-4** BUG-35: what happens to transfers already stored 1:1 across currencies (every cross-currency pair created before 1.0.2)? Amended after review 2.
  - (a) No automatic repair. The edit form opens a cross-currency pair whose two legs are equal (the 1:1 signature) with an EMPTY received field, so any save of it requires the amount that arrived. Pairs whose legs already differ are prefilled. 'This and future' corrects a whole series.
  - (b) No automatic repair; prefill the received field with the stored income amount (the draft). An unchanged save silently keeps 1:1, and nothing ever prompts a correction.
  - (c) A one-time notice listing cross-currency transfers whose two legs are equal
  - (d) A boot heal (impossible without a rate, and never-convert forbids one)
  - _Recommended:_ No automatic repair; the edit form opens an equal-legs cross-currency pair with an empty 'Amount received' field so the user must enter what arrived before saving (option a). — The 1:1 pairs are wrong by construction, and (b) would let them survive every edit, including a note-only save. (a) prompts at the one moment the user is looking at the pair, without a nagging detector and without a new string. A genuine near-parity pair costs one retype. (c) nags users who never open those pairs. (d) would need an invented rate.
- **D-U8-5** BUG-35: when a loan sync re-prices a linked series that was converted to a transfer between two currencies, should the other leg get the same figure?
  - (a) No: re-price only the leg(s) in the same currency; never copy a figure into another currency
  - (b) Keep mirroring (today's behaviour)
  - _Recommended:_ Re-price only same-currency legs and never copy the loan figure into a leg in another currency (option a). — This is the transfer fix's never-copy-across-currencies rule. Loans have no currency yet (BUG-121), so writing the loan's figure into a USD leg is exactly the 1:1 error. It is a one-condition guard at store.js:4195 and 4260.
- **D-U8-6** BUG-36: what does an explicit account selection that mixes currencies add up to? (This reverses v1.02's documented 'the user's call', bank-import-plan §6a.)
  - (a) Base wins: only the base-currency accounts are summed and the caption says how many were left out. A selection with no base account sums its largest same-currency group (tie: first in account order), shown in that currency. A one-currency selection is unchanged. Requires the BUG-63 rider (D-U8-10).
  - (b) Base only: a mixed selection with no base-currency account totals nothing, with the caption. A single foreign account or a one-currency selection is still kept. This is a one-line variant of (a) in aggregateSelection.
  - (c) Per-currency subtotals ('€1,950.00 · $960.00') on every aggregate surface
  - (d) Keep the raw sum and add a 'mixes currencies, not converted' warning
  - _Recommended:_ Base wins, with the largest same-currency group for a selection without any base account, formatted in that currency (option a), landing together with the BUG-63 rider. If the owner declines the rider, use base-only (option b) instead. — (a) applies the same exclude-never-convert rule as the default view, needs no new UI or strings, and still gives a USD+GBP selection a meaningful figure. Its no-base branch is honest only where the figure is formatted in the selection's currency, so it is tied to the BUG-63 rider (review 13). Without the rider, the widgets and Analytics charts would show a USD sum under €, and (b) avoids that. (c) is a redesign of Home, History, Analytics and the widgets. (d) keeps a meaningless headline.
- **D-U8-7** BUG-36: what should the expanded graph save, given that the modal expands the default [] into the explicit list of base-currency accounts (components.js:3440-3442)? Revised after review 12.
  - (a) Save [] whenever the ticked accounts are exactly the base-currency accounts (the default view, also after an interval-only save). Select All with foreign accounts keeps saving the explicit list, which the resolver makes honest with a caption. The modal captions an exactly-base selection like Home. All-base users: a full selection now saves [], so accounts added later join the total.
  - (b) Same as (a), but only when foreign accounts exist; all-base users keep today's explicit save
  - (c) Keep saving every explicit list (the draft). An interval-only save on the default drops Home's caption, and the modal never captions the default.
  - (d) Select All always saves [] and the default ticks every account (changes the default expansion, with an all-foreign corner case)
  - _Recommended:_ Save [] whenever the ticked accounts are exactly the base-currency accounts, and keep saving the explicit list for any other selection, including Select All with foreign accounts (option a). — (a) makes 'untouched default' and 'saved default' the same thing, so Home's caption survives an interval-only save and the modal captions the default too. For all-base users it also stops a newly added account being silently left out of a Home total saved as an explicit list. (b) keeps that silent gap just to preserve an explicit list nobody chose. (c) leaves the reviewer's gap open. (d) changes what the sheet shows by default.
- **D-U8-8** BUG-36: how should a widget configured with accounts in several currencies say that some are excluded?
  - (a) A note under the account chips in the widget's config sheet (reuses common.otherCurrencyExcluded)
  - (b) Also a caption on the widget card
  - (c) Nothing
  - _Recommended:_ A note under the account chips in the widget's config sheet, reusing the existing caption string (option a). — The user learns it at the moment of choosing, and v0.73's fixed card heights stay intact. v1.02 deliberately kept one dashboard-level caption rather than one per widget.
- **D-U8-9** BUG-36: the dashed per-account lines on the Home and expanded balance charts for accounts excluded from the total?
  - (a) Hidden: the chart shows the total and its own components
  - (b) Kept, with the tooltip in each account's own currency
  - _Recommended:_ Hide the dashed lines of accounts that the total leaves out (option a). — A USD line on the same axis as a EUR total reads as part of it. (a) is a one-predicate filter.
- **D-U8-10** BUG-36/BUG-63: should totals be formatted in the selection's currency (a USD-only or largest-group selection reads $)? Revised after review 13.
  - (a) Yes. In the gate, every site U8 edits: Home header and variations, History summary and footers, Analytics hero/NET/PREVIOUS/upcoming, the expanded-graph total, tooltip and y-axis, and the Upcoming widget's rows and net. The BUG-63 rider (the other widgets and the Analytics net-flow and donut charts) lands in the same unit, because D-U8-6(a) relies on it.
  - (b) Yes at the gate sites only, without the rider; D-U8-6 must then be (b)
  - (c) No, keep the base symbol everywhere; D-U8-6 must then drop the largest-group branch
  - _Recommended:_ Format every touched total in the selection's currency and land the BUG-63 rider with U8 (option a). — D-U8-6(a) needs it for correctness, and it removes the two 'accepted imperfections' in bank-import-plan §6a. Every site costs only a second formatCurrency argument fed by the same resolver. Declining the rider forces D-U8-6(b), which makes a USD+GBP selection read nothing.
- **D-U8-11** BUG-35: a transfer pair whose legs differ (e.g. 100/117) can later end up in one currency, through SET_CURRENCY {relabel:true} or an Edit Account currency change. The received field is then hidden. What should a save of that pair do? New, from reviews 5 and 10.
  - (a) Keep its received side on any save that changes neither the sent amount nor an account (a note, tag, date or paid edit, in any scope; series members take the pair's own received amount). Mirror as usual once the amount or an account changes.
  - (b) Mirror on the next save whatever changed, and record it as an accepted limit
  - (c) Show the received field for such pairs too, and let the store honour receivedAmount within one currency
  - _Recommended:_ Keep the pair's received side on a save that changes neither the sent amount nor an account, and mirror once either changes (option a). — A note edit must never move a balance. (a) is identical to today for equal legs and costs one condition in UPDATE_TRANSFER and in UPDATE_TRANSACTION's sync. Reviewer 5's narrower 'amount unchanged' rule was rejected: it breaks a normal series with a hand-edited member (100/80 after a note edit) and a To change from $ to €. (b) silently shifts a balance. (c) needs new hint copy and relaxes the store's same-currency invariant.
- **D-U8-12** BUG-35: when the user picks the current To account as From, the form swaps the two accounts (BUG-21). What happens to the two typed figures? And when To moves to another currency? New, from reviews 4 and 8.
  - (a) Swap the figures with the accounts, so each stays with its account and currency. A To change to another currency parks the received figure and shows that currency's own (or an empty) field, restoring it when the user returns.
  - (b) Keep the sent figure and empty the received field on any account change
  - (c) Leave both fields as typed (the draft): 117 typed for USD can be saved as £117 or relabelled EUR
  - _Recommended:_ Swap the two figures along with the accounts, and tie the received figure to the To currency it was typed for (option a). — (c) reintroduces exactly the mislabelled-figure error this fix removes. (b) is safe but throws away correct input when the user only fixed the direction. (a) never mislabels a figure and keeps what the user typed.
- **D-U8-13** BUG-36: should lists drop the rows of accounts that a mixed selection leaves out of the total? This covers History rows and the Upcoming widget's scheduled rows. New, from review 1.
  - (a) No: lists keep every selected account's rows, each formatted in its own currency; only the sums (Upcoming net, History START/END, In/Out and day footers) leave them out
  - (b) Yes: drop them from the lists too
  - _Recommended:_ Keep every selected account's rows in the lists, each in its own currency, and exclude them only from the sums (option a). — The user picked those accounts and expects to see their payments. History already works this way (v1.02 'a ledger, not a sum'). (b) would silently hide scheduled payments on a widget card that has no caption. A row carries its own currency symbol, so nothing is mislabelled.

### U8 regions owned

| File | Symbol | Lines | Change |
|---|---|---|---|
| src/store.js | UPDATE_TRANSACTION (transfer counterpart sync) | 1357-1366 (replace 1361 only) | BUG-35 / D-U8-11: mirror onto the counterpart only within one currency and only when the amount or this leg's account changed. Lines 1336-1347 belong to U2 (BUG-25) |
| src/store.js | UPDATE_TRANSACTION propagate() — counterpart branch | 1477-1482 (insert one line after 1481) | BUG-35: delete tUpdate.amount when the counterpart sits in another currency. U3 adds `delete tUpdate.isPaid` after 1476 in the same function; union the two |
| src/store.js | ADD_TRANSFER | 1599-1604 (new const before 1600; line 1604) | BUG-35: the income leg takes receivedAmount across currencies; same-currency legs keep mirroring |
| src/store.js | UPDATE_TRANSFER | insert at 1666 (between legRecurrence 1651-1665 and items.forEach 1667); lines 1677 and 1707 only | BUG-35 / D-U8-11: eager incomeAmount from the post-edit accounts; per-leg write and propagation. 1633-1665 belong to U3 (BUG-26), and 1710-1714 (isPaid) to U3 (BUG-27) |
| src/store.js | getFilteredTransactions | 991-1013 | BUG-36: hoisted aggregatePredicate for pageKey 'analytics'; History stays a ledger |
| src/store.js | new helpers _sameCurrency, _receivedAmount, aggregateSelection, aggregatePredicate, isPrimarySelection | insert after foreignAccountCount() 2908-2910, before the currencySwitchImpact comment (2912) | BUG-35/36: new helpers |
| src/store.js | getBalanceAtDate, computeUpcomingImpact | 2959-2990 (2967, 2983) | BUG-36: account test via aggregatePredicate |
| src/store.js | computeBalanceForecast | 3080-3082 | BUG-36: targetAccounts via aggregatePredicate |
| src/store.js | computeNetFlowData (account test only) | 3474-3484 | BUG-36: hoisted predicate before buckets.map; line 3484. Bucket construction 3403-3472 belongs to U4 (BUG-28) |
| src/store.js | _setLoanMemberAmount, _applyLoanFinalInstalment (counterpart mirrors) | 4195, 4260 | BUG-35 / D-U8-5: same-currency condition. The SYNC_LOAN_SERIES loop (2442-2448) and _loanSeriesAmountChanges belong to U3 (BUG-74) |
| src/views.js | captureDraftTxFormState | 101-136 | BUG-35: capture receivedAmount |
| src/views.js | AnalyticsView.render | 173-281 (aggSel near 173; 251, 254, 255; 267-272; 276) | BUG-36: selection-currency formatting; Partial label and caption together |
| src/views.js | DashboardView.render | 395-413, 466-506 | BUG-36: aggSel (isPrimarySelection → default) after 397; header and variation formatting; caption keyed on aggSel.excluded |
| src/views.js | DashboardView.attachEvents (balance chart) | 618-678, 720 | BUG-36 / D-U8-9: dashed lines filtered by aggregatePredicate; per-dataset currency in the tooltip |
| src/views.js | TransactionsView.render (summary + day footers) | 805-891, 954-957 | BUG-36: predicate in signedRowAmount (814), histSel.currency formatting, caption on histSel.excluded |
| src/views.js | AddTransactionView.render | 1519-1520, 1542-1552, 1576-1577, insert after 1632 | BUG-35 / D-U8-4: initialReceived; sent-side amount; received prefill only when cross-currency legs differ; draft restore; #group-received markup with data-ccy. 1504/1510/1522/1554 belong to U2 |
| src/views.js | AddTransactionView.attachEvents (received state, visibility, account listeners) | insert after 1769; 1810-1812; 1845-1853 | BUG-35 / D-U8-12: receivedInput/receivedCcy/memo and syncReceived before updateUIVisibility; call before updateCategories; after syncTransferTo(true); From listener swaps the figures on an account swap; new To listener |
| src/views.js | AddTransactionView save handler | insert before 2220 (inside U2's 2209-2223 hunk); spreads after `amount,` at 2307, 2343, 2356 | BUG-35: received check in the one-pass invalid list; `...(crossCurrency ? { receivedAmount } : {})` in the three transfer payloads. U3's isPaid renames at 2292-2295/2315/2351/2364 are untouched |
| src/components.js | ExpandedGraphModal.show / renderModalContent / Save / initExpandedChart | insert after 3447; 3449-3480 (3459, after 3479); 3634-3638; 3660-3800 (3705, 3756, 3797) | BUG-36 / D-U8-7 / D-U8-9: resolveSel closure; total in aggSel.currency with a caption; Save persists [] for an exactly-base selection; account lines filtered by predicate; per-dataset tooltip currency; y-ticks in aggSel.currency |
| src/widgets.js | _multiChips | 188-201 | BUG-36 / D-U8-8: config-sheet note when an accountIds selection excludes accounts |
| src/widgets.js | registry.upcoming.render (rows + net footer) | 955, 972-983 (_matches 861-903 unchanged) | BUG-36 / D-U8-13: rows in their own currency; net sums only aggregatePredicate rows, formatted in the selection currency |
| src/widgets.js | BUG-63 rider: incomeExpense, categories, netWorth, savings | 337, 343, 420, 492, 558, 631, 687, 754, 810 | Selection currency passed to formatCurrency and chart callbacks (rider, required by D-U8-6(a)) |
| src/components.js | BUG-63 rider: NetFlowChart / CategoryDonutChart | 2385; 2555, 2575, 2615, 2668, 2677, 2726, 2782 | Optional currency argument stored on the component (rider) |
| src/views.js | BUG-63 rider: AnalyticsView chart calls | 239, 247, 352, 355 | Pass aggSel.currency to NetFlowChart/CategoryDonutChart (rider) |
| src/i18n/en.js, fr.js, it.js, es.js, pt.js | end-of-dictionary block | append before the closing `};` (en 1346; fr/it/es/pt 1325) | BUG-35: form.amountReceived, form.receivedRequired, form.crossCurrencyHint under a '// ── 1.0.2 (BUG-35) ──' header |
| tests/unit/accountCurrency.test.js | 'empty accountIds means primary-currency accounts only' | 105 | The explicit mixed list now resolves to the base account: expect 100, not 150 (optionally also aggregateSelection([eurId, usdId]).excluded === 1) |
| tests/unit/csvRoundTrip.test.js | new case | append | BUG-35: a cross-currency pair and series keep their per-leg amounts through export/import |
| tests/unit/expandedGraphModal.test.js | new cases | append | BUG-36: Select All caption and lines, y-tick currency, default caption, Save persists [] |
| tests/unit (new) + tests/e2e (new) | crossCurrencyTransfers, crossCurrencyTransferForm, mixedCurrencySelection, mixedCurrencyViews; cross_currency_transfer.spec, mixed_currency_totals.spec | new files | BUG-35/36 regression tests |

**Dependencies.** Cross-unit coordination:
- U2 (BUG-50/25/38/39):
  - U8's received validation sits INSIDE U2's save hunk (views.js:2209-2223), as a block inserted before `if (invalid.length)` at 2220 that uses U2's `[el, key, o, vars]` tuple. The integrator merges it by hand.
  - U8 calls U2's Store.parseAmount / Store.amountExample and reuses U2's form.amountInvalid key. If U2 is not on main when the worktree branches, U8 uses parseFloat with only form.receivedRequired, and the integrator swaps in parseAmount.
  - #tx-received-amount must follow #tx-amount's final markup (type=text, inputmode=decimal, autocomplete=off, escapeAttr value).
  - The transfer prefill rounds to cents like U2's 1522.
  - U8's currency check runs after syncTransferTo(true) (1845), so it sees U2's BUG-39 preselected From.
- U3 (BUG-26/27/74):
  - U3 owns UPDATE_TRANSFER 1633-1665, so U8 inserts its block at 1666.
  - U8's 1707 edit sits two lines from U3's removal of 1710-1714.
  - U3 adds `delete tUpdate.isPaid` after 1476 and U8 adds one line after 1481 in the same propagate(); union them.
  - U3 renames isPaidPayload at views.js:2292-2295/2315/2351/2364, and U8 adds spreads after `amount,` at 2307/2343/2356.
  - U3 owns the SYNC_LOAN_SERIES loop; U8 adds only the same-currency condition inside _setLoanMemberAmount (4195) and _applyLoanFinalInstalment (4260).
- U4 (BUG-28) owns computeNetFlowData's bucket bounds (store.js:3403-3472). U8 owns only the account test (3474-3484).
- U5 (BUG-29) prunes stale account ids from expandedGraphFilters, filters and widget configs. aggregateSelection already ignores unknown ids, so there is no ordering constraint.
- BUG-24's unit owns account-name escaping (createAccountOptions views.js:93-99, the modal's name markup near components.js:3508). U8 touches neither, which is why D-U8-3 recommends no codes in the pickers.
- BUG-63 rider: it depends on BUG-36's resolver and is REQUIRED by D-U8-6(a). It lands in U8.

Integrator tasks (worktrees must not do these):
- One ?v= bump covering store.js, views.js, components.js, widgets.js and the five i18n files. They are co-dependent, because views, components and widgets call the new Store helpers.
- Update CLAUDE.md:
  - the currency bullet: exclude-never-convert now covers explicit selections; new aggregates use Store.aggregatePredicate; lists keep rows and only sums exclude; an exactly-base graph selection is saved as [];
  - a transfer bullet: each leg in its own currency; `receivedAmount`; same-currency legs mirror on an amount or account change; UPDATE_TRANSACTION and UPDATE_TRANSFER share the never-across-currencies rule;
  - the i18n key count.
- Mark docs/bank-import-plan.md §6a's "explicit selection is the user's call" and its two "known accepted imperfections" as superseded by 1.0.2.
- Record the D-U8-11 accepted limits in docs/deep-test-fixes-plan's follow-ups.
- Mention the pre-1.0.2 1:1 transfer history and its correction path in the release notes.

There are no new components, sheets or icons, so there is no Back-dismiss work and no EMERGENCY_ICONS entry.

**Existing tests affected.** One existing assertion changes. tests/unit/accountCurrency.test.js:105 asserts the old BUG-36 behaviour: `getBalanceAtDate('2026-12-31', [eurId, usdId])` → 150, "explicit list: user's call". It becomes 100, since the USD base keeps Checking only. Optionally also assert `aggregateSelection([eurId, usdId]).excluded === 1`.

Everything else should pass unchanged, because every new branch matters only when two currencies are involved:
- A one-currency selection is returned as given.
- The length-1 predicate fast path equals the old includes().
- Same-currency transfers mirror on every amount or account change, and untouched saves of equal legs write the same number.
- Unknown ids count as base.
- The Upcoming widget's rows keep their filter. Row currency equals base for all-base data.

Specific checks:
- transferEditCounterpart.test.js: "opening the income leg" now shows the expense leg's amount. The legs are equal in single-currency data, so it stays green.
- formValidation.test.js: the received push happens only for a cross-currency transfer.
- expandedGraphModal.test.js and the e2e suite: nothing asserts what the modal's Save stores, so the [] save (D-U8-7) breaks no test.
- No existing test asserts the exclusion caption.
- Captured drafts gain a receivedAmount key, and no test compares a whole draft object.

Suites to run in the worktree (vitest via main's node_modules): accountCurrency, currencySwitch, recurringTransfers, transferEditCounterpart, recurrenceEditing, recurrenceTypeConversion, unpaidTransactionFiltering, accountDeleteTransfers, accountFilterIndicator, backgroundTimestampLogging, csvRoundTrip, historySummary, dailySummaryString, draftTxPreservation, expandedGraphModal, formValidation, loanSyncInPlace, loanSyncReview, loanLinkedPayments, debtView, homeWidgets*, widgetsI18nGuard, categoryDonutChart, netFlowChartYScale, and i18n.test.js (parity of the 3 new keys across 5 dictionaries).

New unit files: crossCurrencyTransfers, crossCurrencyTransferForm, mixedCurrencySelection and mixedCurrencyViews, plus new cases in expandedGraphModal.test.js and csvRoundTrip.test.js. All pin local noon with vi.useFakeTimers({toFake:['Date']}) per C-49.

New e2e: cross_currency_transfer.spec.js and mixed_currency_totals.spec.js (page.clock.install). Per the previous round's rule they are written blind in the worktree and run after integration. Existing e2e specs use single-currency data and should not change; wallet_account_filter.spec is included in that.

## U9 — Budgets and Android Back

Final design. I checked all ten review issues against efcac0c. All ten are valid and all are folded in. Two of them get a different correction from the one the reviewers proposed, and parts of three proposed corrections are rejected (points 1 and 3 below).

**What changed from the draft**

1. **BUG-87: `leave()` is now synchronous (issues 1 and 5, both major, both confirmed).**
   - The problem: in the draft's back branch, `history.back()` is asynchronous, while the coalesced emit fires on the next microtask (store.js:1105-1120). That render still reads `#edit?id=<deleted>` (views.js:1491-1497), so it draws 'Transaction not found.' (or the new 'Category not found'), and main.js snapshots that page for the view transition (575-581). A second Save tap inside that window called `history.back()` twice. views.js:6232-6234 already documents the same stale-frame effect for imports.
   - The new design removes the window instead of masking it. Rejected corrections: a `_leaving` flag with empty not-found pages and a timeout, or skipping renders in main.js. Instead, `leave()` rewrites the current entry in place with `history.replaceState` and calls `handleRouteChange()` at once. The save or delete and SET_VIEW land in the same tick, so the one coalesced render draws the landing screen.
   - When the entry underneath already is the landing screen, `history.back()` then drops the now-identical entry. The traversal lands on the same URL: no hashchange, no second render.
   - A second `leave()` finds the hash already at its target and returns, so a double tap can never step back twice.
   - Side benefit: the blank New Log frame that follows every save today is gone too.

2. **Filtered History origin (issue 4, valid).** `leave(path)` also steps back when `path` has no query and the route part of the origin matches it. 'Account card → row → Save' therefore returns to `#transactions?account=x` (decision D-U9-8), and the first Back no longer looks dead.

3. **Robustness (issue 6, valid).**
   - (a) The problem is wider than stated. loanLinkedPayments.test.js:256-291 and loanSyncReview.test.js:131-145 click the loan Delete with the real router.js, in a window that has no `history`. Once 5481 uses `leave()`, an unguarded `history` read would throw there. Every `history` access in `leave()` and `_stampEntry()` is now guarded, with a `navigate()` fallback, and a refused `replaceState` (WebKit's rate limit) falls back to `location.replace`.
   - (b) Accepted for Android Back: `_back()` flags the next unstamped entry as having an unknown origin (`from: null`), so `leave()` replaces it.
   - Rejected part: also setting that flag in `leave()`'s back branch. That traversal fires no hashchange in the new design, so the flag would leak into the next fresh entry and wrongly erase its origin.
   - Web browser Back over history written by 1.0.1 stays an accepted limit: it can land one screen off, never in a loop.

4. **Debt exits (issue 2, valid; D-U9-7).** I confirmed the trap. After a loan is deleted from `#debt-results?id=L` (5481), Back returns to the results entry, `attachEvents` pushes '#debt' again (5320), and Back can never get past it. I also found that the save and promote exits leave the results page under the hub with a live Save, because `state.debtSim` is never cleared (store.js:2178, views.js:5020); Back then Save creates a duplicate simulation. Now in this unit: `leaveTo` at 5320, 5395, 5401, 5416, 5457 and 5481; `data-router-leave` on 'Back to loans' (5186) and on the results ✕ (5271).

5. **BUG-86 e2e step 2 (issues 3 and 7, valid).** The autofocus (views.js:3050-3053) raises `keyboard-active` (src/utils/keyboard.js:32), which hides the nav (src/styles/components.css:329-333). The step now blurs the field and waits for the class to clear before tapping the nav.

6. **badInput (issue 8, valid while #bdg-amount is `type=number`, views.js:2993).** The editor snapshot now includes `validity.badInput`. After U2's BUG-50 makes the field text, the flag simply stays false.

7. **Transfer legs (issue 9, valid).** A CSV restore keeps a named category on TransferRef legs (import.js:241, 294). The spend index now skips `transferRef` rows, as `getCategoryMonthlyAverage` (store.js:3259) and Analytics (1000, 3482) already do.

8. **Legacy data (issue 10, valid as documentation).** Two groups of existing installs will see budget figures fall on update:
   - series members un-paid by BUG-27;
   - accounts whose opening date was stamped a UTC day late (BUG-38).
   This is now in the risks and release notes. U2's draft already moves the store.js:1155 and 1189 fallbacks to local dates.

**Corrections to the draft's own notes**
- U4 (BUG-69) does not edit router.js, so the 'do not touch 182-187' note is dropped.
- U5's account-form Back rider is superseded: U9 makes the 4298/4316 swap.

**Unchanged from the draft**
- **BUG-55 (gate, S):** one edit to the index build in `Store._categoryMonthSpend`, which every budget surface reads.
- **BUG-86 (gate, S):** a budget-editor step in `handleBack`, a view-owned dirty snapshot, and `destroy()` clears the editor.
- **BUG-87 (rider, M):** `Router.leave` plus origin stamps, `leaveTo` / `data-router-leave` in views, and a 'Category not found' page.

No new i18n keys and no data repair.

**For the integrator**
- One `?v=` bump for store.js, router.js and views.js.
- Drop the 'deliberately stricter' note at docs/refactor-plan-2.md:325.
- Update CLAUDE.md's Android Back section (see dependencies).

The validated JSON of this design is also saved at C:/Users/ecalvaresi/AppData/Local/Temp/claude/C--Users-ecalvaresi-Desktop-Projects-Stackd/cb10937b-fdd5-4705-b015-cb79e9cbf9c3/scratchpad/designs/U9-final.json.

### BUG-55 — Budget spend counts unpaid expenses and expenses dated before the account opened _(gate, effort S)_

**Root cause.** src/store.js:3182-3194 `_categoryMonthSpend` builds the category×month index. It skips only:
- rows that are not `type === 'expense'` or have no category (3187);
- foreign-currency rows (3188).

It has no `t.isPaid === false` check, no `this._isTxBeforeOpeningDate(t)` check and no `t.transferRef` check.

Its value is the budget's `spent` (`getBudgetForMonth`, store.js:3208) and each past month's remainder in the cumulative rollover (3219). The error therefore reaches:
- the Goals rows, sort and Total Spent (views.js:2797-2814);
- the Goals donut (views.js:3168-3173);
- the Home budgets widget's rows and totals (widgets.js:1043).

Every other aggregate applies these rules:
- balances (`getBalanceAtDate` 2959-2971) and the upcoming impact (2977-2986);
- analytics (998-1001, 3480-3483), which also skip transfer legs;
- the editor hint (`getCategoryMonthlyAverage` 3259-3263, 3284-3287).

That is why the report sees €65 on Goals and the Home budgets widget against €40 everywhere else.

Transfer legs normally carry an empty category (store.js:2043-2049). A CSV restore of a file that names a category on TransferRef rows keeps it (import.js:241, 294), and those legs then count as budget spend too.

The cause predates 1.0.1. No test pins the current behaviour.

**Fix.** Add three exclusions inside the index build, cheapest first:
- `isPaid === false` or `transferRef` (field reads);
- then the primary-account check (memoized);
- then the opening-date check (memoized `_openingIdx`).

Nothing else changes. This is the smallest correct change: `_categoryMonthSpend` is the single source of budget spend, so every consumer listed above, and the rollover, is fixed without any view or widget edit.

The index lifecycle needs no change. These already null `_budgetSpendIdx`:
- paid toggles (`TOGGLE_TRANSACTION_PAID` 1856, and isPaid in `UPDATE_TRANSACTION`/`UPDATE_TRANSFER`);
- opening-date edits (`UPDATE_ACCOUNT` 1184-1206);
- cross-tab sync (`_sortData` 1125-1126).

Also reword the `getCategoryMonthlyAverage` header comment (store.js:3242-3243, which calls it stricter than `getBudgetForMonth`). This is a comment-only change.

The results match the report's expected figures:
- a pre-opening month inside a cumulative range counts as €0 spent and carries its full allocation forward (D-U9-2; October reads €40.00 of €300.00, with a +€200.00 rollover);
- months before an account opened read €0.00.

The editor hint stays month-to-date while the row is whole-month (end of month), per the documented MTD/EOM split. The two can now differ only by future-dated paid rows.

**Sketch.**

```js
// src/store.js 3177-3194
  // v0.93: one-pass category×month spend index. ... (comment unchanged)
  // 1.0.2 (BUG-55): same row rules as every other aggregate — unpaid rows,
  // transfer legs and rows dated before their account opened are not spend
  // (they inflated Goals, the Home budgets widget and every later rollover).
  _categoryMonthSpend(categoryId, yearMonth) {
    let idx = this._budgetSpendIdx;
    if (!idx) {
      idx = this._budgetSpendIdx = Object.create(null);
      for (const t of this.state.transactions) {
        if (t.type !== 'expense' || !t.categoryId) continue;
        if (t.isPaid === false || t.transferRef) continue;   // 1.0.2 (BUG-55)
        if (!this._isPrimaryAccount(t.accountId)) continue;  // v1.02: budgets are primary-currency
        if (this._isTxBeforeOpeningDate(t)) continue;        // 1.0.2 (BUG-55), memoized
        const key = t.categoryId + '|' + t.date.slice(0, 7);
        idx[key] = (idx[key] || 0) + t.amount;
      }
    }
    return idx[categoryId + '|' + yearMonth] || 0;
  },

// store.js 3242-3243 comment: "Unlike getBudgetForMonth's spent figure this applies the
// isPaid gate — ..." becomes:
//   "Same row rules as getBudgetForMonth's spent figure since 1.0.2 (BUG-55): no
//    unpaid rows, no transfer legs, nothing dated before the account opened."
```

**Data repair.** None. Budget spend and rollover are derived on every render and never stored. Budget records (`stackd_v1_budgets`) and transactions are untouched, so there is nothing to heal and no false-positive risk.

Visible effect after the update: months that contain unpaid, pre-opening or categorized transfer-leg rows show lower spend, and cumulative budgets gain the matching rollover. The figures then agree with balances, History and Analytics.

Legacy data damaged by sibling bugs moves too, and no boot heal is planned, because which flags or dates are wrong cannot be inferred:
- past series members that a 1.0.1 'This and future'/'All' edit un-paid (BUG-27) now leave their months' budgets;
- accounts whose opening date was stamped a UTC day late (BUG-38) now drop their first-day expenses from budgets, as they already did from balances.
Release notes: 'Budgets now count only paid expenses from the date an account opened, matching balances and History.'

**Tests (each fails on the current code).**

- tests/unit/budgetSpendExclusions.test.js (new). Setup:
- boot db, i18n, i18n/en, loan-engine, store, components, widgets, views;
- pin the clock with vi.useFakeTimers({toFake:['Date']}) at 2026-10-15 12:00 local;
- dispatch SET_CURRENCY 'EUR' BEFORE ADD_ACCOUNT, otherwise the account is foreign and excluded;
- add 'Main Checking' €1000 with openingDate '2026-09-01';
- add Groceries via ADD_TRANSACTION: €40 on 2026-10-02, €25 on 2026-10-03 with isPaid:false, €30 on 2026-08-20;
- SAVE_BUDGET Groceries €100.
- (a) Unpaid rows are not spend: getBudgetForMonth('cat_groceries','2026-10').spent === 40. Current code gives 65.
- (b) Pre-opening rows are not spend: getBudgetForMonth(...,'2026-08').spent === 0. Current code gives 30.
- (c) The rollover uses the same figures. After SAVE_BUDGET {amount:100, isCumulative:true, startDate:'2026-08'}:
- October: spent 40, carryover 200, finalLimit 300;
- September: carryover 100.
Current code gives 65/170/270 for October and 70 for September.
- (d) The index follows dispatch. October spent is 40. TOGGLE_TRANSACTION_PAID {id} on the €25 row makes it 65, and toggling again makes it 40. UPDATE_ACCOUNT {id, openingDate:'2026-08-01'} makes August 30. Current code fails at the first assertion (65).
- (e) The opening-date rule is per account. ADD_ACCOUNT 'Cash' {openingBalance:0, openingDate:'2026-07-01'} plus a €12 Groceries row on 2026-08-05 makes August spent 12. Current code gives 42.
- (f) Goals: BudgetView.renderList({...state, activeMonthFilter:'2026-10'}). The Groceries row contains '€40.00' and its .budget-used-pct reads '40%'; Total Spent reads €40.00; '€65.00' appears nowhere. Current code shows €65.00 and 65%.
- (g) Home budgets widget: ADD_HOME_WIDGET {type:'budgets', size:'large'}, then registry.budgets.render. The output contains '€40.00', 'of €100.00 budgeted' and '40%', and not '€65.00'. Current code shows €65.00.
- (h) Agreement with the editor hint: getCategoryMonthlyAverage('cat_groceries',6) returns {currentMonth:true, average:40}, which equals getBudgetForMonth(...,'2026-10').spent. Current code: 65 ≠ 40.
- (i) Transfer legs are not spend. Push a categorized expense leg straight into Store.state.transactions: €15, 2026-10-05, categoryId 'cat_groceries', transferRef 'r1', on Main Checking. A CSV restore that names a category on TransferRef rows produces this. Then set Store._budgetSpendIdx = null, because the push bypasses dispatch. October spent stays 40. Current code gives 80 (40 + 25 + 15).
- No e2e spec is needed. The unit tests cover the store figure end to end, and live verification after integration replays the report's steps.

**Risks.** - **Behaviour change.** Unpaid bills, including recurring series the user stamped unpaid, stop consuming budgets until they are marked paid. Expenses dated before an account's opening date leave that month's budget. Both follow CLAUDE.md's aggregate rule and the Paid toggle's own copy ('Excluded until marked paid'), and both match the end-of-month forecast. If the owner wants scheduled bills visible in budgets, see D-U9-1, second option.
- **Legacy data.** Installs already damaged by BUG-27 (un-paid series members) or BUG-38 (UTC-late opening dates) see those rows leave their budgets on update; see dataRepair and the release-notes line.
- **BUG-27.** An unpaid series member un-paid by a 'This and future' or 'All' edit now also moves budget figures. BUG-27 ships in the same release.
- **BUG-38.** Three places must move to local dates together: the New Log and New Account defaults, and the store-level `createdAt` fallbacks in ADD_ACCOUNT (store.js:1155) and UPDATE_ACCOUNT (1189). Otherwise, near midnight, a same-day expense can fall 'before opening' and leave the budget, as it already leaves the balance. U2's draft lists all four; keep them together.
- **Performance.** One memoized lookup per expense row in the existing single O(T) pass; negligible.
- **Untouched.** Income-category budgets still read 0 spent, because the index counts expenses only. This is pre-existing and out of scope.

### BUG-86 — Android Back on the budget-limit editor leaves Goals, drops the typed limit, and the editor comes back stale _(gate, effort S)_

**Root cause.** The Goals limit editor is neither a route nor a sheet. BudgetView renders `renderEdit` while its module property `editCategoryId` is set (views.js:2770, render 2773-2776). The row click opens it (3220-3225).

`Router.handleBack` (router.js:114-157) has no branch for it:
- `FORM_VIEWS` (61) lists only add, edit, edit-account and edit-category;
- `_armFormBaseline` and `_isFormDirty` (89-99) are gated on those views.

On #budget, Back therefore skips the 1.0.1 dirty-form confirm (139-152) and reaches `this._back(canGoBack)` (155). That calls `history.back()`, which usually lands on Home. The typed limit is never saved.

`BudgetView.destroy()` (3230-3235) releases only the doughnut and leaves `editCategoryId` set, so the next visit to #budget renders the editor again, empty because nothing was saved. Its 100 ms autofocus (3050-3053) then focuses #bdg-amount. KeyboardManager adds `body.keyboard-active` (src/utils/keyboard.js:32), and that class hides the bottom nav (src/styles/components.css:329-333). This is the 'bottom bar hidden' symptom.

**Fix.** 1. **Router.handleBack.** Add a budget-editor step after the widget-edit-mode check and before the FORM_VIEWS check. It applies when `state.activeView === 'budget'` and `window.Views.BudgetView.editCategoryId` is set. The lookup is guarded (`window.Views`, `typeof closeEditor === 'function'`), so router-only unit tests, and a stale cached views.js, see an inert branch.
   - If `BudgetView.isEditorDirty(routerView)` is true, show the same 'Discard changes?' sheet. Discard calls `BudgetView.closeEditor()`, which closes back to the list and does not navigate. A second Back hits the sheet's Cancel and keeps editing, as for the route forms. Return 'confirm'.
   - Otherwise close the editor directly and return the new value 'step'.
   - Move the discard Modal into `Router._confirmDiscard(onDiscard)`, shared with the route-form path. That path keeps its exact title, labels and saveClass, so androidBack.test.js stays green.
2. **BudgetView.**
   - Expose `closeEditor()`. It blurs the focused input (so KeyboardManager drops keyboard-active), clears `editCategoryId` and the baseline, and emits.
   - Route the in-editor ← arrow (3042-3048) through it. It stays an explicit discard, per the 1.0.1 rule for in-app close controls.
   - Add `isEditorDirty(root)` and `_editorValues(root)`. The snapshot is a JSON array of #bdg-amount's value and its `validity.badInput` flag, #bdg-start, #bdg-end and the #bdg-cumulative checked state. `badInput` matters while the field is `type=number` (views.js:2993): a typed '1,500' reports `value === ''` and would otherwise look untouched.
   - Take the baseline (`_editBaseline`) when the edit-mode `attachEvents` runs, after the editor's inputs exist. A MonthPicker pick or the rollover switch then counts as a change, autofocus does not, and every opening of the editor gets a fresh baseline.
   - The check is deliberately view-owned. Reusing Router's touch-armed `_formBaseline` would need a reset on every editor open and close without a route change, and views must not call Router's Back helpers.
3. **destroy().** `BudgetView.destroy()` also clears `editCategoryId` and `_editBaseline`. Any departure from Goals (nav tap, deep link, Back from the list) then returns to the list.

**Sketch.**

```js
// src/router.js — handleBack, after the widget-edit-mode block (137), before the FORM_VIEWS check (139)
    // 1.0.2 (BUG-86): the Goals limit editor is a step INSIDE #budget
    // (BudgetView.editCategoryId), not a route. Back closes it to the budget
    // list (after the discard confirm when a field changed) and never leaves
    // Goals. It used to route back to Home and leave the editor armed.
    const BV = window.Views && window.Views.BudgetView;
    if (state.activeView === 'budget' && BV && BV.editCategoryId && typeof BV.closeEditor === 'function') {
      const rv = document.getElementById('router-view');
      if (rv && BV.isEditorDirty(rv)) {
        this._confirmDiscard(() => BV.closeEditor());
        return 'confirm';
      }
      BV.closeEditor();
      return 'step';
    }

    if (this.FORM_VIEWS.includes(state.activeView) && this._isFormDirty()) {
      this._confirmDiscard(() => { this._formBaseline = null; this._back(canGoBack); });
      return 'confirm'; // a second Back hits the sheet's Cancel = keep editing
    }

// src/router.js — new member after _back (105)
  // 1.0.2 (BUG-86): the one "Discard changes?" sheet (route forms + Goals limit editor)
  _confirmDiscard(onDiscard) {
    window.Components.Modal.show({
      title: window.I18n.t('form.discardTitle'),
      content: `<p>${window.I18n.t('form.discardBody')}</p>`,
      saveText: window.I18n.t('form.discard'),
      saveClass: 'btn-danger', // 1.0.1 (BUG-20): Discard is the destructive choice
      onSave: (close) => { close(); onDiscard(); }
    });
  },
// chain comment (107-113): "... → widget edit mode → Goals limit editor (closes
// it, 'step') → confirm leaving a dirty form → route back."

// src/views.js — BudgetView (2770-2771)
    editCategoryId: null,
    currentBudgetFilter: 'expense',
    _editBaseline: null, // 1.0.2 (BUG-86): editor values when it opened

// attachEvents edit branch (3038-3048)
      if (this.editCategoryId) {
        const savedCategoryId = this.editCategoryId;
        // 1.0.2 (BUG-86): what the editor showed when it opened (before the
        // +100 ms autofocus), so Android Back can ask before dropping an edit.
        this._editBaseline = this._editorValues(container);
        const bdgBackBtn = container.querySelector('#btn-bdg-back');
        if (bdgBackBtn) bdgBackBtn.addEventListener('click', () => this.closeEditor()); // explicit discard
        ...unchanged (autofocus, month pickers, save 3077-3110, delete)...

// destroy (3230-3235) + new methods
    destroy() {
      if (this._budgetChart) { try { this._budgetChart.destroy(); } catch (e) { /* already gone */ } this._budgetChart = null; }
      // 1.0.2 (BUG-86): leaving Goals closes the limit editor. It used to
      // survive navigation and reopen, stale and autofocused (keyboard up,
      // bottom bar hidden), on the next visit.
      this.editCategoryId = null;
      this._editBaseline = null;
    },

    // 1.0.2 (BUG-86): the limit editor is a step inside #budget, not a route.
    // Router.handleBack closes it through these.
    closeEditor() {
      const a = document.activeElement;
      if (a && a !== document.body && typeof a.blur === 'function') a.blur(); // KeyboardManager drops keyboard-active
      this.editCategoryId = null;
      this._editBaseline = null;
      window.Store.emit();
    },
    isEditorDirty(root) {
      return !!this.editCategoryId && this._editBaseline !== null && !!root &&
        this._editorValues(root) !== this._editBaseline;
    },
    _editorValues(root) {
      const amt = root.querySelector('#bdg-amount');
      const val = (id) => { const el = root.querySelector('#' + id); return el ? el.value : ''; };
      const cum = root.querySelector('#bdg-cumulative');
      // badInput: a type=number field holding '1,500' reports value '' (BUG-50 class)
      return JSON.stringify([amt ? amt.value : '', !!(amt && amt.validity && amt.validity.badInput),
        val('bdg-start'), val('bdg-end'), !!(cum && cum.checked)]);
    }
```

**Data repair.** None. `editCategoryId` and the baseline are transient in-memory UI state that is never persisted, and the bug saved nothing. Nothing to heal.

**Tests (each fails on the current code).**

- tests/unit/budgetEditorBack.test.js (new). Setup:
- jsdom's own window (the androidBack.test.js pattern); body: <main id="router-view"></main><nav id="bottom-nav"></nav><div id="modal-container"></div>;
- load db, i18n, i18n/en, loan-engine, store, components, views, router;
- clock pinned with vi.useFakeTimers({toFake:['Date']});
- real Store.init() plus one account, then Store.dispatch('SET_VIEW','budget');
- helper openEditor(catId): set BudgetView.editCategoryId, write BudgetView.render(state) into #router-view, call attachEvents(rv, state);
- spy on window.history.back (no-op).
- (a) Back on an untouched editor closes it and stays on Goals. handleBack({canGoBack:true}) returns 'step' and BudgetView.editCategoryId is null; history.back is not called and location.hash is unchanged. Current code returns 'back' and calls history.back.
- (b) Back after typing a limit asks first. Type '200' into #bdg-amount, then:
- handleBack returns 'confirm' and #modal-title reads 'Discard changes?';
- with the sheet open, Back returns 'sheet' and #bdg-amount still reads '200';
- Back returns 'confirm' again; click #modal-save-btn (Discard);
- editCategoryId is null, state.budgets has no cat_groceries record, and history.back was never called.
Current code returns 'back'.
- (c) A picked month or the rollover switch counts as a change. Setting #bdg-start to '2026-08' gives 'confirm'. In a fresh editor, ticking #bdg-cumulative gives 'confirm'. Current code returns 'back'.
- (d) An existing budget, opened and left alone, closes without a prompt: SAVE_BUDGET €100, open the editor (amount field '100'), and Back returns 'step'. Current code returns 'back'.
- (e) A second editor never inherits the first one's baseline. Open Groceries, type 50, Back, Discard; open Transport untouched; Back returns 'step'. Current code returns 'back'.
- (f) Leaving Goals closes the editor: openEditor('cat_groceries'), then BudgetView.destroy(), then BudgetView.render(state) contains 'budget-cat-row' and no 'bdg-amount'. Current code renders the editor again.
- (g) An unparseable typed amount still counts as a change. Open a new-budget editor, then stub the field: Object.defineProperty(#bdg-amount, 'validity', {value:{badInput:true}, configurable:true}). jsdom never reports badInput, hence the stub. handleBack then returns 'confirm'. Current code returns 'back'.
- E2E tests/e2e/back_navigation.spec.js (new; written blind, verified after integration; Pixel 7 viewport, clock installed):
1. Goals, tap Groceries, fill #bdg-amount with 200. page.evaluate(() => Router.handleBack({canGoBack:true})) returns 'confirm'. Click #modal-save-btn. .budget-cat-row is visible, the URL ends #budget, and budgets has no Groceries record.
2. Tap Groceries and wait until #bdg-amount is focused (the +100 ms autofocus). Then blur it with page.locator('#bdg-amount').evaluate(el => el.blur()) and wait for expect(page.locator('body')).not.toHaveClass(/keyboard-active/): the class hides the nav (components.css:329-333) and a click on it would time out. Tap bottom-nav Home, then bottom-nav Goals. #bdg-amount has count 0, .budget-cat-row is visible, body has no keyboard-active, and the bottom nav is visible.

**Risks.** - **Router reads `window.Views.BudgetView` at Back time.** The lookup is guarded, including `typeof closeEditor === 'function'`. androidBack.test.js, which loads no views.js, sees an inert branch. A stale cached views.js against a new router.js cannot throw (the integrator still bumps both).
- **New return value 'step'.** main.js only tests `!== 'exit'`, so nothing there changes.
- **The in-editor ← arrow stays a silent, explicit discard**, consistent with the 1.0.1 rule for in-app close controls (D-U9-3).
- **Same-view re-render while the editor is open.** If a cross-tab sync or Bank Connect refresh emits, the typed values reset to the stored ones. This is pre-existing. The baseline is retaken in that attach, so Back never prompts for values that are already gone.
- **BUG-50 (U2).** U2 makes #bdg-amount `type="text"` with its value rendered in the markup (2993) and changes the save parse (3077-3096). The snapshot is taken in attachEvents after render, so an untouched editor stays clean. `badInput` then always reads false.
- **BUG-40 (U5).** U5 adds a `dismissible` option to Modal.show and may touch androidBack.test.js. `_confirmDiscard` passes byte-identical options and does not set the new one.

### BUG-87 — Android Back after a save or delete reopens the closed form, or a blank Edit Category _(rider, recommended, effort M)_

**Root cause.** `Router.navigate(path)` is `window.location.hash = path` (router.js:224-226), which always pushes a history entry. After a save or delete, every form leaves through it:
- transaction form save and delete: views.js:2404 and 2445 (navigate('#transactions'));
- Edit Category save and delete: 2742 and 2758 ('#categories');
- account form save and delete: 4298 and 4316 ('#dashboard');
- the forms' ✕ links (1598, 2644, 3983) and the Pro lock card (✕ 7008, Go Back 7030), which push through href or navigate.

The form's own entry (#edit?id=…, #edit-category?id=…) stays directly under the landing screen. `handleBack` ends in `history.back()` (router.js:102-105, 155), so Back reopens it.

**Deleted transaction.** For a deleted log, the reopened entry is the 'Transaction not found.' page (views.js:1495-1497). Its Go Back is `<a href="#transactions">`, which pushes another entry, hence the loop.

**Deleted category.** `EditCategoryView.render` sets `isEdit = !!catId` (2629), not 'category found', so a deleted id renders a blank, live edit form. Its Save sends `UPDATE_CATEGORY` (2738-2739). The store ignores an unknown id (store.js:2138-2155), and the form navigates away with no message. `attachEvents` (2688-2691) has the same gap.

**Debt (same cause, found in review).**
- Deleting a loan from `#debt-results?id=L` calls navigate('#debt') (5481), leaving [#debt, #debt-results?id=L, #debt].
- Back returns to the results entry. The loan is gone, so `attachEvents` pushes '#debt' again (5320), and 'Back to loans' (5186) pushes too. Back can never get past it.
- The save and promote exits (5395, 5401, 5416, 5457) leave the results page under the hub. `state.debtSim` is never cleared (store.js:2178; set only at views.js:5020), so Back shows the results with a live Save, and saving again creates a duplicate simulation.

**A trap in the obvious fix.** A plain `history.back()` after the save is asynchronous. Meanwhile the dispatch's coalesced emit (store.js:1105-1120) re-renders the closed form against the unchanged hash. For a deleted id that render is the not-found page, which main.js then fades out as the outgoing view of the transition (575-581). views.js:6232-6234 documents the same stale frame for imports.

**Fix.** **1. `Router.leave(path)`.** It leaves the current screen for `path` without keeping the screen's history entry, synchronously:
- It rewrites the current entry in place with `history.replaceState` and calls `handleRouteChange()` at once. The save or delete and SET_VIEW land in the same tick, so the one coalesced render draws the landing screen. The closed form never re-renders: no not-found frame and no live Save in between.
- When the entry underneath already is that screen, the rewrite targets that entry's exact URL, and `history.back()` then drops the now-identical entry. The traversal lands on the same URL, so there is no hashchange and no second render. 'Underneath is that screen' means either:
  - the origin hash equals `path`; or
  - `path` has no query and the origin's route part equals it (D-U9-8). This covers History opened from an account card, `#transactions?account=x`. Returning there re-applies `?account=`, exactly as any Back onto that entry does.
- Otherwise the rewritten entry keeps the origin of the entry it replaces, so the next leave still knows what is underneath.
- A call whose target is already the current hash returns at once. A double tap therefore never steps back twice. Calls are also ignored while a step back is still landing (the transient entry is marked `left: 1`, which e2e can wait on).
- The landing screens do not change (D-U9-4).

**2. Origin stamp.** `handleRouteChange` calls `_stampEntry()`. Every unstamped entry gets `history.replaceState({stackdNav:1, from:<hash of the screen it was pushed from>})`.
- Fragment navigations start with a null `history.state`, and Back/Forward restore stamps (also across a web reload).
- `_back()` (Android Back) sets `_noOrigin`, so an unstamped entry reached by traversal is stamped `from:null` rather than with the hash of the screen above it. `leave()` then replaces, which is always safe.

**3. Robustness.**
- Every `history` access is guarded.
- Windows without the History API (unit-test mocks) fall back to `navigate()`.
- A refused `replaceState` (WebKit throws past 100 calls in 30 s) falls back to `location.replace(path)` (`_replaceHash`, spy-able) with an unknown origin.

**4. views.js.** A top-level `function leaveTo(path)`, after clearFieldErrors, calls `Router.leave` and falls back to `Router.navigate` for unit-test Router stubs that predate it. It is used at 2404, 2445, 2742, 2758, 4298, 4316 and 7030 (D-U9-5), and for the debt exits at 5320, 5395, 5401, 5416, 5457 and 5481 (D-U9-7).

**5. Close and not-found links.** Add `data-router-leave` to:
- the ✕ links: 1598, 2644, 3983, 7008 (D-U9-5) and 5271 (D-U9-7);
- the not-found and dead-end Go Back links: 1496, 2569 and 5186.
Keep their `href`. One delegated click listener, added in `Router.init` on #router-view, calls `preventDefault()` and `leave(href)`. Without `Router.init` (unit tests), the plain `href` still works.

**6. EditCategoryView.** When `?id=` is given but the category does not exist, render the existing 'Category not found' page (`cat.notFound` + `common.goBack`, with `data-router-leave`) instead of the form. `attachEvents` returns early in that case, so `UPDATE_CATEGORY` and `DELETE_CATEGORY` can never be sent for a missing id.

**Why not the alternatives.**
- A plain `history.back()` after the dispatch re-renders the closed form, as described above.
- A plain replace leaves [History, History] for a form opened from History, so one Back press does nothing.
- Always calling `history.back()` would change where saves land (D-U9-4, second option).

**Sketch.**

```js
// src/router.js — init (42-55), inside `if (rv) { ... }` after line 51
      // 1.0.2 (BUG-87): close / not-found links marked data-router-leave leave
      // their screen without pushing an entry (the href stays as the fallback).
      rv.addEventListener('click', (e) => {
        const a = e.target && e.target.closest ? e.target.closest('a[data-router-leave]') : null;
        if (!a || e.defaultPrevented) return;
        e.preventDefault();
        this.leave(a.getAttribute('href'));
      });

// _back (102-105)
  _back(canGoBack) {
    if (canGoBack) {
      this._noOrigin = true; // 1.0.2 (BUG-87): an unstamped entry reached this way has an unknown origin
      window.history.back();
    } else this.navigate('#dashboard');
  },

// new members after _back (with _confirmDiscard from BUG-86)
  // ── 1.0.2 (BUG-87): leaving a screen ────────────────────────────────────
  // navigate() pushes, so the jump after a save/delete left the form's entry
  // under the landing screen and Back reopened it. Each fresh entry is stamped
  // with the hash it was pushed from (history.state = {stackdNav, from}); no
  // other code may write history.state.
  _curHash: null,
  _noOrigin: false,
  _norm(h) { return (!h || h === '#') ? '#dashboard' : h; },

  _entryState() {
    try {
      const st = window.history ? window.history.state : null;
      return st && st.stackdNav ? st : null;
    } catch (e) { return null; }
  },

  _stampEntry() {
    const unknown = this._noOrigin;
    this._noOrigin = false;
    try {
      const H = window.history;
      if (H && typeof H.replaceState === 'function' && !this._entryState()) {
        const from = unknown ? null : this._curHash;
        H.replaceState({ stackdNav: 1, from: typeof from === 'string' ? from : null }, '');
      }
    } catch (e) { /* unstamped: leave() replaces, which is always safe */ }
    this._curHash = window.location ? window.location.hash : null;
  },

  // Leave the current screen for `path` without keeping its entry. The entry
  // is rewritten in place and the route applied at once, so the save/delete
  // and the landing screen render in ONE coalesced pass (the closed form never
  // re-renders: no 'not found' frame, no live Save in between). When the entry
  // underneath already shows `path`, the now-identical entry is then dropped:
  // history.back() lands on the same URL (no hashchange, no second render).
  leave(path) {
    const H = window.history, L = window.location;
    if (!L || typeof path !== 'string') return;
    if (this._norm(L.hash) === this._norm(path)) return;                          // already there (double tap)
    if (!H || typeof H.replaceState !== 'function') { this.navigate(path); return; } // windows without the History API
    const st = this._entryState();
    if (st && st.left) return;                                                     // a step back is still landing
    const from = st ? st.from : null;
    const route = (h) => this._norm(h).split('?')[0];
    const under = from !== null && typeof H.back === 'function' &&
      (this._norm(from) === this._norm(path) ||
       (path.indexOf('?') === -1 && route(from) === this._norm(path)));            // D-U9-8: filtered History
    try {
      if (under) H.replaceState({ stackdNav: 1, from: null, left: 1 }, '', from || L.href.split('#')[0]);
      else H.replaceState({ stackdNav: 1, from }, '', path);
    } catch (e) {          // WebKit refuses >100 history calls in 30 s: replace the old way
      this._noOrigin = true;
      this._replaceHash(path);
      return;
    }
    this.handleRouteChange(); // render the landing screen in this same pass
    if (under) H.back();      // drop the duplicate entry: same URL, no hashchange
  },
  _replaceHash(path) {
    const L = window.location;
    if (L && typeof L.replace === 'function') L.replace(path); else this.navigate(path);
  },

// handleRouteChange (159-161)
  handleRouteChange() {
    this._formBaseline = null; // 1.0.1 (BUG-03): a new route starts clean
    this._stampEntry();        // 1.0.2 (BUG-87): record where this entry came from
    ...unchanged...

// src/views.js — top level, after clearFieldErrors (ends at 78)
// 1.0.2 (BUG-87): leave a form (save, delete, close) or a dead-end page
// without leaving its entry under the landing screen. Router stubs in unit
// tests predate leave().
function leaveTo(path) {
  const R = window.Router;
  if (!R) return;
  if (typeof R.leave === 'function') R.leave(path);
  else R.navigate(path);
}
// 2404 / 2445: window.Router.navigate('#transactions') → leaveTo('#transactions')
// 2742 / 2758: → leaveTo('#categories');  4298 / 4316: → leaveTo('#dashboard')
// 7030: back.addEventListener('click', () => leaveTo(backHref))
// 5320: if (!r.config) { leaveTo('#debt'); return; }
// 5395, 5401, 5416, 5457, 5481: window.Router.navigate('#debt') → leaveTo('#debt')
// add data-router-leave (href unchanged) to: 1496 (Go Back), 1598 (✕), 2569 (Go Back),
//   2644 (✕), 3983 (✕), 5186 ('Back to loans'), 5271 (results ✕), 7008 (✕)

// EditCategoryView.render, right after `const cat = ...` (2630):
      // 1.0.2 (BUG-87): an id that no longer exists (Back onto a deleted
      // category's editor, a stale link) is a dead end, never a blank editable
      // form whose Save silently does nothing.
      if (isEdit && !cat) return `
        <div class="container" style="padding-top: 40px; text-align: center;">
          <p class="text-secondary">${window.I18n.t('cat.notFound')}</p>
          <a href="#categories" data-router-leave class="btn btn-primary" style="display: inline-block; width: auto; padding: 8px 16px; margin-top: 16px;">${window.I18n.t('common.goBack')}</a>
        </div>`;
// EditCategoryView.attachEvents, after `const cat = ...` (2691):
      if (isEdit && !cat) return; // 1.0.2 (BUG-87): not-found page, nothing to bind
```

**Data repair.** None. History entries exist only for the session, and nothing is stored.

A form entry that 1.0.1 already left under a screen in a running session disappears at the next app start. Until then, the not-found Go Back leaves its entry instead of looping. A stale debt results entry now leaves for the hub instead of pushing it again.

The store is untouched. `UPDATE_CATEGORY` already ignored unknown ids, so no ghost category was ever created.

**Tests (each fails on the current code).**

- tests/unit/routerLeave.test.js (new). Router part:
- jsdom's own window (the androidBack.test.js pattern) with <main id="router-view">;
- Store stub: getState returns `state`, and dispatch is vi.fn((a, p) => { if (a === 'SET_VIEW') state.activeView = p; });
- load i18n, i18n/en, components, router;
- in beforeEach: history.replaceState(null, '', '#dashboard'), Router._curHash = null, and spy history.back as a no-op. The jsdom history is shared across the file.
- helper go(hash): location.hash = hash; Router.handleRouteChange(). This is a push plus the route change the hashchange listener would run; Router.init is not called here.
- (a) Every fresh entry is stamped with its origin: go('#transactions'); go('#edit?id=t1'); history.state matches {stackdNav:1, from:'#transactions'}. Current code: history.state is null.
- (b) Back branch. From (a), Router.leave('#transactions') does all of this synchronously:
- location.hash === '#transactions';
- Store.dispatch was called with ('SET_VIEW','transactions');
- history.back was called once;
- history.state.left === 1.
A second leave('#transactions') changes nothing: history.back is still at 1 call. Current code: Router.leave is undefined.
- (c) Replace branch. go('#category-detail?id=cat_groceries'); go('#edit?id=t1'); note history.length. Then leave('#transactions'):
- location.hash is '#transactions' and history.back is not called;
- history.length is unchanged;
- history.state matches {from:'#category-detail?id=cat_groceries'};
- SET_VIEW 'transactions' was dispatched.
Current code: no leave().
- (d) Filtered History origin. go('#transactions?account=a1'); go('#edit?id=t1'); leave('#transactions'):
- history.back is called once;
- location.hash === '#transactions?account=a1';
- UPDATE_FILTERS {page:'history', filters:{accounts:['a1']}, replace:true} was dispatched;
- _replaceHash is never called.
Current code: no leave().
- (e) Unknown origins replace.
1. Cold start: history.replaceState(null,'','#edit-category?id=x'); Router._curHash = null; handleRouteChange(). history.state.from is null. leave('#categories') does not call history.back, and the hash becomes '#categories'.
2. After Android Back: go('#transactions'); history.replaceState(null,'','#edit?id=t2') to make an unstamped entry; Router._back(true); handleRouteChange(). history.state.from is null. leave('#transactions') calls history.back no further: the only call is _back's.
Current code: no stamps and no leave().
- (f) A refused replaceState falls back. go('#transactions'); go('#edit?id=t1'); spy Router._replaceHash as a no-op; make history.replaceState throw once (mockImplementationOnce). Then leave('#transactions'): _replaceHash('#transactions') is called, history.back is not called, and Router._noOrigin is true. Current code: no leave().
- (g) Windows without a History API. In a separate describe, swap global.window for a plain object {location:{hash:'#debt-results?id=x'}} plus the Store stub, as loanLinkedPayments.test.js does, and executeFile('router.js'). Router.handleRouteChange() does not throw. Router.leave('#debt') sets location.hash to '#debt' and does not throw. Current code: leave is undefined.
- (h) A [data-router-leave] link leaves instead of pushing. Put this last: Router.init() leaves a hashchange listener on the shared jsdom window. Router.init(); #router-view holds <a id="x" href="#categories" data-router-leave><svg></svg></a>; spy Router.leave as a no-op. Clicking the <svg> calls leave('#categories'), the event is defaultPrevented, and history.length is unchanged. Current code: the anchor pushes.
- Views part, in the same file. Harness as formValidation.test.js: db, i18n, en, loan-engine, store, components, views. The Router stub is {getParams: () => params, navigate: vi.fn(), leave: vi.fn()}.
- (i) Transaction delete leaves to History: open an existing expense (params {id}), click #btn-delete-tx, then the sheet's Delete. Router.leave is called with '#transactions' and Router.navigate is not called. Current code calls navigate.
- (j) Transaction save leaves to History: a new expense with a category, click #btn-save-tx, and Router.leave('#transactions') is called. Current code calls navigate.
- (k) Edit Category for a missing id shows the not-found page. With params {id:'gone'}:
- EditCategoryView.render contains t('cat.notFound') and a[data-router-leave][href="#categories"];
- there is no #edit-cat-name and no #btn-save-category;
- attachEvents throws nothing and dispatches nothing.
Current code renders a blank editable form.
- (l) Category save and delete leave to Categories. ADD_CATEGORY {id:'cat_gym'}, params {id:'cat_gym'}. Save gives Router.leave('#categories'), and delete through the sheet gives Router.leave('#categories'). Current code calls navigate.
- (m) Account save and delete leave to Home. EditAccountView, new account with a name, click #btn-edit-acc-save: Router.leave('#dashboard'). For an existing account, delete through the sheet: Router.leave('#dashboard'). Current code calls navigate.
- (n) Dead-end and close links carry data-router-leave:
- AddTransactionView.render with params {id:'gone'} has a[data-router-leave][href="#transactions"];
- CategoryDetailView.render with params {id:'gone'} has a[data-router-leave][href="#categories"];
- the transaction, category and account forms' ✕ links carry the attribute.
Current code: plain pushing hrefs.
- (o) Pro lock card. Stub window.Pro = {canAddCategory: () => false, canAddAccount: () => false, FREE_ACCOUNT_LIMIT: 2}, since the harness loads no pro.js. EditCategoryView new mode (params {}) then renders the lock page: its ✕ carries data-router-leave, and clicking #pro-locked-back calls Router.leave('#categories'). Current code calls navigate.
- (p) Debt exits. A saved loan, params {id}: DebtResultsView ⋯ → Delete → #modal-delete-btn calls Router.leave('#debt'), and navigate is never called. With params {id:'gone'}, attachEvents calls Router.leave('#debt') and never navigate. The 'Back to loans' link and the results ✕ carry data-router-leave. Current code calls navigate.
- Integration part, in the same file, with the real Router and real Store and Views on jsdom's window (history.back spied as a no-op):
- (q) A delete from History renders History in the same pass. go('#transactions'); add an expense t; go('#edit?id=' + t.id). Render AddTransactionView into #router-view and call attachEvents. Flush the pending emits (await Promise.resolve()), then subscribe a spy listener. Click #btn-delete-tx, then #modal-delete-btn.
- Synchronously: Store.getState().activeView === 'transactions' and location.hash === '#transactions'.
- After await Promise.resolve(), the listener has run exactly once, with activeView 'transactions'. main.js would therefore render History; the form and 'Transaction not found.' never re-render.
- history.back was called once; clicking the old Delete and Delete again adds no call.
Current code: activeView stays 'edit', and the coalesced render redraws the form for the deleted id.
- (r) Loan delete with the real Router. go('#debt'); ADD_LOAN L; go('#debt-results?id=' + L). Render and attach DebtResultsView, and spy Router.navigate. ⋯ → Delete → #modal-delete-btn:
- activeView is 'debt', the hash is '#debt', history.back was called once, and navigate was never called.
Then a stale entry: history.replaceState({stackdNav:1, from:'#debt'}, '', '#debt-results?id=gone'); handleRouteChange(); render and attach DebtResultsView:
- history.back has been called twice in total, navigate never, and history.length never changed.
Current code pushes '#debt' each time.
- E2E tests/e2e/back_navigation.spec.js (the same new spec as BUG-86; written blind, verified after integration).
1. Add a €38.75 Groceries expense. Settings → Categories → Groceries → the row. Install a MutationObserver on #router-view that records whether its text ever contains 'Transaction not found.'. Delete Transaction → Delete. The URL ends #transactions. Router.handleBack({canGoBack:true}), then expect.poll until Store.getState().activeView === 'category-detail'. The observer never saw 'Transaction not found.'.
2. History → the row → Save Changes (no edit). Wait for !(history.state && history.state.left), then handleBack. activeView is not 'edit'.
3. History → the row → Delete → Delete, with the same observer. Wait for the left marker to clear, then handleBack. activeView is not 'edit', the hash does not start with '#edit', and the observer never saw 'Transaction not found.'.
4. With Pro unlocked (as pro_paywall.spec.js does): Settings → Categories → + → 'Gym' → Create → ⋮ Gym → Delete Category → Delete → handleBack. activeView is 'settings', no 'Edit Category' heading appears, and the category count equals the defaults.
5. Seed a loan with Store.dispatch('ADD_LOAN', ...). page.goto('/#settings'), then location.hash = '#debt', then tap the loan, ⋯ → Delete → Delete. The URL ends #debt. handleBack, then expect.poll until activeView === 'settings'; it is never 'debt-results'.

**Risks.** - **Pending traversal window.** After a step-back leave, `history.back()` is still in flight for a few milliseconds while the landing screen already shows. A navigation started inside that window could be undone by the traversal.
  - A human tap cannot land that fast, because the landing screen has to paint first. A Playwright action is sequenced through the browser process after the traversal request.
  - `leave()` ignores calls while the step is pending (`state.left`), and e2e can wait for the marker to clear.
- **Traversal events.** The step-back traversal fires popstate, which nothing in src/ listens to, and no hashchange (identical URL in Chromium and WebKit). An engine that did fire one would only re-route the same view (a same-view scroll reset).
- **Landing render timing.** The landing screen now renders in the same pass as the save, with no hashchange hop. Specs that waited for the URL to flip before the view (pro_paywall.spec.js:121-124) now get both together.
- **Web-only limits (Android has no Forward and a fresh WebView history per start):**
  - Forward after a step-back leave lands on an identical URL and shows nothing new.
  - Browser Back over history written by 1.0.1 (unstamped entries) can make a later leave land one screen off. It never loops.
- **Debt.** Saving or promoting a simulation that was reached from the simulator leaves the simulator's entry under the hub. Back from the hub returns to the (cleared) simulator form. It no longer returns to the results page with a live Save.
- **`history.replaceState` once per fresh route.** Nothing in src/ reads or writes `history.state` today, and the stamp does not change `history.length`. WebKit's rate limit is caught and falls back to replacing.
- **Unit-test coverage gap.** Unit tests whose Router stub lacks leave() (formValidation, categoryDuplicate, historySummary, modalButtons) exercise the navigate() fallback and stay green without covering leave(); the new tests cover it. Windows without a History API take the same fallback: loanLinkedPayments, loanSyncReview, debtView, reviewFixesMisc. CLAUDE.md's rule that views must not call Router's Back helpers holds: leave() is a navigation helper like navigate(), and the call is guarded.
- **BUG-34 (U7).** U7 wraps the transaction form's doDispatch (2298) in `Store.batch`. The `leaveTo` at 2404 therefore routes inside that batch: SET_VIEW is a nested scope and persists nothing (store.js:2168-2176). A rolled-back save still lands on History with the storage-full sheet, as D-U7-4 chooses. U7's note 'harmless because hashchange is async' should now read 'harmless because SET_VIEW persists nothing'.
- **Merge overlap with other units.** These are one-line hunks next to other units' regions; whichever unit lands second rebases one line:
  - transaction form: U2 (1499-1504, 1521-1522, 1590-1591, 1612-1617), U3 (2286-2401, last edit at 2400), U8 (2305-2365);
  - account form: U5 owns 4244-4320 (see dependencies).
- **Out of scope:**
  - forward pushes such as Category detail's '‹ Categories' (2593), the Tags drill-down (3314) and the loan menu's Edit (5453);
  - EditAccountView for a missing id still renders a blank New Account form. After this change it is reachable only through a stale link (follow-up candidate).

### U9 decisions

- **D-U9-1** BUG-55: how should unpaid expenses count in budgets?
  - Leave them out of spent until they are marked paid, with nothing extra shown (the app-wide rule; History has done this since 1.0.1 D4g)
  - Leave them out of spent and show a separate 'pending €X' line under each Goals row and in the Home widget (new key budget.pending in all five dictionaries, plus row and widget layout work)
  - Keep counting them as spent (contradicts CLAUDE.md's aggregate rule and the Paid toggle's 'Excluded until marked paid')
  - _Recommended:_ Leave unpaid expenses out of spent until they are marked paid, with no extra pending line — One store change fixes every surface. It matches balances, History, Analytics, Income vs expenses and the editor hint, and it keeps the Paid toggle's promise. A 'pending' line can follow later as a feature if users ask to see scheduled bills in budgets.
- **D-U9-2** BUG-55: with rows dated before an account opened excluded, what does a month before the account existed contribute to a cumulative rollover?
  - Follow the budget's own start month: such a month counts as €0 spent and carries its full allocation forward (the report's expected €40.00 of €300.00)
  - Start the rollover no earlier than the earliest opening date of the primary accounts
  - _Recommended:_ Follow the budget's own start month: a month before the account opened counts as €0 spent and carries its full allocation forward — Budgets have no account dimension, and the user chose the start month. This is what the report expects and needs no new logic. The other option would add a hidden rule tied to account dates.
- **D-U9-3** BUG-86: what should Android Back do on the Goals limit editor when a field was changed?
  - Ask 'Discard changes?' with the same sheet as the other forms, then close the editor back to the budget list and stay on Goals
  - Close back to the list silently, dropping the typed limit
  - Save the typed limit and close
  - _Recommended:_ Ask 'Discard changes?' with the same sheet as the other forms, then close the editor back to the budget list and stay on Goals; an untouched editor closes at once — It is consistent with the 1.0.1 dirty-form rule for the add, edit, account and category forms. An untouched editor closes with no prompt. The editor's own ← arrow stays an explicit discard, as the in-app close controls do.
- **D-U9-4** BUG-87: where should a save or delete land, and what may Back return to?
  - Keep today's landing screens (History, Categories, Home, the Debt hub) and never leave the form's entry behind: the entry is rewritten in place to the landing screen, and when the screen underneath already is that screen the duplicate entry is dropped
  - Always return to the screen the form was opened from (history.back()): a log opened from Category detail returns there, and a log added from Home returns to Home
  - Plain replace everywhere (simplest, but a log edited from History leaves two History entries, so the first Back after saving does nothing)
  - _Recommended:_ Keep today's landing screens and never leave the form's entry behind: rewrite it in place, and drop the duplicate when the screen underneath is the landing screen — It fixes Back without changing where users land after saving. e2e specs assert those landings, for example user_flow's 'Saving always routes to the history view'. Returning to the origin is a product change, and plain replace trades the reopened form for a dead Back press.
- **D-U9-5** BUG-87: should the forms' ✕ close links and the Pro lock card's ✕ and Go Back also leave without a history entry?
  - Yes: the log, category and account ✕ links and the Pro lock card's ✕ and Go Back use the same leaveTo / data-router-leave mechanism
  - No: only save and delete, plus the not-found pages (the report's literal scope)
  - _Recommended:_ Yes: the ✕ links on the log, category and account forms and the Pro lock card's ✕ and Go Back leave the same way — It is the same root cause: today, Back after ✕ reopens the form you just closed. It costs one attribute or one call per site, the ✕ stays an explicit discard, and pro_paywall.spec's URL assertions still hold (the landing now renders together with the URL).
- **D-U9-6** Ship the BUG-87 rider in 1.0.2?
  - Yes, in this unit (router.js is already open for BUG-86, and both fail criterion C-46)
  - Defer to 1.0.3
  - _Recommended:_ Yes, ship it in 1.0.2 within this unit — Back is the headline 1.0.1 flow. A 'Transaction not found' loop and a ghost category editor right after the most common actions undermine the BUG-86 fix. Each change is small and covered by tests (effort M). The main risk is one-line merge overlap with the units that own the forms.
- **D-U9-7** BUG-87: the Debt screens have the same cause; Back after deleting a loan can never get past that loan's results page. Fix them in this unit?
  - Include them in this unit: loan delete (5481) and the stale-id redirect (5320), the save and promote exits (5395, 5401, 5416, 5457), and data-router-leave on 'Back to loans' (5186) and the results ✕ (5271)
  - Only the Back trap: loan delete (5481) and the stale-id redirect (5320)
  - Defer to 1.0.3 as a recorded follow-up (the Back trap after deleting a loan would ship in 1.0.2)
  - _Recommended:_ Include all the Debt exits in this unit — Same cause, same helper, one line per site. The trap is worse than the reported loop. The save and promote exits today leave the results page under the hub with a live Save, because state.debtSim is never cleared, so Back then Save creates a duplicate simulation.
- **D-U9-8** BUG-87: a log saved from History that was opened filtered by an account (#transactions?account=x, e.g. from an account card): where does the save land?
  - Step back to that filtered History: the first Back after saving works. Any extra filters set on that screen reset to just the account, as on any Back onto that entry
  - Replace the form's entry with plain #transactions: the filters stay as they were, but the first Back after saving lands on the same filtered History and looks like it did nothing
  - _Recommended:_ Step back to the filtered History the form was opened from — This keeps D-U9-4's promise of no dead Back press in a very common flow (account card → row → Save). The only cost is the filter reset that Back onto that entry already does today.

### U9 regions owned

| File | Symbol | Lines | Change |
|---|---|---|---|
| src/store.js | Store._categoryMonthSpend (+ its v0.93 header comment) | 3177-3194 | BUG-55: skip isPaid === false, transferRef and _isTxBeforeOpeningDate rows in the index build; add a comment line. |
| src/store.js | Store.getCategoryMonthlyAverage header comment | 3239-3245 | BUG-55: comment only. Drop 'Unlike getBudgetForMonth's spent figure…'; the two figures now follow the same row rules. |
| src/router.js | Router.init | 42-55 (insert after 51, inside `if (rv)`) | BUG-87: delegated click listener on #router-view for a[data-router-leave]: preventDefault, then this.leave(href). |
| src/router.js | Router._back | 102-105 | BUG-87: set this._noOrigin before history.back(), so an unstamped entry reached by Back gets from:null. |
| src/router.js | new members after Router._back: _confirmDiscard, _curHash, _noOrigin, _norm, _entryState, _stampEntry, leave, _replaceHash | insert after 105 | BUG-86: the shared discard sheet. BUG-87: entry stamping and the synchronous leave(). |
| src/router.js | Router.handleBack | 107-157 | BUG-86: budget-editor step before the FORM_VIEWS check at 139 (returns 'step' or 'confirm'); the FORM_VIEWS confirm (139-152) goes through _confirmDiscard; chain comment (107-113) updated. |
| src/router.js | Router.handleRouteChange (first lines only) | 159-161 | BUG-87: call this._stampEntry() right after the baseline reset at 160. |
| src/views.js | new top-level function leaveTo(path) | insert after 78 (end of clearFieldErrors) | BUG-87: Router.leave, with a navigate() fallback for Router stubs. |
| src/views.js | AddTransactionView.render: not-found page and ✕ link | 1495-1497, 1598 | BUG-87: data-router-leave on Go Back (1496) and on the ✕ link (1598). |
| src/views.js | AddTransactionView.attachEvents: doDispatch tail and executeDelete | 2404, 2445 | BUG-87: Router.navigate('#transactions') becomes leaveTo('#transactions'). |
| src/views.js | CategoryDetailView.render not-found link | 2569 | BUG-87: data-router-leave. |
| src/views.js | EditCategoryView.render / attachEvents | 2626-2645, 2686-2692, 2742, 2758 | BUG-87: 'Category not found' page for a missing id (after 2630); early return in attachEvents (after 2691); data-router-leave on ✕ (2644); leaveTo('#categories') after save and delete. |
| src/views.js | BudgetView fields, attachEvents edit branch (back arrow), destroy + new closeEditor/isEditorDirty/_editorValues | 2770-2771, 3038-3048, 3230-3235 (+ new methods after 3235) | BUG-86: _editBaseline snapshot at attach, ← arrow through closeEditor, destroy clears editCategoryId and the baseline, dirty check (incl. badInput) for Router. Do NOT touch the save handler 3077-3110 or the renderEdit markup at 2993 (U2's BUG-50). |
| src/views.js | EditAccountView ✕ link, save and delete navigation | 3983, 4298, 4316 | BUG-87: data-router-leave on ✕; leaveTo('#dashboard') after save and delete. 4298/4316 sit inside U5's region and replace U5's Router.replace rider. |
| src/views.js | DebtResultsView: not-found 'Back to loans' link, results ✕, stale-id redirect, save/promote/delete exits | 5186, 5271, 5320, 5395, 5401, 5416, 5457, 5481 | BUG-87 (D-U9-7): data-router-leave on 5186 and 5271; leaveTo('#debt') at 5320, 5395, 5401, 5416, 5457 and 5481. 5453 (menu Edit → simulator) stays a push. |
| src/views.js | Views._proLockedPage ✕ / Views._attachProLocked back button | 7008, 7030 | BUG-87 (D-U9-5): data-router-leave on ✕; leaveTo(backHref) on Go Back. |
| tests/unit/budgetSpendExclusions.test.js | new file | new | BUG-55 tests (a)-(i). |
| tests/unit/budgetEditorBack.test.js | new file | new | BUG-86 tests (a)-(g). |
| tests/unit/routerLeave.test.js | new file | new | BUG-87 router (a)-(h), view-stub (i)-(p) and real-Router integration (q)-(r) tests. |
| tests/e2e/back_navigation.spec.js | new file | new | BUG-86 and BUG-87 end-to-end Back checks, incl. the 'never shows Transaction not found' observer and the Debt delete (written blind, verified after integration). |
| tests/unit/store.test.js | 'should save budget and compute spending' | 87-110 | BUG-55: give the account openingDate '2026-01-01' at line 88 (it currently opens on the real 'today', after its 2026-03-15 expense). |

**Dependencies.** There is no hard ordering dependency on other units. Overlaps the merge has to respect:

- **U2 (BUG-25/38/39/50).**
  - Owns views.js 1499-1504, 1521-1522, 1590-1591, 1612-1617, 2209-2223, 2243-2253, 2993, 3077-3096, 3959-3964 and 4261-4271, plus store.js 1155 and 1189. U9's hunks are separate lines: 1496, 1598, 2404, 2445, 2770-2771, 3038-3048, 3230-3235 and 4298/4316.
  - U2 makes #bdg-amount a text field rendered with its value in the markup, so U9's baseline, taken in attachEvents, is unaffected.
  - BUG-38 must keep all four local-date changes together: the New Log and New Account defaults and the store.js 1155/1189 fallbacks. Budgets now exclude pre-opening rows.
  - Optional: if BUG-25's opening-balance panel gets a 'go back' link, it can carry data-router-leave.
- **U3 (BUG-26/27/74).**
  - Its transaction-form edits end at views.js:2400, next to U9's 2404.
  - Its `_offerSeriesSync` region (5047-5151) is clear of U9's debt lines (5186+).
  - BUG-27 now also moves budget figures through BUG-55.
- **U4 (BUG-28/67/69).** U4 does not edit router.js; the draft's 'do not touch 182-187' note is dropped. It edits `case 'SET_VIEW'` in store.js (2168), which U9 does not touch. Because leave() routes through handleRouteChange → SET_VIEW, U4's day roll also runs on leave, which is the desired behaviour.
- **U5 (BUG-29/40/30 + account Back rider).**
  - U5 owns views.js 4244-4320. Its account-form Back rider (`Router.replace` at 4298/4316) is superseded by U9's leaveTo at the same two lines. U5 drops the rider; whoever lands second keeps leaveTo.
  - U5 adds Modal.show `dismissible` and appends to androidBack.test.js. U9's _confirmDiscard passes byte-identical options, and U9's tests are new files.
- **U7 (BUG-34/37/90).** U7 wraps doDispatch at views.js:2298 in Store.batch. U9's leaveTo at 2404 now routes synchronously inside that batch; SET_VIEW persists nothing, so D-U7-4's 'History, as today' still holds on a rolled-back save. U7's comment about hashchange being async should be reworded accordingly.
- **U8 (BUG-35/36/63).** Its transaction-form transfer edits (views.js 2263-2273, 2305-2365) are near 2404 but do not overlap it.
- **BUG-24 (escaping names)** may edit BudgetView or CategoryDetailView name output; U9 does not touch those lines.
- **Integrator:**
  - one `?v=` bump for store.js, router.js and views.js;
  - CLAUDE.md, 'Sheets, dialogs and Android Back':
    - the Goals limit editor is a step in the Back chain (returns 'step', view-owned dirty check);
    - forms and dead-end pages leave through `leaveTo` / `Router.leave` or `data-router-leave` after save, delete or close, never `navigate`;
    - `Router.leave` rewrites the entry in place and routes synchronously;
    - every history entry carries `history.state = {stackdNav, from}`, and nothing else may write history.state;
  - CLAUDE.md, 'State & data model': budget spend follows the aggregate rule and also skips transfer legs;
  - remove the 'deliberately stricter than getBudgetForMonth's spent figure' note at docs/refactor-plan-2.md:325;
  - 1.0.2 release notes: the budget-figure change (BUG-55 dataRepair).

**Existing tests affected.** **Existing tests that must change:**
- tests/unit/store.test.js, 'should save budget and compute spending' (87-110). ADD_ACCOUNT {openingBalance:1000} with no openingDate opens the account on the real 'today', so after BUG-55 its 2026-03-15 expense is pre-opening and spent becomes 0. Add openingDate: '2026-01-01'.

**Existing tests expected unchanged** (run them as guards):
- **androidBack.test.js** (jsdom window, no views.js). The budget step is inert. `_confirmDiscard` keeps the 'Discard changes?' title, labels, saveClass and the 'confirm' return. `_back` now also sets a flag. Its handleRouteChange test runs `_stampEntry`, which jsdom's replaceState supports. init() gains one click listener.
- **reviewFixesMisc.test.js.** Its window has `history: {back}` with no replaceState, so leave() takes the navigate() fallback and `_stampEntry` is a guarded no-op. Its `history.back` assertions are about handleBack, which is unchanged.
- **loanLinkedPayments.test.js (256-291), loanSyncReview.test.js (131-145), debtView, debtEngineErrors, loanSyncInPlace.** These load the real router.js into windows without `history`. The loan Delete, the save exits and the stale-id redirect now call leave(), which falls back to navigate(), so the mock location.hash ends as before.
- **budgetOverspendDisplay, homeWidgetsGoals, widgetsI18nGuard, fullRestore.** Their accounts open in 2020 or January 2026, before their expenses, and no budget test uses unpaid or transfer rows.
- **accountCurrency** ('budget spend index skips foreign-account expenses') and **budgetCsvRoundTrip.** Their accounts have openingBalance 0 and no openingDate, so they have no opening row and no opening date.
- **formValidation, categoryDuplicate, historySummary, modalButtons.** Their Router stubs lack leave(), so the views fall back to navigate(). The existing `navigate('#transactions'/'#categories')` assertions still pass, and historySummary's Tags drill-down (3314) is untouched.
- **categoryDuplicate** also renders EditCategoryView only for ids it created first.

**E2E to re-run after integration:**
- user_flow: `toHaveURL(/#transactions$/)` after each save holds in both branches (from Home: replace; from History: step back to '#transactions'). The budget row '$50.00 of $300.00' holds, because the account and the expense share today's date.
- pro_paywall: `#pro-locked-back` → `/#categories$/`. The categories screen now renders together with the URL, so its 'goto racing the hashchange task' comment no longer applies.
- debt_simulator (Track → #add → save lands on History, replace branch), home_widgets (budgets widget, account opened in 2020), wallet_account_filter and import_matching (filtered History deep links).

**New tests:**
- tests/unit/budgetSpendExclusions.test.js, budgetEditorBack.test.js and routerLeave.test.js;
- tests/e2e/back_navigation.spec.js.
