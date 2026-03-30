// Market Overview API
// Stocks/ETFs/Futures/Forex: Yahoo Finance (free, no key)
// Crypto: CoinGecko (free, no key)
// Metals: Alpha Vantage CURRENCY_EXCHANGE_RATE for XAU/USD and XAG/USD (ALPHA_VANTAGE_API_KEY)
// Cache-Control: s-maxage=300 (Vercel CDN caches for 5 min)

const COIN_MAP = {
  BTC:  'bitcoin',
  XRP:  'ripple',
  ETH:  'ethereum',
  SOL:  'solana',
  XLM:  'stellar',
  HBAR: 'hedera-hashgraph',
};

// All Yahoo Finance symbols to fetch in one batch
const YF_SYMBOLS = [
  // Indexes / ETFs
  'SPY', 'QQQ', 'DIA', 'IWM',
  // Commodities (futures + ETFs)
  'CL=F', 'NG=F', 'URA', 'CCJ',
  // Tech
  'AAPL', 'MSFT', 'NVDA', 'GOOGL', 'AMZN', 'TSLA',
  // Quantum / Emerging
  'IONQ', 'QBTS', 'RGTI', 'QTUM',
  // Energy
  'XOM', 'CVX', 'NEE',
  // Defense
  'LMT', 'RTX', 'NOC', 'PLTR',
  // Healthcare
  'UNH', 'PFE', 'LLY', 'ISRG',
  // Financials (BRK.B → BRK-B in Yahoo)
  'JPM', 'BRK-B', 'GS',
  // Forex
  'DX-Y.NYB', 'EURUSD=X', 'USDJPY=X', 'GBPJPY=X',
];

// Simple server-side in-process cache (works within a warm serverless instance)
let _cache = null;
let _cacheTs = 0;
const CACHE_MS = 5 * 60 * 1000;

async function fetchYahooFinance() {
  const prices = {};
  const failed = [];
  const symbols = YF_SYMBOLS.join(',');

  try {
    const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(symbols)}&fields=regularMarketPrice,regularMarketPreviousClose,regularMarketChange,regularMarketChangePercent,shortName`;
    const resp = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
        'Accept': 'application/json',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      signal: AbortSignal.timeout(12000),
    });

    if (!resp.ok) {
      YF_SYMBOLS.forEach(s => failed.push(s));
      return { prices, failed };
    }

    const data = await resp.json();
    const results = data?.quoteResponse?.result || [];
    const found = new Set();

    results.forEach(q => {
      const price = q.regularMarketPrice;
      if (price != null && price > 0) {
        const change    = q.regularMarketChange ?? 0;
        const changePct = q.regularMarketChangePercent ?? 0;
        prices[q.symbol] = {
          price,
          change,
          changePct,
          name: q.shortName || q.displayName || q.symbol,
        };
        found.add(q.symbol);
      } else {
        failed.push(q.symbol);
        found.add(q.symbol);
      }
    });

    // Mark any symbols not returned at all as failed
    YF_SYMBOLS.forEach(s => { if (!found.has(s)) failed.push(s); });

  } catch {
    YF_SYMBOLS.forEach(s => failed.push(s));
  }

  return { prices, failed };
}

async function fetchCoinGecko() {
  const prices = {};
  const failed = [];
  const ids = Object.values(COIN_MAP).join(',');

  try {
    const url = `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd&include_24hr_change=true`;
    const resp = await fetch(url, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(10000),
    });
    if (!resp.ok) throw new Error(`CoinGecko ${resp.status}`);
    const data = await resp.json();

    Object.entries(COIN_MAP).forEach(([ticker, cgId]) => {
      const entry = data[cgId];
      if (entry?.usd != null) {
        const price     = entry.usd;
        const changePct = entry.usd_24h_change ?? 0;
        prices[ticker]  = { price, change: price * (changePct / 100), changePct, name: ticker };
      } else {
        failed.push(ticker);
      }
    });
  } catch {
    Object.keys(COIN_MAP).forEach(t => failed.push(t));
  }

  return { prices, failed };
}

async function fetchMetals(apiKey) {
  const prices = {};
  const failed = [];

  const METAL_PAIRS = [
    { from: 'XAU', ticker: 'GOLD',   name: 'Gold ($/oz t)'   },
    { from: 'XAG', ticker: 'SILVER', name: 'Silver ($/oz t)' },
  ];

  // Parallel — only 2 calls, well within AV 5/min free-tier limit
  await Promise.allSettled(METAL_PAIRS.map(async ({ from, ticker, name }) => {
    try {
      const url  = `https://www.alphavantage.co/query?function=CURRENCY_EXCHANGE_RATE&from_currency=${from}&to_currency=USD&apikey=${apiKey}`;
      const resp = await fetch(url, { signal: AbortSignal.timeout(8000) });
      if (!resp.ok) { failed.push(ticker); return; }
      const data  = await resp.json();
      const rate  = data?.['Realtime Currency Exchange Rate']?.['5. Exchange Rate'];
      const price = rate ? parseFloat(rate) : null;
      if (price != null && price > 0) {
        prices[ticker] = { price, change: 0, changePct: 0, name };
      } else {
        failed.push(ticker);
      }
    } catch { failed.push(ticker); }
  }));

  return { prices, failed };
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  // Warm-instance in-process cache
  if (_cache && Date.now() - _cacheTs < CACHE_MS) {
    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=120');
    return res.status(200).json({ ..._cache, cached: true });
  }

  const avApiKey = process.env.ALPHA_VANTAGE_API_KEY;

  const [yfRes, cgRes, mRes] = await Promise.allSettled([
    fetchYahooFinance(),
    fetchCoinGecko(),
    // Metals gracefully skipped (empty) if AV key absent — stocks/crypto still return
    avApiKey ? fetchMetals(avApiKey) : Promise.resolve({ prices: {}, failed: ['GOLD', 'SILVER'] }),
  ]);

  const prices = {};
  const failed = [];

  if (yfRes.status === 'fulfilled') { Object.assign(prices, yfRes.value.prices); failed.push(...yfRes.value.failed); }
  if (cgRes.status === 'fulfilled') { Object.assign(prices, cgRes.value.prices); failed.push(...cgRes.value.failed); }
  if (mRes.status  === 'fulfilled') { Object.assign(prices, mRes.value.prices);  failed.push(...mRes.value.failed);  }

  const result = { prices, failed, timestamp: new Date().toISOString() };
  _cache   = result;
  _cacheTs = Date.now();

  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=120');
  return res.status(200).json(result);
}
