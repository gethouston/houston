/**
 * User-scoped gateway routes for the fake host: Composio integrations,
 * key/value preferences, and the workspace-locale override.
 *
 * These mirror the cloud gateway (`user-routes.ts` + `integrations-routes.ts`)
 * and the host `account.ts`, keyed by "the acting user" — there is one user in
 * the fake host, so no per-user keying is modeled. Returns a `Response` when a
 * route matched, or `undefined` to let the router fall through.
 */

import { parseSidebarLayout } from "@houston/host/src/routes/sidebar-layout";
import { SEED_WORKSPACE_ID } from "./config";
import { json } from "./http";
import * as state from "./state";

/** The personal workspace wire shape the gateway/host return (account.ts
 *  `toWire`). `kind:"personal"` marks the C8 Spaces bridge row — the opaque,
 *  never-`org:`-prefixed personal space. */
function workspaceWire() {
  return {
    id: SEED_WORKSPACE_ID,
    name: SEED_WORKSPACE_ID,
    isDefault: true,
    createdAt: new Date(0).toISOString(),
    kind: "personal" as const,
    locale: state.getPreference("locale"),
  };
}

/** An armed team-space bridge row (C8): `{ id:"org:<slug>", kind:"org" }`. */
function teamWorkspaceWire(row: { id: string; name: string }) {
  return {
    id: row.id,
    name: row.name,
    isDefault: false,
    createdAt: new Date(0).toISOString(),
    kind: "org" as const,
    locale: null,
  };
}

/** The full `GET /v1/workspaces` list: the personal seed row plus any armed
 *  team-space rows (C8 Spaces bridge). Personal-only when none are armed. */
function workspacesList() {
  return [workspaceWire(), ...state.getTeamWorkspaces().map(teamWorkspaceWire)];
}

/** Every integrations + grants route 503s when no Composio key is configured. */
function unavailable(): Response {
  return json({ error: "integrations not configured" }, 503);
}

function handleComposio(
  method: string,
  tail: string[],
  body: Record<string, unknown> | undefined,
): Response {
  // GET /v1/integrations/composio/toolkits
  if (tail.length === 1 && tail[0] === "toolkits" && method === "GET") {
    return json({ items: state.listToolkits() });
  }
  // GET /v1/integrations/composio/connections
  if (tail.length === 1 && tail[0] === "connections" && method === "GET") {
    return json({ items: state.listConnections() });
  }
  // GET /v1/integrations/composio/connections/:id
  if (tail.length === 2 && tail[0] === "connections" && method === "GET") {
    const conn = state.getConnection(tail[1]);
    return conn ? json(conn) : json({ error: "connection not found" }, 404);
  }
  // POST /v1/integrations/composio/connect { toolkit }
  if (tail.length === 1 && tail[0] === "connect" && method === "POST") {
    const toolkit = String(body?.toolkit ?? "");
    if (!toolkit) return json({ error: "missing toolkit" }, 400);
    return json(state.connect(toolkit));
  }
  // POST /v1/integrations/composio/disconnect { toolkit }
  if (tail.length === 1 && tail[0] === "disconnect" && method === "POST") {
    const toolkit = String(body?.toolkit ?? "");
    if (!toolkit) return json({ error: "missing toolkit" }, 400);
    state.disconnect(toolkit);
    return json({ ok: true });
  }
  return json({ error: "not found" }, 404);
}

/**
 * Custom integrations (HOU-550): `/v1/integrations/custom/definitions*`. The
 * list 404s when the feature is not armed — exactly how an older real host
 * answers, which the client reads as "hide every custom surface" (null).
 */
function handleCustom(
  method: string,
  tail: string[],
  _body: Record<string, unknown> | undefined,
): Response {
  const items = state.listCustomIntegrations();
  if (items === null || tail[0] !== "definitions") {
    return json({ error: "not found" }, 404);
  }
  // GET /v1/integrations/custom/definitions
  if (tail.length === 1 && method === "GET") return json({ items });
  // DELETE /v1/integrations/custom/definitions/:slug
  if (tail.length === 2 && method === "DELETE") {
    return state.removeCustomIntegration(tail[1] ?? "")
      ? json({ ok: true })
      : json({ error: "not found", code: "not_found" }, 404);
  }
  // POST /v1/integrations/custom/definitions/:slug/credential
  if (tail.length === 3 && tail[2] === "credential" && method === "POST") {
    const view = state.setCustomCredential(tail[1] ?? "");
    return view
      ? json(view)
      : json({ error: "not found", code: "not_found" }, 404);
  }
  return json({ error: "not found" }, 404);
}

