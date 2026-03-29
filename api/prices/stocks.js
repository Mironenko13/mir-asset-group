// Alpha Vantage API — free tier: 25 calls/day, 5/min
// Env var: ALPHA_VANTAGE_API_KEY
// We batch carefully to conserve daily quota

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const apiKey = process.env.ALPHA_VANTAGE_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'ALPHA_VANTAGE_API_KEY not configured' });

  const { tickers = [] } = req.body || {};
  if (!tickers.length) return res.status(400).json({ error: 'No tickers provided' });

  // Limit to 5 unique tickers per call to preserve daily quota
  const unique = [...new Set(tickers.map(t => t.toUpperCase()))].slice(0, 5);

  const prices = {};
  const failed = [];

  // Sequential to respect 5 calls/min rate limit on free tier
  for (const ticker of unique) {
    try {
      const url = `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${ticker}&apikey=${apiKey}`;
      const resp = await fetch(url, { signal: AbortSignal.timeout(8000) });
      const data = await resp.json();
      const quote = data['Global Quote'];
      const price = quote && quote['05. price'] ? parseFloat(quote['05. price']) : null;
      if (price != null && price > 0) {
        prices[ticker] = price;
      } else {
        failed.push(ticker);
      }
    } catch {
      failed.push(ticker);
    }
  }

  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=120');
  return res.status(200).json({ prices, failed, timestamp: new Date().toISOString() });
}
