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
  id: string;
  label: string;
  logos: SidebarConnectLogo[];
  onClick: () => void;
  selected?: boolean;
  dataAttrs?: Record<string, string>;
}

export interface SidebarConnectGroupProps {
  rows: SidebarConnectRow[];
  collapsed?: boolean;
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
