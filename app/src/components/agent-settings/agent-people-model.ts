import type {
  Agent,
  AgentAssignment,
  OrgMember,
  OrgRole,
} from "@houston/engine-adapter";
import {
  applyShareAction,
  buildSharePeople,
  needsSelfLockoutConfirm,
  type ShareAction,
  type SharePerson,
} from "../agent/agent-access-model.ts";
import { rosterPersonName } from "../organization/people-tab-model.ts";

export type AgentPersonLevel = "none" | "user" | "manager";

export interface AgentPersonRow {
  member: OrgMember;
  level: AgentPersonLevel;
  isSelf: boolean;
  isOwner: boolean;
  canBeManager: boolean;
}

export function canPersonBeManager(role: OrgRole): boolean {
  return role === "owner" || role === "admin";
}

export type AgentPeopleView = "roster" | "viewerOnly" | "empty";

export function agentPeopleView(
  rowCount: number,
  readOnly: boolean,
): AgentPeopleView {
  if (rowCount > 0) return "roster";
  return readOnly ? "viewerOnly" : "empty";
}

function rankOf(row: AgentPersonRow): number {
  if (row.isOwner) return 0;
  if (row.level === "manager") return 1;
  if (row.level === "user") return 2;
  return 3;
}

export function buildAgentPeople(opts: {
  unnamedAccount: string;
  agent: Pick<Agent, "assignments" | "assignedUserIds">;
  members: readonly OrgMember[];
  selfId: string | null;
}): AgentPersonRow[] {
  const levelById = new Map(
    buildSharePeople(opts).map((p) => [p.userId, p.access]),
  );
  const rows = opts.members.map<AgentPersonRow>((member) => ({
    member,
    level:
      member.role === "owner"
        ? "manager"
        : (levelById.get(member.userId) ?? "none"),
    isSelf: member.userId === opts.selfId,
    isOwner: member.role === "owner",
    canBeManager: canPersonBeManager(member.role),
  }));
  return rows.sort((a, b) => {
    const r = rankOf(a) - rankOf(b);
    if (r !== 0) return r;
    return rosterPersonName(a.member, opts.unnamedAccount).localeCompare(
      rosterPersonName(b.member, opts.unnamedAccount),
    );
  });
}

export function writeAgentPerson(opts: {
  agent: Pick<Agent, "assignments" | "assignedUserIds">;
  members: readonly OrgMember[];
  selfId: string | null;
  userId: string;
  action: ShareAction;
}): AgentAssignment[] {
  const people = buildSharePeople(opts);
  if (people.some((p) => p.userId === opts.userId)) {
    return applyShareAction(people, opts.userId, opts.action);
  }
  const current = people.map((p) => ({ userId: p.userId, access: p.access }));
  if (opts.action === "remove") return current;
  return [...current, { userId: opts.userId, access: opts.action }];
}

export function agentPersonNeedsConfirm(
  row: AgentPersonRow,
  action: ShareAction,
): boolean {
  const person: SharePerson = {
    userId: row.member.userId,
    orgRole: row.member.role,
    access: "manager",
    isSelf: row.isSelf,
    isOwner: row.isOwner,
    canBeManager: row.canBeManager,
  };
  return needsSelfLockoutConfirm(person, action);
}
