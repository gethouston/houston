/**
 * User-scoped gateway state: Composio integrations, per-agent grants, and
 * key/value preferences. These mirror the cloud gateway's `/v1/integrations/*`,
 * `/v1/agents/:slug/integration-grants`, and `/v1/preferences/:key` surfaces
 * (docs/contracts C1/C4 + gateway `user-routes.ts`) faithfully enough for the
 * SDK's contract tests — including the 503 (unavailable) and signin readiness
 * modes and the grants 404-vs-`[]` distinction.
 *
 * Wire shapes come from `@houston/runtime-client` so a contract change breaks
 * the typecheck here instead of silently drifting the mock.
 */

import { DEFAULT_SIDEBAR_LAYOUT } from "@houston/host/src/routes/sidebar-layout";
import type { SidebarLayout } from "@houston/protocol";
import type {
  IntegrationConnection,
  IntegrationProviderStatus,
  IntegrationToolkit,
} from "@houston/runtime-client";
import { emitDomain, type IntegrationsMode, state } from "./state-store";

/** A small, stable A-Z toolkit catalog — enough for catalog + connect flows. */
export const SEED_TOOLKITS: IntegrationToolkit[] = [
  {
    slug: "github",
    name: "GitHub",
    description: "Issues, PRs, and repos",
    logoUrl: "https://logos.test/github.png",
    categories: ["developer-tools"],
  },
  {
    slug: "gmail",
    name: "Gmail",
    description: "Send and read email",
    logoUrl: "https://logos.test/gmail.png",
    categories: ["productivity"],
  },
  {
    slug: "slack",
    name: "Slack",
    description: "Team messaging",
    logoUrl: "https://logos.test/slack.png",
    categories: ["communication"],
  },
];

export function integrationsMode(): IntegrationsMode {
  return state.integrationsMode;
}

export function setIntegrationsMode(mode: IntegrationsMode): void {
  state.integrationsMode = mode;
}

/** The readiness list the gateway serves at `GET /v1/integrations`. */
export function integrationStatus(): IntegrationProviderStatus[] {
  const ready = state.integrationsMode === "ready";
  const status: IntegrationProviderStatus = { provider: "composio", ready };
  if (state.integrationsMode === "signin") status.reason = "signin";
  return [status];
}

export function listToolkits(): IntegrationToolkit[] {
  return SEED_TOOLKITS;
}

export function listConnections(): IntegrationConnection[] {
  return [...state.connections.values()];
}

export function getConnection(id: string): IntegrationConnection | undefined {
  return state.connections.get(id);
}

/** Start an OAuth connect: mint a PENDING connection, return the link + id. */
export function connect(toolkit: string): {
  redirectUrl: string;
  connectionId: string;
} {
  const connectionId = `conn-${toolkit}-${state.connSeq++}`;
  state.connections.set(connectionId, {
    toolkit,
    connectionId,
    status: "pending",
  });
  return { redirectUrl: `https://connect.test/${toolkit}`, connectionId };
}

/** Flip a pending connection to active (models the OAuth completing). */
export function activateConnection(id: string): boolean {
  const conn = state.connections.get(id);
  if (!conn) return false;
  state.connections.set(id, { ...conn, status: "active" });
  return true;
}

/** Disconnect a toolkit everywhere: drop all of its connections. */
export function disconnect(toolkit: string): void {
  for (const [id, conn] of state.connections) {
    if (conn.toolkit === toolkit) state.connections.delete(id);
  }
}

/** Grants for an agent, or `undefined` when NO record exists (→ route 404). */
export function getGrants(agentId: string): string[] | undefined {
  return state.grants.get(agentId);
}

/** Replace an agent's grant record (creating it if absent). */
export function setGrants(agentId: string, toolkits: string[]): void {
  state.grants.set(agentId, [...toolkits]);
}

export function getPreference(key: string): string | null {
  return state.preferences.get(key) ?? null;
}

export function setPreference(key: string, value: string | null): void {
  if (value === null) state.preferences.delete(key);
  else state.preferences.set(key, value);
}

/** A workspace's stored sidebar layout, or the default when unset (GET). */
export function getSidebarLayout(workspaceId: string): SidebarLayout {
  return state.sidebarLayouts.get(workspaceId) ?? DEFAULT_SIDEBAR_LAYOUT;
}

/** Persist a validated layout and fan out `SidebarLayoutChanged` (PUT). */
export function setSidebarLayout(
  workspaceId: string,
  layout: SidebarLayout,
): void {
  state.sidebarLayouts.set(workspaceId, layout);
  emitDomain("SidebarLayoutChanged");
}
