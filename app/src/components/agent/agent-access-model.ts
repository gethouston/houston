import type {
  Agent,
  AgentAssignment,
  Capabilities,
  OrgMember,
  OrgRole,
} from "@houston/engine-adapter";
import { canManageAssignments } from "../../lib/agent-access.ts";
import { hasSpaces, isMultiplayer } from "../../lib/org-roles.ts";

export function canShowAgentShareBlock(
  caps: Capabilities | null | undefined,
  agent: Pick<Agent, "access">,
): boolean {
  return isMultiplayer(caps) && canManageAssignments(caps, agent);
}

export type AgentShareSurface = "manage" | "inviteTeam" | "view" | "none";

// WHY: inviteTeam beats manage: addOrgMember 403s personal_space. ADR-0034
export function agentShareSurface(
  caps: Capabilities | null | undefined,
  agent: Pick<Agent, "access">,
  inPersonalSpace: boolean,
): AgentShareSurface {
  if (inPersonalSpace && hasSpaces(caps)) return "inviteTeam";
  if (canShowAgentShareBlock(caps, agent)) return "manage";
  if (isMultiplayer(caps)) return "view";
  return "none";
}

export type AccessLevel = "manager" | "user";

export type ShareAction = "manager" | "user" | "remove";

export interface SharePerson {
  userId: string;
  email?: string;
  orgRole: OrgRole;
  access: AccessLevel;
  isSelf: boolean;
  isOwner: boolean;
  canBeManager: boolean;
}

export function currentAssignments(
  agent: Pick<Agent, "assignments" | "assignedUserIds">,
): AgentAssignment[] {
  if (agent.assignments && agent.assignments.length > 0) {
    return agent.assignments;
  }
  return (agent.assignedUserIds ?? []).map((userId) => ({
    userId,
    access: "user" as const,
  }));
}

export function isSharedWithEveryone(
  agent: Pick<Agent, "assignments" | "assignedUserIds">,
): boolean {
  const populated =
    agent.assignments !== undefined || agent.assignedUserIds !== undefined;
  return populated && currentAssignments(agent).length === 0;
}

function canBeManagerRole(role: OrgRole): boolean {
  return role === "owner" || role === "admin";
}

export function buildSharePeople(opts: {
  agent: Pick<Agent, "assignments" | "assignedUserIds">;
  members: readonly OrgMember[];
  selfId: string | null;
}): SharePerson[] {
  const memberById = new Map(opts.members.map((m) => [m.userId, m]));
  const assigned = new Map(
    currentAssignments(opts.agent).map((a) => [a.userId, a.access]),
  );
  const ids = new Set<string>(assigned.keys());
  if (isSharedWithEveryone(opts.agent)) {
    for (const m of opts.members) ids.add(m.userId);
  }
  for (const m of opts.members) {
    if (m.role === "owner") ids.add(m.userId);
  }

  const people: SharePerson[] = [];
  for (const userId of ids) {
    const member = memberById.get(userId);
    const orgRole: OrgRole = member?.role ?? "user";
    const isOwner = orgRole === "owner";
    people.push({
      userId,
      email: member?.email,
      orgRole,
      access: isOwner ? "manager" : (assigned.get(userId) ?? "user"),
      isSelf: userId === opts.selfId,
      isOwner,
      canBeManager: canBeManagerRole(orgRole),
    });
  }
  return sortSharePeople(people);
}

function rankOf(p: SharePerson): number {
  if (p.isOwner) return 0;
  return p.access === "manager" ? 1 : 2;
}

function sortSharePeople(people: SharePerson[]): SharePerson[] {
  return [...people].sort((a, b) => {
    const r = rankOf(a) - rankOf(b);
    if (r !== 0) return r;
    return (a.email ?? a.userId).localeCompare(b.email ?? b.userId);
  });
}

export function withViewer(
  people: readonly SharePerson[],
  viewer: { userId: string | null; email?: string },
): SharePerson[] {
  if (!viewer.userId) return [...people];
  if (people.some((p) => p.isSelf || p.userId === viewer.userId)) {
    return [...people];
  }
  return [
    ...people,
    {
      userId: viewer.userId,
      email: viewer.email,
      orgRole: "user",
      access: "user",
      isSelf: true,
      isOwner: false,
      canBeManager: false,
    },
  ];
}

export function addableMembers(
  members: readonly OrgMember[],
  people: readonly SharePerson[],
): OrgMember[] {
  const has = new Set(people.map((p) => p.userId));
  return members
    .filter((m) => !has.has(m.userId))
    .sort((a, b) => (a.email ?? a.userId).localeCompare(b.email ?? b.userId));
}

export function applyShareAction(
  people: readonly SharePerson[],
  userId: string,
  action: ShareAction,
): AgentAssignment[] {
  const target = people.find((p) => p.userId === userId);
  if (action === "remove" && target?.isOwner) {
    return people.map((p) => ({ userId: p.userId, access: p.access }));
  }
  return people
    .filter((p) => !(p.userId === userId && action === "remove"))
    .map((p) => ({
      userId: p.userId,
      access: p.userId === userId && action !== "remove" ? action : p.access,
    }));
}

export function addPerson(
  people: readonly SharePerson[],
  member: OrgMember,
): AgentAssignment[] {
  const base = people.map((p) => ({ userId: p.userId, access: p.access }));
  if (base.some((a) => a.userId === member.userId)) return base;
  return [...base, { userId: member.userId, access: "user" }];
}

export function needsSelfLockoutConfirm(
  person: SharePerson,
  action: ShareAction,
): boolean {
  if (!person.isSelf || person.isOwner) return false;
  return action === "remove" || action === "user";
}

export function isSharedWithOthers(
  agent: Pick<Agent, "assignments" | "assignedUserIds" | "access">,
): boolean {
  if (agent.access === "user") return true;
  if (isSharedWithEveryone(agent)) return true;
  return currentAssignments(agent).length > 1;
}
