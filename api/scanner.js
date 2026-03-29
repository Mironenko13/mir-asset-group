const Anthropic = require('@anthropic-ai/sdk');

const SYSTEM_PROMPT = `You are the Mir Asset Group market analyst. You analyze markets through a four-mode regime framework: Risk-On, Risk-Off, Transition, and Crisis. You cover eleven sectors: Tech/Growth, Crypto, Dividends/Income, Quantum/Emerging Tech, Gold, Silver, Energy/Commodities, Real Estate, Fixed Income, International, and Cash. The user is a blue-collar wealth builder running a 7-bucket portfolio: 25% QQQ, 25% Crypto (80-85% XRP, remainder WLFI/BTC/SOL/XLM/HBAR), 15% Dividends, 10% Quantum/Emerging, 10% Gold, 10% Energy/Commodities, 5% Silver. He funds asset acquisitions via 40% LTV portfolio loans. Always give specific tickers, specific reasoning, and confidence levels (High/Medium/Low). Be direct and actionable — no fluff.

IMPORTANT: Always use web search to look up current prices, market data, and recent news before giving any analysis. Never rely on your training data for prices or market conditions — they are outdated.

Always include specific current dollar prices, price levels, and key support/resistance numbers in your analysis. For gold and silver, quote spot price per troy ounce. For crypto, quote current token price in USD. For stocks/ETFs, quote current share price. Never give analysis without specific price data.

CRITICAL: You must respond ONLY with valid JSON — no markdown, no prose, no code fences. Use exactly this schema:
{
  "signals": [
    {
      "ticker": "string (ticker symbol or asset name)",
      "direction": "bullish" | "bearish" | "neutral",
      "confidence": "High" | "Medium" | "Low",
      "sector": "string",
      "reasoning": "string (1-2 sentences, specific and actionable)"
    }
  ],
  "summary": "string (2-3 sentence market overview)",
  "regime": "Risk-On" | "Risk-Off" | "Transition" | "Crisis"
}`;

const SCAN_PROMPTS = {
  regime:      'What is the current market regime? Classify as Risk-On, Risk-Off, Transition, or Crisis. Explain the key macro signals driving this classification and what to watch for regime change. Include 4-6 signals covering major asset classes.',
  crypto:      'Analyze current crypto market conditions. Focus on XRP, BTC, SOL, XLM, HBAR, and WLFI. Give specific entry/exit signals, key levels, and catalysts to watch. Include 6-8 signals.',
  commodities: 'Analyze gold, silver, and energy/commodity plays. Give specific tickers, price levels, and macro drivers. Include any COMEX or COT positioning signals. Return 5-7 signals.',
  dividends:   'Recommend 3-5 high-quality dividend stocks for a blue-collar income portfolio. Include yield, payout ratio, dividend growth rate, and why each is a buy now. Return 3-5 signals.',
  quantum:     'Analyze quantum computing and emerging tech sector. Cover IonQ, D-Wave, Rigetti, QTUM ETF. Any new entrants? Current risk/reward assessment for speculative positions. Return 4-6 signals.',
  sectors:       'Give a full eleven-sector sweep. For each sector: current outlook (bullish/bearish/neutral), top 1-2 actionable tickers, and key catalyst to watch. Return 11-14 signals covering all sectors.',
  global_session: 'Analyze what happened in the Asian and London sessions overnight. What moved? What are the key setups heading into the New York session? Focus on my portfolio holdings (QQQ, XRP, BTC, SOL, XLM, HBAR, gold, silver, energy/commodities) and the broader market. Include notable forex moves (DXY, EUR/USD, USD/JPY) that signal risk appetite. What is the pre-market tone and what levels matter most at the open? Return 6-10 signals.',
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'ANTHROPIC_API_KEY is not configured on the server.' });
  }

  const { scanType, customQuery } = req.body || {};

  let userPrompt;
  if (scanType === 'custom') {
    if (!customQuery || !customQuery.trim()) {
      return res.status(400).json({ error: 'Custom query is required.' });
    }
    userPrompt = customQuery.trim();
  } else {
    userPrompt = SCAN_PROMPTS[scanType];
    if (!userPrompt) {
      return res.status(400).json({ error: `Unknown scan type: ${scanType}` });
    }
  }

  const client = new Anthropic({ apiKey });

  try {
    const msg = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 2000,
      tools: [{ type: 'web_search_20250305', name: 'web_search' }],
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userPrompt }],
    });

    // With web_search enabled, content may include tool_use blocks before the final text block
    const textBlock = msg.content.filter(b => b.type === 'text').pop();
    if (!textBlock) throw new Error('No text response from model');
    const raw = textBlock.text.trim();
    // Strip any accidental code fences
    const jsonStr = raw.replace(/^```(?:json)?\n?/i, '').replace(/\n?```$/i, '').trim();
    const data = JSON.parse(jsonStr);

    // Ensure required fields
    if (!data.signals || !Array.isArray(data.signals)) data.signals = [];
    if (!data.summary) data.summary = '';
    if (!data.regime) data.regime = 'Transition';
    data.timestamp = new Date().toISOString();

    return res.status(200).json(data);
  } catch (e) {
    return res.status(500).json({ error: e.message || 'Unknown error occurred' });
  }
}
