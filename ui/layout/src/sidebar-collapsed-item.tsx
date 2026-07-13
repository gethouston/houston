import {
  cn,
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@houston-ai/core";
import type { KeyboardEvent } from "react";
import type { SidebarItem } from "./sidebar";
import { sidebarItemRowClasses } from "./sidebar-classes";
import type { SidebarItemRowLabels } from "./sidebar-item-row";
import { SidebarItemRow } from "./sidebar-item-row";

export interface SidebarCollapsedItemProps {
  item: SidebarItem;
  isActive: boolean;
  isEditing: boolean;
  editValue: string;
  hasMenu: boolean;
  onSelect: (id: string) => void;
  onKeyDown: (e: KeyboardEvent, id: string) => void;
  onEditChange: (value: string) => void;
  onCommitRename: (id: string) => void;
  onCancelEdit: () => void;
  onStartRename?: (id: string, name: string) => void;
  onDelete?: (id: string) => void;
  labels?: SidebarItemRowLabels;
}

/**
 * Collapsed-rail agent entry: an icon-only trigger (the agent avatar) that
 * reveals a flyout to the right on hover OR keyboard focus. The flyout reuses
 * the full {@link SidebarItemRow} so the name and every action (rename, delete,
 * color, share) are exactly what expanded mode shows — no duplicated logic.
 */
export function SidebarCollapsedItem({
  item,
  isActive,
  isEditing,
  editValue,
  hasMenu,
  onSelect,
  onKeyDown,
  onEditChange,
  onCommitRename,
  onCancelEdit,
  onStartRename,
  onDelete,
  labels,
}: SidebarCollapsedItemProps) {
  return (
    <HoverCard openDelay={120} closeDelay={120}>
      <HoverCardTrigger asChild>
        <button
          type="button"
          aria-label={item.name}
          onClick={() => onSelect(item.id)}
          onKeyDown={(e) => onKeyDown(e, item.id)}
          className={cn(
            "relative flex size-9 shrink-0 items-center justify-center rounded-lg transition-colors duration-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-focus",
            isActive ? "bg-sidebar-active" : "hover:bg-hover/50",
          )}
        >
          {item.icon}
          {item.trailing && (
            <span className={sidebarItemRowClasses.collapsedTrailing}>
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
          item={item}
          isActive={isActive}
          isEditing={isEditing}
          editValue={editValue}
          hasMenu={hasMenu}
          onSelect={onSelect}
          onKeyDown={onKeyDown}
          onEditChange={onEditChange}
          onCommitRename={onCommitRename}
          onCancelEdit={onCancelEdit}
          onStartRename={onStartRename}
          onDelete={onDelete}
          labels={labels}
        />
      </HoverCardContent>
    </HoverCard>
  );
}
