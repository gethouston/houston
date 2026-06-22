// Houston relay — Cloudflare Worker front door.
//
// Two concerns in one Worker: the reverse-tunnel proxy that carries
// mobile HTTP+WS traffic to the user's desktop engine, and static
// asset hosting for the PWA that drives it. Co-locating them keeps
// every mobile request first-party (no cross-origin, no iOS Safari
// ITP throttling).
//
// Route table:
//   GET  /health                              liveness probe
//   POST /allocate                            mint {tunnelId, tunnelToken}
//   GET  /e/:tunnelId/register   (Upgrade)    desktop engine registers
//   GET  /e/:tunnelId/v1/ws      (Upgrade)    mobile engine WebSocket
//   *    /e/:tunnelId/v1/*                    proxied engine HTTP
//   POST /pair/:code                          mobile redeems pairing code
//   GET  /pair/:code                          QR deep-link → SPA redirect
//   *    everything else                      PWA static assets

import { handleAllocate, verifyTunnelToken } from "./allocate";
import type { Env } from "./types";
import { TunnelRoom } from "./tunnel-do";

export { TunnelRoom };

export default {
  async fetch(
    request: Request,
    env: Env,
    _ctx: ExecutionContext,
  ): Promise<Response> {
    // Preflight first — some clients live on foreign origins (Vite
    // dev at localhost:5173, future third-party integrations) and
    // need a 204 before they'll touch the real request.
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }

    const url = new URL(request.url);
    const segments = url.pathname.split("/").filter(Boolean);

    try {
      const res = await route(request, env, url, segments);
      return withCors(res);
    } catch (e) {
      return withCors(
        Response.json(
          { ok: false, error: e instanceof Error ? e.message : String(e) },
          { status: 500 },
        ),
      );
    }
  },
};

async function route(
  request: Request,
  env: Env,
  url: URL,
  segments: string[],
): Promise<Response> {
  if (url.pathname === "/health") return Response.json({ ok: true });
  if (url.pathname === "/allocate") return handleAllocate(request, env);

  if (segments[0] === "pair" && segments[1]) {
    if (request.method === "GET") {
      return handlePairRedirect(request, segments[1]!);
    }
    return handlePairCode(request, env, segments[1]!);
  }
  if (segments[0] === "e" && segments[1]) {
    return handleTunnel(request, env, segments[1]!);
  }

  // Anything the Worker doesn't claim → static asset (the PWA bundle,
  // including SPA fallback to index.html for unknown paths, configured
  // via `not_found_handling = "single-page-application"` in wrangler).
  return env.ASSETS.fetch(request);
}

function corsHeaders(): Record<string, string> {
  return {
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET,HEAD,POST,PUT,DELETE,OPTIONS",
    "access-control-allow-headers":
      "authorization,content-type,sec-websocket-protocol",
    "access-control-max-age": "86400",
  };
}

function withCors(res: Response): Response {
  // WebSocket upgrades (101) mustn't have their headers mutated.
  if (res.status === 101) return res;
  const headers = new Headers(res.headers);
  for (const [k, v] of Object.entries(corsHeaders())) headers.set(k, v);
  return new Response(res.body, { status: res.status, headers });
}

/**
 * `POST /pair/:code` — mobile PWA redeems a reusable access secret from
 * the desktop QR. Code is `<tunnelIdBase64Url>-<accessSecret>`; the tunnelId
 * portion routes us to the correct Durable Object. We split on the
 * LAST dash because base64url can itself contain dashes.
 */
async function handlePairCode(
  request: Request,
  env: Env,
  code: string,
): Promise<Response> {
  const dash = code.lastIndexOf("-");
  if (dash < 0) return malformedCode();
  const tunnelId = code.slice(0, dash);
  const accessSecret = code.slice(dash + 1);
  if (!tunnelId || !accessSecret) return malformedCode();

  const id = env.TUNNEL.idFromName(tunnelId);
  const stub = env.TUNNEL.get(id);
  const body = await safeJson(request);
  return stub.fetch(`https://tunnel/e/${tunnelId}/pair`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      code: accessSecret,
      deviceLabel: (body as { deviceLabel?: string })?.deviceLabel ?? "iPhone",
    }),
  });
}

function malformedCode(): Response {
  return Response.json(
    { ok: false, code: "code_malformed", error: "malformed code" },
    { status: 400 },
  );
}

/** Dispatch `/e/:tunnelId/*` to its Durable Object. The desktop
 * register path is additionally gated by an HMAC check on the tunnel
 * token; everything else is authenticated downstream by the engine
 * itself. */
async function handleTunnel(
  request: Request,
  env: Env,
  tunnelId: string,
): Promise<Response> {
  const url = new URL(request.url);
  const action = url.pathname.split("/")[3] ?? "";

  if (action === "register") {
    if (!env.TUNNEL_SHARED_SECRET) {
      return new Response("relay not configured", { status: 500 });
    }
    const auth = request.headers.get("authorization") ?? "";
    const bearer = auth.replace(/^bearer\s+/i, "");
    const ok = await verifyTunnelToken(
      tunnelId,
      bearer,
      env.TUNNEL_SHARED_SECRET,
    );
    if (!ok) return new Response("bad tunnel token", { status: 401 });
  }

  const id = env.TUNNEL.idFromName(tunnelId);
  const stub = env.TUNNEL.get(id);
  return stub.fetch(request);
}

/** QR deep-link handler. A camera scan of the QR opens
 * `GET /pair/:code` in the user's browser; we 302 to `/?code=<...>`
 * at the same origin so the bundled SPA's PairScreen picks the code
 * up on mount. */
function handlePairRedirect(request: Request, code: string): Response {
  const origin = new URL(request.url).origin;
  const target = `${origin}/?code=${encodeURIComponent(code)}`;
  return new Response(null, { status: 302, headers: { location: target } });
}

async function safeJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return null;
  }
}
