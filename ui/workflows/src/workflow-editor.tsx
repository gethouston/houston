/**
 * WorkflowEditor — create/edit a workflow with live run panel + history.
 */
import {
  cn,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@houston-ai/core"
import {
  ArrowLeft,
  Play,
  Square,
  Trash2,
  MoreHorizontal,
} from "lucide-react"
import type { Workflow, WorkflowRun } from "./types"
import { isResumable } from "./workflow-dag"
import { ActiveRunPanel } from "./active-run-panel"
import type { ActiveRunPanelLabels } from "./active-run-panel"
import { WorkflowRunHistory } from "./workflow-run-history"
import type { WorkflowRunHistoryLabels } from "./workflow-run-history"
import { useWorkflowRunSelection } from "./use-workflow-run-selection"

export interface WorkflowFormData {
  name: string
  description: string
  plan_prompt: string
}

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
  nameLabel?: string
  namePlaceholder?: string
  descriptionLabel?: string
  descriptionPlaceholder?: string
  planPromptLabel?: string
  planPromptPlaceholder?: string
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
  nameLabel: "Name",
  namePlaceholder: "e.g. Ship the feature",
  descriptionLabel: "Description",
  descriptionPlaceholder: "Optional, what this workflow is for",
  planPromptLabel: "Planning prompt",
  planPromptPlaceholder: "What should the agent plan and execute?",
  recentRuns: "Recent runs",
}

function SectionCard({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <section className="rounded-xl bg-secondary px-5 py-5">
      <h3 className="text-sm font-medium text-foreground mb-4">{title}</h3>
      {children}
    </section>
  )
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
      {children}
    </label>
  )
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
  onDelete,
  hasChanges,
  labels,
}: WorkflowEditorProps) {
  const l = { ...DEFAULT_LABELS, ...labels }
  const isEdit = !!workflow
  const { workflowRuns, inFlight, selectedRun, selectedRunId, selectRun } =
    useWorkflowRunSelection(workflow?.id, runs)
  const resumable = runs.find((r) => isResumable(r))
  const canSubmit =
    !!value.name.trim() &&
    !!value.plan_prompt.trim() &&
    (!isEdit || hasChanges !== false)

  const headerTitle = isEdit
    ? value.name.trim() || workflow?.name || l.untitled
    : l.newWorkflow

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
          <section className="rounded-xl bg-secondary p-5 space-y-4">
            <div>
              <FieldLabel>{l.nameLabel}</FieldLabel>
              <input
                type="text"
                value={value.name}
                onChange={(e) => onChange({ name: e.target.value })}
                placeholder={l.namePlaceholder}
                className={cn(
                  "w-full px-3 py-2 text-sm text-foreground",
                  "placeholder:text-muted-foreground/60",
                  "bg-background border border-black/[0.04] rounded-lg",
                  "outline-none transition-shadow duration-200",
                  "focus:shadow-[0_1px_2px_rgba(0,0,0,0.04)]",
                )}
                autoFocus={!isEdit}
              />
            </div>
            <div>
              <FieldLabel>{l.descriptionLabel}</FieldLabel>
              <input
                type="text"
                value={value.description}
                onChange={(e) => onChange({ description: e.target.value })}
                placeholder={l.descriptionPlaceholder}
                className={cn(
                  "w-full px-3 py-2 text-sm text-foreground",
                  "placeholder:text-muted-foreground/60",
                  "bg-background border border-black/[0.04] rounded-lg",
                  "outline-none transition-shadow duration-200",
                  "focus:shadow-[0_1px_2px_rgba(0,0,0,0.04)]",
                )}
              />
            </div>
            <div>
              <FieldLabel>{l.planPromptLabel}</FieldLabel>
              <textarea
                value={value.plan_prompt}
                onChange={(e) => onChange({ plan_prompt: e.target.value })}
                placeholder={l.planPromptPlaceholder}
                rows={5}
                className={cn(
                  "w-full px-3 py-2 text-sm text-foreground leading-relaxed",
                  "placeholder:text-muted-foreground/60",
                  "bg-background border border-black/[0.04] rounded-lg",
                  "outline-none resize-none transition-shadow duration-200",
                  "focus:shadow-[0_1px_2px_rgba(0,0,0,0.04)]",
                )}
              />
            </div>
          </section>

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
              approvePending={approvePending}
              labels={l.activeRun}
            />
          )}
        </div>
      </div>
    </div>
  )
}
