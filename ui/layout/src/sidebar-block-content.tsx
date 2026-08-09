import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import type { SidebarItem } from "./sidebar-props";
import type { SidebarRowContext } from "./sidebar-row-context";
import { SidebarSortableRow } from "./sidebar-sortable-row";

export interface SidebarBlockContentProps {
  items: SidebarItem[];
  /** The container these items sort within (`null` = the default section). */
  containerId: string | null;
  ctx: SidebarRowContext;
}

/**
 * Everything a block folds away: its item rows as a vertical
 * {@link SortableContext}.
 *
 * A block holds MEMBERS and nothing else now. Its destinations moved onto the
 * screen the header opens, where they are tabs over the team's own work rather
 * than four more rows of rail per team. An EMPTY block shows nothing at all —
 * no hint row: the add row under it is the affordance, and a sentence of
 * instructions in the rail read as clutter next to it.
 *
 * It is only ever rendered when the block is OPEN, and it carries the entrance
 * animation for that. The droppable container it sits inside stays mounted
 * either way, so the conditional lives here, around the content, and never
 * around the container.
 */
export function SidebarBlockContent({
  items,
  containerId,
  ctx,
}: SidebarBlockContentProps) {
  return (
    <div className="sidebar-disclosure-in flex flex-col gap-px">
      <SortableContext
        items={items.map((it) => `item:${it.id}`)}
        strategy={verticalListSortingStrategy}
      >
        {items.map((item) => (
          <SidebarSortableRow
            key={item.id}
            item={item}
            containerId={containerId}
            ctx={ctx}
          />
        ))}
      </SortableContext>
    </div>
  );
}
