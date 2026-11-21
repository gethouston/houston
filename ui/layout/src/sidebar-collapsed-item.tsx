import {
  cn,
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@houston-ai/core";
import type { SidebarItem } from "./sidebar";
import { SidebarAvatarDiameter } from "./sidebar-avatar-diameter";
import { sidebarCollapsedItem } from "./sidebar-geometry";
import { SidebarItemRow } from "./sidebar-item-row";
import { sidebarCollapsedItemClasses } from "./sidebar-paint";

export interface SidebarCollapsedItemProps {
  item: SidebarItem;
  isActive: boolean;
  onSelect: (id: string) => void;
}

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
          {...(item.dataAttrs ?? {})}
          aria-label={item.name}
          onClick={() => onSelect(item.id)}
          className={cn(
            "relative flex shrink-0 items-center justify-center rounded-lg transition-colors duration-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus",
            sidebarCollapsedItem.square,
            isActive ? "bg-sidebar-active" : "hover:bg-hover/50",
          )}
        >
          <SidebarAvatarDiameter value={sidebarCollapsedItem.avatarDiameter}>
            {item.icon}
          </SidebarAvatarDiameter>
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
        <SidebarItemRow
          item={{ ...item, affordance: undefined, dataAttrs: undefined }}
          isActive={isActive}
          onSelect={onSelect}
          draggable={false}
        />
      </HoverCardContent>
    </HoverCard>
  );
}
