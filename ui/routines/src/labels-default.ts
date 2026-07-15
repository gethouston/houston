/**
 * English default values for every Routines label group. Kept separate from the
 * interface declarations in `./labels` so each file stays small. Re-exported
 * from `./labels`, so consumers import everything from one place.
 *
 * These mirror `app/src/locales/en/routines.json`; keep them in sync.
 */

import type {
  NextFireLabels,
  RoutineRowLabels,
  RoutinesGridLabels,
  ScheduleLabels,
  ScheduleSummaryLabels,
  TriggerLabels,
} from "./labels";
import { SCHEDULE_PRESET_LABELS } from "./types.ts";

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
  weekly: "Runs every {day} at {time}",
  weeklyOnDays: "Runs every week on {days} at {time}",
  monthly: "Runs on the {ordinal} of every month at {time}",
  everyNMonths: "Runs on the {ordinal} of every {months} months at {time}",
};

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
};

export const DEFAULT_SCHEDULE_LABELS: ScheduleLabels = {
  presets: SCHEDULE_PRESET_LABELS,
  units: {
    minutes: "minutes",
    hours: "hours",
    days: "days",
    months: "months",
  },
  unitsSingular: {
    minutes: "minute",
    hours: "hour",
    days: "day",
    months: "month",
  },
  timeLabel: "Time",
  dayOfMonthLabel: "Day of month",
  repeatEvery: "Repeat every",
  weekdaysLabel: "On these days",
  weekdayShortcuts: {
    everyDay: "Every day",
    weekdays: "Weekdays",
    weekends: "Weekends",
  },
  decrease: "Decrease",
  increase: "Increase",
  enterNumber: "Enter a number",
  pickDay: "Pick at least one day",
  timePicker: { hour: "Hour", minute: "Minute", period: "AM/PM" },
  summary: DEFAULT_SCHEDULE_SUMMARY_LABELS,
};

export const DEFAULT_GRID_LABELS: RoutinesGridLabels = {
  loading: "Loading…",
  emptyTitle: "Set it and forget it",
  emptyDescription:
    "An automation is your agent working on its own, without you asking each time. Describe a task once, choose when it should happen, and it takes care of the rest.",
  descriptionShort:
    "Work your agent does on its own, pinging you only when something needs attention.",
  sectionActive: "Active",
  sectionPaused: "Paused",
  newRoutine: "New automation",
  newRoutineWithAi: "With AI",
  newRoutineManually: "Manually",
  draftTitle: "Automation being created in chat",
  draftResume: "Resume",
  draftDiscard: "Discard",
  createRoutine: "Create automation",
  timezoneLabel: "Timezone",
  timezoneHint: "All your scheduled automations run in this timezone.",
  timezoneSearchPlaceholder: "Search timezones…",
  timezoneNoResults: "No timezones found",
};

export const DEFAULT_TRIGGER_LABELS: TriggerLabels = {
  wakeEvent: "When something happens",
  chooseApp: "Which app should wake it?",
  chooseEvent: "What should wake it?",
  changeApp: "Change app",
  noApps: "Connect an app first to have a routine wake on events.",
  connectApp: "Connect an app",
  loadingEvents: "Loading events…",
  noEvents: "This app has no events to wake on yet.",
  pollHint: "Checks every few minutes",
  accountLabel: "Account",
  detailsTitle: "Details",
  rawJsonLabel: "Advanced settings",
  rawJsonHint: "Enter this event's settings as JSON.",
  rawJsonInvalid: "This needs to be valid JSON.",
  status: {
    active: "Active",
    pending: "Setting up…",
    paused_disconnected: "Reconnect needed",
    paused_revoked: "Access turned off",
    error: "Needs attention",
  },
  reconnect: "Reconnect",
  statusDisconnectedHint: "The connected account was disconnected.",
  statusRevokedHint: "This app was turned off for this agent.",
};

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
  moreActions: "More actions",
  runNow: "Run now",
  stopRun: "Stop run",
  editManually: "Edit manually",
  editWithAi: "Edit with AI",
  delete: "Delete",
  deleteTitle: "Delete {name}?",
  deleteDescription: "This can't be undone. Its chat history stays untouched.",
  deleteConfirm: "Delete",
  deleteCancel: "Cancel",
  nameLabel: "Name",
  namePlaceholder: "e.g. Morning standup",
  whenTitle: "When should this happen?",
  whenSchedule: "On a schedule",
  whenScheduleHint: "Every morning, once a week, you choose",
  whenEvent: "When something happens",
  whenEventHint: "A new email, a message, a change in an app",
  instructionLabel: "Instruction",
  instructionPlaceholder: "What should the agent do when this runs?",
  save: "Save",
  cancel: "Cancel",
};
