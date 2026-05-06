// Single source of truth for the model portfolio.
//
// SNAPSHOT MODE — early May 2026.
// Per-holding `price` and `shares` are hardcoded against a $4,732,481
// baseline. Bucket weights (Equities 40%, Crypto 25%, Dividends 15%,
// Energy 7%, Precious Metals 8%, Quantum 5%) and per-ticker pct values
// match what the live-pricing build was back-calculating against. Live
// updates are deliberately disabled in this build — the dashboard will
// ship with these numbers until live pricing comes back as a separate
// feature. Edit prices/shares here to retune.
//
// `pct` is the share of total portfolio in percent (sums to 100 across
// all buckets — sanity-check: 40+25+15+5+8+7 = 100).

export const PORTFOLIO_BASELINE_USD = 4_732_481;
export const PORTFOLIO_SNAPSHOT_LABEL = 'Snapshot · May 2026';

export const PORTFOLIO_ALLOCATION = [
  { id: 'equities',  label: 'Equities',             color: '#5b8af0', holdings: [
    { ticker: 'QQQ',   pct: 8, price: 686,  shares: 552  },
    { ticker: 'VTI',   pct: 6, price: 305,  shares: 931  },
    { ticker: 'SPY',   pct: 4, price: 730,  shares: 259  },
    { ticker: 'NVDA',  pct: 4, price: 196,  shares: 966  },
    { ticker: 'MSFT',  pct: 3, price: 450,  shares: 316  },
    { ticker: 'AAPL',  pct: 3, price: 230,  shares: 617  },
    { ticker: 'GOOGL', pct: 2, price: 180,  shares: 526  },
    { ticker: 'TSLA',  pct: 2, price: 300,  shares: 316  },
    { ticker: 'AMD',   pct: 2, price: 180,  shares: 526  },
    { ticker: 'PLTR',  pct: 2, price: 80,   shares: 1183 },
    { ticker: 'SMCI',  pct: 2, price: 50,   shares: 1893 },
    { ticker: 'JPM',   pct: 2, price: 250,  shares: 379  },
  ]},
  { id: 'crypto',    label: 'Crypto',               color: '#f0a030', holdings: [
    { ticker: 'XRP',   pct: 12, price: 1.42,  shares: 399927.9718 },
    { ticker: 'BTC',   pct: 8,  price: 81500, shares: 4.6454      },
    { ticker: 'ETH',   pct: 5,  price: 3400,  shares: 69.5953     },
  ]},
  { id: 'dividends', label: 'Dividends',            color: '#5ab87a', holdings: [
    { ticker: 'SCHD',  pct: 6, price: 28, shares: 10141 },
    { ticker: 'JEPI',  pct: 4, price: 58, shares: 3264  },
    { ticker: 'O',     pct: 3, price: 60, shares: 2366  },
    { ticker: 'MO',    pct: 2, price: 55, shares: 1721  },
  ]},
  { id: 'quantum',   label: 'Quantum / Emerging',   color: '#a78bfa', holdings: [
    { ticker: 'IONQ',  pct: 2.5, price: 42, shares: 2817 },
    { ticker: 'RGTI',  pct: 2.5, price: 15, shares: 7887 },
  ]},
  { id: 'metals',    label: 'Precious Metals',      color: '#c9a84c', holdings: [
    { ticker: 'GLD',   pct: 5, price: 280, shares: 845  },
    { ticker: 'SLV',   pct: 3, price: 30,  shares: 4732 },
  ]},
  { id: 'energy',    label: 'Energy / Commodities', color: '#e07040', holdings: [
    { ticker: 'XLE',   pct: 3, price: 95, shares: 1495 },
    { ticker: 'USO',   pct: 2, price: 80, shares: 1183 },
    { ticker: 'URA',   pct: 2, price: 35, shares: 2704 },
  ]},
];

// Bucket display order on the Portfolio tab (largest first by intent).
export const PORTFOLIO_TAB_BUCKET_ORDER = [
  'equities',
  'crypto',
  'dividends',
  'energy',
  'metals',
  'quantum',
];

// Buy-borrow-die LTV against the portfolio total.
export const BORROWING_LTV_PCT = 0.40;

// Monthly draw figure used by the Dashboard "Available to Invest" KPI:
// 3.5% of portfolio total per month (~safe perpetual draw rate from a
// diversified book). Hardcoded multiplier — not a real income figure.
export const MONTHLY_DRAW_PCT = 0.035;
