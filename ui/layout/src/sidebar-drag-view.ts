import type { WorkingSection } from "./sidebar-dnd";
import {
  computeSidebarSections,
  type SidebarGroupView,
  type SidebarSection,
} from "./sidebar-groups";
import type { SidebarItem } from "./sidebar-props";

/** Everything the drag state machine holds that changes what gets rendered. */
export interface SidebarDragMarkers {
  /** The live working copy while a drag is in flight (and until the committed
   *  props catch up); null when the list renders straight from props. */
  working: WorkingSection[] | null;
  activeItemId: string | null;
  activeGroupId: string | null;
  /** The pointer is over a block this item may not land in. */
  rejecting: boolean;
}

export interface SidebarDragProjection {
  sections: SidebarSection[];
  activeItem?: SidebarItem;
  activeGroup?: SidebarGroupView;
  /** The lifted copy is over a block that will not take it — an item may only
   *  be reordered inside the block it was picked up from. */
  rejected: boolean;
}

/**
 * Project the drag markers onto what the grouped list draws: the sections it
 * renders (the working copy while dragging, otherwise the props' own
 * partition), whatever the overlay is carrying, and whether that overlay is
 * currently over a block that refuses it.
 */
export function projectSidebarDrag(
  items: SidebarItem[],
  groups: SidebarGroupView[],
  { working, activeItemId, activeGroupId, rejecting }: SidebarDragMarkers,
): SidebarDragProjection {
  const byId = new Map(items.map((it) => [it.id, it]));
  const groupById = new Map(groups.map((g) => [g.id, g]));
  const base = computeSidebarSections(items, groups);
  const sections: SidebarSection[] = working
    ? working.map((ws) => ({
        groupId: ws.groupId,
        group: ws.groupId ? (groupById.get(ws.groupId) ?? null) : null,
        items: ws.itemIds
          .map((id) => byId.get(id))
          .filter((it): it is SidebarItem => !!it),
      }))
    : base;

  const activeItem = activeItemId ? byId.get(activeItemId) : undefined;
  const activeGroup = activeGroupId ? groupById.get(activeGroupId) : undefined;

  return {
    sections,
    activeItem,
    activeGroup,
    rejected: activeItemId !== null && rejecting,
  };
}
