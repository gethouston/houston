/**
 * English default values for every Routines label group. Kept separate from the
 * interface declarations in `./labels` so each file stays small. Re-exported
 * from `./labels`, so consumers import everything from one place.
 *
 * These mirror `app/src/locales/en/routines.json`; keep them in sync.
 */
import { SCHEDULE_PRESET_LABELS } from "./types.ts"
import type {
  ScheduleSummaryLabels,
  NextFireLabels,
  RunHistoryLabels,
  ScheduleLabels,
  RoutineEditorLabels,
  RoutinesGridLabels,
  RoutineRowLabels,
} from "./labels"

export const DEFAULT_SCHEDULE_SUMMARY_LABELS: ScheduleSummaryLabels = {
  noSchedule: "No schedule set",
  custom: "Custom schedule",
  customCron: "Custom cron schedule",
  every30: "Runs every 30 minutes",
  everyHourStart: "Runs at the start of every hour",
  everyMinute: "Runs every minute",
  everyNMinutes: "Runs every {n} minutes",
  everyHour: "Runs every hour",
  everyNHours: "Runs every {n} hours",
  everyDay: "Runs every day at {time}",
  everyNDays: "Runs every {n} days at {time}",
  weekdays: "Runs Monday through Friday at {time}",
  weekly: "Runs every {day} at {time}",
  monthly: "Runs on the {ordinal} of every month at {time}",
}

export const DEFAULT_NEXT_FIRE_LABELS: NextFireLabels = {
  lessThanMinute: "in less than a minute",
  inMinutes: "in {m}m",
  inHoursMinutes: "in {h}h {m}m",
  inDaysHours: "in {d}d {h}h",
  inDays: "in {d}d",
  today: "today",
  tomorrow: "tomorrow",
  soon: "soon",
  at: "{day} at {time}",
}

export const DEFAULT_RUN_HISTORY_LABELS: RunHistoryLabels = {
  empty: "No runs yet, this routine hasn't fired.",
  view: "View",
  stopRun: "Stop run",
  waiting: "Waiting for usage limit, resumes at {time}",
  status: {
    silent: "Silent",
    surfaced: "Surfaced",
    running: "Running",
    error: "Error",
    cancelled: "Cancelled",
    paused: "Paused",
  },
  today: "Today, {time}",
  yesterday: "Yesterday, {time}",
  onDate: "{date}, {time}",
}

export const DEFAULT_SCHEDULE_LABELS: ScheduleLabels = {
  presets: SCHEDULE_PRESET_LABELS,
  units: {
    minutes: "minutes",
    hours: "hours",
    days: "days",
  },
  timeLabel: "Time",
  dayLabel: "Day",
  dayOfMonthLabel: "Day of month",
  runEvery: "Run every",
  enterNumber: "Enter a number",
  summary: DEFAULT_SCHEDULE_SUMMARY_LABELS,
}

export const DEFAULT_EDITOR_LABELS: RoutineEditorLabels = {
  back: "Back to routines",
  newRoutine: "New routine",
  untitled: "Untitled routine",
  stop: "Stop",
  starting: "Starting…",
  runNow: "Run now",
  saveChanges: "Save changes",
  createRoutine: "Create routine",
  moreActions: "More actions",
  pauseRoutine: "Pause routine",
  resumeRoutine: "Resume routine",
  deleteRoutine: "Delete routine",
  nameLabel: "Name",
  namePlaceholder: "e.g. Morning standup",
  descriptionLabel: "Description",
  descriptionPlaceholder: "Optional, what this routine is for",
  promptLabel: "Prompt",
  promptPlaceholder: "What should the agent do when this runs?",
  sectionWhen: "When it runs",
  sectionBehavior: "Behavior",
  sectionRecent: "Recent runs",
  nextRun: "Next run {relative}",
  schedulePreview: "Schedule preview",
  schedulePreviewHint: "Pick a valid schedule to see when this routine will fire.",
  notifyTitle: "Only notify when relevant",
  notifyDescription:
    "If the agent has nothing to report, the run won't surface on the board.",
  chatTitle: "Keep results in one chat",
  chatDescription:
    "Every run adds to the same chat. Turn this off to start a new chat each time this routine runs.",
}

export const DEFAULT_GRID_LABELS: RoutinesGridLabels = {
  loading: "Loading…",
  emptyTitle: "Set it and forget it",
  emptyDescription:
    "Routines fire on a schedule and only ping you when something actually needs attention.",
  descriptionShort:
    "Recurring tasks that fire on schedule and only ping you when something needs attention.",
  newRoutine: "New routine",
  timezoneLabel: "Timezone",
  timezoneHint: "All your routines run in this timezone.",
}

export const DEFAULT_ROW_LABELS: RoutineRowLabels = {
  untitled: "Untitled",
  next: "Next {relative}",
  noNextRun: "No next run",
  paused: "Paused",
  waiting: "Waiting · resumes at {time}",
  justRan: "just ran",
  ranMinutes: "ran {n}m ago",
  ranHours: "ran {n}h ago",
  ranDays: "ran {n}d ago",
  pauseRoutine: "Pause routine",
  resumeRoutine: "Resume routine",
}
