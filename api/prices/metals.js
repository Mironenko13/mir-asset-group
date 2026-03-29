// GoldAPI.io — free tier, 1 request/metal
// Env var: METALS_API_KEY
// Returns spot prices per troy oz for gold, silver, platinum, palladium

const METALS = [
  { symbol: 'XAU', name: 'GOLD'      },
  { symbol: 'XAG', name: 'SILVER'    },
  { symbol: 'XPT', name: 'PLATINUM'  },
  { symbol: 'XPD', name: 'PALLADIUM' },
];

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const apiKey = process.env.METALS_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'METALS_API_KEY not configured' });

  const prices = {};

  await Promise.allSettled(
    METALS.map(async ({ symbol, name }) => {
      try {
        const resp = await fetch(`https://www.goldapi.io/api/${symbol}/USD`, {
          headers: { 'x-access-token': apiKey, 'Content-Type': 'application/json' },
          signal: AbortSignal.timeout(8000),
        });
        if (!resp.ok) return;
        const data = await resp.json();
        if (data.price != null && data.price > 0) prices[name] = data.price;
      } catch {}
    })
  );

  res.setHeader('Cache-Control', 's-maxage=900, stale-while-revalidate=300');
  return res.status(200).json({ prices, timestamp: new Date().toISOString() });
}
