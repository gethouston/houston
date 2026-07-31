import { Button } from "@houston-ai/core";
import { ArrowLeft } from "lucide-react";

interface BoardBackButtonProps {
  /** Names the destination, e.g. "Back to missions". */
  label: string;
  onClick: () => void;
}

/**
 * The one way out of a side view of the board (Archived, Mentions) back to the
 * active missions. It always carries its label as TEXT and never collapses to a
 * bare arrow or a tooltip: the return path is the first thing someone looks for
 * once they land somewhere secondary, so it has to be readable at a glance
 * (HOU-1043). Both board surfaces render this same control, so the way out
 * looks identical whichever door the user came through.
 */
export function BoardBackButton({ label, onClick }: BoardBackButtonProps) {
  return (
    <Button
      type="button"
      variant="outline"
      className="shrink-0 gap-1.5 active:scale-95"
      onClick={onClick}
    >
      <ArrowLeft className="size-4" />
      {label}
    </Button>
  );
}
