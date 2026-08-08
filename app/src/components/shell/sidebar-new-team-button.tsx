import { Tooltip, TooltipContent, TooltipTrigger } from "@houston-ai/core";
import { Users } from "lucide-react";

/**
 * The "New team" control on the rail's "Your teams" header. The header line has
 * room for a glyph and nothing else, so the name is carried by the tooltip and
 * by the `aria-label` — never by hover alone for a screen reader.
 */
export function SidebarNewTeamButton(props: {
  /** Both the accessible name and the tooltip: one string, one meaning. */
  label: string;
  onClick: () => void;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={props.label}
          onClick={props.onClick}
          className="flex size-6 shrink-0 items-center justify-center rounded-md text-ink-muted transition-colors hover:bg-hover hover:text-ink focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-focus"
        >
          <Users className="size-4" />
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom">{props.label}</TooltipContent>
    </Tooltip>
  );
}
