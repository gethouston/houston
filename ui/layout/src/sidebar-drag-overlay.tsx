import { DragOverlay } from "@dnd-kit/core";
import { cn } from "@houston-ai/core";
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
  /** The pointer is over a block that will not take this item — dim the lifted
   *  copy so the gesture reads as refused before it is released. */
  rejected: boolean;
  rowCtx: SidebarBaseRowContext;
}

/**
 * The lifted copy that follows the cursor while a drag is in flight: the
 * dragged agent's row, or the dragged group's header. Inert — every row
 * callback is a no-op, because this copy is a picture of the thing being
 * moved, not a second interactive one.
 *
 * Over a block the item may not land in it DIMS, and no block highlights. That
 * pair is the cancel affordance: nothing on screen offers to receive the row,
 * and releasing there simply drops it back where it came from — which is what
 * @dnd-kit's return animation then shows.
 */
export function SidebarDragOverlay({
  activeItem,
  activeGroup,
  rejected,
  rowCtx,
}: SidebarDragOverlayProps) {
  return (
    <DragOverlay dropAnimation={{ duration: 180, easing: "ease" }}>
      {activeItem ? (
        <div
          className={cn(
            "rounded-lg bg-card shadow-lg ring-1 ring-line transition-opacity",
            rejected && "opacity-40",
          )}
        >
          <SidebarItemRow
            item={activeItem}
            isActive={activeItem.id === rowCtx.selectedId}
            onSelect={() => {}}
          />
        </div>
      ) : activeGroup ? (
        <div className="rounded-lg bg-card shadow-lg ring-1 ring-line">
          <SidebarGroupHeader
            name={activeGroup.name}
            icon={activeGroup.icon}
            collapsed={activeGroup.collapsed}
            labels={rowCtx.labels}
          />
        </div>
      ) : null}
    </DragOverlay>
  );
}
