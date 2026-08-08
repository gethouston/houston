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
import { sidebarGroupClasses } from "./sidebar-classes";
import { groupAllows, type SidebarGroupView } from "./sidebar-groups";

export interface SidebarGroupMenuProps {
  group: SidebarGroupView;
  labels: Required<SidebarLabels>;
  onEditContext?: (groupId: string) => void;
  /** Enter the header's inline rename. Supplied only when the host wired
   *  `onRenameGroup` — the header owns the input, the menu owns the entry. */
  onStartRename?: () => void;
  onDeleteGroup?: (groupId: string) => void;
  onLeave?: (groupId: string) => void;
}

/**
 * The group header's quiet "..." menu. It owns the ENTIRE visibility decision,
 * including whether to exist at all, so no caller re-derives it: an entry needs
 * its callback AND the group's affordance mask to allow it (see
 * {@link SidebarGroupAffordances}), and with nothing left to show the trigger
 * is not rendered either — an empty menu is a promise the group cannot keep.
 */
export function SidebarGroupMenu({
  group,
  labels,
  onEditContext,
  onStartRename,
  onDeleteGroup,
  onLeave,
}: SidebarGroupMenuProps) {
  const [open, setOpen] = useState(false);

  const showContext = !!onEditContext && groupAllows(group, "context");
  const showRename = !!onStartRename && groupAllows(group, "rename");
  const showDelete = !!onDeleteGroup && groupAllows(group, "delete");
  const showLeave = !!onLeave && groupAllows(group, "leave");
  // Everything that edits the GROUP, as opposed to the caller's standing in it.
  const showGroupItems = showContext || showRename || showDelete;
  if (!showGroupItems && !showLeave) return null;

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={labels.groupMenu}
          className={sidebarGroupClasses.menuButton}
        >
          <MoreHorizontal className="size-3.5" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" side="bottom">
        {showContext && (
          <DropdownMenuItem onSelect={() => onEditContext?.(group.id)}>
            {labels.editGroupContext}
          </DropdownMenuItem>
        )}
        {showRename && (
          <DropdownMenuItem onSelect={() => onStartRename?.()}>
            {labels.renameGroup}
          </DropdownMenuItem>
        )}
        {showDelete && (
          <DropdownMenuItem
            onSelect={() => onDeleteGroup?.(group.id)}
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
          <DropdownMenuItem onSelect={() => onLeave?.(group.id)}>
            {labels.leaveGroup}
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
