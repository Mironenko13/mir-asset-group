// Market simulation engine — singleton, ticks every 2 s, broadcasts to
// all subscribers. Prices walk forward as a correlated random process:
// market mood → group mood → ticker idiosyncratic. Volatility scales by
// asset class; momentum gives 1–4-tick trends; mean reversion pulls
// drifts back when |currentPrice / basePrice − 1| > 3 %. Weekend &
// after-hours awareness so equities don't visibly tick on Sundays.
//
// Pure logic — no React. Use src/hooks/useSimulatedPrices.js to read.

import { PORTFOLIO_ALLOCATION } from '../constants/portfolio';

const TICK_INTERVAL_MS = 2000;
const HISTORY_LENGTH    = 120; // 4 minutes at 2 s tick

// Per-ticker meta: correlation group, intra-group correlation (signal
// share), market correlation (group↔market mood), volatility (σ per tick
// expressed as fraction of price).
const TICKER_META = {
  // Broad-market proxies — they ARE the market mood.
  SPY:   { group: 'broad_market', intra: 0.85, mkt: 1.00, vol: 0.0005 },
  VTI:   { group: 'broad_market', intra: 0.85, mkt: 1.00, vol: 0.0005 },
  QQQ:   { group: 'broad_market', intra: 0.85, mkt: 1.00, vol: 0.0005 },

  // Tech / high-beta growth.
  NVDA:  { group: 'tech_growth', intra: 0.70, mkt: 0.60, vol: 0.0010 },
  AMD:   { group: 'tech_growth', intra: 0.70, mkt: 0.60, vol: 0.0010 },
  IONQ:  { group: 'tech_growth', intra: 0.70, mkt: 0.60, vol: 0.0010 },
  RGTI:  { group: 'tech_growth', intra: 0.70, mkt: 0.60, vol: 0.0010 },
  MSFT:  { group: 'tech_growth', intra: 0.70, mkt: 0.60, vol: 0.0010 },
  AAPL:  { group: 'tech_growth', intra: 0.70, mkt: 0.60, vol: 0.0010 },
  GOOGL: { group: 'tech_growth', intra: 0.70, mkt: 0.60, vol: 0.0010 },
  TSLA:  { group: 'tech_growth', intra: 0.70, mkt: 0.60, vol: 0.0010 },
  PLTR:  { group: 'tech_growth', intra: 0.70, mkt: 0.60, vol: 0.0010 },
  SMCI:  { group: 'tech_growth', intra: 0.70, mkt: 0.60, vol: 0.0010 },

  // Crypto — own rhythm, only loosely tied to broad market mood.
  BTC:   { group: 'crypto', intra: 0.75, mkt: 0.10, vol: 0.0015 },
  ETH:   { group: 'crypto', intra: 0.75, mkt: 0.10, vol: 0.0015 },
  XRP:   { group: 'crypto', intra: 0.75, mkt: 0.10, vol: 0.0015 },

  // Energy / commodities.
  XLE:   { group: 'energy', intra: 0.70, mkt: 0.30, vol: 0.0008 },
  USO:   { group: 'energy', intra: 0.70, mkt: 0.30, vol: 0.0008 },
  URA:   { group: 'energy', intra: 0.70, mkt: 0.30, vol: 0.0008 },

  // Precious metals.
  GLD:   { group: 'metals', intra: 0.70, mkt: 0.15, vol: 0.0006 },
  SLV:   { group: 'metals', intra: 0.70, mkt: 0.15, vol: 0.0006 },

  // Dividend / quality names (JPM grouped here — financials, low-vol
  // dividend payer that tracks broad market about as much as SCHD/O do).
  SCHD:  { group: 'dividends', intra: 0.50, mkt: 0.40, vol: 0.0003 },
  JEPI:  { group: 'dividends', intra: 0.50, mkt: 0.40, vol: 0.0003 },
  O:     { group: 'dividends', intra: 0.50, mkt: 0.40, vol: 0.0003 },
  MO:    { group: 'dividends', intra: 0.50, mkt: 0.40, vol: 0.0003 },
  JPM:   { group: 'dividends', intra: 0.50, mkt: 0.40, vol: 0.0003 },
};

const GROUP_IDS = [...new Set(Object.values(TICKER_META).map(m => m.group))];
// Pick a representative for each group's market correlation (tickers in
// the same group share `mkt`, so any of them works).
const GROUP_MARKET_CORR = {};
GROUP_IDS.forEach(g => {
  GROUP_MARKET_CORR[g] = Object.values(TICKER_META).find(m => m.group === g).mkt;
});

