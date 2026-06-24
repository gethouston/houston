/**
 * Fake Houston host for the Playwright UI tests.
 *
 * A single Bun process that answers just enough of the control plane + per-agent
 * runtime for the desktop UI (app/src) to boot and run on the new-engine adapter
 * in control-plane mode — with NO real backend, no AI provider, no credentials.
 * Deterministic and hermetic: the same click always produces the same pixels.
 *
 * Run standalone with `pnpm --filter houston-web fake-host`; the Playwright
 * config starts it automatically as a `webServer`.
 */

import { clearChatStreams } from "./chat";
import { CORS, json, noContent } from "./http";
import { FAKE_HOST_PORT } from "./ports";
import { authStatusBody, handleAgents, providersBody } from "./routes";
import { sseResponse } from "./sse";
import * as state from "./state";

async function parseBody(
  req: Request,
): Promise<Record<string, unknown> | undefined> {
  if (req.method === "GET" || req.method === "HEAD") return undefined;
  return (await req.json().catch(() => undefined)) as
    | Record<string, unknown>
    | undefined;
}

/** Global reactivity feed (`GET /v1/events`). Mirrors the host's SSE shape:
 *  `data: { type, agentPath, workspaceId }`. control-plane.ts subscribeEvents
 *  translates these into TanStack Query invalidations. */
function openDomainStream(req: Request): Response {
  return sseResponse(req, (sink) => {
    sink.comment("connected");
    const off = state.onDomainEvent((event) => {
      if (!sink.closed) sink.push(event);
    });
    req.signal.addEventListener("abort", off);
  });
}

async function handle(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const path = url.pathname;
  const method = req.method;

  if (process.env.FAKE_HOST_LOG && method !== "OPTIONS")
    console.log(`[fake-host] ${method} ${path}`);

  if (method === "OPTIONS")
    return new Response(null, { status: 204, headers: CORS });

  // --- test-control plane (called server-to-server by the harness) ---
  if (path === "/__test__/reset" && method === "POST") {
    clearChatStreams();
    state.reset();
    return json({ ok: true });
  }
  if (path === "/__test__/emit" && method === "POST") {
    const body = await parseBody(req);
    state.emit(
      String(body?.type ?? "AgentsChanged"),
      body?.agentPath as string | undefined,
    );
    return json({ ok: true });
  }

  // --- global reactivity feed ---
  if (path === "/v1/events" && method === "GET") return openDomainStream(req);

  const segs = path.split("/").filter(Boolean);
  const body = await parseBody(req);

  // --- top-level runtime probe (the WebApp connect gate uses a base-URL client) ---
  if (path === "/health") return json({ status: "ok", version: "e2e" });
  if (path === "/version") return json({ engine: "e2e", protocol: 1 });
  if (path === "/auth/status") return json(authStatusBody());
  if (path === "/providers") return json(providersBody());

  // --- misc host surface the UI may touch on boot (kept permissive) ---
  if (segs[0] === "v1" && segs[1] === "workspaces") return json([]);
  // Composio integrations: report none connected (control-plane.ts wants `{ items }`).
  if (segs[0] === "v1" && segs[1] === "integrations")
    return json({ items: [] });
  if (segs[0] === "v1" && segs[1] === "preferences") {
    return method === "GET" ? json({ value: null }) : noContent();
  }

  // --- everything under /agents/* ---
  if (segs[0] === "agents") {
    return handleAgents(
      method,
      segs.slice(1).map(decodeURIComponent),
      req,
      body,
    );
  }

  console.warn(`[fake-host] 404 ${method} ${path}`);
  return json({ error: { message: `no fake route for ${path}` } }, 404);
}

const server = Bun.serve({
  port: FAKE_HOST_PORT,
  idleTimeout: 0, // never time out the long-lived SSE streams
  fetch: handle,
});

console.log(`[fake-host] listening on http://localhost:${server.port}`);
