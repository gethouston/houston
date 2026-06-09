# @houston-ai/workflows

On-demand multi-step workflow management. Create workflows, run them, review generated plans, and track step progress.

## Install

```bash
pnpm add @houston-ai/workflows
```

## Usage

```tsx
import { WorkflowsGrid, WorkflowEditor } from "@houston-ai/workflows"

<WorkflowsGrid
  workflows={workflows}
  lastRuns={lastRuns}
  loading={false}
  onSelect={(id) => openEditor(id)}
  onCreate={() => openCreate()}
/>
```

## Exports

- `WorkflowsGrid` — list of all workflows
- `WorkflowRow` — single workflow row with last-run status
- `WorkflowEditor` — create/edit form with active run panel + history
- `WorkflowRunHistory` — past runs with cancel/resume controls
- `ActiveRunPanel` — live planning/progress/synthesis view (Workflows tab editor; modal approval)
- `InlineRunCard` — chat inline run card with connect-card styling and inline approve/cancel
- `PlanApprovalDialog` — review and approve a generated plan (used by ActiveRunPanel)
- `StepProgress` — dependency-layered step list with status
- DAG helpers: `layerSteps`, `activeRun`, `latestRunByWorkflow`, `isResumable`

## Peer Dependencies

- React 19+
- @houston-ai/core

---

Part of [Houston](../../README.md).
