const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const DEFAULT_MODEL = 'llama-3.1-8b-instant';

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'Missing GROQ_API_KEY' });

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const messages = Array.isArray(body?.messages) ? body.messages : [];

    if (!messages.length) {
      return res.status(400).json({ error: 'messages array is required' });
    }

    const groqRes = await fetch(GROQ_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: body.model || DEFAULT_MODEL,
        messages: messages.slice(-12),
        max_tokens: Math.min(Number(body.max_tokens) || 160, 300),
        temperature: typeof body.temperature === 'number' ? body.temperature : 0.85,
      }),
    });

    const data = await groqRes.json();
    if (!groqRes.ok) {
      return res.status(groqRes.status).json({ error: data.error?.message || 'Groq request failed' });
    }

    return res.status(200).json({
      content: data.choices?.[0]?.message?.content?.trim() || '',
    });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Server error' });
  }
};
