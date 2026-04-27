// Market Overview API — all data handled server-side, one combined response
//
// Sources:
//   Crypto       → CoinGecko (free, no key) — runs in parallel
//   Stocks/ETFs  → Alpha Vantage GLOBAL_QUOTE, sequential, 1 s apart
//   Metals       → Alpha Vantage CURRENCY_EXCHANGE_RATE (XAU/USD, XAG/USD)
//   Oil & Gas    → Alpha Vantage WTI + NATURAL_GAS function endpoints
//   Forex        → Alpha Vantage CURRENCY_EXCHANGE_RATE (EUR/USD, USD/JPY, GBP/JPY)
//   DXY proxy    → UUP ETF via GLOBAL_QUOTE, stored under 'DX-Y.NYB' key
//
// Rate-limit handling: 1 s delay between calls; if AV returns a rate-limit
// Note/Information message, wait 12 s and retry once per ticker.
//
// Per-ticker cache persists across warm serverless invocations (in-process Map).
// Time budget: bail out after BUDGET_MS so the function never hard-times-out.

const COIN_MAP = {
  BTC:  'bitcoin',
  XRP:  'ripple',
  ETH:  'ethereum',
  SOL:  'solana',
  XLM:  'stellar',
  HBAR: 'hedera-hashgraph',
};

// Ordered task list — priority order ensures the most visible sections
// (Indexes, Commodities/Metals) are fetched first within any time budget.
const AV_TASKS = [
  // ── Metals (CURRENCY_EXCHANGE_RATE) ────────────────────────────────────────
  { type: 'fx',  from: 'XAU', to: 'USD', tk: 'GOLD',     name: 'Gold ($/oz t)'   },
  { type: 'fx',  from: 'XAG', to: 'USD', tk: 'SILVER',   name: 'Silver ($/oz t)' },
  // ── Oil & Gas (commodity function endpoints) ─────────────────────────────
  { type: 'cmd', fn: 'WTI',         tk: 'CL=F', name: 'Crude Oil WTI' },
  { type: 'cmd', fn: 'NATURAL_GAS', tk: 'NG=F', name: 'Natural Gas'   },
  // ── Indexes ──────────────────────────────────────────────────────────────
  { type: 'eq',  sym: 'SPY' },
  { type: 'eq',  sym: 'QQQ' },
  { type: 'eq',  sym: 'DIA' },
  { type: 'eq',  sym: 'IWM' },
  // ── Commodity ETFs ────────────────────────────────────────────────────────
  { type: 'eq',  sym: 'URA' },
  { type: 'eq',  sym: 'CCJ' },
  // ── Tech ──────────────────────────────────────────────────────────────────
  { type: 'eq',  sym: 'AAPL'  },
  { type: 'eq',  sym: 'MSFT'  },
  { type: 'eq',  sym: 'NVDA'  },
  { type: 'eq',  sym: 'GOOGL' },
  { type: 'eq',  sym: 'AMZN'  },
  { type: 'eq',  sym: 'TSLA'  },
  // ── Forex (CURRENCY_EXCHANGE_RATE + UUP proxy for DXY) ───────────────────
  { type: 'eq',  sym: 'UUP', tk: 'DX-Y.NYB', name: 'Dollar Index (UUP)' },
  { type: 'fx',  from: 'EUR', to: 'USD', tk: 'EURUSD=X', name: 'EUR / USD' },
  { type: 'fx',  from: 'USD', to: 'JPY', tk: 'USDJPY=X', name: 'USD / JPY' },
  { type: 'fx',  from: 'GBP', to: 'JPY', tk: 'GBPJPY=X', name: 'GBP / JPY' },
  // ── Quantum / Emerging ────────────────────────────────────────────────────
  { type: 'eq',  sym: 'IONQ' },
  { type: 'eq',  sym: 'QBTS' },
  { type: 'eq',  sym: 'RGTI' },
  { type: 'eq',  sym: 'QTUM' },
  // ── Energy ────────────────────────────────────────────────────────────────
  { type: 'eq',  sym: 'XOM' },
  { type: 'eq',  sym: 'CVX' },
  { type: 'eq',  sym: 'NEE' },
  // ── Defense ───────────────────────────────────────────────────────────────
  { type: 'eq',  sym: 'LMT'  },
  { type: 'eq',  sym: 'RTX'  },
  { type: 'eq',  sym: 'NOC'  },
  { type: 'eq',  sym: 'PLTR' },
  // ── Healthcare ────────────────────────────────────────────────────────────
  { type: 'eq',  sym: 'UNH'  },
  { type: 'eq',  sym: 'PFE'  },
  { type: 'eq',  sym: 'LLY'  },
  { type: 'eq',  sym: 'ISRG' },
  // ── Financials ────────────────────────────────────────────────────────────
  { type: 'eq',  sym: 'JPM'   },
  { type: 'eq',  sym: 'BRK-B' },
  { type: 'eq',  sym: 'GS'    },
  // ── Landing portfolio holdings (broad-market ETFs + extras) ───────────────
  { type: 'eq',  sym: 'VTI'   },
  { type: 'eq',  sym: 'AMD'   },
  { type: 'eq',  sym: 'SMCI'  },
  { type: 'eq',  sym: 'SCHD'  },
  { type: 'eq',  sym: 'JEPI'  },
  { type: 'eq',  sym: 'O'     },
  { type: 'eq',  sym: 'MO'    },
  { type: 'eq',  sym: 'GLD'   },
  { type: 'eq',  sym: 'SLV'   },
  { type: 'eq',  sym: 'XLE'   },
  { type: 'eq',  sym: 'USO'   },
];

