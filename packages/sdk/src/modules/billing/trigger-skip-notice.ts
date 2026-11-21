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

export type TriggerPlanSkipReason =
  | "min_interval"
  | "routine_limit"
  | "routine_limit_paused"
  | "inactive_paused"
  | "inactive_resumed"
  | "creator_plan"
  | "org_locked";

export type TriggerPlanSkipAction = "resume" | "keep_routine" | "upgrade";

interface NoticeBase {
  count: number;
  lastAt: string;
  actions: TriggerPlanSkipAction[];
}

export type TriggerPlanSkipNotice =
  | (NoticeBase & { reason: "min_interval"; minIntervalMinutes: number })
  | (NoticeBase & { reason: Exclude<TriggerPlanSkipReason, "min_interval"> });

export interface TriggerPlanSkipViewer {
  createdBy: string | undefined;
  viewerId: string | null | undefined;
  agentSlug: string;
  plusOffer: boolean;
}

const DEFAULT_MIN_INTERVAL_MINUTES = 15;

export function triggerPlanSkipNotice(
  item: TriggerStatusItem | undefined,
  billing: OrgBilling | null | undefined,
  viewer: TriggerPlanSkipViewer,
): TriggerPlanSkipNotice | null {
  const skipped = item?.plan_skipped;
  if (!item || !skipped || skipped.count < 1 || !knownCode(skipped))
    return null;
  const base = { count: skipped.count, lastAt: skipped.last_at };
  if (viewer.createdBy && !viewer.viewerId) return null;
  if (!viewerIsRoutineCreator(viewer.createdBy, viewer.viewerId))
    return { ...base, reason: "creator_plan", actions: [] };
  if (billing?.tier !== "free") return null;
  const notice =
    billing.status === "locked"
      ? {
          ...base,
          reason: "org_locked" as const,
          actions: ["upgrade" as const],
        }
      : freeOrgNotice(skipped, item.routine_id, billing, viewer, base);
  if (!notice) return null;
  return viewer.plusOffer
    ? notice
    : {
        ...notice,
        actions: notice.actions.filter((action) => action !== "upgrade"),
      };
}

function freeOrgNotice(
  skipped: TriggerPlanSkipped,
  routineId: string,
  billing: OrgBilling,
  viewer: TriggerPlanSkipViewer,
  base: Omit<NoticeBase, "actions">,
): TriggerPlanSkipNotice | null {
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
      if (isKept(routines, routineId, viewer.agentSlug)) return null;
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

function knownCode(skipped: TriggerPlanSkipped): boolean {
  return (
    skipped.code === "plan_min_interval" ||
    skipped.code === "plan_routine_limit" ||
    skipped.code === "plan_inactive"
  );
}

function isKept(
  routines: OrgBilling["routines"],
  routineId: string,
  agentSlug: string,
): boolean {
  const kept = routines?.kept;
  return kept?.routineId === routineId && kept.agentSlug === agentSlug;
}
