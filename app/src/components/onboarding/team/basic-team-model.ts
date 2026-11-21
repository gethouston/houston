import {
  type AgentContextId,
  type AgentRoleId,
  rolesForContext,
} from "../../../lib/agent-role-catalog.ts";
import type { AgentRoleContext } from "../../../lib/agent-role-context.ts";
import { isLeadershipRoleId } from "../../../lib/leadership-roles.ts";
import {
  briefWithAnswer,
  type JobBriefField,
} from "../../context/job-brief-model.ts";
import { firstNameIssueIndex } from "../../employee-card/employee-name-validation.ts";
import { basicTeamNameIssues } from "./basic-team-names.ts";
import type { RosterMember } from "./team-roster-model.ts";

export const BASIC_TEAM_ROLES = [
  "executive_assistant",
  "operations_manager",
  "finance_manager",
] as const satisfies readonly AgentRoleId[];

export function basicTeamRoleIds(
  contextId: AgentContextId | null,
): AgentRoleId[] {
  const selected: AgentRoleId[] = ["executive_assistant"];
  const add = (id: AgentRoleId) => {
    if (
      !isLeadershipRoleId(id) &&
      !selected.includes(id) &&
      selected.length < 3
    )
      selected.push(id);
  };
  for (const id of rolesForContext(contextId).own) add(id);
  for (const id of BASIC_TEAM_ROLES.slice(1)) add(id);
  return selected;
}

export interface BasicTeamDraft {
  key: string;
  roleId: AgentRoleId;
  roleLabel: string;
  industry: string | null;
  name: string | null;
  color: string | null;
  rosterKey: string | null;
}

export function draftFor(
  roleId: AgentRoleId,
  roleLabel: string,
): BasicTeamDraft {
  return {
    key: roleId,
    roleId,
    roleLabel,
    industry: null,
    name: null,
    color: null,
    rosterKey: null,
  };
}

export function basicTeamDefaults(
  roleLabel: (id: AgentRoleId) => string,
  contextId: AgentContextId | null = null,
): BasicTeamDraft[] {
  return basicTeamRoleIds(contextId).map((roleId) =>
    draftFor(roleId, roleLabel(roleId)),
  );
}

export function basicTeamBrief(
  draft: BasicTeamDraft,
  teamIndustry: string,
): AgentRoleContext {
  return { context: draft.industry ?? teamIndustry, role: draft.roleLabel };
}

export function basicTeamAnswered(
  drafts: readonly BasicTeamDraft[],
  index: number,
  teamIndustry: string,
  field: JobBriefField,
  answer: string,
): BasicTeamDraft[] {
  return drafts.map((draft, at) => {
    if (at !== index) return draft;
    const next = briefWithAnswer(
      basicTeamBrief(draft, teamIndustry),
      field,
      answer,
    );
    if (!next) return draft;
    return field === "industry"
      ? { ...draft, industry: next.context }
      : { ...draft, roleLabel: next.role };
  });
}

export function basicTeamColors(
  drafts: readonly BasicTeamDraft[],
  nextColor: (dealt: readonly string[]) => string,
): string[] {
  const dealt: string[] = [];
  return drafts.map((draft) => {
    const fallback = nextColor(dealt);
    dealt.push(fallback);
    return draft.color ?? fallback;
  });
}

export function hasBasicTeamWork(
  drafts: readonly BasicTeamDraft[],
  failedCount: number,
): boolean {
  return drafts.some((draft) => draft.rosterKey === null) || failedCount > 0;
}

export type BasicTeamSubmit =
  | { kind: "idle" }
  | { kind: "invalid"; index: number }
  | { kind: "hire" };

export function basicTeamSubmit(
  drafts: readonly BasicTeamDraft[],
  takenNames: readonly string[],
  failedCount: number,
): BasicTeamSubmit {
  if (!hasBasicTeamWork(drafts, failedCount)) return { kind: "idle" };
  const index = firstNameIssueIndex(basicTeamNameIssues(drafts, takenNames));
  return index === null ? { kind: "hire" } : { kind: "invalid", index };
}

export function basicTeamOffscreenFailures(
  drafts: readonly BasicTeamDraft[],
  members: readonly RosterMember[],
): RosterMember[] {
  const starters = new Set(drafts.map((draft) => draft.rosterKey));
  return members.filter(
    (member) =>
      (member.status.kind === "failed" || member.saveFailed) &&
      !starters.has(member.key),
  );
}
