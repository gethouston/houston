import { Check } from "lucide-react";
import * as React from "react";

import { cn } from "../utils";

interface StepperStep {
  id: string;
  label: string;
}

interface StepperProps {
  steps: StepperStep[];
  activeStep: string | null;
  completedSteps?: string[];
  onStepClick?: (stepId: string) => void;
  className?: string;
}

function Stepper({
  steps,
  activeStep,
  completedSteps = [],
  onStepClick,
  className,
}: StepperProps) {
  const completedSet = React.useMemo(
    () => new Set(completedSteps),
    [completedSteps],
  );

  function getState(id: string): "done" | "active" | "pending" {
    if (completedSet.has(id)) return "done";
    if (id === activeStep) return "active";
    return "pending";
  }

  return (
    <div data-slot="stepper" className={cn("flex items-start", className)}>
      {steps.map((step, i) => {
        const state = getState(step.id);
        const isClickable =
          onStepClick && (state === "done" || state === "active");
        const prevState = i > 0 ? getState(steps[i - 1].id) : null;

        return (
          <React.Fragment key={step.id}>
            {i > 0 && (
              <div
                data-slot="stepper-connector"
                className={cn(
                  "mt-3 h-px flex-1",
                  prevState === "done" || prevState === "active"
                    ? state === "pending"
                      ? "border-t border-dashed border-border"
                      : "bg-primary"
                    : "bg-border",
                )}
              />
            )}
            <button
              data-slot="stepper-step"
              data-state={state}
              type="button"
              disabled={!isClickable}
              onClick={() => isClickable && onStepClick(step.id)}
              className={cn(
                "flex flex-col items-center gap-1.5 bg-transparent border-none p-0",
                isClickable ? "cursor-pointer" : "cursor-default",
              )}
            >
              <div
                className={cn(
                  "flex size-6 shrink-0 items-center justify-center rounded-full text-xs transition-colors",
                  state === "done" && "bg-primary text-primary-foreground",
                  state === "active" &&
                    "bg-primary text-primary-foreground animate-pulse",
                  state === "pending" &&
                    "border-2 border-border bg-background text-muted-foreground",
                )}
              >
                {state === "done" ? <Check className="size-3.5" /> : null}
              </div>
              <span
                className={cn(
                  "text-xs whitespace-nowrap",
                  state === "active" && "font-medium text-foreground",
                  state === "done" && "text-foreground",
                  state === "pending" && "text-muted-foreground",
                )}
              >
                {step.label}
              </span>
            </button>
          </React.Fragment>
        );
      })}
    </div>
  );
}

export type { StepperProps, StepperStep };
export { Stepper };