// ── Mutable internal per-ticker state. Not exposed to React. ──────────
const _internal = {};
PORTFOLIO_ALLOCATION.forEach(b => b.holdings.forEach(h => {
  _internal[h.ticker] = {
    basePrice: h.price,
    currentPrice: h.price,
    momentum: 0,
    history: [h.price],
  };
}));

// Frozen-shape snapshot consumed by React via useSyncExternalStore. New
// references each tick so React knows to re-read.
let _snapshot = buildSnapshot();

const _subscribers = new Set();
let _intervalId = null;

function rand() { return Math.random() * 2 - 1; } // uniform [-1, +1]

function isWeekendNow() {
  const d = new Date().getDay();
  return d === 0 || d === 6;
}

function isAfterHoursWeekday() {
  const now = new Date();
  if (now.getDay() === 0 || now.getDay() === 6) return false;
  // Convert to America/New_York wall-clock time.
  const et = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const minutes = et.getHours() * 60 + et.getMinutes();
  // Regular session: 9:30 ET (570) → 16:00 ET (960).
  return minutes < 570 || minutes >= 960;
}

function volScalerFor(group) {
  if (isWeekendNow()) {
    if (group === 'crypto') return 0.8; // crypto trades 24/7
    return 0.05;                         // everything else basically frozen
  }
  if (isAfterHoursWeekday()) {
    if (group === 'crypto') return 1.0;
    return 0.20;                         // thin after-hours volume look
  }
  return 1.0;
}

function tickInternal(weekendOverride) {
  // 1. Market mood for this tick.
  const marketMood = rand();

  // 2. Group signal = blend of market mood and a group-level random.
  const groupSignals = {};
  GROUP_IDS.forEach(g => {
    const groupRand = rand();
    const mktC = GROUP_MARKET_CORR[g];
    groupSignals[g] = marketMood * mktC + groupRand * (1 - mktC);
  });

  // 3. Per-ticker.
  Object.keys(_internal).forEach(tk => {
    const meta = TICKER_META[tk];
    if (!meta) return;
    const st = _internal[tk];

    const idio = rand();
    const tickerSignal = groupSignals[meta.group] * meta.intra + idio * (1 - meta.intra);

    let baseMove = tickerSignal * meta.vol;
    // Weekend / after-hours scaling. `weekendOverride` lets the warmup
    // pre-roll ignore time-of-day so sparklines look populated even at
    // 9 pm Sunday.
    if (!weekendOverride) {
      baseMove *= volScalerFor(meta.group);
    }

    // Momentum: persistent drift over a handful of ticks.
    let effectiveMove = baseMove + st.momentum * 0.4;

    // Mean reversion when we've drifted >3 % from base.
    const deviationPct = (st.currentPrice - st.basePrice) / st.basePrice;
    if (Math.abs(deviationPct) > 0.03) {
      effectiveMove += -0.1 * deviationPct;
    }

    // Apply.
    st.currentPrice = st.currentPrice * (1 + effectiveMove);
    st.momentum     = st.momentum * 0.85 + effectiveMove * 0.15;

    // Push history (allocate fresh array so React sees a new ref).
    const next = st.history.length >= HISTORY_LENGTH
      ? [...st.history.slice(1), st.currentPrice]
      : [...st.history, st.currentPrice];
    st.history = next;
  });
}

function buildSnapshot() {
  const prices  = {};
  const history = {};
  Object.entries(_internal).forEach(([tk, st]) => {
    prices[tk]  = st.currentPrice;
    history[tk] = st.history;
  });
  return { prices, history, lastTickAt: Date.now() };
}

function tickAndNotify() {
  tickInternal(false);
  _snapshot = buildSnapshot();
  _subscribers.forEach(fn => fn());
}

function ensureRunning() {
  if (_intervalId == null && typeof window !== 'undefined') {
    _intervalId = setInterval(tickAndNotify, TICK_INTERVAL_MS);
  }
}

// ── Warm-up: pre-roll HISTORY_LENGTH ticks so sparklines have history
// on first paint and prices have organic drift from base.
// weekendOverride=true so the warmup looks the same on Sunday as it
// does midweek.
for (let i = 0; i < HISTORY_LENGTH; i++) tickInternal(true);
_snapshot = buildSnapshot();

// ── Public surface (consumed by useSyncExternalStore). ────────────────
export function subscribe(callback) {
  _subscribers.add(callback);
  ensureRunning();
  return () => { _subscribers.delete(callback); };
}

export function getSnapshot() {
  return _snapshot;
}

// Test/debug helper: force a tick now.
export function tickNow() {
  tickAndNotify();
}
