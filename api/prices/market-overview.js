// Market Overview API — all data handled server-side, one combined response
//
// Sources:
//   Crypto       → CoinGecko (free, no key) — runs in parallel
//   Stocks/ETFs  → Twelve Data /quote batch (single request, all tickers)
//   Metals       → Alpha Vantage CURRENCY_EXCHANGE_RATE (XAU/USD, XAG/USD)
//   Oil & Gas    → Alpha Vantage WTI + NATURAL_GAS function endpoints
//   Forex        → Alpha Vantage CURRENCY_EXCHANGE_RATE (EUR/USD, USD/JPY, GBP/JPY)
//   DXY proxy    → UUP ETF via Twelve Data, stored under 'DX-Y.NYB' key
//
// Rate-limit handling:
//   - Twelve Data: surfaces the API's error message in the response/log;
//     missing tickers fall through to `failed` and the UI degrades gracefully.
//   - Alpha Vantage (fx/cmd only): 1 s gap between calls; on a rate-limit
//     Note/Information, wait 12 s and retry once per ticker.
//
// Per-ticker cache persists across warm serverless invocations (in-process Map).
// Time budget: bail out of the AV loop after BUDGET_MS so the function never hard-times-out.

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

function isAvRateLimited(data) {
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
    if (isAvRateLimited(data)) return { ok: false, rateLimited: true, data };
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

// ── Twelve Data (stocks / ETFs) — one batch request per refresh ──────────────
//
// One batch call covers every uncached ticker. Twelve Data's free-tier rate
// limit (8 credits/min, 1 credit per symbol on /quote) means a 40-symbol batch
// can drop the tail end of the symbol list — Twelve Data fills what fits in
// the per-minute window and silently omits the rest from the response. So we
// run a second pass for any symbols that didn't come back, after a short
// delay to let the per-minute window tick over a bit.

// One Twelve Data /quote batch. Returns a per-symbol map from the request
// symbol → either { entry: { price, change, changePct, name } } on success,
// { error: true } for a per-symbol failure, or { rateLimited: true, message }
// if the whole call was rate-limited at the top level.
async function twelveDataBatch(apiKey, symbols, taskBySym) {
  if (!symbols.length) return { results: new Map(), rateLimited: false, message: null, networkFailed: false };

  const url = `https://api.twelvedata.com/quote?symbol=${encodeURIComponent(symbols.join(','))}&apikey=${apiKey}`;
  let data;
  try {
    const resp = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (!resp.ok) {
      console.warn(`Twelve Data HTTP ${resp.status}`);
      return { results: new Map(), rateLimited: false, message: null, networkFailed: true };
    }
    data = await resp.json();
  } catch (err) {
    console.warn(`Twelve Data fetch failed: ${err?.message || err}`);
    return { results: new Map(), rateLimited: false, message: null, networkFailed: true };
  }

  // Top-level error: { code, message, status: 'error' } applies to the whole batch.
  if (data && typeof data === 'object' && !Array.isArray(data)
      && data.status === 'error' && typeof data.message === 'string') {
    const isRateLimited = data.code === 429
      || /credits|frequency|rate.?limit|run out|exceeded/i.test(data.message);
    const tag = isRateLimited ? 'rate-limited' : 'error';
    console.warn(`Twelve Data ${tag}: ${data.message}`);
    return { results: new Map(), rateLimited: isRateLimited, message: data.message, networkFailed: false };
  }

  // Single-symbol responses are returned unwrapped (no symbol key).
  const isSingle = symbols.length === 1;
  const results = new Map();

  for (const sym of symbols) {
    const task = taskBySym.get(sym);
    const q = isSingle ? data : data?.[sym];

    if (!q || q.status === 'error') {
      results.set(sym, { error: true });
      continue;
    }
    const price = parseFloat(q.close);
    if (!(price > 0)) {
      results.set(sym, { error: true });
      continue;
    }
    const change    = parseFloat(q.change ?? '0') || 0;
    const changePct = parseFloat(q.percent_change ?? '0') || 0;
    results.set(sym, { entry: { price, change, changePct, name: task.name || task.sym } });
  }

  return { results, rateLimited: false, message: null, networkFailed: false };
}

async function fetchStocksEtfsBatch(apiKey) {
  const prices = {};
  const failed = [];
  const rateLimited = [];
  let rateLimitMessage = null;

  // Resolve cache hits up front so we only hit the network for missing tickers.
  const equityTasks = AV_TASKS.filter(t => t.type === 'eq');
  const tickersToFetch = [];
  const taskBySym = new Map();

  for (const task of equityTasks) {
    const cacheKey = task.sym;
    const storeKey = task.tk || task.sym;
    const cached = cacheGet(cacheKey);
    if (cached) {
      prices[storeKey] = cached;
      continue;
    }
    tickersToFetch.push(task.sym);
    taskBySym.set(task.sym, task);
  }

  if (!tickersToFetch.length) {
    return { prices, failed, rateLimited, rateLimitMessage };
  }

  // First batch.
  const first = await twelveDataBatch(apiKey, tickersToFetch, taskBySym);

  if (first.networkFailed) {
    tickersToFetch.forEach(s => failed.push(taskBySym.get(s).tk || s));
    return { prices, failed, rateLimited, rateLimitMessage };
  }

  if (first.rateLimited) {
    rateLimitMessage = first.message;
    tickersToFetch.forEach(s => rateLimited.push(taskBySym.get(s).tk || s));
    return { prices, failed, rateLimited, rateLimitMessage };
  }

  const recordResult = (sym, r) => {
    const task = taskBySym.get(sym);
    const storeKey = task.tk || task.sym;
    if (r?.entry) {
      prices[storeKey] = r.entry;
      cacheSet(sym, r.entry);
      return true;
    }
    return false;
  };

  const stillMissing = [];
  for (const sym of tickersToFetch) {
    if (!recordResult(sym, first.results.get(sym))) stillMissing.push(sym);
  }

  // Retry pass: anything missing from the first response gets a second shot
  // after a short delay. Twelve Data's free tier silently drops the tail of
  // long batches when the per-minute credit window fills, so a second smaller
  // batch usually picks them up.
  if (stillMissing.length) {
    console.warn(`Twelve Data: missing on first pass — retrying ${stillMissing.length} ticker(s): ${stillMissing.join(', ')}`);
    await sleep(1500);
    const second = await twelveDataBatch(apiKey, stillMissing, taskBySym);
    if (second.rateLimited) {
      rateLimitMessage = second.message;
      stillMissing.forEach(s => rateLimited.push(taskBySym.get(s).tk || s));
    } else if (second.networkFailed) {
      stillMissing.forEach(s => failed.push(taskBySym.get(s).tk || s));
    } else {
      const afterRetry = [];
      for (const sym of stillMissing) {
        if (!recordResult(sym, second.results.get(sym))) afterRetry.push(sym);
      }
      if (afterRetry.length) {
        afterRetry.forEach(s => failed.push(taskBySym.get(s).tk || s));
        console.warn(`Twelve Data: still missing after retry — ${afterRetry.join(', ')}`);
      }
    }
  }

  return { prices, failed, rateLimited, rateLimitMessage };
}

// ── Alpha Vantage — metals, oil/gas, forex (sequential) ──────────────────────
async function fetchAvNonEquity(apiKey, startTime, budgetMs) {
  const prices      = {};
  const failed      = [];
  const rateLimited = [];

  const tasks = AV_TASKS.filter(t => t.type !== 'eq');

  for (let i = 0; i < tasks.length; i++) {
    const task = tasks[i];

    // Bail if we've burned through the time budget — return partial results.
    if (Date.now() - startTime > budgetMs) break;

    const { type } = task;
    const cacheKey = task.tk;
    const storeKey = task.tk;

    const cached = cacheGet(cacheKey);
    if (cached) {
      prices[storeKey] = cached;
      continue;
    }

    let entry = null;
    let rl    = false;

    // ── CURRENCY_EXCHANGE_RATE (metals + forex) ──────────────────────────────
    if (type === 'fx') {
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

    if (entry) {
      prices[storeKey] = entry;
      cacheSet(cacheKey, entry);
    } else if (rl) {
      rateLimited.push(storeKey);
    } else {
      failed.push(storeKey);
    }

    // 1-second gap between AV calls (not after cache hits, not after the last task)
    if (i < tasks.length - 1) await sleep(1000);
  }

  return { prices, failed, rateLimited };
}

// ── Handler ───────────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const avApiKey  = process.env.ALPHA_VANTAGE_API_KEY;
  const tdApiKey  = process.env.REACT_APP_TWELVE_DATA_API_KEY;
  const startTime = Date.now();

  // Budget applies only to the sequential AV (fx/cmd) loop. Twelve Data is one
  // batch call and CoinGecko is one batched call — both finish well inside it.
  const BUDGET_MS = 25000;

  const [cryptoResult, stocksResult, avResult] = await Promise.all([
    fetchCoinGecko(),
    tdApiKey
      ? fetchStocksEtfsBatch(tdApiKey)
      : Promise.resolve({ prices: {}, failed: [], rateLimited: [], rateLimitMessage: null }),
    avApiKey
      ? fetchAvNonEquity(avApiKey, startTime, BUDGET_MS)
      : Promise.resolve({ prices: {}, failed: [], rateLimited: [] }),
  ]);

  const prices      = { ...avResult.prices, ...stocksResult.prices, ...cryptoResult.prices };
  const failed      = [...avResult.failed, ...stocksResult.failed, ...cryptoResult.failed];
  const rateLimited = [...(avResult.rateLimited || []), ...(stocksResult.rateLimited || [])];

  const errors = [];
  if (!tdApiKey) errors.push('REACT_APP_TWELVE_DATA_API_KEY not configured — stocks/ETFs unavailable');
  if (!avApiKey) errors.push('ALPHA_VANTAGE_API_KEY not configured — metals, oil/gas, and forex unavailable');
  if (stocksResult.rateLimitMessage) errors.push(`Twelve Data: ${stocksResult.rateLimitMessage}`);

  res.setHeader('Cache-Control', 'no-store'); // rely on in-process per-ticker cache
  return res.status(200).json({
    prices,
    failed,
    rateLimited,
    timestamp: new Date().toISOString(),
    ...(errors.length ? { error: errors.join('; ') } : {}),
  });
}
