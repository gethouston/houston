/**
 * Keeps ScheduleBuilder's own state in step with the two inputs that can
 * change after it opens: the schedule `value` (edited outside the builder) and the
 * plan's floor (it loads after the editor opens). Split out of
 * useScheduleBuilder to keep that hook small.
 */
import { type MutableRefObject, useEffect, useMemo } from "react";
import { cronToOptions, cronToPreset } from "./schedule-cron-utils";
import {
  defaultMinutesCount,
  floorMinuteMinimum,
  type ScheduleFloor,
} from "./schedule-floor";
import { scheduleToInterval } from "./schedule-interval-utils";

/** What an outside schedule re-derives the picker to. */
export interface OutsidePick {
  preset: ReturnType<typeof cronToPreset> & string;
  options: ReturnType<typeof cronToOptions>;
  interval: ReturnType<typeof scheduleToInterval>;
}

/**
 * Re-derive the picker when the schedule changes OUTSIDE this builder — the
 * setup chat's agent editing the open routine (HOU-725). Without this the
 * saved schedule and the "next run" preview move while the preset/time fields
 * keep showing the old values. A `value` equal to what the current state
 * emits (`emitted`) is our own echo through the parent — skipped, so
 * mid-edit typing never resets the fields. The re-derived state round-trips
 * to `value`, so the emit effect's follow-up call is a no-op echo.
 */
export function useOutsideScheduleSync(
  value: string,
  emitted: string,
  apply: (pick: OutsidePick) => void,
): void {
  /* oxlint-disable react-hooks/exhaustive-deps -- sync on the incoming value only — `emitted` is derived from the state this effect sets, and reacting to it would fight the user's edits */
  useEffect(() => {
    if (!value.trim() || value === emitted) return;
    const preset = cronToPreset(value);
    const interval = preset === "custom" ? scheduleToInterval(value) : null;
    // An externally-written schedule the picker can't represent: leave the
    // state alone — the value prop still drives the summary and saving.
    if (preset === "custom" && !interval) return;
    apply({
      preset: preset ?? "daily",
      options: cronToOptions(value),
      interval,
    });
  }, [value]);
  /* oxlint-enable react-hooks/exhaustive-deps */
}

/**
 * The lowest minutes count the floor's rule accepts (null: none; undefined: no
 * floor). The caller keeps `floor` stable (memoized on its minutes), so the
 * scan runs when the plan changes, not on every render.
 */
export function useFloorMinuteMinimum(
  floor: ScheduleFloor | undefined,
): number | null | undefined {
  return useMemo(
    () => (floor ? floorMinuteMinimum(floor) : undefined),
    [floor],
  );
}

/**
 * While the count is still the builder's own default (not read from `value`,
 * not edited, unit untouched), a floor that arrives late moves it onto an
 * offered count. A count read from a saved schedule stays as it is.
 */
export function useLateFloorDefault(
  minimum: number | null | undefined,
  countIsDefault: MutableRefObject<boolean>,
  setEvery: (update: (every: string) => string) => void,
): void {
  /* oxlint-disable react-hooks/exhaustive-deps -- react to the floor arriving; the ref and setter are stable */
  useEffect(() => {
    if (!countIsDefault.current || minimum == null) return;
    setEvery((every) =>
      Number(every) >= minimum ? every : String(defaultMinutesCount(minimum)),
    );
  }, [minimum]);
  /* oxlint-enable react-hooks/exhaustive-deps */
}
