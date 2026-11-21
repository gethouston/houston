import { scheduleFloorAllows } from "@houston/domain";
import type { OrgBilling } from "@houston/wire-types";

const DEFAULT_FREE_MIN_INTERVAL_MINUTES = 15;

export function routineScheduleFloor(
  billing: OrgBilling | null | undefined,
): number | undefined {
  if (billing?.tier !== "free") return undefined;
  return (
    billing.routines?.minIntervalMinutes ?? DEFAULT_FREE_MIN_INTERVAL_MINUTES
  );
}

export interface RoutineScheduleFloor {
  minutes: number;
  allows: (cron: string) => boolean;
}

export function scheduleFloorRule(minutes: number): RoutineScheduleFloor {
  return { minutes, allows: (cron) => scheduleFloorAllows(cron, minutes) };
}

export { scheduleFloorAllows };
