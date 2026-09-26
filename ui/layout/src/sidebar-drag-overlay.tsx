import { DragOverlay, type Modifiers } from "@dnd-kit/core";
import { createPortal } from "react-dom";
import { SidebarGroupHeader } from "./sidebar-group-header";
import type { SidebarGroupView } from "./sidebar-groups";
import { SidebarItemRow } from "./sidebar-item-row";
import type { SidebarItem } from "./sidebar-props";
import type { SidebarBaseRowContext } from "./sidebar-row-context";

export interface SidebarDragOverlayProps {
  /** The agent being dragged, if this is an item drag. */
  activeItem?: SidebarItem;
  /** The group being dragged, if this is a group-header drag. */
  activeGroup?: SidebarGroupView;
  rowCtx: SidebarBaseRowContext;
  modifiers?: Modifiers;
}

/**
 * The lifted copy that follows the cursor while a drag is in flight: the
 * dragged agent's row, or the dragged group's header. Inert — every row
 * callback is a no-op, because this copy is a picture of the thing being
 * moved, not a second interactive one. Where it will land is shown by the
 * ghost left in the list, so the copy carries no outline of its own.
 *
 * Portalled to `document.body`: the overlay is `position: fixed`, which
 * resolves against the nearest TRANSFORMED ancestor, and the rail's list
 * animates in on `transform`. Inside it, a drag started during that animation
 * draws (and dnd-kit measures) the overlay far from the pointer, so the drop
 * lands on the wrong row.
 */
export function SidebarDragOverlay({
  activeItem,
  activeGroup,
  rowCtx,
  modifiers,
}: SidebarDragOverlayProps) {
  return createPortal(
    <DragOverlay
      modifiers={modifiers}
      dropAnimation={{ duration: 180, easing: "ease" }}
    >
      {activeItem ? (
        <div className="rounded-lg bg-card shadow-drag">
          <SidebarItemRow
            item={activeItem}
            isActive={activeItem.id === rowCtx.selectedId}
            onSelect={() => {}}
          />
        </div>
      ) : activeGroup ? (
        <div className="rounded-lg bg-card shadow-drag">
          <SidebarGroupHeader
            name={activeGroup.name}
            icon={activeGroup.icon}
            collapsed={activeGroup.collapsed}
          />
        </div>
      ) : null}
    </DragOverlay>,
    document.body,
  );
}
