/**
 * WorkflowsGrid — list view of workflows with empty state and primary CTA.
 */
import {
  cn,
  EmptyHeader,
  EmptyTitle,
  EmptyDescription,
  Button,
} from "@houston-ai/core"
import { Plus } from "lucide-react"
import type { Workflow, WorkflowRun } from "./types"
import { WorkflowRow } from "./workflow-row"
import type { WorkflowRowLabels } from "./workflow-row"

export interface WorkflowsGridLabels {
  loading?: string
  emptyTitle?: string
  emptyDescription?: string
  descriptionShort?: string
  newWorkflow?: string
  row?: WorkflowRowLabels
}

const DEFAULT_LABELS: Required<Omit<WorkflowsGridLabels, "row">> = {
  loading: "Loading…",
  emptyTitle: "Multi-step missions",
  emptyDescription:
    "Workflows break big goals into steps. You review the plan, then watch each step run.",
  descriptionShort:
    "On-demand missions with a plan you approve before the agent starts.",
  newWorkflow: "New workflow",
}

export interface WorkflowsGridProps {
  workflows: Workflow[]
  lastRuns?: Record<string, WorkflowRun>
  loading?: boolean
  onSelect: (workflowId: string) => void
  onCreate?: () => void
  labels?: WorkflowsGridLabels
}

export function WorkflowsGrid({
  workflows,
  lastRuns = {},
  loading,
  onSelect,
  onCreate,
  labels,
}: WorkflowsGridProps) {
  const l = { ...DEFAULT_LABELS, ...labels }
  const sorted = [...workflows].sort((a, b) =>
    a.name.localeCompare(b.name),
  )

  if (loading && workflows.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center bg-background">
        <p className="text-sm text-muted-foreground animate-pulse">
          {l.loading}
        </p>
      </div>
    )
  }

  if (sorted.length === 0) {
    return (
      <div className="flex-1 min-h-0 overflow-y-auto bg-background">
        <div className="mx-auto max-w-md flex flex-col items-center gap-6 text-center pt-24 px-6">
          <EmptyHeader>
            <EmptyTitle>{l.emptyTitle}</EmptyTitle>
            <EmptyDescription>{l.emptyDescription}</EmptyDescription>
          </EmptyHeader>
          {onCreate && (
            <Button onClick={onCreate}>
              <Plus className="size-4" />
              {l.newWorkflow}
            </Button>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 min-h-0 overflow-y-auto bg-background">
      <div className="max-w-3xl mx-auto px-6 py-7">
        <div className="flex items-center justify-between gap-4 mb-4">
          <p className="text-xs text-muted-foreground max-w-md">
            {l.descriptionShort}
          </p>
          {onCreate && (
            <Button size="sm" onClick={onCreate} className="shrink-0">
              <Plus className="size-3.5" />
              {l.newWorkflow}
            </Button>
          )}
        </div>

        <div
          className={cn(
            "rounded-xl bg-secondary overflow-hidden",
            "divide-y divide-border/60",
          )}
        >
          {sorted.map((workflow) => (
            <WorkflowRow
              key={workflow.id}
              workflow={workflow}
              lastRun={lastRuns[workflow.id]}
              onClick={() => onSelect(workflow.id)}
              labels={l.row}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
