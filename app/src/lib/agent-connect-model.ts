import type { OrgsList } from "@houston-ai/engine-client";
import { orgSlugFromWorkspaceId } from "./space-id.ts";

/**
 * Pure, DOM-free logic behind the Agent Settings "Use from other apps" section
 * (C10 public API): the three public addresses an external caller uses to reach
 * one hosted agent, and the org-slug resolution the A2A address needs. Kept out
 * of the `.tsx` so the URL grammar and the slug fallback unit-test under bare
 * Node. The section itself is gated on `capabilities.apiKeys` (see
 * `api-keys-model.ts` `apiKeysSupported`).
 */

/** Public developer docs (`houston/website/src/developers/*`), one page per face. */
export const DEVELOPER_DOCS = {
  overview: "https://gethouston.ai/developers",
  mcp: "https://gethouston.ai/developers/mcp",
  a2a: "https://gethouston.ai/developers/a2a",
  missions: "https://gethouston.ai/developers/missions",
} as const;

/**
 * The public addresses for one agent on the hosted gateway (C10). `a2aCard` is
 * `null` until the caller's org slug is known — the A2A path is org-scoped
 * (`/a2a/{org}/{agent}`), unlike MCP (one shared endpoint) and missions REST
 * (agent-scoped, org resolved from the bearer).
 */
export interface ConnectEndpoints {
  mcp: string;
  missions: string;
  a2aCard: string | null;
}

/**
 * Build the three public addresses from the gateway origin. On a hosted
 * deployment the agent's client-side `id` IS the gateway's stable external
 * agent slug (`cloud internal/edge/agents/routes.go` `toAgentJSON`), so the
 * caller passes `agent.id`.
 */
export function connectEndpoints(
  baseUrl: string,
  agentSlug: string,
  orgSlug: string | null,
): ConnectEndpoints {
  const base = baseUrl.replace(/\/+$/, "");
  const agent = encodeURIComponent(agentSlug);
  return {
    mcp: `${base}/mcp`,
    missions: `${base}/v1/agents/${agent}/missions`,
    a2aCard: orgSlug
      ? `${base}/a2a/${encodeURIComponent(orgSlug)}/${agent}/.well-known/agent-card.json`
      : null,
  };
}

/**
 * The org slug the public A2A path addresses for the CURRENT space: a team
 * workspace carries it in its id (`org:<slug>`); the personal space's id is
 * opaque, so the slug comes from the caller's `GET /v1/orgs` memberships
 * (`kind: "personal"`). `null` while the orgs list hasn't loaded (or on a host
 * without the spaces surface) — the caller renders the address as pending.
 */
export function connectOrgSlug(
  workspaceId: string | null | undefined,
  orgs: OrgsList | undefined,
): string | null {
  const team = workspaceId ? orgSlugFromWorkspaceId(workspaceId) : null;
  if (team) return team;
  return orgs?.orgs.find((o) => o.kind === "personal")?.slug ?? null;
}
