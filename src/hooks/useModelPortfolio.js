import { useMemo } from 'react';
import {
  PORTFOLIO_ALLOCATION,
  PORTFOLIO_SNAPSHOT_LABEL,
} from '../constants/portfolio';
import { useSimulatedPrices } from './useSimulatedPrices';

// Single source of truth for the dashboard's portfolio numbers.
//
// Shares come from PORTFOLIO_ALLOCATION (static). Prices and price
// histories come from the marketSim engine via useSimulatedPrices —
// every consumer of this hook re-renders every 2 s as the engine ticks.
//
// `basePrice` is the constants-file price (where each ticker started),
// `livePrice` is the current simulated price. dayChange is computed
// against basePrice so it reflects how far the simulation has walked
// from open.

const ALL_TICKERS = PORTFOLIO_ALLOCATION.flatMap(b => b.holdings.map(h => h.ticker));

export function useModelPortfolio() {
  const { prices, history, lastTickAt } = useSimulatedPrices();

  return useMemo(() => {
    const buckets = PORTFOLIO_ALLOCATION.map(bucket => {
      const holdings = bucket.holdings.map(h => {
        const livePrice     = prices[h.ticker] ?? h.price;
        const baselinePrice = h.price;
        const value         = (h.shares ?? 0) * livePrice;
        const baseline      = (h.shares ?? 0) * baselinePrice;
        return {
          ticker: h.ticker,
          name: h.name,
          bucketId: bucket.id,
          bucketLabel: bucket.label,
          bucketColor: bucket.color,
          targetPct: h.pct,
          shares: h.shares ?? null,
          livePrice,
          baselinePrice,
          value,
          baseline,
          history: history[h.ticker] || [],
          hasPrice: livePrice > 0,
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

    // Attach pre-computed derived numbers so consumers don't recompute.
    buckets.forEach(b => {
      b.pctOfPortfolio = totalValue > 0 ? (b.value / totalValue) * 100 : 0;
      b.dayChange      = b.value - b.baseline;
      b.dayChangePct   = b.baseline > 0 ? (b.dayChange / b.baseline) * 100 : 0;
      b.holdings.forEach(h => {
        h.pctOfBucket    = b.value    > 0 ? (h.value / b.value)    * 100 : 0;
        h.pctOfPortfolio = totalValue > 0 ? (h.value / totalValue) * 100 : 0;
        h.dayChange      = h.value - h.baseline;
        h.dayChangePct   = h.baseline > 0 ? (h.dayChange / h.baseline) * 100 : 0;
      });
    });

    const holdingsByTicker = {};
    buckets.forEach(b => b.holdings.forEach(h => { holdingsByTicker[h.ticker] = h; }));

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
      history,
      lastTickAt,
      lastTs: lastTickAt,
      loading: false,
      rateLimited: [],
      fetchError: null,
      snapshotLabel: PORTFOLIO_SNAPSHOT_LABEL,
      isSnapshot: false,
      refresh: () => {},
    };
  }, [prices, history, lastTickAt]);
}
