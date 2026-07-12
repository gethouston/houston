"use client";

import { cn } from "@houston-ai/core";
import { CalendarClock, Sparkles, X } from "lucide-react";
import {
  type ChatSuggestReusableLabels,
  resolveSuggestReusableSaveLabel,
} from "./chat-suggest-reusable-card-model";

export type { ChatSuggestReusableLabels } from "./chat-suggest-reusable-card-model";
export { DEFAULT_SUGGEST_REUSABLE_LABELS } from "./chat-suggest-reusable-card-model";

export interface ChatSuggestReusableCardProps {
  /** Whether the work is being offered as a reusable Skill or a scheduled Routine. */
  reusableKind: "skill" | "routine";
  /** The model's proposed name for the Skill/Routine, shown as the prominent head. */
  title: string;
  /** The model's one-line rationale for saving it (model-generated, passed through). */
  rationale: string;
  /** Gates both actions uniformly (another turn is active). */
  disabled?: boolean;
  /** Send the follow-up message that asks the agent to write the Skill/Routine. */
  onSave: () => void;
  /** Dismiss the offer locally and return the composer. */
  onDismiss: () => void;
  labels: ChatSuggestReusableLabels;
}

/**
 * The in-chat surface shown when the agent finishes cleanly and calls
 * `suggest_reusable`: an optional, dismissible offer to save the just-completed
 * work as a reusable Skill or a scheduled Routine. It REPLACES the composer, so
 * it borrows the plan-ready card's vocabulary (rounded-[28px] grey
 * `bg-chip` surface) with the proposed title raised as the prominent head
 * and the rationale below it. The two actions (Save / Not now) render as
 * full-width rows using the SAME row button classes as the plan-ready card, so
 * the card family reads as one system. Everything is visible at rest (no hover
 * gate). `disabled` gates both rows.
 */
export function ChatSuggestReusableCard({
  reusableKind,
  title,
  rationale,
  disabled = false,
  onSave,
  onDismiss,
  labels,
}: ChatSuggestReusableCardProps) {
  const saveLabel = resolveSuggestReusableSaveLabel(reusableKind, labels);
  // A Skill is reusable know-how (Sparkles); a Routine runs on a schedule
  // (CalendarClock). Icons are internal so the labels contract stays icon-free.
  const SaveIcon = reusableKind === "skill" ? Sparkles : CalendarClock;

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
        <p className="font-medium text-ink-muted text-xs">{labels.eyebrow}</p>
        <p className="mt-1.5 text-base text-ink leading-relaxed">{title}</p>
        <p className="mt-1 text-ink-muted text-sm leading-relaxed">
          {rationale}
        </p>
        <div className="mt-4 flex flex-col gap-2">
          <button
            className="flex w-full items-center rounded-xl border border-line/60 bg-input px-3.5 py-3 text-left outline-none transition-colors hover:border-line hover:bg-hover focus-visible:border-focus focus-visible:ring-[3px] focus-visible:ring-focus/50 disabled:pointer-events-none disabled:opacity-50"
            disabled={disabled}
            onClick={onSave}
            type="button"
          >
            <span className="flex items-center gap-2 text-sm font-medium text-ink">
              <SaveIcon className="size-4 shrink-0 text-ink" />
              {saveLabel}
            </span>
          </button>
          <button
            className="flex w-full items-center rounded-xl border border-line/60 bg-input px-3.5 py-3 text-left outline-none transition-colors hover:border-line hover:bg-hover focus-visible:border-focus focus-visible:ring-[3px] focus-visible:ring-focus/50 disabled:pointer-events-none disabled:opacity-50"
            disabled={disabled}
            onClick={onDismiss}
            type="button"
          >
            <span className="flex items-center gap-2 text-sm font-medium text-ink">
              <X className="size-4 shrink-0 text-ink" />
              {labels.notNow}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}
