import { parseSidebarLayout } from "@houston/protocol";
import { SEED_WORKSPACE_ID } from "./config";
import { json } from "./http";
import { handleCustom } from "./routes-custom-integrations";
import { handlePreference } from "./routes-preferences";
import * as state from "./state";

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

function workspacesList() {
  return [workspaceWire(), ...state.getTeamWorkspaces().map(teamWorkspaceWire)];
}

function unavailable(): Response {
  return json({ error: "integrations not configured" }, 503);
}

function handleComposio(
  method: string,
  tail: string[],
  body: Record<string, unknown> | undefined,
): Response {
  if (tail.length === 1 && tail[0] === "toolkits" && method === "GET") {
    return json({ items: state.listToolkits() });
  }
  if (tail.length === 1 && tail[0] === "connections" && method === "GET") {
    return json({ items: state.listConnections() });
  }
  if (tail.length === 2 && tail[0] === "connections" && method === "GET") {
    const conn = state.getConnection(tail[1]);
    return conn ? json(conn) : json({ error: "connection not found" }, 404);
  }
  if (tail.length === 1 && tail[0] === "connect" && method === "POST") {
    const toolkit = String(body?.toolkit ?? "");
    if (!toolkit) return json({ error: "missing toolkit" }, 400);
    return json(state.connect(toolkit));
  }
  if (tail.length === 1 && tail[0] === "disconnect" && method === "POST") {
    const toolkit = String(body?.toolkit ?? "");
    if (!toolkit) return json({ error: "missing toolkit" }, 400);
    const connectionId =
      typeof body?.connectionId === "string" && body.connectionId
        ? body.connectionId
        : undefined;
    state.disconnect(toolkit, connectionId);
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
  const rest = segs.slice(2);
  if (rest.length === 0) {
    if (method !== "GET") return json({ error: "not found" }, 404);
    return json({ items: state.integrationStatus() });
  }
  if (rest[0] === "custom") return handleCustom(method, rest.slice(1), body);
  if (rest[0] !== "composio" || state.integrationsMode() === "absent") {
    return json({ error: "not found" }, 404);
  }
  return handleComposio(method, rest.slice(1), body);
}

export function handleUserRoutes(
  method: string,
  segs: string[],
  body: Record<string, unknown> | undefined,
): Response | undefined {
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
  if (segs[0] === "v1" && segs[1] === "integrations") {
    return handleIntegrations(method, segs, body);
  }
  if (segs[0] === "v1" && segs[1] === "preferences" && segs.length === 3) {
    return handlePreference(method, segs[2], body);
  }
  if (segs[0] === "v1" && segs[1] === "workspaces") {
    if (segs.length === 2 && method === "GET") return json(workspacesList());
    if (segs.length === 3 && method === "PATCH") {
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
    if (
      segs.length === 4 &&
      segs[3] === "sidebar-layout" &&
      (method === "GET" || method === "PUT")
    ) {
      if (!state.isKnownWorkspace(segs[2], SEED_WORKSPACE_ID)) {
        return json({ error: "workspace not found" }, 404);
      }
      if (method === "GET") return json(state.getSidebarLayout(segs[2]));
      const layout = parseSidebarLayout(body);
      if (!layout) return json({ error: "invalid sidebar layout" }, 400);
      state.setSidebarLayout(segs[2], layout);
      return json(layout);
    }
  }
  return undefined;
}
