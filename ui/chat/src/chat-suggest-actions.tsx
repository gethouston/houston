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

/** Optional next-step bubbles shown above a live composer after a clean finish. */
export function ChatSuggestActions({
  actions,
  disabled = false,
  labels = DEFAULT_SUGGEST_ACTIONS_LABELS,
  onSelect,
  onDismiss,
}: ChatSuggestActionsProps) {
  return (
    <div className="flex items-center gap-2">
      <p className="shrink-0 text-ink-muted text-xs">{labels.heading}</p>
      <Suggestions>
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
          className="inline-flex size-8 shrink-0 items-center justify-center rounded-full text-ink-muted outline-none transition-colors hover:bg-hover hover:text-ink focus-visible:ring-[3px] focus-visible:ring-focus/50 disabled:pointer-events-none"
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
