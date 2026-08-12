import type { SidebarItem } from "./sidebar";
import { SidebarRowButton } from "./sidebar-row-button";

export interface SidebarItemRowProps {
  item: SidebarItem;
  isActive: boolean;
  onSelect: (id: string) => void;
}

/**
 * One agent in the rail: its avatar in the shared glyph column, its name, and
 * whatever quiet signal it is carrying in the trailing slot.
 *
 * It is a {@link SidebarRowButton} like every other line in the rail — the
 * avatar is simply what goes in the glyph box. That is the whole point of the
 * primitive: an agent row and the block header above it are the same object, so
 * a block reads as one ladder instead of a header with a foreign list under it.
 *
 * **It carries no "..." menu, and cannot be renamed or deleted from here.** An
 * agent is edited where it is configured — its focused agent screen — and
 * nowhere else, so the rail keeps ONE door onto settings instead of a second
 * one on the surface with the least room to explain what it is about to do.
 * The row reserves no column beside the button either: the full width of the
 * rail belongs to the agent's name.
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
      label={item.name}
      title={item.name}
      icon={item.icon}
      active={isActive}
      draggable
      onActivate={() => onSelect(item.id)}
      trailing={item.trailing}
    />
  );
}
