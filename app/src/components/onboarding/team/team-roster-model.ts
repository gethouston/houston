// `.ts` extensions so the node test runner can load this module on its own.
import { uniqueAgentName } from "../../../lib/agent-name.ts";
import type { AgentRoleContext } from "../../../lib/agent-role-context.ts";
import { rosterUnsaved } from "./team-roster-edit.ts";

/**
 * Everyone the "Build your team" card has hired in this run, as plain data so
 * the optimistic hire is testable without rendering.
 *
 * A hire joins the roster the moment it is asked for (`joining`) and the
 * person moves on at once; the create runs behind them and settles the member
 * as `hired`, or as `failed` with a Retry on its badge.
 */

/** Why a create did not land: a name another hire took first, which a retry
 *  fixes with a free variant, or anything else, which a retry repeats. */
export type HireFailure = "nameTaken" | "failed";

export type RosterStatus =
  | { kind: "joining" }
  | { kind: "hired"; id: string }
  | { kind: "failed"; reason: HireFailure };

/** The name and color an AI Employee wears, and the brief it works to. */
export interface RosterIdentity {
  name: string;
  color: string | undefined;
  brief: AgentRoleContext;
}

export interface RosterMember extends RosterIdentity {
  key: string;
  status: RosterStatus;
  /** What the host holds, or is being asked to create: an edit made on the
   *  card differs from it until it is saved (`team-roster-edit.ts`). */
  saved: RosterIdentity;
  /** Saving an edit failed: the card keeps the edit and says so, and the
   *  next Done tries it again (`rosterRetrySaves`). */
  saveFailed: boolean;
}

/** How one create ended, as the roster records it. */
export type RosterSettlement =
  | { kind: "hired"; id: string; name: string }
  | { kind: "failed"; reason: HireFailure };

export function rosterJoin(
  members: readonly RosterMember[],
  entry: Omit<RosterMember, "status" | "saved" | "saveFailed">,
): RosterMember[] {
  const saved = { name: entry.name, color: entry.color, brief: entry.brief };
  const status: RosterStatus = { kind: "joining" };
  return [...members, { ...entry, saved, saveFailed: false, status }];
}

/**
 * Records how a create ended. A member removed while its create was running
 * stays removed, and only a `joining` member settles: a late answer never
 * overwrites a retry that is already on its way.
 */
export function rosterSettle(
  members: readonly RosterMember[],
  key: string,
  settlement: RosterSettlement,
): RosterMember[] {
  return members.map((member) => {
    if (member.key !== key || member.status.kind !== "joining") return member;
    if (settlement.kind === "failed") {
      return { ...member, status: settlement };
    }
    // The host may tidy the name; the roster shows the one that was created,
    // unless the person renamed the member while it was joining.
    const renamed = member.name !== member.saved.name;
    return {
      ...member,
      name: renamed ? member.name : settlement.name,
      saved: { ...member.saved, name: settlement.name },
      status: { kind: "hired", id: settlement.id },
    };
  });
}

/**
 * A failed member back to `joining`, or null when `key` is not a failed
 * member. A name someone else took is swapped for the first free variant, so
 * the retry is not refused for the same reason again.
 */
export function rosterRetry(
  members: readonly RosterMember[],
  key: string,
  takenNames: readonly string[],
): { members: RosterMember[]; retried: RosterMember } | null {
  const target = members.find((member) => member.key === key);
  if (target?.status.kind !== "failed") return null;
  const others = members
    .filter((member) => member.key !== key)
    .map((member) => member.name);
  const name =
    target.status.reason === "nameTaken"
      ? uniqueAgentName(target.name, [...takenNames, ...others, target.name])
      : target.name;
  const retried: RosterMember = {
    ...target,
    name,
    saved: { name, color: target.color, brief: target.brief },
    status: { kind: "joining" },
  };
  return {
    members: members.map((member) => (member.key === key ? retried : member)),
    retried,
  };
}

/** Drops a member that failed; one that is joining or hired stays. */
export function rosterRemove(
  members: readonly RosterMember[],
  key: string,
): RosterMember[] {
  return members.filter(
    (member) => member.key !== key || member.status.kind !== "failed",
  );
}

/** Where finishing the card stands: nobody to finish with, creates or edits
 *  still saving, a create that failed and needs a Retry (or removing), an
 *  edit that did not save and the next Done tries again, or ready. */
export type TeamFinishState =
  | "empty"
  | "waiting"
  | "failed"
  | "unsaved"
  | "ready";

/**
 * `earlierHires` counts the AI Employees an interrupted first run hired
 * before the card mounted again: they are on the team without being on this
 * mount's roster, so a resumed run finishes without hiring anyone twice.
 */
export function teamFinishState(
  members: readonly RosterMember[],
  earlierHires = 0,
): TeamFinishState {
  const saving = (member: RosterMember) =>
    !member.saveFailed && rosterUnsaved(member) !== null;
  if (
    members.some((member) => member.status.kind === "joining" || saving(member))
  ) {
    return "waiting";
  }
  if (members.some((member) => member.status.kind === "failed")) {
    return "failed";
  }
  if (members.some((member) => member.saveFailed)) return "unsaved";
  return members.length + earlierHires > 0 ? "ready" : "empty";
}

/** Done is offered once someone is on the team and no create needs fixing;
 *  saves still running only make it wait, and one that failed is what the
 *  press tries again. */
export function finishPressable(state: TeamFinishState): boolean {
  return state === "waiting" || state === "unsaved" || state === "ready";
}

/**
 * What a pressed Done (or "Hire my team") does next: keep waiting while
 * creates and saves run, give up the press when one failed (its card says
 * why), or finish.
 */
export function finishStep(
  state: TeamFinishState,
): "wait" | "cancel" | "finish" {
  if (state === "waiting") return "wait";
  return state === "ready" ? "finish" : "cancel";
}
