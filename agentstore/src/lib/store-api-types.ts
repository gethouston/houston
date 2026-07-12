/**
 * Shared types and helpers for talking to the Houston gateway's Agent Store API
 * (`/v1/agentstore/*`). The Next frontend is a pure SSR client of that Go API:
 * server components read the public catalog through `store-api.ts`, client
 * components make authed/anonymous mutations through `store-client.ts`. Both
 * import their wire types and error mapping from here.
 *
 * This module is client-safe (no `server-only`, no Node built-ins) so the browser
 * bundle can reuse the types and the `StoreApiError` mapping.
 */
import type { AgentIdentity, AgentIR } from "@houston/agentstore-contract";

/** The Agent Store API path prefix on the gateway. */
export const STORE_API_PREFIX = "/v1/agentstore";

/** Default gateway origin when no env override is set. */
const DEFAULT_GATEWAY_URL = "https://gateway.gethouston.ai";

/** Trim a base URL of trailing slashes so `${base}${STORE_API_PREFIX}` is clean. */
function trimBase(raw: string | undefined): string {
  return (raw?.trim() || DEFAULT_GATEWAY_URL).replace(/\/+$/, "");
}

/**
 * Server-side gateway base (`AGENTSTORE_GATEWAY_URL`). Read lazily per call so a
 * `next build` with no env still succeeds; the value is only needed at request
 * time. NEVER exposed to the browser.
 */
export function serverGatewayBase(): string {
  return trimBase(process.env.AGENTSTORE_GATEWAY_URL);
}

/**
 * Client-side gateway base (`NEXT_PUBLIC_AGENTSTORE_GATEWAY_URL`), inlined at
 * build time so client components can call the gateway directly with a bearer.
 */
export function clientGatewayBase(): string {
  return trimBase(process.env.NEXT_PUBLIC_AGENTSTORE_GATEWAY_URL);
}

/**
 * Public URL of the AgentIR JSON Schema, served by the gateway
 * (`GET /v1/agentstore/schema/agent`). Used for the "publish over the API" links,
 * which point browsers straight at the gateway's embedded schema.
 */
export function agentSchemaUrl(): string {
  return `${clientGatewayBase()}${STORE_API_PREFIX}/schema/agent`;
}

/** The gateway's icon shape: a single `{kind,value}` pair, or null. */
export interface StoreIcon {
  kind: "emoji" | "url";
  value: string;
}

/** Publish state of an agent, mirrored from the gateway's `store_agents.state`. */
export type AgentState = "draft" | "published" | "archived";

/** Visibility of an agent, mirrored from `store_agents.visibility`. */
export type AgentVisibility = "unlisted" | "public";

/** One agent as returned by every list/detail endpoint (the wire `AgentSummary`). */
export interface AgentSummary {
  id: string;
  slug: string | null;
  name: string;
  tagline: string | null;
  description: string;
  icon: StoreIcon | null;
  color: string | null;
  category: string;
  tags: string[];
  integrations: string[];
  creator: { displayName: string; url?: string };
  state: AgentState;
  visibility: AgentVisibility;
  installsCount: number;
  publishedAt: string | null;
  updatedAt: string;
}

/** A single agent page payload: the summary plus its full IR snapshot. */
export interface AgentDetail {
  agent: AgentSummary;
  ir: AgentIR;
}

/** One page of the public catalog. */
export interface CatalogPage {
  items: AgentSummary[];
  hasMore: boolean;
}

/** A category from `GET /categories`. */
export interface StoreCategory {
  slug: string;
  name: string;
}

/** Catalog list/query parameters accepted by `GET /agents`. */
export interface ListAgentsParams {
  q?: string;
  category?: string;
  integration?: string;
  sort?: "recent" | "installs";
  page?: number;
}

/** The install targets the gateway counts (`POST /agents/{slug}/installs`). */
export type InstallTarget = "claude_skill_zip" | "copy_paste" | "houston";

/**
 * A typed gateway failure. Carries the HTTP status plus the parsed `error`
 * token and a machine `code`. The Go gateway's envelope is `{ "error": token }`
 * — the machine token lives in `error` (e.g. "not_owner", "invalid_input",
 * "invalid_reason"); a separate `code` field is optional and rarely sent. So
 * `code` is derived from `error` unless an explicit `code` is present, letting
 * callers branch on `status`/`code` instead of string-matching prose.
 */
export class StoreApiError extends Error {
  readonly status: number;
  readonly code?: string;
  constructor(status: number, message: string, code?: string) {
    super(message);
    this.name = "StoreApiError";
    this.status = status;
    this.code = code;
  }
}

/**
 * Read the error envelope from a non-OK gateway response into a `StoreApiError`.
 * The machine token lives in `error`, so `code` is derived from it; an explicit
 * `code` field (rarely sent) wins when present. A non-JSON or bodyless response
 * yields a generic message keyed on the status — the failure is always
 * surfaced, never swallowed.
 */
export async function toStoreApiError(res: Response): Promise<StoreApiError> {
  const raw = await res.text();
  let message = `Gateway request failed (${res.status}).`;
  let code: string | undefined;
  if (raw) {
    try {
      const body = JSON.parse(raw) as { error?: unknown; code?: unknown };
      if (typeof body.error === "string" && body.error) {
        message = body.error;
        code = body.error;
      }
      if (typeof body.code === "string" && body.code) code = body.code;
    } catch {
      // Non-JSON error bodies (proxies, gateways) keep the status-based message.
    }
  }
  return new StoreApiError(res.status, message, code);
}

/**
 * Adapt the gateway's `{kind,value}|null` icon to the IR icon union that the
 * `AgentIcon` component renders (`{kind:"emoji",value}|{kind:"url",url}`).
 */
export function toDisplayIcon(icon: StoreIcon | null): AgentIdentity["icon"] {
  if (!icon) return undefined;
  if (icon.kind === "url") return { kind: "url", url: icon.value };
  return { kind: "emoji", value: icon.value };
}
