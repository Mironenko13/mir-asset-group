import { useEffect, useState, useCallback } from 'react';
import {
  PORTFOLIO_ALLOCATION,
  PORTFOLIO_BASELINE_USD,
  LANDING_SHARES_KEY,
  PRICES_CACHE_KEY,
  PRICES_CACHE_TS_KEY,
} from '../constants/portfolio';

// Singleton state shared by every consumer of the hook.
//
// Single source of truth: this is the ONE place the app turns prices into
// position values, bucket totals, day-change, and percentages. Every
// consumer (Dashboard headline, KPI row, Portfolio tab tables, Net Worth
// tab, Markets tab, Spending/Tithe/Roadmap context strips) reads the
// already-computed values off `buckets` / `totalValue` / `dayChange`. No
// component recalculates anything independently.

const ALL_TICKERS = PORTFOLIO_ALLOCATION.flatMap(b => b.holdings.map(h => h.ticker));

function loadJSON(storage, key, fallback) {
  try { const v = storage.getItem(key); return v ? JSON.parse(v) : fallback; }
  catch { return fallback; }
}
function loadInt(storage, key) {
  try { const v = storage.getItem(key); return v ? parseInt(v, 10) : null; }
  catch { return null; }
}

const _state = {
  prices: typeof localStorage !== 'undefined' ? loadJSON(localStorage, PRICES_CACHE_KEY, {}) : {},
  lastTs: typeof localStorage !== 'undefined' ? loadInt(localStorage, PRICES_CACHE_TS_KEY) : null,
  loading: false,
  frozen: typeof sessionStorage !== 'undefined' ? loadJSON(sessionStorage, LANDING_SHARES_KEY, {}) : {},
  rateLimited: [],
  fetchError: null,
};

const _subscribers = new Set();
let _activeFetch = null;
let _hasAutoFetched = false;
let _retryAttempts = 0;
const MAX_RETRY_ATTEMPTS = 3;

function notify() { _subscribers.forEach(fn => fn()); }

function persistPrices() {
  try {
    localStorage.setItem(PRICES_CACHE_KEY, JSON.stringify(_state.prices));
    if (_state.lastTs) localStorage.setItem(PRICES_CACHE_TS_KEY, String(_state.lastTs));
  } catch {}
}

function persistFrozen() {
  try { sessionStorage.setItem(LANDING_SHARES_KEY, JSON.stringify(_state.frozen)); } catch {}
}

function clearFrozen() {
  _state.frozen = {};
  try { sessionStorage.removeItem(LANDING_SHARES_KEY); } catch {}
}

function pricedTickerCount() {
  return ALL_TICKERS.filter(t => (_state.prices[t]?.price ?? 0) > 0).length;
}

// Atomic freeze, gated on a SINGLE API response covering every ticker.
//
// Per spec: do not freeze share counts until ALL tickers in
// PORTFOLIO_ALLOCATION have valid prices on the same fetch. Cache-rehydrated
// or partial fetches don't qualify — we keep retrying until one response
// brings them all in, then back-calculate against PORTFOLIO_BASELINE_USD and
// freeze in one shot. This stops the bug where a load that dropped
// SCHD/JEPI/GLD/SLV would freeze a $2.7M baseline.
function freezeFromResponse(incoming) {
  const incomingKeys = incoming && typeof incoming === 'object' ? Object.keys(incoming) : [];
  const received = ALL_TICKERS.filter(t => (incoming?.[t]?.price ?? 0) > 0);
  const missing  = ALL_TICKERS.filter(t => !((incoming?.[t]?.price ?? 0) > 0));

  console.log('[GATE] expected:', ALL_TICKERS);
  console.log('[GATE] received:', received);
  console.log('[GATE] missing:',  missing);
  console.log('[GATE] incoming.prices keys (first 50):', incomingKeys.slice(0, 50));

  const allInResponse = missing.length === 0;
  if (!allInResponse) {
    const willRetry = _retryAttempts < MAX_RETRY_ATTEMPTS;
    if (willRetry) {
      console.log(`[GATE] rejected response, retry ${_retryAttempts + 1}/${MAX_RETRY_ATTEMPTS}`);
    } else {
      console.log(`[GATE] rejected response, no more retries (exhausted ${MAX_RETRY_ATTEMPTS} attempts) — still missing:`, missing);
    }
    return false;
  }

  const fullyFrozen = ALL_TICKERS.every(t => _state.frozen[t]);
  if (fullyFrozen) {
    console.log('[GATE] accepted — already fully frozen, no re-freeze needed');
    return true;
  }

  console.log('[GATE] accepted — freezing shares for', ALL_TICKERS.length, 'tickers against baseline', PORTFOLIO_BASELINE_USD);
  const fresh = {};
  PORTFOLIO_ALLOCATION.forEach(bucket => {
    bucket.holdings.forEach(h => {
      const p = incoming[h.ticker].price;
      fresh[h.ticker] = {
        shares: (h.pct / 100) * PORTFOLIO_BASELINE_USD / p,
        baselinePrice: p,
      };
    });
  });
  _state.frozen = fresh;
  persistFrozen();
  return true;
}

