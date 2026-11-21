import { DragOverlay, type Modifiers } from "@dnd-kit/core";
import { createPortal } from "react-dom";
import { SidebarGroupHeader } from "./sidebar-group-header";
import type { SidebarGroupView } from "./sidebar-groups";
import { SidebarItemRow } from "./sidebar-item-row";
import type { SidebarItem } from "./sidebar-props";
import type { SidebarBaseRowContext } from "./sidebar-row-context";

export interface SidebarDragOverlayProps {
  activeItem?: SidebarItem;
  activeGroup?: SidebarGroupView;
  rowCtx: SidebarBaseRowContext;
  modifiers?: Modifiers;
}

export function SidebarDragOverlay({
  activeItem,
  activeGroup,
  rowCtx,
  modifiers,
}: SidebarDragOverlayProps) {
  if (typeof document === "undefined") return null;
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
