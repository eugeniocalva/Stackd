const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

async function testFetch() {
  const symbol = 'BTC-USD';
  const yahooUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=1d`;
  const corsProxyUrl = `https://corsproxy.io/?url=${encodeURIComponent(yahooUrl)}`;

  console.log('Testing corsproxy.io fetch with ?url= for BTC-USD...');
  try {
    const res = await fetch(corsProxyUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    console.log('CorsProxy status:', res.status);
    const data = await res.json();
    const result = data.chart && data.chart.result && data.chart.result[0];
    console.log('CorsProxy Price:', result?.meta?.regularMarketPrice);
  } catch (err) {
    console.error('CorsProxy failed:', err.message);
  }
}

testFetch();
