"use client";

import { Button, cn } from "@houston-ai/core";
import {
  type ChatPlanReadyLabels,
  type PlanReadyActionKey,
  resolvePlanReadyActions,
} from "./chat-plan-ready-card-model";

export type { ChatPlanReadyLabels } from "./chat-plan-ready-card-model";
export { DEFAULT_PLAN_READY_LABELS } from "./chat-plan-ready-card-model";

export interface ChatPlanReadyCardProps {
  /** The plan the agent drafted, shown as the card body. */
  summary: string;
  /** Gates all three actions uniformly (another turn is active). */
  disabled?: boolean;
  /** Send the plan as a normal (execute) turn. */
  onStartWorking: () => void;
  /** Send the plan as an Autopilot (auto) turn. */
  onRunAutopilot: () => void;
  /** Dismiss the card locally and return the composer; mode stays plan. */
  onKeepPlanning: () => void;
  labels: ChatPlanReadyLabels;
}

/**
 * The in-chat surface shown when the agent finishes planning and calls
 * `plan_ready`: the drafted plan plus three ways forward. It REPLACES the
 * composer, so it borrows the interaction card's vocabulary (rounded-[28px]
 * grey `bg-secondary` surface) with the plan text raised as the prominent head.
 * Every action is visible at rest (no hover gate) and keyboard-reachable; a
 * primary "Start working", a raised-outline "Run on Autopilot", and a quiet
 * ghost "Keep planning" that only dismisses the card.
 */
export function ChatPlanReadyCard({
  summary,
  disabled = false,
  onStartWorking,
  onRunAutopilot,
  onKeepPlanning,
  labels,
}: ChatPlanReadyCardProps) {
  const handlers: Record<PlanReadyActionKey, () => void> = {
    startWorking: onStartWorking,
    runAutopilot: onRunAutopilot,
    keepPlanning: onKeepPlanning,
  };
  const actions = resolvePlanReadyActions(labels, disabled);

  return (
    <div
      aria-disabled={disabled || undefined}
      className={cn(
        "overflow-clip rounded-[28px] border border-border/50 bg-secondary p-2.5",
        "shadow-[0_1px_6px_rgba(0,0,0,0.06)] dark:shadow-[0_1px_6px_rgba(0,0,0,0.2)]",
        disabled && "opacity-50",
      )}
    >
      <div className="flex flex-col px-2.5 pt-2 pb-2">
        <p className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
          {labels.title}
        </p>
        <p className="mt-1.5 text-base text-foreground leading-relaxed">
          {summary}
        </p>
        <div className="mt-4 flex flex-col gap-2">
          {actions.map((action) => (
            <Button
              className="w-full"
              disabled={action.disabled}
              key={action.key}
              onClick={handlers[action.key]}
              size="lg"
              type="button"
              variant={action.variant}
            >
              {action.label}
            </Button>
          ))}
        </div>
      </div>
    </div>
  );
}
