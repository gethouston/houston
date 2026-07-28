"use client";

import { cn } from "@houston-ai/core";
import type { LucideIcon } from "lucide-react";
import { Handshake, ListTodo, Rocket } from "lucide-react";
import {
  type ChatPlanReadyLabels,
  PLAN_READY_LEDE_CLASS_NAME,
  type PlanReadyActionKey,
  resolvePlanReadyActions,
} from "./chat-plan-ready-card-model";
import { InteractionModal, InteractionModalTitle } from "./interaction-modal";

export type { ChatPlanReadyLabels } from "./chat-plan-ready-card-model";
export { DEFAULT_PLAN_READY_LABELS } from "./chat-plan-ready-card-model";

export interface ChatPlanReadyCardProps {
  summary: string;
  disabled?: boolean;
  onStartWorking: () => void;
  onRunAutopilot: () => void;
  onKeepPlanning: () => void;
  labels: ChatPlanReadyLabels;
}

const ACTION_ICONS: Record<PlanReadyActionKey, LucideIcon> = {
  startWorking: Handshake,
  runAutopilot: Rocket,
  keepPlanning: ListTodo,
};

/** The compact next-step chooser after a plan. The complete plan stays in the
 * assistant transcript; this shared interaction shell floats above the
 * always-mounted composer and keeps only a compact lede in the card. */
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
    <InteractionModal
      body={
        <div className="flex flex-col gap-4">
          <p
            className={`${PLAN_READY_LEDE_CLASS_NAME} text-ink text-sm leading-relaxed`}
          >
            {summary}
          </p>
          <div className="flex flex-col gap-2">
            {actions.map((action) => {
              const Icon = ACTION_ICONS[action.key];
              return (
                <button
                  className={cn(
                    "flex w-full items-center rounded-xl border border-line bg-input px-3.5 py-3 text-left outline-none transition-colors hover:border-line hover:bg-hover",
                    "focus-visible:border-focus focus-visible:ring-[3px] focus-visible:ring-focus/50 disabled:pointer-events-none disabled:opacity-50",
                  )}
                  disabled={action.disabled}
                  key={action.key}
                  onClick={handlers[action.key]}
                  type="button"
                >
                  <span className="flex min-w-0 flex-1 flex-col gap-1">
                    <span className="flex items-center gap-2 text-sm font-medium text-ink">
                      <Icon className="size-4 shrink-0 text-ink" />
                      {action.title}
                    </span>
                    <span className="text-xs text-ink-muted">
                      {action.description}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      }
      collapseLabel={labels.collapse}
      collapsedHint={summary}
      disabled={disabled}
      expandLabel={labels.expand}
      title={<InteractionModalTitle>{labels.title}</InteractionModalTitle>}
    />
  );
}