function handleIntegrations(
  method: string,
  segs: string[],
  body: Record<string, unknown> | undefined,
): Response {
  if (state.integrationsMode() === "unavailable") return unavailable();
  const rest = segs.slice(2); // after ["v1","integrations"]
  // GET /v1/integrations — readiness list
  if (rest.length === 0) {
    if (method !== "GET") return json({ error: "not found" }, 404);
    return json({ items: state.integrationStatus() });
  }
  if (rest[0] === "custom") return handleCustom(method, rest.slice(1), body);
  // Mode `absent` = Composio not registered at all → its subroutes 404, the
  // same answer the real registry gives for an unknown provider id.
  if (rest[0] !== "composio" || state.integrationsMode() === "absent") {
    return json({ error: "not found" }, 404);
  }
  return handleComposio(method, rest.slice(1), body);
}

function handlePreference(
  method: string,
  key: string,
  body: Record<string, unknown> | undefined,
): Response {
  if (method === "GET") return json({ value: state.getPreference(key) });
  if (method === "PUT") {
    const value =
      body?.value === null || body?.value === undefined
        ? null
        : String(body.value);
    state.setPreference(key, value);
    return json({ value });
  }
  return json({ error: "not found" }, 404);
}

/** Route a user-scoped gateway request, or return `undefined` to fall through. */
export function handleUserRoutes(
  method: string,
  segs: string[],
  body: Record<string, unknown> | undefined,
): Response | undefined {
  // Per-agent custom-integration surface (HOU-823), BOTH forms like
  // action-approvals: `/v1/agents/:id/integrations/custom/*` and the dispatch
  // `/agents/:id/integrations/custom/*` — the one form the hosted gateway
  // proxies to a pod, so the shipped in-chat credential card calls it. Same
  // user-global data as the top-level routes; the agent id only routes.
  const rel = segs[0] === "v1" ? segs.slice(1) : segs;
  if (
    rel[0] === "agents" &&
    rel.length >= 5 &&
    rel[2] === "integrations" &&
    rel[3] === "custom"
  ) {
    if (state.integrationsMode() === "unavailable") return unavailable();
    return handleCustom(method, rel.slice(4), body);
  }
  // /v1/integrations[/composio/...]
  if (segs[0] === "v1" && segs[1] === "integrations") {
    return handleIntegrations(method, segs, body);
  }
  // /v1/preferences/:key
  if (segs[0] === "v1" && segs[1] === "preferences" && segs.length === 3) {
    return handlePreference(method, segs[2], body);
  }
  // GET /v1/workspaces · PATCH /v1/workspaces/:id (locale)
  if (segs[0] === "v1" && segs[1] === "workspaces") {
    if (segs.length === 2 && method === "GET") return json(workspacesList());
    if (segs.length === 3 && method === "PATCH") {
      // Tolerate an armed team id too (a team-space locale write must not 4xx);
      // locale state is single-tenant, so a team PATCH echoes its own row.
      if (!state.isKnownWorkspace(segs[2], SEED_WORKSPACE_ID)) {
        return json({ error: "workspace not found" }, 404);
      }
      if (segs[2] === SEED_WORKSPACE_ID && body && "locale" in body) {
        state.setPreference(
          "locale",
          body.locale === null ? null : String(body.locale),
        );
      }
      const team = state.getTeamWorkspaces().find((w) => w.id === segs[2]);
      return json(team ? teamWorkspaceWire(team) : workspaceWire());
    }
    // GET/PUT /v1/workspaces/:id/sidebar-layout — the sidebar's order + grouping.
    if (
      segs.length === 4 &&
      segs[3] === "sidebar-layout" &&
      (method === "GET" || method === "PUT")
    ) {
      if (!state.isKnownWorkspace(segs[2], SEED_WORKSPACE_ID)) {
        return json({ error: "workspace not found" }, 404);
      }
      if (method === "GET") return json(state.getSidebarLayout(segs[2]));
      // PUT: validate strictly with the real host's guard before persisting —
      // a bad body is a clean 400, never a swallowed accept that writes garbage.
      const layout = parseSidebarLayout(body);
      if (!layout) return json({ error: "invalid sidebar layout" }, 400);
      state.setSidebarLayout(segs[2], layout);
      return json(layout);
    }
  }
  return undefined;
}
