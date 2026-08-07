import { cn } from "@houston-ai/core";
import { sidebarSectionRowClasses } from "./sidebar-classes";
import type { SidebarSectionRow } from "./sidebar-groups";

export interface SidebarSectionRowsProps {
  rows: SidebarSectionRow[];
}

/**
 * A group's destination rows, rendered above its item rows: a glyph, a label,
 * and the same selected fill an item row wears, so "where am I" reads the same
 * whichever kind of row is open.
 *
 * Deliberately outside the drag layer — these rows register no sortable and no
 * droppable, so they can never be picked up and never become a drop target.
 * A drag passing over one falls through to the group's own container, which is
 * exactly right: the pointer is over that group.
 */
export function SidebarSectionRows({ rows }: SidebarSectionRowsProps) {
  if (rows.length === 0) return null;
  return (
    <>
      {rows.map((row) => (
        <button
          key={row.id}
          type="button"
          data-sidebar-section-row={row.id}
          aria-current={row.active ? "page" : undefined}
          onClick={row.onSelect}
          className={cn(
            sidebarSectionRowClasses.root,
            row.active
              ? "bg-sidebar-active font-medium text-ink"
              : "text-hover-text hover:bg-hover/50",
          )}
        >
          {row.icon && (
            <span className={sidebarSectionRowClasses.icon}>{row.icon}</span>
          )}
          <span className={sidebarSectionRowClasses.label}>{row.label}</span>
        </button>
      ))}
    </>
  );
}
