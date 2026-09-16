import { cn } from "@houston-ai/core";
import {
  GUIDED_CREATE_AGENT_STEPS,
  type GuidedCreateAgentStep,
  guidedStepIndex,
} from "./create-agent-steps-model";

/**
 * Where the user stands in the guided setup, in the sheet's centre header
 * slot: three named segments, the current one emphasized, every walked one
 * filled.
 *
 * Segments rather than numbered dots. The flow has three questions, not three
 * milestones, and a filled bar over a label says "this much of it is behind
 * you" without the decorative 01/02/03 numbering.
 *
 * In the wide frame's centre slot it holds a FIXED width rather than filling
 * the row: the side tracks grow with the way back and the way out, so a
 * progress bar that stretched would re-centre itself the moment Back appeared,
 * and a header that shifts between steps is exactly what the one sheet exists
 * to stop. On a phone it narrows rather than wrapping.
 */
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
