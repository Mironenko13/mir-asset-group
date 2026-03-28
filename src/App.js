import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import {
  PieChart, Pie, Cell, Tooltip as RTooltip, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Legend,
  AreaChart, Area, ReferenceLine,
} from 'recharts';

// ─── Constants ─────────────────────────────────────────────────────────────────
const MONTHLY_NET = 6185;
const WEEKLY_GROSS = 1649;
const MONTHLY_GROSS = Math.round(WEEKLY_GROSS * 52 / 12); // ~7145
const TITHE_RATE = 0.10;

// Legacy color map — used as fallback for positions created before dynamic buckets
const BUCKET_COLORS = {
  'QQQ':                 '#6366f1',
  'Crypto':              '#f97316',
  'Dividends':           '#22c55e',
  'Quantum':             '#8b5cf6',
  'Quantum/Emerging':    '#8b5cf6',
  'Gold':                '#d4a843',
  'Energy':              '#ef4444',
  'Energy/Commodities':  '#ef4444',
  'Silver':              '#94a3b8',
};

// Default buckets seeded on first load (stored in mag_buckets)
const DEFAULT_BUCKETS = [
  { id: 'qqq',     name: 'QQQ',               color: '#6366f1' },
  { id: 'crypto',  name: 'Crypto',             color: '#f97316' },
  { id: 'div',     name: 'Dividends',          color: '#22c55e' },
  { id: 'quantum', name: 'Quantum/Emerging',   color: '#8b5cf6' },
  { id: 'gold',    name: 'Gold',               color: '#d4a843' },
  { id: 'energy',  name: 'Energy/Commodities', color: '#ef4444' },
  { id: 'silver',  name: 'Silver',             color: '#94a3b8' },
];

const BUCKET_COLOR_PALETTE = [
  '#6366f1','#f97316','#22c55e','#8b5cf6','#d4a843','#ef4444',
  '#94a3b8','#06b6d4','#ec4899','#84cc16','#f59e0b','#10b981',
];

const ASSET_TYPE_META = {
  'Security': { icon: '📈', qtyUnit: 'shares', priceUnit: '$/share' },
  'Crypto':   { icon: '🪙', qtyUnit: 'tokens', priceUnit: '$/token' },
  'Gold':     { icon: '🥇', qtyUnit: 'oz t',   priceUnit: '$/oz t'  },
  'Silver':   { icon: '🥈', qtyUnit: 'oz t',   priceUnit: '$/oz t'  },
};

const EXPENSE_CATEGORIES = [
  'Housing', 'Food', 'Vehicle/Fuel', 'Homeschool', 'Tithe',
  'Tools/Equipment', 'Tech/Software', 'Kids', 'Medical', 'Investments', 'Misc',
];

const CAT_COLORS = {
  'Housing':         '#6366f1',
  'Food':            '#22c55e',
  'Vehicle/Fuel':    '#f97316',
  'Homeschool':      '#8b5cf6',
  'Tithe':           '#d4a843',
  'Tools/Equipment': '#ef4444',
  'Tech/Software':   '#06b6d4',
  'Kids':            '#ec4899',
  'Medical':         '#14b8a6',
  'Investments':     '#84cc16',
  'Misc':            '#64748b',
};

const CRYPTO_SUB_BUCKETS = ['XRP', 'WLFI', 'BTC', 'Solana', 'XLM', 'HBAR', 'Other'];

// ─── Net Worth Categories ──────────────────────────────────────────────────────
const NW_CATEGORIES = ['liquidInvestments', 'crypto', 'metals', 'cash', 'businessEquity', 'realEstate'];
const NW_COLORS = {
  liquidInvestments: '#6366f1',
  crypto:            '#f97316',
  metals:            '#d4a843',
  cash:              '#22c55e',
  businessEquity:    '#8b5cf6',
  realEstate:        '#ef4444',
};
const NW_LABELS = {
  liquidInvestments: 'Liquid Investments',
  crypto:            'Crypto',
  metals:            'Metals',
  cash:              'Cash',
  businessEquity:    'Business Equity',
  realEstate:        'Real Estate',
};

// ─── PIN Auth ──────────────────────────────────────────────────────────────────
// SHA-256("7777") — to change PIN, update this constant:
// node -e "require('crypto').createHash('sha256').update('YOUR_PIN').digest('hex')"
const PIN_HASH = '41c991eb6a66242c0454191244278183ce58cf4a6bcd372f799e4b9cc01886af';
const SESSION_KEY = 'mag_auth';

async function hashPin(pin) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(pin));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}

// ─── Asset Acquisition Roadmap ─────────────────────────────────────────────────
const ROADMAP_MILESTONES = [
  { id: 'skidsteer', label: 'Skid Steer / Equipment Rental', icon: '🏗', minCost: 25000,  maxCost: 40000,  color: '#f97316', description: 'Used equipment for rental to homeowners & contractors' },
  { id: 'butcher',   label: 'Butcher Shop',                  icon: '🥩', minCost: 80000,  maxCost: 120000, color: '#ef4444', description: 'Community butcher suited to Mennonite market' },
  { id: 'rental',    label: 'Rental Properties',             icon: '🏠', minCost: 150000, maxCost: 200000, color: '#6366f1', description: 'Union County, PA residential rental' },
  { id: 'land',      label: 'Land (Long-Term Hold)',          icon: '🌾', minCost: 100000, maxCost: 200000, color: '#22c55e', description: 'Land acquisition for long-term appreciation' },
];

// ─── Styles ────────────────────────────────────────────────────────────────────
const S = {
  app: {
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    background: '#0f1117',
    minHeight: '100vh',
    color: '#f1f5f9',
  },
  header: {
    background: '#0a0d14',
    borderBottom: '1px solid #1e2535',
    padding: '0 20px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: 56,
    position: 'sticky',
    top: 0,
    zIndex: 100,
    flexWrap: 'wrap',
    gap: 8,
  },
  logo: {
    fontSize: 15,
    fontWeight: 800,
    color: '#d4a843',
    letterSpacing: '-0.3px',
    flexShrink: 0,
  },
  nav: { display: 'flex', gap: 2 },
  navBtn: (active) => ({
    padding: '6px 13px',
    background: active ? 'rgba(212,168,67,0.12)' : 'transparent',
    border: active ? '1px solid rgba(212,168,67,0.3)' : '1px solid transparent',
    borderRadius: 7,
    color: active ? '#d4a843' : '#64748b',
    fontWeight: active ? 700 : 500,
    fontSize: 13,
    cursor: 'pointer',
  }),
  body: { padding: '20px 16px', maxWidth: 980, margin: '0 auto' },
  card: {
    background: '#161b27',
    border: '1px solid #1e2535',
    borderRadius: 12,
    padding: '16px 18px',
  },
  cardTitle: {
    fontSize: 10,
    fontWeight: 700,
    color: '#64748b',
    textTransform: 'uppercase',
    letterSpacing: '0.6px',
    marginBottom: 10,
  },
  bigNum: { fontSize: 26, fontWeight: 800, color: '#f1f5f9', lineHeight: 1.1 },
  bigNumSub: { fontSize: 11, color: '#64748b', marginTop: 3 },
  sectionLabel: {
    fontSize: 10,
    fontWeight: 700,
    color: '#64748b',
    textTransform: 'uppercase',
    letterSpacing: '0.6px',
    marginBottom: 10,
    marginTop: 22,
  },
  inputStyle: {
    width: '100%',
    boxSizing: 'border-box',
    background: '#0f1117',
    border: '1px solid #334155',
    borderRadius: 8,
    color: '#f1f5f9',
    fontSize: 14,
    padding: '9px 12px',
    fontFamily: 'inherit',
    outline: 'none',
  },
  selectStyle: {
    width: '100%',
    boxSizing: 'border-box',
    background: '#0f1117',
    border: '1px solid #334155',
    borderRadius: 8,
    color: '#f1f5f9',
    fontSize: 14,
    padding: '9px 12px',
    fontFamily: 'inherit',
    outline: 'none',
    cursor: 'pointer',
  },
  btn: {
    padding: '9px 16px',
    background: 'linear-gradient(135deg,#d4a843,#b8892a)',
    border: 'none',
    borderRadius: 8,
    color: '#0f1117',
    fontWeight: 700,
    fontSize: 13,
    cursor: 'pointer',
  },
  btnGhost: {
    padding: '9px 16px',
    background: '#1e2535',
    border: '1px solid #2d3748',
    borderRadius: 8,
    color: '#94a3b8',
    fontWeight: 600,
    fontSize: 13,
    cursor: 'pointer',
  },
  btnDanger: {
    padding: '4px 9px',
    background: 'rgba(239,68,68,0.1)',
    border: '1px solid rgba(239,68,68,0.2)',
    borderRadius: 6,
    color: '#ef4444',
    fontWeight: 600,
    fontSize: 11,
    cursor: 'pointer',
  },
  overlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.75)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
    padding: 20,
  },
  modal: {
    background: '#161b27',
    border: '1px solid #1e2535',
    borderRadius: 14,
    padding: '24px 22px',
    width: '100%',
    maxWidth: 440,
    maxHeight: '90vh',
    overflowY: 'auto',
    position: 'relative',
  },
  closeBtn: {
    position: 'absolute',
    top: 14,
    right: 16,
    background: 'none',
    border: 'none',
    color: '#64748b',
    fontSize: 20,
    cursor: 'pointer',
    lineHeight: 1,
    padding: 0,
  },
  tag: (color) => ({
    display: 'inline-block',
    padding: '2px 8px',
    borderRadius: 10,
    background: color + '22',
    color: color,
    fontSize: 11,
    fontWeight: 600,
  }),
  table: { width: '100%', borderCollapse: 'collapse' },
  th: {
    textAlign: 'left',
    fontSize: 10,
    fontWeight: 700,
    color: '#475569',
    textTransform: 'uppercase',
    letterSpacing: '0.4px',
    padding: '6px 8px',
    borderBottom: '1px solid #1e2535',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  },
  td: {
    padding: '8px 8px',
    fontSize: 13,
    color: '#e2e8f0',
    borderBottom: '1px solid #0f1117',
    verticalAlign: 'middle',
  },
  pnlPos: { color: '#22c55e', fontWeight: 700 },
  pnlNeg: { color: '#ef4444', fontWeight: 700 },
  alert: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '8px 12px',
    background: 'rgba(212,168,67,0.08)',
    border: '1px solid rgba(212,168,67,0.2)',
    borderRadius: 8,
    fontSize: 12,
    color: '#d4a843',
    marginBottom: 6,
    flexWrap: 'wrap',
  },
  grid2: { display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 },
  grid3: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 },
};

// ─── Helpers ───────────────────────────────────────────────────────────────────
const fmt$ = (n, dec = 2) => {
  if (n == null) return '–';
  const s = Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec });
  return (n < 0 ? '-$' : '$') + s;
};
const fmtPct = (n, dec = 1) => n == null ? '–' : (n >= 0 ? '+' : '') + Number(n).toFixed(dec) + '%';
const TODAY_STR = new Date().toISOString().slice(0, 10);
const CURRENT_MONTH = TODAY_STR.slice(0, 7);

function useIsMobile() {
  const [mobile, setMobile] = useState(() => typeof window !== 'undefined' && window.innerWidth < 768);
  useEffect(() => {
    const h = () => setMobile(window.innerWidth < 768);
    window.addEventListener('resize', h);
    return () => window.removeEventListener('resize', h);
  }, []);
  return mobile;
}

function useLocalStorage(key, init) {
  const [val, setVal] = useState(() => {
    try { const s = localStorage.getItem(key); return s ? JSON.parse(s) : init; }
    catch { return init; }
  });
  const set = useCallback((v) => {
    setVal(prev => {
      const next = typeof v === 'function' ? v(prev) : v;
      try { localStorage.setItem(key, JSON.stringify(next)); } catch {}
      return next;
    });
  }, [key]);
  return [val, set];
}

function genId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

// ─── Portfolio helpers ─────────────────────────────────────────────────────────
function portfolioStats(positions) {
  const totalValue = positions.reduce((s, p) => s + p.quantity * p.currentPrice, 0);
  const byBucket = {};
  positions.forEach(p => {
    const v = p.quantity * p.currentPrice;
    byBucket[p.bucket] = (byBucket[p.bucket] || 0) + v;
  });
  const alloc = {};
  Object.keys(byBucket).forEach(b => { alloc[b] = totalValue > 0 ? (byBucket[b] / totalValue) * 100 : 0; });
  return { totalValue, byBucket, alloc };
}

function getBucketColor(buckets, name) {
  const b = (buckets || []).find(x => x.name === name);
  return b ? b.color : (BUCKET_COLORS[name] || '#64748b');
}

function inferAssetType(bucketName) {
  const n = (bucketName || '').toLowerCase();
  if (n.includes('crypto')) return 'Crypto';
  if (n.includes('gold'))   return 'Gold';
  if (n.includes('silver')) return 'Silver';
  return 'Security';
}

function calcDriftAlerts(alloc, targets) {
  return Object.entries(targets || {})
    .map(([bucket, target]) => ({ bucket, target, actual: alloc[bucket] || 0, drift: (alloc[bucket] || 0) - target }))
    .filter(d => Math.abs(d.drift) > 3)
    .sort((a, b) => Math.abs(b.drift) - Math.abs(a.drift));
}

