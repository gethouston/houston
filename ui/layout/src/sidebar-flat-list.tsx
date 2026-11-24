import { cn } from "@houston-ai/core";
import type { SidebarItem } from "./sidebar";
import { SidebarCollapsedItem } from "./sidebar-collapsed-item";
import { sidebarClasses } from "./sidebar-geometry";
import { SidebarItemRow } from "./sidebar-item-row";
import { sidebarListEnd, sidebarRowNeighbour } from "./sidebar-paint";
import type { SidebarBaseRowContext } from "./sidebar-row-context";

export interface SidebarFlatListProps {
  items: SidebarItem[];
  /** Icon-only rail (ignores groups) vs. the expanded flat list. */
  collapsed: boolean;
  ctx: SidebarBaseRowContext;
}

/**
 * The ungrouped item list: the collapsed icon rail, or the expanded flat list.
 * It renders whenever `groups` is absent, and always on the collapsed rail
 * (grouping is an expanded-rail idea). Both branches reuse the shared row
 * components and hold rows and nothing else: creating lives in the host's
 * header actions.
 */
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
