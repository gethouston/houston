import { cn } from "@houston-ai/core";
import type { ReactNode } from "react";
import {
  sidebarWindowControlsHeight,
  sidebarWindowControlsWidth,
} from "./sidebar-geometry";
import { SidebarCollapseToggle } from "./sidebar-rail-chrome";

/**
 * With windowControlsInset, the host draws its own macOS traffic lights over
 * the rail's top-left. The first row is a drag region that reserves their zone:
 * expanded it carries the collapse toggle after the lights, and collapsed it
 * stays empty with the expand toggle on the next row. Without the inset, the
 * expanded switcher row ends with the toggle and the collapsed toggle leads.
 */
export function SidebarHeader({
  children,
  collapsed,
  windowControlsInset,
  collapseLabel,
  expandLabel,
  onToggleCollapsed,
}: {
  children: ReactNode;
  collapsed: boolean;
  windowControlsInset: boolean;
  collapseLabel: string;
  expandLabel: string;
  onToggleCollapsed?: () => void;
}) {
  const toggle = onToggleCollapsed ? (
    <SidebarCollapseToggle
      label={collapsed ? expandLabel : collapseLabel}
      onToggle={onToggleCollapsed}
      collapsed={collapsed}
    />
  ) : null;

  if (windowControlsInset) {
    return (
      <>
        <div
          data-tauri-drag-region
          data-window-controls-row
          className={cn(
            "flex shrink-0 items-center",
            sidebarWindowControlsHeight,
          )}
        >
          {!collapsed && (
            <>
              <div
                data-tauri-drag-region
                className={cn("h-full shrink-0", sidebarWindowControlsWidth)}
              />
              {toggle}
            </>
          )}
        </div>
        {collapsed && (
          <div className="flex justify-center pt-3 pb-1">{toggle}</div>
        )}
        {children}
      </>
    );
  }

  return collapsed ? (
    <>
      <div className="flex justify-center pt-3 pb-1">{toggle}</div>
      {children}
    </>
  ) : (
    <div className="flex items-center">
      <div className="min-w-0 flex-1">{children}</div>
      {toggle && <div className="shrink-0 pr-2">{toggle}</div>}
    </div>
  );
}
