/**
 * User-scoped gateway state: Composio integrations and key/value preferences.
 * These mirror the cloud gateway's `/v1/integrations/*` and `/v1/preferences/:key`
 * surfaces (docs/contracts C1 + gateway `user-routes.ts`) faithfully enough for
 * the SDK's contract tests — including the 503 (unavailable) and signin readiness
 * modes.
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
import {
  type CustomIntegrationSeed,
  emitDomain,
  type IntegrationsMode,
  state,
} from "./state-store";

/**
 * A stable, well-known A-Z toolkit catalog. Kept small but large enough (15
 * apps) that a restrictive Teams allowlist over it blocks more than the locked
 * browse section's preview cap (8), so the "+N more" overflow line is
 * exercisable end to end (integrations-locked.spec.ts). Real app names so the
 * rows read like production, never machine slugs.
 *
 * Logo values deliberately cover the whole `AppLogo` resolution chain:
 * - gmail / slack / github carry tiny inline data-URI PNGs that ALWAYS load —
 *   the REAL-logo path (production serves Composio's `meta.logo` here), so
 *   specs and screenshots exercise a rendered brand image, not just fallbacks;
 * - calendly has NO `logoUrl` (the wire field is optional) — the catalog-miss
 *   fallback chain (favicon guess, then the initial letter);
 * - the rest keep unresolvable `logos.test` URLs — the img-error letter path.
 */
const LOGO_GMAIL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAIAAACQkWg2AAAAG0lEQVR42mN45WxKEmIYhhr+Y4BRDcMzpgkiAFP1m9z5/ek5AAAAAElFTkSuQmCC";
const LOGO_SLACK =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAIAAACQkWg2AAAAHUlEQVR42mPwEvUmCTEMQw1vNumhoVENwzOmCSIA8grSyQSoPi4AAAAASUVORK5CYII=";
const LOGO_GITHUB =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAIAAACQkWg2AAAAG0lEQVR42mNQ0dQnCTEMQw3/McCohuEZ0wQRAPPl1iUMOIVxAAAAAElFTkSuQmCC";

export const SEED_TOOLKITS: IntegrationToolkit[] = [
  {
    slug: "airtable",
    name: "Airtable",
    description: "Spreadsheet-database hybrid",
    logoUrl: "https://logos.test/airtable.png",
    categories: ["productivity"],
  },
  {
    slug: "asana",
    name: "Asana",
    description: "Tasks and projects",
    logoUrl: "https://logos.test/asana.png",
    categories: ["productivity"],
  },
  {
    slug: "calendly",
    name: "Calendly",
    description: "Scheduling and bookings",
    categories: ["productivity"],
  },
  {
    slug: "discord",
    name: "Discord",
    description: "Community chat",
    logoUrl: "https://logos.test/discord.png",
    categories: ["communication"],
  },
  {
    slug: "dropbox",
    name: "Dropbox",
    description: "File storage and sharing",
    logoUrl: "https://logos.test/dropbox.png",
    categories: ["productivity"],
  },
  {
    slug: "github",
    name: "GitHub",
    description: "Issues, PRs, and repos",
    logoUrl: LOGO_GITHUB,
    categories: ["developer-tools"],
  },
  {
    slug: "gmail",
    name: "Gmail",
    description: "Send and read email",
    logoUrl: LOGO_GMAIL,
    categories: ["productivity"],
  },
  {
    slug: "hubspot",
    name: "HubSpot",
    description: "CRM and marketing",
    logoUrl: "https://logos.test/hubspot.png",
    categories: ["sales"],
  },
  {
    slug: "jira",
    name: "Jira",
    description: "Issue and sprint tracking",
    logoUrl: "https://logos.test/jira.png",
    categories: ["developer-tools"],
  },
  {
    slug: "linear",
    name: "Linear",
    description: "Issue tracking for software teams",
    logoUrl: "https://logos.test/linear.png",
    categories: ["developer-tools"],
  },
  {
    slug: "notion",
    name: "Notion",
    description: "Docs and wikis",
    logoUrl: "https://logos.test/notion.png",
    categories: ["productivity"],
  },
  {
    slug: "salesforce",
    name: "Salesforce",
    description: "Enterprise CRM",
    logoUrl: "https://logos.test/salesforce.png",
    categories: ["sales"],
  },
  {
    slug: "slack",
    name: "Slack",
    description: "Team messaging",
    logoUrl: LOGO_SLACK,
    categories: ["communication"],
  },
  {
    slug: "trello",
    name: "Trello",
    description: "Kanban boards",
    logoUrl: "https://logos.test/trello.png",
    categories: ["productivity"],
  },
  {
    slug: "zoom",
    name: "Zoom",
    description: "Video meetings",
    logoUrl: "https://logos.test/zoom.png",
    categories: ["communication"],
  },
];