// Auto-heal: if the current frozen snapshot is incomplete or its implied
// baseline is materially below PORTFOLIO_BASELINE_USD (e.g. shares were
// frozen on a load where SCHD/JEPI/GLD/SLV were missing), drop it so we
// re-freeze cleanly on the next full-coverage fetch.
function healFrozenIfStale() {
  const keys = Object.keys(_state.frozen);
  if (keys.length === 0) return;

  const fullyFrozen = ALL_TICKERS.every(t => _state.frozen[t]);
  let baselineSum = 0;
  ALL_TICKERS.forEach(t => {
    const f = _state.frozen[t];
    if (f) baselineSum += f.shares * f.baselinePrice;
  });

  const tolerance = PORTFOLIO_BASELINE_USD * 0.95;
  if (!fullyFrozen || baselineSum < tolerance) {
    clearFrozen();
  }
}
healFrozenIfStale();

async function fetchModel({ silent = false } = {}) {
  if (_activeFetch) return _activeFetch;
  if (!silent) {
    _state.loading = true;
    _state.fetchError = null;
    notify();
  }
  let responseCoveredAll = false;
  _activeFetch = (async () => {
    try {
      const resp = await fetch('/api/prices/market-overview');
      if (!resp.ok) {
        _state.fetchError = `Network error (${resp.status})`;
        return;
      }
      const data = await resp.json();
      const topLevelKeys = data && typeof data === 'object' ? Object.keys(data) : [];
      console.log('[GATE] /api/prices/market-overview top-level keys:', topLevelKeys);
      const incoming = data.prices || {};
      console.log('[GATE] data.prices is object?', !!incoming && typeof incoming === 'object',
        '· keys count:', Object.keys(incoming || {}).length);
      if (Object.keys(incoming).length > 0) {
        _state.prices = { ..._state.prices, ...incoming };
        _state.lastTs = Date.now();
        persistPrices();
      }
      _state.rateLimited = Array.isArray(data.rateLimited) ? data.rateLimited : [];
      _state.fetchError  = data.error || null;
      // Atomic freeze tied to THIS response — cache-rehydrated or stale
      // tickers from prior sessions don't qualify the freeze.
      responseCoveredAll = freezeFromResponse(incoming);
    } catch (err) {
      _state.fetchError = 'Network error — check your connection.';
    } finally {
      _state.loading = false;
      _activeFetch = null;
      notify();
    }
  })();

  await _activeFetch;

  // If the latest response didn't include every ticker, schedule an
  // automatic retry — the server already retries within a single call,
  // this is the second-level safety net that fires across a longer
  // window so Twelve Data's per-minute credit window can roll over.
  if (!responseCoveredAll && _retryAttempts < MAX_RETRY_ATTEMPTS) {
    _retryAttempts += 1;
    const delay = 4000 + _retryAttempts * 2000; // 6 s, 8 s, 10 s
    setTimeout(() => { fetchModel({ silent: true }); }, delay);
  } else if (responseCoveredAll) {
    _retryAttempts = 0;
  }
}

