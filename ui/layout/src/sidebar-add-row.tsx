import { cn } from "@houston-ai/core";
import { Plus } from "lucide-react";
import { SidebarCollapsedControl } from "./sidebar-collapsed-control";
import { sidebarAddRow, sidebarRowType, sidebarSeat } from "./sidebar-geometry";
import { sidebarRowButtonClasses as c, sidebarRowState } from "./sidebar-paint";

export interface SidebarAddRowProps {
  label: string;
  onClick: () => void;
  collapsed?: boolean;
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
