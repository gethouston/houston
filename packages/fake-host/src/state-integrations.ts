import type { SidebarLayout } from "@houston/protocol";
import { DEFAULT_SIDEBAR_LAYOUT } from "@houston/protocol";
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

export const SEED_TOOLKIT_SLUGS: string[] = SEED_TOOLKITS.map((t) => t.slug);

export function integrationsMode(): IntegrationsMode {
  return state.integrationsMode;
}

export function setIntegrationsMode(mode: IntegrationsMode): void {
  state.integrationsMode = mode;
}

export function integrationStatus(): IntegrationProviderStatus[] {
  const items: IntegrationProviderStatus[] = [];
  if (state.integrationsMode !== "absent") {
    const ready = state.integrationsMode === "ready";
    const status: IntegrationProviderStatus = { provider: "composio", ready };
    if (state.integrationsMode === "signin") status.reason = "signin";
    items.push(status);
  }
  if (state.customIntegrations !== null) {
    items.push({ provider: "custom", ready: true });
  }
  return items;
}

export function setCustomIntegrations(
  items: CustomIntegrationSeed[] | null,
): void {
  state.customIntegrations = items;
  emitDomain("CustomIntegrationsChanged");
}

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

export function setCustomCredential(
  slug: string,
): CustomIntegrationSeed | null {
  const item = state.customIntegrations?.find((i) => i.slug === slug);
  if (!item) return null;
  item.state = { status: "active", toolCount: 3 };
  emitDomain("CustomIntegrationsChanged");
  return item;
}

export function detectCustomIntegration(url: string): Record<string, unknown> {
  if (url.includes("unknown")) return { kind: "unknown" };
  if (url.includes("oauth")) {
    return {
      kind: "mcp",
      name: "Acme MCP",
      suggestedSlug: "acme-mcp",
      requiresAuthentication: true,
      requiresOAuth: true,
      oauthSupported: !url.includes("no-signin"),
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

function faviconOf(url: string | undefined): string | undefined {
  if (!url) return undefined;
  try {
    const host = new URL(url).hostname;
    if (!host.includes(".")) return undefined;
    return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=128`;
  } catch {
    return undefined;
  }
}

export function addCustomIntegration(input: {
  kind: "openapi" | "mcp";
  name: string;
  auth: "none" | "credential" | "oauth";
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
  const iconUrl = faviconOf(displayUrl);
  const seed: CustomIntegrationSeed = {
    slug,
    name: input.name,
    kind: input.kind,
    auth: input.auth,
    ...(displayUrl ? { displayUrl } : {}),
    ...(iconUrl ? { iconUrl } : {}),
    addedAtMs: Date.now(),
    state:
      input.auth === "none"
        ? { status: "active", toolCount: 3 }
        : { status: "pending", authMethods: [TOKEN_METHOD] },
    ...(input.auth !== "none" ? { authMethods: [TOKEN_METHOD] } : {}),
  };
  state.customIntegrations.push(seed);
  emitDomain("CustomIntegrationsChanged");
  return seed;
}

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

export function activateConnection(id: string): boolean {
  const conn = state.connections.get(id);
  if (!conn) return false;
  state.connections.set(id, { ...conn, status: "active" });
  return true;
}

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
  emitDomain("PreferencesChanged");
}

export function getSidebarLayout(workspaceId: string): SidebarLayout {
  return state.sidebarLayouts.get(workspaceId) ?? DEFAULT_SIDEBAR_LAYOUT;
}

export function setSidebarLayout(
  workspaceId: string,
  layout: SidebarLayout,
): void {
  state.sidebarLayouts.set(workspaceId, layout);
  emitDomain("SidebarLayoutChanged");
}
