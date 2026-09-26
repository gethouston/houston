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
}

/**
 * One AI Employee in the rail: a person row (its portrait, the name above its
 * role), whatever quiet signal it is carrying in the trailing slot, and the
 * host's optional "..." affordance beside the button.
 *
 * It is a {@link SidebarRowButton} like every other line in the rail, in the
 * `person` anatomy, so its paint, indent, states and affordance are the rail's
 * own and only its height, avatar and text block differ.
 *
 * The affordance is DATA, not behaviour: the host builds the trigger and the
 * menu it opens (`item.affordance`), and this row only places it in the shared
 * affordance slot. The library itself still knows nothing about renaming,
 * copying or deleting an agent.
 *
 * The one thing it still adds over a plain row: it is a drag handle, wearing
 * the sortable listeners and cursor on the row button.
 */
export function SidebarItemRow({
  item,
  isActive,
  onSelect,
  dragAttributes,
  dragListeners,
  onKeyDown,
  grouped = false,
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
      draggable
      dragAttributes={dragAttributes}
      dragListeners={dragListeners}
      onKeyDown={onKeyDown}
      onActivate={() => onSelect(item.id)}
      trailing={item.trailing}
      affordance={item.affordance}
    />
  );
}
