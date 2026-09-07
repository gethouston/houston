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

/**
 * Lists the teams of people and agents in this space.
 *
 * The active space's teams, as the CALLER sees them (`joined`/`owner`/
 * `memberCount` are effective values resolved server-side).
 * @assistant group:teams
 */
export async function listAgentTeams(
  cfg: ControlPlaneConfig,
): Promise<AgentTeam[]> {
  const res = await cpFetch(cfg, "/v1/org/teams");
  return ((await res.json()) as { teams?: AgentTeam[] }).teams ?? [];
}

/**
 * Creates a team in this space.
 *
 * Create a team with the typed name; the creator becomes its owner.
 * @assistant group:teams
 */
export async function createAgentTeam(
  cfg: ControlPlaneConfig,
  input: { name: string; icon?: string; color?: string },
): Promise<AgentTeam> {
  const res = await cpFetch(cfg, "/v1/org/teams", {
    method: "POST",
    body: JSON.stringify(input),
  });
  return (await res.json()) as AgentTeam;
}

/**
 * Renames a team, reorders it, restyles it, or updates the notes it shares.
 *
 * Rename, reorder or restyle a team. Partial: an omitted field is left
 * untouched, so forwarding only what the caller set is the whole contract.
 * `icon`/`color` (C13 §Team identity) have three states: a string SETS, `""`
 * CLEARS, an omitted key leaves alone. `null` is not a clear — it is a `400`,
 * alongside `invalid_icon`/`invalid_color` for a bad shape. Neither is trimmed.
 * `context` is the team's shared prose, not an identity field: any string is
 * valid, `""` is an empty context rather than a CLEAR, and it is never
 * trimmed.
 * @assistant group:teams
 */
export async function updateAgentTeam(
  cfg: ControlPlaneConfig,
  teamId: string,
  patch: {
    name?: string;
    sortOrder?: number;
    icon?: string;
    color?: string;
    context?: string;
  },
): Promise<AgentTeam> {
  const res = await cpFetch(
    cfg,
    `/v1/org/teams/${encodeURIComponent(teamId)}`,
    { method: "PATCH", body: JSON.stringify(patch) },
  );
  return (await res.json()) as AgentTeam;
}

/**
 * Deletes a team.
 *
 * Delete a team; its agents fall back to the default one.
 * @assistant group:teams confirm
 */
export async function deleteAgentTeam(
  cfg: ControlPlaneConfig,
  teamId: string,
): Promise<void> {
  await cpFetch(cfg, `/v1/org/teams/${encodeURIComponent(teamId)}`, {
    method: "DELETE",
  });
}

/**
 * Lists the people who joined a team.
 *
 * One team's EXPLICIT membership rows. Implicit owners (org owners/admins own
 * every team) are a permission rule, not a roster entry, and are absent here.
 * @assistant group:teams
 */
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

/**
 * Joins the user to a team in this space.
 *
 * Self-service join (v1 teams are all public). Idempotent, never demotes.
 * @assistant group:teams
 */
export async function joinAgentTeam(
  cfg: ControlPlaneConfig,
  teamId: string,
): Promise<void> {
  await cpFetch(cfg, `/v1/org/teams/${encodeURIComponent(teamId)}/join`, {
    method: "POST",
  });
}

/**
 * Removes someone from a team, or leaves it.
 *
 * Drop a membership row: self is a leave, an owner acting on someone else is
 * a remove. Idempotent, so a double-click cannot 404.
 * @assistant group:teams confirm
 */
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

/**
 * Gives someone ownership of a team, or takes it away.
 *
 * Set (or upsert) a member's owner flag on this team.
 * @assistant group:teams confirm
 */
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

/**
 * Moves an agent into another team in this space.
 *
 * Move one agent between teams in the same space. Grouping only: assignments,
 * and therefore who may drive the agent, are untouched.
 * @assistant group:teams confirm
 */
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
