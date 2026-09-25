import type { SidebarItem } from "./sidebar";
import { SidebarRowButton } from "./sidebar-row-button";

export interface SidebarItemRowProps {
  item: SidebarItem;
  isActive: boolean;
  onSelect: (id: string) => void;
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
 * The one thing it still adds over a plain row: it is a drag handle. The
 * listeners live on the sortable wrapper, so the row only has to wear the
 * cursor.
 */
export function SidebarItemRow({
  item,
  isActive,
  onSelect,
}: SidebarItemRowProps) {
  return (
    <SidebarRowButton
      anatomy="person"
      label={item.name}
      subtitle={item.subtitle}
      title={item.name}
      icon={item.icon}
      active={isActive}
      draggable
      onActivate={() => onSelect(item.id)}
      trailing={item.trailing}
      affordance={item.affordance}
    />
  );
}
