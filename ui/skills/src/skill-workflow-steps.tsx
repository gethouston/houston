import { cn } from "@houston-ai/core";
import type { ReactNode } from "react";
import { humanizeIntegrationAction } from "./integration-action";
import type { SkillStepIntegration, SkillWorkflowStepItem } from "./types";

export interface SkillWorkflowStepsLabels {
  heading?: string;
}

export interface SkillWorkflowStepsProps {
  steps: SkillWorkflowStepItem[];
  renderIntegration?: (integration: SkillStepIntegration) => ReactNode;
  labels?: SkillWorkflowStepsLabels;
  className?: string;
}

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
