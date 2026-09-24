import {
  cn,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@houston-ai/core";
import { ChevronDown, Plus } from "lucide-react";

export interface WorkspaceSwitcherProps {
  workspaces: { id: string; name: string }[];
  currentId: string | null;
  currentName: string;
  onSwitch: (workspaceId: string) => void;
  onCreate: () => void;
  /** Icon-only rail: render a compact monogram button instead of the name row. */
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
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label={currentName}
              title={currentName}
              className="flex size-9 items-center justify-center rounded-lg bg-hover text-sm font-semibold text-ink transition-colors hover:bg-hover/80"
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
      className={cn(
        "flex items-center gap-1 px-2 pt-3 pb-1",
        compactTop && "pt-0",
      )}
      data-tauri-drag-region
    >
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="flex items-center gap-1 text-sm font-medium text-ink hover:bg-hover rounded-lg py-1.5 px-2.5 transition-colors flex-1 min-w-0"
          >
            <span className="truncate">{currentName}</span>
            <ChevronDown className="h-3.5 w-3.5 text-ink-muted flex-shrink-0" />
          </button>
        </DropdownMenuTrigger>
        {menu}
      </DropdownMenu>
    </div>
  );
}
