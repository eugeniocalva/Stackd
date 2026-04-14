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

    const headers = parseRow(lines[0]).map(h => h.toLowerCase().trim());
    return lines.slice(1).map(line => {
      const values = parseRow(line);
      const row = {};
      headers.forEach((header, index) => {
        row[header] = values[index] !== undefined ? values[index] : '';
      });
      return row;
    });
  },

  importTransactions(file, state, onComplete, onError) {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const csvContent = e.target.result;
        const rows = this.parseCSV(csvContent);
        let importedCount = 0;
        let newAccounts = 0;
        let newCategories = 0;

        const newTxs = [];

        // Resolve or create required entities
        rows.forEach(row => {
          const date = row['date'];
          const amountStr = row['amount'];
          let type = (row['type'] || 'expense').toLowerCase();
          const accountName = row['account'];
          const categoryName = row['category'] || 'Uncategorized';
          const note = row['note'] || row['comment'] || '';

          if (!date || !amountStr || !accountName) return; // Skip invalid rows
          
          const amount = Math.abs(parseFloat(amountStr));
          if (isNaN(amount)) return;
          
          if (type !== 'expense' && type !== 'income' && type !== 'transfer') {
            type = 'expense';
          }

          // Resolve Account
          let account = state.accounts.find(a => a.name.toLowerCase() === accountName.toLowerCase());
          if (!account) {
            window.Store.dispatch('ADD_ACCOUNT', { name: accountName, openingBalance: 0 });
            account = window.Store.getState().accounts.find(a => a.name.toLowerCase() === accountName.toLowerCase());
            newAccounts++;
          }

          // Resolve Category
          let category = state.categories.find(c => c.name.toLowerCase() === categoryName.toLowerCase());
          if (!category) {
            window.Store.dispatch('ADD_CATEGORY', { name: categoryName, icon: '📌', typeHint: 'both' });
            category = window.Store.getState().categories.find(c => c.name.toLowerCase() === categoryName.toLowerCase());
            newCategories++;
          }

          newTxs.push({
            type: type,
            amount: amount,
            accountId: account.id,
            categoryId: category.id,
            date: date,
            comment: note
          });
          
          importedCount++;
        });

        if (newTxs.length > 0) {
          window.Store.dispatch('BATCH_IMPORT_TRANSACTIONS', { transactions: newTxs });
        }

        if (onComplete) onComplete({ importedCount, newAccounts, newCategories });
      } catch (err) {
        if (onError) onError(err);
      }
    };
    reader.onerror = () => { if (onError) onError(new Error("Failed to read file")); };
    reader.readAsText(file);
  }
};
