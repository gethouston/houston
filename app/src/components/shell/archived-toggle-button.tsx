import { Tooltip, TooltipContent, TooltipTrigger } from "@houston-ai/core";
import { Archive } from "lucide-react";

interface ArchivedToggleButtonProps {
  archived: boolean;
  label: string;
  onToggle: () => void;
}

/**
 * Floating control for switching between live and archived missions: a round
 * action-colored button anchored over the board's bottom-right corner. Icon
 * only, so the label rides on a tooltip and the aria-label; `aria-pressed`
 * carries the mode for assistive tech while the ring marks it visually.
 */
export function ArchivedToggleButton({
  archived,
  label,
  onToggle,
}: ArchivedToggleButtonProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          data-tour-target="archivedMissions"
          className={`absolute right-6 bottom-6 z-20 flex size-12 items-center justify-center rounded-full border border-line-input bg-input text-ink transition-[background-color,color,transform] hover:bg-hover hover:text-hover-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 active:scale-95 ${
            archived ? "ring-2 ring-focus ring-offset-2" : ""
          }`}
          onClick={onToggle}
          aria-label={label}
          aria-pressed={archived}
        >
          <Archive className="size-5" />
        </button>
      </TooltipTrigger>
      <TooltipContent side="left">{label}</TooltipContent>
    </Tooltip>
  );
}
