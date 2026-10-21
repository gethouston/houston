import type {
  OrgBilling,
  TriggerPlanSkipped,
  TriggerStatusItem,
} from "@houston/wire-types";
import { viewerIsRoutineCreator } from "../routines/routine-creator";

export type {
  TriggerPlanSkipCode,
  TriggerPlanSkipped,
} from "@houston/wire-types";

/**
 * Why a routine's runs were skipped, as the person needs to hear it.
 *
 * - The inactivity pause splits in two because the remedy differs: while
 *   routines are still paused, resuming fixes it; once they run again,
 *   nothing is left to fix and the notice only explains the gap.
 * - The routine limit splits the same way: while routines are paused the
 *   plan's own dialog answers Resume before it lets anyone choose a routine
 *   to keep, so resuming comes first.
 * - `creator_plan`: the read-only notice for a viewer who did not create the
 *   routine; only its creator is offered the remedies. A routine naming no
 *   creator is the viewer's (`viewerIsRoutineCreator`).
 */
export type TriggerPlanSkipReason =
  | "min_interval"
  | "routine_limit"
  | "routine_limit_paused"
  | "inactive_paused"
  | "inactive_resumed"
  | "creator_plan";

/**
 * What the person can do about it. `upgrade` opens Billing, `keep_routine`
 * opens the free org's "choose a routine to keep" chooser, `resume`
 * resumes routines paused while away (`resumeRoutines`). Listed in the order
 * a surface offers them, primary first.
 */
export type TriggerPlanSkipAction = "resume" | "keep_routine" | "upgrade";

interface NoticeBase {
  /** The runs refused in the last 24 hours. */
  count: number;
  /** ISO time of the most recent refusal. */
  lastAt: string;
  actions: TriggerPlanSkipAction[];
}

export type TriggerPlanSkipNotice =
  | (NoticeBase & { reason: "min_interval"; minIntervalMinutes: number })
  | (NoticeBase & { reason: Exclude<TriggerPlanSkipReason, "min_interval"> });

/** Who is looking at which routine: the routine's creator and agent. */
export interface TriggerPlanSkipViewer {
  /** The routine's `created_by`; absent when the routine names no creator. */
  createdBy: string | undefined;
  /** The signed-in user's id; null while the session is still loading. */
  viewerId: string | null | undefined;
  /** The agent's slug (a hosted agent's client-side id). */
  agentSlug: string;
}

/** A free org's minimum interval when its billing does not state one. */
const DEFAULT_MIN_INTERVAL_MINUTES = 15;

/**
 * The notice for a routine whose trigger runs the active free org refused, or
 * null when there is nothing to say. Webhook and app events the org's rules
 * refuse are dropped before they become runs, so without this the person sees
 * a routine that silently ignored them.
 *
 * A viewer who is not the creator gets the read-only `creator_plan` notice.
 * The creator (the viewer,
 * too, for a routine naming no creator, as an Agent Store install or an
 * import leaves it: the same rule the routine's connection badge uses) sees
 * it only while the org is free: on a paid org (or before its billing has
 * loaded, or on a legacy org) the old refusals describe nothing they can act
 * on, and the routine the org now keeps says nothing about the routine limit.
 */
export function triggerPlanSkipNotice(
  item: TriggerStatusItem | undefined,
  billing: OrgBilling | null | undefined,
  viewer: TriggerPlanSkipViewer,
): TriggerPlanSkipNotice | null {
  const skipped = item?.plan_skipped;
  if (!item || !skipped || skipped.count < 1 || !knownCode(skipped))
    return null;
  const base = { count: skipped.count, lastAt: skipped.last_at };
  // Unknown viewer: wait for the session rather than flash the wrong variant.
  if (viewer.createdBy && !viewer.viewerId) return null;
  if (!viewerIsRoutineCreator(viewer.createdBy, viewer.viewerId))
    return { ...base, reason: "creator_plan", actions: [] };
  if (billing?.tier !== "free") return null;

  const routines = billing.routines;
  const paused = routines?.paused === true;
  switch (skipped.code) {
    case "plan_min_interval":
      return {
        ...base,
        reason: "min_interval",
        minIntervalMinutes:
          routines?.minIntervalMinutes ?? DEFAULT_MIN_INTERVAL_MINUTES,
        actions: ["upgrade"],
      };
    case "plan_routine_limit":
      if (isKept(routines, item.routine_id, viewer.agentSlug)) return null;
      return paused
        ? {
            ...base,
            reason: "routine_limit_paused",
            actions: ["resume", "upgrade"],
          }
        : {
            ...base,
            reason: "routine_limit",
            actions: ["keep_routine", "upgrade"],
          };
    case "plan_inactive":
      return paused
        ? { ...base, reason: "inactive_paused", actions: ["resume", "upgrade"] }
        : { ...base, reason: "inactive_resumed", actions: ["upgrade"] };
  }
}

/** A code from a newer gateway: a notice that guessed would name the wrong reason. */
function knownCode(skipped: TriggerPlanSkipped): boolean {
  return (
    skipped.code === "plan_min_interval" ||
    skipped.code === "plan_routine_limit" ||
    skipped.code === "plan_inactive"
  );
}

/**
 * Whether this routine is the one the free org keeps. The kept key names the
 * agent too, so a stale key naming the same routine id under another agent
 * never hides a notice the gateway is still refusing for.
 */
function isKept(
  routines: OrgBilling["routines"],
  routineId: string,
  agentSlug: string,
): boolean {
  const kept = routines?.kept;
  return kept?.routineId === routineId && kept.agentSlug === agentSlug;
}
