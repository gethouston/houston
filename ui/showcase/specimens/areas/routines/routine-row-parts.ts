import type { SpecimenProp } from "../../../src/specimen";

/**
 * `RoutineRowProps`, read off `ui/routines/src/routine-row.tsx`, plus the token
 * utilities the row and its status ring paint with. Data only — the page beside
 * this file renders it.
 */
export const rowProps: readonly SpecimenProp[] = [
  {
    name: "routine",
    type: "Routine",
    note: "Required. `schedule` or `trigger` decides which of the two summary lines the row shows.",
  },
  {
    name: "lastRun",
    type: "RoutineRun",
    note: "The most recent run — drives the ring, the amber waiting meta and Run now vs Stop.",
  },
  {
    name: "accountTimezone",
    type: "string",
    note: "Required IANA zone. The trailing relative next-run time is computed in it.",
  },
  {
    name: "selected",
    type: "boolean",
    note: "Defaults to `false`. Marks the row whose chat is open; sets `aria-selected`.",
  },
  {
    name: "onOpenChat",
    type: "() => void",
    note: "Makes the whole row the click target (click, Enter, Space). Omit it and the row is inert.",
  },
  {
    name: "onToggle",
    type: "(enabled: boolean) => void",
    note: "The trailing switch. Its click never bubbles, so pausing never opens the chat.",
  },
  {
    name: "onRunNow / onStopRun",
    type: "() => void",
    note: "The row offers exactly one: Stop while a run is in flight, else Run now.",
  },
  {
    name: "onDelete",
    type: "() => void",
    note: "The kebab's destructive item; the menu confirms in a dialog before calling it.",
  },
  {
    name: "leadingIcon",
    type: "(routine: Routine) => ReactNode",
    note: "The identity slot. Absent or `null` falls back to a clock (schedule) or a bell (trigger).",
  },
  {
    name: "onScheduleChange",
    type: "(routineId: string, cron: string) => void",
    note: "With a `schedule` present, turns the summary line into the inline pencil affordance.",
  },
  {
    name: "triggerStatus",
    type: "TriggerStatusItem",
    note: "An event routine's live health. Absent renders the muted checking chip, never nothing.",
  },
  {
    name: "triggerSummary",
    type: "string",
    note: "The humanized event, shown after the status chip. Falls back to `triggerLabels.wakeEvent`.",
  },
  {
    name: "onReconnectTrigger",
    type: "() => void",
    note: "Shown only for `paused_disconnected` — the one-click recovery, never hover-gated.",
  },
  {
    name: "labels / scheduleLabels",
    type: "RoutineRowLabels | ScheduleLabels",
    note: "English defaults; the app passes `t()` results so `ui/` stays i18n-agnostic.",
  },
  {
    name: "scheduleSummaryLabels / nextFireLabels / triggerLabels",
    type: "ScheduleSummaryLabels | NextFireLabels | TriggerLabels",
    note: "Threaded to the pure cron, next-run and trigger formatters.",
  },
  {
    name: "locale",
    type: "string",
    note: 'Defaults to `"en-US"`. Day names and clock format come from `Intl`.',
  },
];

/** The token utilities the row, its ring and its inline editor paint with. */
export const rowTokens: readonly string[] = [
  "bg-card",
  "bg-hover",
  "bg-hover/40",
  "border-line",
  "border-transparent",
  "ring-focus",
  "ring-focus/40",
  "ring-danger/40",
  "text-ink",
  "text-ink-muted",
  "text-ink-muted/60",
];
