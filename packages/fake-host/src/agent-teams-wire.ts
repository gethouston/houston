/**
 * The C13 wire vocabulary: what the teams routes SERVE and what they REFUSE
 * with. The stored world is `state-agent-teams.ts`; this module is the only
 * place that turns it into the caller's view.
 *
 * Two contract rules live here rather than in the routes, because they are
 * answers about the CALLER and must read the same way everywhere:
 *  - the EFFECTIVE fields (`owner`, `joined`, `memberCount`) are resolved, never
 *    raw rows, so an org owner/admin owns every team without a row existing and
 *    everyone is joined to the default one;
 *  - `agentSlugs` is an agent LISTING, so it obeys the same C7 v2 role matrix
 *    `GET /agents` obeys. A team is a grouping, never a grant, and it must not
 *    become a side channel onto the space's full agent roster.
 */

import { json, noContent } from "./http";
import {
  agentTeamMemberRows,
  ensureDefaultAgentTeam,
  listAgentTeamRows,
  teamIdOfAgent,
} from "./state-agent-teams";
import type { CpAgent, FakeAgentTeam } from "./state-store";
import { emitDomain, SELF_USER_ID, state } from "./state-store";

/** The wire shape of one team (`AgentTeam` in `@houston-ai/engine-client`). */
export interface AgentTeamWire extends FakeAgentTeam {
  agentSlugs: string[];
  memberCount: number;
  joined: boolean;
  owner: boolean;
}

/**
 * The caller's EFFECTIVE ownership of one team: an org `owner`/`admin` owns
 * every team implicitly, and anyone else owns the teams they hold an
 * `owner: true` row on. The advertised role defaults to `owner`, as everywhere
 * else in this fake.
 */
export function isEffectiveTeamOwner(teamId: string): boolean {
  const role = state.capabilities.role ?? "owner";
  if (role === "owner" || role === "admin") return true;
  return agentTeamMemberRows(teamId).some(
    (m) => m.userId === SELF_USER_ID && m.owner,
  );
}

/**
 * Whether a user id is in the ORG at all — the `400 not_a_member` gate. With no
 * roster armed, `GET /v1/org` synthesizes the single-self one, and that IS this
 * space's membership list: only the caller is in it, so a spec promoting
 * somebody else must arm `/__test__/org` first, exactly as production requires
 * the person to actually be there.
 */
export function isOrgMember(userId: string): boolean {
  const members = state.orgMembers;
  return members
    ? members.some((m) => m.userId === userId)
    : userId === SELF_USER_ID;
}

/**
 * The agents the CALLER may see: an org `owner` sees every agent in the space;
 * an `admin` and a `user` see only the agents assigned to them (implicit TEAM
 * ownership never widens AGENT visibility). An agent with no `assignments` is
 * the single-player wire shape and an empty one is the everyone sentinel
 * (`state-agents.ts`); both are visible to everybody.
 */
function visibleAgents(): CpAgent[] {
  const role = state.capabilities.role ?? "owner";
  if (role === "owner") return state.agents;
  return state.agents.filter(
    (a) =>
      a.assignments === undefined ||
      a.assignments.length === 0 ||
      a.assignments.some((x) => x.userId === SELF_USER_ID),
  );
}

/**
 * One team as the wire serves it. `memberCount` on the DEFAULT team is the
 * SPACE's member count (everyone is in it and it holds no rows, so `len(rows)`
 * would print `0` beside `joined: true`); elsewhere it is the explicit rows.
 */
export function agentTeamWire(team: FakeAgentTeam): AgentTeamWire {
  const rows = agentTeamMemberRows(team.id);
  return {
    ...team,
    agentSlugs: visibleAgents()
      .filter((a) => teamIdOfAgent(a.id) === team.id)
      .map((a) => a.id),
    memberCount: team.isDefault ? (state.orgMembers?.length ?? 1) : rows.length,
    joined: team.isDefault || rows.some((m) => m.userId === SELF_USER_ID),
    owner: isEffectiveTeamOwner(team.id),
  };
}

/** `GET /v1/org/teams` — in a personal space, exactly the default team. */
export function listAgentTeamsWire(): AgentTeamWire[] {
  if (state.personalSpace) return [agentTeamWire(ensureDefaultAgentTeam())];
  return listAgentTeamRows().map(agentTeamWire);
}

/**
 * A flat `{error, code}` refusal — the only error shape C13 writes. That `code`
 * is what the client's expected-error taxonomy reads, so a nested body would
 * silently turn every business state into a red report-a-bug toast.
 */
export function refuse(status: number, code: string, error: string): Response {
  return json({ error, code }, status);
}

/**
 * The answer to a successful mutation, and the ONE place the fan-out happens:
 * every C13 mutation emits the SAME `AgentsChanged` the client already reacts
 * to (no new wire event type). Emitting once per successful mutation REQUEST
 * keeps that true for the no-ops too — a join on the default team, a move to
 * the team the agent is already in — so a client that wrote optimistically is
 * always reconciled. `body` omitted answers `204`; create/patch pass the team.
 */
export function mutated(body?: unknown, status = 200): Response {
  emitDomain("AgentsChanged");
  return body === undefined ? noContent() : json(body, status);
}

/** `1..60` RUNES after trimming, per the create/patch name rule. */
export function validName(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const name = value.trim();
  const runes = [...name].length;
  return runes >= 1 && runes <= 60 ? name : null;
}

/**
 * Percent-decoding that cannot throw. A malformed id (`%zz`) is no server
 * error: the contract answers `404 team_not_found` for one, so the raw segment
 * is handed on and misses every lookup, which is that answer.
 */
export function decodeSeg(seg: string): string {
  try {
    return decodeURIComponent(seg);
  } catch {
    return seg;
  }
}
