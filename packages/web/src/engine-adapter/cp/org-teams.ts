import type {
  AgentTeam,
  AgentTeamMember,
} from "../../../../../ui/engine-client/src/types";
import { type ControlPlaneConfig, cpFetch } from "./fetch";

/**
 * C13 agent teams: named groups of agents and people INSIDE one space,
 * server-owned. Distinct from `cp/agent-teams.ts`, which is the per-AGENT
 * settings surface (assignments, model choice) and shares only a name.
 *
 * NOTHING here degrades on a 404. Callers feature-detect on
 * `capabilities.agentTeams` before they ever reach this module, so a 404 means
 * the host advertised a surface it does not serve — and swallowing it would
 * blank the whole rail while presenting "you have no teams" as the truth.
 * Every failure surfaces as a {@link HoustonEngineError} from `cpFetch`.
 */

/** The active space's teams, as the CALLER sees them (`joined`/`owner`/
 *  `memberCount` are effective values resolved server-side). */
export async function listAgentTeams(
  cfg: ControlPlaneConfig,
): Promise<AgentTeam[]> {
  const res = await cpFetch(cfg, "/v1/org/teams");
  return ((await res.json()) as { teams?: AgentTeam[] }).teams ?? [];
}

/** Create a team with the typed name; the creator becomes its owner. */
export async function createAgentTeam(
  cfg: ControlPlaneConfig,
  name: string,
): Promise<AgentTeam> {
  const res = await cpFetch(cfg, "/v1/org/teams", {
    method: "POST",
    body: JSON.stringify({ name }),
  });
  return (await res.json()) as AgentTeam;
}

/** Rename or reorder a team. Partial: an omitted field is left untouched, so
 *  forwarding only what the caller set is the whole contract. */
export async function updateAgentTeam(
  cfg: ControlPlaneConfig,
  teamId: string,
  patch: { name?: string; sortOrder?: number },
): Promise<AgentTeam> {
  const res = await cpFetch(
    cfg,
    `/v1/org/teams/${encodeURIComponent(teamId)}`,
    { method: "PATCH", body: JSON.stringify(patch) },
  );
  return (await res.json()) as AgentTeam;
}

/** Delete a team; its agents fall back to the default one. */
export async function deleteAgentTeam(
  cfg: ControlPlaneConfig,
  teamId: string,
): Promise<void> {
  await cpFetch(cfg, `/v1/org/teams/${encodeURIComponent(teamId)}`, {
    method: "DELETE",
  });
}

/** One team's EXPLICIT membership rows. Implicit owners (org owners/admins own
 *  every team) are a permission rule, not a roster entry, and are absent here. */
export async function listAgentTeamMembers(
  cfg: ControlPlaneConfig,
  teamId: string,
): Promise<AgentTeamMember[]> {
  const res = await cpFetch(
    cfg,
    `/v1/org/teams/${encodeURIComponent(teamId)}/members`,
  );
  return ((await res.json()) as { members?: AgentTeamMember[] }).members ?? [];
}

/** Self-service join (v1 teams are all public). Idempotent, never demotes. */
export async function joinAgentTeam(
  cfg: ControlPlaneConfig,
  teamId: string,
): Promise<void> {
  await cpFetch(cfg, `/v1/org/teams/${encodeURIComponent(teamId)}/join`, {
    method: "POST",
  });
}

/** Drop a membership row: self is a leave, an owner acting on someone else is
 *  a remove. Idempotent, so a double-click cannot 404. */
export async function removeAgentTeamMember(
  cfg: ControlPlaneConfig,
  teamId: string,
  userId: string,
): Promise<void> {
  await cpFetch(
    cfg,
    `/v1/org/teams/${encodeURIComponent(teamId)}/members/${encodeURIComponent(userId)}`,
    { method: "DELETE" },
  );
}

/** Set (or upsert) a member's owner flag on this team. */
export async function setAgentTeamMemberOwner(
  cfg: ControlPlaneConfig,
  teamId: string,
  userId: string,
  owner: boolean,
): Promise<void> {
  await cpFetch(
    cfg,
    `/v1/org/teams/${encodeURIComponent(teamId)}/members/${encodeURIComponent(userId)}`,
    { method: "PUT", body: JSON.stringify({ owner }) },
  );
}

/** Move one agent between teams in the same space. Grouping only: assignments,
 *  and therefore who may drive the agent, are untouched. */
export async function setAgentTeam(
  cfg: ControlPlaneConfig,
  agentSlugOrId: string,
  teamId: string,
): Promise<void> {
  await cpFetch(cfg, `/v1/agents/${encodeURIComponent(agentSlugOrId)}/team`, {
    method: "PUT",
    body: JSON.stringify({ teamId }),
  });
}
