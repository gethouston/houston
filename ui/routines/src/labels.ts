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
 * clicking a row opens the routine's chat; the switch, the three-dot menu
 * (run/stop, delete), and the inline schedule editor are the only other
 * actions. The next-run time now shows as the pure relative string (from
 * `NextFireLabels`), so the row carries no "Next …"/last-run copy of its own.
 * `{name}` on `deleteTitle`.
 */
export interface RoutineRowLabels {
  untitled: string;
  pauseRoutine: string;
  resumeRoutine: string;
  /** Accessible name for the row's own click target — opening the routine's chat. */
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

/** Human copy for each live trigger status (C9). Never technical. */
export interface TriggerStatusLabels {
  active: string;
  pending: string;
  paused_disconnected: string;
  paused_revoked: string;
  error: string;
}

/**
 * What an event-trigger routine says once it exists: the plain-language "wakes
 * on an event" summary fallback and the live status badge (incl. its one-click
 * recovery). All human, never "webhook"/"schema"/"instance". Picking the app and
 * choosing the exact event now happen in the setup chat, not a wizard form, so
 * this carries no picker/config-form copy.
 */
export interface TriggerLabels {
  /** Generic "wakes on an event" fallback, shown when an event-driven routine
   *  has no humanized event summary yet. */
  wakeEvent: string;
  /** Status badge + its one-click recovery. */
  status: TriggerStatusLabels;
  /** Muted chip shown while a trigger routine has no status data yet — never a
   *  healthy look. Never reads as "off" either; the status is simply unknown. */
  statusUnknown: string;
  /** Idle line for an active trigger routine that has not fired yet (no runs). */
  waitingFirstEvent: string;
  reconnect: string;
  statusDisconnectedHint: string;
  statusRevokedHint: string;
}

// English default values, co-located in a sibling file to keep this one small.
export {
  DEFAULT_GRID_LABELS,
  DEFAULT_NEXT_FIRE_LABELS,
  DEFAULT_ROW_LABELS,
  DEFAULT_SCHEDULE_LABELS,
  DEFAULT_SCHEDULE_SUMMARY_LABELS,
  DEFAULT_TRIGGER_LABELS,
} from "./labels-default.ts";
