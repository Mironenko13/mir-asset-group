// Single source of truth for the live-priced model portfolio.
//
// PORTFOLIO_ALLOCATION defines the bucket → holdings → target weight tree.
// On the first live-price fetch, share counts are back-calculated against
// PORTFOLIO_BASELINE_USD and frozen for the session (sessionStorage) so the
// total moves naturally with prices. All tabs read from the same allocation
// + the same frozen share counts via useModelPortfolio.

export const PORTFOLIO_BASELINE_USD = 4_732_481;

export const PORTFOLIO_ALLOCATION = [
  { id: 'equities',  label: 'Equities',             color: '#5b8af0', holdings: [
    { ticker: 'QQQ',   pct: 8 },
    { ticker: 'VTI',   pct: 6 },
    { ticker: 'SPY',   pct: 4 },
    { ticker: 'NVDA',  pct: 4 },
    { ticker: 'MSFT',  pct: 3 },
    { ticker: 'AAPL',  pct: 3 },
    { ticker: 'GOOGL', pct: 2 },
    { ticker: 'TSLA',  pct: 2 },
    { ticker: 'AMD',   pct: 2 },
    { ticker: 'PLTR',  pct: 2 },
    { ticker: 'SMCI',  pct: 2 },
    { ticker: 'JPM',   pct: 2 },
  ]},
  { id: 'crypto',    label: 'Crypto',               color: '#f0a030', holdings: [
    { ticker: 'XRP',   pct: 12 },
    { ticker: 'BTC',   pct: 8  },
    { ticker: 'ETH',   pct: 5  },
  ]},
  { id: 'dividends', label: 'Dividends',            color: '#5ab87a', holdings: [
    { ticker: 'SCHD',  pct: 6 },
    { ticker: 'JEPI',  pct: 4 },
    { ticker: 'O',     pct: 3 },
    { ticker: 'MO',    pct: 2 },
  ]},
  { id: 'quantum',   label: 'Quantum / Emerging',   color: '#a78bfa', holdings: [
    { ticker: 'IONQ',  pct: 2.5 },
    { ticker: 'RGTI',  pct: 2.5 },
  ]},
  { id: 'metals',    label: 'Precious Metals',      color: '#c9a84c', holdings: [
    { ticker: 'GLD',   pct: 5 },
    { ticker: 'SLV',   pct: 3 },
  ]},
  { id: 'energy',    label: 'Energy / Commodities', color: '#e07040', holdings: [
    { ticker: 'XLE',   pct: 3 },
    { ticker: 'USO',   pct: 2 },
    { ticker: 'URA',   pct: 2 },
  ]},
];

// Storage keys (kept stable so existing user sessions don't lose their frozen shares).
export const LANDING_SHARES_KEY = 'mag_landing_shares';
export const PRICES_CACHE_KEY    = 'mag_market_prices';
export const PRICES_CACHE_TS_KEY = 'mag_market_prices_ts';

// Bucket display order on the Portfolio tab (largest first by intent).
export const PORTFOLIO_TAB_BUCKET_ORDER = [
  'equities',
  'crypto',
  'dividends',
  'energy',
  'metals',
  'quantum',
];

// Buy-borrow-die LTV against the live portfolio total.
export const BORROWING_LTV_PCT = 0.40;

// Monthly draw figure used by the Dashboard "Available to Invest" KPI:
// 3.5% of portfolio total per month (~safe perpetual draw rate from a diversified book).
// Hardcoded multiplier per spec — not a real income figure, just a portfolio-scaled budget.
export const MONTHLY_DRAW_PCT = 0.035;
