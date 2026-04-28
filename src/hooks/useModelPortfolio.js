import { useEffect, useState, useCallback } from 'react';
import {
  PORTFOLIO_ALLOCATION,
  PORTFOLIO_BASELINE_USD,
  LANDING_SHARES_KEY,
  PRICES_CACHE_KEY,
  PRICES_CACHE_TS_KEY,
} from '../constants/portfolio';

// Singleton state shared by every consumer of the hook. One fetch, one set of
// frozen shares, one cache — whether the consumer is the headline card on the
// Dashboard, the Portfolio tab, or the Net Worth tab.

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
};

const _subscribers = new Set();
let _activeFetch = null;
let _hasAutoFetched = false;

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

// Freeze share counts as new prices arrive (only for tickers not yet frozen).
// Idempotent — running it twice with the same prices does nothing.
function freezeShares() {
  let changed = false;
  PORTFOLIO_ALLOCATION.forEach(bucket => {
    bucket.holdings.forEach(h => {
      if (_state.frozen[h.ticker]) return;
      const p = _state.prices[h.ticker]?.price;
      if (p > 0) {
        _state.frozen[h.ticker] = {
          shares: (h.pct / 100) * PORTFOLIO_BASELINE_USD / p,
          baselinePrice: p,
        };
        changed = true;
      }
    });
  });
  if (changed) persistFrozen();
}

async function fetchModel() {
  if (_activeFetch) return _activeFetch;
  _state.loading = true;
  notify();
  _activeFetch = (async () => {
    try {
      const resp = await fetch('/api/prices/market-overview');
      if (!resp.ok) return;
      const data = await resp.json();
      const incoming = data.prices || {};
      if (Object.keys(incoming).length === 0) return;
      _state.prices = { ..._state.prices, ...incoming };
      _state.lastTs = Date.now();
      persistPrices();
      freezeShares();
    } catch {} finally {
      _state.loading = false;
      _activeFetch = null;
      notify();
    }
  })();
  return _activeFetch;
}

function buildView() {
  // Run freeze on every view build so a price that arrived between fetch and
  // render (rehydration from localStorage, etc.) freezes immediately.
  freezeShares();

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

  const positionCount  = PORTFOLIO_ALLOCATION.reduce((s, b) => s + b.holdings.length, 0);
  const bucketCount    = PORTFOLIO_ALLOCATION.length;
  const allFrozen      = PORTFOLIO_ALLOCATION.every(b => b.holdings.every(h => _state.frozen[h.ticker]));

  return {
    buckets,
    totalValue,
    totalBaseline,
    dayChange,
    dayChangePct,
    positionCount,
    bucketCount,
    allFrozen,
    prices: _state.prices,
    lastTs: _state.lastTs,
    loading: _state.loading,
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

  const refresh = useCallback(() => fetchModel(), []);

  return { ...buildView(), refresh };
}
