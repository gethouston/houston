import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  HoustonHelmet,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@houston-ai/core";
import { sidebarRowAffordanceClasses } from "@houston-ai/layout";
import { FolderPlus, Plus } from "lucide-react";
import type { ReactNode } from "react";

export interface SidebarCreateLabels {
  /** Names the control when more than one thing can be added. */
  title: string;
  newAgent: string;
  newTeam: string;
}

/**
 * The ONE "+" on the rail's "Your AI Employees" band: everything a user can ADD to
 * this rail, behind a single control.
 *
 * When both choices are available, its menu opens the corresponding form
 * directly. A sole available choice opens that form with one press.
 *
 * With nothing to create it renders nothing at all: the band keeps its label
 * and drops the control.
 *
 * The button wears the library's OWN affordance treatment, imported rather
 * than restated: it sits in a `SidebarRowButton`'s affordance slot beside a
 * group's "..." menu, and two triggers on the same row diverging because one of
 * them was hand-copied is exactly what the shared class exists to prevent.
 * Always visible and muted, strengthening on hover and focus — Houston forbids
 * hover-GATED affordances.
 */
export function SidebarCreateButton({
  labels,
  onNewAgent,
  onNewTeam,
}: {
  labels: SidebarCreateLabels;
  onNewAgent?: () => void;
  onNewTeam?: () => void;
}): ReactNode {
  const canAddAgent = onNewAgent !== undefined;
  const canAddTeam = onNewTeam !== undefined;
  if (!canAddAgent && !canAddTeam) return null;
  const label =
    canAddAgent && canAddTeam
      ? labels.title
      : canAddAgent
        ? labels.newAgent
        : labels.newTeam;

  const button = (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={label}
          onClick={onNewAgent ?? onNewTeam}
          className={sidebarRowAffordanceClasses}
        >
          <Plus className="size-4" aria-hidden="true" />
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom">{label}</TooltipContent>
    </Tooltip>
  );
  if (!onNewAgent || !onNewTeam) return button;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={label}
          className={sidebarRowAffordanceClasses}
        >
          <Plus className="size-4" aria-hidden="true" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuItem onSelect={onNewAgent}>
          <HoustonHelmet size={16} color="currentColor" />
          {labels.newAgent}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={onNewTeam}>
          <FolderPlus className="size-4" aria-hidden="true" />
          {labels.newTeam}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
