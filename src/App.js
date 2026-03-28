import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import {
  PieChart, Pie, Cell, Tooltip as RTooltip, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Legend,
} from 'recharts';

// ─── Constants ─────────────────────────────────────────────────────────────────
const MONTHLY_NET = 6185;
const WEEKLY_GROSS = 1649;
const MONTHLY_GROSS = Math.round(WEEKLY_GROSS * 52 / 12); // ~7145
const TITHE_RATE = 0.10;

const ALLOCATION_TARGETS = {
  'QQQ':       25,
  'Crypto':    25,
  'Dividends': 15,
  'Quantum':   10,
  'Gold':      10,
  'Energy':    10,
  'Silver':     5,
};

const BUCKET_COLORS = {
  'QQQ':       '#6366f1',
  'Crypto':    '#f97316',
  'Dividends': '#22c55e',
  'Quantum':   '#8b5cf6',
  'Gold':      '#d4a843',
  'Energy':    '#ef4444',
  'Silver':    '#94a3b8',
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

function calcDriftAlerts(alloc) {
  return Object.entries(ALLOCATION_TARGETS)
    .map(([bucket, target]) => ({ bucket, target, actual: alloc[bucket] || 0, drift: (alloc[bucket] || 0) - target }))
    .filter(d => Math.abs(d.drift) > 3)
    .sort((a, b) => Math.abs(b.drift) - Math.abs(a.drift));
}

// ─── App ───────────────────────────────────────────────────────────────────────
export default function App() {
  const [tab, setTab] = useState('dashboard');
  const [positions, setPositions] = useLocalStorage('mag_positions', []);
  const [expenses, setExpenses] = useLocalStorage('mag_expenses', []);

  const tabs = [
    { id: 'dashboard', label: 'Dashboard' },
    { id: 'portfolio', label: 'Portfolio' },
    { id: 'spending',  label: 'Spending'  },
  ];

  return (
    <div style={S.app}>
      <header style={S.header}>
        <div style={S.logo}>&#9670; Mir Asset Group</div>
        <nav style={S.nav}>
          {tabs.map(t => (
            <button key={t.id} style={S.navBtn(tab === t.id)} onClick={() => setTab(t.id)}>{t.label}</button>
          ))}
        </nav>
      </header>
      <main style={S.body}>
        {tab === 'dashboard' && (
          <DashboardTab
            positions={positions}
            expenses={expenses}
            onAddExpense={e => setExpenses(p => [e, ...p])}
            onTabSwitch={setTab}
          />
        )}
        {tab === 'portfolio' && <PortfolioTab positions={positions} setPositions={setPositions} />}
        {tab === 'spending'  && <SpendingTab  expenses={expenses}  setExpenses={setExpenses}   />}
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
function DashboardTab({ positions, expenses, onAddExpense, onTabSwitch }) {
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const { totalValue, alloc } = useMemo(() => portfolioStats(positions), [positions]);
  const alerts = useMemo(() => calcDriftAlerts(alloc), [alloc]);

  const thisMonthExp = useMemo(() => expenses.filter(e => e.date.startsWith(CURRENT_MONTH)), [expenses]);
  const monthlyTithe = Math.round(MONTHLY_GROSS * TITHE_RATE);
  const monthlySpend = thisMonthExp.reduce((s, e) => s + e.amount, 0);
  const deployable = MONTHLY_NET - monthlyTithe - monthlySpend;

  const totalCost = useMemo(() => positions.reduce((s, p) => s + p.quantity * p.avgCost, 0), [positions]);
  const totalPnl = totalValue - totalCost;
  const totalPnlPct = totalCost > 0 ? (totalPnl / totalCost) * 100 : 0;

  const recentExp = expenses.slice(0, 5);

  return (
    <div>
      <div style={{ fontSize: 22, fontWeight: 800, color: '#f1f5f9', marginBottom: 4 }}>Wealth Command Center</div>
      <div style={{ fontSize: 12, color: '#475569', marginBottom: 20 }}>Mir Asset Group, LLC — Personal Dashboard</div>

      {/* ── KPI row ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 20 }}>
        <KpiCard label="Portfolio Value" value={fmt$(totalValue, 0)} sub={fmtPct(totalPnlPct) + ' total return'} subColor={totalPnl >= 0 ? '#22c55e' : '#ef4444'} accent="#d4a843" />
        <KpiCard label="Unrealized P&L" value={fmt$(totalPnl, 0)} sub={`${positions.length} position${positions.length !== 1 ? 's' : ''}`} subColor={totalPnl >= 0 ? '#22c55e' : '#ef4444'} accent={totalPnl >= 0 ? '#22c55e' : '#ef4444'} />
        <KpiCard label="Deployable (MTD)" value={fmt$(deployable, 0)} sub={`${fmt$(monthlySpend, 0)} spent this month`} subColor={deployable >= 0 ? '#22c55e' : '#ef4444'} accent="#d4a843" />
        <KpiCard label="LTV Borrow Power" value={fmt$(totalValue * 0.4, 0)} sub="40% portfolio LTV" accent="#6366f1" />
      </div>

      {/* ── Drift alerts ── */}
      {alerts.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <div
            role="button"
            onClick={() => onTabSwitch('portfolio')}
            style={{ ...S.sectionLabel, cursor: 'pointer', color: '#d4a843', marginTop: 0 }}
          >
            &#9888; Allocation Drift — click to manage
          </div>
          {alerts.slice(0, 4).map(a => (
            <div key={a.bucket} style={S.alert}>
              <span style={S.tag(BUCKET_COLORS[a.bucket] || '#d4a843')}>{a.bucket}</span>
              <span style={{ color: '#94a3b8' }}>{a.actual.toFixed(1)}% actual vs {a.target}% target</span>
              <span style={{ marginLeft: 'auto', fontWeight: 700, color: a.drift > 0 ? '#ef4444' : '#22c55e' }}>
                {a.drift > 0 ? '+' : ''}{a.drift.toFixed(1)}%
              </span>
            </div>
          ))}
        </div>
      )}

      {/* ── Lower row ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        {/* Allocation snapshot */}
        <div style={S.card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <div style={S.cardTitle}>Allocation Snapshot</div>
            <button style={{ ...S.btnGhost, padding: '3px 8px', fontSize: 11 }} onClick={() => onTabSwitch('portfolio')}>Manage</button>
          </div>
          {positions.length === 0 ? (
            <div style={{ color: '#475569', fontSize: 13, padding: '12px 0' }}>No positions — add them in Portfolio tab</div>
          ) : (
            Object.entries(ALLOCATION_TARGETS).map(([bucket, target]) => {
              const actual = alloc[bucket] || 0;
              const drift = actual - target;
              const over = Math.abs(drift) > 3;
              return (
                <div key={bucket} style={{ marginBottom: 9 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                      <div style={{ width: 7, height: 7, borderRadius: '50%', background: BUCKET_COLORS[bucket], flexShrink: 0 }} />
                      <span style={{ fontSize: 12, color: '#94a3b8' }}>{bucket}</span>
                    </div>
                    <span style={{ fontSize: 11, color: over ? (drift > 0 ? '#ef4444' : '#22c55e') : '#64748b' }}>
                      {actual.toFixed(1)}% / {target}%{over ? (drift > 0 ? ' ▲' : ' ▼') : ''}
                    </span>
                  </div>
                  <div style={{ height: 4, background: '#1e2535', borderRadius: 2, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${Math.min((actual / 30) * 100, 100)}%`, background: BUCKET_COLORS[bucket], borderRadius: 2, transition: 'width 0.3s' }} />
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Recent expenses */}
        <div style={S.card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <div style={S.cardTitle}>Recent Expenses</div>
            <button style={{ ...S.btn, padding: '4px 10px', fontSize: 11 }} onClick={() => setShowQuickAdd(true)}>+ Add</button>
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
function PortfolioTab({ positions, setPositions }) {
  const [showAdd, setShowAdd] = useState(false);
  const [editPos, setEditPos] = useState(null);
  const [sortKey, setSortKey] = useState('bucket');
  const [sortDir, setSortDir] = useState(1);

  const { totalValue, alloc } = useMemo(() => portfolioStats(positions), [positions]);
  const alerts = useMemo(() => calcDriftAlerts(alloc), [alloc]);
  const totalCost = useMemo(() => positions.reduce((s, p) => s + p.quantity * p.avgCost, 0), [positions]);
  const totalPnl = totalValue - totalCost;

  const donutData = useMemo(() => Object.entries(ALLOCATION_TARGETS).map(([bucket, target]) => ({
    name: bucket, actual: parseFloat((alloc[bucket] || 0).toFixed(1)), target,
  })), [alloc]);

  const pieData = useMemo(() => Object.entries(ALLOCATION_TARGETS).map(([bucket]) => ({
    name: bucket, value: Math.max(parseFloat((alloc[bucket] || 0).toFixed(1)), 0.01),
  })), [alloc]);

  const sortedPositions = useMemo(() => {
    return [...positions].sort((a, b) => {
      if (sortKey === 'bucket') return a.bucket.localeCompare(b.bucket) * sortDir;
      if (sortKey === 'ticker') return a.ticker.localeCompare(b.ticker) * sortDir;
      let av = 0, bv = 0;
      if (sortKey === 'value') { av = a.quantity * a.currentPrice; bv = b.quantity * b.currentPrice; }
      else if (sortKey === 'pnl') { av = (a.currentPrice - a.avgCost) * a.quantity; bv = (b.currentPrice - b.avgCost) * b.quantity; }
      else if (sortKey === 'pnlPct') { av = a.avgCost > 0 ? (a.currentPrice - a.avgCost) / a.avgCost : 0; bv = b.avgCost > 0 ? (b.currentPrice - b.avgCost) / b.avgCost : 0; }
      else if (sortKey === 'alloc') { av = alloc[a.bucket] || 0; bv = alloc[b.bucket] || 0; }
      return (av - bv) * sortDir;
    });
  }, [positions, sortKey, sortDir, alloc]);

  const toggleSort = (k) => { if (sortKey === k) setSortDir(d => -d); else { setSortKey(k); setSortDir(-1); } };
  const sortIcon = (k) => sortKey === k ? (sortDir === -1 ? ' &#8595;' : ' &#8593;') : '';

  const handleSave = (pos) => {
    if (pos.id) { setPositions(p => p.map(x => x.id === pos.id ? pos : x)); }
    else { setPositions(p => [{ ...pos, id: genId() }, ...p]); }
    setShowAdd(false); setEditPos(null);
  };
  const handleDelete = (id) => { if (window.confirm('Delete this position?')) setPositions(p => p.filter(x => x.id !== id)); };

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 10 }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 800, color: '#f1f5f9' }}>Portfolio Tracker</div>
          {positions.length > 0 && (
            <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
              {fmt$(totalValue, 0)} total &middot; P&L <span style={{ color: totalPnl >= 0 ? '#22c55e' : '#ef4444', fontWeight: 700 }}>{fmt$(totalPnl, 0)}</span>
            </div>
          )}
        </div>
        <button style={S.btn} onClick={() => setShowAdd(true)}>+ Add Position</button>
      </div>

      {/* ── Drift alerts ── */}
      {alerts.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          {alerts.map(a => (
            <div key={a.bucket} style={S.alert}>
              <span style={S.tag(BUCKET_COLORS[a.bucket] || '#d4a843')}>{a.bucket}</span>
              <span style={{ color: '#94a3b8' }}>{a.actual.toFixed(1)}% actual vs {a.target}% target</span>
              <span style={{ marginLeft: 'auto', fontWeight: 700, color: a.drift > 0 ? '#ef4444' : '#22c55e' }}>
                {a.drift > 0 ? '+' : ''}{a.drift.toFixed(1)}% drift
              </span>
            </div>
          ))}
        </div>
      )}

      {/* ── Charts ── */}
      {positions.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
          <div style={S.card}>
            <div style={S.cardTitle}>Actual Allocation — {fmt$(totalValue, 0)}</div>
            <ResponsiveContainer width="100%" height={190}>
              <PieChart>
                <Pie data={pieData} cx="50%" cy="50%" innerRadius={52} outerRadius={82} paddingAngle={2} dataKey="value">
                  {pieData.map((entry) => <Cell key={entry.name} fill={BUCKET_COLORS[entry.name] || '#64748b'} />)}
                </Pie>
                <RTooltip formatter={(v, n) => [`${v}%`, n]} contentStyle={{ background: '#161b27', border: '1px solid #334155', borderRadius: 8, color: '#f1f5f9', fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '3px 10px', marginTop: 4 }}>
              {Object.keys(ALLOCATION_TARGETS).map(b => (
                <div key={b} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11 }}>
                  <div style={{ width: 7, height: 7, borderRadius: '50%', background: BUCKET_COLORS[b], flexShrink: 0 }} />
                  <span style={{ color: '#94a3b8' }}>{b} {(alloc[b] || 0).toFixed(0)}%</span>
                </div>
              ))}
            </div>
          </div>
          <div style={S.card}>
            <div style={S.cardTitle}>Target vs Actual (%)</div>
            <ResponsiveContainer width="100%" height={215}>
              <BarChart data={donutData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }} barGap={2}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e2535" />
                <XAxis dataKey="name" tick={{ fill: '#64748b', fontSize: 9 }} />
                <YAxis tick={{ fill: '#64748b', fontSize: 10 }} />
                <RTooltip formatter={(v, n) => [`${v}%`, n]} contentStyle={{ background: '#161b27', border: '1px solid #334155', borderRadius: 8, color: '#f1f5f9', fontSize: 12 }} />
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
          <button style={S.btn} onClick={() => setShowAdd(true)}>+ Add First Position</button>
        </div>
      ) : (
        <div style={S.card}>
          <div style={{ overflowX: 'auto' }}>
            <table style={S.table}>
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
                  const val = pos.quantity * pos.currentPrice;
                  const pnl = (pos.currentPrice - pos.avgCost) * pos.quantity;
                  const pnlPct = pos.avgCost > 0 ? ((pos.currentPrice - pos.avgCost) / pos.avgCost) * 100 : 0;
                  const allocPct = totalValue > 0 ? (val / totalValue) * 100 : 0;
                  return (
                    <tr key={pos.id} onDoubleClick={() => setEditPos(pos)} style={{ cursor: 'default' }}>
                      <td style={S.td}>
                        <div style={{ fontWeight: 700, color: '#f1f5f9' }}>{pos.ticker}</div>
                        {pos.name && <div style={{ fontSize: 10, color: '#64748b' }}>{pos.name}</div>}
                      </td>
                      <td style={S.td}>
                        <span style={S.tag(BUCKET_COLORS[pos.bucket] || '#d4a843')}>{pos.bucket}</span>
                        {pos.subBucket && <div style={{ fontSize: 10, color: '#64748b', marginTop: 2 }}>{pos.subBucket}</div>}
                      </td>
                      <td style={S.td}><strong>{fmt$(val, 0)}</strong></td>
                      <td style={{ ...S.td, ...(pnl >= 0 ? S.pnlPos : S.pnlNeg) }}>{pnl >= 0 ? '+' : ''}{fmt$(pnl, 0)}</td>
                      <td style={{ ...S.td, ...(pnlPct >= 0 ? S.pnlPos : S.pnlNeg) }}>{fmtPct(pnlPct)}</td>
                      <td style={S.td}>{allocPct.toFixed(1)}%</td>
                      <td style={{ ...S.td, fontSize: 11, color: '#64748b' }}>
                        {pos.quantity} &times; {fmt$(pos.avgCost)} / {fmt$(pos.currentPrice)}
                      </td>
                      <td style={S.td}>
                        <div style={{ display: 'flex', gap: 4 }}>
                          <button style={{ ...S.btnGhost, padding: '3px 8px', fontSize: 11 }} onClick={() => setEditPos(pos)}>Edit</button>
                          <button style={S.btnDanger} onClick={() => handleDelete(pos.id)}>&#10005;</button>
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
        <AddPositionModal position={editPos} onSave={handleSave} onClose={() => { setShowAdd(false); setEditPos(null); }} />
      )}
    </div>
  );
}

// ─── Add Position Modal ────────────────────────────────────────────────────────
function AddPositionModal({ position, onSave, onClose }) {
  const [ticker, setTicker]           = useState(position?.ticker       || '');
  const [name, setName]               = useState(position?.name         || '');
  const [bucket, setBucket]           = useState(position?.bucket       || 'QQQ');
  const [subBucket, setSubBucket]     = useState(position?.subBucket    || '');
  const [quantity, setQuantity]       = useState(position?.quantity     != null ? String(position.quantity)     : '');
  const [avgCost, setAvgCost]         = useState(position?.avgCost      != null ? String(position.avgCost)      : '');
  const [currentPrice, setCurrentPrice] = useState(position?.currentPrice != null ? String(position.currentPrice) : '');
  const tickerRef = useRef(null);

  useEffect(() => { if (!position && tickerRef.current) tickerRef.current.focus(); }, [position]);

  const qty = parseFloat(quantity);
  const avg = parseFloat(avgCost);
  const cur = parseFloat(currentPrice);
  const canSave = ticker.trim() && !isNaN(qty) && qty > 0 && !isNaN(avg) && avg >= 0 && !isNaN(cur) && cur >= 0;
  const liveVal = canSave ? qty * cur : null;
  const livePnl = canSave ? (cur - avg) * qty : null;

  const handleSave = () => {
    if (!canSave) return;
    onSave({ ...position, ticker: ticker.trim().toUpperCase(), name: name.trim(), bucket, subBucket: bucket === 'Crypto' ? subBucket : '', quantity: qty, avgCost: avg, currentPrice: cur });
  };

  const field = (label, val, set, extra = {}) => (
    <div style={{ marginBottom: 12 }}>
      <label style={{ display: 'block', fontSize: 11, color: '#64748b', marginBottom: 4, fontWeight: 600 }}>{label}</label>
      <input value={val} onChange={e => set(e.target.value)} style={S.inputStyle} {...extra} />
    </div>
  );

  return (
    <div style={S.overlay} onClick={onClose}>
      <div style={S.modal} onClick={e => e.stopPropagation()}>
        <button style={S.closeBtn} onClick={onClose}>&#215;</button>
        <div style={{ fontSize: 16, fontWeight: 700, color: '#f1f5f9', marginBottom: 18 }}>
          {position ? 'Edit Position' : 'Add Position'}
        </div>

        <div style={S.grid2}>
          <div>{field('Ticker *', ticker, v => setTicker(v.toUpperCase()), { placeholder: 'QQQ', ref: tickerRef })}</div>
          <div>{field('Name / Label', name, setName, { placeholder: 'Invesco QQQ Trust' })}</div>
        </div>

        <div style={{ marginBottom: 12 }}>
          <label style={{ display: 'block', fontSize: 11, color: '#64748b', marginBottom: 4, fontWeight: 600 }}>Bucket *</label>
          <select value={bucket} onChange={e => setBucket(e.target.value)} style={S.selectStyle}>
            {Object.keys(ALLOCATION_TARGETS).map(b => <option key={b} value={b}>{b} (target {ALLOCATION_TARGETS[b]}%)</option>)}
          </select>
        </div>

        {bucket === 'Crypto' && (
          <div style={{ marginBottom: 12 }}>
            <label style={{ display: 'block', fontSize: 11, color: '#64748b', marginBottom: 4, fontWeight: 600 }}>Sub-Bucket</label>
            <select value={subBucket} onChange={e => setSubBucket(e.target.value)} style={S.selectStyle}>
              <option value="">&#8212; select &#8212;</option>
              {CRYPTO_SUB_BUCKETS.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        )}

        <div style={S.grid3}>
          <div>{field('Quantity *', quantity, setQuantity, { type: 'number', min: '0', step: 'any', placeholder: '0' })}</div>
          <div>{field('Avg Cost *', avgCost, setAvgCost, { type: 'number', min: '0', step: 'any', placeholder: '0.00' })}</div>
          <div>{field('Current Price *', currentPrice, setCurrentPrice, { type: 'number', min: '0', step: 'any', placeholder: '0.00' })}</div>
        </div>

        {canSave && (
          <div style={{ background: '#0f1117', borderRadius: 8, padding: '10px 12px', marginBottom: 16, fontSize: 12, display: 'flex', gap: 16 }}>
            <span style={{ color: '#64748b' }}>Value: <strong style={{ color: '#d4a843' }}>{fmt$(liveVal, 0)}</strong></span>
            <span style={{ color: '#64748b' }}>P&L: <strong style={{ color: livePnl >= 0 ? '#22c55e' : '#ef4444' }}>{livePnl >= 0 ? '+' : ''}{fmt$(livePnl, 0)}</strong></span>
          </div>
        )}

        <div style={{ display: 'flex', gap: 8 }}>
          <button style={{ ...S.btnGhost, flex: 1 }} onClick={onClose}>Cancel</button>
          <button style={{ ...S.btn, flex: 2, opacity: canSave ? 1 : 0.45, cursor: canSave ? 'pointer' : 'not-allowed' }} onClick={handleSave} disabled={!canSave}>
            {position ? 'Save Changes' : 'Add Position'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Spending Tab ──────────────────────────────────────────────────────────────
function SpendingTab({ expenses, setExpenses }) {
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
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 10 }}>
        <div style={{ fontSize: 20, fontWeight: 800, color: '#f1f5f9' }}>Spending Tracker</div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <select value={viewMonth} onChange={e => setViewMonth(e.target.value)} style={{ ...S.selectStyle, width: 'auto', minWidth: 170 }}>
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
      <div style={{ display: 'grid', gridTemplateColumns: '200px 1fr', gap: 16, alignItems: 'start' }}>
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
