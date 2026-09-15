/**
 * The C13 team-DIRECTORY calls — named groups of agents and people INSIDE one
 * space, server-owned — over the injected `fetch`.
 *
 * These are HOSTED-GATEWAY routes: a team is a multi-tenant concept the gateway
 * resolves from the caller's session plus the active-space header, so no host
 * serves them and the runtime client has no surface for them. They go straight
 * through {@link httpRequest} with literal paths, which is also what keeps them
 * visible to the assistant's operation catalog.
 *
 * NOTHING here degrades on a 404. Surfaces feature-detect on
 * `capabilities.agentTeams` before they ever reach this module, so a 404 means
 * the host advertised a surface it does not serve — and swallowing it would
 * blank the whole rail while presenting "you have no teams" as the truth. Every
 * failure throws a `TeamsHttpError` (`scope.ts`) carrying the HTTP `status`. A
 * `401` additionally fires `onUnauthorized`, so a lapsed session token becomes a
 * visible `tokenExpired` signal.
 *
 * Who is IN a team, and which team an agent belongs to, are in `./members`; the
 * per-agent policy surface is `./settings`.
 */

import { type HttpScope, httpRequest } from "../http";
import type { AgentTeam, AgentTeamInput, AgentTeamPatch } from "./types";

/**
 * Lists the teams of people and agents in this space.
 *
 * The active space's teams, as the CALLER sees them (`joined`/`owner`/
 * `memberCount` are effective values resolved server-side).
 * @assistant group:teams
 */
export async function listAgentTeams(scope: HttpScope): Promise<AgentTeam[]> {
  const res = await httpRequest(scope, "/v1/org/teams");
  return ((await res.json()) as { teams?: AgentTeam[] }).teams ?? [];
}

/**
 * Creates a team in this space.
 *
 * Create a team with the typed name; the creator becomes its owner.
 * @param input The team's name, and optionally its mark and colour. Use one
 *   of Houston's ten palette colours (charcoal, forest, teal, navy, purple,
 *   rose, crimson, orange, golden, umber); leave the mark out unless the
 *   user named one, and Houston draws its own. A literal #rrggbb is also
 *   accepted; an empty string clears the colour.
 * @assistant group:teams unconfirmed: Creates an empty team without moving agents or adding other members.
 */
export async function createAgentTeam(
  scope: HttpScope,
  input: AgentTeamInput,
): Promise<AgentTeam> {
  const res = await httpRequest(scope, "/v1/org/teams", {
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
 *
 * @param teamId The team this acts on, by the id listAgentTeams returns.
 * @param patch Only what changes. A colour is one of Houston's ten palette
 *   colours or a literal #rrggbb, an empty string clears one, and an omitted
 *   key leaves the field alone. Omit the icon unless the user named one.
 * @assistant group:teams
 * @assistant confirm: outward. A rename, a restyle or a note edit lands in front of every teammate at once, and the previous values are not kept.
 */
export async function updateAgentTeam(
  scope: HttpScope,
  teamId: string,
  patch: AgentTeamPatch,
): Promise<AgentTeam> {
  const res = await httpRequest(
    scope,
    `/v1/org/teams/${encodeURIComponent(teamId)}`,
    { method: "PATCH", body: JSON.stringify(patch) },
  );
  return (await res.json()) as AgentTeam;
}

/**
 * Deletes a team.
 *
 * Delete a team; its agents fall back to the default one.
 * @param teamId The team this acts on, by the id listAgentTeams returns.
 * @assistant group:teams
 * @assistant confirm: irreversible. The team is gone for everyone, and its agents fall back to the default one.
 */
export async function deleteAgentTeam(
  scope: HttpScope,
  teamId: string,
): Promise<void> {
  await httpRequest(scope, `/v1/org/teams/${encodeURIComponent(teamId)}`, {
    method: "DELETE",
  });
}
