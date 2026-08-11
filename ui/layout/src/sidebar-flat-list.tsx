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
  /** Names the "add item" button, on the collapsed rail its only name. */
  addItemLabel?: string;
  addItemDataAttrs?: Record<string, string>;
}

/**
 * The ungrouped item list: the collapsed icon rail, or the expanded flat list.
 * It renders whenever `groups` is absent, and always on the collapsed rail
 * (grouping is an expanded-rail idea). Both branches reuse the shared row
 * components; the icon rail closes with the "add item" button, and the expanded
 * flat list is rows and nothing else.
 */
export function SidebarFlatList({
  items,
  collapsed,
  ctx,
  onAdd,
  addItemLabel,
  addItemDataAttrs,
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
        {onAdd && (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                aria-label={addItemLabel}
                onClick={onAdd}
                className="flex size-9 shrink-0 items-center justify-center rounded-lg text-ink-muted transition-colors hover:bg-hover/50 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
                {...(addItemDataAttrs ?? {})}
              >
                <Plus className="size-4" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="right" sideOffset={8}>
              {addItemLabel}
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
