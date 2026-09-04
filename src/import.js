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

  parseCSV(csvText) {
    const lines = csvText.split(/\r?\n/).filter(line => line.trim() !== '');
    if (lines.length < 2) throw new Error("File is empty or missing headers");

    const delimiter = this._detectDelimiter(lines[0]);

    // v0.68: squash case, spaces and punctuation so 'Transfer Ref', 'transfer_ref'
    // and 'TransferRef' all land on the same key.
    const headers = this._parseRow(lines[0], delimiter).map(h => h.toLowerCase().replace(/[^a-z0-9]/g, ''));
    return lines.slice(1).map(line => {
      const values = this._parseRow(line, delimiter);
      const row = {};
      headers.forEach((header, index) => {
        row[header] = values[index] !== undefined ? values[index] : '';
      });
      return row;
    });
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
  buildTransactions(rows) {
    const stats = { importedCount: 0, newAccounts: 0, newCategories: 0, skippedCount: 0, skipped: {} };
    const skip = (reason) => {
      stats.skippedCount++;
      stats.skipped[reason] = (stats.skipped[reason] || 0) + 1;
    };
    const txs = [];

    rows.forEach(row => {
      const rawDate = row['date'];
      const amountStr = row['amount'];
      const accountName = row['account'];
      // Transfer legs are stored with an empty categoryId — don't invent an
      // "Uncategorized" category for them on the way back in.
      const isTransferLeg = !!String(row['transferref'] || '').trim();
      const categoryName = row['category'] || (isTransferLeg ? '' : 'Uncategorized');
      const note = row['note'] || row['comment'] || '';
      let type = String(row['type'] || 'expense').trim().toLowerCase();

      if (!rawDate || !amountStr || !accountName) { skip('missing date, amount or account'); return; }

      const date = this._normalizeDate(rawDate);
      if (!date) { skip('unrecognised date format'); return; }

      const amount = Math.abs(parseFloat(amountStr));
      if (isNaN(amount)) { skip('invalid amount'); return; }

      // v0.68: 'transfer' is not a type in this data model — a real transfer is a
      // paired expense/income sharing a transferRef. A single row can only name
      // one account, so importing it would create a phantom one-sided expense
      // that quietly shifts the balance. Reject it instead.
      if (type === 'transfer') {
        skip("type 'transfer' needs two paired rows sharing a TransferRef");
        return;
      }
      // Opening balances belong to the account, and the account creation below
      // already writes one — importing a second would double-count it.
      if (type === 'opening_balance') { skip('opening balance rows are owned by the account'); return; }
      if (type !== 'expense' && type !== 'income') type = 'expense';

      // Resolve Account
      let account = window.Store.getState().accounts.find(a => a.name.toLowerCase() === accountName.toLowerCase());
      if (!account) {
        window.Store.dispatch('ADD_ACCOUNT', { name: accountName, openingBalance: 0 });
        account = window.Store.getState().accounts.find(a => a.name.toLowerCase() === accountName.toLowerCase());
        stats.newAccounts++;
      }

      // Resolve Category — icons are Lucide *names* rendered as
      // `<i data-lucide="...">`, so a literal emoji here rendered as a blank box.
      let category = null;
      if (categoryName) {
        category = window.Store.getState().categories.find(c => c.name.toLowerCase() === categoryName.toLowerCase());
        if (!category) {
          window.Store.dispatch('ADD_CATEGORY', { name: categoryName, icon: 'pin', typeHint: 'both' });
          category = window.Store.getState().categories.find(c => c.name.toLowerCase() === categoryName.toLowerCase());
          stats.newCategories++;
        }
      }

      const tx = {
        type: type,
        amount: amount,
        accountId: account.id,
        categoryId: category ? category.id : '',
        date: date,
        comment: note
      };

      const time = this._normalizeTime(row['time']);
      if (time) tx.time = time;

      const tags = this._parseTags(row['tags']);
      if (tags.length) tx.tags = tags;

      if (this._parseBool(row['ispaid']) === false) tx.isPaid = false;

      const csvRef = String(row['transferref'] || '').trim();
      if (csvRef) tx._csvTransferRef = csvRef;

      // v0.99: a backup of bank-imported rows carries their dedup identity —
      // restore it verbatim so a later bank re-import still recognises them.
      // No dedup happens here: restore semantics are unchanged.
      const importKey = String(row['importkey'] || '').trim();
      if (importKey) tx.importKey = importKey;
      const bankRef = String(row['bankref'] || '').trim();
      if (bankRef) tx.bankRef = bankRef;

      const recurrence = this._buildRecurrence(row, date);
      if (recurrence) tx.recurrence = recurrence;

      txs.push(tx);
      stats.importedCount++;
    });

    this._relinkTransfers(txs);
    this._relinkSeries(txs);

    return { transactions: txs, stats: stats };
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

  // v0.68: re-key seriesId the same way, then enforce the one-armed-tail
  // invariant (see the recurrence notes in CLAUDE.md) — two armed members of the
  // same series double the chain on every processing pass.
  _relinkSeries(txs) {
    const seriesMap = {};
    txs.forEach((t, i) => {
      if (!t.recurrence) return;
      const key = t.recurrence.seriesId || `__row${i}`;
      if (!seriesMap[key]) seriesMap[key] = window.StackdDB.generateId();
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

  _num(raw) {
    if (raw === null || raw === undefined || String(raw).trim() === '') return null;
    const n = parseFloat(String(raw).replace(',', '.'));
    return isNaN(n) ? null : n;
  },

  buildLoans(rows) {
    const stats = { importedCount: 0, skippedCount: 0, skipped: {} };
    const skip = (reason) => {
      stats.skippedCount++;
      stats.skipped[reason] = (stats.skipped[reason] || 0) + 1;
    };
    const loans = [];

    rows.forEach((row, i) => {
      const name = String(row['name'] || '').trim() || `Loan ${i + 1}`;
      let config = null;

      const rawConfig = String(row['config'] || '').trim();
      if (rawConfig) {
        try { config = JSON.parse(rawConfig); } catch (e) { config = null; }
      }

      if (!config) {
        // Rebuild from the flat columns
        const principal = this._num(row['principal']);
        const duration = this._num(row['duration']);
        const firstPaymentDate = this._normalizeDate(row['firstpaymentdate']);
        if (principal === null || duration === null || !firstPaymentDate) {
          skip('missing principal, duration or first payment date');
          return;
        }
        const unit = String(row['durationunit'] || '').trim().toLowerCase();
        const amort = String(row['amortization'] || '').trim().toLowerCase();
        const type = String(row['type'] || '').trim().toLowerCase();
        config = {
          type: ['mortgage', 'personal', 'installment'].indexOf(type) === -1 ? 'personal' : type,
          principal: principal,
          downPayment: this._num(row['downpayment']) || 0,
          duration: Math.round(duration),
          durationUnit: unit === 'months' ? 'months' : 'years',
          annualRate: this._num(row['annualrate']) || 0,
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

      loans.push({
        name: name,
        kind: String(row['kind'] || '').trim().toLowerCase() === 'sim' ? 'sim' : 'active',
        config: config
      });
      stats.importedCount++;
    });

    return { loans: loans, stats: stats };
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
    const lines = csvText.split(/\r?\n/).filter(line => line.trim() !== '');
    if (lines.length < 2) throw new Error("File is empty or missing headers");

    const delimiter = this._detectDelimiter(lines[0]);
    const headerLabels = this._parseRow(lines[0], delimiter);
    const rowsRaw = lines.slice(1).map(line => this._parseRow(line, delimiter));

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

      const description = String(row[mapping.description] !== undefined ? row[mapping.description] : '').trim();

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
        categoryId: '',
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
        const rec = { amount: sign * amount, date: dtEl ? dtEl.textContent.trim().slice(0, 10) : '' };
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
        const party = type === 'expense' ? text(first(ntry, 'Cdtr'), 'Nm') : text(first(ntry, 'Dbtr'), 'Nm');
        const ustrd = kids(ntry, 'Ustrd').map(u => u.textContent.trim()).filter(Boolean).join(' ');
        const description = [party, ustrd].filter(Boolean).join(' — ') || text(ntry, 'AddtlNtryInf');

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

      const tx = {
        type: e.type === 'expense' ? 'expense' : 'income',
        amount: amount,
        accountId: accountId,
        categoryId: '',
        date: date,
        comment: String(e.description || '').trim()
      };
      const duplicate = this._stampImportKey(tx, String(e.bankRef || '').trim(), accountId, keyCounts);
      items.push({ tx: tx, duplicate: duplicate, error: null });
      if (duplicate) stats.duplicates++;
      else stats.ok++;
    });

    return { items: items, stats: stats };
  },

  importLoans(file, state, onComplete, onError) {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const rows = this.parseCSV(e.target.result);
        const { loans, stats } = this.buildLoans(rows);
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
    const reader = new FileReader();
    reader.onload = (e) => {
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
        const rows = this.parseCSV(csvText);
        if (this.isLoanRows(rows)) {
          const { loans, stats } = this.buildLoans(rows);
          loans.forEach(loan => window.Store.dispatch('ADD_LOAN', loan));
          if (onComplete) onComplete({ ...stats, kind: 'loans' });
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
          }
          if (onComplete) onComplete({ ...stats, kind: 'transactions' });
          return;
        }
        // Bank candidate: needs at least two RAW columns (the squashed row
        // keys can collapse duplicate/empty headers) and one data row.
        const lines = csvText.split(/\r?\n/).filter(line => line.trim() !== '');
        const rawCols = this._parseRow(lines[0], this._detectDelimiter(lines[0]));
        if (rawCols.length >= 2 && rows.length >= 1) {
          if (onComplete) onComplete({ kind: 'bank', csvText: csvText });
          return;
        }
        if (onError) onError(new Error('unrecognised file'));
      } catch (err) {
        if (onError) onError(err);
      }
    };
    reader.onerror = () => { if (onError) onError(new Error("Failed to read file")); };
    reader.readAsText(file);
  }
};
