/**
 * C13 agent teams — the nine gateway routes, mirroring
 * `cloud/docs/contracts/C13-agent-teams.md`:
 *
 *   GET|POST     /v1/org/teams                     · list | create
 *   PATCH|DELETE /v1/org/teams/:id                 · rename/reorder/restyle
 *                                                    | delete
 *   GET          /v1/org/teams/:id/members         · EXPLICIT rows only
 *   POST         /v1/org/teams/:id/join            · self-service, idempotent
 *   DELETE|PUT   /v1/org/teams/:id/members/:userId · leave/remove | upsert
 *   PUT          /v1/agents/:slug/team             · move one agent
 *
 * The GATE ORDER is the contract's and is load-bearing — the client's
 * expected-error taxonomy reads whichever code comes out FIRST, so the order is
 * the answer, not a detail. One gate is shared by every route carrying a team
 * in its path: the `:id` must resolve (`404 team_not_found`) before anything is
 * asked about it. Ahead of even that sit the three PEOPLE routes, which a
 * personal space refuses outright (`403 personal_space`,
 * {@link isPeopleManagement}). After that, per route:
 *
 *   POST   /teams             `invalid_name` -> `invalid_icon` ->
 *                            `invalid_color`
 *   PATCH  /teams/:id        ownership -> `invalid_name` ->
 *                            `invalid_sort_order` -> `invalid_icon` ->
 *                            `invalid_color`
 *   DELETE /teams/:id        ownership -> `default_team`
 *   POST   /teams/:id/join   `personal_space` -> the team 404
 *   PUT|DELETE .../members/:userId
 *                            `personal_space` -> the team 404 ->
 *                            `default_team` -> ownership (self-DELETE = leave,
 *                            which needs none) -> body -> `not_a_member`
 *   PUT    /agents/:slug/team
 *                            the agent 404 -> `invalid_team_id` -> the target
 *                            team 404 -> the same-team `204` no-op -> ownership
 *                            of BOTH source and target
 *
 * The line a personal space draws is PEOPLE, not teams: teams are how a solo
 * user groups their own agents, so create, patch, delete and the agent move all
 * behave there exactly as they do in a team space, and the read serves the real
 * list. Only join, the owner write and the member remove refuse, because the
 * space holds exactly one human. That refusal precedes both the `:id` resolve
 * and `default_team`, as it does in the gateway (`requirePeopleManagement`,
 * `cloud/internal/edge/team_routes.go`): "there is nobody to manage" is the
 * accurate answer, where `default_team` would send a client hunting for another
 * team to write to and every team there refuses the same way.
 *
 * The two `default_team` gates sit on OPPOSITE sides of ownership, and that
 * asymmetry is deliberate. On DELETE the caller's standing is settled first, so
 * a stranger learns "not yours" and never a detail about the shape of a space
 * they hold no authority in. On a member write there is nothing to protect and
 * nothing to grant: the default team holds no explicit rows at all, so an owner
 * meets the same wall, and answering `not_team_owner` would promise a
 * permission that leads nowhere.
 *
 * The two IDENTITY fields are the tail of both body gates, and they are read
 * whole before any of them is applied, so a bad `color` cannot leave a
 * half-written `icon` behind. `""` is the CLEAR and `null` is a `400`
 * ({@link readTeamIdentity}); the gate order above states where they land,
 * because the client's taxonomy reads whichever code comes out FIRST.
 *
 * The stored world is `state-agent-teams.ts`; the served shapes, the
 * membership-scoped listing filter and the flat `{error, code}` refusals are
 * `agent-teams-wire.ts`.
 */

import {
  agentTeamWire,
  decodeSeg,
  isEffectiveTeamOwner,
  isOrgMember,
  listAgentTeamsWire,
  mutated,
  readTeamContext,
  readTeamIdentity,
  refuse,
  validName,
} from "./agent-teams-wire";
import { json } from "./http";
import * as state from "./state";
import type { FakeAgentTeam } from "./state-store";
import { SELF_USER_ID } from "./state-store";

/**
 * `POST /v1/org/teams` — any member of the space may create. `icon`/`color` are
 * optional and validated exactly as on PATCH; they exist here purely so a
 * STYLED create is one round trip. Absent and `""` both mean "no identity", so
 * the clear is dropped rather than stored — an unset field is absent, never the
 * empty string.
 */