// ─── App ───────────────────────────────────────────────────────────────────────
function PinLock({ onUnlock }) {
  const [digits, setDigits] = useState([]);
  const [shake,  setShake]  = useState(false);
  const [error,  setError]  = useState('');

  const addDigit = useCallback((d) => {
    setError('');
    setDigits(prev => {
      if (prev.length >= 4) return prev;
      const next = [...prev, d];
      if (next.length === 4) {
        hashPin(next.join('')).then(h => {
          if (h === PIN_HASH) {
            sessionStorage.setItem(SESSION_KEY, '1');
            onUnlock();
          } else {
            setShake(true);
            setError('Incorrect PIN');
            setTimeout(() => { setShake(false); setDigits([]); setError(''); }, 700);
          }
        });
      }
      return next;
    });
  }, [onUnlock]);

  const del = useCallback(() => setDigits(p => p.slice(0, -1)), []);

  const pad = [1,2,3,4,5,6,7,8,9,null,0,'⌫'];

  return (
    <div style={{
      position: 'fixed', inset: 0, background: '#0a0d14',
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', zIndex: 9999, userSelect: 'none',
    }}>
      {/* Logo */}
      <div style={{ fontSize: 13, color: '#94a3b8', letterSpacing: 2, textTransform: 'uppercase', marginBottom: 8 }}>
        ◆ Mir Asset Group
      </div>
      <div style={{ fontSize: 26, fontWeight: 800, color: '#d4a843', marginBottom: 48, letterSpacing: '-0.5px' }}>
        Private Dashboard
      </div>

      {/* Dots */}
      <div style={{
        display: 'flex', gap: 16, marginBottom: 12,
        transform: shake ? 'translateX(0)' : undefined,
        animation: shake ? 'pinShake 0.6s ease' : undefined,
      }}>
        {[0,1,2,3].map(i => (
          <div key={i} style={{
            width: 14, height: 14, borderRadius: '50%',
            background: digits.length > i ? '#d4a843' : 'transparent',
            border: `2px solid ${digits.length > i ? '#d4a843' : '#334155'}`,
            transition: 'background 0.15s, border-color 0.15s',
          }} />
        ))}
      </div>
      <div style={{ height: 20, fontSize: 13, color: '#ef4444', marginBottom: 32 }}>{error}</div>

      {/* Numpad */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 72px)', gap: 12 }}>
        {pad.map((k, i) => {
          if (k === null) return <div key={i} />;
          const isDel = k === '⌫';
          return (
            <button
              key={i}
              onClick={() => isDel ? del() : addDigit(k)}
              style={{
                width: 72, height: 72, borderRadius: '50%',
                background: isDel ? 'transparent' : '#1e2535',
                border: isDel ? 'none' : '1px solid #2d3748',
                color: isDel ? '#94a3b8' : '#f1f5f9',
                fontSize: isDel ? 22 : 24,
                fontWeight: isDel ? 400 : 600,
                cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                transition: 'background 0.1s',
              }}
              onMouseEnter={e => { if (!isDel) e.currentTarget.style.background = '#2d3748'; }}
              onMouseLeave={e => { if (!isDel) e.currentTarget.style.background = '#1e2535'; }}
            >
              {k}
            </button>
          );
        })}
      </div>

      <style>{`
        @keyframes pinShake {
          0%,100% { transform: translateX(0); }
          20%      { transform: translateX(-8px); }
          40%      { transform: translateX(8px); }
          60%      { transform: translateX(-6px); }
          80%      { transform: translateX(6px); }
        }
      `}</style>
    </div>
  );
}

export default function App() {
  const [unlocked, setUnlocked] = useState(() => sessionStorage.getItem(SESSION_KEY) === '1');
  const [tab,      setTab]      = useState('dashboard');
  const [menuOpen, setMenuOpen] = useState(false);
  const isMobile = useIsMobile();

  const [positions,      setPositions]      = useLocalStorage('mag_positions',       []);
  const [expenses,       setExpenses]        = useLocalStorage('mag_expenses',        []);
  const [nwSnapshots,    setNwSnapshots]     = useLocalStorage('mag_nw_snapshots',    []);
  const [nwMilestones,   setNwMilestones]    = useLocalStorage('mag_nw_milestones',   []);
  const [givingEntries,  setGivingEntries]   = useLocalStorage('mag_giving',          []);
  const [roadmapSavings, setRoadmapSavings]  = useLocalStorage('mag_roadmap_savings', {});
  const [buckets,        setBuckets]         = useLocalStorage('mag_buckets',         DEFAULT_BUCKETS);
  const [targets,        setTargets]         = useLocalStorage('mag_targets',         {});

  const { totalValue } = useMemo(() => portfolioStats(positions), [positions]);

  const tabs = [
    { id: 'dashboard', label: 'Dashboard'  },
    { id: 'portfolio', label: 'Portfolio'  },
    { id: 'spending',  label: 'Spending'   },
    { id: 'networth',  label: 'Net Worth'  },
    { id: 'tithe',     label: 'Tithe'      },
    { id: 'roadmap',   label: 'Roadmap'    },
    { id: 'scanner',   label: 'AI Scanner' },
  ];

  const switchTab = useCallback((id) => { setTab(id); setMenuOpen(false); }, []);

  if (!unlocked) return <PinLock onUnlock={() => setUnlocked(true)} />;

  return (
    <div style={S.app}>
      <header style={{ ...S.header, height: isMobile ? 52 : 56 }}>
        <div style={S.logo}>&#9670; Mir Asset Group</div>
        {isMobile ? (
          <button onClick={() => setMenuOpen(m => !m)} style={{ background: 'none', border: 'none', color: '#d4a843', fontSize: 24, cursor: 'pointer', padding: '8px 4px', lineHeight: 1 }}>
            {menuOpen ? '✕' : '☰'}
          </button>
        ) : (
          <nav style={{ ...S.nav, flexWrap: 'wrap' }}>
            {tabs.map(t => (
              <button key={t.id} style={S.navBtn(tab === t.id)} onClick={() => switchTab(t.id)}>{t.label}</button>
            ))}
          </nav>
        )}
      </header>

      {/* Mobile full-screen nav overlay */}
      {isMobile && menuOpen && (
        <div style={{ position: 'fixed', inset: 0, background: '#0a0d14', zIndex: 200, display: 'flex', flexDirection: 'column', paddingTop: 52 }}>
          {tabs.map(t => (
            <button key={t.id} onClick={() => switchTab(t.id)} style={{
              display: 'flex', alignItems: 'center', gap: 12,
              padding: '18px 24px', background: 'none', border: 'none',
              borderBottom: '1px solid #1e2535',
              color: tab === t.id ? '#d4a843' : '#94a3b8',
              fontWeight: tab === t.id ? 700 : 400,
              fontSize: 17, cursor: 'pointer', textAlign: 'left',
            }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: tab === t.id ? '#d4a843' : 'transparent', border: `1px solid ${tab === t.id ? '#d4a843' : '#334155'}`, flexShrink: 0 }} />
              {t.label}
            </button>
          ))}
        </div>
      )}

      <main style={{ ...S.body, padding: isMobile ? '16px 12px' : '20px 16px' }}>
        {tab === 'dashboard' && (
          <DashboardTab
            positions={positions}
            expenses={expenses}
            onAddExpense={e => setExpenses(p => [e, ...p])}
            onTabSwitch={switchTab}
            buckets={buckets}
            targets={targets}
          />
        )}
        {tab === 'portfolio' && (
          <PortfolioTab
            positions={positions}
            setPositions={setPositions}
            buckets={buckets}
            setBuckets={setBuckets}
            targets={targets}
            setTargets={setTargets}
          />
        )}
        {tab === 'spending'  && <SpendingTab expenses={expenses} setExpenses={setExpenses} />}
        {tab === 'networth'  && (
          <NetWorthTab
            snapshots={nwSnapshots}   setSnapshots={setNwSnapshots}
            milestones={nwMilestones} setMilestones={setNwMilestones}
          />
        )}
        {tab === 'tithe'    && <TitheTab   givingEntries={givingEntries} setGivingEntries={setGivingEntries} />}
        {tab === 'roadmap'  && <RoadmapTab roadmapSavings={roadmapSavings} setRoadmapSavings={setRoadmapSavings} portfolioValue={totalValue} />}
        {tab === 'scanner'  && <ScannerTab />}
      </main>
    </div>
  );
}

// ─── KPI Card ─────────────────────────────────────────────────────────────────
function KpiCard({ label, value, sub, subColor, accent }) {
  return (
    <div style={{ ...S.card, borderTop: `2px solid ${accent || '#d4a843'}` }}>
      <div style={S.cardTitle}>{label}</div>
      <div style={S.bigNum}>{value}</div>
      {sub && <div style={{ ...S.bigNumSub, color: subColor || '#64748b' }}>{sub}</div>}
    </div>
  );
}

