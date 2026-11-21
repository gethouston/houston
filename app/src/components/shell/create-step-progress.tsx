import { cn } from "@houston-ai/core";
import {
  GUIDED_CREATE_AGENT_STEPS,
  type GuidedCreateAgentStep,
  guidedStepIndex,
} from "./create-agent-steps-model";

export function CreateStepProgress({
  step,
  labels,
}: {
  step: GuidedCreateAgentStep;
  labels: Record<GuidedCreateAgentStep, string>;
}) {
  const activeIndex = guidedStepIndex(step);

  return (
    <ol
      className="flex w-40 items-start gap-1.5 md:w-64"
      data-testid="create-step-progress"
    >
      {GUIDED_CREATE_AGENT_STEPS.map((id, index) => (
        <li
          key={id}
          aria-current={id === step ? "step" : undefined}
          className="flex min-w-0 flex-1 flex-col"
        >
          <span
            aria-hidden="true"
            className={cn(
              "h-0.5 rounded-full transition-colors duration-200",
              index <= activeIndex ? "bg-action" : "bg-line",
            )}
          />
          <span
            className={cn(
              "mt-1.5 truncate text-xs",
              id === step
                ? "font-medium text-ink"
                : index < activeIndex
                  ? "text-ink"
                  : "text-ink-muted",
            )}
          >
            {labels[id]}
          </span>
        </li>
      ))}
    </ol>
  );
}
