import type { Agent, OrgMember, OrgRole } from "@houston/engine-adapter";
import { currentAssignments } from "../agent/agent-access-model.ts";
import { rosterPersonName } from "./people-tab-model.ts";

export type ChartRelation = "manages" | "uses";

export interface ChartPerson {
  userId: string;
  name: string;
  role: OrgRole;
  imageUrl?: string;
}

export interface AgentPeople {
  manages: ChartPerson[];
  uses: ChartPerson[] | "everyone";
}

const ROLE_RANK: Record<OrgRole, number> = { owner: 0, admin: 1, user: 2 };

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

function assignmentsVisible(agent: AgentAccessFields): boolean {
  if (agent.access !== undefined) return agent.access === "manager";
  return agent.assignments !== undefined || agent.assignedUserIds !== undefined;
}

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
