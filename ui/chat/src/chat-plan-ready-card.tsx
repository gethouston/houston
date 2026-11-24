"use client";

import { cn } from "@houston-ai/core";
import type { LucideIcon } from "lucide-react";
import { Handshake, Rocket } from "lucide-react";
import {
  type ChatPlanReadyLabels,
  hasPlanReadySummary,
  PLAN_READY_LEDE_CLASS_NAME,
  type PlanReadyActionKey,
  resolvePlanReadyActions,
} from "./chat-plan-ready-card-model";
import { InlineTextRow } from "./interaction-decline-row";
import { InteractionModal, InteractionModalTitle } from "./interaction-modal";

export type { ChatPlanReadyLabels } from "./chat-plan-ready-card-model";
export { DEFAULT_PLAN_READY_LABELS } from "./chat-plan-ready-card-model";

export interface ChatPlanReadyCardProps {
  summary: string;
  disabled?: boolean;
  onStartWorking: () => void;
  onRunAutopilot: () => void;
  onDismiss?: () => void;
  onSubmit: (text: string) => void;
  labels: ChatPlanReadyLabels;
}

const ACTION_ICONS: Record<PlanReadyActionKey, LucideIcon> = {
  startWorking: Handshake,
  runAutopilot: Rocket,
};

/** The compact next-step chooser after a plan. The complete plan stays in the
 * assistant transcript; the shared shell keeps the lede and the only text input
 * together in the card. */
export function ChatPlanReadyCard({
  summary,
  disabled = false,
  onStartWorking,
  onRunAutopilot,
  onDismiss,
  onSubmit,
  labels,
}: ChatPlanReadyCardProps) {
  const hasSummary = hasPlanReadySummary(summary);
  const handlers: Record<PlanReadyActionKey, () => void> = {
    startWorking: onStartWorking,
    runAutopilot: onRunAutopilot,
  };
  const actions = resolvePlanReadyActions(labels, disabled);

  return (
    <InteractionModal
      body={
        <div className="flex flex-col gap-4">
          {hasSummary ? (
            <p
              className={`${PLAN_READY_LEDE_CLASS_NAME} text-ink text-sm leading-relaxed`}
            >
              {summary}
            </p>
          ) : null}
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
      collapsedHint={hasSummary ? summary : undefined}
      disabled={disabled}
      dismissLabel={labels.dismiss}
      expandLabel={labels.expand}
      onDismiss={onDismiss}
      trailing={
        <InlineTextRow
          disabled={disabled}
          onSubmit={onSubmit}
          placeholder={labels.feedbackPlaceholder}
          sendLabel={labels.send}
        />
      }
      title={<InteractionModalTitle>{labels.title}</InteractionModalTitle>}
    />
  );
}
