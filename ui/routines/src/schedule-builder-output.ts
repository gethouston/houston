import {
  interp,
  type ScheduleLabels,
  type ScheduleSummaryLabels,
} from "./labels.ts";
import { presetToCron, type ScheduleOptions } from "./schedule-cron-utils.ts";
import { pickAllowed, type ScheduleFloor } from "./schedule-floor.ts";
import {
  type IntervalUnit,
  intervalCountAllowed,
  intervalCountMax,
  intervalToSchedule,
} from "./schedule-interval-utils.ts";
import { cronSummary, presetSummary } from "./schedule-summary.ts";
import type { SchedulePreset } from "./types";

export interface BuilderPick {
  activePreset: SchedulePreset;
  options: ScheduleOptions;
  intervalEvery: string;
  intervalUnit: IntervalUnit;
  floor?: ScheduleFloor;
}

export interface BuilderOutput {
  everyValid: boolean;
  overMax: boolean;
  weeklyValid: boolean;
  floorOk: boolean;
  picked: string;
  schedule: string;
}

export function builderOutput(pick: BuilderPick): BuilderOutput {
  const { activePreset, options, intervalEvery, intervalUnit, floor } = pick;
  const every = Number(intervalEvery);
  const typed = intervalEvery.trim() !== "" && Number.isInteger(every);
  const everyValid = typed && intervalCountAllowed(every, intervalUnit);
  const overMax = typed && every > intervalCountMax(intervalUnit);
  const weeklyValid =
    activePreset !== "weekly" || options.daysOfWeek.length > 0;
  let picked = "";
  if (activePreset === "custom") {
    if (everyValid) {
      picked = intervalToSchedule(
        { every, unit: intervalUnit, dayOfMonth: options.dayOfMonth },
        options.time,
      );
    }
  } else if (weeklyValid) {
    picked = presetToCron(activePreset, options);
  }
  const floorOk = pickAllowed(picked, floor);
  const schedule = floorOk ? picked : "";
  return { everyValid, overMax, weeklyValid, floorOk, picked, schedule };
}

export function builderEmits(touched: boolean, value: string): boolean {
  return touched || value.trim() === "";
}

export function builderSummary(
  pick: BuilderPick,
  output: BuilderOutput,
  saved: { touched: boolean; value: string },
  labels: Pick<
    ScheduleLabels,
    "enterNumber" | "maxInterval" | "pickDay" | "units"
  > & { summary: ScheduleSummaryLabels },
  locale: string,
): string {
  if (!builderEmits(saved.touched, saved.value)) {
    return cronSummary(saved.value, labels.summary, locale);
  }
  if (pick.activePreset !== "custom") {
    return output.weeklyValid
      ? presetSummary(pick.activePreset, pick.options, labels.summary, locale)
      : labels.pickDay;
  }
  if (output.everyValid) {
    return cronSummary(output.picked, labels.summary, locale);
  }
  if (output.overMax) {
    return interp(labels.maxInterval, {
      max: new Intl.NumberFormat(locale).format(
        intervalCountMax(pick.intervalUnit),
      ),
      unit: labels.units[pick.intervalUnit],
    });
  }
  return labels.enterNumber;
}
