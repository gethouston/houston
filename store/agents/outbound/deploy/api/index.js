/**
 * Vercel A2A Forwarder
 *
 * Forwards incoming A2A requests from the Bio marketplace to the local
 * Outbound agent server running behind a Cloudflare Tunnel.
 *
 * The tunnel URL is stored in the LOCAL_AGENT_URL environment variable
 * and updated automatically by server/update-tunnel.js on each startup.
 *
 * Falls back to a static "agent is offline" response if the tunnel is down.
 */

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const tunnelUrl = process.env.LOCAL_AGENT_URL;

  // ── GET: health / discovery ────────────────────────────────────────────────
  if (req.method === 'GET') {
    return res.status(200).json({
      name: 'Outbound',
      version: '0.1.2',
      status: tunnelUrl && !tunnelUrl.includes('placeholder') ? 'ok' : 'offline',
      tunnel: tunnelUrl || null,
    });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // ── No tunnel configured ───────────────────────────────────────────────────
  if (!tunnelUrl || tunnelUrl.includes('placeholder')) {
    const id = req.body?.id ?? null;
    return res.status(503).json({
      jsonrpc: '2.0',
      id,
      error: {
        code: -32603,
        message: 'Outbound agent is offline. Start the local server with server/start.bat to handle requests.',
      },
    });
  }

  // ── Forward to local server ────────────────────────────────────────────────
  try {
    const upstream = await fetch(tunnelUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body),
      signal: AbortSignal.timeout(290_000), // just under Vercel's 300s limit
    });

    const data = await upstream.json();
    return res.status(upstream.status).json(data);
  } catch (err) {
    const id = req.body?.id ?? null;
    console.error('[forwarder] upstream error:', err.message);
    return res.status(502).json({
      jsonrpc: '2.0',
      id,
      error: {
        code: -32603,
        message: `Could not reach local agent: ${err.message}`,
      },
    });
  }
}
