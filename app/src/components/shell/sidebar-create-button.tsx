import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  HoustonHelmet,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@houston-ai/core";
import { sidebarHeaderControlClasses } from "@houston-ai/layout";
import { FolderPlus, Plus } from "lucide-react";
import type { ReactNode } from "react";

export interface SidebarCreateLabels {
  title: string;
  newAgent: string;
  newTeam: string;
}

export function SidebarCreateButton({
  labels,
  onNewAgent,
  onNewTeam,
  collapsed,
  dataAttrs,
}: {
  labels: SidebarCreateLabels;
  onNewAgent?: () => void;
  onNewTeam?: () => void;
  collapsed: boolean;
  dataAttrs?: Record<string, string>;
}): ReactNode {
  const canAddAgent = onNewAgent !== undefined;
  const canAddTeam = onNewTeam !== undefined;
  if (!canAddAgent && !canAddTeam) return null;
  const label =
    canAddAgent && canAddTeam
      ? labels.title
      : canAddAgent
        ? labels.newAgent
        : labels.newTeam;

  const side = collapsed ? "right" : "bottom";
  const glyph = <Plus className="size-4" aria-hidden="true" />;

  if (!onNewAgent || !onNewTeam) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            aria-label={label}
            onClick={onNewAgent ?? onNewTeam}
            className={sidebarHeaderControlClasses}
            {...dataAttrs}
          >
            {glyph}
          </button>
        </TooltipTrigger>
        <TooltipContent side={side}>{label}</TooltipContent>
      </Tooltip>
    );
  }
  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label={label}
              className={sidebarHeaderControlClasses}
              {...dataAttrs}
            >
              {glyph}
            </button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent side={side}>{label}</TooltipContent>
      </Tooltip>
      <DropdownMenuContent
        side={side}
        align={collapsed ? "start" : "end"}
        collisionPadding={8}
      >
        <DropdownMenuItem onSelect={onNewAgent}>
          <HoustonHelmet size={16} color="currentColor" />
          {labels.newAgent}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={onNewTeam}>
          <FolderPlus className="size-4" aria-hidden="true" />
          {labels.newTeam}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
