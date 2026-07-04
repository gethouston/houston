import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@houston-ai/core";
import { ChevronDown, PanelLeftOpen, Plus } from "lucide-react";

export interface WorkspaceSwitcherProps {
  workspaces: { id: string; name: string }[];
  currentId: string | null;
  currentName: string;
  onSwitch: (workspaceId: string) => void;
  onCreate: () => void;
  /** Icon-only rail: render a compact monogram button instead of the name row. */
  collapsed?: boolean;
  /** Label for the "create workspace" action (defaults to English). */
  createLabel?: string;
  /**
   * Collapsed rail only: the monogram becomes the expand-sidebar button —
   * it shows the workspace initial at rest and swaps to the expand icon on
   * hover/focus. Clicking expands instead of opening the switcher menu
   * (the menu is reachable once expanded).
   */
  onExpand?: () => void;
  /** Label for the expand-sidebar action (defaults to English). */
  expandLabel?: string;
}

function workspaceMonogram(name: string): string {
  const trimmed = name.trim();
  return trimmed ? trimmed.charAt(0).toUpperCase() : "?";
}

export function WorkspaceSwitcher({
  workspaces,
  currentId,
  currentName,
  onSwitch,
  onCreate,
  collapsed = false,
  createLabel = "Create workspace",
  onExpand,
  expandLabel = "Expand sidebar",
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

  if (collapsed && onExpand) {
    return (
      <div
        className="flex justify-center px-2 pt-3 pb-1"
        data-tauri-drag-region
      >
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              aria-label={expandLabel}
              onClick={onExpand}
              className="group flex size-9 items-center justify-center rounded-lg bg-accent text-sm font-semibold text-foreground transition-colors hover:bg-accent/80 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              <span className="group-hover:hidden group-focus-visible:hidden">
                {workspaceMonogram(currentName)}
              </span>
              <PanelLeftOpen className="hidden size-4 group-hover:block group-focus-visible:block" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="right" sideOffset={8}>
            {expandLabel}
          </TooltipContent>
        </Tooltip>
      </div>
    );
  }

  if (collapsed) {
    return (
      <div
        className="flex justify-center px-2 pt-3 pb-1"
        data-tauri-drag-region
      >
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label={currentName}
              title={currentName}
              className="flex size-9 items-center justify-center rounded-lg bg-accent text-sm font-semibold text-foreground transition-colors hover:bg-accent/80"
            >
              {workspaceMonogram(currentName)}
            </button>
          </DropdownMenuTrigger>
          {menu}
        </DropdownMenu>
      </div>
    );
  }

  return (
    <div
      className="flex items-center gap-1 px-2 pt-3 pb-1"
      data-tauri-drag-region
    >
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="flex items-center gap-1 text-sm font-medium text-foreground hover:bg-accent rounded-lg py-1.5 px-2.5 transition-colors flex-1 min-w-0"
          >
            <span className="truncate">{currentName}</span>
            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
          </button>
        </DropdownMenuTrigger>
        {menu}
      </DropdownMenu>
    </div>
  );
}
