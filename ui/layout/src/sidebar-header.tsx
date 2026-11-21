import { cn } from "@houston-ai/core";
import type { ReactNode } from "react";
import {
  sidebarWindowControlsHeight,
  sidebarWindowControlsWidth,
} from "./sidebar-frame";
import { SidebarCollapseToggle } from "./sidebar-rail-chrome";

export function SidebarHeader({
  actions,
  collapsed,
  windowControlsInset,
  collapseLabel,
  expandLabel,
  onToggleCollapsed,
}: {
  actions?: ReactNode;
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
  const stackedActions = actions ? (
    <div className="flex flex-col items-center gap-1 pb-1">{actions}</div>
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
              <div data-tauri-drag-region className="h-full min-w-0 flex-1" />
              {actions && (
                <div className="flex shrink-0 items-center gap-0.5 pr-2">
                  {actions}
                </div>
              )}
            </>
          )}
        </div>
        {collapsed && (
          <>
            <div
              data-tauri-drag-region
              className="flex justify-center pt-3 pb-1"
            >
              {toggle}
            </div>
            {stackedActions}
          </>
        )}
      </>
    );
  }

  return collapsed ? (
    <>
      <div className="flex justify-center pt-3 pb-1">{toggle}</div>
      {stackedActions}
    </>
  ) : (
    <div className="flex shrink-0 items-center gap-0.5 px-2 pt-3 pb-1">
      {toggle}
      <div className="min-w-0 flex-1" />
      {actions}
    </div>
  );
}
