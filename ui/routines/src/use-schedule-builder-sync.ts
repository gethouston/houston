import { type MutableRefObject, useEffect, useMemo } from "react";
import { cronToOptions, cronToPreset } from "./schedule-cron-utils";
import {
  defaultMinutesCount,
  floorMinuteMinimum,
  type ScheduleFloor,
} from "./schedule-floor";
import { scheduleToInterval } from "./schedule-interval-utils";

export interface OutsidePick {
  preset: ReturnType<typeof cronToPreset> & string;
  options: ReturnType<typeof cronToOptions>;
  interval: ReturnType<typeof scheduleToInterval>;
}

export function useOutsideScheduleSync(
  value: string,
  emitted: string,
  apply: (pick: OutsidePick) => void,
): void {
  // biome-ignore lint/correctness/useExhaustiveDependencies: sync on the incoming value only — `emitted` is derived from the state this effect sets, and reacting to it would fight the user's edits
  useEffect(() => {
    if (!value.trim() || value === emitted) return;
    const preset = cronToPreset(value);
    const interval = preset === "custom" ? scheduleToInterval(value) : null;
    if (preset === "custom" && !interval) return;
    apply({
      preset: preset ?? "daily",
      options: cronToOptions(value),
      interval,
    });
  }, [value]);
}

export function useFloorMinuteMinimum(
  floor: ScheduleFloor | undefined,
): number | null | undefined {
  return useMemo(
    () => (floor ? floorMinuteMinimum(floor) : undefined),
    [floor],
  );
}

export function useLateFloorDefault(
  minimum: number | null | undefined,
  countIsDefault: MutableRefObject<boolean>,
  setEvery: (update: (every: string) => string) => void,
): void {
  // biome-ignore lint/correctness/useExhaustiveDependencies: react to the floor arriving; the ref and setter are stable
  useEffect(() => {
    if (!countIsDefault.current || minimum == null) return;
    setEvery((every) =>
      Number(every) >= minimum ? every : String(defaultMinutesCount(minimum)),
    );
  }, [minimum]);
}
