"use client";

import { X } from "lucide-react";
import { Suggestion, Suggestions } from "./ai-elements/suggestion";

export interface ChatSuggestActionsLabels {
  heading: string;
  dismiss: string;
}

export const DEFAULT_SUGGEST_ACTIONS_LABELS: ChatSuggestActionsLabels = {
  heading: "Continue with",
  dismiss: "Dismiss suggested actions",
};

export interface ChatSuggestActionsProps {
  actions: { id: string; label: string; message: string }[];
  disabled?: boolean;
  labels?: ChatSuggestActionsLabels;
  onSelect: (action: { id: string; label: string; message: string }) => void;
  onDismiss?: () => void;
}

/** Optional next-step bubbles shown above a live composer after a clean finish.
 *  The chips wrap onto more lines, so the heading and the dismiss X sit on the
 *  first line (both 32px tall, the chip height) rather than centring on the
 *  whole block. */
export function ChatSuggestActions({
  actions,
  disabled = false,
  labels = DEFAULT_SUGGEST_ACTIONS_LABELS,
  onSelect,
  onDismiss,
}: ChatSuggestActionsProps) {
  return (
    <div className="flex items-start gap-2">
      <p className="flex h-8 shrink-0 items-center text-ink-muted text-xs">
        {labels.heading}
      </p>
      <Suggestions className="flex-1">
        {actions.map((action) => (
          <Suggestion
            disabled={disabled}
            key={action.id}
            onClick={() => onSelect(action)}
            suggestion={action.label}
          />
        ))}
      </Suggestions>
      {onDismiss ? (
        <button
          aria-label={labels.dismiss}
          className="relative inline-flex size-8 shrink-0 items-center justify-center rounded-full text-ink-muted outline-none transition-[color,background-color,scale] hover:bg-hover hover:text-ink active:scale-[0.96] md:active:scale-100 focus-visible:ring-[3px] focus-visible:ring-focus/50 disabled:pointer-events-none after:absolute after:-inset-1.5 md:after:hidden"
          disabled={disabled}
          onClick={onDismiss}
          type="button"
        >
          <X className="size-4" />
        </button>
      ) : null}
    </div>
  );
}
