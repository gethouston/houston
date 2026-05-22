# @houston-ai/routines

Automated routine management. Create, edit, run, and review recurring agent tasks with trigger scheduling and approval controls.

## Install

```bash
bun add @houston-ai/routines
```

## Usage

```tsx
import { RoutinesGrid, RoutineDetailPage } from "@houston-ai/routines"

<RoutinesGrid
  routines={routines}
  loading={false}
  onRoutineClick={(r) => navigate(`/routines/${r.id}`)}
  onCreateRoutine={() => openCreateDialog()}
/>
```

## Exports

- `RoutinesGrid` -- card grid of all routines
- `RoutineCard` -- single routine card with status indicator
- `RoutineDetailPage` -- full detail with description, triggers, run history
- `RoutineEditForm` -- create/edit form for routine configuration
- `RoutineDetailActions` -- action buttons (run, edit, delete)
- `RoutineRunPage` -- live view of a running routine
- `RunHistory` -- past run list with status and duration
- Types: `Routine`, `RoutineRun`, `RoutineFormState`, `TriggerType`, `RoutineStatus`, `ApprovalMode`, `RunStatus`

## Peer Dependencies

- React 19+
- @houston-ai/core

---

Part of [Houston](../../README.md).
