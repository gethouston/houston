/**
 * C13 agent teams — the STORED team world: the lazily-minted default team, the
 * explicit membership rows, and which team each agent sits in.
 *
 * `cloud/docs/contracts/C13-agent-teams.md` is the authority. Two of its rules
 * shape this module: implicit ownership (an org `owner`/`admin` owns every
 * team) is resolved at read time and NEVER written as a row, and an agent with
 * no row belongs to the default team, which is why {@link teamIdOfAgent} falls
 * back to it and why deleting a team needs no sweep.
 *
 * The caller's EFFECTIVE view of all this is `agent-teams-wire.ts`; the routes
 * are `routes-agent-teams.ts`. This module only reads and writes the shared
 * {@link state}, like its `state-teams.ts` neighbour.
 */

import type { FakeAgentTeam, FakeAgentTeamMember } from "./state-store";
import { emitDomain, FAKE_ORG_NAME, SELF_USER_ID, state } from "./state-store";

/** One armed team (`POST /__test__/agent-teams`), before normalization. */
export interface AgentTeamSeed {
  id: string;
  name: string;
  isDefault?: boolean;
  sortOrder?: number;
  /** The agents this team holds; every other agent stays in the default one. */
  agentIds?: string[];
  /** EXPLICIT rows only — never one for an org owner/admin. `owner` defaults
   *  to false, so a seed may name a plain member as bare `{userId}`. */
  members?: { userId: string; owner?: boolean }[];
  /** The team's visual identity. Omit either to arm a team that HAS none: the
   *  field is then absent from the row, exactly as an unstyled team reads. */
  icon?: string;
  color?: string;
  /** The team's shared context. Omitting it arms a team NOBODY has written one
   *  for, which still serves `context: ""` — the column's empty default, not a
   *  missing field. */
  context?: string;
}

/**
 * The identity of a team being written, copied onto the row SPREAD-WHEN-PRESENT
 * so an unset field stays absent instead of becoming an explicit `undefined`
 * key. `JSON.stringify` drops both alike, but the stored row is also what the
 * `/__test__/agent-teams` control echoes and what specs read, and a row
 * carrying `icon: undefined` claims a field the gateway would never have.
 */
function identityFields(identity?: {
  icon?: string;
  color?: string;
}): Partial<Pick<FakeAgentTeam, "icon" | "color">> {
  return {
    ...(identity?.icon === undefined ? {} : { icon: identity.icon }),
    ...(identity?.color === undefined ? {} : { color: identity.color }),
  };
}

/** The armed team world, as the control route echoes it back. */
export interface ArmedAgentTeams {
  teams: (FakeAgentTeam & {
    agentIds: string[];
    members: FakeAgentTeamMember[];
  })[];
  /** Whether the active space is a PERSONAL one ({@link isPersonalSpace}). */
  personalSpace: boolean;
}

/**
 * C13 personal space: a space holding exactly one human. It groups its agents
 * with teams like any other — the read serves the real list, and create, patch,
 * delete and the agent move all behave normally. Only the three PEOPLE routes
 * (join, the owner write, the member remove) answer `403 personal_space`.
 */
export function isPersonalSpace(): boolean {
  return state.personalSpace;
}

/**
 * The default team, minted on first read if the space has none — lazily,
 * idempotently and named after the org, exactly as the gateway does for an org
 * predating the migration. Every teams surface calls this before reading or
 * writing, because a NULL team on an agent resolves to it.
 */
export function ensureDefaultAgentTeam(): FakeAgentTeam {
  const existing = state.agentTeams.find((t) => t.isDefault);
  if (existing) return existing;
  const team: FakeAgentTeam = {
    id: "team-default",
    name: FAKE_ORG_NAME,
    isDefault: true,
    sortOrder: 0,
  };
  state.agentTeams.push(team);
  return team;
}

/**
 * Every team, ordered by `(sortOrder, createdAt, id)`. `Array.sort` is stable,
 * and the array is kept in creation order, so a plain sort on `sortOrder`
 * already breaks ties by creation — no stored timestamp needed.
 */
export function listAgentTeamRows(): FakeAgentTeam[] {
  ensureDefaultAgentTeam();
  return [...state.agentTeams].sort((a, b) => a.sortOrder - b.sortOrder);
}

/** One team by id, or `undefined` — the `404 team_not_found` answer. */
export function findAgentTeam(id: string): FakeAgentTeam | undefined {
  ensureDefaultAgentTeam();
  return state.agentTeams.find((t) => t.id === id);
}

/** A team's EXPLICIT rows, owners first, then by `userId` (the wire order). */
export function agentTeamMemberRows(teamId: string): FakeAgentTeamMember[] {
  return [...(state.agentTeamMembers.get(teamId) ?? [])].sort(
    (a, b) =>
      Number(b.owner) - Number(a.owner) || a.userId.localeCompare(b.userId),
  );
}

/** The team an agent belongs to; an absent row means the default team. */
export function teamIdOfAgent(agentId: string): string {
  return state.agentTeamOf.get(agentId) ?? ensureDefaultAgentTeam().id;
}

