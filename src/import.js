// import.js - CSV Import Logic
window.StackdImport = {
  // v0.99: delimiter detection and the quoted-field row parser are shared
  // between parseCSV (Stack'd backups) and analyzeBankCSV (arbitrary bank
  // files) — extracted verbatim so both read a file identically.
  _detectDelimiter(headerLine) {
    // v0.99 review fix: a comma-delimited file whose QUOTED header cell
    // contains ';' used to be mis-detected as semicolon-delimited. Parse the
    // header with both candidates (quote-aware) and keep the one yielding
    // more columns; a tie keeps the historical includes(';') preference.
    const semi = this._parseRow(headerLine, ';').length;
    const comma = this._parseRow(headerLine, ',').length;
    if (semi !== comma) return semi > comma ? ';' : ',';
    return headerLine.includes(';') ? ';' : ',';
  },

  // Simple CSV parser for quoted fields
  _parseRow(rowStr, delimiter) {
    const result = [];
    let inQuotes = false;
    let currCol = '';
    for (let i = 0; i < rowStr.length; i++) {
      const char = rowStr[i];
      if (char === '"') {
        if (inQuotes && rowStr[i + 1] === '"') {
          currCol += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === delimiter && !inQuotes) {
        result.push(currCol.trim());
        currCol = '';
      } else {
        currCol += char;
      }
    }
    result.push(currCol.trim());
    return result;
  },

  // 1.0.2 (BUG-33): RFC 4180 records. A line break inside a quoted field is
  // part of the field (export.js _toRow writes one for a multi-line note), so
  // the file can no longer be split on every line break. A quote opens a
  // quoted field only at the start of a field, so a stray quote inside a value
  // ('5" screen') stays literal and line-local, as before. `""` is kept for
  // _parseRow, a CRLF inside a field becomes LF. null = a quote never closes.
  _splitRecords(text, delimiter) {
    const out = [];
    let cur = '';
    let inQ = false;
    let atStart = true;
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
      if (ch === delimiter) atStart = true;
      else if (ch !== ' ' && ch !== '\t') atStart = false;
    }
    if (inQ) return null; // never closed: not RFC 4180 (D8)
    out.push(cur.replace(/\r$/, ''));
    return out.filter(r => r.trim() !== '');
  },

  _physicalLines(text) {
    return String(text).split(/\r?\n/).filter(l => l.trim() !== '');
  },

  // 1.0.2 (BUG-33): { delimiter, records } for every CSV reader (backups, bank
  // CSVs, the header-only check and the bank-candidate check). A file that is
  // not RFC 4180 is never read worse than 1.0.1 did (D8):
  //  - a quote that never closes → the whole file line by line;
  //  - a record spanning 3+ physical lines whose INNER lines are complete rows
  //    on their own is a stray opening quote closed far below, not a note →
  //    that span line by line. A note's inner line never has a backup row's
  //    20+ fields;
  //  - (integrated review) a 2+-line record that does NOT parse to the
  //    header's width while one of its lines does on its own: a stray quote
  //    closed mid-field on the next line ('Shop "X" Milano') → line by line.
  //    A real multi-line note always parses to exactly the header's width.
  _readRecords(csvText) {
    const text = String(csvText == null ? '' : csvText).replace(/^\uFEFF/, '');
    const delimiter = this._detectDelimiter(this._physicalLines(text)[0] || '');
    const recs = this._splitRecords(text, delimiter);
    if (!recs) return { delimiter, records: this._physicalLines(text) }; // the 1.0.1 reading
    const width = recs.length ? this._parseRow(recs[0], delimiter).length : 0;
    const records = [];
    recs.forEach(r => {
      const parts = r.split('\n');
      const stray = width > 1 && parts.length > 1 && (
        (parts.length > 2 && parts.slice(1, -1).some(l => this._parseRow(l, delimiter).length >= width)) ||
        (this._parseRow(r, delimiter).length !== width && parts.some(l => this._parseRow(l, delimiter).length === width)));
      if (stray) parts.forEach(l => { if (l.trim() !== '') records.push(l); });
      else records.push(r);
    });
    return { delimiter, records };
  },

  // 1.0.2 (BUG-33, D12): the note field is a one-line input, so every import
  // writes notes on one line (a line break and the blanks around it → one space).
  _oneLine(s) {
    return String(s == null ? '' : s).replace(/[ \t]*[\r\n]+[ \t]*/g, ' ').trim();
  },

  parseCSV(csvText) {
    // 1.0.2 (BUG-33): RFC 4180 records, not physical lines.
    const { delimiter, records } = this._readRecords(csvText);
    if (records.length < 2) throw new Error("File is empty or missing headers");

    // v0.68: squash case, spaces and punctuation so 'Transfer Ref', 'transfer_ref'
    // and 'TransferRef' all land on the same key.
    const headers = this._parseRow(records[0], delimiter).map(h => h.toLowerCase().replace(/[^a-z0-9]/g, ''));
    const rows = records.slice(1).map(rec => {
      const values = this._parseRow(rec, delimiter);
      const row = {};
      headers.forEach((header, index) => {
        row[header] = values[index] !== undefined ? values[index] : '';
      });
      return row;
    });
    // 1.0.2 (BUG-31): the restore builders pick the file's decimal convention
    // with it (a ';' file is an EU spreadsheet). Non-enumerable, so a row
    // array still compares and spreads as before.
    Object.defineProperty(rows, 'delimiter', { value: delimiter });
    return rows;
  },

  VALID_FREQUENCIES: ['days', 'weeks', 'months', 'years'],

  // v0.68: every date comparison in the app is a raw string compare against ISO
  // (sorting, period filters, `t.date <= today` balance math), so nothing may
  // reach the store un-normalised. Accepts ISO plus the legacy DD-MM-YYYY that
  // exports before v0.68 wrote, with -, / or . separators.
  _normalizeDate(raw) {
    if (raw === null || raw === undefined) return null;
    const str = String(raw).trim().split(/[T ]/)[0];
    const m = str.match(/^(\d{1,4})[-/.](\d{1,2})[-/.](\d{1,4})$/);
    if (!m) return null;

    let y, mo, d;
    if (m[1].length === 4) {
      y = +m[1]; mo = +m[2]; d = +m[3];
    } else if (m[3].length === 4) {
      y = +m[3];
      const a = +m[1], b = +m[2];
      // Legacy Stack'd exports are DD-MM-YYYY, so day-first is the default
      // reading; only flip when the first field cannot possibly be a day.
      if (b > 12 && a <= 12) { mo = a; d = b; }
      else { d = a; mo = b; }
    } else {
      return null;
    }

    if (!y || mo < 1 || mo > 12 || d < 1 || d > 31) return null;
    return `${String(y).padStart(4, '0')}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  },

  // Store times are HH:MM:SS (see Store._getSystemTimeString) — a bare HH:MM
  // sorts before HH:MM:SS on the same minute, so pad it out.
  _normalizeTime(raw) {
    if (!raw) return null;
    const m = String(raw).trim().match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
    if (!m) return null;
    if (+m[1] > 23 || +m[2] > 59 || (m[3] && +m[3] > 59)) return null;
    return `${String(+m[1]).padStart(2, '0')}:${m[2]}:${m[3] || '00'}`;
  },

  _parseBool(raw) {
    if (raw === null || raw === undefined || String(raw).trim() === '') return null;
    const v = String(raw).trim().toLowerCase();
    if (v === 'false' || v === '0' || v === 'no' || v === 'n') return false;
    if (v === 'true' || v === '1' || v === 'yes' || v === 'y') return true;
    return null;
  },

  _parseTags(raw) {
    if (!raw) return [];
    return String(raw).split(/[|,]/).map(t => t.trim().toLowerCase()).filter(Boolean);
  },

  // Rebuilds the recurrence descriptor from the flattened CSV columns. seriesId
  // is kept verbatim here and re-keyed later (see buildTransactions).
  _buildRecurrence(row, txDate) {
    const seriesId = String(row['seriesid'] || '').trim();
    const frequency = String(row['frequency'] || '').trim().toLowerCase();
    if (!seriesId && !frequency) return null;
    if (this.VALID_FREQUENCIES.indexOf(frequency) === -1) return null;

    const endDate = this._normalizeDate(row['enddate']);
    const interval = parseInt(row['interval'], 10);
    const recurrence = {
      seriesId: seriesId,
      interval: (!isNaN(interval) && interval > 0) ? interval : 1,
      frequency: frequency,
      startDate: this._normalizeDate(row['startdate']) || txDate,
      endDate: endDate
    };

    // An armed generator with no endDate can never satisfy the
    // `nextDate <= endDate` guard, so don't arm it at all.
    const nextDate = this._normalizeDate(row['nextdate']);
    if (nextDate && endDate) recurrence.nextDate = nextDate;
    if (this._parseBool(row['propagatetags']) === false) recurrence.propagateTags = false;
    return recurrence;
  },

  // v0.68: split out of importTransactions so the mapping — date normalisation,
  // transfer re-pairing, series re-linking — is testable without a FileReader.
  // 1.0.2 (BUG-30/31/32/33/78): the restore path. Each non-opening row is
  // checked BEFORE anything is created — its id, a series this install holds,
  // its bank key (rebased through this import), then a content fingerprint —
  // and only a row that is none of those creates its account and category.
  buildTransactions(rows) {
    const stats = {
      importedCount: 0, newAccounts: 0, newCategories: 0, skippedCount: 0, skipped: {},
      duplicateCount: 0, ambiguousRows: 0, ambiguousAccounts: []
    };
    const skip = (reason) => {
      stats.skippedCount++;
      stats.skipped[reason] = (stats.skipped[reason] || 0) + 1;
    };
    const OWNED = 'opening balance rows are owned by the account';
    const txs = [];
    // v1.19 (A-17): accounts this import created, and so may give an opening
    // balance to. Anything not in here existed before and keeps its own.
    const createdHere = new Set();
    const Store = window.Store;
    const st0 = Store.getState();

    // 1.0.2 (BUG-30, D10): Id/AccountId are trusted only in a Stack'd export
    // (a migration file's 'ID' column numbered from 1 is not an account or row
    // id), and every id cell goes through Store.fileId (BUG-24).
    const trusted = this._isStackdTxFile(rows);
    const idCell = (row, k) => (trusted ? (Store.fileId(row[k]) || '') : '');
    const fileAccIds = new Set(rows.map(r => idCell(r, 'accountid')).filter(Boolean));
    const resolve = this._restoreAccountResolver(fileAccIds);
    const before = st0.accounts.slice(); // accounts that existed before this import
    const obNth = {};
    // 1.0.2 (BUG-32): each file account's name/currency, for _restoredKey.
    const fileAcc = new Map();
    rows.forEach(r => {
      const id = idCell(r, 'accountid');
      if (id && !fileAcc.has(id)) {
        fileAcc.set(id, { name: String(r['account'] || '').trim(), ccy: this._currencyCode(r['accountcurrency']) });
      }
    });
    // 1.0.2 (BUG-31): one decimal convention for the whole file.
    const decimal = this._restoreDecimal(rows, ['amount']);
    // 1.0.2 (BUG-78): what this install already holds. Read from state, not
    // the memoized _importKeyIdx (a caller that replaced the slice leaves it stale).
    const fileTxIds = new Set(rows.map(r => idCell(r, 'id')).filter(Boolean));
    const storeIds = new Set(st0.transactions.map(t => t.id));
    // Per bank key: whether a store row holding it belongs to a series or a
    // transfer (D11 ownership follows the matched row, see dup() below).
    const keyOwn = new Map();
    st0.transactions.forEach(t => {
      if (!t.importKey) return;
      const o = keyOwn.get(t.importKey) || { series: false, transfer: false };
      if (t.recurrence && t.recurrence.seriesId) o.series = true;
      if (t.transferRef) o.transfer = true;
      keyOwn.set(t.importKey, o);
    });
    const heldSeries = new Set(st0.transactions.map(t => t.recurrence && t.recurrence.seriesId).filter(Boolean));
    const pool = this._fingerprintPool(st0.transactions, fileTxIds);
    const seenIds = new Set();
    const matchedSeries = new Set();
    const dupRefs = new Set();
    const legacy = [];
    // Side effects wait until ownership is known (D11 can drop a row only
    // after a LATER row of its series or transfer was recognised): categories
    // are created after the ownership pass, and an account created for a row
    // that pass drops goes again unless the file's opening balance uses it.
    const pendingCat = new Map(); // built tx -> category name
    const rowCreated = new Set(); // accounts created by step (f)
    const opened = new Set();     // accounts this import created that got the file's opening balance

    rows.forEach(row => {
      const rawDate = row['date'];
      const amountStr = row['amount'];
      const accountName = String(row['account'] || '').trim();
      // Transfer legs are stored with an empty categoryId — don't invent an
      // "Uncategorized" category for them on the way back in.
      // 1.0.2 (live-U6-N1): nor for any other row. An empty cell is how the
      // export writes categoryId '' (a bank row left at 'Choose category'), so
      // the row comes back uncategorised instead of in a new user category.
      const categoryName = String(row['category'] || '').trim();
      const note = this._oneLine(row['note'] || row['comment'] || ''); // 1.0.2 (BUG-33, D12)
      let type = String(row['type'] || 'expense').trim().toLowerCase();

      if (!rawDate || !amountStr || !accountName) { skip('missing date, amount or account'); return; }

      const date = this._normalizeDate(rawDate);
      if (!date) { skip('unrecognised date format'); return; }

      // 1.0.2 (BUG-31): the whole cell or nothing, in the file's convention.
      // Signed on purpose: an opening balance can be negative (a card can
      // open in debt); every other row stores the absolute value.
      const signed = this._parseRestoreAmount(amountStr, decimal);
      if (signed === null || isNaN(signed)) { skip('invalid amount'); return; }
      const amount = Math.abs(signed);

      // v0.68: 'transfer' is not a type in this data model — a real transfer is a
      // paired expense/income sharing a transferRef. A single row can only name
      // one account, so importing it would create a phantom one-sided expense
      // that quietly shifts the balance. Reject it instead.
      if (type === 'transfer') {
        skip("type 'transfer' needs two paired rows sharing a TransferRef");
        return;
      }
      // v1.19 (A-17): the currency of the row's account, when the file has it
      // (older backups do not), so an account re-created here keeps its own
      // currency instead of silently taking the new phone's primary one.
      const accountCurrency = this._currencyCode(row['accountcurrency']);
      const csvId = idCell(row, 'id');
      const csvAccId = idCell(row, 'accountid');
      const sid = String(row['seriesid'] || '').trim();
      const ref = String(row['transferref'] || '').trim();
      const nk = accountName.toLowerCase();
      const trimName = (a) => String(a.name == null ? '' : a.name).trim();
      const sameName = (a) => trimName(a).toLowerCase() === nk && (!accountCurrency || a.currency === accountCurrency);
      const preNamed = before.filter(sameName);
      // 1.0.2 (BUG-30, E8a): an account THIS import created answers only to its
      // exact spelling (the file is internally consistent), so 'Revolut' and
      // 'revolut', or 'Cash' and ' cash ', stay two accounts in either order.
      const legacyCands = () => Store.getState().accounts
        .filter(a => sameName(a) && (!createdHere.has(a.id) || trimName(a) === accountName));
      // Creation always passes an explicit id (the file's, when trusted) and
      // re-reads the account by that id, never by name.
      const create = (fields) => {
        const id = csvAccId || window.StackdDB.generateId();
        Store.dispatch('ADD_ACCOUNT', Object.assign({ id, name: accountName },
          accountCurrency ? { currency: accountCurrency } : {}, fields));
        if (csvAccId) resolve.claim(csvAccId, id, false);
        createdHere.add(id);
        return Store.getState().accounts.find(a => a.id === id) || null;
      };

      // v1.19 (A-17): an opening balance belongs to its account: restored onto
      // an account THIS import created, skipped for one that existed before.
      // 1.0.2 (BUG-30, D13): it never creates a second account for a name this
      // install already had (a 1.0.1-merged 'Visa' would have gained the other
      // card's opening balance), and the k-th same-spelt opening balance of a
      // legacy file goes to the k-th account this import created, so two
      // openings never fold into one.
      if (type === 'opening_balance') {
        let acc = null;
        if (csvAccId) acc = resolve.find(csvAccId, csvAccId, accountName, accountCurrency).acc;
        else {
          const c = legacyCands();
          if (c.some(a => !createdHere.has(a.id))) { skip(OWNED); return; }
          const k = accountName + '|' + (accountCurrency || '');
          obNth[k] = (obNth[k] || 0) + 1;
          acc = c[obNth[k] - 1] || null; // the k-th opening never overwrites the first
        }
        if (acc && createdHere.has(acc.id)) {
          Store.dispatch('UPDATE_ACCOUNT', { id: acc.id, openingBalance: signed, openingDate: date });
          opened.add(acc.id);
          return;
        }
        if (acc || preNamed.length) { skip(OWNED); return; }
        if (create({ openingBalance: signed, openingDate: date })) stats.newAccounts++;
        return;
      }
      if (type !== 'expense' && type !== 'income') type = 'expense';

      // 1.0.2 (BUG-78): every duplicate is counted, and records its series and
      // transfer as owned here (D11) so the rest of them is not re-added — but
      // only when what it matched holds one: an id or a series held here does;
      // a store row matched by bank key or fingerprint does only if IT belongs
      // to a series / a transfer. A plain local row (a statement row, a hand-
      // typed 'Rent') stands in for that one file row, never for the rest of
      // the backup's series or the other leg of its transfer.
      const dup = (ownSeries, ownTransfer) => {
        stats.duplicateCount++;
        if (sid && ownSeries) matchedSeries.add(sid);
        if (ref && ownTransfer) dupRefs.add(ref);
      };
      // (a) D1: this very row is here (the local version wins).
      if (csvId && storeIds.has(csvId)) { dup(true, true); return; }
      // (b) D11: this series is owned here (a schedule edit, a loan sync or a
      // conversion replaced members under the same series id).
      if (sid && (heldSeries.has(sid) || heldSeries.has(Store.fileId(sid)))) { dup(true, true); return; }

      // (c) Placement, without creating anything yet (BUG-30).
      let account = null;
      let byId = false;
      let hinted = false;
      let guess = false;
      const key0 = String(row['importkey'] || '').trim();
      if (csvAccId) {
        ({ acc: account, byId } = resolve.find(csvAccId, csvAccId, accountName, accountCurrency));
      } else {
        // D4: the account inside its ImportKey, then the exact spelling, then
        // the first same-named (same-currency) account.
        const c = legacyCands();
        const seg = (/^(?:ref|fp):([^|]*)\|/.exec(key0) || [])[1];
        account = (seg && c.find(a => a.id === seg)) || null;
        hinted = !!account;
        if (!account) {
          const exact = c.filter(a => trimName(a) === accountName);
          const pick = exact.length ? exact : c;
          account = pick[0] || null;
          guess = pick.length > 1;
        }
      }

      // (d) The bank key, rebased through this import (BUG-32). The store row
      // holding it leaves the fingerprint pool.
      let key = key0
        ? this._restoredKey(key0, { resolve, fileAcc, landingId: account ? account.id : (csvAccId || null) })
        : '';
      if (key && keyOwn.has(key)) {
        this._dropFromPool(pool, key);
        const o = keyOwn.get(key);
        dup(o.series, o.transfer);
        return;
      }

      // (e) Fingerprint (D2): a row Stack'd holds under another id. Only the
      // account matched by id; otherwise also every same-named, same-currency
      // account that existed before the import.
      const fpAccs = byId ? [account.id]
        : [...new Set([account && account.id].concat(preNamed.map(a => a.id)).filter(Boolean))];
      const hit = this._takeFingerprint(pool, fpAccs, { date, time: row['time'], type, amount, note });
      if (hit) { dup(hit.series, hit.transfer); return; }
      // 1.0.2 (BUG-78 x BUG-14): the leg left behind when the other account was deleted.
      const left = ref ? this._takeOrphanLeg(pool, fpAccs, { date, time: row['time'], type, amount }) : null;
      if (left) { dup(left.series, true); return; }

      // (f) A new row: only now is its account created (and taken back below
      // if the ownership pass drops the row); its category after that pass.
      if (!account) {
        account = create({ openingBalance: 0 });
        rowCreated.add(account.id);
        stats.newAccounts++;
      }
      if (key0 && !key) key = Store.rebaseImportKey(key0, account.id); // its account exists only now

      const tx = {
        type: type,
        amount: amount,
        accountId: account.id,
        categoryId: '', // resolved after the ownership pass
        date: date,
        comment: note
      };
      if (categoryName) pendingCat.set(tx, categoryName);
      // 1.0.2 (BUG-78): the backup's own id is kept, so a second import of
      // the same file recognises it. A repeat inside one file (a ledger that
      // already held two copies) is imported under a fresh id (N8).
      if (csvId && !seenIds.has(csvId)) { tx.id = csvId; seenIds.add(csvId); }

      const time = this._normalizeTime(row['time']);
      if (time) tx.time = time;

      const tags = this._parseTags(row['tags']);
      if (tags.length) tx.tags = tags;

      if (this._parseBool(row['ispaid']) === false) tx.isPaid = false;

      if (ref) tx._csvTransferRef = ref;

      // v0.99: a backup of bank-imported rows carries their dedup identity, so
      // a later bank re-import still recognises them. 1.0.2 (BUG-32): its
      // account segment follows the account the row was restored onto.
      if (key) tx.importKey = key;
      const bankRef = String(row['bankref'] || '').trim();
      if (bankRef) tx.bankRef = bankRef;

      const recurrence = this._buildRecurrence(row, date);
      if (recurrence) tx.recurrence = recurrence;

      if (!csvAccId) legacy.push({ tx, name: accountName, ccy: accountCurrency, hinted, guess });
      txs.push(tx);
      stats.importedCount++;
    });

    // 1.0.2 (BUG-78, D11): a series one of whose rows is already here, and the
    // other leg of a transfer one of whose legs is already here, are owned
    // here: their missing rows count as duplicates and are not re-added (one
    // pass — the legs of a recurring transfer share a series).
    const out = txs.filter(t => {
      const owned = (t.recurrence && t.recurrence.seriesId && matchedSeries.has(t.recurrence.seriesId))
        || (t._csvTransferRef && dupRefs.has(t._csvTransferRef));
      if (owned) { stats.duplicateCount++; stats.importedCount--; }
      return !owned;
    });

    // 1.0.2 (BUG-78): an account created only for rows that pass dropped (no
    // kept row lands on it, no opening balance of the file restored it) was a
    // side effect of duplicates — it goes again. Created a moment ago, it
    // holds no rows of its own.
    const used = new Set(out.map(t => t.accountId));
    rowCreated.forEach(accId => {
      if (used.has(accId) || opened.has(accId)) return;
      Store.dispatch('DELETE_ACCOUNT', { id: accId });
      createdHere.delete(accId);
      stats.newAccounts--;
    });

    // Categories, for kept rows only. Icons are Lucide *names* rendered as
    // `<i data-lucide="...">`, so a literal emoji here rendered as a blank box.
    out.forEach(tx => {
      const categoryName = pendingCat.get(tx);
      if (!categoryName) return;
      const byName = () => Store.getState().categories.find(c => c.name.toLowerCase() === categoryName.toLowerCase());
      let category = byName();
      if (!category) {
        Store.dispatch('ADD_CATEGORY', { name: categoryName, icon: 'pin', typeHint: 'both' });
        category = byName();
        stats.newCategories++;
      }
      tx.categoryId = category ? category.id : '';
    });

    // 1.0.2 (BUG-30, N12): an imported legacy row that was not placed by its
    // ImportKey and either was a guess or names a spelling more than one
    // account here shares is reported.
    const kept = new Set(out);
    const names = new Set();
    const accs = Store.getState().accounts;
    legacy.forEach(r => {
      if (!kept.has(r.tx) || r.hinted) return;
      const same = accs.filter(a => String(a.name == null ? '' : a.name).trim() === r.name
        && (!r.ccy || a.currency === r.ccy)).length;
      if (r.guess || same > 1) { stats.ambiguousRows++; names.add(r.name); }
    });
    stats.ambiguousAccounts = [...names];

    this._relinkTransfers(out);
    this._relinkSeries(out);

    return { transactions: out, stats: stats };
  },

  // 1.0.2 (BUG-78): rows Stack'd already holds under another id — old
  // backups, spreadsheet rows, installs restored before 1.0.2. Whitespace-
  // collapsed note, ISO date, cents; each pool entry keeps its own time so a
  // time-less row on either side matches any time.
  _fpBase(date, type, amount, note) {
    return [this._normalizeDate(date) || '', type, Math.round(Math.abs(Number(amount)) * 100),
      String(note == null ? '' : note).replace(/\s+/g, ' ').trim()].join('|');
  },

  // A multiset: each store row absorbs ONE file row, so genuine twins survive.
  // Opening balances (owned by the account) and store rows whose id the file
  // names (matched by id instead) are left out -- except that an opening
  // balance is also listed under its 1.0.1 'Adjustment' form (integrated
  // review): the BUG-25 boot heal turns that income/expense row back into an
  // opening balance under the same id, and a pre-1.0.2 file (no Id) still
  // holds it as the income/expense row. 'orphans' lists, by account|date|
  // type|cents with no note, the plain legs DELETE_ACCOUNT left behind
  // (BUG-14: no transferRef, no category, a note with the deleted account's
  // name appended). An entry taken through one list is 'taken' in both.
  _fingerprintPool(storeTxs, excludeIds) {
    const lists = new Map();
    const byKey = new Map();
    const orphans = new Map();
    const push = (map, k, e) => { if (!map.has(k)) map.set(k, []); map.get(k).push(e); };
    storeTxs.forEach(t => {
      if (excludeIds.has(t.id)) return;
      const e = { time: this._normalizeTime(t.time) || '',
        series: !!(t.recurrence && t.recurrence.seriesId), transfer: !!t.transferRef };
      if (t.type === 'opening_balance') { // 1.0.2 (BUG-25 x BUG-78)
        const adj = Number(t.amount) < 0 ? 'expense' : 'income';
        push(lists, t.accountId + '|' + this._fpBase(t.date, adj, t.amount, t.comment), e);
        return;
      }
      const k = t.accountId + '|' + this._fpBase(t.date, t.type, t.amount, t.comment);
      // series / transfer: whether the matched row owns the file row's (D11).
      push(lists, k, e);
      if (t.importKey) byKey.set(t.importKey, { k, e });
      if (!t.transferRef && !t.categoryId && (t.type === 'income' || t.type === 'expense')) {
        push(orphans, t.accountId + '|' + this._fpBase(t.date, t.type, t.amount, ''), e);
      }
    });
    return { lists, byKey, orphans };
  },

  _takeFingerprint(pool, accountIds, r) {
    const base = this._fpBase(r.date, r.type, r.amount, r.note);
    const time = this._normalizeTime(r.time) || '';
    for (const id of accountIds) {
      const list = pool.lists.get(id + '|' + base);
      const i = list ? list.findIndex(e => !e.taken && (!time || !e.time || e.time === time)) : -1;
      if (i !== -1) { const e = list.splice(i, 1)[0]; e.taken = true; return e; } // the pool entry it matched
    }
    return null;
  },

  // 1.0.2 (BUG-78 x BUG-14, integrated review): a transfer leg of a pre-1.0.2
  // file whose counterpart account was deleted here. Its surviving leg lost
  // the transferRef and gained a "Transfer to deleted account" note, so the
  // fingerprint (which holds the note) misses it; match the leftover shape
  // instead (same account, date, type and cents; note ignored).
  _takeOrphanLeg(pool, accountIds, r) {
    const base = this._fpBase(r.date, r.type, r.amount, '');
    const time = this._normalizeTime(r.time) || '';
    for (const id of accountIds) {
      const list = pool.orphans.get(id + '|' + base);
      const i = list ? list.findIndex(e => !e.taken && (!time || !e.time || e.time === time)) : -1;
      if (i !== -1) { const e = list.splice(i, 1)[0]; e.taken = true; return e; }
    }
    return null;
  },

  _dropFromPool(pool, key) {
    const hit = pool.byKey.get(key);
    if (!hit) return;
    const list = pool.lists.get(hit.k);
    const i = list ? list.indexOf(hit.e) : -1;
    if (i !== -1) list.splice(i, 1);
    hit.e.taken = true;
    pool.byKey.delete(key);
  },

  // 1.0.2 (BUG-32): statement keys embed the account they were imported into
  // ('ref:<accountId>|…'). Map a restored key's account through THIS import:
  // a file account → what it resolves to here (itself when ids are kept, the
  // merge target under D9, or the file id it is about to be created under);
  // a live account → unchanged (a row the user moved keeps its key, D7);
  // anything else → the account the row lands on. null = that account does
  // not exist yet (the caller stamps the key once it is created).
  _restoredKey(key, ctx) {
    const m = /^(?:ref|fp):([^|]*)\|/.exec(key);
    if (!m) return key;
    const seg = m[1];
    const Store = window.Store;
    const fileSeg = ctx.fileAcc.has(seg) ? seg : (Store.fileId(seg) || '');
    let to;
    if (fileSeg && ctx.fileAcc.has(fileSeg)) {
      const fa = ctx.fileAcc.get(fileSeg);
      const { acc } = ctx.resolve.find(fileSeg, fileSeg, fa.name, fa.ccy);
      to = acc ? acc.id : fileSeg;
    } else if (Store.getState().accounts.some(a => a.id === seg)) {
      to = seg;
    } else {
      to = ctx.landingId;
    }
    return to ? Store.rebaseImportKey(key, to) : null;
  },

  // v0.68: re-key the CSV's transferRef onto a fresh id. Re-importing the same
  // file must not merge into (or collide with) an existing local pair.
  _relinkTransfers(txs) {
    const counts = {};
    txs.forEach(t => {
      if (t._csvTransferRef) counts[t._csvTransferRef] = (counts[t._csvTransferRef] || 0) + 1;
    });
    const refMap = {};
    txs.forEach(t => {
      const csvRef = t._csvTransferRef;
      delete t._csvTransferRef;
      // An unpaired leg is not a transfer. Keeping the ref would hide it from
      // Analytics forever — store.js drops anything carrying a transferRef.
      if (!csvRef || counts[csvRef] < 2) return;
      if (!refMap[csvRef]) refMap[csvRef] = window.StackdDB.generateId();
      t.transferRef = refMap[csvRef];
    });
  },

  // v0.68: re-key seriesId, then enforce the one-armed-tail invariant (see the
  // recurrence notes in CLAUDE.md) — two armed members of the same series
  // double the chain on every processing pass.
  // 1.0.1 (BUG-02): the CSV's own series id is KEPT unless a series already in
  // this install uses it; only a collision (e.g. re-importing into the same
  // install) or a row without a SeriesId gets a fresh id. Re-keying every
  // series broke the loans file's LinkedSeriesId on every restore, so a
  // restored loan came back untracked. Keeping the id makes the link resolve
  // whichever of the two files is imported first.
  _relinkSeries(txs) {
    const taken = new Set();
    window.Store.getState().transactions.forEach(t => {
      if (t.recurrence && t.recurrence.seriesId) taken.add(t.recurrence.seriesId);
    });
    const seriesMap = {};
    txs.forEach((t, i) => {
      if (!t.recurrence) return;
      const csvId = t.recurrence.seriesId;
      const key = csvId || `__row${i}`;
      if (!seriesMap[key]) {
        // 1.0.2 (BUG-24): an id read from a file goes through Store.fileId (a
        // safe id is kept, anything else maps to a stable safe one); rows
        // still group by the original cell.
        const fid = window.Store.fileId(csvId);
        seriesMap[key] = (fid && !taken.has(fid)) ? fid : window.StackdDB.generateId();
      }
      t.recurrence.seriesId = seriesMap[key];
    });

    const bySeries = {};
    txs.forEach(t => {
      if (!t.recurrence) return;
      const sid = t.recurrence.seriesId;
      (bySeries[sid] = bySeries[sid] || []).push(t);
    });

    Object.keys(bySeries).forEach(sid => {
      const armed = bySeries[sid].filter(t => t.recurrence.nextDate);
      if (armed.length <= 1) return;
      // Keep the latest member armed; on a tie prefer the expense leg, which is
      // the only side of a recurring transfer that is ever the generator.
      armed.sort((a, b) => (a.date === b.date)
        ? (a.type === 'expense' ? 1 : 0) - (b.type === 'expense' ? 1 : 0)
        : a.date.localeCompare(b.date));
      armed.slice(0, -1).forEach(t => { delete t.recurrence.nextDate; });
    });
  },

  // v0.71 ── loans ──────────────────────────────────────────────────────────
  // A loans CSV is recognised by its Config/Principal columns, so one "Import
  // CSV" button can accept either file. `Config` (the exported JSON) wins when
  // present; the flat columns are the fallback for a hand-written sheet.
  isLoanRows(rows) {
    if (!rows || !rows.length) return false;
    const r = rows[0];
    return Object.prototype.hasOwnProperty.call(r, 'config')
      || (Object.prototype.hasOwnProperty.call(r, 'principal')
        && Object.prototype.hasOwnProperty.call(r, 'firstpaymentdate'));
  },

  // 1.0.2 (BUG-31): a restore file has ONE decimal convention. The app writes
  // dot decimals with ','; an EU spreadsheet re-saves with ';', '1.850,00' and
  // '12,50 €'. parseFloat read '12,50' as 12 and '1.850,00' as 1.85, and a
  // truncated prefix is never NaN, so the cents vanished silently.
  // _restoreAmountText: every space flavour, apostrophe groups, € $ £ ¥ and
  // U+FFFD (what a cp1252 '€' becomes when the file is read as UTF-8) go;
  // U+2212 becomes '-'.
  _restoreAmountText(raw) {
    return String(raw == null ? '' : raw).trim()
      .replace(/[\s\u00A0\u2009\u202F'\u2019€$£¥\uFFFD]/g, '')
      .replace(/\u2212/g, '-');
  },

  // 'comma' | 'dot' for the given columns of a whole file: a cell ending in a
  // separator plus 1–2 or 4+ digits is evidence for it; the majority wins; a
  // tie (all integers, or only an ambiguous '1.850') follows the delimiter —
  // ';' is an EU spreadsheet, ',' is the app's own export (JS numbers).
  _restoreDecimal(rows, keys) {
    let comma = 0;
    let dot = 0;
    rows.forEach(r => keys.forEach(k => {
      const s = this._restoreAmountText(r[k]).replace(/%$/, '').replace(/^[+-]/, '');
      if (/,\d{1,2}$/.test(s) || /,\d{4,}$/.test(s)) comma++;
      else if (/\.\d{1,2}$/.test(s) || /\.\d{4,}$/.test(s)) dot++;
    }));
    if (comma !== dot) return comma > dot ? 'comma' : 'dot';
    return rows.delimiter === ';' ? 'comma' : 'dot';
  },

  // The whole cell or nothing: null = empty, NaN = not ONE number in that
  // convention ('12abc', '1,2,3', '54.3' in a decimal-comma file).
  _parseRestoreAmount(raw, decimal) {
    if (String(raw == null ? '' : raw).trim() === '') return null;
    const s = this._restoreAmountText(raw);
    // An empty integer part ('.5', '-.75') or a bare trailing separator
    // ('12.') is still one number, as parseFloat read it in 1.0.1.
    const re = decimal === 'comma'
      ? /^[+-]?(?:\d{1,3}(?:\.\d{3})+|\d+)?(?:,\d*)?$/
      : /^[+-]?(?:\d{1,3}(?:,\d{3})+|\d+)?(?:\.\d*)?$/;
    if (!re.test(s) || !/\d/.test(s)) return NaN;
    return Number(decimal === 'comma' ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, ''));
  },

  // 1.0.2 (BUG-31): null = empty, NaN = unreadable (was: parseFloat, so a
  // truncated prefix passed as a number).
  _num(raw, decimal) {
    return this._parseRestoreAmount(raw, decimal || 'dot');
  },

  buildLoans(rows) {
    const stats = { importedCount: 0, skippedCount: 0, skipped: {} };
    const skip = (reason) => {
      stats.skippedCount++;
      stats.skipped[reason] = (stats.skipped[reason] || 0) + 1;
    };
    const loans = [];
    // 1.0.2 (BUG-31): one decimal convention for the flat columns of the file.
    const decimal = this._restoreDecimal(rows, ['principal', 'downpayment', 'duration', 'annualrate']);

    rows.forEach((row, i) => {
      const name = String(row['name'] || '').trim() || `Loan ${i + 1}`;
      let config = null;

      const rawConfig = String(row['config'] || '').trim();
      if (rawConfig) {
        try { config = JSON.parse(rawConfig); } catch (e) { config = null; }
      }

      if (!config) {
        // Rebuild from the flat columns
        const principal = this._num(row['principal'], decimal);
        const duration = this._num(row['duration'], decimal);
        const down = this._num(row['downpayment'], decimal);
        // 1.0.2 (BUG-31): a spreadsheet writes a rate as '3,5 %'.
        const rate = this._num(String(row['annualrate'] || '').trim().replace(/\s*%$/, ''), decimal);
        const firstPaymentDate = this._normalizeDate(row['firstpaymentdate']);
        if (principal === null || duration === null || !firstPaymentDate) {
          skip('missing principal, duration or first payment date');
          return;
        }
        // 1.0.2 (BUG-31): a present but unreadable cell is reported, never
        // read as 0 (an unreadable rate silently became a 0% loan).
        if ([principal, duration, down, rate].some(v => v !== null && isNaN(v))) {
          skip('invalid amount');
          return;
        }
        const unit = String(row['durationunit'] || '').trim().toLowerCase();
        const amort = String(row['amortization'] || '').trim().toLowerCase();
        const type = String(row['type'] || '').trim().toLowerCase();
        config = {
          type: ['mortgage', 'personal', 'installment'].indexOf(type) === -1 ? 'personal' : type,
          principal: principal,
          downPayment: down || 0,
          duration: Math.round(duration),
          durationUnit: unit === 'months' ? 'months' : 'years',
          annualRate: rate || 0,
          firstPaymentDate: firstPaymentDate,
          amortization: amort === 'italian' ? 'italian' : 'french'
        };
        if (this._parseBool(row['interestonlyfirst']) === true) {
          config.firstInstallmentInterestOnly = true;
          if (this._parseBool(row['interestonlyextends']) === false) {
            config.interestOnlyExtendsDuration = false;
          }
        }
      }

      // The engine is the gatekeeper: anything it can't simulate would render
      // as a broken card forever, so reject it at the door.
      if (window.LoanEngine) {
        try {
          window.LoanEngine.simulate({ ...config, computeSavings: false });
        } catch (e) {
          skip(e && e.message ? e.message : 'invalid loan configuration');
          return;
        }
      }

      const kind = String(row['kind'] || '').trim().toLowerCase() === 'sim' ? 'sim' : 'active';
      // 1.0.1 (BUG-02): the payment series this loan tracks. Only an active
      // loan is ever linked. An id whose series is not in the store yet is
      // harmless: every consumer reads through getLoanLinkedTransactions, and
      // the transactions file brings the series back under the same id.
      // 1.0.2 (BUG-24): the same Store.fileId map as _relinkSeries, so an unsafe
      // series id ('rent 2026') still meets its series in either file order.
      const linkedSeriesId = window.Store.fileId(row['linkedseriesid']) || '';
      const loan = {
        name: name,
        kind: kind,
        config: config,
        linkedSeriesId: (kind === 'active' && linkedSeriesId) ? linkedSeriesId : null
      };
      // 1.0.1 (BUG-02): only a file written BEFORE the LinkedSeriesId column
      // asks for the payment-note fallback. In a new-format file an empty cell
      // means "deliberately untracked", so such a loan is never flagged and a
      // later transactions import cannot silently link it.
      if (kind === 'active' && !Object.prototype.hasOwnProperty.call(row, 'linkedseriesid')) {
        loan.needsNoteRelink = true;
      }
      loans.push(loan);
      stats.importedCount++;
    });

    return { loans: loans, stats: stats };
  },

  /**
   * 1.0.1 (BUG-02): a series belongs to ONE loan. Importing the loans file
   * twice, or a backup into the install it came from, would otherwise give the
   * duplicate loan the series the original already tracks — and deleting the
   * duplicate with its future payments would wipe the original's. A link that
   * a loan in the store (or an earlier row of this file) already names is
   * dropped and the loan flagged for the payment-note fallback, so
   * RELINK_LOAN_SERIES links it to an unowned copy (e.g. the re-keyed series
   * of a re-imported transactions file) or leaves it unlinked. Any other id is
   * kept as is, so a restore works in either file order. Mutates `loans`.
   */
  _releaseOwnedLoanLinks(loans) {
    const owned = new Set();
    const existing = (window.Store && window.Store.getState().loans) || [];
    existing.forEach(l => { if (l.linkedSeriesId) owned.add(l.linkedSeriesId); });
    loans.forEach(loan => {
      if (!loan.linkedSeriesId) return;
      if (owned.has(loan.linkedSeriesId)) {
        loan.linkedSeriesId = null;
        loan.needsNoteRelink = true;
      } else {
        owned.add(loan.linkedSeriesId);
      }
    });
    return loans;
  },

  // 1.0.2 (BUG-78): a loan already in Stack'd (same kind, name and terms) is
  // not added again — a second import of the loans file used to add every
  // loan twice. A multiset: two identical loans in one file still restore onto
  // an empty phone. No file-format change (D3). Counts into stats.
  _skipKnownLoans(loans, stats) {
    const sig = (l) => [l.kind === 'sim' ? 'sim' : 'active',
      String(l.name == null ? '' : l.name).trim().toLowerCase(), this._stableJson(l.config)].join('|');
    const have = new Map();
    ((window.Store && window.Store.getState().loans) || []).forEach(l => {
      const k = sig(l);
      have.set(k, (have.get(k) || 0) + 1);
    });
    stats.duplicateCount = 0;
    return loans.filter(l => {
      const k = sig(l);
      const n = have.get(k) || 0;
      if (!n) return true;
      have.set(k, n - 1);
      stats.duplicateCount++;
      stats.importedCount--;
      return false;
    });
  },

  // JSON with sorted keys (and undefined members dropped), so two equal
  // configs compare equal whatever order their keys were written in.
  _stableJson(v) {
    if (Array.isArray(v)) return '[' + v.map(x => this._stableJson(x === undefined ? null : x)).join(',') + ']';
    if (v && typeof v === 'object') {
      return '{' + Object.keys(v).filter(k => v[k] !== undefined).sort()
        .map(k => JSON.stringify(k) + ':' + this._stableJson(v[k])).join(',') + '}';
    }
    return JSON.stringify(v === undefined ? null : v);
  },

  // v0.99 ── bank statements (docs/bank-import-plan.md §3) ──────────────────
  // An arbitrary bank CSV has no known headers, so nothing here keys rows by
  // header name — everything is a zero-based column INDEX into the parsed
  // rows (headers may be empty or duplicated in the wild).

  // Header hint word lists for the mapping guess. Substring-matched against
  // the squashed (lowercase, alphanumeric-only) header label; the very short
  // tokens ('af', 'bij', 'ref', 'id') match only as whole squashed labels or
  // whole words, or they'd fire on half the alphabet.
  _BANK_DEBIT_HINTS: ['debit', 'dare', 'addebito', 'uscite', 'soll', 'debito', 'cargo', 'af'],
  _BANK_CREDIT_HINTS: ['credit', 'avere', 'accredito', 'entrate', 'haben', 'credito', 'abono', 'bij'],
  _BANK_DESC_HINTS: ['description', 'descrizione', 'causale', 'libelle', 'concepto',
    'descripcion', 'beschreibung', 'omschrijving', 'details', 'narrative', 'memo',
    'oggetto', 'payee', 'beneficiario'],
  _BANK_REF_HINTS: ['reference', 'riferimento', 'referencia', 'ref', 'transactionid', 'operazione', 'id'],

  _headerHasHint(label, hints) {
    const squashed = String(label || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const words = String(label || '').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
    return hints.some(h => h.length <= 3
      ? (squashed === h || words.indexOf(h) !== -1)
      : squashed.includes(h));
  },

  // parseBankAmount(raw, decimal) → Number or null.
  // decimal: 'comma' (1.234,56), 'dot' (1,234.56) or 'auto'. Strips currency
  // symbols/letters, every space flavour (regular/NBSP/thin/narrow) and
  // apostrophe thousands (Swiss 1'234.56). Trailing minus ('123,45-') and
  // parentheses ('(12,34)') mean negative. Empty/garbage → null.
  parseBankAmount(raw, decimal) {
    if (raw === null || raw === undefined) return null;
    let s = String(raw).trim();
    if (s === '') return null;

    // v0.99 review fix: some exports use the Unicode minus (U+2212).
    s = s.replace(/−/g, '-');

    let negative = false;
    const paren = s.match(/^\((.*)\)$/);
    if (paren) { negative = true; s = paren[1].trim(); }
    if (/-\s*$/.test(s)) { negative = true; s = s.replace(/-\s*$/, '').trim(); }
    if (s.charAt(0) === '-') { negative = true; s = s.slice(1).trim(); }
    if (s.charAt(0) === '+') { s = s.slice(1).trim(); }
    // v0.99 review fix: 'EUR -45,90' / '€-45,90' — a minus sitting between a
    // currency prefix and the digits was stripped along with the symbol below,
    // silently flipping debits into income. Any '-' before the first digit
    // counts as the sign.
    const firstDigit = s.search(/\d/);
    if (firstDigit > 0 && s.slice(0, firstDigit).indexOf('-') !== -1) { negative = true; }

    // Keep only digits and the two possible separators; this drops currency
    // symbols, letters, all space variants and apostrophes in one go.
    s = s.replace(/[^0-9.,]/g, '');
    if (!/\d/.test(s)) return null;

    const countOf = (str, ch) => str.split(ch).length - 1;
    let normalized;
    if (decimal === 'comma') {
      // Dots (and the already-stripped apostrophes/spaces) are thousands.
      s = s.replace(/\./g, '');
      if (countOf(s, ',') > 1) return null;
      normalized = s.replace(',', '.');
    } else if (decimal === 'dot') {
      s = s.replace(/,/g, '');
      if (countOf(s, '.') > 1) return null;
      normalized = s;
    } else {
      // 'auto': with both separators present the RIGHTMOST is the decimal;
      // a lone separator is a decimal only when followed by exactly 1-2
      // trailing digits, otherwise it's a thousands separator.
      const lastDot = s.lastIndexOf('.');
      const lastComma = s.lastIndexOf(',');
      if (lastDot !== -1 && lastComma !== -1) {
        if (lastDot > lastComma) {
          s = s.replace(/,/g, '');
          if (countOf(s, '.') > 1) return null;
          normalized = s;
        } else {
          s = s.replace(/\./g, '');
          if (countOf(s, ',') > 1) return null;
          normalized = s.replace(',', '.');
        }
      } else if (lastDot !== -1 || lastComma !== -1) {
        const sep = lastDot !== -1 ? '.' : ',';
        const isDecimal = countOf(s, sep) === 1 && /[.,]\d{1,2}$/.test(s);
        normalized = isDecimal
          ? s.replace(sep, '.')
          : s.split(sep).join('');
      } else {
        normalized = s;
      }
    }

    const n = parseFloat(normalized);
    if (isNaN(n)) return null;
    return negative ? -n : n;
  },

  // _normalizeBankDate(raw, fmt) → 'YYYY-MM-DD' or null. Unlike the backup
  // importer's _normalizeDate this never guesses the token order — the user
  // picked fmt ('dmy'|'mdy'|'ymd') in the mapping view. 2-digit years → 20xx.
  _normalizeBankDate(raw, fmt) {
    if (raw === null || raw === undefined) return null;
    const str = String(raw).trim().split(/[T ]/)[0];
    const m = str.match(/^(\d{1,4})[-/.](\d{1,2})[-/.](\d{1,4})$/);
    if (!m) return null;

    let y, mo, d;
    if (fmt === 'ymd') { y = +m[1]; mo = +m[2]; d = +m[3]; }
    else if (fmt === 'mdy') { mo = +m[1]; d = +m[2]; y = +m[3]; }
    else { d = +m[1]; mo = +m[2]; y = +m[3]; }

    if (y < 100) y += 2000;
    if (!y || mo < 1 || mo > 12 || d < 1 || d > 31) return null;
    return `${String(y).padStart(4, '0')}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  },

  _looksLikeBankDate(raw) {
    const str = String(raw).trim().split(/[T ]/)[0];
    return /^\d{1,4}[-/.]\d{1,2}[-/.]\d{1,4}$/.test(str);
  },

  // analyzeBankCSV(csvText) → { headerLabels, rowsRaw, columns, signature, guess }.
  // Parses once with the shared quoted-CSV logic, then builds a best-effort
  // mapping guess (-1 for anything not confidently detected) that the mapping
  // view presents for correction.
  analyzeBankCSV(csvText) {
    // 1.0.2 (BUG-33): a quoted line break no longer splits a statement row.
    const { delimiter, records } = this._readRecords(csvText);
    if (records.length < 2) throw new Error("File is empty or missing headers");

    const headerLabels = this._parseRow(records[0], delimiter);
    const rowsRaw = records.slice(1).map(rec => this._parseRow(rec, delimiter));

    const columns = headerLabels.map((label, index) => {
      const samples = [];
      for (let r = 0; r < rowsRaw.length && samples.length < 3; r++) {
        const v = rowsRaw[r][index];
        if (v !== undefined && String(v).trim() !== '') samples.push(v);
      }
      return { index: index, label: label, samples: samples };
    });

    // Same squash as the backup importer's header keys, so a bank's layout is
    // recognised again regardless of casing/punctuation drift.
    const signature = headerLabels
      .map(h => h.toLowerCase().replace(/[^a-z0-9]/g, ''))
      .join('|');

    return {
      headerLabels: headerLabels,
      rowsRaw: rowsRaw,
      columns: columns,
      signature: signature,
      guess: this._guessBankMapping(headerLabels, rowsRaw)
    };
  },

  _guessBankMapping(headerLabels, rowsRaw) {
    const guess = {
      date: -1, description: -1, amountMode: 'single',
      amount: -1, debit: -1, credit: -1, bankRef: -1,
      dateFormat: 'dmy', decimal: 'auto'
    };
    // Sample the head of the file; enough signal without scanning 10k rows.
    const sample = rowsRaw.slice(0, 50);
    const nonEmpty = (colIdx) => sample
      .map(row => row[colIdx])
      .filter(v => v !== undefined && String(v).trim() !== '');

    // Date: first column where >= 80% of non-empty sampled values are
    // date-shaped. Remember every date-shaped column so value/booking date
    // twins don't get mistaken for amounts below.
    const dateShaped = [];
    headerLabels.forEach((label, i) => {
      const vals = nonEmpty(i);
      if (!vals.length) return;
      const hits = vals.filter(v => this._looksLikeBankDate(v)).length;
      if (hits / vals.length >= 0.8) {
        dateShaped.push(i);
        if (guess.date === -1) guess.date = i;
      }
    });

    // dateFormat from the guessed date column's tokens: a 4-digit FIRST token
    // is year-first; a first token > 12 can only be a day; a second token > 12
    // can only be a day (so month-first); otherwise default 'dmy' — EU app.
    if (guess.date !== -1) {
      let firstOver12 = false, secondOver12 = false, yearFirst = false;
      nonEmpty(guess.date).forEach(v => {
        const m = String(v).trim().split(/[T ]/)[0].match(/^(\d{1,4})[-/.](\d{1,2})[-/.](\d{1,4})$/);
        if (!m) return;
        if (m[1].length === 4) yearFirst = true;
        if (+m[1] > 12) firstOver12 = true;
        if (+m[2] > 12) secondOver12 = true;
      });
      guess.dateFormat = yearFirst ? 'ymd' : (firstOver12 ? 'dmy' : (secondOver12 ? 'mdy' : 'dmy'));
    }

    // Numeric candidates: >= 80% of non-empty sampled values parse as amounts
    // (date-shaped columns excluded — '12.03.2026' parses as a number too).
    const numeric = [];
    headerLabels.forEach((label, i) => {
      if (dateShaped.indexOf(i) !== -1) return;
      const vals = nonEmpty(i);
      if (!vals.length) return;
      const parsed = vals.map(v => this.parseBankAmount(v, 'auto'));
      const hits = parsed.filter(n => n !== null).length;
      if (hits / vals.length >= 0.8) {
        numeric.push({
          index: i,
          hasNeg: parsed.some(n => n !== null && n < 0),
          hasPos: parsed.some(n => n !== null && n > 0)
        });
      }
    });

    if (numeric.length === 1) {
      guess.amountMode = 'single';
      guess.amount = numeric[0].index;
    } else if (numeric.length >= 2) {
      const debitCol = numeric.find(c => this._headerHasHint(headerLabels[c.index], this._BANK_DEBIT_HINTS));
      const creditCol = numeric.find(c => c !== debitCol && this._headerHasHint(headerLabels[c.index], this._BANK_CREDIT_HINTS));
      if (debitCol && creditCol) {
        guess.amountMode = 'split';
        guess.debit = debitCol.index;
        guess.credit = creditCol.index;
      } else {
        guess.amountMode = 'single';
        const signed = numeric.find(c => c.hasNeg && c.hasPos);
        guess.amount = (signed || numeric[0]).index;
      }
    }

    // Description: among the remaining columns a header hint wins; otherwise
    // the longest average text length (bank descriptions dwarf everything else).
    const taken = [guess.date, guess.amount, guess.debit, guess.credit];
    const remaining = headerLabels
      .map((label, i) => i)
      .filter(i => taken.indexOf(i) === -1);
    const hinted = remaining.filter(i => this._headerHasHint(headerLabels[i], this._BANK_DESC_HINTS));
    const pool = hinted.length ? hinted : remaining;
    let bestAvg = 0;
    pool.forEach(i => {
      const vals = nonEmpty(i);
      if (!vals.length) return;
      const avg = vals.reduce((sum, v) => sum + String(v).length, 0) / vals.length;
      if (avg > bestAvg) { bestAvg = avg; guess.description = i; }
    });

    // Bank reference: only on a strong header hint — guessing wrong here would
    // silently weaken dedup (a non-unique column becomes the importKey).
    const refPool = remaining.filter(i => i !== guess.description);
    const refHit = refPool.find(i => this._headerHasHint(headerLabels[i], this._BANK_REF_HINTS));
    if (refHit !== undefined) guess.bankRef = refHit;

    return guess;
  },

  // buildBankTransactions(rowsRaw, mapping, accountId) → { items, stats }.
  // items preserve row order; each is { tx, duplicate, error } where error
  // rows have tx: null. Every parseable row gets a deterministic importKey —
  // 'ref:' when a bank reference is mapped and present, else a fingerprint —
  // so re-importing the same statement dedups against the store.
  buildBankTransactions(rowsRaw, mapping, accountId) {
    const items = [];
    const stats = { total: rowsRaw.length, ok: 0, duplicates: 0, errors: 0 };
    // Intra-file twins (same day, amount and description) get '#2', '#3'…
    // appended in row order — deterministic, so a re-import of the same file
    // regenerates identical keys and still dedups.
    const keyCounts = {};

    rowsRaw.forEach(row => {
      const fail = (reason) => {
        items.push({ tx: null, duplicate: false, error: reason });
        stats.errors++;
      };

      const date = this._normalizeBankDate(row[mapping.date], mapping.dateFormat);
      if (!date) { fail('unrecognised date format'); return; }

      // 1.0.2 (BUG-33, D12): one line, like every import (the key is unchanged:
      // _stampImportKey's normDesc already collapses whitespace).
      const description = this._oneLine(row[mapping.description] !== undefined ? row[mapping.description] : '');

      let type, amount;
      if (mapping.amountMode === 'split') {
        const debit = mapping.debit >= 0 ? this.parseBankAmount(row[mapping.debit], mapping.decimal) : null;
        const credit = mapping.credit >= 0 ? this.parseBankAmount(row[mapping.credit], mapping.decimal) : null;
        if (debit !== null && debit !== 0) { type = 'expense'; amount = Math.abs(debit); }
        else if (credit !== null && credit !== 0) { type = 'income'; amount = Math.abs(credit); }
        else { fail('missing amount'); return; }
      } else {
        const parsed = this.parseBankAmount(row[mapping.amount], mapping.decimal);
        if (parsed === null || parsed === 0) { fail('invalid amount'); return; }
        type = parsed < 0 ? 'expense' : 'income';
        amount = Math.abs(parsed);
      }

      const tx = {
        type: type,
        amount: amount,
        accountId: accountId,
        // v1.01: category rules apply at build (= preview) time, per plan §5
        categoryId: window.Store.matchImportRule ? window.Store.matchImportRule(description) : '',
        date: date,
        comment: description
      };

      const bankRef = mapping.bankRef >= 0
        ? String(row[mapping.bankRef] !== undefined ? row[mapping.bankRef] : '').trim()
        : '';
      const duplicate = this._stampImportKey(tx, bankRef, accountId, keyCounts);
      items.push({ tx: tx, duplicate: duplicate, error: null });
      if (duplicate) stats.duplicates++;
      else stats.ok++;
    });

    return { items: items, stats: stats };
  },

  // v1.01: the match string offered when the user teaches a rule from the
  // preview. Structured descriptions are "party — remittance" (our own join,
  // see parseCamt/_mt940Narrative); the remittance varies per payment, the
  // party is the stable merchant — so the suggestion is the party segment.
  suggestRuleMatch(description) {
    const base = String(description || '').split(' — ')[0];
    // 1.0.2 (BUG-33): collapse whitespace (a legacy multi-line note) — the
    // store compares rule matches whitespace-collapsed.
    return base.toLowerCase().replace(/\s+/g, ' ').trim().slice(0, 60).trim();
  },

  // v1.00: shared by the CSV and statement builders so both formats produce
  // byte-identical keys by construction. Stamps tx.importKey (and tx.bankRef
  // when given) and returns whether the store already holds the key.
  _stampImportKey(tx, bankRef, accountId, keyCounts) {
    let key;
    if (bankRef) {
      tx.bankRef = bankRef;
      // v0.99 review fix: escape the ref inside the key ('%'→'%25','#'→'%23')
      // so a literal ref ending in '#2' can't collide with a '#n' twin suffix.
      key = 'ref:' + accountId + '|' + bankRef.replace(/%/g, '%25').replace(/#/g, '%23');
    } else {
      const amountCents = Math.round(tx.amount * 100);
      // v0.99 review fix: final trim AFTER the slice — a cut landing on a word
      // boundary left a trailing space that every CSV restore trims away,
      // drifting the key and breaking backup-round-trip dedup for that row.
      const normDesc = String(tx.comment || '').toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ').trim().slice(0, 60).trim();
      key = 'fp:' + accountId + '|' + tx.date + '|' + tx.type + '|' + amountCents + '|' + normDesc;
    }
    keyCounts[key] = (keyCounts[key] || 0) + 1;
    if (keyCounts[key] > 1) key += '#' + keyCounts[key];
    tx.importKey = key;
    return window.Store.hasImportKey(key);
  },

  // ── v1.00 bank statements: camt.053/052 + MT940 (docs/bank-import-plan.md §4) ─
  // Structured statements skip the column-mapping step — their shape is fixed —
  // and land on the same preview/dedup pipeline as bank CSVs. A parsed
  // statement is { format, currency, entries: [{date 'YYYY-MM-DD', description,
  // type 'income'|'expense', amount (absolute), bankRef}], openingBalance:
  // {amount signed, date} | null, closingBalance: idem }.

  // sniffFormat(text) → 'camt' | 'mt940' | 'csv'. Content sniff, not extension:
  // banks hand out .txt/.sta/.xml interchangeably.
  sniffFormat(text) {
    const head = String(text || '').replace(/^\uFEFF/, '').slice(0, 4000);
    if (/^\s*</.test(head) &&
        (/BkToCstmrStmt|BkToCstmrAcctRpt/.test(head) || /urn:iso:std:iso:20022[^"']*camt/.test(head))) {
      return 'camt';
    }
    // A SWIFT envelope ({1:...) or a :20:/:25: header tag plus any balance/
    // entry tag; a CSV line can't start with ':60F:' style tags.
    if ((/^\s*\{1:/.test(head) || /^:2[05][A-Z]?:/m.test(head)) && /^:6[0-2]/m.test(head)) {
      return 'mt940';
    }
    return 'csv';
  },

  // camt.053 (BkToCstmrStmt > Stmt) and camt.052 (BkToCstmrAcctRpt > Rpt).
  // Namespace-agnostic descendant lookups — banks ship several camt.05x.001.XX
  // versions and the local names are stable across them.
  parseCamt(xmlText) {
    const doc = new DOMParser().parseFromString(String(xmlText).replace(/^\uFEFF/, ''), 'application/xml');
    if (doc.getElementsByTagName('parsererror').length) throw new Error('invalid camt XML');
    const kids = (el, name) => Array.prototype.slice.call(el.getElementsByTagNameNS('*', name));
    const first = (el, name) => el.getElementsByTagNameNS('*', name)[0] || null;
    const text = (el, name) => { const n = el && first(el, name); return n ? n.textContent.trim() : ''; };

    const blocks = kids(doc, 'Stmt').concat(kids(doc, 'Rpt'));
    if (!blocks.length) throw new Error('invalid camt XML');

    const entries = [];
    let currency = '';
    let opening = null;
    let closing = null;

    blocks.forEach(stmt => {
      kids(stmt, 'Bal').forEach(bal => {
        const cd = text(bal, 'Cd');
        const amtEl = first(bal, 'Amt');
        if (!amtEl) return;
        const amount = parseFloat(amtEl.textContent);
        if (isNaN(amount)) return;
        const sign = text(bal, 'CdtDbtInd') === 'DBIT' ? -1 : 1;
        const dtEl = first(bal, 'Dt');
        // 1.0.2 (BUG-24): the balance date is file text that can become the
        // account's opening date — keep it only when it is a real YMD (a
        // DtTm's time part is dropped), else '' (no date offered).
        const rec = { amount: sign * amount, date: dtEl ? (this._normalizeBankDate(dtEl.textContent, 'ymd') || '') : '' };
        // PRCD (previously closed booked) doubles as the opening balance in
        // several bank dialects — accept it only when no true OPBD exists.
        if (cd === 'OPBD' || (cd === 'PRCD' && !opening)) { if (cd === 'OPBD' || !opening) opening = rec; }
        else if (cd === 'CLBD') closing = rec; // last CLBD across blocks wins
        if (!currency && amtEl.getAttribute('Ccy')) currency = amtEl.getAttribute('Ccy');
      });

      kids(stmt, 'Ntry').forEach(ntry => {
        // Schema order puts the entry-level Amt/CdtDbtInd before TxDtls, so
        // the first descendant is the entry's own.
        const amtEl = first(ntry, 'Amt');
        const amount = amtEl ? parseFloat(amtEl.textContent) : NaN;
        const type = text(ntry, 'CdtDbtInd') === 'DBIT' ? 'expense' : 'income';
        const bookg = first(ntry, 'BookgDt');
        const val = first(ntry, 'ValDt');
        const date = ((bookg ? bookg.textContent : (val ? val.textContent : '')) || '').trim().slice(0, 10);

        // Description: counterparty (creditor for money out, debtor for money
        // in) + unstructured remittance, else the bank's own AddtlNtryInf.
        // 1.0.2 (BUG-33, D12): one line, as MT940 (_mt940Narrative) and Bank
        // Connect already do — the note field cannot hold a line break.
        const flat = (s) => String(s || '').replace(/\s+/g, ' ').trim();
        const party = flat(type === 'expense' ? text(first(ntry, 'Cdtr'), 'Nm') : text(first(ntry, 'Dbtr'), 'Nm'));
        const ustrd = kids(ntry, 'Ustrd').map(u => flat(u.textContent)).filter(Boolean).join(' ');
        const description = [party, ustrd].filter(Boolean).join(' — ') || flat(text(ntry, 'AddtlNtryInf'));

        // AcctSvcrRef is the bank's per-entry id (best dedup anchor);
        // EndToEndId is next, but its 'NOTPROVIDED' filler means "none".
        const svcRef = text(ntry, 'AcctSvcrRef');
        let e2e = text(ntry, 'EndToEndId');
        if (/^not\s*provided$/i.test(e2e)) e2e = '';
        if (!currency && amtEl && amtEl.getAttribute('Ccy')) currency = amtEl.getAttribute('Ccy');

        entries.push({
          date: date,
          description: description,
          type: type,
          amount: isNaN(amount) ? NaN : Math.abs(amount),
          bankRef: svcRef || e2e
        });
      });
    });

    return { format: 'camt', currency: currency, entries: entries, openingBalance: opening, closingBalance: closing };
  },

  // MT940 (SWIFT customer statement). Line-tag parser: :60F:/:60M: opening,
  // :61: entry, :86: narrative for the preceding :61:, :62F:/:62M: closing.
  parseMT940(rawText) {
    let s = String(rawText).replace(/^\uFEFF/, '');
    // Unwrap SWIFT block 4 when the file carries the {1:...}{2:...}{4:...-} envelope.
    const block4 = s.match(/\{4:\s*([\s\S]*?)-\}/);
    if (block4) s = block4[1];

    // Fold continuation lines (anything not starting a :NN: tag) into their tag.
    const tags = [];
    s.split(/\r?\n/).forEach(line => {
      if (/^:[0-9]{2}[A-Z]?:/.test(line)) tags.push(line);
      else if (tags.length && line.trim() !== '') tags[tags.length - 1] += '\n' + line;
    });

    const mtDate = (yymmdd) => {
      const yy = parseInt(yymmdd.slice(0, 2), 10);
      const year = yy > 79 ? 1900 + yy : 2000 + yy; // statements are 20xx in practice
      return year + '-' + yymmdd.slice(2, 4) + '-' + yymmdd.slice(4, 6);
    };
    // :60F:/:62F: content: (C|D) YYMMDD CCY amount-with-comma-decimal
    const parseBal = (content) => {
      const m = content.trim().match(/^(C|D)(\d{6})([A-Z]{3})(\d+(?:,\d{0,2})?)/);
      if (!m) return null;
      return {
        amount: (m[1] === 'D' ? -1 : 1) * parseFloat(m[4].replace(',', '.')),
        date: mtDate(m[2]),
        ccy: m[3]
      };
    };

    const entries = [];
    let currency = '';
    let opening = null;
    let closing = null;
    let pending = null; // the last :61: waiting for its :86: narrative
    const flush = () => { if (pending) { entries.push(pending); pending = null; } };

    tags.forEach(t => {
      const m = t.match(/^:(\d{2}[A-Z]?):([\s\S]*)$/);
      if (!m) return;
      const tag = m[1];
      const content = m[2];

      if (tag === '60F' || tag === '60M') {
        const b = parseBal(content);
        if (b) { if (!opening) opening = { amount: b.amount, date: b.date }; if (!currency) currency = b.ccy; }
      } else if (tag === '62F' || tag === '62M') {
        const b = parseBal(content);
        if (b) { closing = { amount: b.amount, date: b.date }; if (!currency) currency = b.ccy; }
      } else if (tag === '61') {
        flush();
        // :61:YYMMDD[MMDD](mark)[funds]amount[Ntype][ref][//bankref]
        // Longer marks first — 'RC' must not half-match as 'C'.
        const lm = content.match(/^(\d{6})(\d{4})?(RC|RD|EC|ED|C|D)([A-Z])?(\d+(?:,\d{0,2})?)([NSF][A-Z0-9]{3})?([\s\S]*)$/);
        if (!lm) return; // unparseable line: skip rather than poison the file
        const mark = lm[3];
        // RC reverses a credit (money back out), ED is an expected debit.
        const isDebit = mark === 'D' || mark === 'RC' || mark === 'ED';
        const rest = (lm[7] || '').split('\n')[0];
        const slash = rest.indexOf('//');
        let ref = (slash !== -1 ? rest.slice(0, slash) : rest).trim();
        const bankSide = slash !== -1 ? rest.slice(slash + 2).trim() : '';
        if (/^NONREF$/i.test(ref)) ref = '';
        pending = {
          date: mtDate(lm[1]),
          description: '',
          type: isDebit ? 'expense' : 'income',
          amount: parseFloat(lm[5].replace(',', '.')),
          bankRef: ref || bankSide
        };
      } else if (tag === '86') {
        if (pending) {
          pending.description = this._mt940Narrative(content);
          flush();
        }
        // a :86: with no pending :61: is statement-level info — ignore
      }
    });
    flush();

    if (!entries.length && !opening && !closing) throw new Error('invalid MT940 file');
    return { format: 'mt940', currency: currency, entries: entries, openingBalance: opening, closingBalance: closing };
  },

  // :86: content. German/Dutch SEPA dialects pack ?NN subfields: ?20–?29 carry
  // the remittance text, ?32/?33 the counterparty name — everything else
  // (bank codes, account numbers) is noise for a description.
  _mt940Narrative(content) {
    const flat = content.replace(/\r?\n/g, ' ').trim();
    if (flat.indexOf('?') === -1) return flat;
    const segs = flat.split(/\?(\d{2})/);
    const name = [];
    const remit = [];
    for (let i = 1; i < segs.length; i += 2) {
      const code = segs[i];
      const val = (segs[i + 1] || '').trim();
      if (!val) continue;
      if (code === '32' || code === '33') name.push(val);
      else if (code >= '20' && code <= '29') remit.push(val);
    }
    const out = [name.join(' '), remit.join(' ')].filter(Boolean).join(' — ');
    return out || flat;
  },

  // Statement → the same { items, stats } shape buildBankTransactions returns,
  // so #import-preview and BATCH_IMPORT_BANK_TRANSACTIONS work unchanged.
  buildStatementTransactions(statement, accountId) {
    const items = [];
    const stats = { total: statement.entries.length, ok: 0, duplicates: 0, errors: 0 };
    const keyCounts = {};

    statement.entries.forEach(e => {
      const fail = (reason) => {
        items.push({ tx: null, duplicate: false, error: reason });
        stats.errors++;
      };

      const date = this._normalizeBankDate(e.date, 'ymd');
      if (!date) { fail('unrecognised date format'); return; }
      const amount = Math.abs(Number(e.amount));
      if (!isFinite(amount) || amount === 0) { fail('invalid amount'); return; }

      const description = this._oneLine(e.description); // 1.0.2 (BUG-33, D12)
      const tx = {
        type: e.type === 'expense' ? 'expense' : 'income',
        amount: amount,
        accountId: accountId,
        // v1.01: category rules apply at build (= preview) time, per plan §5
        categoryId: window.Store.matchImportRule ? window.Store.matchImportRule(description) : '',
        date: date,
        comment: description
      };
      const duplicate = this._stampImportKey(tx, String(e.bankRef || '').trim(), accountId, keyCounts);
      items.push({ tx: tx, duplicate: duplicate, error: null });
      if (duplicate) stats.duplicates++;
      else stats.ok++;
    });

    return { items: items, stats: stats };
  },

  // ── v1.03 match/link + transfer detection (docs/bank-import-plan.md §7) ───
  // Annotates clean, non-duplicate preview items with suggestions; nothing is
  // applied without explicit user confirmation on the preview screen.
  // - it.match: an existing NON-IMPORTED transaction in the SAME account with
  //   the same type and amount within ±3 days — the default action is to LINK
  //   (the existing row absorbs importKey/bankRef; its date and any recurrence
  //   are NEVER touched). This is how a materialized recurring occurrence
  //   meets its real bank booking without duplication.
  // - it.transfer: an existing row in a DIFFERENT same-currency account with
  //   the OPPOSITE type and same amount within ±2 days — the default action is
  //   to PAIR as a transfer (fresh shared transferRef, both categories empty).
  //   Rows already in a transfer and recurring rows are never offered (pairing
  //   would entangle series semantics).
  // A same-account match wins over a transfer suggestion; each existing row is
  // claimed by at most one incoming item (deterministic: closest date first).
  annotateImportMatches(items, accountId) {
    const state = window.Store.getState();
    const accCcy = window.Store.getAccountCurrency(accountId);
    const day = (d) => Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10)) / 86400000;

    // One O(T) pass: candidates bucketed by amount|type.
    const byKey = Object.create(null);
    state.transactions.forEach(t => {
      if (t.type !== 'income' && t.type !== 'expense') return;
      const key = t.amount.toFixed(2) + '|' + t.type;
      (byKey[key] = byKey[key] || []).push(t);
    });

    const claimed = new Set();
    const closest = (cands, itDay) => cands.sort((a, b) =>
      (Math.abs(day(a.date) - itDay) - Math.abs(day(b.date) - itDay)) ||
      a.date.localeCompare(b.date) || a.id.localeCompare(b.id))[0];

    items.forEach(it => {
      if (!it.tx || it.duplicate || it.error) return;
      const itDay = day(it.tx.date);
      const amt = it.tx.amount.toFixed(2);

      const sameCands = (byKey[amt + '|' + it.tx.type] || []).filter(t =>
        t.accountId === accountId && !t.importKey && !claimed.has(t.id) &&
        t.type !== 'opening_balance' &&
        Math.abs(day(t.date) - itDay) <= 3);
      if (sameCands.length) {
        const m = closest(sameCands, itDay);
        claimed.add(m.id);
        it.match = { txId: m.id, comment: m.comment || '', date: m.date };
        it.matchAction = 'link';
        return;
      }

      const oppType = it.tx.type === 'expense' ? 'income' : 'expense';
      const pairCands = (byKey[amt + '|' + oppType] || []).filter(t =>
        t.accountId !== accountId && !t.transferRef && !t.recurrence &&
        !claimed.has(t.id) &&
        window.Store.getAccountCurrency(t.accountId) === accCcy &&
        Math.abs(day(t.date) - itDay) <= 2);
      if (pairCands.length) {
        const p = closest(pairCands, itDay);
        claimed.add(p.id);
        const acc = state.accounts.find(a => a.id === p.accountId);
        it.transfer = { txId: p.id, accountName: acc ? acc.name : '', date: p.date };
        it.transferAction = 'pair';
      }
    });
    return items;
  },

  // ── v1.01 import-rules CSV (backup parity for the rules slice, plan §5) ───
  // Recognised by Match+Category headers WITHOUT the transaction columns —
  // checked before the bank-CSV fallback, or a rules file would open the
  // column-mapping flow.
  isRuleRows(rows) {
    if (!rows || !rows.length) return false;
    const r = rows[0];
    const has = (k) => Object.prototype.hasOwnProperty.call(r, k);
    return has('match') && has('category') && !has('date') && !has('amount');
  },

  // Categories are resolved by NAME (ids differ across installs), created when
  // missing — same convention as buildTransactions. Rows are applied in
  // REVERSE file order through ADD_IMPORT_RULE (which prepends), so the file's
  // first row ends up first = highest priority, and dedupe-by-match holds.
  buildImportRules(rows) {
    const stats = { importedCount: 0, skippedCount: 0, skipped: {} };
    const skip = (reason) => {
      stats.skippedCount++;
      stats.skipped[reason] = (stats.skipped[reason] || 0) + 1;
    };

    [...rows].reverse().forEach(row => {
      const match = String(row['match'] || '').toLowerCase().trim().slice(0, 60);
      const catName = String(row['category'] || '').trim();
      if (!match || !catName) { skip('missing match or category'); return; }

      let category = window.Store.getState().categories.find(c => c.name.toLowerCase() === catName.toLowerCase());
      if (!category) {
        window.Store.dispatch('ADD_CATEGORY', { name: catName, icon: 'pin', typeHint: 'both' });
        category = window.Store.getState().categories.find(c => c.name.toLowerCase() === catName.toLowerCase());
      }
      if (!category) { skip('missing match or category'); return; }

      window.Store.dispatch('ADD_IMPORT_RULE', { match: match, categoryId: category.id });
      stats.importedCount++;
    });

    return stats;
  },

  // ── v1.19 budgets CSV (backup parity for the budgets slice) ──────────────
  // Recognised by Category+Amount+StartMonth WITHOUT the transaction columns.
  // A transactions backup also has Category and Amount (and StartDate for
  // recurrence), so the absence of Date/Account is what keeps the two apart.
  isBudgetRows(rows) {
    if (!rows || !rows.length) return false;
    const r = rows[0];
    const has = (k) => Object.prototype.hasOwnProperty.call(r, k);
    return has('category') && has('amount') && has('startmonth') && !has('date') && !has('account');
  },

  // 'YYYY-MM' (what the store keeps), '' for an empty cell, null when the
  // value is present but unreadable. A spreadsheet that opened the export may
  // have rewritten "2026-03" as a full date ("2026-03-01", "01/03/2026"), so a
  // full date is accepted and cut back to its month.
  _normalizeMonth(raw) {
    const s = String(raw === null || raw === undefined ? '' : raw).trim();
    if (s === '') return '';
    let ym = null;
    const m = s.match(/^(\d{4})[-/.](\d{1,2})$/);
    if (m) ym = m[1] + '-' + m[2].padStart(2, '0');
    else {
      const d = this._normalizeDate(s);
      if (d) ym = d.slice(0, 7);
    }
    if (!ym) return null;
    const month = parseInt(ym.slice(5, 7), 10);
    return month >= 1 && month <= 12 ? ym : null;
  },

  // Categories are resolved by NAME and created when missing, same as
  // buildImportRules. SAVE_BUDGET upserts by category, so importing the same
  // file twice leaves one budget per category rather than duplicates.
  buildBudgets(rows) {
    const stats = { importedCount: 0, skippedCount: 0, skipped: {}, newCategories: 0 };
    const skip = (reason) => {
      stats.skippedCount++;
      stats.skipped[reason] = (stats.skipped[reason] || 0) + 1;
    };

    const decimal = this._restoreDecimal(rows, ['amount']); // 1.0.2 (BUG-31)

    rows.forEach(row => {
      const catName = String(row['category'] || '').trim();
      const amount = this._num(row['amount'], decimal);
      const start = this._normalizeMonth(row['startmonth']);
      const end = this._normalizeMonth(row['endmonth']);
      if (!catName) { skip('missing category'); return; }
      if (amount === null || !(amount > 0)) { skip('invalid amount'); return; }
      if (start === null || end === null) { skip('unreadable month'); return; }
      if (start && end && end < start) { skip('end month before start month'); return; }

      let category = window.Store.getState().categories.find(c => c.name.toLowerCase() === catName.toLowerCase());
      if (!category) {
        window.Store.dispatch('ADD_CATEGORY', { name: catName, icon: 'pin', typeHint: 'both' });
        category = window.Store.getState().categories.find(c => c.name.toLowerCase() === catName.toLowerCase());
        if (category) stats.newCategories++;
      }
      if (!category) { skip('missing category'); return; }

      window.Store.dispatch('SAVE_BUDGET', {
        categoryId: category.id,
        amount: amount,
        startDate: start,
        endDate: end || null,
        isCumulative: /^(true|1|yes|y)$/i.test(String(row['cumulative'] || '').trim())
      });
      stats.importedCount++;
    });

    return stats;
  },

  // ── v1.19 (A-17) accounts and categories files ─────────────────────────────
  // Both were exported but had no importer: the router sent them to the bank
  // column-mapping flow, so a restore onto a new phone could only rebuild
  // accounts and categories as side effects of the transactions file — with
  // default type, icon, colour and currency, and no opening balance.
  //
  // 1.0.2 (BUG-30): accounts now resolve by id first (a Stack'd export keeps
  // its ids), and by name only as the fallback below (_restoreAccountResolver).
  // Both UPSERT by name. An account or category that already exists — most
  // often one the transactions file just created with defaults — is brought
  // up to what the file says rather than skipped, so the files can be
  // imported in ANY order and still land in the same state. That also means a
  // backup restored into a phone that has the same account overwrites that
  // account's settings with the backup's, which is what restoring means.

  _currencyCode(raw) {
    const c = String(raw || '').trim().toUpperCase();
    return /^[A-Z]{3}$/.test(c) ? c : null;
  },

  // 1.0.2 (BUG-30, D10): ids in a file are trusted only in a Stack'd export.
  // Every transactions export since 1.0 has these columns; the manual invites
  // migration files from other apps, whose 'ID' column (1, 2, …) is no
  // account or row id of this app.
  _isStackdTxFile(rows) {
    const r = (rows && rows[0]) || {};
    return ['transferref', 'seriesid', 'nextdate', 'importkey', 'accountcurrency']
      .every(k => Object.prototype.hasOwnProperty.call(r, k));
  },

  // The accounts file's full 1.0 header.
  _isStackdAccountsFile(rows) {
    const r = (rows && rows[0]) || {};
    return ['id', 'createdat', 'currency', 'type', 'icon', 'color', 'openingdate']
      .every(k => Object.prototype.hasOwnProperty.call(r, k));
  },

  // 1.0.2 (BUG-30): a restore identifies an account by its id. Names are not
  // unique ('Visa' credit + 'Visa' debit), and upserting by name folded them
  // into one. find(fileKey, csvId, name, currency):
  //  (a) the account whose id is csvId;
  //  (b) else (D9) a same-named (trimmed, case-insensitive; the exact spelling
  //      first) account in the same currency when the file gives one, that no
  //      id of THIS file names and no other file key claimed in this pass;
  //  (c) else null — the caller creates the account under the file's id.
  // Claims map a file key to one local account, so every row of one file
  // account lands on one account. byId sticks to the claim (the fingerprint
  // looks only at an account matched by id).
  _restoreAccountResolver(fileIds) {
    const claimed = new Map();
    const taken = new Set();
    const key = (n) => String(n == null ? '' : n).trim().toLowerCase();
    return {
      find(fileKey, csvId, name, currency) {
        const accs = window.Store.getState().accounts;
        if (claimed.has(fileKey)) {
          const c = claimed.get(fileKey);
          return { acc: accs.find(a => a.id === c.id) || null, byId: c.byId };
        }
        let acc = csvId ? (accs.find(a => a.id === csvId) || null) : null;
        const byId = !!acc;
        if (!acc) {
          const nk = key(name);
          const exact = String(name == null ? '' : name).trim();
          const cands = accs.filter(a => key(a.name) === nk && (!currency || a.currency === currency)
            && !fileIds.has(a.id) && !taken.has(a.id));
          acc = cands.find(a => String(a.name == null ? '' : a.name).trim() === exact) || cands[0] || null;
        }
        if (acc) this.claim(fileKey, acc.id, byId);
        return { acc, byId };
      },
      claim(fileKey, localId, byId) {
        claimed.set(fileKey, { id: localId, byId: !!byId });
        taken.add(localId);
      }
    };
  },

  isAccountRows(rows) {
    if (!rows || !rows.length) return false;
    const r = rows[0];
    const has = (k) => Object.prototype.hasOwnProperty.call(r, k);
    return has('name') && has('openingbalance') && !has('date') && !has('amount');
  },

  buildAccounts(rows) {
    const stats = { importedCount: 0, skippedCount: 0, skipped: {}, created: 0, updated: 0 };
    const skip = (reason) => {
      stats.skippedCount++;
      stats.skipped[reason] = (stats.skipped[reason] || 0) + 1;
    };

    // 1.0.2 (BUG-30, D10): the id column is trusted only under the full 1.0
    // header, and read through Store.fileId (BUG-24).
    const trusted = this._isStackdAccountsFile(rows);
    const idOf = (row) => (trusted ? (window.Store.fileId(row['id']) || '') : '');
    const fileIds = new Set(rows.map(idOf).filter(Boolean));
    const resolve = this._restoreAccountResolver(fileIds);
    const decimal = this._restoreDecimal(rows, ['openingbalance']); // 1.0.2 (BUG-31)

    rows.forEach((row, i) => {
      const name = String(row['name'] || '').trim();
      if (!name) { skip('missing name'); return; }
      // Signed: a card can open in debt. 1.0.2 (BUG-31): one strict reader.
      const obRaw = String(row['openingbalance'] || '').trim();
      const openingBalance = obRaw === '' ? 0 : this._parseRestoreAmount(obRaw, decimal);
      if (openingBalance === null || isNaN(openingBalance)) { skip('invalid opening balance'); return; }
      // The opening date decides which transactions count toward the balance.
      // A file from before v1.19 has no opening_date column; created_at is the
      // date the app itself falls back to when an account has none.
      // 1.0.2 (BUG-25): an account exported WITHOUT an opening balance (Bank
      // Connect, CSV-created, or its row was deleted) has opening_balance 0 and
      // an EMPTY opening_date. Dating a €0 opening balance at created_at put it
      // after the account's history and hid every earlier row. Only a pre-v1.19
      // file (no opening_date column) or a hand-edited non-zero amount still
      // falls back to created_at, now as its LOCAL day (BUG-38).
      const hasDateCol = Object.prototype.hasOwnProperty.call(row, 'openingdate');
      const created = String(row['createdat'] || '').trim();
      const createdDay = created.includes('T') ? window.Store._localYMD(created) : created;
      const openingDate = this._normalizeDate(row['openingdate'])
        || ((!hasDateCol || openingBalance !== 0) ? this._normalizeDate(createdDay) : null);

      const fields = { openingBalance: openingBalance };
      if (openingDate) fields.openingDate = openingDate;
      const currency = this._currencyCode(row['currency']);
      if (currency) fields.currency = currency;
      ['type', 'icon', 'color'].forEach(k => {
        const v = String(row[k] || '').trim();
        if (v) fields[k] = v;
      });

      // 1.0.2 (BUG-30): by id first; an id-less row has its own key, so two
      // file rows never fold into one account.
      const csvId = idOf(row);
      const fileKey = csvId || ('row' + i);
      const { acc, byId } = resolve.find(fileKey, csvId, name, fields.currency);
      if (acc) {
        const upd = Object.assign({ id: acc.id }, fields);
        // D5 (N6): the file's name only on an id match, never one another
        // account here uses (that recreates a duplicate), never a mis-decoded
        // one (an ANSI file read as UTF-8 carries U+FFFD).
        if (byId && name !== acc.name && name.indexOf('\uFFFD') === -1
            && !window.Store.findAccountByName(name, acc.id)) {
          upd.name = name;
        }
        window.Store.dispatch('UPDATE_ACCOUNT', upd);
        stats.updated++;
      } else {
        const id = csvId || window.StackdDB.generateId();
        window.Store.dispatch('ADD_ACCOUNT', Object.assign({ id: id, name: name }, fields));
        resolve.claim(fileKey, id, false);
        stats.created++;
      }
      stats.importedCount++;
    });

    return stats;
  },

  isCategoryRows(rows) {
    if (!rows || !rows.length) return false;
    const r = rows[0];
    const has = (k) => Object.prototype.hasOwnProperty.call(r, k);
    return has('name') && has('typehint') && !has('openingbalance') && !has('date') && !has('amount');
  },

  // 1.0.1 (BUG-11): how category names compare (trimmed, case-insensitive).
  _categoryNameKey(name) {
    return String(name || '').trim().toLowerCase();
  },

  buildCategories(rows) {
    const stats = { importedCount: 0, skippedCount: 0, skipped: {}, created: 0, updated: 0 };
    const skip = (reason) => {
      stats.skippedCount++;
      stats.skipped[reason] = (stats.skipped[reason] || 0) + 1;
    };
    const HINTS = ['income', 'expense', 'both'];
    const nameKey = (name) => this._categoryNameKey(name);

    // 1.0.1 (BUG-11): a backup can hold two categories with the same name
    // (the UI used to allow it). Upserting both by name made the second row
    // overwrite the first one's icon. Keep ONE row per name: the row whose id
    // is the existing same-name category (so a seeded default beats a custom
    // duplicate), else the first in file order; skip the rest. Transactions,
    // budgets and rules reference categories by name, so they merge anyway.
    const keepRow = new Map();
    const stateCats = window.Store.getState().categories;
    rows.forEach((row, i) => {
      const key = nameKey(row['name']);
      if (!key) return;
      const id = String(row['id'] || '').trim();
      const matchesExisting = !!id && stateCats.some(c => c.id === id && nameKey(c.name) === key);
      const kept = keepRow.get(key);
      if (kept === undefined || (matchesExisting && !kept.matchesExisting)) {
        keepRow.set(key, { index: i, matchesExisting: matchesExisting });
      }
    });

    rows.forEach((row, i) => {
      const name = String(row['name'] || '').trim();
      if (!name) { skip('missing name'); return; }
      const key = nameKey(name);
      if (keepRow.get(key).index !== i) { skip('duplicate category name'); return; }
      const id = String(row['id'] || '').trim();
      const icon = String(row['icon'] || '').trim();
      const hint = String(row['typehint'] || '').trim().toLowerCase();
      const typeHint = HINTS.includes(hint) ? hint : null;

      // Matching stays by name (renamed defaults, foreign CSVs, categories the
      // transactions file created first); the id only breaks a tie when this
      // install already holds same-named categories.
      const cats = window.Store.getState().categories;
      const sameName = (c) => nameKey(c.name) === key;
      const existing = (id && cats.find(c => c.id === id && sameName(c))) || cats.find(sameName);
      if (existing) {
        const upd = { id: existing.id };
        if (icon) upd.icon = icon;
        if (typeHint) upd.typeHint = typeHint;
        window.Store.dispatch('UPDATE_CATEGORY', upd);
        stats.updated++;
      } else {
        window.Store.dispatch('ADD_CATEGORY', { name: name, icon: icon || 'pin', typeHint: typeHint || 'both' });
        stats.created++;
      }
      stats.importedCount++;
    });

    return stats;
  },

  // A Stack'd export with nothing in it is just its header line — the loans
  // or rules file of anyone who has no loans or rules, which is most people.
  // parseCSV rejects a header-only file, so a full restore used to end in
  // "Import failed" on exactly the files that had nothing to lose. Recognise
  // our own headers and report "imported 0" instead; anything else still
  // fails as before.
  _stackdKindOfHeaderOnly(csvText) {
    const { delimiter, records } = this._readRecords(csvText); // 1.0.2 (BUG-33)
    if (records.length !== 1) return null;
    const row = {};
    this._parseRow(records[0], delimiter)
      .forEach(h => { row[h.toLowerCase().replace(/[^a-z0-9]/g, '')] = ''; });
    const rows = [row];
    if (this.isLoanRows(rows)) return 'loans';
    if (this.isRuleRows(rows)) return 'rules';
    if (this.isBudgetRows(rows)) return 'budgets';
    if (this.isAccountRows(rows)) return 'accounts';
    if (this.isCategoryRows(rows)) return 'categories';
    if (['date', 'amount', 'account', 'type'].every(k => Object.prototype.hasOwnProperty.call(row, k))) return 'transactions';
    return null;
  },

  importLoans(file, state, onComplete, onError) {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const rows = this.parseCSV(e.target.result);
        const { loans, stats } = this.buildLoans(rows);
        this._releaseOwnedLoanLinks(loans); // 1.0.1 (BUG-02)
        loans.forEach(loan => window.Store.dispatch('ADD_LOAN', loan));
        if (onComplete) onComplete(stats);
      } catch (err) {
        if (onError) onError(err);
      }
    };
    reader.onerror = () => { if (onError) onError(new Error('Failed to read file')); };
    reader.readAsText(file);
  },

  importTransactions(file, state, onComplete, onError) {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const rows = this.parseCSV(e.target.result);
        const { transactions, stats } = this.buildTransactions(rows);

        if (transactions.length > 0) {
          window.Store.dispatch('BATCH_IMPORT_TRANSACTIONS', { transactions: transactions });
        }

        if (onComplete) onComplete(stats);
      } catch (err) {
        if (onError) onError(err);
      }
    };
    reader.onerror = () => { if (onError) onError(new Error("Failed to read file")); };
    reader.readAsText(file);
  },

  // v0.71: one entry point for the single "Import CSV" button — reads the file
  // once and routes on its shape, so a loans export doesn't get parsed as
  // transactions (which would skip every row for a missing date/amount).
  // v0.99: a third route — anything that is neither a loans export nor a
  // Stack'd backup is handed back as a bank statement ({ kind: 'bank' }) for
  // the column-mapping flow; the file itself is never imported blind.
  importCSV(file, state, onComplete, onError) {
    // 1.0.2 (BUG-34, D-U7-5): a restore is ONE change — a file that does not
    // fit, or a route that fails part-way, lands nothing. The routing body
    // reports through these holders; the caller's callbacks run once the
    // change has settled (still synchronously inside onload).
    const done = onComplete;
    const fail = onError;
    let outcome = null;
    onComplete = (result) => { outcome = { result }; };
    onError = (error) => { outcome = { error }; };
    const reader = new FileReader();
    const route = (e) => {
      try {
        const csvText = e.target.result;
        // v1.00: structured statements (camt.053/052 XML, MT940) are sniffed
        // by CONTENT before any CSV parsing — banks hand out .txt/.sta/.xml
        // interchangeably, so the extension proves nothing.
        const fmt = this.sniffFormat(csvText);
        if (fmt === 'camt' || fmt === 'mt940') {
          const statement = fmt === 'camt' ? this.parseCamt(csvText) : this.parseMT940(csvText);
          if (onComplete) onComplete({ kind: 'statement', statement: statement });
          return;
        }
        // v1.19 (A-17): an empty Stack'd export restores as "0 imported"
        // rather than failing (see _stackdKindOfHeaderOnly).
        const emptyKind = this._stackdKindOfHeaderOnly(csvText);
        if (emptyKind) {
          if (onComplete) onComplete({ kind: emptyKind, importedCount: 0, skippedCount: 0, skipped: {}, newAccounts: 0, newCategories: 0 });
          return;
        }
        const rows = this.parseCSV(csvText);
        if (this.isLoanRows(rows)) {
          const { loans, stats } = this.buildLoans(rows);
          // 1.0.2 (BUG-78): a loan already here is not added a second time.
          const fresh = this._skipKnownLoans(loans, stats);
          // 1.0.1 (BUG-02): never two loans on one series (re-import).
          this._releaseOwnedLoanLinks(fresh);
          fresh.forEach(loan => window.Store.dispatch('ADD_LOAN', loan));
          // 1.0.1 (BUG-02): a backup from before LinkedSeriesId (or a loan
          // whose link was released above) relinks by its payment note.
          // Emits coalesce: still one render.
          if (fresh.length > 0) window.Store.dispatch('RELINK_LOAN_SERIES');
          if (onComplete) onComplete({ ...stats, kind: 'loans' });
          return;
        }
        // v1.01: a rules export restores directly — checked before the bank
        // fallback or its two text columns would open the mapping flow.
        if (this.isRuleRows(rows)) {
          const stats = this.buildImportRules(rows);
          if (onComplete) onComplete({ ...stats, kind: 'rules' });
          return;
        }
        // v1.19: a budgets export restores directly too, for the same reason.
        if (this.isBudgetRows(rows)) {
          const stats = this.buildBudgets(rows);
          if (onComplete) onComplete({ ...stats, kind: 'budgets' });
          return;
        }
        // v1.19 (A-17): accounts and categories files restore instead of
        // opening the bank column-mapping flow.
        if (this.isAccountRows(rows)) {
          const stats = this.buildAccounts(rows);
          if (onComplete) onComplete({ ...stats, kind: 'accounts' });
          return;
        }
        if (this.isCategoryRows(rows)) {
          const stats = this.buildCategories(rows);
          if (onComplete) onComplete({ ...stats, kind: 'categories' });
          return;
        }
        // A Stack'd backup is recognised by its own headers; parseCSV squashed
        // them, so presence-of-key is the check (values may be empty).
        const first = rows[0] || {};
        const isBackup = ['date', 'amount', 'account', 'type']
          .every(k => Object.prototype.hasOwnProperty.call(first, k));
        if (isBackup) {
          const { transactions, stats } = this.buildTransactions(rows);
          if (transactions.length > 0) {
            window.Store.dispatch('BATCH_IMPORT_TRANSACTIONS', { transactions: transactions });
            // 1.0.1 (BUG-02): the loans file may have come first.
            window.Store.dispatch('RELINK_LOAN_SERIES');
          }
          if (onComplete) onComplete({ ...stats, kind: 'transactions' });
          return;
        }
        // Bank candidate: needs at least two RAW columns (the squashed row
        // keys can collapse duplicate/empty headers) and one data row.
        const { delimiter, records } = this._readRecords(csvText); // 1.0.2 (BUG-33)
        const rawCols = this._parseRow(records[0], delimiter);
        if (rawCols.length >= 2 && rows.length >= 1) {
          if (onComplete) onComplete({ kind: 'bank', csvText: csvText });
          return;
        }
        if (onError) onError(new Error('unrecognised file'));
      } catch (err) {
        if (onError) onError(err);
      }
    };
    reader.onload = (e) => {
      let landed = false;
      let thrown = null;
      try {
        landed = window.Store.batch(() => {
          route(e);
          if (outcome && outcome.error) throw outcome.error; // roll back whatever the route wrote
        });
      } catch (error) {
        thrown = error || new Error('import failed');
      }
      if (landed) {
        try {
          if (done && outcome) done(outcome.result);
        } catch (error) {
          if (fail) fail(error); // as before: a throwing callback still ends in 'Import failed'
        }
        return;
      }
      const f = window.Store.takeSaveFailure(); // this flow reports it itself
      if (fail) fail(thrown || new Error(window.I18n.t(f && f.quota ? 'others.importStorageFull' : 'storage.failedBody')));
    };
    reader.onerror = () => { if (fail) fail(new Error("Failed to read file")); };
    reader.readAsText(file);
  }
};
