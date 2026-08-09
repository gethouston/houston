import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@houston-ai/core";
import { sidebarRowAffordanceClasses } from "@houston-ai/layout";
import { Plus } from "lucide-react";
import type { ReactNode } from "react";

/**
 * The band's one trailing control wears the library's OWN affordance treatment,
 * imported rather than restated: it sits in a `SidebarRowButton`'s affordance
 * slot beside a team's "..." menu, and two triggers on the same row diverging
 * because one of them was hand-copied is exactly what the shared class exists
 * to prevent. Always visible and muted, strengthening on hover, focus and while
 * open — Houston forbids hover-GATED affordances.
 */
const TRIGGER_CLASSES = sidebarRowAffordanceClasses;

export interface SidebarCreateMenuLabels {
  /** Names the menu, and its trigger, when more than one thing fits in it. */
  menu: string;
  newAgent: string;
  newTeam: string;
}

export interface SidebarCreateMenuProps {
  labels: SidebarCreateMenuLabels;
  /** Absent when this caller may not create agents. */
  onAddAgent?: () => void;
  /** Absent when this caller may not create teams. */
  onNewTeam?: () => void;
}

/**
 * The ONE "+" on the rail's "Your teams" band: everything a user can ADD to
 * this rail, behind a single control.
 *
 * There used to be two glyphs up here, "New agent" and "New team", each an
 * unnamed mark sitting on a row that already had a label. Folding them into one
 * "+" leaves the band with its label and a single unambiguous action, which is
 * what a rail header can carry without becoming a toolbar.
 *
 * A menu is only drawn when there is a choice to make. With exactly one thing
 * to create the control is a plain icon button that does it, named for what it
 * does: a dropdown holding one item is a click spent on nothing. And with
 * nothing to create it renders nothing at all, rather than opening onto an
 * empty menu.
 */
export function SidebarCreateMenu({
  labels,
  onAddAgent,
  onNewTeam,
}: SidebarCreateMenuProps): ReactNode {
  const direct = [
    ...(onAddAgent ? [{ label: labels.newAgent, run: onAddAgent }] : []),
    ...(onNewTeam ? [{ label: labels.newTeam, run: onNewTeam }] : []),
  ];

  // Nothing to add: a plain member on a gateway that predates C13, who may
  // create neither an agent nor a team. The band keeps its label and drops the
  // control.
  if (direct.length === 0) return null;

  // Exactly one, which in practice is always "New team": creating a team is not
  // an admin power on a C13 host, so a member who may not create agents still
  // may create teams. Anyone allowed to create an agent is allowed both, so the
  // mirror case does not exist.
  if (direct.length === 1) {
    const only = direct[0];
    return <SidebarCreateButton label={only.label} onClick={only.run} />;
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={labels.menu}
        className={TRIGGER_CLASSES}
        type="button"
      >
        <Plus className="size-4" aria-hidden="true" />
      </DropdownMenuTrigger>
      {/* Anchored to the trigger's right edge, which sits at the rail's right
          edge: a 208px menu from there lands flush against the window. The
          collision padding keeps the same 8px gutter the rail itself has. */}
      <DropdownMenuContent align="end" collisionPadding={8} className="w-52">
        {direct.map((action) => (
          <DropdownMenuItem key={action.label} onSelect={action.run}>
            {action.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * The one-action form. Icon-only, so the name it performs is carried by the
 * `aria-label` AND by a tooltip: never by hover alone for a screen reader, and
 * never by a glyph alone for anyone else.
 */
function SidebarCreateButton({
  label,
  onClick,
}: {
  label: string;
  onClick: () => void;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={label}
          onClick={onClick}
          className={TRIGGER_CLASSES}
        >
          <Plus className="size-4" aria-hidden="true" />
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom">{label}</TooltipContent>
    </Tooltip>
  );
}
