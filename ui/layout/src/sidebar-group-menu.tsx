import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@houston-ai/core";
import { MoreHorizontal } from "lucide-react";
import { useState } from "react";
import type { SidebarLabels } from "./sidebar";
import {
  affordanceAllowed,
  type SidebarGroupAffordances,
} from "./sidebar-groups";
import {
  sidebarRowAffordanceClasses,
  sidebarRowAffordanceGutter,
} from "./sidebar-paint";

export interface SidebarGroupMenuProps {
  /** What this block offers, independently of its siblings. */
  affordances?: SidebarGroupAffordances;
  labels: Required<SidebarLabels>;
  /** Open the host's "change icon & name" surface for this block. A block's
   *  name, mark and colour are ONE identity, so the menu carries one entry for
   *  all of it — the host owns the surface it opens, which is what keeps the
   *  create form and the edit form the same component over there. */
  onEdit?: () => void;
  onOpenSettings?: () => void;
  onDelete?: () => void;
  onLeave?: () => void;
}

/**
 * A block header's quiet "..." menu. It owns the ENTIRE visibility decision,
 * including whether to exist at all, so no caller re-derives it: an entry needs
 * its callback AND the block's affordance mask to allow it (see
 * {@link SidebarGroupAffordances}), and with nothing left to show the trigger
 * is not rendered either — an empty menu is a promise the block cannot keep.
 *
 * That rule is what lets the DEFAULT block share this component: it is handed
 * the one entry it can have (edit) and the same mask, so on a host where the
 * caller may not edit it the menu simply does not exist.
 *
 * With nothing to show it still RESERVES the affordance column rather than
 * rendering nothing at all. The gutter is what keeps every block's name
 * truncating at the same point: a header given 28px more room than the teams
 * above it reads as a second list. The header used to supply that spacer
 * itself, but only when it was handed no menu render-prop at all — and the
 * default block is now always handed one, so the column has to be this
 * component's own responsibility.
 */
export function SidebarGroupMenu({
  affordances,
  labels,
  onEdit,
  onOpenSettings,
  onDelete,
  onLeave,
}: SidebarGroupMenuProps) {
  const [open, setOpen] = useState(false);

  const showEdit = !!onEdit && affordanceAllowed(affordances, "edit");
  const showSettings =
    !!onOpenSettings && affordanceAllowed(affordances, "settings");
  const showDelete = !!onDelete && affordanceAllowed(affordances, "delete");
  const showLeave = !!onLeave && affordanceAllowed(affordances, "leave");
  // Everything that edits the GROUP, as opposed to the caller's standing in it.
  const showGroupItems = showSettings || showEdit || showDelete;
  if (!showGroupItems && !showLeave)
    return <span aria-hidden="true" className={sidebarRowAffordanceGutter} />;

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={labels.groupMenu}
          className={sidebarRowAffordanceClasses}
        >
          <MoreHorizontal className="size-3.5" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" side="bottom">
        {showSettings && (
          <DropdownMenuItem
            data-group-settings
            onSelect={() => onOpenSettings?.()}
          >
            {labels.groupSettings}
          </DropdownMenuItem>
        )}
        {showEdit && (
          <DropdownMenuItem onSelect={() => onEdit?.()}>
            {labels.editGroup}
          </DropdownMenuItem>
        )}
        {showDelete && (
          <DropdownMenuItem
            onSelect={() => onDelete?.()}
            className="text-danger focus:text-danger"
          >
            {labels.deleteGroup}
          </DropdownMenuItem>
        )}
        {/* Leaving acts on YOU, not on the group, so it sits below the rule
            that closes off the group's own actions. The rule is skipped when
            there is nothing above it to separate. */}
        {showLeave && showGroupItems && <DropdownMenuSeparator />}
        {showLeave && (
          <DropdownMenuItem onSelect={() => onLeave?.()}>
            {labels.leaveGroup}
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
