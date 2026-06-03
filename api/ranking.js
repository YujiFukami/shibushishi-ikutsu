// Vercel サーバーレスファンクション
// ブラウザ → このAPI → GAS → スプレッドシート
// GAS_API_TOKEN はここで付与するのでブラウザには渡さない

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const GAS_URL   = process.env.GAS_API_URL;
  const GAS_TOKEN = process.env.GAS_API_TOKEN;

  if (!GAS_URL || !GAS_TOKEN) {
    return res.status(503).json({ ok: false, error: 'ランキング機能は現在準備中です' });
  }

  let gasBody;

  if (req.method === 'GET') {
    const { action, boardSize, limit } = req.query;
    gasBody = {
      token:     GAS_TOKEN,
      action:    action,
      boardSize: Number(boardSize),
      limit:     Number(limit) || 20
    };
  } else {
    gasBody = { token: GAS_TOKEN, ...(req.body || {}) };
  }

  try {
    const response = await fetch(GAS_URL, {
      method:   'POST',
      headers:  { 'Content-Type': 'text/plain;charset=utf-8' },
      body:     JSON.stringify(gasBody),
      redirect: 'follow'
    });
    const data = await response.json();
    return res.status(200).json(data);
  } catch (err) {
    return res.status(502).json({ ok: false, error: 'GAS接続エラー: ' + String(err.message || err) });
  }
}
