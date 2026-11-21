import type { IntervalUnit } from "./schedule-interval-utils";
import type { SchedulePreset } from "./types";

export function interp(
  template: string,
  vars: Record<string, string | number>,
): string {
  return template.replace(/\{(\w+)\}/g, (whole, key) =>
    key in vars ? String(vars[key]) : whole,
  );
}

export interface ScheduleSummaryLabels {
  noSchedule: string;
  custom: string;
  customCron: string;
  every30: string;
  everyHourStart: string;
  everyMinute: string;
  everyNMinutes: string;
  everyHour: string;
  everyNHours: string;
  everyDay: string;
  everyNDays: string;
  weekly: string;
  weeklyOnDays: string;
  monthly: string;
  everyNMonths: string;
}

export type { NextFireLabels } from "./labels-next-fire.ts";

export interface ScheduleLabels {
  presets: Record<SchedulePreset, string>;
  units: Record<IntervalUnit, string>;
  unitsSingular: Record<IntervalUnit, string>;
  timeLabel: string;
  dayOfMonthLabel: string;
  repeatEvery: string;
  weekdaysLabel: string;
  weekdayShortcuts: {
    everyDay: string;
    weekdays: string;
    weekends: string;
  };
  decrease: string;
  increase: string;
  enterNumber: string;
  maxInterval: string;
  pickDay: string;
  minIntervalHint: string;
  timePicker: { hour: string; minute: string; period: string };
  summary: ScheduleSummaryLabels;
}

export interface RoutinesGridLabels {
  loading: string;
  emptyTitle: string;
  emptyDescription: string;
  listLabel: string;
  draftTitle: string;
  draftDiscard: string;
  timezoneLabel: string;
  timezoneHint: string;
  timezoneSearchPlaceholder: string;
  timezoneNoResults: string;
}

export interface RoutineRowLabels {
  untitled: string;
  pauseRoutine: string;
  resumeRoutine: string;
  openChat: string;
  editSchedule: string;
  save: string;
  cancel: string;
  moreActions: string;
  runNow: string;
  stopRun: string;
  delete: string;
  deleteTitle: string;
  deleteDescription: string;
  deleteConfirm: string;
  deleteCancel: string;
}

export {
  DEFAULT_GRID_LABELS,
  DEFAULT_NEXT_FIRE_LABELS,
  DEFAULT_ROW_LABELS,
  DEFAULT_SCHEDULE_LABELS,
  DEFAULT_SCHEDULE_SUMMARY_LABELS,
  DEFAULT_TRIGGER_LABELS,
} from "./labels-default.ts";
export type { TriggerLabels, TriggerStatusLabels } from "./labels-trigger.ts";
