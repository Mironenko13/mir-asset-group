import { useSyncExternalStore } from 'react';
import { subscribe, getSnapshot } from '../lib/marketSim';

// Single subscription point for the live simulation. Returns the current
// snapshot — { prices, history, lastTickAt } — and re-renders the
// caller every time the engine ticks (every 2 s).
//
// useSyncExternalStore guarantees a single subscription per consumer and
// proper concurrent-mode behavior; the engine itself owns the setInterval.
export function useSimulatedPrices() {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
