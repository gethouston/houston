import type { SpecimenProp } from "../../../src/specimen";

/**
 * `RoutinesGridProps`, read off `ui/routines/src/routines-grid.tsx`, plus the
 * token utilities the list surface paints with. Data only — the page beside
 * this file renders it.
 */
export const gridProps: readonly SpecimenProp[] = [
  {
    name: "routines",
    type: "Routine[]",
    note: "Sorted here: enabled first, then alphabetical.",
  },
  {
    name: "lastRuns",
    type: "Record<string, RoutineRun>",
    note: "Most recent run per routine id — drives the run ring and Stop.",
  },
  {
    name: "draftActivities",
    type: "RoutineDraft[]",
    note: "Chats still building a routine. Rendered first, above the created rows.",
  },
  {
    name: "accountTimezone",
    type: "string",
    note: "The account-wide IANA zone every schedule fires in. Required.",
  },
  {
    name: "selectedRoutineId / selectedDraftId",
    type: "string | null",
    note: "The row whose chat is open in the right pane.",
  },
  {
    name: "loading",
    type: "boolean",
    note: "Shows the pulsing loading line, but only while there is nothing yet to show.",
  },
  {
    name: "onOpenChat",
    type: "(routineId: string) => void",
    note: "A row click. Changing a routine happens by asking the agent there.",
  },
  {
    name: "onToggle",
    type: "(routineId: string, enabled: boolean) => void",
    note: "The row switch. Omit it and the switch disappears.",
  },
  {
    name: "onRunNow / onStopRun",
    type: "(routineId: string, runId?: string) => void",
    note: "The kebab offers exactly one: Stop while a run is in flight, else Run now.",
  },
  {
    name: "onDeleteRoutine",
    type: "(routineId: string) => void",
    note: "The kebab's destructive item — the row confirms in a dialog first.",
  },
  {
    name: "onResumeDraft / onDiscardDraft",
    type: "(activityId: string) => void",
    note: "The draft row's click target and its trailing discard button.",
  },
  {
    name: "leadingIcon",
    type: "(routine: Routine) => ReactNode",
    note: "The row's identity glyph. `ui/` cannot resolve app logos, so the app supplies them.",
  },
  {
    name: "onScheduleChange",
    type: "(routineId: string, cron: string) => void",
    note: "Supplying it turns a schedule row's summary line into the inline edit affordance.",
  },
  {
    name: "triggerStatuses",
    type: "Record<string, TriggerStatusItem>",
    note: "Live provisioning status per event routine. Absent renders the muted checking chip.",
  },
  {
    name: "triggerSummaries",
    type: "Record<string, string>",
    note: "The humanized event line shown instead of a cron summary.",
  },
  {
    name: "onReconnectTrigger",
    type: "(routineId: string) => void",
    note: "Wired only for a `paused_disconnected` routine.",
  },
  {
    name: "emptyAction",
    type: "ReactNode",
    note: "The primary create button, which lives INSIDE the empty state, not in a header.",
  },
  {
    name: "labels / rowLabels / scheduleLabels",
    type: "RoutinesGridLabels | RoutineRowLabels | ScheduleLabels",
    note: "English defaults; the app passes `t()` results so `ui/` stays i18n-agnostic.",
  },
  {
    name: "scheduleSummaryLabels / nextFireLabels / triggerLabels",
    type: "ScheduleSummaryLabels | NextFireLabels | TriggerLabels",
    note: "Threaded to the pure cron/next-run/trigger formatters.",
  },
  {
    name: "locale",
    type: "string",
    note: 'Defaults to `"en-US"`. Drives day names and clock format via `Intl`.',
  },
];

/** The token utilities the list surface and its rows paint with. */
export const gridTokens: readonly string[] = [
  "bg-transparent",
  "bg-card",
  "bg-hover",
  "bg-hover/40",
  "border-line",
  "border-transparent",
  "ring-focus",
  "text-ink",
  "text-ink-muted",
];
