const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext();
  
  // Open Tab A
  const pageA = await context.newPage();
  await pageA.goto('http://localhost:3000');
  
  // Open Tab B
  const pageB = await context.newPage();
  await pageB.goto('http://localhost:3000');

  // Add a listener in Tab B to capture the Storage dispatch
  await pageB.evaluate(() => {
    window.tabBEvents = [];
    window.Store.subscribe(() => {
      window.tabBEvents.push({
        currency: window.Store.state.currency,
        accountCount: window.Store.state.accounts.length
      });
    });
  });

  // Modify data in Tab A using Store and let it save to localStorage
  await pageA.evaluate(() => {
    window.Store.state.currency = 'GBP';
    window.StackdDB.save('currency', 'GBP'); // Triggers storage event
    
    const newAccs = [{ id: '123', name: 'Test Sync Account', balance: 100 }];
    window.Store.state.accounts = newAccs;
    window.StackdDB.save('accounts', newAccs);
  });

  // Wait for propagation
  await pageB.waitForTimeout(1000);

  // Check Tab B
  const tabBState = await pageB.evaluate(() => {
    return {
      currency: window.Store.state.currency,
      accounts: window.Store.state.accounts,
      eventsTriggered: window.tabBEvents.length,
      eventLog: window.tabBEvents
    };
  });

  console.log('\n--- Cross Tab Sync Test Results ---');
  console.log('Tab B Event count:', tabBState.eventsTriggered);
  console.log('Tab B Currency Updated:', tabBState.currency === 'GBP' ? '✅ Pass (GBP)' : `❌ Fail (${tabBState.currency})`);
  console.log('Tab B Accounts Updated:', tabBState.accounts.length === 1 && tabBState.accounts[0].name === 'Test Sync Account' ? '✅ Pass' : '❌ Fail');
  
  await browser.close();
  process.exit((tabBState.currency === 'GBP' && tabBState.accounts.length === 1) ? 0 : 1);
})();
