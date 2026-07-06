/**
 * The fake host's request router: a pure `Request -> Response` function with no
 * Node HTTP coupling, so it can be unit-tested and driven by any adapter.
 *
 * Answers just enough of the host + per-agent runtime for the desktop UI
 * (app/src) to boot and run on the new-engine adapter in host mode — with NO
 * real backend, no AI provider, no credentials. Deterministic and hermetic.
 */

import type { Capabilities } from "@houston/protocol";
import { setReplyDelay } from "./chat";
import {
  clearChatStreams,
  dropChatStreams,
  killRunningTurns,
  turnBoundary,
} from "./chat-controls";
import { CORS, json } from "./http";
import { authStatusBody, handleAgents, providersBody } from "./routes";
import { handleUserRoutes } from "./routes-integrations";
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

/** Route one request to a `Response`. The single entry point for every adapter. */
export async function handle(req: Request): Promise<Response> {
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
  // Toggle Composio readiness: "ready" | "unavailable" (503) | "signin".
  if (path === "/__test__/integrations-mode" && method === "POST") {
    const body = await parseBody(req);
    state.setIntegrationsMode(
      body?.mode === "unavailable" || body?.mode === "signin"
        ? body.mode
        : "ready",
    );
    return json({ mode: state.integrationsMode() });
  }
  // Flip a pending connection to active (models the OAuth completing).
  if (path === "/__test__/integrations-activate" && method === "POST") {
    const body = await parseBody(req);
    return json({
      activated: state.activateConnection(String(body?.connectionId ?? "")),
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
  // --- user-scoped gateway routes (integrations, grants, preferences, locale) ---
  const userRoute = handleUserRoutes(method, segs, body);
  if (userRoute) return userRoute;

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
