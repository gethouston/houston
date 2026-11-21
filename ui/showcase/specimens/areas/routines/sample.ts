import type {
  Routine,
  RoutineRun,
  TriggerStatusItem,
} from "@houston-ai/routines";

export const TIMEZONE = "America/New_York";

const base = {
  suppress_when_silent: false,
  chat_mode: "shared" as const,
  created_at: "2026-06-02T13:00:00.000Z",
  updated_at: "2026-07-20T08:14:00.000Z",
};

export const inboxZero: Routine = {
  ...base,
  id: "inbox-zero",
  name: "Inbox Zero",
  prompt: "Triage overnight mail and draft the replies I approve.",
  schedule: "0 8 * * 1-5",
  enabled: true,
  integrations: ["gmail"],
};

export const weeklyReport: Routine = {
  ...base,
  id: "weekly-report",
  name: "Weekly Report",
  prompt: "Pull this week's numbers and write the update for the team.",
  schedule: "0 17 * * 5",
  enabled: true,
  integrations: ["googlesheets"],
};

export const expenseFiler: Routine = {
  ...base,
  id: "expense-filer",
  name: "Expense Filer",
  prompt: "File last month's receipts and flag anything over $500.",
  schedule: "0 9 1 * *",
  enabled: false,
  integrations: ["gmail"],
};

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

export const routines: Routine[] = [
  inboxZero,
  meetingNotes,
  weeklyReport,
  expenseFiler,
];

export const runningRun: RoutineRun = {
  id: "run-a1",
  routine_id: inboxZero.id,
  status: "running",
  session_key: "routine:inbox-zero",
  started_at: "2026-07-28T12:00:00.000Z",
};

export const pausedRun: RoutineRun = {
  ...runningRun,
  paused_until: "5pm (America/Los_Angeles)",
};

export const erroredRun: RoutineRun = {
  id: "run-b2",
  routine_id: weeklyReport.id,
  status: "error",
  session_key: "routine:weekly-report",
  summary: "Sheets returned 403 — the connected account lost access.",
  started_at: "2026-07-24T21:00:00.000Z",
  completed_at: "2026-07-24T21:00:12.000Z",
};

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

export const activeTrigger: TriggerStatusItem = {
  routine_id: meetingNotes.id,
  status: "active",
};

export const disconnectedTrigger: TriggerStatusItem = {
  routine_id: meetingNotes.id,
  status: "paused_disconnected",
};

export const TRIGGER_SUMMARY = "When a Google Calendar event ends";
