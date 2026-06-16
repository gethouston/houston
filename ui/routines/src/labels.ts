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

/** Replace `{name}` tokens in `template` with `vars[name]`. Unknown tokens stay. */
export function interp(
  template: string,
  vars: Record<string, string | number>,
): string {
  return template.replace(/\{(\w+)\}/g, (whole, key) =>
    key in vars ? String(vars[key]) : whole,
  )
}

/** Plain-language summary of a cron schedule. `{n}`/`{time}`/`{day}`/`{days}`/`{ordinal}`/`{months}`. */
export interface ScheduleSummaryLabels {
  noSchedule: string
  custom: string
  customCron: string
  every30: string
  everyHourStart: string
  everyMinute: string
  everyNMinutes: string
  everyHour: string
  everyNHours: string
  everyDay: string
  everyNDays: string
  weekly: string
  /** Weekly on a list of days. `{days}` is a localized weekday list. */
  everyWeekOnDays: string
  monthly: string
  /** Custom every-N-months on a day of month. `{ordinal}`/`{n}` day, `{months}` count. */
  everyNMonths: string
}

/** Relative + absolute "next run" phrasing. `{m}`/`{h}`/`{d}`/`{day}`/`{time}`. */
export interface NextFireLabels {
  lessThanMinute: string
  inMinutes: string
  inHoursMinutes: string
  inDaysHours: string
  inDays: string
  today: string
  tomorrow: string
  soon: string
  at: string
}

/** Run-history row strings. `{time}` for the timestamp/usage-limit phrasings. */
export interface RunHistoryLabels {
  empty: string
  view: string
  stopRun: string
  waiting: string
  status: {
    silent: string
    surfaced: string
    running: string
    error: string
    cancelled: string
    paused: string
  }
  today: string
  yesterday: string
  onDate: string
}

/** Schedule builder + picker-field labels. */
export interface ScheduleLabels {
  presets: Record<import("./types").SchedulePreset, string>
  /** Unit names for the custom-interval pills, with singular + plural forms. */
  units: Record<import("./schedule-interval-utils").IntervalUnit, { one: string; other: string }>
  timeLabel: string
  dayOfMonthLabel: string
  /** "Repeat every" — label above the count stepper. */
  repeatEvery: string
  enterNumber: string
  /** Validation hint when the Weekly preset has no day selected. */
  pickDay: string
  /** WeekdaysPicker heading ("On these days"). */
  onTheseDays: string
  /** WeekdaysPicker quick-select chips. */
  shortcuts: { everyDay: string; weekdays: string; weekends: string }
  /** aria-labels for the count stepper's − / + buttons. */
  decrease: string
  increase: string
  /** Accessible names for the time picker's hour / minute / AM-PM columns. */
  timePicker: { hour: string; minute: string; period: string }
  summary: ScheduleSummaryLabels
}

/** RoutineEditor chrome. `{tz}`/`{relative}` tokens on a couple of entries. */
export interface RoutineEditorLabels {
  back: string
  newRoutine: string
  untitled: string
  stop: string
  starting: string
  runNow: string
  saveChanges: string
  createRoutine: string
  moreActions: string
  pauseRoutine: string
  resumeRoutine: string
  deleteRoutine: string
  nameLabel: string
  namePlaceholder: string
  descriptionLabel: string
  descriptionPlaceholder: string
  promptLabel: string
  promptPlaceholder: string
  sectionWhen: string
  sectionBehavior: string
  sectionRecent: string
  nextRun: string
  schedulePreview: string
  schedulePreviewHint: string
  notifyTitle: string
  notifyDescription: string
  chatTitle: string
  chatDescription: string
  modelTitle: string
  modelDescription: string
}

/** RoutinesGrid empty state + meta row. */
export interface RoutinesGridLabels {
  loading: string
  emptyTitle: string
  emptyDescription: string
  descriptionShort: string
  newRoutine: string
  /** Accessible name for the account-wide timezone picker. */
  timezoneLabel: string
  /** One-line hint that the timezone applies to every routine. */
  timezoneHint: string
  /** Placeholder for the timezone picker's keyword search field. */
  timezoneSearchPlaceholder: string
  /** Empty state when no timezone matches the search. */
  timezoneNoResults: string
}

/** RoutineRow meta. `{relative}`/`{time}`/`{n}` tokens on the dynamic entries. */
export interface RoutineRowLabels {
  untitled: string
  next: string
  noNextRun: string
  paused: string
  waiting: string
  justRan: string
  ranMinutes: string
  ranHours: string
  ranDays: string
  pauseRoutine: string
  resumeRoutine: string
}

// English default values, co-located in a sibling file to keep this one small.
export {
  DEFAULT_SCHEDULE_SUMMARY_LABELS,
  DEFAULT_NEXT_FIRE_LABELS,
  DEFAULT_RUN_HISTORY_LABELS,
  DEFAULT_SCHEDULE_LABELS,
  DEFAULT_EDITOR_LABELS,
  DEFAULT_GRID_LABELS,
  DEFAULT_ROW_LABELS,
} from "./labels-default.ts"
