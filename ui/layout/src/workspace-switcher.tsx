import {
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
