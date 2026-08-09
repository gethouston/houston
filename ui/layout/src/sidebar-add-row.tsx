import { Plus } from "lucide-react";
import { SidebarRowButton } from "./sidebar-row-button";

export interface SidebarAddRowProps {
  label: string;
  onClick: () => void;
  /** Extra DOM attributes (e.g. a tour anchor). */
  dataAttrs?: Record<string, string>;
}

/**
 * The row that closes the grouped list: "New agent".
 *
 * It is a ROW, not only an icon on the section band, because creating an agent
 * is the rail's primary action and a primary action may not live one level deep
 * inside a menu. The band's "+" still offers it; this is the door that is
 * visible without opening anything, and the one the guided tour points at.
 *
 * Muted at rest so it reads as the end of the list rather than as another
 * destination competing with the agents above it.
 */
export function SidebarAddRow({
  label,
  onClick,
  dataAttrs,
}: SidebarAddRowProps) {
  return (
    <SidebarRowButton
      label={label}
      muted
      icon={<Plus className="size-4" />}
      onActivate={onClick}
      dataAttrs={{ "data-sidebar-add-row": "", ...(dataAttrs ?? {}) }}
    />
  );
}
