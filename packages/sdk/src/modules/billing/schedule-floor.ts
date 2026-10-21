import { scheduleFloorAllows } from "@houston/domain";
import type { OrgBilling } from "@houston/wire-types";

/** A free org's routine floor when its billing omits it. */
const DEFAULT_FREE_MIN_INTERVAL_MINUTES = 15;

/**
 * The minimum minutes between fires a schedule editor may offer, or undefined
 * for no limit: the ACTIVE ORG's tier, on any routine in it. The gateway
 * judges every fire against the org the routine lives in, so a free org holds
 * every save to its floor whoever makes it, and a paid org to none.
 */
export function routineScheduleFloor(
  billing: OrgBilling | null | undefined,
): number | undefined {
  if (billing?.tier !== "free") return undefined;
  return (
    billing.routines?.minIntervalMinutes ?? DEFAULT_FREE_MIN_INTERVAL_MINUTES
  );
}

/**
 * A floor as a schedule editor and its save check bind it: the minimum it
 * names, and the one rule that judges a cron against it. The minutes stepper
 * starts at the lowest count `allows` accepts and Save is judged by `allows`
 * itself, so the picker, the save check and the host's routine-write gate
 * never disagree.
 */
export interface RoutineScheduleFloor {
  minutes: number;
  allows: (cron: string) => boolean;
}

export function scheduleFloorRule(minutes: number): RoutineScheduleFloor {
  return { minutes, allows: (cron) => scheduleFloorAllows(cron, minutes) };
}

/**
 * The rule itself: a cron is judged by its smallest REAL gap between fires.
 * Lives in `@houston/domain` so the host's routine-write gate judges a save
 * by the same function.
 */
export { scheduleFloorAllows };
