/**
 * ProgressPanel — shows what an agent is working on during a session.
 *
 * Renders as a right-side panel alongside chat when the agent has called
 * update_progress. Steps are shown as an animated checklist:
 * - pending: open circle
 * - active: spinning loader (highlighted)
 * - done: filled checkmark
 */

import { cn, ScrollArea } from "@houston-ai/core";
import { Check, Circle, Loader2 } from "lucide-react";
import type { ProgressStep } from "./use-progress-steps";

export interface ProgressPanelProps {
  steps: ProgressStep[];
  /** Header title. Defaults to "Working on". */
  title?: string;
}

export function ProgressPanel({
  steps,
  title = "Working on",
}: ProgressPanelProps) {
  const doneCount = steps.filter((s) => s.status === "done").length;
  const total = steps.length;

  return (
    <div className="flex flex-col h-full border-l border-line bg-chip/30">
      {/* Header */}
      <div className="px-5 pt-5 pb-4 border-b border-line">
        <h2 className="text-sm font-medium text-ink">{title}</h2>
        {total > 0 && (
          <p className="text-xs text-ink-muted mt-0.5">
            {doneCount} of {total} steps complete
          </p>
        )}
      </div>

      {/* Step list */}
      <ScrollArea className="flex-1">
        <div className="px-5 py-4 space-y-1">
          {steps.map((step) => (
            <StepRow key={step.title} step={step} />
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}

function StepRow({ step }: { step: ProgressStep }) {
  return (
    <div
      className={cn(
        "flex items-start gap-3 px-3 py-2.5 rounded-lg transition-colors",
        step.status === "active" && "bg-hover/50",
      )}
    >
      <div className="mt-0.5 shrink-0">
        {step.status === "done" && (
          <div className="size-5 rounded-full bg-success flex items-center justify-center">
            <Check className="size-3 text-success-text" strokeWidth={3} />
          </div>
        )}
        {step.status === "active" && (
          <Loader2
            className="size-5 text-ink/60 animate-spin"
            strokeWidth={1.5}
          />
        )}
        {step.status === "pending" && (
          <Circle className="size-5 text-ink-muted/25" strokeWidth={1.5} />
        )}
      </div>
      <p
        className={cn(
          "text-sm leading-snug",
          step.status === "done" && "text-ink/50",
          step.status === "active" && "text-ink font-medium",
          step.status === "pending" && "text-ink/60",
        )}
      >
        {step.title}
      </p>
    </div>
  );
}