function createTeam(body: Record<string, unknown> | undefined): Response {
  const name = validName(body?.name);
  if (name === null)
    return refuse(400, "invalid_name", "name must be 1..60 characters");
  const fields = readTeamIdentity(body);
  if (!Array.isArray(fields)) return fields;
  const identity: { icon?: string; color?: string } = {};
  for (const [field, value] of fields)
    if (value !== "") identity[field] = value;
  return mutated(agentTeamWire(state.createAgentTeamRow(name, identity)), 201);
}

/**
 * `PATCH /v1/org/teams/:id` — effective team owner only, partial, default ok.
 * Identity is a RENAME, not a structural change, so whoever may rename the team
 * may restyle it, on the default team included. So is the team's shared
 * CONTEXT: it changes what the team's agents are told, which is the team
 * owner's call and nobody else's.
 */
function patchTeam(
  team: FakeAgentTeam,
  body: Record<string, unknown> | undefined,
): Response {
  if (!isEffectiveTeamOwner(team.id))
    return refuse(403, "not_team_owner", "not a team owner");
  if (body && "name" in body) {
    const name = validName(body.name);
    if (name === null)
      return refuse(400, "invalid_name", "name must be 1..60 characters");
    team.name = name;
  }
  if (body && "sortOrder" in body) {
    if (typeof body.sortOrder !== "number")
      return refuse(400, "invalid_sort_order", "sortOrder must be a number");
    team.sortOrder = body.sortOrder;
  }
  const fields = readTeamIdentity(body);
  if (!Array.isArray(fields)) return fields;
  const context = readTeamContext(body);
  if (context instanceof Response) return context;
  // `""` DELETES the stored field rather than writing an empty one, so the wire
  // goes back to omitting it — "render your own default" again.
  for (const [field, value] of fields) {
    if (value === "") delete team[field];
    else team[field] = value;
  }
  // Context is the opposite: `""` is a real value the caller chose (they
  // emptied the box), and the wire serves the field either way.
  if (context !== undefined) team.context = context;
  return mutated(agentTeamWire(team));
}

/**
 * `DELETE|PUT /v1/org/teams/:id/members/:userId`. Both refuse the default team
 * before asking anything about the caller: it holds no explicit rows, and one
 * written there is one the remove path could never delete.
 */
function memberWrite(
  method: string,
  team: FakeAgentTeam,
  userId: string,
  body: Record<string, unknown> | undefined,
): Response {
  if (team.isDefault)
    return refuse(400, "default_team", "the default team keeps no member list");
  if (method === "DELETE") {
    // Self = leave, anyone else = remove, and removing a non-member is still a
    // success so a double-click cannot 404.
    if (userId !== SELF_USER_ID && !isEffectiveTeamOwner(team.id))
      return refuse(403, "not_team_owner", "not a team owner");
    state.removeAgentTeamMemberRow(team.id, userId);
    return mutated();
  }
  if (!isEffectiveTeamOwner(team.id))
    return refuse(403, "not_team_owner", "not a team owner");
  if (typeof body?.owner !== "boolean")
    return refuse(400, "invalid_owner", "owner must be a boolean");
  if (!isOrgMember(userId))
    return refuse(400, "not_a_member", "not a member of this space");
  // Demoting the LAST explicit owner is deliberately allowed: implicit owners
  // always exist, so a "keep >= 1 owner" rule would only produce a refusal
  // nobody can act on.
  state.putAgentTeamMemberRow(team.id, userId, body.owner);
  return mutated();
}

/** `PUT /v1/agents/:slug/team` — the agent, then the body, then the target,
 *  then (for a move that CHANGES something) ownership of source and target. */
