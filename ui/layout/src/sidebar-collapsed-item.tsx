import {
  cn,
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@houston-ai/core";
import type { SidebarItem } from "./sidebar";
import { SidebarItemRow } from "./sidebar-item-row";
import { sidebarCollapsedItemClasses } from "./sidebar-paint";

export interface SidebarCollapsedItemProps {
  item: SidebarItem;
  isActive: boolean;
  onSelect: (id: string) => void;
}

/**
 * Collapsed-rail agent entry: an icon-only trigger (the agent avatar) that
 * reveals a flyout to the right on hover OR keyboard focus. The flyout reuses
 * the full {@link SidebarItemRow}, so the name and the row's one behaviour
 * (select) are exactly what expanded mode shows — no duplicated logic. There is
 * nothing else to show: an agent is edited on its focused agent screen.
 */
export function SidebarCollapsedItem({
  item,
  isActive,
  onSelect,
}: SidebarCollapsedItemProps) {
  return (
    <HoverCard openDelay={120} closeDelay={120}>
      <HoverCardTrigger asChild>
        <button
          type="button"
          aria-label={item.name}
          onClick={() => onSelect(item.id)}
          className={cn(
            "relative flex size-9 shrink-0 items-center justify-center rounded-lg transition-colors duration-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus",
            isActive ? "bg-sidebar-active" : "hover:bg-hover/50",
          )}
        >
          {item.icon}
          {item.trailing && (
            <span className={sidebarCollapsedItemClasses.trailing}>
              {item.trailing}
            </span>
          )}
        </button>
      </HoverCardTrigger>
      <HoverCardContent
        side="right"
        align="start"
        sideOffset={8}
        className="w-56 p-1"
      >
        <SidebarItemRow item={item} isActive={isActive} onSelect={onSelect} />
      </HoverCardContent>
    </HoverCard>
  );
}
