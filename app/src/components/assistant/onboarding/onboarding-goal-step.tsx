import { Spinner } from "@houston-ai/core";
import { Check, Circle, X } from "lucide-react";

export type GoalStepState = "waiting" | "active" | "done" | "failed";

export function GoalStep({
  state,
  label,
}: {
  state: GoalStepState;
  label: string;
}) {
  return (
    <li data-state={state} className="flex min-h-6 items-center gap-2.5">
      <span className="flex size-5 shrink-0 items-center justify-center">
        <StepMark state={state} />
      </span>
      <span
        className={
          state === "waiting"
            ? "min-w-0 truncate text-sm text-ink-muted"
            : "min-w-0 truncate text-sm text-ink"
        }
      >
        {label}
      </span>
    </li>
  );
}

function StepMark({ state }: { state: GoalStepState }) {
  switch (state) {
    case "waiting":
      return <Circle className="size-4 text-ink-muted" aria-hidden="true" />;
    case "active":
      return <Spinner className="size-4" aria-hidden="true" />;
    case "done":
      return <Check className="size-4 text-success-ink" aria-hidden="true" />;
    case "failed":
      return <X className="size-4 text-danger-ink" aria-hidden="true" />;
  }
}
