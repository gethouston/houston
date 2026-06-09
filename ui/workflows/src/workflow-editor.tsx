/**
 * WorkflowEditor — create/edit a workflow with live run panel + history.
 */
import { useRef } from "react"
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@houston-ai/core"
import {
  ArrowLeft,
  ChevronDown,
  ChevronUp,
  Play,
  Square,
  Trash2,
  MoreHorizontal,
} from "lucide-react"
import type { Workflow, WorkflowRun } from "./types"
import { isResumable } from "./workflow-dag"
import { ActiveRunPanel } from "./active-run-panel"
import type { ActiveRunPanelLabels } from "./active-run-panel"
import {
  SectionCard,
  WorkflowDefinitionPanel,
  type WorkflowFormData,
} from "./workflow-definition-panel"
import { WorkflowRunHistory } from "./workflow-run-history"
import type { WorkflowRunHistoryLabels } from "./workflow-run-history"
import { useWorkflowDefinitionExpanded } from "./use-workflow-definition-expanded"
import { useScrollToRunPanel } from "./use-scroll-to-run-panel"
import { useWorkflowRunSelection } from "./use-workflow-run-selection"

export type { WorkflowFormData }

export interface WorkflowEditorLabels {
  newWorkflow?: string
  untitled?: string
  backAria?: string
  run?: string
  starting?: string
  stop?: string
  resume?: string
  save?: string
  create?: string
  delete?: string
  moreAria?: string
  showDetails?: string
  hideDetails?: string
  nameLabel?: string
  namePlaceholder?: string
  descriptionLabel?: string
  descriptionPlaceholder?: string
  planPromptLabel?: string
  planPromptPlaceholder?: string
  savedPlanTitle?: string
  recentRuns?: string
  activeRun?: ActiveRunPanelLabels
  runHistory?: WorkflowRunHistoryLabels
}

const DEFAULT_LABELS: Required<
  Omit<WorkflowEditorLabels, "activeRun" | "runHistory">
> = {
  newWorkflow: "New workflow",
  untitled: "Untitled workflow",
  backAria: "Back to workflows",
  run: "Run",
  starting: "Starting…",
  stop: "Stop",
  resume: "Resume",
  save: "Save changes",
  create: "Create workflow",
  delete: "Delete workflow",
  moreAria: "More actions",
  showDetails: "Show workflow details",
  hideDetails: "Hide workflow details",
  nameLabel: "Name",
  namePlaceholder: "e.g. Ship the feature",
  descriptionLabel: "Description",
  descriptionPlaceholder: "Optional, what this workflow is for",
  planPromptLabel: "Planning prompt",
  planPromptPlaceholder: "What should the agent plan and execute?",
  savedPlanTitle: "Saved steps",
  recentRuns: "Recent runs",
}

export interface WorkflowEditorProps {
  value: WorkflowFormData
  onChange: (patch: Partial<WorkflowFormData>) => void
  onBack: () => void
  onSubmit: () => void
  workflow?: Workflow
  runs?: WorkflowRun[]
  onRun?: () => void
  runPending?: boolean
  onCancelRun?: (runId: string) => void
  onApproveRun?: (runId: string) => void
  approvePending?: boolean
  onResumeRun?: (runId: string) => void
  onRetryStep?: (runId: string, stepId: string) => void
  retryingStepId?: string
  onDelete?: () => void
  hasChanges?: boolean
  labels?: WorkflowEditorLabels
}

