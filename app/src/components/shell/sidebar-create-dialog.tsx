import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  HoustonHelmet,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@houston-ai/core";
import { sidebarRowAffordanceClasses } from "@houston-ai/layout";
import { Plus, Users } from "lucide-react";
import { type ReactNode, useState } from "react";
import { type ChoiceTileIcon, CreateChoiceTile } from "./create-choice-tile";

/**
 * The Houston helmet as a tile icon: an AGENT is a Houston, so the "New agent"
 * tile wears the product's own mark, not a generic robot. `currentColor` keeps
 * it in the tile's ink exactly like a Lucide glyph, hover brightening and all.
 */
function HoustonMark({ className }: { className?: string }) {
  return <HoustonHelmet color="currentColor" className={className} />;
}

/**
 * The band's one trailing control wears the library's OWN affordance treatment,
 * imported rather than restated: it sits in a `SidebarRowButton`'s affordance
 * slot beside a team's "..." menu, and two triggers on the same row diverging
 * because one of them was hand-copied is exactly what the shared class exists
 * to prevent. Always visible and muted, strengthening on hover, focus and while
 * open — Houston forbids hover-GATED affordances.
 */
const TRIGGER_CLASSES = sidebarRowAffordanceClasses;

export interface SidebarCreateDialogLabels {
  /** Names the dialog, and its trigger, when more than one thing fits in it. */
  title: string;
  /** Screen-reader name of the dialog's "X" close button. */
  close: string;
  newAgent: string;
  newTeam: string;
}

export interface SidebarCreateDialogProps {
  labels: SidebarCreateDialogLabels;
  /** Absent when this caller may not create agents. */
  onAddAgent?: () => void;
  /** Absent when this caller may not create teams. */
  onNewTeam?: () => void;
}

/**
 * The ONE "+" on the rail's "Your teams" band: everything a user can ADD to
 * this rail, behind a single control.
 *
 * With a choice to make it opens a modal of square choice tiles, one per thing
 * the user may create — a deliberate stop ("what am I making?"), not a menu
 * flicked past. Picking a tile closes this dialog and hands off to that
 * action's own flow.
 *
 * With exactly one thing to create the control is a plain icon button that does
 * it, named for what it does: a dialog holding one choice is a click spent on
 * nothing. And with nothing to create it renders nothing at all.
 */
export function SidebarCreateDialog({
  labels,
  onAddAgent,
  onNewTeam,
}: SidebarCreateDialogProps): ReactNode {
  const [open, setOpen] = useState(false);
  const direct: { label: string; icon: ChoiceTileIcon; run: () => void }[] = [
    ...(onAddAgent
      ? [{ label: labels.newAgent, icon: HoustonMark, run: onAddAgent }]
      : []),
    ...(onNewTeam
      ? [{ label: labels.newTeam, icon: Users, run: onNewTeam }]
      : []),
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

  // Close BEFORE running: each action opens its own surface (the create-team
  // dialog, the new-agent flow), and this chooser lingering underneath it would
  // read as two stacked modals.
  const choose = (run: () => void) => {
    setOpen(false);
    run();
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Tooltip>
        <TooltipTrigger asChild>
          <DialogTrigger
            aria-label={labels.title}
            className={TRIGGER_CLASSES}
            type="button"
          >
            <Plus className="size-4" aria-hidden="true" />
          </DialogTrigger>
        </TooltipTrigger>
        <TooltipContent side="bottom">{labels.title}</TooltipContent>
      </Tooltip>
      {/* No body copy: the two tiles ARE the content, so there is no
          description element to point aria-describedby at. */}
      <DialogContent
        className="sm:max-w-sm"
        closeLabel={labels.close}
        aria-describedby={undefined}
      >
        <DialogHeader>
          <DialogTitle>{labels.title}</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          {direct.map(({ label, icon, run }) => (
            <CreateChoiceTile
              key={label}
              icon={icon}
              title={label}
              onClick={() => choose(run)}
            />
          ))}
        </div>
      </DialogContent>
    </Dialog>
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
