const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

async function testYahooFX() {
  const symbol = 'USDEUR=X';
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=1d`;
  
  console.log(`Testing FX rate fetch from Yahoo Finance for ${symbol}...`);
  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    console.log('Status:', res.status);
    const data = await res.json();
    const result = data.chart && data.chart.result && data.chart.result[0];
    const rate = result?.meta?.regularMarketPrice;
    console.log('Exchange Rate:', rate);
  } catch (err) {
    console.error('Yahoo FX failed:', err.message);
  }
}

testYahooFX();
