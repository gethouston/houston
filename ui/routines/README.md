# @houston-ai/routines

The Routines list surface: a single full-width list of a person's recurring
agent tasks. It is **chat-first** — the whole row is the open-chat affordance
(clicking anywhere on it opens the routine's chat, where the routine is created
and changed by asking the agent), so there is no separate chat button. Each row
leads with an IDENTITY icon (a clock for a schedule, the triggering app's logo
for an event trigger, supplied by the app via `leadingIcon`), with run state as a
subtle ring around it. Rows otherwise carry the enable/disable switch and a
three-dot menu (Run now / Stop run, Delete). When the app passes
`onScheduleChange`, a schedule routine's summary line becomes an inline,
always-visible edit affordance that opens `ScheduleBuilder` in a popover.
Creation happens in an app-owned composer rendered *above* the grid, so the grid
has no create button and its empty state is a text-only hint. A routine still
being set up in chat shows as its own resumable draft row.

`TimezonePicker` renders the account-wide zone; its `variant` is `"card"`
(default, titled panel) or `"bare"` (just the trigger, for inline toolbars).

The schedule pickers (`ScheduleBuilder`) and the event-trigger pieces
(`TriggerPicker`, `TriggerConfigForm`) are exported for the app to compose into
that creation flow; they are not wired into the grid itself.

The package is i18n-agnostic per the library boundary: components take optional
`labels` props (English defaults in `labels-default.ts`) plus a BCP-47 `locale`,
and the consumer feeds `t()` results in. No store imports, no app types.

## Install

```bash
pnpm add @houston-ai/routines
```

## Usage

```tsx
import { RoutinesGrid } from "@houston-ai/routines"

<RoutinesGrid
  routines={routines}
  lastRuns={lastRuns}
  draftActivities={drafts}          // in-construction chats → resumable rows
  accountTimezone={tz}
  onTimezoneChange={setTz}
  onOpenChat={(id) => …}            // row click / "Open chat" → routine's chat
  onToggle={(id, enabled) => …}
  onRunNow={(id) => …}
  onStopRun={(id, runId) => …}
  onDeleteRoutine={(id) => …}
  onResumeDraft={(activityId) => …}
  onDiscardDraft={(activityId) => …}
/>
```

## Exports

Components:

- `RoutinesGrid` — the list surface; owns loading/empty gating and delegates the
  populated view to `RoutinesGridList`.
- `RoutinesGridList` — populated view: description, timezone bar, draft rows,
  then the routine rows split into Active / Paused sections.
- `RoutinesGridEmpty` — text-only empty-state hint (no button).
- `RoutineRow` — one routine row: clickable (opens chat), with a status icon,
  meta, enable switch, an "Open chat" affordance, and a three-dot menu
  (run/stop, delete).
- `RoutineDraftRow` — a "Routine being created in chat" row with Resume/Discard.
- `ScheduleBuilder` — the cron schedule picker (presets + custom interval), for
  the app's creation flow.
- `TriggerPicker` / `TriggerConfigForm` — the event-trigger picker + generated
  config form, for the app's creation flow.
- `TriggerStatusBadge` — a trigger routine's live status chip + reconnect; with
  no status it shows a muted "checking" (`unknown`) chip, never nothing.
- `RoutineTriggerStatus` — a row's trigger-health block: the badge (real state
  or the muted "checking" chip), the always-visible detail line for
  error/paused states, and the "Active. Waiting for the first event." idle line
  once active with no runs. Rendered for EVERY routine with a trigger binding.
- `RoutineRowControls` — a row's trailing action cluster (open chat, switch,
  three-dot menu), split out of `RoutineRow`.
- `TimezonePicker` — the account-wide timezone selector.

Helpers: `nextFire`, `describeNextFire`, `interp`, `SCHEDULE_PRESET_LABELS`, the
trigger-schema helpers (`parseTriggerConfigSchema`, `defaultTriggerConfig`,
`missingRequired`, `coerceConfigValue`, `humanizeKey`), and the `DEFAULT_*_LABELS`
label defaults.

Types: `Routine`, `RoutineRun`, `RunStatus`, `RoutineChatMode`, `RoutineFormData`,
`RoutineWake`, `RoutineWakeMode`, `RoutineEditPatch`, `RoutineTriggerBinding`,
`SchedulePreset`, `RoutineDraft`, the trigger types (`TriggerType`,
`TriggerApp`, `TriggerAppAccount`, `TriggerStatusItem`, `TriggerStatusState`),
plus each component's props and the label interfaces (`RoutinesGridLabels`,
`RoutineRowLabels`, `ScheduleLabels`, `ScheduleSummaryLabels`, `NextFireLabels`,
`TriggerLabels`, `TriggerStatusLabels`).

## Peer Dependencies

- React 19+
- @houston-ai/core

---

Part of [Houston](../../README.md).
