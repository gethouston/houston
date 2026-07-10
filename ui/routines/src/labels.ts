/**
 * Localization labels for the Routines UI.
 *
 * `ui/` stays i18n-agnostic per the library boundary: components and the pure
 * schedule/time formatters take optional `labels` (with English defaults) and a
 * `locale`, and the app passes `t()` results in. Static strings are plain; the
 * dynamic ones carry `{token}` placeholders filled by `interp()`.
 *
 * Why `{token}` (single brace) and not i18next's `{{token}}`: the app sources
 * these templates with `t(key, { returnObjects: true })` WITHOUT interpolation
 * values (the numbers/times are computed here in `ui/`, not at the call site).
 * Double-brace tokens would be eaten by i18next; single-brace ones survive and
 * are filled here. The locale validator only checks `{{ }}` parity, so `{token}`
 * is invisible to it — keep the tokens identical across en/es/pt by hand.
 *
 * Day names, month names, AM/PM and date order come from `Intl.*Format(locale)`,
 * so they localize without per-language strings.
 *
 * The English default values live in `./labels-default` (re-exported below) to
 * keep this file focused on the type contracts.
 */

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

/** Relative + absolute "next run" phrasing. `{m}`/`{h}`/`{d}`/`{day}`/`{time}`. */
export interface NextFireLabels {
  lessThanMinute: string;
  inMinutes: string;
  inHoursMinutes: string;
  inDaysHours: string;
  inDays: string;
  today: string;
  tomorrow: string;
  soon: string;
  at: string;
}

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
  /** Validation summary shown when the Weekly preset has no day selected. */
  pickDay: string;
  /** Accessible names for the time picker's hour / minute / AM-PM columns. */
  timePicker: { hour: string; minute: string; period: string };
  summary: ScheduleSummaryLabels;
}

/** A single step in the empty state's "how it works" walkthrough. */
export interface RoutineHowItWorksStep {
  title: string;
  description: string;
}

/** RoutinesGrid empty state + meta row. */
export interface RoutinesGridLabels {
  loading: string;
  emptyTitle: string;
  emptyDescription: string;
  /** Heading above the 3-step walkthrough in the empty state. */
  emptyStepsTitle: string;
  /** The walkthrough itself: describe the task, set a schedule, review in chat. */
  emptySteps: RoutineHowItWorksStep[];
  descriptionShort: string;
  /** "New routine" split-button trigger + its two menu entries. */
  newRoutine: string;
  newRoutineWithAi: string;
  newRoutineManually: string;
  /** A routine still being set up in chat, not created yet. */
  draftTitle: string;
  draftResume: string;
  draftDiscard: string;
  /** Save button on the local new-routine editor. */
  createRoutine: string;
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
 * RoutineRow meta + its inline edit panel (name/schedule/instruction) and
 * three-dot menu (run/stop, edit, delete). `{relative}`/`{time}`/`{n}` tokens
 * on the dynamic entries; `{name}` on `deleteTitle`.
 */
export interface RoutineRowLabels {
  untitled: string;
  next: string;
  noNextRun: string;
  paused: string;
  waiting: string;
  justRan: string;
  ranMinutes: string;
  ranHours: string;
  ranDays: string;
  pauseRoutine: string;
  resumeRoutine: string;
  /** Three-dot menu trigger. */
  moreActions: string;
  /** Fire the routine immediately (menu, when no run is in flight). */
  runNow: string;
  /** Stop the in-flight run (menu, while a run is running). */
  stopRun: string;
  /** Opens the inline edit panel (name/schedule/instruction). */
  editManually: string;
  /** Opens the routine's chat to change it by asking instead. */
  editWithAi: string;
  delete: string;
  /** Delete confirm dialog. `{name}` on the title. */
  deleteTitle: string;
  deleteDescription: string;
  deleteConfirm: string;
  deleteCancel: string;
  /** Inline edit panel fields. */
  nameLabel: string;
  namePlaceholder: string;
  /** The prompt sent to the agent when the routine fires — framed to the
   *  user as an instruction, not a technical "prompt". */
  instructionLabel: string;
  instructionPlaceholder: string;
  save: string;
  cancel: string;
}

// English default values, co-located in a sibling file to keep this one small.
export {
  DEFAULT_GRID_LABELS,
  DEFAULT_NEXT_FIRE_LABELS,
  DEFAULT_ROW_LABELS,
  DEFAULT_SCHEDULE_LABELS,
  DEFAULT_SCHEDULE_SUMMARY_LABELS,
} from "./labels-default.ts";
