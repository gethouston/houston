import type { IntervalUnit } from "./schedule-interval-utils";
import type { SchedulePreset } from "./types";

/** Replace `{name}` tokens in `template` with `vars[name]`. Unknown tokens stay. */
export function interp(
  template: string,
  vars: Record<string, string | number>,
): string {
  return template.replace(/\{(\w+)\}/g, (whole, key) =>
    key in vars ? String(vars[key]) : whole,
  );
}

/** Plain-language summary of a cron schedule. `{n}`/`{time}`/`{day}`/`{days}`/`{ordinal}`/`{months}`. */
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
  /** Weekly on a single day. `{day}` is a localized weekday name. */
  weekly: string;
  /** Weekly on chosen days. `{days}` is a localized, joined weekday list. */
  weeklyOnDays: string;
  /** Monthly on a day-of-month. `{ordinal}` (en) or `{n}` (es/pt) day. */
  monthly: string;
  /** Every N months on a day-of-month. `{ordinal}`/`{n}` day, `{months}` count. */
  everyNMonths: string;
}

export type { NextFireLabels } from "./labels-next-fire.ts";

/** Schedule builder + picker-field labels. */
export interface ScheduleLabels {
  presets: Record<SchedulePreset, string>;
  /** Plural unit names for the custom-interval pills (when the count is > 1). */
  units: Record<IntervalUnit, string>;
  /** Singular unit names for the custom-interval pills (when the count is 1). */
  unitsSingular: Record<IntervalUnit, string>;
  timeLabel: string;
  dayOfMonthLabel: string;
  /** "Repeat every" — label above the custom-interval count + unit pills. */
  repeatEvery: string;
  /** "On these days" — label above the weekly day multi-select. */
  weekdaysLabel: string;
  /** Quick weekday-selection chips under the day multi-select. */
  weekdayShortcuts: {
    everyDay: string;
    weekdays: string;
    weekends: string;
  };
  /** aria-labels for the count stepper's minus/plus buttons. */
  decrease: string;
  increase: string;
  /** Validation summary shown when the custom interval count is empty/invalid. */
  enterNumber: string;
  /** Validation summary when the count is over its unit's maximum.
   *  `{max}` is that maximum, `{unit}` the plural unit name. */
  maxInterval: string;
  /** Validation summary shown when the Weekly preset has no day selected. */
  pickDay: string;
  /**
   * Hint under the minutes count when the builder has a `floor` (e.g. a
   * plan's limit). `{minutes}` is the floor's minimum.
   */
  minIntervalHint: string;
  /** Accessible names for the time picker's hour / minute / AM-PM columns. */
  timePicker: { hour: string; minute: string; period: string };
  summary: ScheduleSummaryLabels;
}

/** RoutinesGrid empty state + list-pane chrome. */
export interface RoutinesGridLabels {
  loading: string;
  /** Empty state — a short headline over the text-only hint. Creation happens
   *  in the app-owned pane header, so there is no button here. */
  emptyTitle: string;
  emptyDescription: string;
  /** Accessible name for the selectable list (the listbox container). */
  listLabel: string;
  /** A routine still being set up in chat, not created yet. Clicking its row
   *  resumes it, so the only explicit action left is discard. */
  draftTitle: string;
  draftDiscard: string;
  /** Accessible name for the account-wide timezone picker. */
  timezoneLabel: string;
  /** One-line hint that the timezone applies to every routine. */
  timezoneHint: string;
  /** Placeholder for the timezone picker's keyword search field. */
  timezoneSearchPlaceholder: string;
  /** Empty state when no timezone matches the search. */
  timezoneNoResults: string;
}

/**
 * RoutineRow labels + its controls. Rows are a compact, selectable list:
 * clicking a row opens the routine's own screen; the switch, the three-dot menu
 * (run/stop, delete), and the inline schedule editor are the only other
 * actions. The next-run time now shows as the pure relative string (from
 * `NextFireLabels`), so the row carries no "Next …"/last-run copy of its own.
 * `{name}` on `deleteTitle`.
 */
export interface RoutineRowLabels {
  untitled: string;
  pauseRoutine: string;
  resumeRoutine: string;
  /** Accessible name for the row's own click target — opening the routine's screen. */
  openChat: string;
  /** Accessible name for the inline schedule-summary edit affordance. */
  editSchedule: string;
  /** Commit the inline schedule edit (popover footer). */
  save: string;
  /** Dismiss the inline schedule edit without saving (popover footer). */
  cancel: string;
  /** Three-dot menu trigger. */
  moreActions: string;
  /** Fire the routine immediately (menu, when no run is in flight). */
  runNow: string;
  /** Stop the in-flight run (menu, while a run is running). */
  stopRun: string;
  delete: string;
  /** Delete confirm dialog. `{name}` on the title. */
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