function moveAgent(
  slug: string,
  body: Record<string, unknown> | undefined,
): Response {
  // The SLUG is what this route is addressed to, so it is resolved first: a
  // client chasing an agent that no longer exists must not be told its body was
  // malformed and retry with a teamId that can never help.
  const agent = state.listAgents().find((a) => a.id === slug);
  if (!agent) return json({ error: "agent not found" }, 404);
  const teamId = typeof body?.teamId === "string" ? body.teamId.trim() : "";
  // An absent required field is a malformed request; a 404 here would claim the
  // gateway looked something up.
  if (!teamId) return refuse(400, "invalid_team_id", "teamId is required");
  const target = state.findAgentTeam(teamId);
  if (!target) return refuse(404, "team_not_found", "team not found");
  const source = state.teamIdOfAgent(agent.id);
  // A move that changes nothing is not a mutation to authorize, so it short-
  // circuits ahead of the ownership gate: refusing it would teach the client
  // that the state the agent is ALREADY in is forbidden. It answers through
  // `mutated()`, so the no-op fans out exactly like the no-op join.
  if (source === target.id) return mutated();
  // Moving an agent OUT of a team is as consequential to that team as moving
  // one in, so one-sided authority would let any team owner raid another's.
  if (!isEffectiveTeamOwner(source) || !isEffectiveTeamOwner(target.id))
    return refuse(403, "not_team_owner", "not a team owner");
  state.setAgentTeamOfAgent(agent.id, target.id);
  return mutated();
}

/**
 * The three MEMBER-management routes — join, the owner write, the member
 * remove — and only those. They are the whole of what a personal space refuses,
 * so the test is made once here rather than restated at each of them.
 *
 * `GET /teams/:id/members` is deliberately NOT one: reading a roster manages
 * nobody, and the contract serves it in every space.
 */
function isPeopleManagement(method: string, segs: string[]): boolean {
  if (segs.length === 5) return segs[4] === "join" && method === "POST";
  return (
    segs.length === 6 &&
    segs[4] === "members" &&
    (method === "DELETE" || method === "PUT")
  );
}

/** Route one C13 request, or return `undefined` to fall through. */
export function handleAgentTeamsRoutes(
  method: string,
  segs: string[],
  body: Record<string, unknown> | undefined,
): Response | undefined {
  const teamsPath =
    segs[0] === "v1" && segs[1] === "org" && segs[2] === "teams";
  const agentTeamPath =
    segs[0] === "v1" &&
    segs[1] === "agents" &&
    segs.length === 4 &&
    segs[3] === "team";
  if (!teamsPath && !agentTeamPath) return undefined;

  if (agentTeamPath) {
    if (method !== "PUT") return json({ error: "not found" }, 404);
    return moveAgent(decodeSeg(segs[2]), body);
  }

  if (segs.length === 3) {
    if (method === "GET") return json({ teams: listAgentTeamsWire() });
    if (method === "POST") return createTeam(body);
    return json({ error: "not found" }, 404);
  }

  // A personal space holds exactly one human, so managing people there is not
  // a question about any particular team: the refusal lands BEFORE the `:id`
  // resolves, and before `default_team`, exactly as the gateway orders it.
  if (isPeopleManagement(method, segs) && state.isPersonalSpace())
    return refuse(
      403,
      "personal_space",
      "a personal space has no people to manage",
    );

  const team = state.findAgentTeam(decodeSeg(segs[3]));
  if (!team) return refuse(404, "team_not_found", "team not found");

  if (segs.length === 4) {
    if (method === "PATCH") return patchTeam(team, body);
    if (method === "DELETE") {
      // Standing first: a stranger learns "not yours", never a detail about the
      // shape of a space they hold no authority in.
      if (!isEffectiveTeamOwner(team.id))
        return refuse(403, "not_team_owner", "not a team owner");
      // The default team is the fallback everything else depends on.
      if (team.isDefault)
        return refuse(
          400,
          "default_team",
          "the default team cannot be deleted",
        );
      state.deleteAgentTeamRow(team.id);
      return mutated();
    }
    return json({ error: "not found" }, 404);
  }

  if (segs.length === 5 && segs[4] === "join" && method === "POST") {
    // A no-op on the default team: everyone is already in it.
    if (!team.isDefault) state.joinAgentTeamRow(team.id, SELF_USER_ID);
    return mutated();
  }
  if (segs.length === 5 && segs[4] === "members" && method === "GET") {
    return json({ members: state.agentTeamMemberRows(team.id) });
  }
  if (
    segs.length === 6 &&
    segs[4] === "members" &&
    (method === "DELETE" || method === "PUT")
  ) {
    return memberWrite(method, team, decodeSeg(segs[5]), body);
  }
  return json({ error: "not found" }, 404);
}
