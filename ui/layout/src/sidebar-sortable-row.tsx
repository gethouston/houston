import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { cn } from "@houston-ai/core";
import type { SidebarItem } from "./sidebar";
import { itemDndId } from "./sidebar-dnd";
import type { SidebarRowContext } from "./sidebar-group-section";
import { SidebarItemRow } from "./sidebar-item-row";

export interface SidebarSortableRowProps {
  item: SidebarItem;
  containerId: string | null;
  ctx: SidebarRowContext;
}

/**
 * One agent row made sortable via @dnd-kit. The WHOLE row is the drag handle
 * (pointer/touch `listeners` on the wrapper); with the pointer sensor's distance
 * activation a plain click still selects and the menu / inline-rename still
 * work. We deliberately do NOT spread @dnd-kit's `attributes` here — they put
 * `role="button"` + a tabindex on the wrapper, which turns the row into a
 * button whose accessible name swallows the nested "menu" button (a nested-
 * interactive a11y violation, and it makes `getByRole("button", …)` ambiguous).
 * Rows drag by pointer/touch; ⌘[ / ⌘] already covers keyboard navigation.
 * While this row is the one being dragged it dims to a placeholder — the lifted
 * copy that follows the cursor is rendered once in the parent's {@link DragOverlay}.
 */
export function SidebarSortableRow({
  item,
  containerId,
  ctx,
}: SidebarSortableRowProps) {
  const { listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({
      id: itemDndId(item.id),
      data: { type: "item", itemId: item.id, containerId },
    });

  return (
    <div
      ref={setNodeRef}
      data-sidebar-item=""
      data-item-id={item.id}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn(
        "touch-manipulation cursor-grab active:cursor-grabbing",
        isDragging && "cursor-grabbing opacity-40",
      )}
      {...listeners}
    >
      <SidebarItemRow
        item={item}
        isActive={item.id === ctx.selectedId}
        isEditing={ctx.editingId === item.id}
        editValue={ctx.editValue}
        hasMenu={ctx.hasDefaultMenu || !!item.menuContent}
        onSelect={ctx.onSelect}
        onKeyDown={ctx.onItemKeyDown}
        onEditChange={ctx.onEditChange}
        onCommitRename={ctx.onCommitRename}
        onCancelEdit={ctx.onCancelEdit}
        onStartRename={ctx.onStartRename}
        onDelete={ctx.onDeleteItem}
        labels={ctx.labels}
      />
    </div>
  );
}