// ── Per-ticker in-process cache ──────────────────────────────────────────────
// Survives across warm invocations; keyed by canonical ticker / 'sym' value.
const _cache = new Map(); // key → { data: PriceEntry, ts: number }
const CACHE_TTL = 5 * 60 * 1000; // 5 min

function cacheGet(key) {
  const e = _cache.get(key);
  if (!e || Date.now() - e.ts > CACHE_TTL) return null;
  return e.data;
}
function cacheSet(key, data) { _cache.set(key, { data, ts: Date.now() }); }

// ── Helpers ──────────────────────────────────────────────────────────────────
const sleep = ms => new Promise(r => setTimeout(r, ms));

function isRateLimited(data) {
  const msg = (data?.Note || data?.Information || '');
  return typeof msg === 'string' && (
    msg.includes('API call frequency') ||
    msg.includes('rate limit') ||
    msg.includes('25 requests per day') ||
    msg.includes('standard API call frequency')
  );
}

async function avFetch(url) {
  try {
    const resp = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!resp.ok) return { ok: false };
    const data = await resp.json();
    if (isRateLimited(data)) return { ok: false, rateLimited: true, data };
    return { ok: true, data };
  } catch {
    return { ok: false };
  }
}

async function avFetchWithRetry(url) {
  const r = await avFetch(url);
  if (r.rateLimited) {
    await sleep(12000); // wait 12 s then retry once
    return avFetch(url);
  }
  return r;
}

// ── CoinGecko (crypto) ───────────────────────────────────────────────────────
async function fetchCoinGecko() {
  const prices = {};
  const failed = [];
  const ids = Object.values(COIN_MAP).join(',');
  try {
    const url  = `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd&include_24hr_change=true`;
    const resp = await fetch(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(10000) });
    if (!resp.ok) throw new Error(`CoinGecko ${resp.status}`);
    const data = await resp.json();
    Object.entries(COIN_MAP).forEach(([ticker, cgId]) => {
      const entry = data[cgId];
      if (entry?.usd != null) {
        const price     = entry.usd;
        const changePct = entry.usd_24h_change ?? 0;
        const priceData = { price, change: price * (changePct / 100), changePct, name: ticker };
        prices[ticker]  = priceData;
        cacheSet(ticker, priceData);
      } else {
        failed.push(ticker);
      }
    });
  } catch {
    Object.keys(COIN_MAP).forEach(t => failed.push(t));
  }
  return { prices, failed };
}

