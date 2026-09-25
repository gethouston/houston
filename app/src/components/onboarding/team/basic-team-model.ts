// `.ts` extensions so the node test runner can load this module on its own.

import type { AgentRoleId } from "../../../lib/agent-role-catalog.ts";
import type { AgentRoleContext } from "../../../lib/agent-role-context.ts";
import {
  briefWithAnswer,
  type JobBriefField,
} from "../../context/job-brief-model.ts";
import {
  type EmployeeNameIssue,
  employeeNameIssue,
  firstNameIssueIndex,
} from "../../employee-card/employee-name-validation.ts";
import type { RosterMember } from "./team-roster-model.ts";

/**
 * The starter team: the three jobs almost every small business hands off
 * first. All three are shared roles (`AGENT_COMMON_ROLES`), so they read right
 * in any industry the person named.
 */
export const BASIC_TEAM_ROLES = [
  "executive_assistant",
  "operations_manager",
  "finance_manager",
] as const satisfies readonly AgentRoleId[];

export type BasicTeamRoleId = (typeof BASIC_TEAM_ROLES)[number];

export interface BasicTeamDraft {
  /** The starter this card began as: the card's identity in the team, kept
   *  when the person gives it another job. */
  roleId: BasicTeamRoleId;
  /** The job as the person reads it; also the brief's role. */
  roleLabel: string;
  /** The industry the person gave this card alone, or null for the team's. */
  industry: string | null;
  /** What the person typed (or Suggest put there); required to hire. */
  name: string;
  /** The color the person picked, or null for the next free one. */
  color: string | null;
  /** Set once this member joined the roster; from then on the roster holds
   *  its name, color and status, and the draft is settled. */
  rosterKey: string | null;
}

export function basicTeamDefaults(
  roleLabel: (id: BasicTeamRoleId) => string,
): BasicTeamDraft[] {
  return BASIC_TEAM_ROLES.map((roleId) => ({
    roleId,
    roleLabel: roleLabel(roleId),
    industry: null,
    name: "",
    color: null,
    rosterKey: null,
  }));
}

/** The brief a draft is hired with: its job, in its own industry or the
 *  team's. */
export function basicTeamBrief(
  draft: BasicTeamDraft,
  teamIndustry: string,
): AgentRoleContext {
  return { context: draft.industry ?? teamIndustry, role: draft.roleLabel };
}

/**
 * The team with one draft's job or industry answered again on its card: that
 * draft alone changes, and a blank answer changes nothing. A new industry is
 * that card's alone, and it keeps the job: any job pairs with any industry.
 */
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

/** The names of the drafts still to hire, other than the one at `index`. */
export function basicTeamSiblingNames(
  drafts: readonly BasicTeamDraft[],
  index: number,
): string[] {
  return drafts.flatMap((draft, other) =>
    other !== index && draft.rosterKey === null && draft.name.trim() !== ""
      ? [draft.name.trim()]
      : [],
  );
}

/**
 * The color each draft wears: the one the person picked, else its default.
 * Every draft deals its default whether or not it was picked over, so a
 * default depends only on its place in the team and never on a pick made on
 * another card. Defaults stay distinct; two picks may match, by choice.
 */
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

/**
 * What holds each draft back, in order: a blank name (every AI Employee needs
 * one), or a name the host would refuse. Every name is checked against the
 * workspace's AI Employees AND the other drafts, since three hires sharing a
 * name would refuse the second. A member on the roster is settled and never
 * re-checked (its name is itself one of `takenNames`).
 */
export function basicTeamNameIssues(
  drafts: readonly BasicTeamDraft[],
  takenNames: readonly string[],
): (EmployeeNameIssue | null)[] {
  return drafts.map((draft, index) =>
    draft.rosterKey !== null
      ? null
      : employeeNameIssue(draft.name, [
          ...takenNames,
          ...basicTeamSiblingNames(drafts, index),
        ]),
  );
}

/**
 * "Hire my team" is offered while there is something left to do: a draft not
 * yet hired, or a member whose create or save failed and is worth another
 * try.
 */
export function hasBasicTeamWork(
  drafts: readonly BasicTeamDraft[],
  failedCount: number,
): boolean {
  return drafts.some((draft) => draft.rosterKey === null) || failedCount > 0;
}

/** What a press of "Hire my team" does. */
export type BasicTeamSubmit =
  | { kind: "idle" }
  /** A name holds the team back: the card at `index` is the first to fix. */
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

/**
 * Hires made one by one on this card whose create or save failed. The basic
 * team's own badges carry their starters' failures; these sit on the roster,
 * off this screen, yet still hold the team back from finishing, so the
 * screen names them on their cards.
 */
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
