import {
  cn,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@houston-ai/core";
import { ChevronDown, Plus } from "lucide-react";
import { sidebarRowType } from "./sidebar-geometry";
import {
  sidebarRowButtonClasses as row,
  sidebarRowState,
} from "./sidebar-paint";

export interface WorkspaceSwitcherProps {
  workspaces: { id: string; name: string }[];
  currentId: string | null;
  currentName: string;
  onSwitch: (workspaceId: string) => void;
  onCreate: () => void;
  /** Icon-only rail: render the workspace avatar alone instead of the name row. */
  collapsed?: boolean;
  /** Tight top spacing when the host reserves a controls row above the header. */
  compactTop?: boolean;
  /** Label for the "create workspace" action (defaults to English). */
  createLabel?: string;
}

function workspaceMonogram(name: string): string {
  const trimmed = name.trim();
  return trimmed ? trimmed.charAt(0).toUpperCase() : "?";
}

/**
 * The workspace's mark, the same object in both rail states: collapsing hides
 * the name beside it, never the mark itself. It is the rail's 20px glyph size,
 * so it sits in the column the nav icons below it use.
 */
function WorkspaceAvatar({ name }: { name: string }) {
  return (
    <span
      aria-hidden="true"
      className="flex size-5 shrink-0 items-center justify-center rounded-md border border-ink-muted text-[11px] font-semibold leading-none text-ink"
    >
      {workspaceMonogram(name)}
    </span>
  );
}

export function WorkspaceSwitcher({
  workspaces,
  currentId,
  currentName,
  onSwitch,
  onCreate,
  collapsed = false,
  compactTop = false,
  createLabel = "Create workspace",
}: WorkspaceSwitcherProps) {
  const menu = (
    <DropdownMenuContent align="start" className="w-48">
      {workspaces.map((ws) => (
        <DropdownMenuItem
          key={ws.id}
          onClick={() => onSwitch(ws.id)}
          className={ws.id === currentId ? "font-medium" : ""}
        >
          {ws.name}
        </DropdownMenuItem>
      ))}
      <DropdownMenuSeparator />
      <DropdownMenuItem onClick={onCreate}>
        <Plus className="h-4 w-4 mr-2" />
        {createLabel}
      </DropdownMenuItem>
    </DropdownMenuContent>
  );

  if (collapsed) {
    return (
      <div
        className={cn(
          "flex justify-center px-2 pt-3 pb-1",
          compactTop && "pt-0",
        )}
        data-tauri-drag-region
      >
        {/* The collapsed nav items' own 36px box, rest and hover, so the
            avatar reads as a control of the same family as the icons below. */}
        <DropdownMenu>
          <Tooltip>
            <TooltipTrigger asChild>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  aria-label={currentName}
                  className="flex size-9 items-center justify-center rounded-lg transition-colors hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
                >
                  <WorkspaceAvatar name={currentName} />
                </button>
              </DropdownMenuTrigger>
            </TooltipTrigger>
            <TooltipContent side="right" sideOffset={8}>
              {currentName}
            </TooltipContent>
          </Tooltip>
          {menu}
        </DropdownMenu>
      </div>
    );
  }

  return (
    <div
      className={cn("flex items-center px-2 pt-3 pb-0.5", compactTop && "pt-0")}
      data-tauri-drag-region
    >
      {/* Built from the rail row's own anatomy (height, glyph column, type,
          hover pill), so the workspace reads as the first row of the rail;
          only the chevron says it opens a menu. Not `SidebarRowButton` itself:
          a menu trigger needs the button element, which that row keeps. */}
      <div className={cn(row.root, sidebarRowState.hover)}>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className={cn(
                row.button,
                row.depthBlock,
                sidebarRowType.item,
                sidebarRowState.restText,
              )}
            >
              <span className={row.icon}>
                <WorkspaceAvatar name={currentName} />
              </span>
              <span className={row.labelGroup}>
                <span className={row.label}>{currentName}</span>
                <ChevronDown className="size-3.5 shrink-0 text-ink-muted" />
              </span>
            </button>
          </DropdownMenuTrigger>
          {menu}
        </DropdownMenu>
      </div>
    </div>
  );
}