// ─── Dashboard Tab ─────────────────────────────────────────────────────────────
function DashboardTab({ positions, expenses, onAddExpense, onTabSwitch, buckets, targets }) {
  const isMobile = useIsMobile();
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const { totalValue, alloc } = useMemo(() => portfolioStats(positions), [positions]);
  const alerts = useMemo(() => calcDriftAlerts(alloc, targets), [alloc, targets]);

  const thisMonthExp = useMemo(() => expenses.filter(e => e.date.startsWith(CURRENT_MONTH)), [expenses]);
  const monthlyTithe = Math.round(MONTHLY_GROSS * TITHE_RATE);
  const monthlySpend = thisMonthExp.reduce((s, e) => s + e.amount, 0);
  const deployable = MONTHLY_NET - monthlyTithe - monthlySpend;

  const totalCost = useMemo(() => positions.reduce((s, p) => s + p.quantity * p.avgCost, 0), [positions]);
  const totalPnl = totalValue - totalCost;
  const totalPnlPct = totalCost > 0 ? (totalPnl / totalCost) * 100 : 0;

  // All bucket names to show in snapshot (union of buckets array + actual positions + targets)
  const snapshotBuckets = useMemo(() => {
    const names = new Set([
      ...buckets.map(b => b.name),
      ...Object.keys(alloc).filter(k => (alloc[k] || 0) > 0),
      ...Object.keys(targets),
    ]);
    return [...names];
  }, [buckets, alloc, targets]);

  const recentExp = expenses.slice(0, 5);

  return (
    <div>
      <div style={{ fontSize: isMobile ? 18 : 22, fontWeight: 800, color: '#f1f5f9', marginBottom: 4 }}>Wealth Command Center</div>
      <div style={{ fontSize: 12, color: '#475569', marginBottom: 20 }}>Mir Asset Group, LLC — Personal Dashboard</div>

      {/* ── KPI row ── */}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 20 }}>
        <KpiCard label="Portfolio Value" value={fmt$(totalValue, 0)} sub={fmtPct(totalPnlPct) + ' total return'} subColor={totalPnl >= 0 ? '#22c55e' : '#ef4444'} accent="#d4a843" />
        <KpiCard label="Unrealized P&L" value={fmt$(totalPnl, 0)} sub={`${positions.length} position${positions.length !== 1 ? 's' : ''}`} subColor={totalPnl >= 0 ? '#22c55e' : '#ef4444'} accent={totalPnl >= 0 ? '#22c55e' : '#ef4444'} />
        <KpiCard label="Deployable (MTD)" value={fmt$(deployable, 0)} sub={`${fmt$(monthlySpend, 0)} spent this month`} subColor={deployable >= 0 ? '#22c55e' : '#ef4444'} accent="#d4a843" />
        <KpiCard label="LTV Borrow Power" value={fmt$(totalValue * 0.4, 0)} sub="40% portfolio LTV" accent="#6366f1" />
      </div>

      {/* ── Drift alerts ── */}
      {alerts.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <div role="button" onClick={() => onTabSwitch('portfolio')} style={{ ...S.sectionLabel, cursor: 'pointer', color: '#d4a843', marginTop: 0 }}>
            &#9888; Allocation Drift — click to manage
          </div>
          {alerts.slice(0, 4).map(a => (
            <div key={a.bucket} style={S.alert}>
              <span style={S.tag(getBucketColor(buckets, a.bucket))}>{a.bucket}</span>
              <span style={{ color: '#94a3b8', fontSize: isMobile ? 11 : 13 }}>{a.actual.toFixed(1)}% vs {a.target}% target</span>
              <span style={{ marginLeft: 'auto', fontWeight: 700, color: a.drift > 0 ? '#ef4444' : '#22c55e' }}>
                {a.drift > 0 ? '+' : ''}{a.drift.toFixed(1)}%
              </span>
            </div>
          ))}
        </div>
      )}

      {/* ── Lower row ── */}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 16 }}>
        {/* Allocation snapshot */}
        <div style={S.card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <div style={S.cardTitle}>Allocation Snapshot</div>
            <button style={{ ...S.btnGhost, padding: '3px 8px', fontSize: 11 }} onClick={() => onTabSwitch('portfolio')}>Manage</button>
          </div>
          {positions.length === 0 ? (
            <div style={{ color: '#475569', fontSize: 13, padding: '12px 0' }}>No positions — add them in Portfolio tab</div>
          ) : snapshotBuckets.map(name => {
            const color = getBucketColor(buckets, name);
            const actual = alloc[name] || 0;
            const target = targets[name];
            const hasTarget = target != null;
            const drift = hasTarget ? actual - target : 0;
            const over = hasTarget && Math.abs(drift) > 3;
            const barMax = hasTarget ? Math.max(target * 1.5, actual, 5) : Math.max(actual * 1.5, 5);
            return (
              <div key={name} style={{ marginBottom: 9 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    <div style={{ width: 7, height: 7, borderRadius: '50%', background: color, flexShrink: 0 }} />
                    <span style={{ fontSize: 12, color: '#94a3b8' }}>{name}</span>
                  </div>
                  <span style={{ fontSize: 11, color: over ? (drift > 0 ? '#ef4444' : '#22c55e') : '#64748b' }}>
                    {actual.toFixed(1)}%{hasTarget ? ` / ${target}%${over ? (drift > 0 ? ' ▲' : ' ▼') : ''}` : ''}
                  </span>
                </div>
                <div style={{ height: 4, background: '#1e2535', borderRadius: 2, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${Math.min((actual / barMax) * 100, 100)}%`, background: color, borderRadius: 2, transition: 'width 0.3s' }} />
                </div>
              </div>
            );
          })}
        </div>

        {/* Recent expenses */}
        <div style={S.card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <div style={S.cardTitle}>Recent Expenses</div>
            <button style={{ ...S.btn, padding: '4px 10px', fontSize: 11, minHeight: 32 }} onClick={() => setShowQuickAdd(true)}>+ Add</button>
          </div>
          {recentExp.length === 0 ? (
            <div style={{ color: '#475569', fontSize: 13, padding: '12px 0' }}>No expenses logged yet</div>
          ) : (
            recentExp.map(e => (
              <div key={e.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 0', borderBottom: '1px solid #1e2535' }}>
                <div>
                  <div style={{ fontSize: 13, color: '#e2e8f0' }}>{e.note || e.category}</div>
                  <div style={{ fontSize: 10, color: '#475569' }}>{e.category} &middot; {e.date}</div>
                </div>
                <div style={{ fontWeight: 700, color: '#f1f5f9', fontSize: 13 }}>{fmt$(e.amount, 0)}</div>
              </div>
            ))
          )}
          {expenses.length > 5 && (
            <button style={{ ...S.btnGhost, width: '100%', marginTop: 8, fontSize: 11 }} onClick={() => onTabSwitch('spending')}>
              View all {expenses.length} expenses &#8594;
            </button>
          )}
          <div style={{ marginTop: 12, padding: '10px 12px', background: '#0f1117', borderRadius: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#64748b', marginBottom: 4 }}>
              <span>Monthly Net</span><span>{fmt$(MONTHLY_NET, 0)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#64748b', marginBottom: 4 }}>
              <span>Tithe ({(TITHE_RATE * 100).toFixed(0)}%)</span><span>-{fmt$(monthlyTithe, 0)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#64748b', marginBottom: 6 }}>
              <span>MTD Spend</span><span>-{fmt$(monthlySpend, 0)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, fontWeight: 700, color: deployable >= 0 ? '#22c55e' : '#ef4444', borderTop: '1px solid #1e2535', paddingTop: 6 }}>
              <span>Deployable</span><span>{fmt$(deployable, 0)}</span>
            </div>
          </div>
        </div>
      </div>

      {showQuickAdd && (
        <AddExpenseModal
          onSave={e => { onAddExpense(e); setShowQuickAdd(false); }}
          onClose={() => setShowQuickAdd(false)}
        />
      )}
    </div>
  );
}

// ─── Portfolio Tab ─────────────────────────────────────────────────────────────
function PortfolioTab({ positions, setPositions, buckets, setBuckets, targets, setTargets }) {
  const isMobile = useIsMobile();
  const [showAdd,       setShowAdd]       = useState(false);
  const [editPos,       setEditPos]       = useState(null);
  const [sortKey,       setSortKey]       = useState('bucket');
  const [sortDir,       setSortDir]       = useState(1);
  const [editingTarget, setEditingTarget] = useState(null);
  const [targetInput,   setTargetInput]   = useState('');

  const { totalValue, alloc } = useMemo(() => portfolioStats(positions), [positions]);
  const alerts = useMemo(() => calcDriftAlerts(alloc, targets), [alloc, targets]);
  const totalCost = useMemo(() => positions.reduce((s, p) => s + p.quantity * p.avgCost, 0), [positions]);
  const totalPnl = totalValue - totalCost;

  // All bucket names for charts: union of buckets array + actual positions
  const allBucketNames = useMemo(() => {
    const names = new Set([...buckets.map(b => b.name), ...Object.keys(alloc).filter(k => (alloc[k] || 0) > 0)]);
    return [...names];
  }, [buckets, alloc]);

  const pieData = useMemo(() => allBucketNames.map(name => ({
    name, value: Math.max(parseFloat((alloc[name] || 0).toFixed(1)), 0.01),
  })), [allBucketNames, alloc]);

  const barData = useMemo(() => allBucketNames.map(name => ({
    name,
    actual: parseFloat((alloc[name] || 0).toFixed(1)),
    target: targets[name] != null ? targets[name] : undefined,
  })), [allBucketNames, alloc, targets]);

  const sortedPositions = useMemo(() => {
    return [...positions].sort((a, b) => {
      if (sortKey === 'bucket') return a.bucket.localeCompare(b.bucket) * sortDir;
      if (sortKey === 'ticker') return a.ticker.localeCompare(b.ticker) * sortDir;
      let av = 0, bv = 0;
      if (sortKey === 'value')  { av = a.quantity * a.currentPrice; bv = b.quantity * b.currentPrice; }
      else if (sortKey === 'pnl')    { av = (a.currentPrice - a.avgCost) * a.quantity; bv = (b.currentPrice - b.avgCost) * b.quantity; }
      else if (sortKey === 'pnlPct') { av = a.avgCost > 0 ? (a.currentPrice - a.avgCost) / a.avgCost : 0; bv = b.avgCost > 0 ? (b.currentPrice - b.avgCost) / b.avgCost : 0; }
      else if (sortKey === 'alloc')  { av = alloc[a.bucket] || 0; bv = alloc[b.bucket] || 0; }
      return (av - bv) * sortDir;
    });
  }, [positions, sortKey, sortDir, alloc]);

  const toggleSort = (k) => { if (sortKey === k) setSortDir(d => -d); else { setSortKey(k); setSortDir(-1); } };
  const sortIcon   = (k) => sortKey === k ? (sortDir === -1 ? ' &#8595;' : ' &#8593;') : '';

  const saveTarget = (name) => {
    const v = parseFloat(targetInput);
    if (!isNaN(v) && v >= 0 && v <= 100) {
      setTargets(prev => ({ ...prev, [name]: v }));
    }
    setEditingTarget(null);
    setTargetInput('');
  };
  const removeTarget = (name) => setTargets(prev => { const n = { ...prev }; delete n[name]; return n; });

  const handleSave = (pos) => {
    if (pos.id) { setPositions(p => p.map(x => x.id === pos.id ? pos : x)); }
    else        { setPositions(p => [{ ...pos, id: genId() }, ...p]); }
    setShowAdd(false); setEditPos(null);
  };
  const handleDelete = (id) => { if (window.confirm('Delete this position?')) setPositions(p => p.filter(x => x.id !== id)); };

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 10 }}>
        <div>
          <div style={{ fontSize: isMobile ? 18 : 20, fontWeight: 800, color: '#f1f5f9' }}>Portfolio Tracker</div>
          {positions.length > 0 && (
            <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
              {fmt$(totalValue, 0)} total &middot; P&L <span style={{ color: totalPnl >= 0 ? '#22c55e' : '#ef4444', fontWeight: 700 }}>{fmt$(totalPnl, 0)}</span>
            </div>
          )}
        </div>
        <button style={{ ...S.btn, minHeight: 44 }} onClick={() => setShowAdd(true)}>+ Add Position</button>
      </div>

      {/* ── Drift alerts ── */}
      {alerts.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          {alerts.map(a => (
            <div key={a.bucket} style={S.alert}>
              <span style={S.tag(getBucketColor(buckets, a.bucket))}>{a.bucket}</span>
              <span style={{ color: '#94a3b8', fontSize: isMobile ? 11 : 13 }}>{a.actual.toFixed(1)}% vs {a.target}% target</span>
              <span style={{ marginLeft: 'auto', fontWeight: 700, color: a.drift > 0 ? '#ef4444' : '#22c55e' }}>
                {a.drift > 0 ? '+' : ''}{a.drift.toFixed(1)}% drift
              </span>
            </div>
          ))}
        </div>
      )}

      {/* ── Charts ── */}
      {positions.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 16, marginBottom: 20 }}>
          {/* Donut chart */}
          <div style={S.card}>
            <div style={S.cardTitle}>Actual Allocation — {fmt$(totalValue, 0)}</div>
            <ResponsiveContainer width="100%" height={190}>
              <PieChart>
                <Pie data={pieData} cx="50%" cy="50%" innerRadius={52} outerRadius={82} paddingAngle={2} dataKey="value">
                  {pieData.map((entry) => <Cell key={entry.name} fill={getBucketColor(buckets, entry.name)} />)}
                </Pie>
                <RTooltip formatter={(v, n) => [`${v}%`, n]} contentStyle={{ background: '#161b27', border: '1px solid #334155', borderRadius: 8, color: '#f1f5f9', fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
            {/* Bucket legend + target setter */}
            <div style={{ marginTop: 8 }}>
              {allBucketNames.map(name => {
                const color = getBucketColor(buckets, name);
                const tgt = targets[name];
                return (
                  <div key={name} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 0', borderBottom: '1px solid #0f1117', flexWrap: 'wrap' }}>
                    <div style={{ width: 7, height: 7, borderRadius: '50%', background: color, flexShrink: 0 }} />
                    <span style={{ fontSize: 12, color: '#94a3b8', flex: 1 }}>{name}</span>
                    <span style={{ fontSize: 12, fontWeight: 600, color: '#f1f5f9' }}>{(alloc[name] || 0).toFixed(1)}%</span>
                    {editingTarget === name ? (
                      <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                        <input
                          autoFocus
                          type="number" min="0" max="100" step="0.5"
                          value={targetInput}
                          onChange={e => setTargetInput(e.target.value)}
                          onKeyDown={e => { if (e.key === 'Enter') saveTarget(name); if (e.key === 'Escape') { setEditingTarget(null); setTargetInput(''); } }}
                          placeholder="target %"
                          style={{ ...S.inputStyle, width: 72, padding: '3px 7px', fontSize: 12 }}
                        />
                        <button style={{ ...S.btn, padding: '3px 8px', fontSize: 11, minHeight: 28 }} onClick={() => saveTarget(name)}>✓</button>
                        <button style={{ ...S.btnGhost, padding: '3px 7px', fontSize: 11, minHeight: 28 }} onClick={() => { setEditingTarget(null); setTargetInput(''); }}>✕</button>
                      </div>
                    ) : tgt != null ? (
                      <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                        <span style={{ fontSize: 11, color: '#64748b' }}>→ {tgt}%</span>
                        <button onClick={() => { setEditingTarget(name); setTargetInput(String(tgt)); }} style={{ ...S.btnGhost, padding: '2px 6px', fontSize: 10, minHeight: 24 }}>✎</button>
                        <button onClick={() => removeTarget(name)} style={{ ...S.btnDanger, padding: '2px 5px', minHeight: 24 }}>✕</button>
                      </div>
                    ) : (
                      <button onClick={() => { setEditingTarget(name); setTargetInput(''); }} style={{ ...S.btnGhost, padding: '2px 8px', fontSize: 10, minHeight: 24, color: '#64748b' }}>
                        Set target
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Bar chart */}
          <div style={S.card}>
            <div style={S.cardTitle}>Allocation — Actual vs Target (%)</div>
            <ResponsiveContainer width="100%" height={isMobile ? 220 : 215}>
              <BarChart data={barData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }} barGap={2}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e2535" />
                <XAxis dataKey="name" tick={{ fill: '#64748b', fontSize: 9 }} />
                <YAxis tick={{ fill: '#64748b', fontSize: 10 }} />
                <RTooltip formatter={(v, n) => v != null ? [`${v}%`, n] : ['–', n]} contentStyle={{ background: '#161b27', border: '1px solid #334155', borderRadius: 8, color: '#f1f5f9', fontSize: 12 }} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="target" fill="#2d3748" name="Target %" radius={[3, 3, 0, 0]} />
                <Bar dataKey="actual" fill="#d4a843" name="Actual %" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* ── Position table ── */}
      {positions.length === 0 ? (
        <div style={{ ...S.card, textAlign: 'center', padding: '48px 20px' }}>
          <div style={{ fontSize: 40, marginBottom: 14 }}>&#128200;</div>
          <div style={{ fontSize: 15, color: '#94a3b8', marginBottom: 18 }}>No positions yet. Add your first holding to start tracking.</div>
          <button style={{ ...S.btn, minHeight: 44 }} onClick={() => setShowAdd(true)}>+ Add First Position</button>
        </div>
      ) : (
        <div style={S.card}>
          <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
            <table style={{ ...S.table, minWidth: 600 }}>
              <thead>
                <tr>
                  {[['ticker','Ticker'],['bucket','Bucket'],['value','Value'],['pnl','P&L'],['pnlPct','P&L %'],['alloc','Alloc %']].map(([k, lbl]) => (
                    <th key={k} style={S.th} onClick={() => toggleSort(k)} dangerouslySetInnerHTML={{ __html: lbl + sortIcon(k) }} />
                  ))}
                  <th style={{ ...S.th, cursor: 'default' }}>Qty / Avg / Price</th>
                  <th style={{ ...S.th, cursor: 'default' }}></th>
                </tr>
              </thead>
              <tbody>
                {sortedPositions.map(pos => {
                  const val     = pos.quantity * pos.currentPrice;
                  const pnl     = (pos.currentPrice - pos.avgCost) * pos.quantity;
                  const pnlPct  = pos.avgCost > 0 ? ((pos.currentPrice - pos.avgCost) / pos.avgCost) * 100 : 0;
                  const allocPct = totalValue > 0 ? (val / totalValue) * 100 : 0;
                  const posType  = pos.assetType || inferAssetType(pos.bucket);
                  const meta     = ASSET_TYPE_META[posType] || ASSET_TYPE_META.Security;
                  return (
                    <tr key={pos.id} onDoubleClick={() => setEditPos(pos)} style={{ cursor: 'default' }}>
                      <td style={S.td}>
                        <div style={{ fontWeight: 700, color: '#f1f5f9' }}>{meta.icon} {pos.ticker}</div>
                        {pos.name && <div style={{ fontSize: 10, color: '#64748b' }}>{pos.name}</div>}
                      </td>
                      <td style={S.td}>
                        <span style={S.tag(getBucketColor(buckets, pos.bucket))}>{pos.bucket}</span>
                        {pos.subBucket && <div style={{ fontSize: 10, color: '#64748b', marginTop: 2 }}>{pos.subBucket}</div>}
                      </td>
                      <td style={S.td}><strong>{fmt$(val, 0)}</strong></td>
                      <td style={{ ...S.td, ...(pnl >= 0 ? S.pnlPos : S.pnlNeg) }}>{pnl >= 0 ? '+' : ''}{fmt$(pnl, 0)}</td>
                      <td style={{ ...S.td, ...(pnlPct >= 0 ? S.pnlPos : S.pnlNeg) }}>{fmtPct(pnlPct)}</td>
                      <td style={S.td}>{allocPct.toFixed(1)}%</td>
                      <td style={{ ...S.td, fontSize: 11, color: '#64748b', whiteSpace: 'nowrap' }}>
                        {pos.quantity} {meta.qtyUnit} &times; {fmt$(pos.avgCost)} / {fmt$(pos.currentPrice)}
                      </td>
                      <td style={S.td}>
                        <div style={{ display: 'flex', gap: 4 }}>
                          <button style={{ ...S.btnGhost, padding: '3px 8px', fontSize: 11, minHeight: 32 }} onClick={() => setEditPos(pos)}>Edit</button>
                          <button style={{ ...S.btnDanger, minHeight: 32 }} onClick={() => handleDelete(pos.id)}>&#10005;</button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={2} style={{ ...S.td, fontWeight: 700, color: '#94a3b8', fontSize: 11 }}>TOTAL ({positions.length})</td>
                  <td style={{ ...S.td, fontWeight: 800, color: '#d4a843' }}>{fmt$(totalValue, 0)}</td>
                  <td style={{ ...S.td, ...(totalPnl >= 0 ? S.pnlPos : S.pnlNeg) }}>{totalPnl >= 0 ? '+' : ''}{fmt$(totalPnl, 0)}</td>
                  <td style={{ ...S.td, ...(totalPnl >= 0 ? S.pnlPos : S.pnlNeg) }}>
                    {totalCost > 0 ? fmtPct((totalPnl / totalCost) * 100) : '–'}
                  </td>
                  <td colSpan={3} style={S.td}></td>
                </tr>
              </tfoot>
            </table>
          </div>
          <div style={{ marginTop: 8, fontSize: 10, color: '#334155' }}>Double-click a row to edit</div>
        </div>
      )}

      {(showAdd || editPos) && (
        <AddPositionModal
          position={editPos}
          buckets={buckets}
          setBuckets={setBuckets}
          onSave={handleSave}
          onClose={() => { setShowAdd(false); setEditPos(null); }}
        />
      )}
    </div>
  );
}

// ─── Add Position Modal ────────────────────────────────────────────────────────
function AddPositionModal({ position, buckets, setBuckets, onSave, onClose }) {
  const isMobile = useIsMobile();
  const defaultBucket = position?.bucket || buckets[0]?.name || '';

  const [ticker,         setTicker]         = useState(position?.ticker       || '');
  const [name,           setName]           = useState(position?.name         || '');
  const [bucket,         setBucket]         = useState(defaultBucket);
  const [subBucket,      setSubBucket]      = useState(position?.subBucket    || '');
  const [quantity,       setQuantity]       = useState(position?.quantity     != null ? String(position.quantity)     : '');
  const [avgCost,        setAvgCost]        = useState(position?.avgCost      != null ? String(position.avgCost)      : '');
  const [currentPrice,   setCurrentPrice]   = useState(position?.currentPrice != null ? String(position.currentPrice) : '');
  const [assetType,      setAssetType]      = useState(position?.assetType    || inferAssetType(defaultBucket));
  const [creatingBucket, setCreatingBucket] = useState(false);
  const [newBucketName,  setNewBucketName]  = useState('');
  const [newBucketColor, setNewBucketColor] = useState(BUCKET_COLOR_PALETTE[0]);
  const tickerRef = useRef(null);

  useEffect(() => { if (!position && tickerRef.current) tickerRef.current.focus(); }, [position]);

  // Auto-infer asset type when bucket changes (only for new positions)
  const prevBucket = useRef(bucket);
  useEffect(() => {
    if (!position && bucket !== prevBucket.current) {
      setAssetType(inferAssetType(bucket));
      prevBucket.current = bucket;
    }
  }, [bucket, position]);

  const isCryptoBucket = bucket.toLowerCase().includes('crypto');
  const meta = ASSET_TYPE_META[assetType] || ASSET_TYPE_META['Security'];

  const qty = parseFloat(quantity);
  const avg = parseFloat(avgCost);
  const cur = parseFloat(currentPrice);
  const canSave = ticker.trim() && !isNaN(qty) && qty > 0 && !isNaN(avg) && avg >= 0 && !isNaN(cur) && cur >= 0;
  const liveVal = canSave ? qty * cur : null;
  const livePnl = canSave ? (cur - avg) * qty : null;

  const commitNewBucket = () => {
    if (!newBucketName.trim()) return;
    const nb = { id: genId(), name: newBucketName.trim(), color: newBucketColor };
    setBuckets(p => [...p, nb]);
    setBucket(nb.name);
    setCreatingBucket(false);
    setNewBucketName('');
  };

  const handleSave = () => {
    if (!canSave) return;
    onSave({
      ...position,
      ticker:       ticker.trim().toUpperCase(),
      name:         name.trim(),
      bucket,
      subBucket:    isCryptoBucket ? subBucket : '',
      assetType,
      quantity:     qty,
      avgCost:      avg,
      currentPrice: cur,
    });
  };

  const fld = (label, val, set, extra = {}) => (
    <div style={{ marginBottom: 12 }}>
      <label style={{ display: 'block', fontSize: 11, color: '#64748b', marginBottom: 4, fontWeight: 600 }}>{label}</label>
      <input value={val} onChange={e => set(e.target.value)} style={S.inputStyle} {...extra} />
    </div>
  );

  return (
    <div style={S.overlay} onClick={onClose}>
      <div style={{ ...S.modal, maxWidth: isMobile ? 'none' : 460, margin: isMobile ? '0 12px' : undefined }} onClick={e => e.stopPropagation()}>
        <button style={S.closeBtn} onClick={onClose}>&#215;</button>
        <div style={{ fontSize: 16, fontWeight: 700, color: '#f1f5f9', marginBottom: 16 }}>
          {position ? 'Edit Position' : 'Add Position'}
        </div>

        {/* ── Bucket selector ── */}
        <div style={{ marginBottom: 12 }}>
          <label style={{ display: 'block', fontSize: 11, color: '#64748b', marginBottom: 4, fontWeight: 600 }}>Bucket *</label>
          {!creatingBucket ? (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <select value={bucket} onChange={e => { if (e.target.value === '__new__') setCreatingBucket(true); else setBucket(e.target.value); }} style={{ ...S.selectStyle, flex: 1 }}>
                {buckets.map(b => <option key={b.id} value={b.name}>{b.name}</option>)}
                <option value="__new__">+ Create new bucket…</option>
              </select>
              <div style={{ width: 28, height: 36, borderRadius: 6, background: getBucketColor(buckets, bucket), flexShrink: 0 }} />
            </div>
          ) : (
            <div>
              <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                <input autoFocus value={newBucketName} onChange={e => setNewBucketName(e.target.value)} onKeyDown={e => e.key === 'Enter' && commitNewBucket()} placeholder="Bucket name" style={{ ...S.inputStyle, flex: 1 }} />
                <button style={{ ...S.btn, padding: '9px 14px', flexShrink: 0, minHeight: 40 }} onClick={commitNewBucket}>Add</button>
                <button style={{ ...S.btnGhost, padding: '9px 12px', flexShrink: 0, minHeight: 40 }} onClick={() => setCreatingBucket(false)}>✕</button>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {BUCKET_COLOR_PALETTE.map(c => (
                  <div key={c} onClick={() => setNewBucketColor(c)} style={{ width: 24, height: 24, borderRadius: 4, background: c, cursor: 'pointer', border: `2px solid ${newBucketColor === c ? '#fff' : 'transparent'}` }} />
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ── Asset type ── */}
        <div style={{ marginBottom: 12 }}>
          <label style={{ display: 'block', fontSize: 11, color: '#64748b', marginBottom: 4, fontWeight: 600 }}>Asset Type</label>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {Object.entries(ASSET_TYPE_META).map(([type, m]) => (
              <button key={type} onClick={() => setAssetType(type)} style={{
                flex: 1, minWidth: 80, padding: '7px 6px', borderRadius: 7, minHeight: 40,
                border: `1px solid ${assetType === type ? '#d4a843' : '#2d3748'}`,
                background: assetType === type ? 'rgba(212,168,67,0.1)' : '#0f1117',
                color: assetType === type ? '#d4a843' : '#64748b',
                fontSize: 12, cursor: 'pointer',
              }}>
                {m.icon} {type}
              </button>
            ))}
          </div>
        </div>

        {/* ── Ticker + Name ── */}
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 10 }}>
          <div>{fld('Ticker *', ticker, v => setTicker(v.toUpperCase()), { placeholder: 'QQQ', ref: tickerRef })}</div>
          <div>{fld('Name / Label', name, setName, { placeholder: 'Invesco QQQ Trust' })}</div>
        </div>

        {/* ── Crypto sub-bucket ── */}
        {isCryptoBucket && (
          <div style={{ marginBottom: 12 }}>
            <label style={{ display: 'block', fontSize: 11, color: '#64748b', marginBottom: 4, fontWeight: 600 }}>Sub-Bucket</label>
            <select value={subBucket} onChange={e => setSubBucket(e.target.value)} style={S.selectStyle}>
              <option value="">&#8212; select &#8212;</option>
              {CRYPTO_SUB_BUCKETS.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        )}

        {/* ── Numeric fields ── */}
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, 1fr)', gap: 10 }}>
          <div>{fld(`Quantity (${meta.qtyUnit}) *`, quantity, setQuantity, { type: 'number', min: '0', step: 'any', placeholder: '0' })}</div>
          <div>{fld(`Avg Cost (${meta.priceUnit}) *`, avgCost, setAvgCost, { type: 'number', min: '0', step: 'any', placeholder: '0.00' })}</div>
          <div>{fld(`Cur. Price (${meta.priceUnit}) *`, currentPrice, setCurrentPrice, { type: 'number', min: '0', step: 'any', placeholder: '0.00' })}</div>
        </div>

        {canSave && (
          <div style={{ background: '#0f1117', borderRadius: 8, padding: '10px 12px', marginBottom: 16, fontSize: 12, display: 'flex', gap: 16 }}>
            <span style={{ color: '#64748b' }}>Value: <strong style={{ color: '#d4a843' }}>{fmt$(liveVal, 0)}</strong></span>
            <span style={{ color: '#64748b' }}>P&L: <strong style={{ color: livePnl >= 0 ? '#22c55e' : '#ef4444' }}>{livePnl >= 0 ? '+' : ''}{fmt$(livePnl, 0)}</strong></span>
          </div>
        )}

        <div style={{ display: 'flex', gap: 8 }}>
          <button style={{ ...S.btnGhost, flex: 1, minHeight: 44 }} onClick={onClose}>Cancel</button>
          <button style={{ ...S.btn, flex: 2, minHeight: 44, opacity: canSave ? 1 : 0.45, cursor: canSave ? 'pointer' : 'not-allowed' }} onClick={handleSave} disabled={!canSave}>
            {position ? 'Save Changes' : 'Add Position'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Spending Tab ──────────────────────────────────────────────────────────────
function SpendingTab({ expenses, setExpenses }) {
  const isMobile = useIsMobile();
  const [showAdd, setShowAdd] = useState(false);
  const [viewMonth, setViewMonth] = useState(CURRENT_MONTH);

  const monthExpenses = useMemo(() => expenses.filter(e => e.date.startsWith(viewMonth)), [expenses, viewMonth]);
  const totalSpend = useMemo(() => monthExpenses.reduce((s, e) => s + e.amount, 0), [monthExpenses]);

  const monthlyTithe = Math.round(MONTHLY_GROSS * TITHE_RATE);
  const deployable = MONTHLY_NET - monthlyTithe - totalSpend;

  const byCategory = useMemo(() => {
    const map = {};
    monthExpenses.forEach(e => { map[e.category] = (map[e.category] || 0) + e.amount; });
    return Object.entries(map).map(([cat, amount]) => ({ cat, amount })).sort((a, b) => b.amount - a.amount);
  }, [monthExpenses]);

  const chartData = useMemo(() => byCategory.map(({ cat, amount }) => ({ name: cat, amount: Math.round(amount) })), [byCategory]);

  const monthOptions = useMemo(() => {
    const opts = [];
    const d = new Date();
    for (let i = 0; i < 12; i++) {
      const m = new Date(d.getFullYear(), d.getMonth() - i, 1);
      const val = m.toISOString().slice(0, 7);
      const label = m.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
      opts.push({ val, label });
    }
    return opts;
  }, []);

  const handleDelete = (id) => setExpenses(p => p.filter(e => e.id !== id));

  return (
    <div>
      <div style={{ display: 'flex', alignItems: isMobile ? 'flex-start' : 'center', flexDirection: isMobile ? 'column' : 'row', justifyContent: 'space-between', marginBottom: 20, gap: 10 }}>
        <div style={{ fontSize: isMobile ? 18 : 20, fontWeight: 800, color: '#f1f5f9' }}>Spending Tracker</div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', width: isMobile ? '100%' : 'auto' }}>
          <select value={viewMonth} onChange={e => setViewMonth(e.target.value)} style={{ ...S.selectStyle, width: isMobile ? '1fr' : 'auto', flex: isMobile ? 1 : undefined, minWidth: 170 }}>
            {monthOptions.map(o => <option key={o.val} value={o.val}>{o.label}</option>)}
          </select>
          <button style={S.btn} onClick={() => setShowAdd(true)}>+ Add</button>
        </div>
      </div>

      {/* ── KPI row ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, marginBottom: 20 }}>
        <KpiCard label="Total Spent" value={fmt$(totalSpend, 0)} accent="#ef4444" />
        <KpiCard label="Monthly Net" value={fmt$(MONTHLY_NET, 0)} sub="~$1,427/wk net" accent="#22c55e" />
        <KpiCard label="Tithe Budget" value={fmt$(monthlyTithe, 0)} sub="10% gross" accent="#d4a843" />
        <KpiCard label="Deployable" value={fmt$(deployable, 0)} subColor={deployable >= 0 ? '#22c55e' : '#ef4444'} sub="Net - tithe - spend" accent={deployable >= 0 ? '#22c55e' : '#ef4444'} />
      </div>

      {/* ── Bar chart ── */}
      {chartData.length > 0 && (
        <div style={{ ...S.card, marginBottom: 20 }}>
          <div style={S.cardTitle}>Spending by Category — {viewMonth}</div>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={chartData} margin={{ top: 4, right: 4, left: 0, bottom: 42 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e2535" />
              <XAxis dataKey="name" tick={{ fill: '#64748b', fontSize: 10 }} angle={-35} textAnchor="end" interval={0} />
              <YAxis tick={{ fill: '#64748b', fontSize: 10 }} tickFormatter={v => '$' + v.toLocaleString()} />
              <RTooltip formatter={v => [fmt$(v, 0), 'Amount']} contentStyle={{ background: '#161b27', border: '1px solid #334155', borderRadius: 8, color: '#f1f5f9', fontSize: 12 }} />
              <Bar dataKey="amount" radius={[4, 4, 0, 0]}>
                {chartData.map(entry => <Cell key={entry.name} fill={CAT_COLORS[entry.name] || '#64748b'} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* ── Category totals + transaction list ── */}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '200px 1fr', gap: 16, alignItems: 'start' }}>
        <div style={S.card}>
          <div style={S.cardTitle}>By Category</div>
          {byCategory.length === 0 ? (
            <div style={{ fontSize: 12, color: '#475569' }}>No expenses this month</div>
          ) : (
            <>
              {byCategory.map(({ cat, amount }) => (
                <div key={cat} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '5px 0', borderBottom: '1px solid #0f1117' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <div style={{ width: 7, height: 7, borderRadius: '50%', background: CAT_COLORS[cat] || '#64748b', flexShrink: 0 }} />
                    <span style={{ fontSize: 12, color: '#94a3b8' }}>{cat}</span>
                  </div>
                  <span style={{ fontSize: 12, fontWeight: 600, color: '#f1f5f9' }}>{fmt$(amount, 0)}</span>
                </div>
              ))}
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0 0', marginTop: 4, borderTop: '1px solid #334155' }}>
                <span style={{ fontSize: 12, color: '#64748b' }}>Total</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: '#f1f5f9' }}>{fmt$(totalSpend, 0)}</span>
              </div>
            </>
          )}
        </div>

        <div style={S.card}>
          <div style={S.cardTitle}>Transactions ({monthExpenses.length})</div>
          {monthExpenses.length === 0 ? (
            <div style={{ fontSize: 13, color: '#475569', padding: '12px 0' }}>
              No expenses for {viewMonth}. Click <strong style={{ color: '#d4a843' }}>+ Add</strong> to log one.
            </div>
          ) : (
            <div style={{ maxHeight: 380, overflowY: 'auto' }}>
              {[...monthExpenses].sort((a, b) => b.date.localeCompare(a.date)).map(e => (
                <div key={e.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 4px', borderBottom: '1px solid #0f1117' }}>
                  <div style={{ width: 7, height: 7, borderRadius: '50%', background: CAT_COLORS[e.category] || '#64748b', flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, color: '#e2e8f0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.note || e.category}</div>
                    <div style={{ fontSize: 10, color: '#475569' }}>{e.category} &middot; {e.date}</div>
                  </div>
                  <div style={{ fontWeight: 700, color: '#f1f5f9', fontSize: 13, flexShrink: 0 }}>{fmt$(e.amount)}</div>
                  <button style={S.btnDanger} onClick={() => handleDelete(e.id)}>&#10005;</button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {showAdd && (
        <AddExpenseModal
          onSave={e => { setExpenses(p => [e, ...p]); setShowAdd(false); }}
          onClose={() => setShowAdd(false)}
        />
      )}
    </div>
  );
}

// ─── Add Expense Modal ─────────────────────────────────────────────────────────
function AddExpenseModal({ onSave, onClose }) {
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState('Food');
  const [note, setNote] = useState('');
  const [date, setDate] = useState(TODAY_STR);
  const amtRef = useRef(null);

  useEffect(() => { if (amtRef.current) amtRef.current.focus(); }, []);

  const canSave = amount !== '' && parseFloat(amount) > 0;

  const handleSave = () => {
    if (!canSave) return;
    onSave({ id: genId(), amount: parseFloat(amount), category, note: note.trim(), date });
  };

  const onKey = (e) => { if (e.key === 'Enter' && canSave) handleSave(); };

  return (
    <div style={S.overlay} onClick={onClose}>
      <div style={{ ...S.modal, maxWidth: 360 }} onClick={e => e.stopPropagation()}>
        <button style={S.closeBtn} onClick={onClose}>&#215;</button>
        <div style={{ fontSize: 16, fontWeight: 700, color: '#f1f5f9', marginBottom: 18 }}>Log Expense</div>

        <div style={{ marginBottom: 12 }}>
          <label style={{ display: 'block', fontSize: 11, color: '#64748b', marginBottom: 4, fontWeight: 600 }}>Amount ($) *</label>
          <input
            ref={amtRef}
            type="number"
            min="0"
            step="0.01"
            value={amount}
            onChange={e => setAmount(e.target.value)}
            onKeyDown={onKey}
            placeholder="0.00"
            style={{ ...S.inputStyle, fontSize: 22, fontWeight: 700, color: '#d4a843' }}
          />
        </div>

        <div style={{ marginBottom: 12 }}>
          <label style={{ display: 'block', fontSize: 11, color: '#64748b', marginBottom: 4, fontWeight: 600 }}>Category</label>
          <select value={category} onChange={e => setCategory(e.target.value)} style={S.selectStyle}>
            {EXPENSE_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>

        <div style={{ marginBottom: 12 }}>
          <label style={{ display: 'block', fontSize: 11, color: '#64748b', marginBottom: 4, fontWeight: 600 }}>Note (optional)</label>
          <input value={note} onChange={e => setNote(e.target.value)} onKeyDown={onKey} placeholder="What was this for?" style={S.inputStyle} />
        </div>

        <div style={{ marginBottom: 20 }}>
          <label style={{ display: 'block', fontSize: 11, color: '#64748b', marginBottom: 4, fontWeight: 600 }}>Date</label>
          <input type="date" value={date} onChange={e => setDate(e.target.value)} style={S.selectStyle} />
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <button style={{ ...S.btnGhost, flex: 1 }} onClick={onClose}>Cancel</button>
          <button
            style={{ ...S.btn, flex: 2, opacity: canSave ? 1 : 0.45, cursor: canSave ? 'pointer' : 'not-allowed' }}
            onClick={handleSave}
            disabled={!canSave}
          >
            Log Expense
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Net Worth Tab ─────────────────────────────────────────────────────────────
function NetWorthTab({ snapshots, setSnapshots, milestones, setMilestones }) {
  const [showSnapshot, setShowSnapshot] = useState(false);
  const [editSnapshot, setEditSnapshot] = useState(null);
  const [showMilestone, setShowMilestone] = useState(false);
  const [editMilestone, setEditMilestone] = useState(null);

  const chartData = useMemo(() => {
    return [...snapshots]
      .sort((a, b) => a.month.localeCompare(b.month))
      .map(s => ({
        month: s.month,
        ...NW_CATEGORIES.reduce((acc, cat) => { acc[cat] = s[cat] || 0; return acc; }, {}),
        total: NW_CATEGORIES.reduce((sum, cat) => sum + (s[cat] || 0), 0),
      }));
  }, [snapshots]);

  const latest = chartData[chartData.length - 1];
  const prev   = chartData[chartData.length - 2];
  const latestTotal = latest ? latest.total : 0;
  const prevTotal   = prev   ? prev.total   : 0;
  const momChange   = latestTotal - prevTotal;
  const momPct      = prevTotal > 0 ? (momChange / prevTotal) * 100 : 0;

  const fmtMonth = (m) => {
    if (!m) return '';
    return new Date(m + '-01').toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
  };

  const handleSaveSnapshot = (s) => {
    if (s.id) {
      setSnapshots(p => p.map(x => x.id === s.id ? s : x));
    } else {
      setSnapshots(p => [{ ...s, id: genId() }, ...p.filter(x => x.month !== s.month)]);
    }
    setShowSnapshot(false);
    setEditSnapshot(null);
  };

  const handleDeleteSnapshot = (id) => {
    if (window.confirm('Delete this snapshot?')) setSnapshots(p => p.filter(x => x.id !== id));
  };

  const handleSaveMilestone = (m) => {
    if (m.id) { setMilestones(p => p.map(x => x.id === m.id ? m : x)); }
    else       { setMilestones(p => [...p, { ...m, id: genId() }]); }
    setShowMilestone(false);
    setEditMilestone(null);
  };

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 10 }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 800, color: '#f1f5f9' }}>Net Worth Over Time</div>
          {chartData.length > 0 && <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>{chartData.length} monthly snapshot{chartData.length !== 1 ? 's' : ''}</div>}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button style={S.btnGhost} onClick={() => setShowMilestone(true)}>+ Milestone</button>
          <button style={S.btn} onClick={() => setShowSnapshot(true)}>+ Snapshot</button>
        </div>
      </div>

      {/* KPI row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(145px, 1fr))', gap: 12, marginBottom: 20 }}>
        <KpiCard label="Current Net Worth"   value={fmt$(latestTotal, 0)} accent="#d4a843" />
        <KpiCard label="MoM Change"          value={fmt$(momChange, 0)} sub={fmtPct(momPct)} subColor={momChange >= 0 ? '#22c55e' : '#ef4444'} accent={momChange >= 0 ? '#22c55e' : '#ef4444'} />
        <KpiCard label="Snapshots on File"   value={String(snapshots.length)} sub={latest ? `Latest: ${fmtMonth(latest.month)}` : 'None yet'} accent="#6366f1" />
        <KpiCard label="Milestones"          value={String(milestones.length)} sub={`${milestones.filter(m => m.netWorth <= latestTotal).length} achieved`} accent="#8b5cf6" />
      </div>

      {/* Stacked area chart */}
      {chartData.length === 0 ? (
        <div style={{ ...S.card, textAlign: 'center', padding: '48px 20px', marginBottom: 20 }}>
          <div style={{ fontSize: 40, marginBottom: 14 }}>&#128200;</div>
          <div style={{ fontSize: 15, color: '#94a3b8', marginBottom: 18 }}>No snapshots yet. Add a monthly snapshot to start tracking your net worth over time.</div>
          <button style={S.btn} onClick={() => setShowSnapshot(true)}>+ Add First Snapshot</button>
        </div>
      ) : (
        <div style={{ ...S.card, marginBottom: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, flexWrap: 'wrap', gap: 6 }}>
            <div style={S.cardTitle}>Net Worth by Category (Stacked)</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '3px 10px' }}>
              {NW_CATEGORIES.map(cat => (
                <div key={cat} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10 }}>
                  <div style={{ width: 8, height: 8, borderRadius: 2, background: NW_COLORS[cat], flexShrink: 0 }} />
                  <span style={{ color: '#64748b' }}>{NW_LABELS[cat]}</span>
                </div>
              ))}
            </div>
          </div>
          <ResponsiveContainer width="100%" height={280}>
            <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
              <defs>
                {NW_CATEGORIES.map(cat => (
                  <linearGradient key={cat} id={`nwg-${cat}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor={NW_COLORS[cat]} stopOpacity={0.55} />
                    <stop offset="95%" stopColor={NW_COLORS[cat]} stopOpacity={0.08} />
                  </linearGradient>
                ))}
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e2535" />
              <XAxis dataKey="month" tickFormatter={fmtMonth} tick={{ fill: '#64748b', fontSize: 10 }} />
              <YAxis tickFormatter={v => '$' + (v >= 1000 ? (v / 1000).toFixed(0) + 'K' : v)} tick={{ fill: '#64748b', fontSize: 10 }} width={52} />
              <RTooltip
                formatter={(v, name) => [fmt$(v, 0), NW_LABELS[name] || name]}
                labelFormatter={l => fmtMonth(l)}
                contentStyle={{ background: '#161b27', border: '1px solid #334155', borderRadius: 8, color: '#f1f5f9', fontSize: 12 }}
              />
              {NW_CATEGORIES.map(cat => (
                <Area key={cat} type="monotone" dataKey={cat} stackId="nw"
                  stroke={NW_COLORS[cat]} fill={`url(#nwg-${cat})`} strokeWidth={1.5} />
              ))}
              {milestones.map(m => (
                <ReferenceLine key={m.id} y={m.netWorth} stroke="#d4a843" strokeDasharray="5 3"
                  label={{ value: m.label, position: 'insideTopRight', fill: '#d4a843', fontSize: 9 }} />
              ))}
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Snapshot history + milestones */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div style={S.card}>
          <div style={S.cardTitle}>Monthly Snapshots</div>
          {snapshots.length === 0 ? (
            <div style={{ fontSize: 12, color: '#475569' }}>No snapshots yet</div>
          ) : (
            <div style={{ maxHeight: 320, overflowY: 'auto' }}>
              <table style={S.table}>
                <thead>
                  <tr>
                    <th style={S.th}>Month</th>
                    <th style={S.th}>Total</th>
                    <th style={S.th}>MoM</th>
                    <th style={S.th}></th>
                  </tr>
                </thead>
                <tbody>
                  {[...chartData].reverse().map((row, i, arr) => {
                    const prevRow = arr[i + 1];
                    const change  = prevRow ? row.total - prevRow.total : null;
                    return (
                      <tr key={row.month}>
                        <td style={S.td}>{fmtMonth(row.month)}</td>
                        <td style={{ ...S.td, fontWeight: 700, color: '#d4a843' }}>{fmt$(row.total, 0)}</td>
                        <td style={{ ...S.td, fontSize: 11, color: change == null ? '#64748b' : change >= 0 ? '#22c55e' : '#ef4444' }}>
                          {change == null ? '–' : (change >= 0 ? '+' : '') + fmt$(change, 0)}
                        </td>
                        <td style={S.td}>
                          <div style={{ display: 'flex', gap: 4 }}>
                            <button style={{ ...S.btnGhost, padding: '2px 7px', fontSize: 10 }} onClick={() => {
                              const snap = snapshots.find(s => s.month === row.month);
                              if (snap) setEditSnapshot(snap);
                            }}>Edit</button>
                            <button style={S.btnDanger} onClick={() => {
                              const snap = snapshots.find(s => s.month === row.month);
                              if (snap) handleDeleteSnapshot(snap.id);
                            }}>&#10005;</button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div style={S.card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <div style={S.cardTitle}>Milestone Markers</div>
            <button style={{ ...S.btn, padding: '4px 10px', fontSize: 11 }} onClick={() => setShowMilestone(true)}>+ Add</button>
          </div>
          {milestones.length === 0 ? (
            <div style={{ fontSize: 12, color: '#475569' }}>No milestones yet — add markers like &ldquo;First $50K&rdquo; to track on the chart</div>
          ) : (
            [...milestones].sort((a, b) => a.netWorth - b.netWorth).map(m => {
              const achieved = m.netWorth <= latestTotal;
              return (
                <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 0', borderBottom: '1px solid #0f1117' }}>
                  <span style={{ fontSize: 14 }}>{achieved ? '✅' : '🎯'}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, color: achieved ? '#22c55e' : '#f1f5f9', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.label}</div>
                    <div style={{ fontSize: 10, color: '#64748b' }}>{fmt$(m.netWorth, 0)}</div>
                  </div>
                  <div style={{ display: 'flex', gap: 4 }}>
                    <button style={{ ...S.btnGhost, padding: '2px 7px', fontSize: 10 }} onClick={() => setEditMilestone(m)}>Edit</button>
                    <button style={S.btnDanger} onClick={() => setMilestones(p => p.filter(x => x.id !== m.id))}>&#10005;</button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {(showSnapshot || editSnapshot) && (
        <AddSnapshotModal
          snapshot={editSnapshot}
          onSave={handleSaveSnapshot}
          onClose={() => { setShowSnapshot(false); setEditSnapshot(null); }}
        />
      )}
      {(showMilestone || editMilestone) && (
        <AddMilestoneModal
          milestone={editMilestone}
          onSave={handleSaveMilestone}
          onClose={() => { setShowMilestone(false); setEditMilestone(null); }}
        />
      )}
    </div>
  );
}

// ─── Add Snapshot Modal ────────────────────────────────────────────────────────
function AddSnapshotModal({ snapshot, onSave, onClose }) {
  const initVals = useMemo(() => NW_CATEGORIES.reduce((acc, cat) => {
    acc[cat] = snapshot?.[cat] != null ? String(snapshot[cat]) : '';
    return acc;
  }, {}), [snapshot]);

  const [month,  setMonth]  = useState(snapshot?.month || CURRENT_MONTH);
  const [values, setValues] = useState(initVals);

  const total = NW_CATEGORIES.reduce((sum, cat) => sum + (parseFloat(values[cat]) || 0), 0);

  const handleSave = () => {
    onSave({
      ...snapshot,
      month,
      ...NW_CATEGORIES.reduce((acc, cat) => { acc[cat] = parseFloat(values[cat]) || 0; return acc; }, {}),
    });
  };

  return (
    <div style={S.overlay} onClick={onClose}>
      <div style={{ ...S.modal, maxWidth: 460 }} onClick={e => e.stopPropagation()}>
        <button style={S.closeBtn} onClick={onClose}>&#215;</button>
        <div style={{ fontSize: 16, fontWeight: 700, color: '#f1f5f9', marginBottom: 18 }}>
          {snapshot ? 'Edit Snapshot' : 'Add Monthly Snapshot'}
        </div>

        <div style={{ marginBottom: 14 }}>
          <label style={{ display: 'block', fontSize: 11, color: '#64748b', marginBottom: 4, fontWeight: 600 }}>Month *</label>
          <input type="month" value={month} onChange={e => setMonth(e.target.value)} style={S.selectStyle} />
        </div>

        <div style={S.grid2}>
          {NW_CATEGORIES.map(cat => (
            <div key={cat} style={{ marginBottom: 10 }}>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 600, marginBottom: 3 }}>
                <span style={{ display: 'inline-block', width: 9, height: 9, borderRadius: 2, background: NW_COLORS[cat], marginRight: 5, verticalAlign: 'middle' }} />
                <span style={{ color: '#94a3b8' }}>{NW_LABELS[cat]}</span>
              </label>
              <input
                type="number"
                min="0"
                step="any"
                value={values[cat]}
                onChange={e => setValues(p => ({ ...p, [cat]: e.target.value }))}
                placeholder="0"
                style={S.inputStyle}
              />
            </div>
          ))}
        </div>

        <div style={{ background: '#0f1117', borderRadius: 8, padding: '10px 14px', marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 12, color: '#64748b' }}>Total Net Worth</span>
          <strong style={{ color: '#d4a843', fontSize: 18 }}>{fmt$(total, 0)}</strong>
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <button style={{ ...S.btnGhost, flex: 1 }} onClick={onClose}>Cancel</button>
          <button style={{ ...S.btn, flex: 2 }} onClick={handleSave}>
            {snapshot ? 'Save Changes' : 'Add Snapshot'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Add Milestone Modal ───────────────────────────────────────────────────────
function AddMilestoneModal({ milestone, onSave, onClose }) {
  const [label,    setLabel]    = useState(milestone?.label    || '');
  const [netWorth, setNetWorth] = useState(milestone?.netWorth != null ? String(milestone.netWorth) : '');

  const canSave = label.trim() && netWorth !== '' && parseFloat(netWorth) > 0;
  const SUGGESTIONS = ['First $50K', 'First $100K', 'First $250K', 'First $500K', 'Debt Free', 'Skid Steer Acquired', 'Butcher Shop Opened'];

  return (
    <div style={S.overlay} onClick={onClose}>
      <div style={{ ...S.modal, maxWidth: 380 }} onClick={e => e.stopPropagation()}>
        <button style={S.closeBtn} onClick={onClose}>&#215;</button>
        <div style={{ fontSize: 16, fontWeight: 700, color: '#f1f5f9', marginBottom: 18 }}>
          {milestone ? 'Edit Milestone' : 'Add Milestone'}
        </div>

        <div style={{ marginBottom: 12 }}>
          <label style={{ display: 'block', fontSize: 11, color: '#64748b', marginBottom: 4, fontWeight: 600 }}>Label *</label>
          <input value={label} onChange={e => setLabel(e.target.value)} placeholder="e.g. First $50K" style={S.inputStyle} />
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 6 }}>
            {SUGGESTIONS.map(s => (
              <button key={s} onClick={() => setLabel(s)}
                style={{ padding: '2px 8px', background: '#1e2535', border: '1px solid #2d3748', borderRadius: 10, color: '#64748b', fontSize: 10, cursor: 'pointer' }}>
                {s}
              </button>
            ))}
          </div>
        </div>

        <div style={{ marginBottom: 20 }}>
          <label style={{ display: 'block', fontSize: 11, color: '#64748b', marginBottom: 4, fontWeight: 600 }}>Net Worth Value *</label>
          <input type="number" min="0" value={netWorth} onChange={e => setNetWorth(e.target.value)} placeholder="50000" style={S.inputStyle} />
          <div style={{ fontSize: 10, color: '#475569', marginTop: 4 }}>Appears as a dashed line on the chart when this NW value is reached</div>
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <button style={{ ...S.btnGhost, flex: 1 }} onClick={onClose}>Cancel</button>
          <button
            style={{ ...S.btn, flex: 2, opacity: canSave ? 1 : 0.45, cursor: canSave ? 'pointer' : 'not-allowed' }}
            disabled={!canSave}
            onClick={() => { if (canSave) onSave({ ...milestone, label: label.trim(), netWorth: parseFloat(netWorth) }); }}
          >
            {milestone ? 'Save' : 'Add Milestone'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Tithe & Giving Tab ────────────────────────────────────────────────────────
function TitheTab({ givingEntries, setGivingEntries }) {
  const [showAdd,   setShowAdd]   = useState(false);
  const [viewYear,  setViewYear]  = useState(String(new Date().getFullYear()));

  const currentYear  = String(new Date().getFullYear());
  const currentMonth = new Date().getMonth(); // 0-based
  const monthlyTarget = Math.round(MONTHLY_GROSS * TITHE_RATE);

  const ytdEntries = useMemo(() =>
    givingEntries.filter(e => e.date.startsWith(viewYear)),
    [givingEntries, viewYear]
  );
  const ytdTotal   = useMemo(() => ytdEntries.reduce((s, e) => s + e.amount, 0), [ytdEntries]);
  const ytdTarget  = monthlyTarget * (viewYear === currentYear ? currentMonth + 1 : 12);
  const ytdVariance = ytdTotal - ytdTarget;

  const monthlyData = useMemo(() => {
    const data = [];
    for (let m = 1; m <= 12; m++) {
      const mStr   = `${viewYear}-${String(m).padStart(2, '0')}`;
      const actual = givingEntries.filter(e => e.date.startsWith(mStr)).reduce((s, e) => s + e.amount, 0);
      const label  = new Date(mStr + '-01').toLocaleDateString('en-US', { month: 'short' });
      data.push({ month: label, target: monthlyTarget, actual: Math.round(actual) });
    }
    return data;
  }, [givingEntries, viewYear, monthlyTarget]);

  const byRecipient = useMemo(() => {
    const map = {};
    ytdEntries.forEach(e => { map[e.recipient || 'Unspecified'] = (map[e.recipient || 'Unspecified'] || 0) + e.amount; });
    return Object.entries(map).map(([name, amount]) => ({ name, amount })).sort((a, b) => b.amount - a.amount);
  }, [ytdEntries]);

  const years = useMemo(() => {
    const yr = new Date().getFullYear();
    return [String(yr), String(yr - 1), String(yr - 2)];
  }, []);

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 10 }}>
        <div style={{ fontSize: 20, fontWeight: 800, color: '#f1f5f9' }}>Tithe &amp; Giving</div>
        <div style={{ display: 'flex', gap: 8 }}>
          <select value={viewYear} onChange={e => setViewYear(e.target.value)} style={{ ...S.selectStyle, width: 'auto', minWidth: 80 }}>
            {years.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <button style={S.btn} onClick={() => setShowAdd(true)}>+ Log Giving</button>
        </div>
      </div>

      {/* KPI row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, marginBottom: 20 }}>
        <KpiCard label="YTD Given"        value={fmt$(ytdTotal, 0)} accent="#d4a843" />
        <KpiCard label="YTD Target"       value={fmt$(ytdTarget, 0)} sub={`Through ${new Date().toLocaleDateString('en-US', { month: 'long' })}`} accent="#22c55e" />
        <KpiCard label="Monthly Target"   value={fmt$(monthlyTarget, 0)} sub="10% of gross income" accent="#d4a843" />
        <KpiCard label="YTD Variance"     value={fmt$(ytdVariance, 0)} subColor={ytdVariance >= 0 ? '#22c55e' : '#ef4444'} sub={ytdVariance >= 0 ? 'On track ✓' : 'Behind'} accent={ytdVariance >= 0 ? '#22c55e' : '#ef4444'} />
      </div>

      {/* Monthly bar chart */}
      <div style={{ ...S.card, marginBottom: 20 }}>
        <div style={S.cardTitle}>Monthly Target vs Actual — {viewYear}</div>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={monthlyData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }} barGap={2}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e2535" />
            <XAxis dataKey="month" tick={{ fill: '#64748b', fontSize: 10 }} />
            <YAxis tick={{ fill: '#64748b', fontSize: 10 }} tickFormatter={v => '$' + v} />
            <RTooltip formatter={v => [fmt$(v, 0), '']} contentStyle={{ background: '#161b27', border: '1px solid #334155', borderRadius: 8, color: '#f1f5f9', fontSize: 12 }} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Bar dataKey="target" fill="#2d3748" name="Target"  radius={[3, 3, 0, 0]} />
            <Bar dataKey="actual" fill="#d4a843" name="Actual"  radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* By recipient + giving log */}
      <div style={{ display: 'grid', gridTemplateColumns: '200px 1fr', gap: 16, alignItems: 'start' }}>
        <div style={S.card}>
          <div style={S.cardTitle}>By Recipient</div>
          {byRecipient.length === 0 ? (
            <div style={{ fontSize: 12, color: '#475569' }}>No giving for {viewYear}</div>
          ) : (
            <>
              {byRecipient.map(({ name, amount }) => (
                <div key={name} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: '1px solid #0f1117' }}>
                  <span style={{ fontSize: 12, color: '#94a3b8' }}>{name}</span>
                  <span style={{ fontSize: 12, fontWeight: 600, color: '#f1f5f9' }}>{fmt$(amount, 0)}</span>
                </div>
              ))}
              <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 7, borderTop: '1px solid #334155', marginTop: 4 }}>
                <span style={{ fontSize: 12, color: '#64748b' }}>Total</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: '#d4a843' }}>{fmt$(ytdTotal, 0)}</span>
              </div>
            </>
          )}
        </div>

        <div style={S.card}>
          <div style={S.cardTitle}>Giving Log — {viewYear}</div>
          {ytdEntries.length === 0 ? (
            <div style={{ fontSize: 13, color: '#475569', padding: '12px 0' }}>
              No giving logged for {viewYear}. Click <strong style={{ color: '#d4a843' }}>+ Log Giving</strong> to add an entry.
            </div>
          ) : (
            <div style={{ maxHeight: 360, overflowY: 'auto' }}>
              {[...ytdEntries].sort((a, b) => b.date.localeCompare(a.date)).map(e => (
                <div key={e.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 4px', borderBottom: '1px solid #0f1117' }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#d4a843', flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, color: '#e2e8f0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.recipient || '—'}</div>
                    <div style={{ fontSize: 10, color: '#475569' }}>{e.note ? `${e.note} \u00b7 ` : ''}{e.date}</div>
                  </div>
                  <div style={{ fontWeight: 700, color: '#d4a843', fontSize: 13, flexShrink: 0 }}>{fmt$(e.amount)}</div>
                  <button style={S.btnDanger} onClick={() => setGivingEntries(p => p.filter(x => x.id !== e.id))}>&#10005;</button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {showAdd && (
        <AddGivingModal
          onSave={e => { setGivingEntries(p => [e, ...p]); setShowAdd(false); }}
          onClose={() => setShowAdd(false)}
        />
      )}
    </div>
  );
}

// ─── Add Giving Modal ──────────────────────────────────────────────────────────
function AddGivingModal({ onSave, onClose }) {
  const [amount,    setAmount]    = useState('');
  const [recipient, setRecipient] = useState('');
  const [note,      setNote]      = useState('');
  const [date,      setDate]      = useState(TODAY_STR);
  const amtRef = useRef(null);

  useEffect(() => { if (amtRef.current) amtRef.current.focus(); }, []);

  const canSave = amount !== '' && parseFloat(amount) > 0;
  const RECIPIENTS = ['Church', 'Missions', 'Local Need', 'Food Bank', 'Family', 'Other'];

  const handleSave = () => {
    if (canSave) onSave({ id: genId(), amount: parseFloat(amount), recipient: recipient.trim(), note: note.trim(), date });
  };

  return (
    <div style={S.overlay} onClick={onClose}>
      <div style={{ ...S.modal, maxWidth: 360 }} onClick={e => e.stopPropagation()}>
        <button style={S.closeBtn} onClick={onClose}>&#215;</button>
        <div style={{ fontSize: 16, fontWeight: 700, color: '#f1f5f9', marginBottom: 18 }}>Log Giving</div>

        <div style={{ marginBottom: 12 }}>
          <label style={{ display: 'block', fontSize: 11, color: '#64748b', marginBottom: 4, fontWeight: 600 }}>Amount ($) *</label>
          <input ref={amtRef} type="number" min="0" step="0.01" value={amount} onChange={e => setAmount(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && canSave) handleSave(); }}
            placeholder="0.00" style={{ ...S.inputStyle, fontSize: 22, fontWeight: 700, color: '#d4a843' }} />
        </div>

        <div style={{ marginBottom: 12 }}>
          <label style={{ display: 'block', fontSize: 11, color: '#64748b', marginBottom: 4, fontWeight: 600 }}>Recipient</label>
          <input value={recipient} onChange={e => setRecipient(e.target.value)} placeholder="Church, missions, local need…" style={S.inputStyle} />
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 6 }}>
            {RECIPIENTS.map(r => (
              <button key={r} onClick={() => setRecipient(r)}
                style={{ padding: '2px 8px', background: '#1e2535', border: '1px solid #2d3748', borderRadius: 10, color: '#64748b', fontSize: 10, cursor: 'pointer' }}>
                {r}
              </button>
            ))}
          </div>
        </div>

        <div style={{ marginBottom: 12 }}>
          <label style={{ display: 'block', fontSize: 11, color: '#64748b', marginBottom: 4, fontWeight: 600 }}>Note (optional)</label>
          <input value={note} onChange={e => setNote(e.target.value)} placeholder="Purpose or details" style={S.inputStyle} />
        </div>

        <div style={{ marginBottom: 20 }}>
          <label style={{ display: 'block', fontSize: 11, color: '#64748b', marginBottom: 4, fontWeight: 600 }}>Date</label>
          <input type="date" value={date} onChange={e => setDate(e.target.value)} style={S.selectStyle} />
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <button style={{ ...S.btnGhost, flex: 1 }} onClick={onClose}>Cancel</button>
          <button style={{ ...S.btn, flex: 2, opacity: canSave ? 1 : 0.45, cursor: canSave ? 'pointer' : 'not-allowed' }}
            disabled={!canSave} onClick={handleSave}>
            Log Giving
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Asset Acquisition Roadmap Tab ─────────────────────────────────────────────
function RoadmapTab({ roadmapSavings, setRoadmapSavings, portfolioValue }) {
  const [editingId, setEditingId] = useState(null);
  const [editSaved, setEditSaved] = useState('');
  const [editRate,  setEditRate]  = useState('');

  const ltvPower = portfolioValue * 0.4;

  const startEdit = (id) => {
    const data = roadmapSavings[id] || {};
    setEditSaved(data.saved != null ? String(data.saved) : '');
    setEditRate(data.monthlyRate != null ? String(data.monthlyRate) : '');
    setEditingId(id);
  };

  const commitEdit = (id) => {
    setRoadmapSavings(prev => ({
      ...prev,
      [id]: { ...(prev[id] || {}), saved: parseFloat(editSaved) || 0, monthlyRate: parseFloat(editRate) || 0 },
    }));
    setEditingId(null);
  };

  const totalFundable = ROADMAP_MILESTONES.filter(m => {
    const data = roadmapSavings[m.id] || {};
    return (data.saved || 0) + ltvPower >= m.minCost;
  }).length;

  return (
    <div>
      <div style={{ fontSize: 20, fontWeight: 800, color: '#f1f5f9', marginBottom: 4 }}>Asset Acquisition Roadmap</div>
      <div style={{ fontSize: 12, color: '#475569', marginBottom: 20 }}>Funded via 40% LTV portfolio loans</div>

      {/* LTV summary card */}
      <div style={{ ...S.card, marginBottom: 20 }}>
        <div style={{ display: 'flex', gap: 24, alignItems: 'center', flexWrap: 'wrap' }}>
          <div>
            <div style={S.cardTitle}>Portfolio Value</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: '#f1f5f9' }}>{fmt$(portfolioValue, 0)}</div>
          </div>
          <div style={{ fontSize: 24, color: '#334155' }}>&#215;</div>
          <div>
            <div style={S.cardTitle}>LTV Rate</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: '#f1f5f9' }}>40%</div>
          </div>
          <div style={{ fontSize: 24, color: '#334155' }}>=</div>
          <div>
            <div style={S.cardTitle}>Borrowing Power</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: '#d4a843' }}>{fmt$(ltvPower, 0)}</div>
          </div>
          <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
            <div style={S.cardTitle}>Milestones Fundable</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: totalFundable > 0 ? '#22c55e' : '#64748b' }}>
              {totalFundable} / {ROADMAP_MILESTONES.length}
            </div>
          </div>
        </div>
        {portfolioValue === 0 && (
          <div style={{ marginTop: 10, fontSize: 12, color: '#475569' }}>
            Add positions in the Portfolio tab to calculate your LTV borrowing power.
          </div>
        )}
      </div>

      {/* Milestone cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {ROADMAP_MILESTONES.map((milestone, idx) => {
          const data         = roadmapSavings[milestone.id] || {};
          const saved        = data.saved || 0;
          const monthlyRate  = data.monthlyRate || 0;
          const totalFunding = saved + ltvPower;
          const fundable     = totalFunding >= milestone.minCost;
          const totalFrac    = Math.min(totalFunding / milestone.maxCost, 1);
          const isEditing    = editingId === milestone.id;

          const shortfall = milestone.minCost - totalFunding;
          const projMonths = !fundable && monthlyRate > 0 && shortfall > 0
            ? Math.ceil(shortfall / monthlyRate)
            : null;

          return (
            <div key={milestone.id} style={{ ...S.card, borderLeft: `3px solid ${milestone.color}` }}>
              {/* Header row */}
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, marginBottom: 14, flexWrap: 'wrap' }}>
                <div style={{ fontSize: 30, lineHeight: 1, flexShrink: 0 }}>{milestone.icon}</div>
                <div style={{ flex: 1, minWidth: 200 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 2 }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: '#475569' }}>#{idx + 1}</span>
                    <span style={{ fontSize: 16, fontWeight: 800, color: '#f1f5f9' }}>{milestone.label}</span>
                    {fundable && <span style={S.tag('#22c55e')}>Fundable Now</span>}
                  </div>
                  <div style={{ fontSize: 12, color: '#64748b' }}>{milestone.description}</div>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div style={{ fontSize: 10, color: '#64748b', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Target Range</div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: '#f1f5f9', marginTop: 2 }}>
                    {fmt$(milestone.minCost, 0)} – {fmt$(milestone.maxCost, 0)}
                  </div>
                </div>
              </div>

              {/* Progress bar */}
              <div style={{ marginBottom: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#64748b', marginBottom: 5 }}>
                  <span>Total Funding (Saved + LTV Borrow)</span>
                  <span>{fmt$(totalFunding, 0)} / {fmt$(milestone.maxCost, 0)}</span>
                </div>
                <div style={{ height: 10, background: '#1e2535', borderRadius: 5, overflow: 'hidden' }}>
                  <div style={{
                    height: '100%',
                    width: `${totalFrac * 100}%`,
                    background: fundable
                      ? 'linear-gradient(90deg, #22c55e, #16a34a)'
                      : `linear-gradient(90deg, ${milestone.color}99, ${milestone.color})`,
                    borderRadius: 5,
                    transition: 'width 0.4s ease',
                  }} />
                </div>
                <div style={{ display: 'flex', gap: 14, marginTop: 5, fontSize: 10 }}>
                  <span style={{ color: '#6366f1' }}>&#11044; LTV: {fmt$(ltvPower, 0)}</span>
                  <span style={{ color: milestone.color }}>&#11044; Saved: {fmt$(saved, 0)}</span>
                  {!fundable && <span style={{ color: '#ef4444' }}>Shortfall: {fmt$(Math.max(shortfall, 0), 0)}</span>}
                </div>
              </div>

              {/* Edit row or stats row */}
              {isEditing ? (
                <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap', paddingTop: 8, borderTop: '1px solid #1e2535' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: 10, color: '#64748b', marginBottom: 3, fontWeight: 600 }}>Amount Saved ($)</label>
                    <input type="number" min="0" value={editSaved} onChange={e => setEditSaved(e.target.value)} style={{ ...S.inputStyle, width: 130 }} />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 10, color: '#64748b', marginBottom: 3, fontWeight: 600 }}>Monthly Savings Rate ($)</label>
                    <input type="number" min="0" value={editRate} onChange={e => setEditRate(e.target.value)} style={{ ...S.inputStyle, width: 150 }} />
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button style={{ ...S.btn, padding: '8px 14px', fontSize: 12 }} onClick={() => commitEdit(milestone.id)}>Save</button>
                    <button style={S.btnGhost} onClick={() => setEditingId(null)}>Cancel</button>
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, paddingTop: 8, borderTop: '1px solid #1e2535' }}>
                  <div style={{ display: 'flex', gap: 18, fontSize: 12, color: '#64748b', flexWrap: 'wrap' }}>
                    <span>Saved: <strong style={{ color: '#f1f5f9' }}>{fmt$(saved, 0)}</strong></span>
                    {monthlyRate > 0 && <span>Rate: <strong style={{ color: '#f1f5f9' }}>{fmt$(monthlyRate, 0)}/mo</strong></span>}
                    {projMonths != null && <span>ETA: <strong style={{ color: '#d4a843' }}>~{projMonths} mo ({Math.ceil(projMonths / 12)}yr)</strong></span>}
                    {fundable && <span style={{ color: '#22c55e', fontWeight: 700 }}>Ready to acquire!</span>}
                  </div>
                  <button style={{ ...S.btnGhost, padding: '5px 12px', fontSize: 11 }} onClick={() => startEdit(milestone.id)}>
                    Update Savings
                  </button>
                </div>
              )}

              {/* Fundable alert */}
              {fundable && (
                <div style={{ marginTop: 10, padding: '8px 12px', background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.2)', borderRadius: 8, fontSize: 12, color: '#22c55e' }}>
                  &#9989; Saved + LTV power ({fmt$(totalFunding, 0)}) exceeds minimum target ({fmt$(milestone.minCost, 0)}). This milestone is fundable today.
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── AI Market Scanner ─────────────────────────────────────────────────────────
const SCAN_TYPES = [
  { id: 'regime',      label: 'Market Regime'    },
  { id: 'crypto',      label: 'Crypto Movers'    },
  { id: 'commodities', label: 'Commodities'       },
  { id: 'dividends',   label: 'Dividend Picks'   },
  { id: 'quantum',     label: 'Quantum/Emerging' },
  { id: 'sectors',     label: 'Sector Sweep'     },
  { id: 'custom',      label: 'Custom Query'     },
];

const DIR_META = {
  bullish: { icon: '▲', color: '#22c55e', border: '#22c55e' },
  bearish: { icon: '▼', color: '#ef4444', border: '#ef4444' },
  neutral: { icon: '◆', color: '#d4a843', border: '#d4a843' },
};

const CONF_COLORS = { High: '#4ecb71', Medium: '#d4a843', Low: '#e05555' };

const REGIME_COLORS = {
  'Risk-On':    '#22c55e',
  'Risk-Off':   '#ef4444',
  'Transition': '#d4a843',
  'Crisis':     '#e05555',
};

const MONO = "'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace";

function fmtTs(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) +
    ' ' + d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
}

function SignalCard({ signal, inWatchlist, onToggleWatch }) {
  const dir = DIR_META[signal.direction] || DIR_META.neutral;
  const confColor = CONF_COLORS[signal.confidence] || '#d4a843';
  return (
    <div style={{
      background: '#14161c',
      border: '1px solid #1e2535',
      borderLeft: `3px solid ${dir.border}`,
      borderRadius: 10,
      padding: '14px 16px',
      display: 'flex',
      flexDirection: 'column',
      gap: 8,
    }}>
      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontFamily: MONO, fontWeight: 700, fontSize: 15, color: dir.color }}>
            {dir.icon}
          </span>
          <span style={{ fontFamily: MONO, fontWeight: 700, fontSize: 15, color: '#f1f5f9', letterSpacing: '0.5px' }}>
            {signal.ticker}
          </span>
          <span style={{
            fontSize: 11, fontWeight: 700, padding: '2px 7px', borderRadius: 4,
            background: confColor + '22', color: confColor, letterSpacing: '0.5px',
          }}>
            {signal.confidence}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{
            fontSize: 11, padding: '2px 8px', borderRadius: 4,
            background: '#1e2535', color: '#94a3b8',
          }}>
            {signal.sector}
          </span>
          <button
            onClick={() => onToggleWatch(signal.ticker)}
            title={inWatchlist ? 'Remove from watchlist' : 'Add to watchlist'}
            style={{
              background: inWatchlist ? 'rgba(212,168,67,0.15)' : 'transparent',
              border: `1px solid ${inWatchlist ? '#d4a843' : '#2d3748'}`,
              borderRadius: 6,
              color: inWatchlist ? '#d4a843' : '#64748b',
              fontSize: 13,
              cursor: 'pointer',
              padding: '2px 7px',
              lineHeight: 1.4,
            }}
          >
            {inWatchlist ? '★' : '☆'}
          </button>
        </div>
      </div>
      {/* Reasoning */}
      <div style={{ fontFamily: MONO, fontSize: 12, color: '#94a3b8', lineHeight: 1.6 }}>
        {signal.reasoning}
      </div>
    </div>
  );
}