// ── Alpha Vantage — all non-crypto, sequential ───────────────────────────────
async function fetchAllAV(apiKey, startTime, budgetMs) {
  const prices      = {};
  const failed      = [];
  const rateLimited = [];

  for (let i = 0; i < AV_TASKS.length; i++) {
    const task = AV_TASKS[i];

    // Bail if we've burned through the time budget — return partial results.
    // Remaining tickers will show as blank; user can Refresh again (cache fills in).
    if (Date.now() - startTime > budgetMs) break;

    const { type } = task;
    // Resolve the canonical cache key and the key used in the prices output
    const cacheKey = task.sym || task.tk;  // 'UUP', 'GOLD', 'EURUSD=X', 'CL=F', …
    const storeKey = task.tk || task.sym;  // 'DX-Y.NYB' for UUP, otherwise same as cacheKey

    // ── Serve from cache if fresh ────────────────────────────────────────────
    const cached = cacheGet(cacheKey);
    if (cached) {
      prices[storeKey] = cached;
      continue; // No sleep needed — no AV call made
    }

    let entry = null;
    let rl    = false;

    // ── GLOBAL_QUOTE (stocks / ETFs) ─────────────────────────────────────────
    if (type === 'eq') {
      const url = `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${encodeURIComponent(task.sym)}&apikey=${apiKey}`;
      const r   = await avFetchWithRetry(url);
      if (r.rateLimited) {
        rl = true;
      } else if (r.ok) {
        const q     = r.data?.['Global Quote'];
        const price = q?.['05. price'] ? parseFloat(q['05. price']) : null;
        if (price && price > 0) {
          const change    = parseFloat(q['09. change'] || '0');
          const changePct = parseFloat((q['10. change percent'] || '0%').replace('%', ''));
          entry = { price, change, changePct, name: task.name || task.sym };
        }
      }

    // ── CURRENCY_EXCHANGE_RATE (metals + forex) ──────────────────────────────
    } else if (type === 'fx') {
      const url = `https://www.alphavantage.co/query?function=CURRENCY_EXCHANGE_RATE&from_currency=${task.from}&to_currency=${task.to}&apikey=${apiKey}`;
      const r   = await avFetchWithRetry(url);
      if (r.rateLimited) {
        rl = true;
      } else if (r.ok) {
        const rate  = r.data?.['Realtime Currency Exchange Rate']?.['5. Exchange Rate'];
        const price = rate ? parseFloat(rate) : null;
        if (price && price > 0) {
          entry = { price, change: 0, changePct: 0, name: task.name };
        }
      }

    // ── Commodity function (WTI / NATURAL_GAS) ──────────────────────────────
    } else if (type === 'cmd') {
      const url  = `https://www.alphavantage.co/query?function=${task.fn}&interval=daily&apikey=${apiKey}`;
      const r    = await avFetchWithRetry(url);
      if (r.rateLimited) {
        rl = true;
      } else if (r.ok) {
        const series = r.data?.data;
        if (Array.isArray(series) && series.length >= 2) {
          const today = parseFloat(series[0].value);
          const prev  = parseFloat(series[1].value);
          if (today > 0) {
            const change    = today - prev;
            const changePct = prev > 0 ? (change / prev) * 100 : 0;
            entry = { price: today, change, changePct, name: task.name };
          }
        }
      }
    }

    // ── Record result ────────────────────────────────────────────────────────
    if (entry) {
      prices[storeKey] = entry;
      cacheSet(cacheKey, entry);
    } else if (rl) {
      rateLimited.push(storeKey);
    } else {
      failed.push(storeKey);
    }

    // 1-second gap between AV calls (not after cache hits, not after the last task)
    if (i < AV_TASKS.length - 1) await sleep(1000);
  }

  return { prices, failed, rateLimited };
}

// ── Handler ───────────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const avApiKey  = process.env.ALPHA_VANTAGE_API_KEY;
  const startTime = Date.now();

  // Budget: 25 s — gives plenty of room on Vercel Pro (60 s default) and
  // still returns well-prioritised partial results on shorter timeouts.
  // On the first cold load with an empty cache and AV free-tier rate limits,
  // the top-priority tickers (metals, oil/gas, indexes) will fit inside 8–9 s.
  const BUDGET_MS = 25000;

  // CoinGecko (crypto) runs in parallel with all AV sequential calls.
  const [cryptoResult, avResult] = await Promise.all([
    fetchCoinGecko(),
    avApiKey
      ? fetchAllAV(avApiKey, startTime, BUDGET_MS)
      : Promise.resolve({ prices: {}, failed: [], rateLimited: [] }),
  ]);

  const prices      = { ...avResult.prices, ...cryptoResult.prices };
  const failed      = [...avResult.failed, ...cryptoResult.failed];
  const rateLimited = avResult.rateLimited || [];

  // If no AV key, surface a clear error alongside whatever crypto we got.
  const extra = avApiKey ? {} : { error: 'ALPHA_VANTAGE_API_KEY not configured — only crypto prices available' };

  res.setHeader('Cache-Control', 'no-store'); // rely on in-process per-ticker cache
  return res.status(200).json({
    prices,
    failed,
    rateLimited,
    timestamp: new Date().toISOString(),
    ...extra,
  });
}
