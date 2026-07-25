const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

// Mock _fetchWithTimeout
async function _fetchWithTimeout(url, options = {}, timeoutMs = 8000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(id);
    return response;
  } catch (err) {
    clearTimeout(id);
    throw err;
  }
}

// Replicate _fetchQuoteFromYahoo
async function _fetchQuoteFromYahoo(ticker) {
  const symbol = ticker.toUpperCase();
  const yahooUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1d`;
  
  // Replicate environment routing (outside of tests/Vite, we fallback to AllOrigins/CodeTabs)
  const targetUrls = [
    `https://api.allorigins.win/raw?url=${encodeURIComponent(yahooUrl)}`,
    `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(yahooUrl)}`
  ];

  console.log(`[Yahoo Quote] Fetching ${symbol} through proxy rotation...`);
  let lastError = null;
  let resp = null;
  for (const url of targetUrls) {
    try {
      console.log(`  Trying proxy URL: ${url.slice(0, 80)}...`);
      resp = await _fetchWithTimeout(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
      if (resp.ok) {
        lastError = null;
        break;
      } else {
        lastError = new Error(`Proxy HTTP ${resp.status}`);
      }
    } catch (err) {
      lastError = err;
    }
  }
  if (lastError) {
    throw lastError;
  }

  const data = await resp.json();
  const result = data.chart && data.chart.result && data.chart.result[0];
  if (!result || !result.meta) {
    throw new Error('SYMBOL_NOT_FOUND');
  }

  const meta = result.meta;
  const price = meta.regularMarketPrice;
  if (price == null) {
    throw new Error('Yahoo price unavailable');
  }

  const prevClose = meta.chartPreviousClose || price;
  const change = price - prevClose;
  const changePercent = prevClose > 0 ? (change / prevClose) * 100 : 0;

  return {
    price,
    currency: meta.currency || 'USD',
    change,
    changePercent
  };
}

// Replicate _fetchFXFromAPI
async function _fetchFXFromAPI(from, to) {
  const url = `https://api.frankfurter.app/latest?from=${from}&to=${to}`;
  console.log(`[FX API] Fetching exchange rate ${from} -> ${to}...`);
  try {
    const resp = await _fetchWithTimeout(url);
    if (!resp.ok) throw new Error(`FX HTTP ${resp.status}`);
    const data = await resp.json();
    const rate = data.rates && data.rates[to];
    if (!rate) throw new Error(`FX rate ${from}→${to} not found`);
    console.log(`  Frankfurter Succeeded! Rate: ${rate}`);
    return { rate };
  } catch (err) {
    console.warn(`  Frankfurter Failed (${err.message}). Trying Yahoo FX fallback...`);
    try {
      const yahooSymbol = `${from.toUpperCase()}${to.toUpperCase()}=X`;
      const yahooQuote = await _fetchQuoteFromYahoo(yahooSymbol);
      if (yahooQuote && yahooQuote.price != null) {
        console.log(`  Yahoo FX Fallback Succeeded! Rate: ${yahooQuote.price}`);
        return { rate: yahooQuote.price };
      }
    } catch (yahooErr) {
      console.error(`  Yahoo FX Fallback Failed: ${yahooErr.message}`);
    }
    throw err;
  }
}

async function run() {
  try {
    const quote = await _fetchQuoteFromYahoo('NVDA');
    console.log('\n✅ Quote Fetch Success:', quote);
  } catch (e) {
    console.error('\n❌ Quote Fetch Failed:', e.message);
  }

  console.log('--------------------------------------------------');

  try {
    const fx = await _fetchFXFromAPI('USD', 'EUR');
    console.log('\n✅ FX Fetch Success:', fx);
  } catch (e) {
    console.error('\n❌ FX Fetch Failed:', e.message);
  }
}

run();
