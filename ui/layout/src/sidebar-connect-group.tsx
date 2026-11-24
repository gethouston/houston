import { cn } from "@houston-ai/core";
import { Blocks } from "lucide-react";
import { SidebarCollapsedControl } from "./sidebar-collapsed-control";
import {
  type SidebarConnectLogo,
  SidebarConnectLogos,
} from "./sidebar-connect-logos";
import {
  sidebarIconBox,
  sidebarRailInset,
  sidebarRowType,
} from "./sidebar-geometry";
import { type SidebarSurface, sidebarSheetRowClasses } from "./sidebar-surface";

export interface SidebarConnectRow {
  /** Stable key: the destination's id. */
  id: string;
  /** What connecting brings, e.g. "Connect your apps". The row's name. */
  label: string;
  /** What it connects; the first three are overlapped into the row's mark,
   *  the first on top. */
  logos: SidebarConnectLogo[];
  onClick: () => void;
  /** Its destination is the open view: the rail's selected fill and
   *  `aria-current="page"`. */
  selected?: boolean;
  /** DOM attributes (test ids, tour anchors) on the row's button. */
  dataAttrs?: Record<string, string>;
}

export interface SidebarConnectGroupProps {
  rows: SidebarConnectRow[];
  /** Icon rail: each row is a control showing its logo cluster alone, named
   *  by a tooltip. */
  collapsed?: boolean;
  /** Default `rail`. `sheet` draws the rows as a phone card's own rows. */
  surface?: SidebarSurface;
}

function ConnectRowButton({
  row,
  surface,
}: {
  row: SidebarConnectRow;
  surface: SidebarSurface;
}) {
  const selected = row.selected ?? false;
  const sheet = surface === "sheet";
  return (
    <button
      type="button"
      {...(row.dataAttrs ?? {})}
      aria-current={selected ? "page" : undefined}
      onClick={row.onClick}
      className={cn(
        sheet
          ? sidebarSheetRowClasses
          : "flex h-9 w-full min-w-0 items-center gap-2 rounded-lg px-3 text-left text-ink transition-colors duration-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-inset",
        selected ? "bg-sidebar-active" : !sheet && "hover:bg-sidebar-hover",
      )}
    >
      <SidebarConnectLogos logos={row.logos} />
      <span
        className={cn("min-w-0 flex-1 truncate", !sheet && sidebarRowType.item)}
      >
        {row.label}
      </span>
    </button>
  );
}

/**
 * The rail's invitation to plug Houston into the rest of a person's work, as
 * plain nav rows on the rail, painted only under the pointer or while their
 * destination is open. Each row is the overlapped logos of what it
 * connects, then a label, so it says what the page behind it is about before
 * anyone opens it. Always drawn, never hover-gated.
 *
 * On the rail it carries the rail inset itself, so it belongs in the rail's
 * `footer`, never inside the list. On a sheet it
 * spans the card with no inset of its own. The host sets the vertical rhythm
 * around it.
 */
export function SidebarConnectGroup({
  rows,
  collapsed = false,
  surface = "rail",
}: SidebarConnectGroupProps) {
  if (rows.length === 0) return null;
  if (collapsed) {
    return (
      <div data-sidebar-connect-group="" className="flex flex-col gap-1">
        {rows.map((row) => {
          const selected = row.selected ?? false;
          return (
            <SidebarCollapsedControl
              key={row.id}
              label={row.label}
              onClick={row.onClick}
              selected={selected}
              dataAttrs={row.dataAttrs}
              className={cn(
                "rounded-lg",
                selected ? "bg-sidebar-active" : "hover:bg-sidebar-hover",
              )}
            >
              {row.logos.length > 0 ? (
                <SidebarConnectLogos logos={row.logos} size="rail" />
              ) : (
                <span
                  aria-hidden="true"
                  className={cn(sidebarIconBox, "text-ink-muted")}
                >
                  <Blocks />
                </span>
              )}
            </SidebarCollapsedControl>
          );
        })}
      </div>
    );
  }
  return (
    <div
      data-sidebar-connect-group=""
      className={cn(
        "flex flex-col",
        surface === "rail" && [sidebarRailInset, "gap-px"],
      )}
    >
      {rows.map((row) => (
        <ConnectRowButton key={row.id} row={row} surface={surface} />
      ))}
    </div>
  );
}
