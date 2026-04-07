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
        } else if (txToEdit.isAdjustment || txToEdit.type === 'balance_adjustment' || txToEdit.categoryId === 'cat_balance') {
          initialType = 'balance';
        } else {
          initialType = txToEdit.type;
        }
      }

      const disableToggles = isEdit && (initialType === 'transfer' || initialType === 'balance') ? 'pointer-events: none; opacity: 0.5;' : '';
      
      return \`
        <div class="container animate-fade-in" style="padding-bottom: 100px;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-top: var(--space-4); margin-bottom: var(--space-6);">
            <h1 class="header-title" style="margin: 0;">\${isEdit ? 'Edit Log' : 'New Log'}</h1>
            <a href="#\${isEdit ? 'transactions' : 'dashboard'}" style="color: var(--text-secondary); width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; background: var(--bg-surface); border-radius: 50%;">✕</a>
          </div>
          
          <!-- Type Toggle -->
          <div style="display: flex; background: var(--bg-surface); border-radius: var(--radius-sm); padding: 4px; margin-bottom: var(--space-8); \${disableToggles}">
            <button id="toggle-expense" class="btn btn-danger" style="flex: 1; border-radius: var(--radius-sm); padding: 8px 4px; font-size: 13px;">Expense</button>
            <button id="toggle-income" class="btn" style="flex: 1; color: var(--text-secondary); background: transparent; border-radius: var(--radius-sm); padding: 8px 4px; font-size: 13px;">Income</button>
            <button id="toggle-transfer" class="btn" style="flex: 1; color: var(--text-secondary); background: transparent; border-radius: var(--radius-sm); padding: 8px 4px; font-size: 13px;">Transfer</button>
            <button id="toggle-balance" class="btn" style="flex: 1; color: var(--text-secondary); background: transparent; border-radius: var(--radius-sm); padding: 8px 4px; font-size: 13px;">Balance</button>
          </div>
          
          <input type="hidden" id="tx-type" value="\${initialType}">
          \${isEdit ? \`<input type="hidden" id="tx-edit-id" value="\${editId}">\` : ''}
          \${isEdit && initialType==='transfer' ? \`<input type="hidden" id="tx-transfer-ref" value="\${txToEdit.transferRef}">\` : ''}
          
          <!-- Large Amount Input -->
          <div class="amount-input-group">
            <span id="currency-symbol" style="position: absolute; color: var(--text-tertiary); font-size: var(--text-2xl); font-family: var(--font-family-display); margin-top: 24px; margin-left: -32px;">$</span>
            <input type="number" id="tx-amount" class="amount-input text-expense" placeholder="0.00" step="0.01" inputmode="decimal" value="\${initialAmount}">
          </div>
          
          <div class="card" style="margin-bottom: var(--space-6);">
            <div class="form-group" id="group-account">
              <label class="form-label" id="label-account">Account</label>
              <select id="tx-account" class="form-control" style="appearance: none;">
                \${createAccountOptions(state.accounts, initialAccount)}
              </select>
            </div>
            
            <div class="form-group" id="group-transfer-to" style="display: none;">
              <label class="form-label">To Account</label>
              <select id="tx-transfer-to" class="form-control" style="appearance: none;">
                \${createAccountOptions(state.accounts, initialToAccount)}
              </select>
            </div>
            
            <div class="form-group" id="group-category">
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
      const btnBalance = document.getElementById('toggle-balance');
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
        [btnExpense, btnIncome, btnTransfer, btnBalance].forEach(btn => {
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
          amountInput.className = 'amount-input';
          groupCategory.style.display = 'none';
          groupTransferTo.style.display = 'block';
          labelAccount.textContent = 'From Account';
        } else if (type === 'balance') {
          btnBalance.className = 'btn btn-primary';
          btnBalance.style.color = '';
          btnBalance.style.background = '';
          amountInput.className = 'amount-input';
          groupCategory.style.display = 'none';
          groupTransferTo.style.display = 'none';
          labelAccount.textContent = 'Target Account';
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
      btnBalance.addEventListener('click', () => { typeInput.value = 'balance'; updateUIVisibility(); });
      
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
        if (isNaN(amount) || amount <= 0 && type !== 'balance') { // Balance can be 0 or negative
          amountInput.style.backgroundColor = 'var(--color-expense-bg)';
          setTimeout(() => amountInput.style.backgroundColor = 'transparent', 1000);
          return;
        }
        
        const date = document.getElementById('tx-date').value;
        const comment = document.getElementById('tx-comment').value.trim();
        const accountId = document.getElementById('tx-account').value;
        const categoryId = categorySelect.value;
        
        const editIdInput = document.getElementById('tx-edit-id');
        const isEdit = !!editIdInput;
        const targetId = isEdit ? editIdInput.value : null;

        if (type === 'transfer') {
          const toAccountId = document.getElementById('tx-transfer-to').value;
          if (accountId === toAccountId) {
            alert("Cannot transfer to the same account.");
            return;
          }
          
          if (isEdit) {
            const transferRef = document.getElementById('tx-transfer-ref').value;
            // The sender leg (Expense)
            const senderPayload = {
              id: targetId, // if we tapped the sender leg originally
              amount: amount,
              accountId: accountId,
              date: date,
              comment: comment,
            };
            // Updating a transfer involves dispatching UPDATE_TRANSACTION on whichever leg, and state logic updates counterpart
            // Wait, Store UPDATE_TRANSACTION logic uses the payload's ID, and checks transferRef, and patches counterpart's shared fields.
            // But if the user altered the "From Account" and "To Account", we need to selectively patch BOTH legs' accountIds.
            // Since store only blindly patches counterpart amount/date/note, let's dispatch explicit UPDATE for both if we know them.
            // Actually, for simplicity overriding our store logic limitations, we can DELETE the old transfer and ADD a new one perfectly, 
            // BUT that breaks chronological insertion ID sorting somewhat. 
            // It's safer to just let STORE do what STORE does or patch it manually here using an explicit TRANSFER_UPDATE payload if we had one.
            // For now, let's do a trick: dispatch UPDATE on the main item. Then also manually trigger UPDATE on counterpart.
            window.Store.dispatch('UPDATE_TRANSACTION', {
              id: targetId,
              amount: amount,
              accountId: accountId,
              date: date,
              comment: comment || 'Transfer Out'
            });
            // Also explicitly update the counterpart account just in case! (Because the store only syncs amount & date)
            window.Store.dispatch('UPDATE_TRANSACTION', {
               id: transferRef, 
               accountId: toAccountId,
               comment: comment || 'Transfer In'
            });

          } else {
             const transferId = window.StackdDB.generateId();
             // Outgoing (Expense)
             window.Store.dispatch('ADD_TRANSACTION', {
               type: 'expense',
               amount: amount,
               accountId: accountId,
               categoryId: null, // Transfers don't strictly need a category
               date: date,
               comment: comment || 'Transfer Out',
               transferRef: transferId
             });
             // Incoming (Income)
             window.Store.dispatch('ADD_TRANSACTION', {
               type: 'income',
               amount: amount,
               accountId: toAccountId,
               categoryId: null,
               date: date,
               comment: comment || 'Transfer In',
               transferRef: transferId
             });
          }
          
        } else if (type === 'balance') {
          
          if (isEdit) {
             window.Store.dispatch('UPDATE_TRANSACTION', {
                id: targetId,
                amount: amount,
                accountId: accountId,
                date: date,
                comment: comment || 'Manual Balance Adjustment'
             });
          } else {
            const currentBalance = window.Store.getAccountBalance(accountId);
            const difference = amount - currentBalance;
            
            if (difference !== 0) {
              window.Store.dispatch('ADD_TRANSACTION', {
                type: difference > 0 ? 'balance_adjustment' : 'expense',
                amount: Math.abs(difference),
                accountId: accountId,
                categoryId: 'cat_balance',
                date: date,
                comment: comment || 'Manual Balance Adjustment',
                isAdjustment: true
              });
            }
          }
          
        } else {
          // Normal Expense or Income
          if (isEdit) {
            window.Store.dispatch('UPDATE_TRANSACTION', {
              id: targetId,
              type: type, // allowed to switch between expense / income
              amount: amount,
              accountId: accountId,
              categoryId: categoryId,
              date: date,
              comment: comment
            });
          } else {
            window.Store.dispatch('ADD_TRANSACTION', {
              type: type,
              amount: amount,
              accountId: accountId,
              categoryId: categoryId,
              date: date,
              comment: comment
            });
          }
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
  },`;

const startIdx = content.indexOf('  AddTransactionView: {');
const endIdx = content.indexOf('};\n\n// Extend Views with v0.3 screens') + 1;

if (startIdx !== -1 && endIdx !== 0) {
  content = content.substring(0, startIdx) + newAddTransactionView + content.substring(endIdx);
  fs.writeFileSync(targetFile, content, 'utf8');
  console.log('Successfully patched AddTransactionView');
} else {
  console.log('Could not find bounds');
}
