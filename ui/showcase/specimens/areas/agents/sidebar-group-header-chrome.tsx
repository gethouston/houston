import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@houston-ai/core";
import { sidebarRowAffordanceClasses } from "@houston-ai/layout";
import { MoreHorizontal, Users } from "lucide-react";

import { GROUP_LABELS } from "./sidebar-group-header-api";

/**
 * What the HOST puts on a team's header row, as opposed to what the header
 * itself draws: the team's mark and the "..." menu. Both are props, which is
 * how the library stays generic about what a block actually is.
 */

/**
 * The team's mark. Monochrome on purpose: the identity colour in this column
 * belongs to the agent avatars below it, and a second palette stacked directly
 * above them would compete with the one that carries real meaning.
 */
export function TeamGlyph() {
  return <Users className="size-4" />;
}

/**
 * The "..." menu, rendered as the toggle's SIBLING because a button may not
 * nest inside a button.
 *
 * It arrives through a render prop for one reason: Rename has to open the
 * inline rename the header itself owns, so the header hands `beginRename` out
 * and the menu hands it back. One rename session, in one place, with the header
 * still ignorant of what the menu contains.
 */
export function TeamMenu({ beginRename }: { beginRename: () => void }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={GROUP_LABELS.groupMenu}
          className={sidebarRowAffordanceClasses}
        >
          <MoreHorizontal className="size-3.5" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" side="bottom">
        <DropdownMenuItem onSelect={beginRename}>
          {GROUP_LABELS.renameGroup}
        </DropdownMenuItem>
        <DropdownMenuItem className="text-danger focus:text-danger">
          {GROUP_LABELS.deleteGroup}
        </DropdownMenuItem>
        {/* Leaving acts on YOU, not on the team, so it sits below the rule that
            closes off the team's own actions. */}
        <DropdownMenuSeparator />
        <DropdownMenuItem>{GROUP_LABELS.leaveGroup}</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
