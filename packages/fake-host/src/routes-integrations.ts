/**
 * User-scoped gateway routes for the fake host: Composio integrations, per-agent
 * integration grants, key/value preferences, and the workspace-locale override.
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

/** The workspace wire shape the gateway/host return (account.ts `toWire`). */
function workspaceWire() {
  return {
    id: SEED_WORKSPACE_ID,
    name: SEED_WORKSPACE_ID,
    isDefault: true,
    createdAt: new Date(0).toISOString(),
    locale: state.getPreference("locale"),
  };
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
  if (rest[0] !== "composio") return json({ error: "not found" }, 404);
  return handleComposio(method, rest.slice(1), body);
}

function handleGrants(
  method: string,
  agentSlug: string,
  body: Record<string, unknown> | undefined,
): Response {
  if (state.integrationsMode() === "unavailable") return unavailable();
  if (method === "GET") {
    const toolkits = state.getGrants(agentSlug);
    // Missing record → 404 (client degrades to null); a present record (even
    // []) → `{toolkits}`. This is the null-vs-[] distinction, end to end.
    return toolkits === undefined
      ? json({ error: "not found" }, 404)
      : json({ toolkits });
  }
  if (method === "PUT") {
    const raw = Array.isArray(body?.toolkits) ? body.toolkits : null;
    if (!raw?.every((t): t is string => typeof t === "string")) {
      return json({ error: "toolkits must be an array of strings" }, 400);
    }
    state.setGrants(agentSlug, raw);
    return json({ ok: true });
  }
  return json({ error: "not found" }, 404);
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
  // /v1/integrations[/composio/...]
  if (segs[0] === "v1" && segs[1] === "integrations") {
    return handleIntegrations(method, segs, body);
  }
  // /v1/agents/:slug/integration-grants
  if (
    segs[0] === "v1" &&
    segs[1] === "agents" &&
    segs.length === 4 &&
    segs[3] === "integration-grants"
  ) {
    return handleGrants(method, segs[2], body);
  }
  // /v1/preferences/:key
  if (segs[0] === "v1" && segs[1] === "preferences" && segs.length === 3) {
    return handlePreference(method, segs[2], body);
  }
  // GET /v1/workspaces · PATCH /v1/workspaces/:id (locale)
  if (segs[0] === "v1" && segs[1] === "workspaces") {
    if (segs.length === 2 && method === "GET") return json([workspaceWire()]);
    if (segs.length === 3 && method === "PATCH") {
      if (segs[2] !== SEED_WORKSPACE_ID) {
        return json({ error: "workspace not found" }, 404);
      }
      if (body && "locale" in body) {
        state.setPreference(
          "locale",
          body.locale === null ? null : String(body.locale),
        );
      }
      return json(workspaceWire());
    }
    // GET/PUT /v1/workspaces/:id/sidebar-layout — the sidebar's order + grouping.
    if (
      segs.length === 4 &&
      segs[3] === "sidebar-layout" &&
      (method === "GET" || method === "PUT")
    ) {
      if (segs[2] !== SEED_WORKSPACE_ID) {
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
