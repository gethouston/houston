import { Tooltip, TooltipContent, TooltipTrigger } from "@houston-ai/core";
import { Plus } from "lucide-react";
import type { SidebarItem } from "./sidebar";
import { SidebarCollapsedItem } from "./sidebar-collapsed-item";
import { sidebarClasses } from "./sidebar-geometry";
import { SidebarItemRow } from "./sidebar-item-row";
import type { SidebarBaseRowContext } from "./sidebar-row-context";

export interface SidebarFlatListProps {
  items: SidebarItem[];
  /** Icon-only rail (ignores groups) vs. the expanded flat list. */
  collapsed: boolean;
  ctx: SidebarBaseRowContext;
  onAdd?: () => void;
  addItemDataAttrs?: Record<string, string>;
}

/**
 * The ungrouped item list: the collapsed icon rail or the expanded flat list.
 * This is the current (pre-grouping) rendering, unchanged — used whenever
 * `groups` is absent, and always in the collapsed rail. Both branches reuse
 * the shared row components and end with the "add item" affordance.
 */
export function SidebarFlatList({
  items,
  collapsed,
  ctx,
  onAdd,
  addItemDataAttrs,
}: SidebarFlatListProps) {
  const { labels: l } = ctx;

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
        {onAdd && (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                aria-label={l.addItem}
                onClick={onAdd}
                className="flex size-9 shrink-0 items-center justify-center rounded-lg text-ink-muted transition-colors hover:bg-hover/50 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
                {...(addItemDataAttrs ?? {})}
              >
                <Plus className="size-4" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="right" sideOffset={8}>
              {l.addItem}
            </TooltipContent>
          </Tooltip>
        )}
      </div>
    );
  }

  return (
    <div className={sidebarClasses.itemsList}>
      {items.map((item) => (
        <SidebarItemRow
          key={item.id}
          item={item}
          isActive={item.id === ctx.selectedId}
          onSelect={ctx.onSelect}
        />
      ))}
    </div>
  );
}
