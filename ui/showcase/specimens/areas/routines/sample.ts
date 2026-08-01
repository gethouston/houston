import type {
  Routine,
  RoutineRun,
  TriggerStatusItem,
} from "@houston-ai/routines";

/**
 * The Routines fixtures every page in this area renders against — one agent's
 * real week: two cron routines, one monthly one it has paused, and one that
 * wakes on a calendar event.
 *
 * Shared so the list page, the row page and the status page all show the SAME
 * four routines: a reviewer comparing a row in isolation against the same row
 * inside the grid is then comparing the component, not the copy.
 */

/** The account-wide zone every schedule below fires in. */
export const TIMEZONE = "America/New_York";

/** The fields every routine carries, filled once so each fixture stays short. */
const base = {
  suppress_when_silent: false,
  chat_mode: "shared" as const,
  created_at: "2026-06-02T13:00:00.000Z",
  updated_at: "2026-07-20T08:14:00.000Z",
};

/** A weekday-morning cron routine — the archetype of the schedule row. */
export const inboxZero: Routine = {
  ...base,
  id: "inbox-zero",
  name: "Inbox Zero",
  prompt: "Triage overnight mail and draft the replies I approve.",
  schedule: "0 8 * * 1-5",
  enabled: true,
  integrations: ["gmail"],
};

/** A Friday-afternoon cron routine, used for the errored-run state. */
export const weeklyReport: Routine = {
  ...base,
  id: "weekly-report",
  name: "Weekly Report",
  prompt: "Pull this week's numbers and write the update for the team.",
  schedule: "0 17 * * 5",
  enabled: true,
  integrations: ["googlesheets"],
};

/** A paused monthly routine — the dimmed row. */
export const expenseFiler: Routine = {
  ...base,
  id: "expense-filer",
  name: "Expense Filer",
  prompt: "File last month's receipts and flag anything over $500.",
  schedule: "0 9 1 * *",
  enabled: false,
  integrations: ["gmail"],
};

/** An event-driven routine — no `schedule`, a Composio trigger binding. */
export const meetingNotes: Routine = {
  ...base,
  id: "meeting-notes",
  name: "Meeting Notes",
  prompt: "Summarize the call and file the follow-ups.",
  trigger: {
    kind: "composio",
    toolkit: "googlecalendar",
    trigger_slug: "GOOGLECALENDAR_EVENT_ENDED",
    trigger_config: {},
  },
  enabled: true,
  integrations: ["googlecalendar"],
};

/** The four fixtures in the order the grid sorts them into. */
export const routines: Routine[] = [
  inboxZero,
  meetingNotes,
  weeklyReport,
  expenseFiler,
];

/** A run in flight — the row's pulsing ring. */
export const runningRun: RoutineRun = {
  id: "run-a1",
  routine_id: inboxZero.id,
  status: "running",
  session_key: "routine:inbox-zero",
  started_at: "2026-07-28T12:00:00.000Z",
};

/** A run asleep on a plan-window usage limit — no ring, an amber meta line. */
export const pausedRun: RoutineRun = {
  ...runningRun,
  paused_until: "5pm (America/Los_Angeles)",
};

/** A run that failed — the row's static danger ring. */
export const erroredRun: RoutineRun = {
  id: "run-b2",
  routine_id: weeklyReport.id,
  status: "error",
  session_key: "routine:weekly-report",
  summary: "Sheets returned 403 — the connected account lost access.",
  started_at: "2026-07-24T21:00:00.000Z",
  completed_at: "2026-07-24T21:00:12.000Z",
};

/** A run that finished and posted to the board. */
export const surfacedRun: RoutineRun = {
  id: "run-c3",
  routine_id: meetingNotes.id,
  status: "surfaced",
  session_key: "routine:meeting-notes",
  activity_id: "activity-4471",
  summary: "3 follow-ups filed from the Monday sync.",
  started_at: "2026-07-27T16:32:00.000Z",
  completed_at: "2026-07-27T16:33:40.000Z",
};

/** A healthy trigger — the green dot. */
export const activeTrigger: TriggerStatusItem = {
  routine_id: meetingNotes.id,
  status: "active",
};

/** A trigger whose account was disconnected — offers Reconnect. */
export const disconnectedTrigger: TriggerStatusItem = {
  routine_id: meetingNotes.id,
  status: "paused_disconnected",
};

/** The humanized event line the app computes and threads in per routine. */
export const TRIGGER_SUMMARY = "When a Google Calendar event ends";
