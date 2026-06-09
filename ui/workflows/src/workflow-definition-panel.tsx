/**
 * WorkflowDefinitionPanel — metadata form + saved plan template.
 */
import { cn, Collapsible, CollapsibleContent } from "@houston-ai/core"
import type { Workflow } from "./types"
import { StepProgress } from "./step-progress"

export interface WorkflowFormData {
  name: string
  description: string
  plan_prompt: string
}
import type { StepProgressLabels } from "./step-progress"

export interface WorkflowDefinitionPanelLabels {
  nameLabel?: string
  namePlaceholder?: string
  descriptionLabel?: string
  descriptionPlaceholder?: string
  planPromptLabel?: string
  planPromptPlaceholder?: string
  savedPlanTitle?: string
}

export function SectionCard({
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

export interface WorkflowDefinitionPanelProps {
  value: WorkflowFormData
  onChange: (patch: Partial<WorkflowFormData>) => void
  workflow?: Workflow
  expanded: boolean
  /** When false (create mode), form is always visible. */
  collapsible: boolean
  autoFocus?: boolean
  labels: WorkflowDefinitionPanelLabels
  stepProgressLabels?: StepProgressLabels
}

function DefinitionFields({
  value,
  onChange,
  autoFocus,
  labels: l,
}: Pick<
  WorkflowDefinitionPanelProps,
  "value" | "onChange" | "autoFocus" | "labels"
>) {
  return (
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
          autoFocus={autoFocus}
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
  )
}

export function WorkflowDefinitionPanel({
  value,
  onChange,
  workflow,
  expanded,
  collapsible,
  autoFocus,
  labels: l,
  stepProgressLabels,
}: WorkflowDefinitionPanelProps) {
  const content = (
    <div className="space-y-3">
      <DefinitionFields
        value={value}
        onChange={onChange}
        autoFocus={autoFocus}
        labels={l}
      />
      {workflow?.plan && (
        <SectionCard title={l.savedPlanTitle ?? "Saved steps"}>
          <StepProgress plan={workflow.plan} labels={stepProgressLabels} />
        </SectionCard>
      )}
    </div>
  )

  if (!collapsible) {
    return content
  }

  return (
    <Collapsible open={expanded}>
      <CollapsibleContent className="space-y-3">{content}</CollapsibleContent>
    </Collapsible>
  )
}
