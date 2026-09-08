import type { AgentTeamMember } from "../../../../../ui/engine-client/src/types";
import { type ControlPlaneConfig, cpFetch } from "./fetch";

/**
 * WHO is in a C13 agent team, and which team an agent belongs to. The teams
 * themselves (create, rename, restyle, delete) are in `./org-teams`; the same
 * "never degrade on a 404" rule holds here, for the same reason: callers
 * feature-detect on `capabilities.agentTeams` before they ever arrive.
 */

/**
 * Lists the people who joined a team.
 *
 * One team's EXPLICIT membership rows. Implicit owners (org owners/admins own
 * every team) are a permission rule, not a roster entry, and are absent here.
 * @param teamId The team this acts on, by the id listAgentTeams returns.
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
 *
 * Confirmed: outward. Joining puts the user's name in front of the team's
 * other members, and Houston cannot take that back for them.
 * @param teamId The team this acts on, by the id listAgentTeams returns.
 * @assistant group:teams confirm
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
 * @param teamId The team this acts on, by the id listAgentTeams returns.
 * @param userId The person to remove, by the user id listAgentTeamMembers
 *   returns.
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
 * @param teamId The team this acts on, by the id listAgentTeams returns.
 * @param userId The person, by the user id listAgentTeamMembers returns.
 * @param owner True gives them ownership of the team, false takes it away.
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
 *
 * Confirmed: outward. Teammates see the agent move, and the grouping they
 * navigate by changes under them.
 * @param agentSlugOrId The agent this acts on, by the id or slug listAgents
 *   returns. Read it from listAgents rather than writing the name the user
 *   says.
 * @param teamId The team this acts on, by the id listAgentTeams returns.
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
