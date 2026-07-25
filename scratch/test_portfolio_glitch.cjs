const { chromium } = require('@playwright/test');

async function run() {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  
  page.on('pageerror', err => {
    console.log('BROWSER EXCEPTION:', err);
  });
  
  page.on('console', msg => {
    console.log(`BROWSER CONSOLE [${msg.type()}]:`, msg.text());
  });

  await page.goto('http://localhost:3000/');
  
  await page.evaluate(() => {
    localStorage.clear();
    localStorage.setItem('stackd_v1_setup_done', '1');
    window.location.reload();
  });
  
  await page.waitForSelector('#bottom-nav');
  
  // Seed account and asset
  await page.evaluate(() => {
    window.Store.dispatch('ADD_ACCOUNT', {
      name: 'Main Bank',
      openingBalance: 1000,
      openingDate: '2026-07-15'
    });
    window.Store.dispatch('ADD_HOLDING', {
      ticker: 'AAPL',
      name: 'Apple',
      assetType: 'stock',
      quantity: 10,
      buyInPrice: 150,
      buyInCurrency: 'USD',
      buyDate: '2026-07-15',
      accountId: window.Store.state.accounts[0].id
    });
  });
  
  console.log('Navigating to #portfolio...');
  await page.goto('http://localhost:3000/#portfolio');
  await page.waitForTimeout(2000);
  
  console.log('Closing browser...');
  await browser.close();
}

run().catch(console.error);