/** Every seeded toolkit slug, A-Z — handy for specs arming allowlists. */
export const SEED_TOOLKIT_SLUGS: string[] = SEED_TOOLKITS.map((t) => t.slug);

export function integrationsMode(): IntegrationsMode {
  return state.integrationsMode;
}

export function setIntegrationsMode(mode: IntegrationsMode): void {
  state.integrationsMode = mode;
}

/** The readiness list the gateway serves at `GET /v1/integrations`. */
export function integrationStatus(): IntegrationProviderStatus[] {
  const items: IntegrationProviderStatus[] = [];
  // `absent` models a host with no Composio registered at all — the list
  // simply omits it (its subroutes 404), unlike `unavailable` which 503s.
  if (state.integrationsMode !== "absent") {
    const ready = state.integrationsMode === "ready";
    const status: IntegrationProviderStatus = { provider: "composio", ready };
    if (state.integrationsMode === "signin") status.reason = "signin";
    items.push(status);
  }
  // The key-free custom provider (HOU-550) is ready whenever it is armed.
  if (state.customIntegrations !== null) {
    items.push({ provider: "custom", ready: true });
  }
  return items;
}

// ── Custom integrations (HOU-550) — /v1/integrations/custom/definitions ─────

/** Arm (or disarm with `null`) the custom provider + its definition list. */
export function setCustomIntegrations(
  items: CustomIntegrationSeed[] | null,
): void {
  state.customIntegrations = items;
  emitDomain("CustomIntegrationsChanged");
}

/** The definitions list, or `null` when the feature is not served (404). */
export function listCustomIntegrations(): CustomIntegrationSeed[] | null {
  return state.customIntegrations;
}

export function removeCustomIntegration(slug: string): boolean {
  if (!state.customIntegrations) return false;
  const before = state.customIntegrations.length;
  state.customIntegrations = state.customIntegrations.filter(
    (i) => i.slug !== slug,
  );
  emitDomain("CustomIntegrationsChanged");
  return state.customIntegrations.length < before;
}

/** Model a saved credential: the pending definition flips to active. */
export function setCustomCredential(
  slug: string,
): CustomIntegrationSeed | null {
  const item = state.customIntegrations?.find((i) => i.slug === slug);
  if (!item) return null;
  item.state = { status: "active", toolCount: 3 };
  emitDomain("CustomIntegrationsChanged");
  return item;
}

/** Deterministic detect for `POST /v1/integrations/custom/detect` (HOU-980):
 *  "mcp" in the URL → an MCP probe hit ("oauth" too → an OAuth-walled one),
 *  "unknown" → unrecognizable, anything else → an OpenAPI document. Mirrors
 *  the real host's result shape. */
export function detectCustomIntegration(url: string): Record<string, unknown> {
  if (url.includes("unknown")) return { kind: "unknown" };
  if (url.includes("oauth")) {
    return {
      kind: "mcp",
      name: "Acme MCP",
      suggestedSlug: "acme-mcp",
      requiresAuthentication: true,
      requiresOAuth: true,
    };
  }
  if (url.includes("mcp")) {
    return {
      kind: "mcp",
      name: "Acme MCP",
      suggestedSlug: "acme-mcp",
      requiresAuthentication: false,
      toolCount: 2,
    };
  }
  return { kind: "openapi", name: "Acme API", suggestedSlug: "acme-api" };
}

