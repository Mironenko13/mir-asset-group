// Alpha Vantage CURRENCY_EXCHANGE_RATE — XAU/USD, XAG/USD, XPT/USD, XPD/USD
// Env var: ALPHA_VANTAGE_API_KEY (shared with stocks endpoint)
// Returns spot prices per troy oz for gold, silver, platinum, palladium
// Cache-Control: s-maxage=900 (15 min — metals move slowly)

const METALS = [
  { from: 'XAU', name: 'GOLD'      },
  { from: 'XAG', name: 'SILVER'    },
  { from: 'XPT', name: 'PLATINUM'  },
  { from: 'XPD', name: 'PALLADIUM' },
];

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const apiKey = process.env.ALPHA_VANTAGE_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'ALPHA_VANTAGE_API_KEY not configured' });

  const prices = {};

  // Sequential — AV free tier allows 5 calls/min; 4 metals fits comfortably
  for (const { from, name } of METALS) {
    try {
      const url = `https://www.alphavantage.co/query?function=CURRENCY_EXCHANGE_RATE&from_currency=${from}&to_currency=USD&apikey=${apiKey}`;
      const resp = await fetch(url, { signal: AbortSignal.timeout(8000) });
      if (!resp.ok) continue;
      const data = await resp.json();
      const rate  = data?.['Realtime Currency Exchange Rate']?.['5. Exchange Rate'];
      const price = rate ? parseFloat(rate) : null;
      if (price != null && price > 0) prices[name] = price;
    } catch {}
  }

  res.setHeader('Cache-Control', 's-maxage=900, stale-while-revalidate=300');
  return res.status(200).json({ prices, timestamp: new Date().toISOString() });
}
