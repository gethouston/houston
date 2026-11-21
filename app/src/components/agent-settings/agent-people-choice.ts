import type {
  Agent,
  AgentAssignment,
  OrgMember,
} from "@houston/engine-adapter";
import {
  buildSharePeople,
  isSharedWithEveryone,
  needsSelfLockoutConfirm,
} from "../agent/agent-access-model.ts";
import type { AccessMode } from "../agent/agent-admin/agent-admin-row-values.ts";

export interface AgentRosterInput {
  agent: Pick<Agent, "assignments" | "assignedUserIds">;
  members: readonly OrgMember[];
  selfId: string | null;
}

export function agentAccessMode(
  agent: Pick<Agent, "assignments" | "assignedUserIds">,
): AccessMode {
  return isSharedWithEveryone(agent) ? "any" : "picked";
}

export function canChooseAgentAccess(members: readonly OrgMember[]): boolean {
  return members.length > 0;
}

export function agentPeopleCount(input: AgentRosterInput): number {
  return buildSharePeople(input).length;
}

export function everyoneAssignments(): AgentAssignment[] {
  return [];
}

export function materializeRoster(input: AgentRosterInput): AgentAssignment[] {
  return buildSharePeople(input).map((person) => ({
    userId: person.userId,
    access: person.access,
  }));
}

function accessByUserId(input: AgentRosterInput): Map<string, string> {
  return new Map(buildSharePeople(input).map((p) => [p.userId, p.access]));
}

export function everyoneChangesAssignments(input: AgentRosterInput): boolean {
  const before = accessByUserId(input);
  const after = accessByUserId({
    ...input,
    agent: { assignments: [], assignedUserIds: [] },
  });
  if (before.size !== after.size) return true;
  for (const [userId, access] of before) {
    if (after.get(userId) !== access) return true;
  }
  return false;
}

export type EveryoneSwitchConfirm = "selfLockout" | "changesAccess" | "none";

export function everyoneSwitchConfirm(
  input: AgentRosterInput,
): EveryoneSwitchConfirm {
  const self = buildSharePeople(input).find((person) => person.isSelf);
  if (self?.access === "manager" && needsSelfLockoutConfirm(self, "user")) {
    return "selfLockout";
  }
  return everyoneChangesAssignments(input) ? "changesAccess" : "none";
}
