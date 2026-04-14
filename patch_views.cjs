const fs = require('fs');
const path = require('path');

const targetFile = 'c:/Users/ecalvaresi/OneDrive - Intellias/Desktop/Projects/Stackd/src/views.js';
let content = fs.readFileSync(targetFile, 'utf8');

// The replacement for AddTransactionView
const newAddTransactionView = `  AddTransactionView: {
    render(state) {
      if (state.accounts.length === 0) {
        return \`
          <div class="container animate-fade-in" style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; text-align: center;">
            <div style="font-size: 3rem; margin-bottom: 16px;">🏦</div>
            <h2 style="margin-bottom: 8px;">Create an Account First</h2>
            <p class="text-secondary" style="margin-bottom: 24px;">You need an account to log a transaction.</p>
            <a href="#accounts" class="btn btn-primary" style="width: auto;">Go to Accounts</a>
          </div>
        \`;
      }
      
      const params = window.Router ? window.Router.getParams() : {};
      const editId = params.id;
      const txToEdit = editId ? state.transactions.find(t => t.id === editId) : null;
      
      if (editId && !txToEdit) {
        return \`<div class="container animate-fade-in" style="padding-top: 40px; text-align: center;"><p>Transaction not found.</p><a href="#transactions" class="btn btn-primary" style="display: inline-block; width: auto; padding: 8px 16px;">Go Back</a></div>\`;
      }
      
      const isEdit = !!txToEdit;
      
      // Setup initial values
      let initialType = 'expense';
      let initialAmount = '';
      let initialDate = new Date().toISOString().split('T')[0];
      let initialNote = '';
      let initialAccount = '';
      let initialCategory = '';
      let initialToAccount = '';
      
      if (txToEdit) {
        initialAmount = Math.abs(txToEdit.amount);
        initialDate = txToEdit.date;
        initialNote = txToEdit.comment || txToEdit.note || '';
        initialAccount = txToEdit.accountId;
        initialCategory = txToEdit.categoryId || '';
        
        if (txToEdit.transferRef) {
          initialType = 'transfer';
          // Find the counterpart to know the other account
          const counterpart = state.transactions.find(t => t.id === txToEdit.transferRef);
          if (counterpart) {
            // "Expense" side of a transfer is the "From" account
            if (txToEdit.type === 'expense') {
              initialAccount = txToEdit.accountId;
              initialToAccount = counterpart.accountId;
            } else {
              // We tapped the "Income" side. Flip it so the form shows cleanly.
              initialAccount = counterpart.accountId;
              initialToAccount = txToEdit.accountId;
            }
          }
        } else {
          initialType = txToEdit.type === 'opening_balance' ? 'income' : txToEdit.type;
        }
      }

      const disableToggles = ''; // Allow switching even in edit mode now that save logic is improved
      
      return \`
        <div class="container animate-fade-in" style="padding-bottom: 100px;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-top: var(--space-4); margin-bottom: var(--space-6);">
            <h1 class="header-title" style="margin: 0;">\${isEdit ? 'Edit Log' : 'New Log'}</h1>
            <a href="#\${isEdit ? 'transactions' : 'dashboard'}" style="color: var(--text-secondary); width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; background: var(--bg-surface); border-radius: 50%;">✕</a>
          </div>
          
          <!-- Type Toggle -->
          <div style="display: flex; background: var(--bg-surface); border-radius: var(--radius-sm); padding: 4px; margin-bottom: var(--space-8); \${disableToggles}">
            <button id="toggle-expense" class="btn \${initialType === 'expense' ? 'btn-danger' : ''}" style="flex: 1; border-radius: var(--radius-sm); padding: 8px 4px; font-size: 13px; color: \${initialType === 'expense' ? '' : 'var(--text-secondary)'}; background: \${initialType === 'expense' ? '' : 'transparent'};">Expense</button>
            <button id="toggle-income" class="btn \${initialType === 'income' ? 'btn-income' : ''}" style="flex: 1; border-radius: var(--radius-sm); padding: 8px 4px; font-size: 13px; color: \${initialType === 'income' ? '' : 'var(--text-secondary)'}; background: \${initialType === 'income' ? '' : 'transparent'};">Income</button>
            <button id="toggle-transfer" class="btn \${initialType === 'transfer' ? 'btn-primary' : ''}" style="flex: 1; border-radius: var(--radius-sm); padding: 8px 4px; font-size: 13px; color: \${initialType === 'transfer' ? '' : 'var(--text-secondary)'}; background: \${initialType === 'transfer' ? '' : 'transparent'};">Transfer</button>
          </div>
          
          <input type="hidden" id="tx-type" value="\${initialType}">
          \${isEdit ? \`<input type="hidden" id="tx-edit-id" value="\${editId}">\` : ''}
          \${isEdit && initialType==='transfer' ? \`<input type="hidden" id="tx-transfer-ref" value="\${txToEdit.transferRef}">\` : ''}
          
          <!-- Large Amount Input -->
          <div class="amount-input-group">
            <span id="currency-symbol" style="color: var(--text-tertiary); font-size: var(--text-2xl); font-family: var(--font-family-display);">\${window.Store.getCurrencySymbol()}</span>
            <input type="number" id="tx-amount" class="amount-input \${initialType === 'expense' ? 'text-expense' : (initialType === 'income' ? 'text-income' : 'text-transfer')}" placeholder="0.00" step="0.01" inputmode="decimal" value="\${initialAmount}" style="width: auto; max-width: 200px;">
          </div>
          
          <div class="card" style="margin-bottom: var(--space-6);">
            <div class="form-group" id="group-account">
              <label class="form-label" id="label-account">\${initialType === 'transfer' ? 'From Account' : 'Account'}</label>
              <select id="tx-account" class="form-control" style="appearance: none;">
                \${createAccountOptions(state.accounts, initialAccount)}
              </select>
            </div>
            
            <div class="form-group" id="group-transfer-to" style="display: \${initialType === 'transfer' ? 'block' : 'none'};">
              <label class="form-label">To Account</label>
              <select id="tx-transfer-to" class="form-control" style="appearance: none;">
                \${createAccountOptions(state.accounts, initialToAccount)}
              </select>
            </div>
            
            <div class="form-group" id="group-category" style="display: \${initialType === 'transfer' ? 'none' : 'block'};">
              <label class="form-label" style="display:flex; justify-content: space-between;">
                <span>Category</span>
                <span id="btn-add-category" style="color: var(--color-accent); cursor: pointer;">+ Add custom</span>
              </label>
              <select id="tx-category" class="form-control" style="appearance: none;" data-initial="\${initialCategory}">
                <!-- Will be populated via JS based on type -->
              </select>
            </div>
            
            <div class="form-group">
              <label class="form-label">Date</label>
              <input type="date" id="tx-date" class="form-control" value="\${initialDate}">
            </div>
            
            <div class="form-group" style="margin-bottom: 0;">
              <label class="form-label">Note (Optional)</label>
              <input type="text" id="tx-comment" class="form-control" placeholder="What was this for?" value="\${initialNote}">
            </div>
          </div>
          
          <button id="btn-save-tx" class="btn btn-primary" style="width: 100%; padding: var(--space-4); font-size: 1.1rem; border-radius: var(--radius-lg); margin-bottom: 8px;">\${isEdit ? 'Update Transaction' : 'Save Transaction'}</button>
          
          \${isEdit ? \`
            <button id="btn-delete-tx" class="btn" style="width: 100%; padding: var(--space-4); color: var(--color-expense); background: var(--color-expense-bg); border-radius: var(--radius-lg); font-weight: 600;">Delete Transaction</button>
          \` : ''}
        </div>
      \`;
    },
    attachEvents(container, state) {
      if (state.accounts.length === 0) return;
      
      const btnExpense = document.getElementById('toggle-expense');
      const btnIncome = document.getElementById('toggle-income');
      const btnTransfer = document.getElementById('toggle-transfer');
      const typeInput = document.getElementById('tx-type');
      const amountInput = document.getElementById('tx-amount');
      const categorySelect = document.getElementById('tx-category');
      const groupCategory = document.getElementById('group-category');
      const groupTransferTo = document.getElementById('group-transfer-to');
      const labelAccount = document.getElementById('label-account');
      const btnSave = document.getElementById('btn-save-tx');
      const btnDelete = document.getElementById('btn-delete-tx');
      const btnAddCategory = document.getElementById('btn-add-category');
      
      // Update categories based on Type
      const updateCategories = () => {
        const type = typeInput.value;
        const filteredCategories = state.categories.filter(c => c.typeHint === type || c.typeHint === 'both');
        // Retrieve initial selection constraint
        const initialSelected = categorySelect.getAttribute('data-initial');
        categorySelect.innerHTML = createCategoryOptions(filteredCategories, initialSelected);
      };
      
      // Update UI visibility based on Type
      const updateUIVisibility = () => {
        const type = typeInput.value;
        
        // Reset styles for all buttons
        [btnExpense, btnIncome, btnTransfer].forEach(btn => {
          btn.className = 'btn';
          btn.style.color = 'var(--text-secondary)';
          btn.style.background = 'transparent';
        });
        
        // Apply active style
        if (type === 'expense') {
          btnExpense.className = 'btn btn-danger';
          btnExpense.style.color = ''; 
          btnExpense.style.background = '';
          amountInput.className = 'amount-input text-expense';
          groupCategory.style.display = 'block';
          groupTransferTo.style.display = 'none';
          labelAccount.textContent = 'Account';
        } else if (type === 'income') {
          btnIncome.className = 'btn btn-income';
          btnIncome.style.color = '';
          btnIncome.style.background = '';
          amountInput.className = 'amount-input text-income';
          groupCategory.style.display = 'block';
          groupTransferTo.style.display = 'none';
          labelAccount.textContent = 'Account';
        } else if (type === 'transfer') {
          btnTransfer.className = 'btn btn-primary';
          btnTransfer.style.color = '';
          btnTransfer.style.background = '';
          amountInput.className = 'amount-input text-transfer';
          groupCategory.style.display = 'none';
          groupTransferTo.style.display = 'block';
          labelAccount.textContent = 'From Account';
        }
        
        updateCategories();
      };
      
      // Initial populate
      updateUIVisibility();
      
      // Focus amount on load if not edit
      if (!document.getElementById('tx-edit-id')) {
        setTimeout(() => amountInput.focus(), 100);
      }
      
      // Type Toggle handlers
      btnExpense.addEventListener('click', () => { typeInput.value = 'expense'; updateUIVisibility(); });
      btnIncome.addEventListener('click', () => { typeInput.value = 'income'; updateUIVisibility(); });
      btnTransfer.addEventListener('click', () => { typeInput.value = 'transfer'; updateUIVisibility(); });
      
      // Add custom category
      btnAddCategory.addEventListener('click', () => {
        window.Components.Modal.show({
          title: 'New Category',
          content: \`
            <div class="form-group">
              <label class="form-label">Category Name</label>
              <input type="text" id="new-cat-name" class="form-control" placeholder="e.g. Subscriptions">
            </div>
            <div class="form-group">
              <label class="form-label">Icon (Emoji)</label>
              <input type="text" id="new-cat-icon" class="form-control" placeholder="📱" maxlength="2">
            </div>
          \`,
          onSave: (closeModal) => {
            const name = document.getElementById('new-cat-name').value.trim();
            const icon = document.getElementById('new-cat-icon').value.trim() || '📌';
            if (name) {
              window.Store.dispatch('ADD_CATEGORY', { 
                name, 
                icon, 
                typeHint: typeInput.value 
              });
              
              setTimeout(() => {
                const latestState = window.Store.getState();
                const filteredCategories = latestState.categories.filter(c => 
                  c.typeHint === typeInput.value || c.typeHint === 'both'
                );
                const newestCat = latestState.categories[latestState.categories.length - 1];
                categorySelect.setAttribute('data-initial', newestCat.id);
                updateCategories();
              }, 50);
              
              closeModal();
            }
          }
        });
      });
      
      // Save Transaction
      btnSave.addEventListener('click', () => {
        const type = typeInput.value;
        const amount = parseFloat(amountInput.value);
        if (isNaN(amount) || amount <= 0) {
          amountInput.style.backgroundColor = 'var(--color-expense-bg)';
          setTimeout(() => amountInput.style.backgroundColor = 'transparent', 1000);
          return;
        }

        const accountId = document.getElementById('tx-account').value;
        const toAccountId = document.getElementById('tx-transfer-to').value;
        const categoryId = categorySelect.value;
        const date = document.getElementById('tx-date').value;
        const comment = document.getElementById('tx-comment').value;
        const editIdInput = document.getElementById('tx-edit-id');
        const isEdit = !!editIdInput;
        const targetId = isEdit ? editIdInput.value : null;
        const recurrenceData = window.Components.Recurrence ? window.Components.Recurrence.getData() : null;

        if (type === 'transfer') {
          if (accountId === toAccountId) {
            alert("Cannot transfer to the same account.");
            return;
          }

          if (isEdit) {
            const transferRef = document.getElementById('tx-transfer-ref')?.value;
            if (transferRef) {
              // Existing transfer - use dedicated update
              window.Store.dispatch('UPDATE_TRANSFER', {
                transferRef,
                amount,
                expenseAccountId: accountId,
                incomeAccountId: toAccountId,
                date,
                note: comment,
                recurrence: recurrenceData
              });
            } else {
              // Converting regular tx to transfer - delete original and add new transfer
              window.Store.dispatch('DELETE_TRANSACTION', { id: targetId });
              window.Store.dispatch('ADD_TRANSFER', {
                amount,
                expenseAccountId: accountId,
                incomeAccountId: toAccountId,
                date,
                note: comment,
                recurrence: recurrenceData
              });
            }
          } else {
            // New transfer
            window.Store.dispatch('ADD_TRANSFER', {
              amount,
              expenseAccountId: accountId,
              incomeAccountId: toAccountId,
              date,
              note: comment,
              recurrence: recurrenceData
            });
          }
        } else if (isEdit) {
          window.Store.dispatch('UPDATE_TRANSACTION', {
            id: targetId,
            type: type,
            amount: amount,
            accountId: accountId,
            categoryId: categoryId,
            date: date,
            comment: comment,
            recurrence: recurrenceData
          });
        } else {
          window.Store.dispatch('ADD_TRANSACTION', {
            type: type,
            amount: amount,
            accountId: accountId,
            categoryId: categoryId,
            date: date,
            comment: comment,
            recurrence: recurrenceData
          });
        }
        
        window.Router.navigate('#transactions');
      });

      if (btnDelete) {
        btnDelete.addEventListener('click', () => {
          window.Components.Modal.show({
            title: 'Delete Transaction?',
            content: '<p>Do you want to delete this transaction? This action cannot be undone.</p>',
            saveText: 'Keep',
            showDelete: true,
            onSave: (closeModal) => closeModal(),
            onDelete: (closeModal) => {
              window.Store.dispatch('DELETE_TRANSACTION', { id: document.getElementById('tx-edit-id').value });
              closeModal();
              window.Router.navigate('#transactions');
            }
          });
        });
      }
    }
  }
};`;

const startIdx = content.indexOf('AddTransactionView: {');
const endIdx = content.indexOf('// Extend Views with v0.3 screens');

if (startIdx !== -1 && endIdx !== 0) {
  content = content.substring(0, startIdx) + newAddTransactionView + content.substring(endIdx);
  fs.writeFileSync(targetFile, content, 'utf8');
  console.log('Successfully patched AddTransactionView');
} else {
  console.log('Could not find bounds');
}
