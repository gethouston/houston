import { presetToCron, type ScheduleOptions } from "./schedule-cron-utils.ts";
import {
  type IntervalUnit,
  intervalCountMax,
  intervalToSchedule,
} from "./schedule-interval-utils.ts";
import type { SchedulePreset } from "./types.ts";

export interface ScheduleFloor {
  /** The minimum, in minutes: what the hint under the minutes count names. */
  minutes: number;
  /** Whether a schedule fires no more often than the floor allows. */
  allows: (schedule: string) => boolean;
}

const MAX_MINUTES = intervalCountMax("minutes");

export function floorMinuteMinimum(floor: ScheduleFloor): number | null {
  for (let n = 1; n <= MAX_MINUTES; n += 1)
    if (
      floor.allows(intervalToSchedule({ every: n, unit: "minutes" }, "00:00"))
    )
      return n;
  return null;
}

export function defaultMinutesCount(
  minimum: number | null | undefined,
): number {
  return minimum == null ? 5 : Math.max(5, minimum);
}

function typedCount(every: string): number | null {
  const n = Number(every);
  return every.trim() !== "" && Number.isInteger(n) && n >= 1 ? n : null;
}

export function countForUnitSwitch(
  every: string,
  unit: IntervalUnit,
  minimum: number | null | undefined,
): string | null {
  const n = typedCount(every);
  if (minimum == null || unit !== "minutes" || n === null) return null;
  return n < minimum ? String(minimum) : null;
}

export interface FloorStepper {
  down: (() => void) | null;
  up: () => void;
  commit: () => void;
}

export function floorStepper(
  every: string,
  unit: IntervalUnit,
  minimum: number | null | undefined,
  set: (every: number) => void,
): FloorStepper | undefined {
  if (minimum === undefined || unit !== "minutes") return undefined;
  if (minimum === null) return { down: null, up: () => {}, commit: () => {} };
  const n = typedCount(every);
  const lower = n === null ? null : Math.min(MAX_MINUTES, n - 1);
  return {
    down: lower === null || lower < minimum ? null : () => set(lower),
    up: () => set(Math.min(MAX_MINUTES, Math.max(minimum, (n ?? 0) + 1))),
    commit: () => {
      if (n !== null && n < minimum) set(minimum);
    },
  };
}

export function presetAllowed(
  preset: SchedulePreset,
  options: ScheduleOptions,
  floor: ScheduleFloor | undefined,
): boolean {
  if (!floor || preset === "custom") return true;
  return floor.allows(presetToCron(preset, options));
}

export function pickAllowed(
  picked: string,
  floor: ScheduleFloor | undefined,
): boolean {
  return !floor || !picked || floor.allows(picked);
}
