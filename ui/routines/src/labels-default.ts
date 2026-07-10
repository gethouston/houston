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
    "A routine is your agent working on a schedule, without you asking each time. Describe a task once, and it runs on its own, daily, weekly, or however often you like.",
  emptyStepsTitle: "How it works",
  emptySteps: [
    {
      title: "Tell it what to do",
      description:
        "Describe the task in plain language, like you would to a person.",
    },
    {
      title: "Choose when it runs",
      description:
        "Pick a schedule: every morning, every hour, once a week, whatever fits.",
    },
    {
      title: "Review by asking",
      description:
        "No need to check its work by hand, just ask the assistant what happened.",
    },
  ],
  descriptionShort:
    "Recurring tasks that fire on schedule and only ping you when something needs attention.",
  newRoutine: "New routine",
  newRoutineWithAi: "With AI",
  newRoutineManually: "Manually",
  draftTitle: "Routine being created in chat",
  draftResume: "Resume",
  draftDiscard: "Discard",
  createRoutine: "Create routine",
  timezoneLabel: "Timezone",
  timezoneHint: "All your routines run in this timezone.",
  timezoneSearchPlaceholder: "Search timezones…",
  timezoneNoResults: "No timezones found",
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
  instructionLabel: "Instruction",
  instructionPlaceholder: "What should the agent do when this runs?",
  save: "Save",
  cancel: "Cancel",
};
