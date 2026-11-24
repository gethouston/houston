import { cn } from "@houston-ai/core";
import { Plus } from "lucide-react";
import { SidebarCollapsedControl } from "./sidebar-collapsed-control";
import { sidebarAddRow, sidebarRowType, sidebarSeat } from "./sidebar-geometry";
import { sidebarRowButtonClasses as c, sidebarRowState } from "./sidebar-paint";

export interface SidebarAddRowProps {
  /** What the row does, e.g. "Add new AI Employee". */
  label: string;
  onClick: () => void;
  /** Icon rail: the seat alone, named by a tooltip. */
  collapsed?: boolean;
  /** DOM attributes (test ids, tour anchors): the expanded row's root, the
   *  icon rail's button. */
  dataAttrs?: Record<string, string>;
}

function Seat({
  collapsed,
  className,
}: {
  collapsed: boolean;
  className: string;
}) {
  const seat = collapsed ? sidebarSeat.collapsed : sidebarSeat.expanded;
  return (
    <span
      aria-hidden="true"
      data-sidebar-seat=""
      className={cn(
        "flex shrink-0 items-center justify-center text-ink-muted transition-colors duration-100",
        className,
      )}
      style={{ width: seat.diameter, height: seat.diameter }}
    >
      <Plus size={seat.glyph} />
    </span>
  );
}

/**
 * The shortcut closing the list: the next seat on the team, not yet filled.
 * It keeps the person row's columns (the Plus centred on the portraits above
 * it, the label on the names' left edge) and its full-width pill, at the
 * shorter {@link sidebarAddRow} height, with no hairline: it is a way to add
 * someone, not one more member. Its label is muted like the Plus and
 * strengthens with it. The icon rail shows the seat alone at the avatars'
 * size, in the avatars' column.
 */
export function SidebarAddRow({
  label,
  onClick,
  collapsed = false,
  dataAttrs,
}: SidebarAddRowProps) {
  if (collapsed) {
    return (
      <SidebarCollapsedControl
        label={label}
        onClick={onClick}
        dataAttrs={dataAttrs}
        className="rounded-lg hover:bg-sidebar-hover"
      >
        <Seat
          collapsed
          className="group-hover/control:text-ink group-focus-visible/control:text-ink"
        />
      </SidebarCollapsedControl>
    );
  }
  return (
    <div
      className={cn(
        c.root,
        c.personFill,
        sidebarAddRow.height,
        sidebarRowState.hover,
      )}
      {...(dataAttrs ?? {})}
    >
      <button
        type="button"
        onClick={onClick}
        className={cn(
          c.button,
          sidebarAddRow.height,
          c.personPadBlock,
          sidebarRowType.item,
          "text-ink-muted transition-colors duration-100 hover:text-ink focus-visible:text-ink",
        )}
      >
        <span className={c.personIcon}>
          <Seat collapsed={false} className="text-current" />
        </span>
        <span className={c.label}>{label}</span>
      </button>
    </div>
  );
}
