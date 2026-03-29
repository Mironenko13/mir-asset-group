// CoinGecko free API — no key required
// Maps common ticker symbols to CoinGecko IDs
const COIN_MAP = {
  XRP:  'ripple',
  BTC:  'bitcoin',
  ETH:  'ethereum',
  SOL:  'solana',
  XLM:  'stellar',
  HBAR: 'hedera-hashgraph',
  ADA:  'cardano',
  DOT:  'polkadot',
  AVAX: 'avalanche-2',
  MATIC:'matic-network',
  LINK: 'chainlink',
  UNI:  'uniswap',
  ATOM: 'cosmos',
  LTC:  'litecoin',
  ALGO: 'algorand',
  // WLFI not on CoinGecko — will be skipped gracefully
};

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { tickers = [] } = req.body || {};
  if (!tickers.length) return res.status(400).json({ error: 'No tickers provided' });

  const upper = tickers.map(t => t.toUpperCase());
  const idMap = {}; // coinGeckoId -> ticker
  upper.forEach(t => { if (COIN_MAP[t]) idMap[COIN_MAP[t]] = t; });

  const ids = Object.keys(idMap);
  if (!ids.length) return res.status(200).json({ prices: {}, timestamp: new Date().toISOString() });

  try {
    const url = `https://api.coingecko.com/api/v3/simple/price?ids=${ids.join(',')}&vs_currencies=usd`;
    const resp = await fetch(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(8000) });
    if (!resp.ok) throw new Error(`CoinGecko ${resp.status}`);
    const data = await resp.json();

    const prices = {};
    Object.entries(idMap).forEach(([cgId, ticker]) => {
      if (data[cgId]?.usd != null) prices[ticker] = data[cgId].usd;
    });

    res.setHeader('Cache-Control', 's-maxage=120, stale-while-revalidate=60');
    return res.status(200).json({ prices, timestamp: new Date().toISOString() });
  } catch (e) {
    return res.status(500).json({ error: e.message, prices: {} });
  }
}
