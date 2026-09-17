import { Tooltip, TooltipContent, TooltipTrigger } from "@houston-ai/core";
import { sidebarRowAffordanceClasses } from "@houston-ai/layout";
import { Plus } from "lucide-react";
import type { ReactNode } from "react";

export interface SidebarCreateLabels {
  /** Names the control when more than one thing can be added. */
  title: string;
  newAgent: string;
  newTeam: string;
}

/**
 * The ONE "+" on the rail's "Your teams" band: everything a user can ADD to
 * this rail, behind a single control.
 *
 * It opens the create sheet and nothing else. The sheet itself asks "what do
 * you want to add?" when there is a choice to make and opens straight on the
 * one thing this user may create when there is not, so the two can never
 * disagree — the control only has to NAME what pressing it does, which is why
 * a caller who may create only teams reads "New team" rather than "Create".
 *
 * With nothing to create it renders nothing at all: a plain member on a
 * gateway that predates C13 may create neither an agent nor a team, and the
 * band keeps its label and drops the control.
 *
 * The button wears the library's OWN affordance treatment, imported rather
 * than restated: it sits in a `SidebarRowButton`'s affordance slot beside a
 * team's "..." menu, and two triggers on the same row diverging because one of
 * them was hand-copied is exactly what the shared class exists to prevent.
 * Always visible and muted, strengthening on hover and focus — Houston forbids
 * hover-GATED affordances.
 */
export function SidebarCreateButton({
  labels,
  canAddAgent,
  canAddTeam,
  onOpen,
}: {
  labels: SidebarCreateLabels;
  canAddAgent: boolean;
  canAddTeam: boolean;
  onOpen: () => void;
}): ReactNode {
  if (!canAddAgent && !canAddTeam) return null;
  const label =
    canAddAgent && canAddTeam
      ? labels.title
      : canAddAgent
        ? labels.newAgent
        : labels.newTeam;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={label}
          onClick={onOpen}
          className={sidebarRowAffordanceClasses}
        >
          <Plus className="size-4" aria-hidden="true" />
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom">{label}</TooltipContent>
    </Tooltip>
  );
}
