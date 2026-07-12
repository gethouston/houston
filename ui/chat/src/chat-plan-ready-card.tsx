"use client";

import { cn } from "@houston-ai/core";
import type { LucideIcon } from "lucide-react";
import { Handshake, ListTodo, Rocket } from "lucide-react";
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

/** Each option's icon, matching the composer mode selector: Coworker
 *  (execute) = Handshake, Autopilot (auto) = Rocket, Keep planning = ListTodo.
 *  Internal to the card so the labels contract stays icon-free. */
const ACTION_ICONS: Record<PlanReadyActionKey, LucideIcon> = {
  startWorking: Handshake,
  runAutopilot: Rocket,
  keepPlanning: ListTodo,
};

/**
 * The in-chat surface shown when the agent finishes planning and calls
 * `plan_ready`: the drafted plan plus three ways forward. It REPLACES the
 * composer, so it borrows the interaction card's vocabulary (rounded-[28px]
 * grey `bg-chip` surface) with the plan text raised as the prominent head.
 * The options render as the composer mode menu's rows: each a full-width row
 * with its icon inline with the title and a description on its own line below
 * (icon in the title's foreground color), each option raised on its own
 * bordered card so it reads clickable, and
 * everything visible at rest (no hover gate). Primary emphasis comes from row
 * order + title weight, not a filled button. `disabled` gates all three rows.
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
        "overflow-clip rounded-[28px] border border-line/50 bg-chip p-2.5",
        "shadow-[0_1px_6px_rgba(0,0,0,0.06)] dark:shadow-[0_1px_6px_rgba(0,0,0,0.2)]",
        disabled && "opacity-50",
      )}
    >
      <div className="flex flex-col px-2.5 pt-2 pb-2">
        <p className="font-medium text-ink-muted text-xs">{labels.title}</p>
        <p className="mt-1.5 text-base text-ink leading-relaxed">{summary}</p>
        <div className="mt-4 flex flex-col gap-2">
          {actions.map((action) => {
            const Icon = ACTION_ICONS[action.key];
            return (
              <button
                className="flex w-full items-center rounded-xl border border-line/60 bg-input px-3.5 py-3 text-left outline-none transition-colors hover:border-line hover:bg-hover focus-visible:border-focus focus-visible:ring-[3px] focus-visible:ring-focus/50 disabled:pointer-events-none disabled:opacity-50"
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
    </div>
  );
}