/**
 * Create a team: the creator becomes an EXPLICIT owner, sorted after the last.
 * `identity` is the optional `{icon?, color?}` a styled create carries, so one
 * round trip both names and styles the team.
 */
export function createAgentTeamRow(
  name: string,
  identity?: { icon?: string; color?: string },
): FakeAgentTeam {
  ensureDefaultAgentTeam();
  const last = Math.max(...state.agentTeams.map((t) => t.sortOrder), 0);
  const team: FakeAgentTeam = {
    id: `team-${++state.agentTeamSeq}`,
    name,
    isDefault: false,
    sortOrder: last + 1,
    ...identityFields(identity),
  };
  state.agentTeams.push(team);
  state.agentTeamMembers.set(team.id, [{ userId: SELF_USER_ID, owner: true }]);
  return team;
}

/**
 * Delete a team: its agents fall back to the default one (the FK's
 * `on delete set null`, which resolves to the default) and its rows go with it.
 */
export function deleteAgentTeamRow(teamId: string): void {
  state.agentTeams = state.agentTeams.filter((t) => t.id !== teamId);
  state.agentTeamMembers.delete(teamId);
  for (const [agentId, id] of [...state.agentTeamOf])
    if (id === teamId) state.agentTeamOf.delete(agentId);
}

/** Join: idempotent, and it never demotes an existing owner row. */
export function joinAgentTeamRow(teamId: string, userId: string): void {
  const rows = state.agentTeamMembers.get(teamId) ?? [];
  if (rows.some((m) => m.userId === userId)) return;
  state.agentTeamMembers.set(teamId, [...rows, { userId, owner: false }]);
}

/** Upsert a member row — it also ADDS someone who never joined the team. */
export function putAgentTeamMemberRow(
  teamId: string,
  userId: string,
  owner: boolean,
): void {
  const rows = (state.agentTeamMembers.get(teamId) ?? []).filter(
    (m) => m.userId !== userId,
  );
  state.agentTeamMembers.set(teamId, [...rows, { userId, owner }]);
}

/** Remove a member row. Idempotent: removing a non-member is still a success. */
export function removeAgentTeamMemberRow(teamId: string, userId: string): void {
  state.agentTeamMembers.set(
    teamId,
    (state.agentTeamMembers.get(teamId) ?? []).filter(
      (m) => m.userId !== userId,
    ),
  );
}

/** Move one agent to a team (grouping only — assignments are untouched). */
export function setAgentTeamOfAgent(agentId: string, teamId: string): void {
  state.agentTeamOf.set(agentId, teamId);
}

/**
 * Replace the whole team world (`POST /__test__/agent-teams`). An absent or
 * `null` `teams` clears it back to lazy, so the very next read mints the
 * default team again — that, plus `freshState()`, is the entire reset story.
 * `personalSpace` sets the KIND of the space the world belongs to. The three
 * people routes read it ({@link isPersonalSpace}), and so does the seeding
 * below: a personal space holds ONE human, who therefore created every team in
 * it, so the creator's owner row is forced onto each of them. The gateway
 * cannot produce a personal-space team the caller has not joined — the row is
 * written on create and no route can remove it — and a fake that CAN produce
 * that state lets a spec pass against a world the product never sees, which is
 * exactly how the rail kept offering "Leave team" there.
 */
export function armAgentTeams(
  seed: AgentTeamSeed[] | null,
  personalSpace: boolean,
): ArmedAgentTeams {
  state.agentTeams = [];
  state.agentTeamMembers = new Map();
  state.agentTeamOf = new Map();
  state.personalSpace = personalSpace;
  for (const [index, row] of (seed ?? []).entries()) {
    state.agentTeams.push({
      id: row.id,
      name: row.name,
      isDefault: row.isDefault === true,
      sortOrder: row.sortOrder ?? index,
      ...identityFields(row),
      ...(row.context === undefined ? {} : { context: row.context }),
    });
    // Normalized, never stored verbatim: the wire promises a BOOLEAN `owner`,
    // and a seed's bare `{userId}` would otherwise serve `owner: undefined` —
    // a field the client would read as absent rather than as "not an owner".
    const members: FakeAgentTeamMember[] = (row.members ?? []).map((m) => ({
      userId: m.userId,
      owner: m.owner === true,
    }));
    // The default team keeps NO member list (every write to it answers
    // `400 default_team`), so the forcing applies to created teams only.
    if (personalSpace && row.isDefault !== true)
      state.agentTeamMembers.set(row.id, [
        { userId: SELF_USER_ID, owner: true },
        ...members.filter((m) => m.userId !== SELF_USER_ID),
      ]);
    else state.agentTeamMembers.set(row.id, members);
    for (const agentId of row.agentIds ?? [])
      state.agentTeamOf.set(agentId, row.id);
  }
  emitDomain("AgentsChanged");
  return {
    teams: state.agentTeams.map((t) => ({
      ...t,
      agentIds: [...state.agentTeamOf]
        .filter(([, id]) => id === t.id)
        .map(([agentId]) => agentId),
      members: state.agentTeamMembers.get(t.id) ?? [],
    })),
    personalSpace: state.personalSpace,
  };
}
