import { cn } from "@houston-ai/core";
import type { SidebarItem } from "./sidebar";
import { SidebarCollapsedItem } from "./sidebar-collapsed-item";
import { sidebarClasses } from "./sidebar-geometry";
import { SidebarItemRow } from "./sidebar-item-row";
import { sidebarListEnd, sidebarRowNeighbour } from "./sidebar-paint";
import type { SidebarBaseRowContext } from "./sidebar-row-context";

export interface SidebarFlatListProps {
  items: SidebarItem[];
  collapsed: boolean;
  ctx: SidebarBaseRowContext;
}

export function SidebarFlatList({
  items,
  collapsed,
  ctx,
}: SidebarFlatListProps) {
  if (collapsed) {
    return (
      <div className="flex flex-col items-center gap-1 pb-2">
        {items.map((item) => (
          <SidebarCollapsedItem
            key={item.id}
            item={item}
            isActive={item.id === ctx.selectedId}
            onSelect={ctx.onSelect}
          />
        ))}
      </div>
    );
  }

  return (
    <div
      className={cn(sidebarClasses.itemsList, sidebarListEnd)}
      data-sidebar-root-list=""
    >
      {items.map((item) => (
        <div key={item.id} data-sidebar-row="" className={sidebarRowNeighbour}>
          <SidebarItemRow
            item={item}
            isActive={item.id === ctx.selectedId}
            onSelect={ctx.onSelect}
          />
        </div>
      ))}
    </div>
  );
}
