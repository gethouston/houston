import type { OrgsList } from "@houston/engine-adapter";
import { activeSpaceOrgSlug, HOUSTON_API_DOCS } from "@houston/sdk";
import { orgSlugFromWorkspaceId } from "./space-id.ts";

export const DEVELOPER_DOCS = HOUSTON_API_DOCS;

export interface ConnectEndpoints {
  mcp: string;
  missions: string;
  a2aCard: string | null;
}

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

export function connectOrgSlug(
  workspaceId: string | null | undefined,
  orgs: OrgsList | undefined,
): string | null {
  const team = workspaceId ? orgSlugFromWorkspaceId(workspaceId) : null;
  return activeSpaceOrgSlug(team, orgs);
}
