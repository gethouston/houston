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
import type { SidebarGroupIdentity } from "./sidebar-group-identity";
import { SidebarGroupIdentityMenu } from "./sidebar-group-identity";
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
  /** The block's icon-and-colour picker, already bound to it. Absent means the
   *  block offers no identity entry; see {@link SidebarGroupIdentity}. */
  identity?: SidebarGroupIdentity;
  /** Enter the header's inline rename. Supplied only when the host wired a
   *  rename — the header owns the input, the menu owns the entry. */
  onStartRename?: () => void;
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
 * the two entries it can have (rename, identity) and the same mask, so on a
 * host where the caller may do neither the menu simply does not exist.
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
  identity,
  onStartRename,
  onDelete,
  onLeave,
}: SidebarGroupMenuProps) {
  const [open, setOpen] = useState(false);

  const showIdentity = !!identity && affordanceAllowed(affordances, "identity");
  const showRename =
    !!onStartRename && affordanceAllowed(affordances, "rename");
  const showDelete = !!onDelete && affordanceAllowed(affordances, "delete");
  const showLeave = !!onLeave && affordanceAllowed(affordances, "leave");
  // Everything that edits the GROUP, as opposed to the caller's standing in it.
  const showGroupItems = showIdentity || showRename || showDelete;
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
        {/* The look comes FIRST: it is the entry a user reaches for most often
            and the only one that opens a panel rather than acting at once. */}
        {showIdentity && identity && (
          <SidebarGroupIdentityMenu identity={identity} />
        )}
        {showRename && (
          <DropdownMenuItem onSelect={() => onStartRename?.()}>
            {labels.renameGroup}
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
