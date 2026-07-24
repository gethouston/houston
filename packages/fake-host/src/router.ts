/**
 * The fake host's request router: a pure `Request -> Response` function with no
 * Node HTTP coupling, so it can be unit-tested and driven by any adapter.
 *
 * Answers just enough of the host + per-agent runtime for the desktop UI
 * (app/src) to boot and run on the new-engine adapter in host mode — with NO
 * real backend, no AI provider, no credentials. Deterministic and hermetic.
 */

import { buildProviderCatalog } from "@houston/host/src/providers/pi-catalog";
import type { PendingInteraction } from "@houston/protocol";
import { setNextInteraction, setReplyDelay } from "./chat";
import {
  clearChatStreams,
  dropChatStreams,
  killRunningTurns,
  turnBoundary,
} from "./chat-controls";
import { CORS, json } from "./http";
import { handleAgents } from "./routes";
import { handleUserRoutes } from "./routes-integrations";
import { handleSetupRuntime } from "./routes-setup-runtime";
import { handleTeamsRoutes } from "./routes-teams";
import { sseResponse } from "./sse";
import type { FakeCapabilities, TeamsSettings } from "./state";
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
  // Arm the NEXT scripted turn to end on a pending interaction: its `done`
  // frame carries it, so the settle lands the card on needs_you + composer card.
  if (path === "/__test__/chat-interaction" && method === "POST") {
    const body = await parseBody(req);
    setNextInteraction(
      (body?.interaction as PendingInteraction | null) ?? null,
    );
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
  // Stall every per-agent read (`GET /agents/:id/*`) by `ms` — the cloud
  // gateway's `ensureAwake` hold: an asleep pod's reads hang until it wakes.
  // `{ ms: 0 }` (and the per-test reset) answers instantly again.
  if (path === "/__test__/hold-agent-reads" && method === "POST") {
    const body = await parseBody(req);
    state.setAgentReadHoldMs(Number(body?.ms ?? 0));
    return json({ ms: state.state.agentReadHoldMs });
  }
  // Toggle Composio readiness: "ready" | "unavailable" (503) | "signin" |
  // "absent" (not registered at all — only the custom provider, when armed).
  if (path === "/__test__/integrations-mode" && method === "POST") {
    const body = await parseBody(req);
    state.setIntegrationsMode(
      body?.mode === "unavailable" ||
        body?.mode === "signin" ||
        body?.mode === "absent"
        ? body.mode
        : "ready",
    );
    return json({ mode: state.integrationsMode() });
  }
  // Arm the custom-integrations feature (HOU-550): `{items: [...]}` serves the
  // definitions + a ready `custom` provider; `{items: null}` disarms (404s —
  // the pre-feature host shape). Reset restores disarmed.
  if (path === "/__test__/custom-integrations" && method === "POST") {
    const body = await parseBody(req);
    state.setCustomIntegrations(
      Array.isArray(body?.items)
        ? (body.items as state.CustomIntegrationSeed[])
        : null,
    );
    return json({ items: state.listCustomIntegrations() });
  }
  // Override advertised capabilities (Teams e2e): merge a partial into the set,
  // e.g. `{ integrations:["composio"], multiplayer:true, teams:true, role:"owner" }`
  // to reach the Teams-shaped state single-player can't. Reset restores the seed.
  if (path === "/__test__/capabilities" && method === "POST") {
    const body = await parseBody(req);
    return json(
      state.setCapabilities((body ?? {}) as Partial<FakeCapabilities>),
    );
  }
  // Arm the compute-usage dataset `GET /v1/org/compute-usage` serves (pair with
  // `/__test__/capabilities` `{computeUsage:true}`); `{seed:null}` disarms.
  if (path === "/__test__/compute-usage" && method === "POST") {
    const body = await parseBody(req);
    return json({
      seed: state.setComputeUsage(
        (body?.seed ?? null) as state.ComputeUsageSeed | null,
      ),
    });
  }
  // Arm the Teams settings the gateway serves at the settings routes below:
  // the agent + org integration ceilings, the model ceiling, and agent access.
  if (path === "/__test__/agent-settings" && method === "POST") {
    const body = await parseBody(req);
    return json(state.setTeamsSettings((body ?? {}) as Partial<TeamsSettings>));
  }
  // Arm the per-member access lens (Admin > People drill-in): a multi-member
  // org roster (`members`) `GET /v1/org` serves, and the agent fleet with
  // per-agent assignments (`agents`) `GET /agents` serves. Pair with
  // `/__test__/capabilities` `{multiplayer:true, teams:true, role:"owner"}`.
  if (path === "/__test__/org" && method === "POST") {
    const body = await parseBody(req);
    if (Array.isArray(body?.members)) {
      state.setOrgMembers(body.members as state.FakeMember[]);
    }
    if (Array.isArray(body?.agents)) {
      state.armAgents(body.agents as state.AgentAccessSeed[]);
    }
    return json({
      members: state.getOrgMembers(),
      agents: state.listAgents(),
    });
  }
  // Arm the team-space rows `GET /v1/workspaces` bridges in (C8 Spaces): each
  // `{ slug, name }` becomes an `{ id:"org:<slug>", kind:"org" }` switcher row,
  // served alongside the always-present personal seed row. A `slug` must be
  // exactly 16 lowercase hex chars (the id grammar `space-id.ts` enforces).
  // Pair with `/__test__/capabilities` `{ spaces:true }`. Reset (or `{teams:[]}`)
  // restores the personal-only list.
  if (path === "/__test__/workspaces" && method === "POST") {
    const body = await parseBody(req);
    const teams = Array.isArray(body?.teams) ? body.teams : [];
    const rows = teams.flatMap((t) => {
      const row = t as { slug?: unknown; name?: unknown };
      if (typeof row.slug !== "string" || !/^[a-f0-9]{16}$/.test(row.slug)) {
        return [];
      }
      return [
        {
          id: `org:${row.slug}`,
          name: typeof row.name === "string" ? row.name : row.slug,
        },
      ];
    });
    return json({ teams: state.setTeamWorkspaces(rows) });
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

  // --- top-level host probes ---
  if (path === "/health") return json({ status: "ok", version: "e2e" });
  if (path === "/version") return json({ engine: "e2e", protocol: 1 });

  // --- pre-agent connect surface (the WebApp gate + ConnectView) ---
  // The real host serves this ONLY under /setup-runtime/* — no flat
  // /auth/status or /providers exists there, so none exists here either.
  const setupRoute = handleSetupRuntime(method, path, url, body);
  if (setupRoute) return setupRoute;

  // --- misc host surface the UI may touch on boot (kept permissive) ---
  // Deployment capabilities: single-player local by default (the app's boot
  // routing waits on this — App.tsx gates onboarding-vs-shell on loaded
  // capabilities). Armed to a Teams-shaped set by `/__test__/capabilities`.
  if (path === "/v1/capabilities" && method === "GET") {
    return json(state.getCapabilities());
  }
  // pi-ai's full static model catalog (`GET /v1/catalog`, wire `ProviderCatalog`).
  // Built from the SAME real `buildProviderCatalog` the host route uses, so the
  // mock can't drift from the wire contract — the app's `getCatalog()` hydrates
  // the picker + AI Models tab from it. It returns every runnable provider on
  // every deployment (no profile gating). Without this the route 404'd,
  // `getCatalog()` degraded to `[]`, and the picker fell back to the override-only
  // seed (no models).
  if (path === "/v1/catalog" && method === "GET") {
    return json(buildProviderCatalog());
  }
  // --- user-scoped gateway routes (integrations, preferences, locale) ---
  const userRoute = handleUserRoutes(method, segs, body);
  if (userRoute) return userRoute;

  // --- Teams v2 gateway routes (agent + org settings / allowlist ceilings) ---
  const teamsRoute = handleTeamsRoutes(method, segs, body, url);
  if (teamsRoute) return teamsRoute;

  // --- everything under /agents/* ---
  if (segs[0] === "agents") {
    // Armed cold-start hold: per-agent READS stall like they do behind the
    // cloud gateway while a pod wakes. The agent LIST (`GET /agents`) stays
    // instant — in the real deployment it is a gateway answer, not a pod one.
    // The runtime-proxy `providers` probes are exempt too: they are not what
    // this control models, and holding them exhausts the browser's HTTP/1.1
    // six-connection budget against the dev server, stalling even unheld
    // boot routes — an artifact the real HTTP/2 gateway doesn't have.
    if (
      state.state.agentReadHoldMs > 0 &&
      method === "GET" &&
      segs.length > 1 &&
      segs[2] !== "providers"
    )
      await new Promise((r) => setTimeout(r, state.state.agentReadHoldMs));
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
