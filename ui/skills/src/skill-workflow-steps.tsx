import { cn } from "@houston-ai/core";
import type { ReactNode } from "react";
import { humanizeIntegrationAction } from "./integration-action";
import type { SkillStepIntegration, SkillWorkflowStepItem } from "./types";

export interface SkillWorkflowStepsLabels {
  /** Heading above the list. */
  heading?: string;
}

export interface SkillWorkflowStepsProps {
  steps: SkillWorkflowStepItem[];
  /**
   * Draws the app a step acts on, as a chip beside the step's title. Optional
   * because resolving a toolkit slug to a real app name + logo is a Composio
   * catalog concern owned by `app/`; without it the step shows the slug and
   * the action's plain name.
   */
  renderIntegration?: (integration: SkillStepIntegration) => ReactNode;
  labels?: SkillWorkflowStepsLabels;
  className?: string;
}

/**
 * SkillWorkflowSteps — a Houston-authored skill read as the numbered procedure
 * it is, instead of as the SKILL.md markdown it is stored as. Each step is an
 * index chip, a short action, the app that action runs on, and the detail
 * underneath; the detail keeps its own line breaks so a step's nested lines
 * stay a list. Nothing renders for a skill Houston didn't write (an imported
 * skill has no parsed steps, and its raw instructions stay the primary body).
 */
export function SkillWorkflowSteps({
  steps,
  renderIntegration,
  labels,
  className,
}: SkillWorkflowStepsProps) {
  if (steps.length === 0) return null;
  const heading = labels?.heading ?? "Workflow";
  return (
    <section className={cn("rounded-xl bg-chip-subtle px-4 py-3.5", className)}>
      <h3 className="mb-3 font-medium text-ink text-sm">{heading}</h3>
      <ol className="space-y-3">
        {keyedSteps(steps).map(({ step, key }, index) => (
          <li key={key} className="flex min-w-0 gap-3">
            <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-input text-ink-muted text-xs tabular-nums">
              {index + 1}
            </span>
            <div className="min-w-0 flex-1">
              {/* The app chip sits on the title's own line and wraps under it
                  when the title fills the width — never a sideways scroll. */}
              <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                <p className="min-w-0 break-words font-medium text-ink text-sm">
                  {step.title}
                </p>
                {step.integration &&
                  (renderIntegration ? (
                    renderIntegration(step.integration)
                  ) : (
                    <IntegrationChip integration={step.integration} />
                  ))}
              </div>
              {step.detail && (
                <p className="mt-1 whitespace-pre-line break-words text-sm text-ink-muted leading-relaxed">
                  {step.detail}
                </p>
              )}
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

/**
 * The app chip with nothing resolved: the toolkit slug as authored, plus the
 * action's plain name when the step named one.
 */
function IntegrationChip({
  integration,
}: {
  integration: SkillStepIntegration;
}) {
  const action = humanizeIntegrationAction(
    integration.toolkit,
    integration.action,
  );
  return (
    <span className="min-w-0 break-words rounded-full bg-chip px-2 py-0.5 text-chip-text text-xs">
      {action ? `${integration.toolkit} · ${action}` : integration.toolkit}
    </span>
  );
}

/**
 * Stable list keys. A skill can repeat a step verbatim ("Atomic writes" twice
 * in one procedure), so the text alone is not unique — each repeat carries the
 * count of how many times it has appeared.
 */
function keyedSteps(
  steps: SkillWorkflowStepItem[],
): { step: SkillWorkflowStepItem; key: string }[] {
  const seen = new Map<string, number>();
  return steps.map((step) => {
    const text = `${step.title}:${step.detail ?? ""}`;
    const count = (seen.get(text) ?? 0) + 1;
    seen.set(text, count);
    return { step, key: `${text}#${count}` };
  });
}