function ScannerTab() {
  const [scanType,    setScanType]    = useState('regime');
  const [customQuery, setCustomQuery] = useState('');
  const [loading,     setLoading]     = useState(false);
  const [error,       setError]       = useState('');
  const [result,      setResult]      = useState(null);
  const [panel,       setPanel]       = useState('scan'); // 'scan' | 'history' | 'watchlist'
  const [scans,       setScans]       = useLocalStorage('mag_scans',     []);
  const [watchlist,   setWatchlist]   = useLocalStorage('mag_watchlist', []);

  const runScan = useCallback(async () => {
    if (loading) return;
    if (scanType === 'custom' && !customQuery.trim()) {
      setError('Enter a custom query before scanning.');
      return;
    }
    setLoading(true);
    setError('');
    setResult(null);
    try {
      const res = await fetch('/api/scanner', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scanType,
          customQuery: scanType === 'custom' ? customQuery.trim() : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Scan failed');
      setResult(data);
      setPanel('scan');
      setScans(prev => {
        const entry = { ...data, scanType, id: Date.now() };
        return [entry, ...prev].slice(0, 10);
      });
    } catch (e) {
      setError(e.message || 'Scan failed — check your connection.');
    } finally {
      setLoading(false);
    }
  }, [loading, scanType, customQuery, setScans]);

  const toggleWatch = useCallback((ticker) => {
    setWatchlist(prev =>
      prev.includes(ticker) ? prev.filter(t => t !== ticker) : [...prev, ticker]
    );
  }, [setWatchlist]);

  const loadHistory = useCallback((scan) => {
    setResult(scan);
    setPanel('scan');
  }, []);

  const regimeColor = result ? (REGIME_COLORS[result.regime] || '#d4a843') : '#d4a843';

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto', padding: '24px 16px' }}>
      {/* JetBrains Mono import */}
      <style>{`@import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;600;700&display=swap');`}</style>

      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontFamily: MONO, fontSize: 11, color: '#64748b', letterSpacing: 2, textTransform: 'uppercase', marginBottom: 4 }}>
          Phase 3
        </div>
        <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: '#f1f5f9' }}>AI Market Scanner</h2>
        <div style={{ fontSize: 13, color: '#64748b', marginTop: 4 }}>
          Powered by Claude · Seven-bucket regime analysis
        </div>
      </div>

      {/* Panel tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        {[
          { id: 'scan',      label: 'Scanner'  },
          { id: 'history',   label: `History (${scans.length})`  },
          { id: 'watchlist', label: `Watchlist (${watchlist.length})` },
        ].map(p => (
          <button key={p.id} onClick={() => setPanel(p.id)} style={{
            fontFamily: MONO,
            fontSize: 12,
            padding: '6px 14px',
            borderRadius: 6,
            border: `1px solid ${panel === p.id ? '#d4a843' : '#2d3748'}`,
            background: panel === p.id ? 'rgba(212,168,67,0.1)' : 'transparent',
            color: panel === p.id ? '#d4a843' : '#64748b',
            cursor: 'pointer',
          }}>
            {p.label}
          </button>
        ))}
      </div>

      {/* ── SCAN PANEL ── */}
      {panel === 'scan' && (
        <div>
          {/* Scan type buttons */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
            {SCAN_TYPES.map(st => (
              <button key={st.id} onClick={() => setScanType(st.id)} style={{
                fontFamily: MONO,
                fontSize: 12,
                padding: '7px 14px',
                borderRadius: 6,
                border: `1px solid ${scanType === st.id ? '#d4a843' : '#2d3748'}`,
                background: scanType === st.id ? 'rgba(212,168,67,0.12)' : '#14161c',
                color: scanType === st.id ? '#d4a843' : '#94a3b8',
                cursor: 'pointer',
                transition: 'all 0.15s',
              }}>
                {st.label}
              </button>
            ))}
          </div>

          {/* Custom query input */}
          {scanType === 'custom' && (
            <textarea
              value={customQuery}
              onChange={e => setCustomQuery(e.target.value)}
              placeholder="Ask anything about current markets, your portfolio, or specific assets..."
              rows={3}
              style={{
                width: '100%',
                boxSizing: 'border-box',
                background: '#14161c',
                border: '1px solid #2d3748',
                borderRadius: 8,
                color: '#f1f5f9',
                fontFamily: MONO,
                fontSize: 13,
                padding: '10px 14px',
                resize: 'vertical',
                outline: 'none',
                marginBottom: 12,
              }}
            />
          )}

          {/* Run button */}
          <button
            onClick={runScan}
            disabled={loading}
            style={{
              fontFamily: MONO,
              fontWeight: 700,
              fontSize: 13,
              padding: '10px 28px',
              borderRadius: 8,
              border: 'none',
              background: loading ? '#1e2535' : '#d4a843',
              color: loading ? '#64748b' : '#0a0d14',
              cursor: loading ? 'not-allowed' : 'pointer',
              letterSpacing: '0.5px',
              transition: 'all 0.2s',
              animation: loading ? 'scanPulse 1.2s ease-in-out infinite' : 'none',
              marginBottom: 20,
            }}
          >
            {loading ? '⟳ Scanning Markets...' : '▶ Run Scan'}
          </button>

          <style>{`
            @keyframes scanPulse {
              0%, 100% { opacity: 1; }
              50%       { opacity: 0.5; }
            }
          `}</style>

          {/* Error */}
          {error && (
            <div style={{
              padding: '12px 16px', borderRadius: 8, marginBottom: 16,
              background: 'rgba(224,85,85,0.1)', border: '1px solid rgba(224,85,85,0.3)',
              color: '#e05555', fontFamily: MONO, fontSize: 13,
            }}>
              ✕ {error}
            </div>
          )}

          {/* Results */}
          {result && (
            <div>
              {/* Summary banner */}
              <div style={{
                background: '#14161c',
                border: '1px solid #1e2535',
                borderTop: `3px solid ${regimeColor}`,
                borderRadius: 10,
                padding: '16px 20px',
                marginBottom: 20,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
                  <span style={{
                    fontFamily: MONO, fontSize: 12, fontWeight: 700,
                    padding: '3px 10px', borderRadius: 4,
                    background: regimeColor + '22', color: regimeColor,
                    letterSpacing: '0.5px',
                  }}>
                    {result.regime}
                  </span>
                  <span style={{ fontFamily: MONO, fontSize: 11, color: '#64748b' }}>
                    {fmtTs(result.timestamp)}
                  </span>
                  <span style={{ fontFamily: MONO, fontSize: 11, color: '#64748b', marginLeft: 'auto' }}>
                    {result.signals.length} signals
                  </span>
                </div>
                <div style={{ fontFamily: MONO, fontSize: 13, color: '#cbd5e1', lineHeight: 1.7 }}>
                  {result.summary}
                </div>
              </div>

              {/* Signal cards grid */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 12 }}>
                {result.signals.map((sig, i) => (
                  <SignalCard
                    key={i}
                    signal={sig}
                    inWatchlist={watchlist.includes(sig.ticker)}
                    onToggleWatch={toggleWatch}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Empty state */}
          {!result && !loading && !error && (
            <div style={{
              textAlign: 'center', padding: '60px 20px',
              color: '#334155', fontFamily: MONO, fontSize: 13,
            }}>
              <div style={{ fontSize: 36, marginBottom: 12 }}>◈</div>
              Select a scan type and run a scan to see AI-generated market signals.
            </div>
          )}
        </div>
      )}

      {/* ── HISTORY PANEL ── */}
      {panel === 'history' && (
        <div>
          {scans.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '60px 20px', color: '#334155', fontFamily: MONO, fontSize: 13 }}>
              No scan history yet. Run your first scan.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {scans.map((scan) => {
                const rc = REGIME_COLORS[scan.regime] || '#d4a843';
                return (
                  <div
                    key={scan.id}
                    onClick={() => loadHistory(scan)}
                    style={{
                      background: '#14161c',
                      border: '1px solid #1e2535',
                      borderLeft: `3px solid ${rc}`,
                      borderRadius: 10,
                      padding: '14px 16px',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 12,
                    }}
                  >
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                        <span style={{
                          fontFamily: MONO, fontSize: 11, fontWeight: 700,
                          padding: '2px 8px', borderRadius: 4,
                          background: rc + '22', color: rc,
                        }}>
                          {scan.regime}
                        </span>
                        <span style={{ fontFamily: MONO, fontSize: 12, color: '#94a3b8' }}>
                          {SCAN_TYPES.find(s => s.id === scan.scanType)?.label || scan.scanType}
                        </span>
                      </div>
                      <div style={{ fontFamily: MONO, fontSize: 12, color: '#64748b' }}>
                        {scan.signals.length} signals · {fmtTs(scan.timestamp)}
                      </div>
                    </div>
                    <span style={{ color: '#334155', fontSize: 16 }}>›</span>
                  </div>
                );
              })}
            </div>
          )}
          {scans.length > 0 && (
            <button
              onClick={() => setScans([])}
              style={{
                marginTop: 16, fontFamily: MONO, fontSize: 12,
                padding: '6px 14px', borderRadius: 6,
                border: '1px solid #2d3748', background: 'transparent',
                color: '#64748b', cursor: 'pointer',
              }}
            >
              Clear History
            </button>
          )}
        </div>
      )}

      {/* ── WATCHLIST PANEL ── */}
      {panel === 'watchlist' && (
        <div>
          {watchlist.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '60px 20px', color: '#334155', fontFamily: MONO, fontSize: 13 }}>
              No tickers saved. Click ☆ on any signal card to add it to your watchlist.
            </div>
          ) : (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
              {watchlist.map(ticker => (
                <div key={ticker} style={{
                  background: '#14161c',
                  border: '1px solid #2d3748',
                  borderRadius: 8,
                  padding: '10px 16px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                }}>
                  <span style={{ fontFamily: MONO, fontWeight: 700, fontSize: 15, color: '#d4a843' }}>
                    {ticker}
                  </span>
                  <button
                    onClick={() => toggleWatch(ticker)}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: '#ef4444',
                      cursor: 'pointer',
                      fontSize: 14,
                      padding: 0,
                      lineHeight: 1,
                    }}
                    title="Remove from watchlist"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}
          {watchlist.length > 0 && (
            <button
              onClick={() => setWatchlist([])}
              style={{
                marginTop: 16, fontFamily: MONO, fontSize: 12,
                padding: '6px 14px', borderRadius: 6,
                border: '1px solid #2d3748', background: 'transparent',
                color: '#64748b', cursor: 'pointer',
              }}
            >
              Clear Watchlist
            </button>
          )}
        </div>
      )}
    </div>
  );
}
