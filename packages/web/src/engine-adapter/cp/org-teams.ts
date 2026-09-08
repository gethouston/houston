import type { AgentTeam } from "../../../../../ui/engine-client/src/types";
import { type ControlPlaneConfig, cpFetch } from "./fetch";

/**
 * C13 agent teams: named groups of agents and people INSIDE one space,
 * server-owned. Distinct from `cp/agent-teams.ts`, which is the per-AGENT
 * settings surface (assignments, model choice) and shares only a name.
 *
 * The teams themselves live here; who is IN one, and which team an agent
 * belongs to, live in `./org-team-members` — the same rail, but one file per
 * question so neither grows past reading.
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
 * @param input The team's name, and optionally its mark and colour. Use one
 *   of Houston's ten palette colours (charcoal, forest, teal, navy, purple,
 *   rose, crimson, orange, golden, umber); leave the mark out unless the
 *   user named one, and Houston draws its own. A literal #rrggbb is also
 *   accepted; an empty string clears the colour.
 * @assistant group:teams unconfirmed: Creates an empty team without moving agents or adding other members.
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
 *
 * Confirmed: outward. A rename, a restyle or a note edit lands in front of
 * every teammate at once, and the previous values are not kept.
 * @param teamId The team this acts on, by the id listAgentTeams returns.
 * @param patch Only what changes. A colour is one of Houston's ten palette
 *   colours or a literal #rrggbb, an empty string clears one, and an omitted
 *   key leaves the field alone. Omit the icon unless the user named one.
 * @assistant group:teams confirm
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
 * @param teamId The team this acts on, by the id listAgentTeams returns.
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