function buildView() {
  // Freezing is fetch-driven only — buildView is a pure read. Cache
  // rehydration on session start does NOT trigger a freeze; we wait for
  // an API response that covers every ticker.
  const buckets = PORTFOLIO_ALLOCATION.map(bucket => {
    const holdings = bucket.holdings.map(h => {
      const f = _state.frozen[h.ticker];
      const livePrice     = _state.prices[h.ticker]?.price ?? null;
      const shares        = f?.shares ?? null;
      const baselinePrice = f?.baselinePrice ?? null;
      const value    = (shares != null && livePrice > 0)     ? shares * livePrice     : 0;
      const baseline = (shares != null && baselinePrice > 0) ? shares * baselinePrice : 0;
      const hasPrice = livePrice != null && livePrice > 0;
      return {
        ticker: h.ticker,
        bucketId: bucket.id,
        bucketLabel: bucket.label,
        bucketColor: bucket.color,
        targetPct: h.pct,
        shares,
        livePrice,
        baselinePrice,
        value,
        baseline,
        hasPrice,
      };
    });
    const value    = holdings.reduce((s, h) => s + h.value, 0);
    const baseline = holdings.reduce((s, h) => s + h.baseline, 0);
    return { ...bucket, holdings, value, baseline };
  });

  const totalValue    = buckets.reduce((s, b) => s + b.value,    0);
  const totalBaseline = buckets.reduce((s, b) => s + b.baseline, 0);
  const dayChange     = totalValue - totalBaseline;
  const dayChangePct  = totalBaseline > 0 ? (dayChange / totalBaseline) * 100 : 0;

  // Attach pre-computed percentages — single source of derived numbers.
  buckets.forEach(b => {
    b.pctOfPortfolio = totalValue > 0 ? (b.value / totalValue) * 100 : 0;
    b.dayChange    = b.value - b.baseline;
    b.dayChangePct = b.baseline > 0 ? (b.dayChange / b.baseline) * 100 : 0;
    b.holdings.forEach(h => {
      h.pctOfBucket    = b.value      > 0 ? (h.value / b.value)    * 100 : 0;
      h.pctOfPortfolio = totalValue   > 0 ? (h.value / totalValue) * 100 : 0;
      h.dayChange      = h.value - h.baseline;
      h.dayChangePct   = h.baseline   > 0 ? (h.dayChange / h.baseline) * 100 : 0;
    });
  });

  // Flat lookup: ticker → holding object. Lets consumers read a position's
  // live state in O(1) without re-walking buckets.
  const holdingsByTicker = {};
  buckets.forEach(b => b.holdings.forEach(h => { holdingsByTicker[h.ticker] = h; }));

  const positionCount = ALL_TICKERS.length;
  const bucketCount   = PORTFOLIO_ALLOCATION.length;
  const allFrozen     = ALL_TICKERS.every(t => _state.frozen[t]);
  const priced        = pricedTickerCount();
  const fullyCovered  = priced === positionCount;

  return {
    buckets,
    totalValue,
    totalBaseline,
    dayChange,
    dayChangePct,
    positionCount,
    bucketCount,
    allFrozen,
    holdingsByTicker,
    pricedCount: priced,
    fullyCovered,
    prices: _state.prices,
    lastTs: _state.lastTs,
    loading: _state.loading,
    rateLimited: _state.rateLimited,
    fetchError: _state.fetchError,
  };
}

export function useModelPortfolio() {
  const [, force] = useState(0);

  useEffect(() => {
    const cb = () => force(x => x + 1);
    _subscribers.add(cb);
    if (!_hasAutoFetched) {
      _hasAutoFetched = true;
      fetchModel();
    }
    return () => { _subscribers.delete(cb); };
  }, []);

  const refresh = useCallback(() => {
    _retryAttempts = 0;
    return fetchModel();
  }, []);

  return { ...buildView(), refresh };
}
