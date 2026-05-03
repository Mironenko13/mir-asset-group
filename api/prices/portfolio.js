// Portfolio price endpoint — dedicated to PORTFOLIO_ALLOCATION tickers only.
//
// Contract:
//   GET /api/prices/portfolio
//   → 200 { prices: { TICKER: priceNumber, ... }, failed: [...], rateLimited: [...], timestamp }
//
// Single source of truth for the ticker list is src/constants/portfolio.js
// (the same file the React hook reads). Stocks/ETFs go through Twelve Data
// in one batch (with a retry pass for any drops); crypto goes through
// CoinGecko's free /simple/price endpoint. Response is cached in-process
// for 60 s to soften Twelve Data rate limits.
//
// Env: TWELVE_DATA_API_KEY (server-side; NOT REACT_APP_-prefixed so it
// stays out of the client bundle).

import { PORTFOLIO_ALLOCATION } from '../../src/constants/portfolio.js';

const ALL_HOLDINGS  = PORTFOLIO_ALLOCATION.flatMap(b => b.holdings.map(h => ({ ticker: h.ticker, bucketId: b.id })));
const STOCK_TICKERS  = ALL_HOLDINGS.filter(h => h.bucketId !== 'crypto').map(h => h.ticker);
const CRYPTO_TICKERS = ALL_HOLDINGS.filter(h => h.bucketId === 'crypto').map(h => h.ticker);

const COIN_MAP = {
  BTC:  'bitcoin',
  XRP:  'ripple',
  ETH:  'ethereum',
  SOL:  'solana',
  XLM:  'stellar',
  HBAR: 'hedera-hashgraph',
};

// In-memory cache survives across warm serverless invocations.
let _cachedPayload = null;
let _cachedTs      = 0;
const CACHE_TTL_MS = 60 * 1000;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function twelveDataBatch(symbols, apiKey) {
  if (!symbols.length) return { prices: {}, failed: [], rateLimited: false, message: null };

  const url = `https://api.twelvedata.com/quote?symbol=${encodeURIComponent(symbols.join(','))}&apikey=${apiKey}`;
  let data;
  try {
    const resp = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (!resp.ok) {
      console.warn(`[portfolio] Twelve Data HTTP ${resp.status}`);
      return { prices: {}, failed: [...symbols], rateLimited: false, message: null };
    }
    data = await resp.json();
  } catch (err) {
    console.warn(`[portfolio] Twelve Data fetch failed: ${err?.message || err}`);
    return { prices: {}, failed: [...symbols], rateLimited: false, message: null };
  }

  // Top-level error envelope → { code, message, status: 'error' }
  if (data && typeof data === 'object' && !Array.isArray(data)
      && data.status === 'error' && typeof data.message === 'string') {
    const isRl = data.code === 429 || /credits|frequency|rate.?limit|run out|exceeded/i.test(data.message);
    console.warn(`[portfolio] Twelve Data ${isRl ? 'rate-limited' : 'error'}: ${data.message}`);
    if (isRl) return { prices: {}, failed: [], rateLimited: true, message: data.message };
    return { prices: {}, failed: [...symbols], rateLimited: false, message: data.message };
  }

  // Single-symbol responses are returned unwrapped (no symbol key).
  const isSingle = symbols.length === 1;
  const prices   = {};
  const failed   = [];
  for (const sym of symbols) {
    const q = isSingle ? data : data?.[sym];
    if (!q || q.status === 'error') { failed.push(sym); continue; }
    const price = parseFloat(q.close);
    if (!(price > 0)) { failed.push(sym); continue; }
    prices[sym] = price;
  }
  return { prices, failed, rateLimited: false, message: null };
}

async function fetchCoinGecko(tickers) {
  if (!tickers.length) return { prices: {}, failed: [] };
  const ids = tickers.map((t) => COIN_MAP[t]).filter(Boolean).join(',');
  if (!ids) return { prices: {}, failed: [...tickers] };
  try {
    const url  = `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd`;
    const resp = await fetch(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(10000) });
    if (!resp.ok) {
      console.warn(`[portfolio] CoinGecko HTTP ${resp.status}`);
      return { prices: {}, failed: [...tickers] };
    }
    const data   = await resp.json();
    const prices = {};
    const failed = [];
    tickers.forEach((t) => {
      const id    = COIN_MAP[t];
      const price = id ? data?.[id]?.usd : null;
      if (typeof price === 'number' && price > 0) prices[t] = price;
      else failed.push(t);
    });
    return { prices, failed };
  } catch (err) {
    console.warn(`[portfolio] CoinGecko fetch failed: ${err?.message || err}`);
    return { prices: {}, failed: [...tickers] };
  }
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  // Serve cached payload while fresh.
  if (_cachedPayload && Date.now() - _cachedTs < CACHE_TTL_MS) {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ ..._cachedPayload, cached: true });
  }

  const apiKey = process.env.TWELVE_DATA_API_KEY;
  if (!apiKey) {
    console.warn('[portfolio] TWELVE_DATA_API_KEY env var not set — stock/ETF batch will fail');
  }

  console.log(`[portfolio] expected ${ALL_HOLDINGS.length} tickers (${STOCK_TICKERS.length} stocks/ETFs, ${CRYPTO_TICKERS.length} crypto)`);

  const [stockResult, cryptoResult] = await Promise.all([
    apiKey
      ? twelveDataBatch(STOCK_TICKERS, apiKey)
      : Promise.resolve({ prices: {}, failed: [...STOCK_TICKERS], rateLimited: false, message: 'TWELVE_DATA_API_KEY not configured' }),
    fetchCoinGecko(CRYPTO_TICKERS),
  ]);

  // Retry pass for stocks Twelve Data dropped in the first batch (the free
  // tier can silently truncate the tail of long batches when the per-minute
  // credit window fills).
  let retryPrices = {};
  let retryFailed = [];
  if (apiKey && !stockResult.rateLimited && stockResult.failed.length > 0) {
    console.log(`[portfolio] retry pass for ${stockResult.failed.length} stocks/ETFs missed on first batch: ${stockResult.failed.join(',')}`);
    await sleep(1500);
    const retry = await twelveDataBatch(stockResult.failed, apiKey);
    retryPrices = retry.prices;
    retryFailed = retry.failed;
  } else {
    retryFailed = [...stockResult.failed];
  }

  const prices = { ...stockResult.prices, ...retryPrices, ...cryptoResult.prices };
  const failed = [...retryFailed, ...cryptoResult.failed];
  const rateLimited = stockResult.rateLimited ? [...STOCK_TICKERS] : [];

  console.log(`[portfolio] returning ${Object.keys(prices).length}/${ALL_HOLDINGS.length} tickers`);
  if (failed.length)      console.warn(`[portfolio] failed: ${failed.join(',')}`);
  if (rateLimited.length) console.warn(`[portfolio] rate-limited (whole stock batch): ${stockResult.message}`);

  const payload = {
    prices,
    failed,
    rateLimited,
    timestamp: new Date().toISOString(),
  };

  // Only cache a payload that returned at least some prices.
  if (Object.keys(prices).length > 0) {
    _cachedPayload = payload;
    _cachedTs      = Date.now();
  }

  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).json(payload);
}
