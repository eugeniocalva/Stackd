// import.js - CSV Import Logic
window.StackdImport = {
  parseCSV(csvText) {
    const lines = csvText.split(/\r?\n/).filter(line => line.trim() !== '');
    if (lines.length < 2) throw new Error("File is empty or missing headers");

    const delimiter = lines[0].includes(';') ? ';' : ',';
    
    // Simple CSV parser for quoted fields
    const parseRow = (rowStr) => {
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
    };

    // v0.68: squash case, spaces and punctuation so 'Transfer Ref', 'transfer_ref'
    // and 'TransferRef' all land on the same key.
    const headers = parseRow(lines[0]).map(h => h.toLowerCase().replace(/[^a-z0-9]/g, ''));
    return lines.slice(1).map(line => {
      const values = parseRow(line);
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
  }
};
