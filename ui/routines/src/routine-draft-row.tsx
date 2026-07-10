/**
 * RoutineDraftRow — a routine still being set up in chat, not created yet.
 * A person can have several of these going at once, so each shows as its own
 * row (never a single global banner) with Resume/Discard.
 */
import { Button, cn } from "@houston-ai/core";
import { MessageCircle } from "lucide-react";
import { DEFAULT_GRID_LABELS, type RoutinesGridLabels } from "./labels";

export interface RoutineDraftRowProps {
  onResume: () => void;
  onDiscard: () => void;
  labels?: RoutinesGridLabels;
}

export function RoutineDraftRow({
  onResume,
  onDiscard,
  labels = DEFAULT_GRID_LABELS,
}: RoutineDraftRowProps) {
  return (
    <div className="flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors hover:bg-hover">
      <div
        className={cn(
          "flex size-5 shrink-0 items-center justify-center rounded-full",
          "bg-input text-ink-muted",
        )}
      >
        <MessageCircle className="size-3" strokeWidth={2} />
      </div>
      <p className="min-w-0 flex-1 truncate text-sm font-medium text-ink-muted italic">
        {labels.draftTitle}
      </p>
      <div className="flex shrink-0 items-center gap-1">
        <Button variant="ghost" size="sm" onClick={onDiscard}>
          {labels.draftDiscard}
        </Button>
        <Button variant="secondary" size="sm" onClick={onResume}>
          {labels.draftResume}
        </Button>
      </div>
    </div>
  );
}
