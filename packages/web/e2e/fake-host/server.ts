/**
 * Fake Houston host for the Playwright UI tests.
 *
 * A single Node process that answers just enough of the host + per-agent
 * runtime for the desktop UI (app/src) to boot and run on the new-engine adapter
 * in host mode — with NO real backend, no AI provider, no credentials.
 * Deterministic and hermetic: the same click always produces the same pixels.
 *
 * Run standalone with `pnpm --filter houston-web fake-host`; the Playwright
 * config starts it automatically as a `webServer`.
 */

import { createServer } from "node:http";
import { Readable } from "node:stream";
import type { Capabilities } from "@houston-ai/engine-client";
import { setReplyDelay } from "./chat";
import {
  clearChatStreams,
  dropChatStreams,
  killRunningTurns,
  turnBoundary,
} from "./chat-controls";
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
      if (!sink.closed) sink.data(event);
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
  // Sever every open chat stream mid-turn (the turns keep producing into the
  // replay log) — the network-drop half of the reconnect e2e.
  if (path === "/__test__/drop-chat-streams" && method === "POST") {
    return json({ dropped: dropChatStreams() });
  }
  // Slow the canned reply so a test can land a drop mid-turn deterministically.
  if (path === "/__test__/chat-config" && method === "POST") {
    const body = await parseBody(req);
    setReplyDelay(Number(body?.replyDelayMs ?? 15));
    return json({ ok: true });
  }
  // Synthesize the dead-pump reaper's terminal error on every running turn.
  if (path === "/__test__/kill-turn" && method === "POST") {
    return json({ killed: killRunningTurns() });
  }
  // End the running turn while nobody watches, then start the next one —
  // the resync-across-a-turn-boundary simulation.
  if (path === "/__test__/turn-boundary" && method === "POST") {
    const body = await parseBody(req);
    return json({
      advanced: turnBoundary(String(body?.nextText ?? "next turn")),
    });
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
  // Single-player local profile: the app's boot routing waits on this
  // (App.tsx gates onboarding-vs-shell on loaded capabilities).
  if (path === "/v1/capabilities" && method === "GET") {
    const caps: Capabilities = {
      profile: "local",
      revealInOs: false,
      terminal: false,
      tunnel: false,
      codeExecution: "disabled",
      providers: ["anthropic"],
      openaiCompatible: false,
      integrations: [],
    };
    return json(caps);
  }
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

function requestBodyAllowed(method: string | undefined): boolean {
  return method !== "GET" && method !== "HEAD";
}

async function readBody(req: AsyncIterable<unknown>): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(
      Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array),
    );
  }
  return Buffer.concat(chunks);
}

const server = createServer(async (req, res) => {
  const abort = new AbortController();
  req.on("close", () => abort.abort());
  try {
    const host = req.headers.host ?? `127.0.0.1:${FAKE_HOST_PORT}`;
    const body = requestBodyAllowed(req.method)
      ? await readBody(req)
      : undefined;
    const response = await handle(
      new Request(`http://${host}${req.url ?? "/"}`, {
        method: req.method,
        headers: req.headers as HeadersInit,
        body: body ? new Uint8Array(body) : undefined,
        signal: abort.signal,
      }),
    );
    res.writeHead(response.status, Object.fromEntries(response.headers));
    if (response.body) {
      Readable.fromWeb(
        response.body as Parameters<typeof Readable.fromWeb>[0],
      ).pipe(res);
    } else {
      res.end();
    }
  } catch (err) {
    if (abort.signal.aborted) return;
    const message = err instanceof Error ? err.message : String(err);
    if (!res.headersSent) {
      res.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
    }
    res.end(message);
  }
});
server.keepAliveTimeout = 0;
server.headersTimeout = 0;
server.listen(FAKE_HOST_PORT, () => {
  console.log(`[fake-host] listening on http://localhost:${FAKE_HOST_PORT}`);
});
