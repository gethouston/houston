import type { SidebarItem } from "./sidebar";
import { sidebarClasses } from "./sidebar-geometry";
import { SidebarItemRow } from "./sidebar-item-row";
import { sidebarRowNeighbour } from "./sidebar-paint";
import type { SidebarBaseRowContext } from "./sidebar-row-context";

export interface SidebarPinnedListProps {
  items: SidebarItem[];
  ctx: SidebarBaseRowContext;
}

export function SidebarPinnedList({ items, ctx }: SidebarPinnedListProps) {
  if (items.length === 0) return null;
  return (
    <div className={sidebarClasses.pinnedList}>
      {items.map((item) => (
        <div key={item.id} data-sidebar-row="" className={sidebarRowNeighbour}>
          <SidebarItemRow
            item={item}
            isActive={item.id === ctx.selectedId}
            onSelect={ctx.onSelect}
            draggable={false}
          />
        </div>
      ))}
    </div>
  );
}
