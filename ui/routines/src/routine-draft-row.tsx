/**
 * RoutineDraftRow — a routine still being set up in chat, not created yet.
 * A person can have several going at once, so each shows as its own compact
 * row (never a single global banner), in the same selectable list language as
 * the created rows: clicking the row resumes its setup chat (opening it in the
 * right pane), and a trailing button discards it.
 */
import { cn, Tooltip, TooltipContent, TooltipTrigger } from "@houston-ai/core";
import { MessageCircle, X } from "lucide-react";
import { DEFAULT_GRID_LABELS, type RoutinesGridLabels } from "./labels";

export interface RoutineDraftRowProps {
  /** Marks the draft whose chat is open in the right pane (selected state). */
  selected?: boolean;
  onResume: () => void;
  onDiscard: () => void;
  labels?: RoutinesGridLabels;
}

export function RoutineDraftRow({
  selected = false,
  onResume,
  onDiscard,
  labels = DEFAULT_GRID_LABELS,
}: RoutineDraftRowProps) {
  return (
    <div
      role="option"
      aria-selected={selected}
      aria-label={labels.draftTitle}
      tabIndex={0}
      onClick={() => onResume()}
      onKeyDown={(e) => {
        if (
          e.target === e.currentTarget &&
          (e.key === "Enter" || e.key === " ")
        ) {
          e.preventDefault();
          onResume();
        }
      }}
      className={cn(
        "flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2",
        "outline-none transition-colors focus-visible:ring-2 focus-visible:ring-focus",
        selected
          ? "border-transparent bg-hover shadow-sm"
          : "border-line bg-card hover:bg-hover/40",
      )}
    >
      <span className="grid size-6 shrink-0 place-items-center">
        <MessageCircle className="size-4 text-ink-muted" strokeWidth={2} />
      </span>
      <p className="min-w-0 flex-1 truncate text-[13px] font-medium italic text-ink-muted">
        {labels.draftTitle}
      </p>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onDiscard();
            }}
            aria-label={labels.draftDiscard}
            className={cn(
              "shrink-0 rounded-md p-1 text-ink-muted/60 transition-colors",
              "hover:bg-hover hover:text-ink",
              "outline-none focus-visible:ring-2 focus-visible:ring-focus",
            )}
          >
            <X className="size-3.5" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="top">{labels.draftDiscard}</TooltipContent>
      </Tooltip>
    </div>
  );
}
