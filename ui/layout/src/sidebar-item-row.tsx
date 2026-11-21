import type {
  DraggableAttributes,
  DraggableSyntheticListeners,
} from "@dnd-kit/core";
import type { KeyboardEvent } from "react";
import type { SidebarItem } from "./sidebar";
import { SidebarRowButton } from "./sidebar-row-button";

export interface SidebarItemRowProps {
  item: SidebarItem;
  isActive: boolean;
  onSelect: (id: string) => void;
  dragAttributes?: DraggableAttributes;
  dragListeners?: DraggableSyntheticListeners;
  onKeyDown?: (event: KeyboardEvent<HTMLButtonElement>) => void;
  grouped?: boolean;
  draggable?: boolean;
}

export function SidebarItemRow({
  item,
  isActive,
  onSelect,
  dragAttributes,
  dragListeners,
  onKeyDown,
  grouped = false,
  draggable = true,
}: SidebarItemRowProps) {
  return (
    <SidebarRowButton
      anatomy="person"
      label={item.name}
      subtitle={item.subtitle}
      title={item.name}
      icon={item.icon}
      depth={grouped ? "child" : "block"}
      active={isActive}
      draggable={draggable}
      dragAttributes={dragAttributes}
      dragListeners={dragListeners}
      onKeyDown={onKeyDown}
      onActivate={() => onSelect(item.id)}
      trailing={item.trailing}
      affordance={item.affordance}
      dataAttrs={item.dataAttrs}
    />
  );
}
