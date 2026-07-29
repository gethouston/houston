import type { ActionResult, Connection, Toolkit, ToolMatch } from "./types";

/**
 * Composio wire shapes + their mapping onto the port types — the ONLY place
 * Composio's response format is known. The adapter (composio.ts) shapes the
 * requests; this module reads the replies.
 */

export interface RawAuthConfig {
  id?: string;
  status?: string;
}
type RawCategory = string | { id?: string; name?: string };

export interface RawToolkit {
  slug?: string;
  name?: string;
  // Composio nests categories under `meta.categories` as { id, name } objects
  // (the top-level `categories` is null on the list endpoint).
  meta?: { description?: string; logo?: string; categories?: RawCategory[] };
  description?: string;
  logo_url?: string;
  categories?: RawCategory[];
  /** True for toolkits with no auth at all (Composio's own meta-toolkit,
   *  hackernews…) — nothing to connect, so they never enter the catalog. */
  no_auth?: boolean;
}
export interface RawConnection {
  toolkit?: { slug?: string } | string;
  slug?: string;
  connected_account_id?: string;
  id?: string;
  status?: string;
  /** The Composio user this account belongs to — the ownership guard's input. */
  user_id?: string;
  created_at?: string;
  /**
   * The auth payload Composio stores per connected account. Mostly tokens
   * (never surfaced), but for many apps it also carries the ONE human hint of
   * which account this is: an OIDC `id_token` whose claims name the email
   * (every Google app, LinkedIn, Discord…), Notion's `workspace_name`, Jira's
   * `subdomain`. accountLabelOf() reads only those identity hints.
   */
  data?: Record<string, unknown>;
}
export interface RawTool {
  slug?: string;
  name?: string;
  toolkit?: { slug?: string } | string;
  description?: string;
  input_parameters?: unknown;
}
export interface RawExecute {
  successful?: boolean;
  success?: boolean;
  data?: unknown;
  error?: string | null;
}

export function mapToolkit(t: RawToolkit): Toolkit {
  return {
    slug: t.slug ?? "",
    name: t.name ?? t.slug ?? "",
    description: t.meta?.description ?? t.description,
    logoUrl: t.meta?.logo ?? t.logo_url,
    ...(t.no_auth ? { noAuth: true } : {}),
    // Prefer the category `id` (kebab-case, e.g. "developer-tools") — the UI's
    // categoryLabel() turns it into a display label. Fall back to name, then to
    // the top-level field for any provider shape that populates it.
    categories: (t.meta?.categories ?? t.categories ?? [])
      .map((c) => (typeof c === "string" ? c : (c.id ?? c.name ?? "")))
      .filter(Boolean),
  };
}

export function mapConnection(c: RawConnection): Connection {
  const toolkit =
    typeof c.toolkit === "string"
      ? c.toolkit
      : (c.toolkit?.slug ?? c.slug ?? "");
  const accountLabel = accountLabelOf(c.data);
  return {
    toolkit,
    connectionId: c.connected_account_id ?? c.id ?? "",
    status: mapStatus(c.status),
    ...(accountLabel ? { accountLabel } : {}),
    ...(typeof c.created_at === "string" ? { createdAt: c.created_at } : {}),
  };
}

/** A display label must be a short human string, never a leaked token — a JWT
 *  or an API key would be hundreds of opaque chars, so length-cap hard. */
const MAX_LABEL_LENGTH = 100;

function asLabel(v: unknown): string | undefined {
  if (typeof v !== "string") return undefined;
  const s = v.trim();
  return s.length > 0 && s.length <= MAX_LABEL_LENGTH ? s : undefined;
}

/**
 * The account's human identity, from the identity hints Composio's auth payload
 * carries (verified against the live prod data 2026-07-28):
 *  - an OIDC `id_token` → its `email` (or `name`) claim — every Google app,
 *    LinkedIn, Discord, Granola;
 *  - `workspace_name` — Notion;
 *  - `subdomain` — Jira, SharePoint;
 *  - a literal `email` field, for any connector that exposes one.
 * Anything else (plain OAuth2 apps, API keys) has no usable identity →
 * undefined, and the UI falls back to the connection date. Never throws: a
 * malformed payload just yields no label.
 */
export function accountLabelOf(
  data: Record<string, unknown> | undefined,
): string | undefined {
  if (!data) return undefined;
  const claims = decodeJwtClaims(data.id_token);
  return (
    asLabel(claims?.email) ??
    asLabel(claims?.name) ??
    asLabel(data.email) ??
    asLabel(data.workspace_name) ??
    asLabel(data.subdomain)
  );
}

/**
 * Best-effort decode of a JWT's claims — display only, no verification needed:
 * the token came from Composio over TLS and we read a label from it, we never
 * trust it for auth. Any malformed input → undefined.
 */
function decodeJwtClaims(
  token: unknown,
): { email?: unknown; name?: unknown } | undefined {
  if (typeof token !== "string") return undefined;
  const payload = token.split(".")[1];
  if (!payload) return undefined;
  try {
    const json = Buffer.from(payload, "base64url").toString("utf8");
    const claims: unknown = JSON.parse(json);
    return claims && typeof claims === "object"
      ? (claims as { email?: unknown; name?: unknown })
      : undefined;
  } catch {
    return undefined;
  }
}

/** Composio's connected-account statuses → the port's three. */
function mapStatus(status?: string): Connection["status"] {
  switch (status?.toUpperCase()) {
    case "ACTIVE":
      return "active";
    case "INITIALIZING":
    case "INITIATED":
      return "pending";
    default:
      // FAILED / EXPIRED / INACTIVE / REVOKED / unknown — needs reconnecting.
      return "error";
  }
}

export function mapTool(t: RawTool): ToolMatch {
  const toolkit =
    typeof t.toolkit === "string" ? t.toolkit : (t.toolkit?.slug ?? "");
  return {
    action: t.slug ?? "",
    toolkit,
    description: t.description ?? "",
    inputParams: t.input_parameters,
  };
}

export function mapExecute(r: RawExecute | null): ActionResult {
  if (!r) return { successful: false, error: "empty response" };
  const successful = r.successful ?? r.success ?? !r.error;
  return { successful, data: r.data, error: r.error ?? undefined };
}