export function WorkflowEditor({
  value,
  onChange,
  onBack,
  onSubmit,
  workflow,
  runs = [],
  onRun,
  runPending,
  onCancelRun,
  onApproveRun,
  approvePending,
  onResumeRun,
  onRetryStep,
  retryingStepId,
  onDelete,
  hasChanges,
  labels,
}: WorkflowEditorProps) {
  const l = { ...DEFAULT_LABELS, ...labels }
  const isEdit = !!workflow
  const runPanelRef = useRef<HTMLDivElement>(null)
  const {
    workflowRuns,
    inFlight,
    selectedRun,
    selectedRunId,
    explicitRunId,
    selectRun,
  } = useWorkflowRunSelection(workflow?.id, runs)
  const { definitionExpanded, toggleDefinition } =
    useWorkflowDefinitionExpanded(explicitRunId)
  useScrollToRunPanel(runPanelRef, explicitRunId)

  const resumable = runs.find((r) => isResumable(r))
  const canSubmit =
    !!value.name.trim() &&
    !!value.plan_prompt.trim() &&
    (!isEdit || hasChanges !== false)

  const headerTitle = isEdit
    ? value.name.trim() || workflow?.name || l.untitled
    : l.newWorkflow

  const definitionLabels = {
    nameLabel: l.nameLabel,
    namePlaceholder: l.namePlaceholder,
    descriptionLabel: l.descriptionLabel,
    descriptionPlaceholder: l.descriptionPlaceholder,
    planPromptLabel: l.planPromptLabel,
    planPromptPlaceholder: l.planPromptPlaceholder,
    savedPlanTitle: l.savedPlanTitle,
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-background">
      <header className="px-4 py-2.5 shrink-0">
        <div className="max-w-3xl mx-auto flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onBack}
            aria-label={l.backAria}
          >
            <ArrowLeft className="size-4" />
          </Button>
          <p className="text-sm font-medium text-foreground truncate min-w-0 flex-1">
            {headerTitle}
          </p>
          <div className="flex items-center gap-1.5 shrink-0">
            {isEdit && (
              <Button variant="ghost" size="sm" onClick={toggleDefinition}>
                {definitionExpanded ? (
                  <ChevronUp className="size-3.5" />
                ) : (
                  <ChevronDown className="size-3.5" />
                )}
                {definitionExpanded ? l.hideDetails : l.showDetails}
              </Button>
            )}
            {isEdit && inFlight && onCancelRun ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onCancelRun(inFlight.id)}
              >
                <Square className="size-3.5" />
                {l.stop}
              </Button>
            ) : isEdit && resumable && onResumeRun ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onResumeRun(resumable.id)}
              >
                <Play className="size-3.5" />
                {l.resume}
              </Button>
            ) : (
              isEdit &&
              onRun &&
              !inFlight && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onRun}
                  disabled={runPending}
                >
                  <Play className="size-3.5" />
                  {runPending ? l.starting : l.run}
                </Button>
              )
            )}
            <Button onClick={onSubmit} size="sm" disabled={!canSubmit}>
              {isEdit ? l.save : l.create}
            </Button>
            {isEdit && onDelete && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={l.moreAria}
                  >
                    <MoreHorizontal className="size-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-44">
                  <DropdownMenuItem variant="destructive" onClick={onDelete}>
                    <Trash2 className="size-3.5" />
                    {l.delete}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </div>
      </header>

      <div className="flex-1 min-h-0 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-6 pt-3 pb-12 space-y-3">
          <WorkflowDefinitionPanel
            value={value}
            onChange={onChange}
            workflow={workflow}
            expanded={definitionExpanded}
            collapsible={isEdit}
            autoFocus={!isEdit}
            labels={definitionLabels}
            stepProgressLabels={l.activeRun?.stepProgress}
          />

          {isEdit && workflowRuns.length > 0 && (
            <SectionCard title={l.recentRuns}>
              <WorkflowRunHistory
                runs={workflowRuns}
                selectedRunId={selectedRunId}
                onSelectRun={selectRun}
                onCancelRun={onCancelRun}
                onResumeRun={onResumeRun}
                labels={l.runHistory}
              />
            </SectionCard>
          )}

          {isEdit && selectedRun && (
            <div ref={runPanelRef}>
              <ActiveRunPanel
                run={selectedRun}
                onApprove={
                  onApproveRun && selectedRun.status === "awaiting_approval"
                    ? () => onApproveRun(selectedRun.id)
                    : undefined
                }
                onCancel={
                  onCancelRun ? () => onCancelRun(selectedRun.id) : undefined
                }
                onRetryStep={
                  onRetryStep
                    ? (stepId) => onRetryStep(selectedRun.id, stepId)
                    : undefined
                }
                retryingStepId={retryingStepId}
                approvePending={approvePending}
                labels={l.activeRun}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
