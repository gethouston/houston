import { sameAgentName } from "@houston/sdk/agent-name";
import type { AgentRoleContext } from "../../../lib/agent-role-context.ts";
import {
  briefWithAnswer,
  type JobBriefField,
} from "../../context/job-brief-model.ts";
import {
  type EmployeeNameIssue,
  employeeNameIssue,
} from "../../employee-card/employee-name-validation.ts";
import type { RosterIdentity, RosterMember } from "./team-roster-model.ts";

export type RosterPatch = Partial<RosterIdentity>;

function sameBrief(a: AgentRoleContext, b: AgentRoleContext): boolean {
  return a.context === b.context && a.role === b.role;
}

export function rosterBriefPatch(
  member: RosterMember,
  field: JobBriefField,
  answer: string,
): RosterPatch | null {
  const brief = briefWithAnswer(member.brief, field, answer);
  return brief && !sameBrief(brief, member.brief) ? { brief } : null;
}

export function rosterEdit(
  members: readonly RosterMember[],
  key: string,
  patch: RosterPatch,
): RosterMember[] {
  return members.map((member) =>
    member.key === key ? { ...member, ...patch, saveFailed: false } : member,
  );
}

export function rosterSaveMark(
  members: readonly RosterMember[],
  key: string,
  failed: boolean,
): RosterMember[] {
  return members.map((member) =>
    member.key === key ? { ...member, saveFailed: failed } : member,
  );
}

export function rosterRetrySaves(members: readonly RosterMember[]): {
  members: RosterMember[];
  keys: string[];
} {
  const keys = members.filter((m) => m.saveFailed).map((m) => m.key);
  return {
    members: members.map((member) =>
      member.saveFailed ? { ...member, saveFailed: false } : member,
    ),
    keys,
  };
}

export function rosterUnsaved(member: RosterMember): RosterPatch | null {
  if (member.status.kind !== "hired") return null;
  const patch: RosterPatch = {};
  if (member.name !== member.saved.name) patch.name = member.name;
  if (member.color !== member.saved.color) patch.color = member.color;
  if (!sameBrief(member.brief, member.saved.brief)) patch.brief = member.brief;
  return Object.keys(patch).length > 0 ? patch : null;
}

export function rosterSaved(
  members: readonly RosterMember[],
  key: string,
  sent: RosterPatch,
  landed: { id: string; name?: string },
): RosterMember[] {
  return members.map((member) => {
    if (member.key !== key || member.status.kind !== "hired") return member;
    const name = landed.name ?? member.saved.name;
    const color = sent.color !== undefined ? sent.color : member.saved.color;
    const brief = sent.brief ?? member.saved.brief;
    return {
      ...member,
      name: member.name === sent.name ? name : member.name,
      saved: { name, color, brief },
      status: { kind: "hired", id: landed.id },
    };
  });
}

export function rosterRevert(
  members: readonly RosterMember[],
  key: string,
  sent: RosterPatch,
): RosterMember[] {
  return members.map((member) => {
    if (member.key !== key) return member;
    return {
      ...member,
      name:
        sent.name !== undefined && member.name === sent.name
          ? member.saved.name
          : member.name,
      color:
        sent.color !== undefined && member.color === sent.color
          ? member.saved.color
          : member.color,
      brief:
        sent.brief !== undefined && sameBrief(member.brief, sent.brief)
          ? member.saved.brief
          : member.brief,
    };
  });
}

export function rosterNameCommit(
  typed: string,
  member: RosterMember,
  takenNames: readonly string[],
):
  | { kind: "name"; name: string }
  | { kind: "issue"; issue: EmployeeNameIssue } {
  const others = takenNames.filter((name) => !sameAgentName(name, member.name));
  const held = member.status.kind === "hired" ? member.saved.name : undefined;
  const issue = employeeNameIssue(typed, others, held);
  return issue
    ? { kind: "issue", issue }
    : { kind: "name", name: typed.trim() };
}
