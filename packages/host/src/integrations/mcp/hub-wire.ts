import type { ActionResult, Connection } from "../types";
import type { McpCallResult } from "./client";

/**
 * Pure parsers for the Composio hub's meta-tool payloads (verified against the
 * live connect.composio.dev server): every meta-tool answers ONE text content
 * part holding JSON `{ data, error, successful }`. Nothing here talks to the
 * network, so the whole wire contract is node-testable.
 */

/** The names that mark an MCP server as a Composio-style hub. */
export const HUB_MANAGE = "COMPOSIO_MANAGE_CONNECTIONS";
export const HUB_SEARCH = "COMPOSIO_SEARCH_TOOLS";
export const HUB_EXECUTE = "COMPOSIO_MULTI_EXECUTE_TOOL";

export function isHubToolset(toolNames: string[]): boolean {
  const names = new Set(toolNames);
  return (
    names.has(HUB_MANAGE) && names.has(HUB_SEARCH) && names.has(HUB_EXECUTE)
  );
}

/** The `data` object of a meta-tool reply, or null when the shape is foreign. */
export function hubPayload(
  result: McpCallResult,
): Record<string, unknown> | null {
  const content = Array.isArray(result.content) ? result.content : [];
  const text = content.find(
    (p): p is { type: string; text: string } =>
      !!p &&
      typeof p === "object" &&
      p.type === "text" &&
      typeof p.text === "string",
  )?.text;
  if (!text) return null;
  try {
    const parsed: unknown = JSON.parse(text);
    if (!parsed || typeof parsed !== "object") return null;
    const data = (parsed as { data?: unknown }).data;
    return data && typeof data === "object"
      ? (data as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

/** Per-toolkit connection state from a MANAGE_CONNECTIONS list/add reply. */
export interface HubToolkitState {
  toolkit: string;
  /** "active" | "initiated" | anything else the hub says. */
  status: string;
  accountIds: string[];
  /** Present on "add": where the user's browser authorizes the app. */
  redirectUrl?: string;
}

export function manageResults(
  data: Record<string, unknown> | null,
): HubToolkitState[] {
  const results = data?.results;
  if (!results || typeof results !== "object") return [];
  const out: HubToolkitState[] = [];
  for (const [toolkit, raw] of Object.entries(
    results as Record<string, unknown>,
  )) {
    if (!raw || typeof raw !== "object") continue;
    const entry = raw as {
      status?: unknown;
      redirect_url?: unknown;
      accounts?: unknown;
    };
    const accounts = Array.isArray(entry.accounts) ? entry.accounts : [];
    out.push({
      toolkit,
      status: typeof entry.status === "string" ? entry.status : "unknown",
      accountIds: accounts.flatMap((a) =>
        a &&
        typeof a === "object" &&
        typeof (a as { id?: unknown }).id === "string"
          ? [(a as { id: string }).id]
          : [],
      ),
      ...(typeof entry.redirect_url === "string"
        ? { redirectUrl: entry.redirect_url }
        : {}),
    });
  }
  return out;
}

/** An app connection id (`app:<toolkit>`), distinct from the hub's own `mcp:<id>`. */
export const appConnectionId = (toolkit: string) => `app:${toolkit}`;

export function toAppConnections(states: HubToolkitState[]): Connection[] {
  // Only ACTIVE states are user-visible connections: the hub reports
  // "initiated" for any toolkit with a minted-but-unfinished auth link, which
  // would otherwise litter the UI with phantom pending apps.
  return states
    .filter((s) => s.status === "active")
    .map((s) => ({
      toolkit: s.toolkit,
      connectionId: appConnectionId(s.toolkit),
      status: "active" as const,
    }));
}

/** Tool slugs (primary first, then related, deduped) from a SEARCH_TOOLS reply. */
export function searchSlugs(data: Record<string, unknown> | null): string[] {
  const results = data?.results;
  if (!Array.isArray(results)) return [];
  const slugs: string[] = [];
  for (const r of results) {
    if (!r || typeof r !== "object") continue;
    for (const key of ["primary_tool_slugs", "related_tool_slugs"] as const) {
      const list = (r as Record<string, unknown>)[key];
      if (!Array.isArray(list)) continue;
      for (const slug of list) if (typeof slug === "string") slugs.push(slug);
    }
  }
  return [...new Set(slugs)];
}

/**
 * Composio slug convention: the toolkit is a leading prefix of the tool slug.
 * A single-word toolkit is the prefix before the first "_", but multi-word
 * toolkits exist ("MICROSOFT_TEAMS_SEND_MESSAGE" → "microsoft_teams"), so when
 * known toolkit slugs are available the LONGEST matching one wins.
 */
export function toolkitOfSlug(slug: string, known: string[] = []): string {
  const lower = slug.toLowerCase();
  const match = known
    .filter((t) => lower.startsWith(`${t.toLowerCase()}_`))
    .sort((a, b) => b.length - a.length)[0];
  return match?.toLowerCase() ?? lower.split("_", 1)[0] ?? lower;
}

/** The per-tool outcome of a MULTI_EXECUTE reply, mapped onto ActionResult. */
export function executeOutcome(
  data: Record<string, unknown> | null,
  slug: string,
): ActionResult {
  const results = data?.results;
  const entry = Array.isArray(results)
    ? (results.find(
        (r) =>
          r &&
          typeof r === "object" &&
          (r as { tool_slug?: unknown }).tool_slug === slug,
      ) as Record<string, unknown> | undefined)
    : undefined;
  if (!entry)
    return { successful: false, error: "the app hub returned no result" };
  if (typeof entry.error === "string") {
    // The hub says "No active connection found for toolkit(s) 'x'" — reword so
    // the runtime's connect-card hint (/connected account|not connected/i)
    // fires and the agent offers the in-chat connect card, never a raw link.
    const missing = /no active connection/i.test(entry.error);
    return {
      successful: false,
      error: missing
        ? `${toolkitOfSlug(slug)} is not connected. ${entry.error}`
        : entry.error,
    };
  }
  const response = entry.response as
    | { successful?: unknown; data?: unknown; error?: unknown }
    | undefined;
  if (!response || typeof response !== "object") {
    return { successful: false, error: "the app hub returned no result" };
  }
  return {
    successful: response.successful === true,
    ...(response.data !== undefined ? { data: response.data } : {}),
    ...(typeof response.error === "string" ? { error: response.error } : {}),
  };
}
