import { DndContext, MeasuringStrategy } from "@dnd-kit/core";
import { restrictToVerticalAxis } from "@dnd-kit/modifiers";
import type { SidebarItem } from "./sidebar";
import { SidebarAddRow } from "./sidebar-add-row";
import { SidebarDragOverlay } from "./sidebar-drag-overlay";
import { collisionDetection } from "./sidebar-drop-target";
import { sidebarClasses } from "./sidebar-geometry";
import { SidebarGroupSection } from "./sidebar-group-section";
import type {
  SidebarDefaultGroupView,
  SidebarGroupView,
} from "./sidebar-groups";
import type { SidebarBaseRowContext } from "./sidebar-row-context";
import { useSidebarDragState } from "./use-sidebar-drag-state";

export interface SidebarGroupedListProps {
  items: SidebarItem[];
  groups: SidebarGroupView[];
  /** Renders the trailing default section as a labelled block. */
  defaultGroup?: SidebarDefaultGroupView;
  rowCtx: SidebarBaseRowContext;
  /** A block's header row was activated. */
  onActivateGroup?: (groupId: string) => void;
  /** The trailing DEFAULT block's header was activated. Its own callback
   *  because that block is not a stored group and has no id to hand back. */
  onActivateDefault?: () => void;
  onAddToGroup?: (groupId: string | null) => void;
  /** Reorder an item WITHIN its own container. */
  onMoveItem?: (
    itemId: string,
    dest: { groupId: string | null; beforeItemId: string | null },
  ) => void;
  onMoveGroup?: (groupId: string, beforeGroupId: string | null) => void;
  /** Creates an item. Rendered as the row that CLOSES the list, because this is
   *  the rail's primary action and a primary action may not live only inside a
   *  menu. */
  onAdd?: () => void;
  addItemLabel?: string;
  addItemDataAttrs?: Record<string, string>;
}

/**
 * Expanded grouped sidebar with @dnd-kit drag-and-drop (always on): a lifted
 * `DragOverlay` copy follows the cursor, sibling rows animate out of the way,
 * agents reorder INSIDE their own group, and group headers reorder whole
 * groups. A drag over any other group is refused and the lifted copy says so
 * (see {@link useSidebarDragState}). Movement is applied live to a working copy
 * in `onDragOver`; the final position commits through `onMoveItem` /
 * `onMoveGroup` on drop. Pointer, touch (press-hold) and keyboard sensors;
 * vertical-axis constrained; droppables always measured for smooth reflow.
 */
export function SidebarGroupedList({
  items,
  groups,
  defaultGroup,
  rowCtx,
  onActivateGroup,
  onActivateDefault,
  onAddToGroup,
  onMoveItem,
  onMoveGroup,
  onAdd,
  addItemLabel,
  addItemDataAttrs,
}: SidebarGroupedListProps) {
  const drag = useSidebarDragState({ items, groups, onMoveItem, onMoveGroup });

  return (
    <DndContext
      sensors={drag.sensors}
      collisionDetection={collisionDetection}
      modifiers={[restrictToVerticalAxis]}
      measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
      onDragStart={drag.onDragStart}
      onDragOver={drag.onDragOver}
      onDragEnd={drag.onDragEnd}
      onDragCancel={drag.reset}
    >
      <div className={sidebarClasses.itemsList}>
        {drag.sections.map((section) => (
          <SidebarGroupSection
            key={section.groupId ?? "__default"}
            section={section}
            ctx={rowCtx}
            defaultGroup={defaultGroup}
            highlight={drag.overContainer === section.groupId}
            onAdd={onAddToGroup}
            addItemLabel={addItemLabel}
            addItemDataAttrs={addItemDataAttrs}
            onActivateGroup={onActivateGroup}
            onActivateDefault={onActivateDefault}
          />
        ))}
        {!onAddToGroup && onAdd && addItemLabel && (
          <SidebarAddRow
            label={addItemLabel}
            onClick={onAdd}
            dataAttrs={addItemDataAttrs}
          />
        )}
      </div>

      <SidebarDragOverlay
        activeItem={drag.activeItem}
        activeGroup={drag.activeGroup}
        rejected={drag.rejected}
        rowCtx={rowCtx}
      />
    </DndContext>
  );
}
