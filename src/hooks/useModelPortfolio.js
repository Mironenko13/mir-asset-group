import {
  PORTFOLIO_ALLOCATION,
  PORTFOLIO_SNAPSHOT_LABEL,
} from '../constants/portfolio';

// Snapshot-mode portfolio hook.
//
// This is a deliberate downgrade from the live-pricing build. Prices and
// share counts are baked into PORTFOLIO_ALLOCATION. The hook is now a
// synchronous, side-effect-free read — no fetch, no localStorage, no
// retries, no freezing logic, no loading state. Every consumer gets real
// numbers immediately on first render.
//
// Live pricing will come back as a clean, separate feature. Until then,
// the snapshot label (PORTFOLIO_SNAPSHOT_LABEL) is the only price-context
// caption surfaced in the UI.

const ALL_TICKERS = PORTFOLIO_ALLOCATION.flatMap(b => b.holdings.map(h => h.ticker));

const _model = (() => {
  const buckets = PORTFOLIO_ALLOCATION.map(bucket => {
    const holdings = bucket.holdings.map(h => {
      const value = (h.shares ?? 0) * (h.price ?? 0);
      return {
        ticker: h.ticker,
        bucketId: bucket.id,
        bucketLabel: bucket.label,
        bucketColor: bucket.color,
        targetPct: h.pct,
        shares: h.shares ?? null,
        livePrice: h.price ?? null,
        baselinePrice: h.price ?? null,
        value,
        baseline: value,
        hasPrice: (h.price ?? 0) > 0,
      };
    });
    const value = holdings.reduce((s, h) => s + h.value, 0);
    return { ...bucket, holdings, value, baseline: value };
  });

  const totalValue = buckets.reduce((s, b) => s + b.value, 0);

  // Snapshot mode: live = baseline by definition. Day change is zero
  // until live pricing is reintroduced. Consumers should treat dayChange
  // as informational only and not show "today" framing.
  const totalBaseline = totalValue;
  const dayChange     = 0;
  const dayChangePct  = 0;

  // Attach pre-computed percentages — single source of derived numbers.
  buckets.forEach(b => {
    b.pctOfPortfolio = totalValue > 0 ? (b.value / totalValue) * 100 : 0;
    b.dayChange    = 0;
    b.dayChangePct = 0;
    b.holdings.forEach(h => {
      h.pctOfBucket    = b.value    > 0 ? (h.value / b.value)    * 100 : 0;
      h.pctOfPortfolio = totalValue > 0 ? (h.value / totalValue) * 100 : 0;
      h.dayChange      = 0;
      h.dayChangePct   = 0;
    });
  });

  const holdingsByTicker = {};
  buckets.forEach(b => b.holdings.forEach(h => { holdingsByTicker[h.ticker] = h; }));

  // Flat ticker → number map kept for any consumer that wants it; matches
  // the shape the previous live-pricing build returned from the API.
  const prices = {};
  buckets.forEach(b => b.holdings.forEach(h => {
    if (h.livePrice != null) prices[h.ticker] = h.livePrice;
  }));

  const noop = () => {};

  return {
    buckets,
    totalValue,
    totalBaseline,
    dayChange,
    dayChangePct,
    positionCount: ALL_TICKERS.length,
    bucketCount: PORTFOLIO_ALLOCATION.length,
    allFrozen: true,
    fullyCovered: true,
    pricedCount: ALL_TICKERS.length,
    holdingsByTicker,
    prices,
    lastTs: null,
    loading: false,
    rateLimited: [],
    fetchError: null,
    snapshotLabel: PORTFOLIO_SNAPSHOT_LABEL,
    isSnapshot: true,
    refresh: noop,
  };
})();

export function useModelPortfolio() {
  return _model;
}