const TOKEN_METHOD = {
  template: "api_key",
  label: "API key",
  fields: [{ variable: "token", label: "API key" }],
};

/** Register a definition from the manual add form (HOU-980). Returns `null`
 *  for a duplicate slug (the route answers the real host's 409). */
export function addCustomIntegration(input: {
  kind: "openapi" | "mcp";
  name: string;
  auth: "none" | "credential";
  url?: string;
  endpoint?: string;
  slug?: string;
}): CustomIntegrationSeed | null {
  if (!state.customIntegrations) return null;
  const slug =
    input.slug ??
    input.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  if (state.customIntegrations.some((i) => i.slug === slug)) return null;
  const displayUrl = input.kind === "mcp" ? input.endpoint : input.url;
  const seed: CustomIntegrationSeed = {
    slug,
    name: input.name,
    kind: input.kind,
    ...(displayUrl ? { displayUrl } : {}),
    addedAtMs: Date.now(),
    state:
      input.auth === "credential"
        ? { status: "pending", authMethods: [TOKEN_METHOD] }
        : { status: "active", toolCount: 3 },
    ...(input.auth === "credential" ? { authMethods: [TOKEN_METHOD] } : {}),
  };
  state.customIntegrations.push(seed);
  emitDomain("CustomIntegrationsChanged");
  return seed;
}

/** The compiled tools for the detail card (HOU-980): the seed's own list, or
 *  a generated `action_N` list sized to the active toolCount. */
export function listCustomTools(
  slug: string,
): { name: string; description?: string }[] | null {
  const item = state.customIntegrations?.find((i) => i.slug === slug);
  if (!item) return null;
  if (item.tools) return item.tools;
  if (item.state.status !== "active") return [];
  return Array.from({ length: item.state.toolCount }, (_, i) => ({
    name: `action_${i + 1}`,
  }));
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

/**
 * Seed one connection at a given status outright — the at-rest states a real
 * OAuth leaves behind and a spec cannot reach by clicking: `pending` (the user
 * walked away mid sign-in) and `error` (the provider refused). Re-statuses the
 * toolkit's existing connection when it has one, so a spec can also BREAK the
 * seeded active connection — UNLESS `extraAccount` is set, which always mints
 * a NEW connection so a spec can stack several accounts on one toolkit (two
 * Gmail logins, HOU-901). `accountLabel` stamps the account's human identity
 * (the email/workspace a real provider derives). Returns the connection.
 */
export function seedConnection(
  toolkit: string,
  status: IntegrationConnection["status"],
  opts?: { accountLabel?: string; extraAccount?: boolean },
): IntegrationConnection {
  const existing = opts?.extraAccount
    ? undefined
    : [...state.connections.values()].find((c) => c.toolkit === toolkit);
  const connection: IntegrationConnection = {
    toolkit,
    connectionId:
      existing?.connectionId ?? `conn-${toolkit}-${state.connSeq++}`,
    status,
    ...(opts?.accountLabel ? { accountLabel: opts.accountLabel } : {}),
  };
  state.connections.set(connection.connectionId, connection);
  return connection;
}

/** Flip a pending connection to active (models the OAuth completing). */
export function activateConnection(id: string): boolean {
  const conn = state.connections.get(id);
  if (!conn) return false;
  state.connections.set(id, { ...conn, status: "active" });
  return true;
}

/** Disconnect a toolkit everywhere — or, with `connectionId`, just that ONE
 *  account of it (a toolkit can hold several — two Gmail logins). */
export function disconnect(toolkit: string, connectionId?: string): void {
  for (const [id, conn] of state.connections) {
    if (connectionId ? id === connectionId : conn.toolkit === toolkit) {
      state.connections.delete(id);
    }
  }
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
