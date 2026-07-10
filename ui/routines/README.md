# @houston-ai/routines

The Routines list surface: a single full-width list of a person's recurring
agent tasks. Rows are **not clickable** — every action lives in the row's
three-dot menu (Run now / Stop run, Edit manually, Edit with AI, Delete). New
routines are created from the "New routine" split button (With AI opens a guided
chat the consumer renders; Manually drops a **local, uncommitted** editor card at
the top of the list that writes nothing to disk until Create succeeds). A routine
still being set up in chat shows as its own resumable draft row.

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
  newDraft={editing ? { onSave, onCancel } : null}  // local "Manually" editor
  accountTimezone={tz}
  onTimezoneChange={setTz}
  onCreateWithAi={openChat}
  onCreateManually={openLocalEditor}
  onToggle={(id, enabled) => …}
  onSaveRoutine={(id, patch) => …}  // inline "Edit manually" panel
  onEditWithAi={(id) => …}
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
- `RoutinesGridList` — populated view: description + CTA, timezone bar, and the
  list card (local editor → draft rows → routine rows).
- `RoutinesGridEmpty` — empty state with the "how it works" walkthrough.
- `RoutineRow` — one routine row (status icon, meta, enable switch, three-dot
  menu, and its inline "Edit manually" panel).
- `RoutineRowEdit` — the name/instruction/schedule editor, shared by a row's
  inline panel and the grid's local new-routine draft.
- `RoutineDraftRow` — a "Routine being created in chat" row with Resume/Discard.
- `NewRoutineMenu` — the "New routine" split trigger (With AI / Manually).
- `ScheduleBuilder` — the cron schedule picker (presets + custom interval).
- `TimezonePicker` — the account-wide timezone selector.

Helpers: `nextFire`, `describeNextFire`, `interp`, `SCHEDULE_PRESET_LABELS`, and
the `DEFAULT_*_LABELS` label defaults.

Types: `Routine`, `RoutineRun`, `RunStatus`, `RoutineChatMode`, `RoutineFormData`,
`SchedulePreset`, `RoutineDraft`, plus each component's props and the label
interfaces (`RoutinesGridLabels`, `RoutineRowLabels`, `ScheduleLabels`,
`ScheduleSummaryLabels`, `NextFireLabels`).

## Peer Dependencies

- React 19+
- @houston-ai/core

---

Part of [Houston](../../README.md).
