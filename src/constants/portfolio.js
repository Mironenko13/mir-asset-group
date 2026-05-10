// Single source of truth for the model portfolio.
//
// Prices and share counts are baked in here. The marketSim engine reads
// these as `basePrice`, then walks each ticker forward in a correlated
// random-walk every 2 s — see src/lib/marketSim.js. The dashboard reads
// the live (simulated) prices via useSimulatedPrices → useModelPortfolio.
//
// Total at base prices: ~$5,198,134 (within the $5.2M ± $50k target).
// Bucket weights: Equities 40 / Crypto 25 / Dividends 15 / Energy 7 /
// Metals 8 / Quantum 5.
//
// Snapshot context: prices reflect early May 2026 levels. The simulation
// drifts them forward in real time during the session.

export const PORTFOLIO_BASELINE_USD = 5_200_000;
export const PORTFOLIO_SNAPSHOT_LABEL = 'Live · simulated market data';

export const PORTFOLIO_ALLOCATION = [
  { id: 'equities',  label: 'Equities',             color: '#5b8af0', holdings: [
    { ticker: 'QQQ',   name: 'Invesco QQQ Trust',          pct: 8, price: 754, shares: 552  },
    { ticker: 'VTI',   name: 'Vanguard Total Stock Market', pct: 6, price: 335, shares: 931  },
    { ticker: 'SPY',   name: 'SPDR S&P 500 ETF',           pct: 4, price: 802, shares: 259  },
    { ticker: 'NVDA',  name: 'NVIDIA Corp',                pct: 4, price: 215, shares: 966  },
    { ticker: 'MSFT',  name: 'Microsoft Corp',             pct: 3, price: 495, shares: 316  },
    { ticker: 'AAPL',  name: 'Apple Inc',                  pct: 3, price: 253, shares: 617  },
    { ticker: 'GOOGL', name: 'Alphabet Inc',               pct: 2, price: 198, shares: 526  },
    { ticker: 'TSLA',  name: 'Tesla Inc',                  pct: 2, price: 330, shares: 316  },
    { ticker: 'AMD',   name: 'Advanced Micro Devices',     pct: 2, price: 198, shares: 526  },
    { ticker: 'PLTR',  name: 'Palantir Technologies',      pct: 2, price: 88,  shares: 1183 },
    { ticker: 'SMCI',  name: 'Super Micro Computer',       pct: 2, price: 55,  shares: 1893 },
    { ticker: 'JPM',   name: 'JPMorgan Chase',             pct: 2, price: 275, shares: 379  },
  ]},
  { id: 'crypto',    label: 'Crypto',               color: '#f0a030', holdings: [
    { ticker: 'XRP',   name: 'XRP',                        pct: 12, price: 1.56,  shares: 399927.9718 },
    { ticker: 'BTC',   name: 'Bitcoin',                    pct: 8,  price: 89548, shares: 4.6454      },
    { ticker: 'ETH',   name: 'Ethereum',                   pct: 5,  price: 3736,  shares: 69.5953     },
  ]},
  { id: 'dividends', label: 'Dividends',            color: '#5ab87a', holdings: [
    { ticker: 'SCHD',  name: 'Schwab US Dividend Equity',  pct: 6, price: 31, shares: 10141 },
    { ticker: 'JEPI',  name: 'JPMorgan Equity Premium Inc.', pct: 4, price: 64, shares: 3264  },
    { ticker: 'O',     name: 'Realty Income Corp',         pct: 3, price: 66, shares: 2366  },
    { ticker: 'MO',    name: 'Altria Group',               pct: 2, price: 60, shares: 1721  },
  ]},
  { id: 'quantum',   label: 'Quantum / Emerging',   color: '#a78bfa', holdings: [
    { ticker: 'IONQ',  name: 'IonQ Inc',                   pct: 2.5, price: 46, shares: 2817 },
    { ticker: 'RGTI',  name: 'Rigetti Computing',          pct: 2.5, price: 16, shares: 7887 },
  ]},
  { id: 'metals',    label: 'Precious Metals',      color: '#c9a84c', holdings: [
    { ticker: 'GLD',   name: 'SPDR Gold Trust',            pct: 5, price: 308, shares: 845  },
    { ticker: 'SLV',   name: 'iShares Silver Trust',       pct: 3, price: 33,  shares: 4732 },
  ]},
  { id: 'energy',    label: 'Energy / Commodities', color: '#e07040', holdings: [
    { ticker: 'XLE',   name: 'Energy Select Sector SPDR',  pct: 3, price: 104, shares: 1495 },
    { ticker: 'USO',   name: 'United States Oil Fund',     pct: 2, price: 88,  shares: 1183 },
    { ticker: 'URA',   name: 'Global X Uranium ETF',       pct: 2, price: 38,  shares: 2704 },
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
