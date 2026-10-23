import type { Agent, OrgMember, OrgRole } from "@houston/engine-adapter";
import { currentAssignments } from "../agent/agent-access-model.ts";
import { rosterPersonName } from "./people-tab-model.ts";

/**
 * Who manages and who uses one AI Employee on the org chart. Pure and
 * DOM-free.
 *
 * The gateway manages by ROLE, not by row: every owner manages every agent,
 * and a manager assignment counts only while its member is still an admin
 * (an ex-admin's stale row is clamped to plain use). Ids that are not on the
 * roster are left out: the chart draws the organization as it stands, not a
 * stale assignment.
 */

export type ChartRelation = "manages" | "uses";

export interface ChartPerson {
  userId: string;
  name: string;
  role: OrgRole;
  imageUrl?: string;
}

/**
 * One agent's people. `uses` is `"everyone"` for an agent shared with the
 * whole organization, drawn as one word rather than a face per member.
 */
export interface AgentPeople {
  manages: ChartPerson[];
  uses: ChartPerson[] | "everyone";
}

const ROLE_RANK: Record<OrgRole, number> = {
  owner: 0,
  admin: 1,
  partner: 2,
  user: 3,
};

export function chartPerson(
  member: OrgMember,
  unnamedAccount: string,
): ChartPerson {
  return {
    userId: member.userId,
    name: rosterPersonName(member, unnamedAccount),
    role: member.role,
    imageUrl: member.photoUrl,
  };
}

const byRoleThenName = (a: ChartPerson, b: ChartPerson) =>
  ROLE_RANK[a.role] - ROLE_RANK[b.role] || a.name.localeCompare(b.name);

const byName = (a: ChartPerson, b: ChartPerson) => a.name.localeCompare(b.name);

type AgentAccessFields = Pick<
  Agent,
  "access" | "assignments" | "assignedUserIds"
>;

/**
 * Whether the caller is served this agent's assignments. The gateway sends
 * them only to its managers, and omits an EMPTY list, so a managed agent
 * with neither field is shared with everyone rather than hidden. A host that
 * predates access levels sends no `access`; there the fields' presence is
 * the only signal.
 */
function assignmentsVisible(agent: AgentAccessFields): boolean {
  if (agent.access !== undefined) return agent.access === "manager";
  return agent.assignments !== undefined || agent.assignedUserIds !== undefined;
}

/**
 * The people under `agent`: the owner(s) first, then the admins made its
 * managers, then its users by name. `null` when the caller cannot see the
 * agent's assignments, where an empty list would claim nobody uses it.
 */
export function agentPeople(
  agent: AgentAccessFields,
  members: readonly OrgMember[],
  unnamedAccount: string,
): AgentPeople | null {
  if (!assignmentsVisible(agent)) return null;
  const roster = new Map(members.map((m) => [m.userId, m]));
  const assignments = currentAssignments(agent);
  const managerIds = new Set(
    members.filter((m) => m.role === "owner").map((m) => m.userId),
  );
  for (const { userId, access } of assignments)
    if (access === "manager" && roster.get(userId)?.role === "admin")
      managerIds.add(userId);
  const resolve = (ids: Iterable<string>) =>
    [...ids].flatMap((id) => {
      const member = roster.get(id);
      return member ? [chartPerson(member, unnamedAccount)] : [];
    });
  const manages = resolve(managerIds).sort(byRoleThenName);
  if (assignments.length === 0) return { manages, uses: "everyone" };
  const userIds = new Set(
    assignments.map((a) => a.userId).filter((id) => !managerIds.has(id)),
  );
  return { manages, uses: resolve(userIds).sort(byName) };
}
