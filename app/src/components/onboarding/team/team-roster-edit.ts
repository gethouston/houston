// `.ts` extensions so the node test runner can load this module on its own.
import { sameAgentName } from "../../../lib/agent-name.ts";
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

/**
 * Editing a hire on the roster, as plain data. The card shows an edit at once;
 * a member on the team saves it through the host, one joining saves it once
 * its create lands, and one that failed carries it into its Retry.
 */

export type RosterPatch = Partial<RosterIdentity>;

function sameBrief(a: AgentRoleContext, b: AgentRoleContext): boolean {
  return a.context === b.context && a.role === b.role;
}

/**
 * The job or industry answered again on a member's card, as the patch to make,
 * or null when it changes nothing (a blank answer, or the one it has). The
 * other fact stays: any job pairs with any industry.
 */
export function rosterBriefPatch(
  member: RosterMember,
  field: JobBriefField,
  answer: string,
): RosterPatch | null {
  const brief = briefWithAnswer(member.brief, field, answer);
  return brief && !sameBrief(brief, member.brief) ? { brief } : null;
}

/** The member's identity as the person just set it, to be saved afresh. */
export function rosterEdit(
  members: readonly RosterMember[],
  key: string,
  patch: RosterPatch,
): RosterMember[] {
  return members.map((member) =>
    member.key === key ? { ...member, ...patch, saveFailed: false } : member,
  );
}

/** Marks a member's save as failed (it keeps what the person set), or clears
 *  the mark as a new save of it starts. */
export function rosterSaveMark(
  members: readonly RosterMember[],
  key: string,
  failed: boolean,
): RosterMember[] {
  return members.map((member) =>
    member.key === key ? { ...member, saveFailed: failed } : member,
  );
}

/** Every member whose save failed, cleared to be saved again (`keys`). */
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

/** What a hired member shows that the host does not hold yet, or null. */
export function rosterUnsaved(member: RosterMember): RosterPatch | null {
  if (member.status.kind !== "hired") return null;
  const patch: RosterPatch = {};
  if (member.name !== member.saved.name) patch.name = member.name;
  if (member.color !== member.saved.color) patch.color = member.color;
  if (!sameBrief(member.brief, member.saved.brief)) patch.brief = member.brief;
  return Object.keys(patch).length > 0 ? patch : null;
}

/**
 * A save that landed: the host's answer becomes the saved identity (a rename
 * can move the id and tidy the name). A field the person changed again while
 * the save ran keeps their newer value, which the next save sends.
 */
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

/**
 * A save that did not land: every field still showing what was sent goes back
 * to what the host holds. One changed again since is left for its own save.
 */
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

/**
 * The name a rename on the card settles to: what was typed, tidied. A blank
 * name (every AI Employee needs one), a name another AI Employee holds, or one
 * the host would refuse comes back as its issue. `takenNames` may include the
 * member's own name; it is never a clash.
 */
export function rosterNameCommit(
  typed: string,
  member: RosterMember,
  takenNames: readonly string[],
):
  | { kind: "name"; name: string }
  | { kind: "issue"; issue: EmployeeNameIssue } {
  const others = takenNames.filter((name) => !sameAgentName(name, member.name));
  const issue = employeeNameIssue(typed, others);
  return issue
    ? { kind: "issue", issue }
    : { kind: "name", name: typed.trim() };
}
