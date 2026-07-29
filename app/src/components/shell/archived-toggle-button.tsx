import {
  Button,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@houston-ai/core";
import { Archive } from "lucide-react";

interface ArchivedToggleButtonProps {
  archived: boolean;
  collapsed: boolean;
  label: string;
  onToggle: () => void;
}

/** Activity-header control for switching between live and archived missions. */
export function ArchivedToggleButton({
  archived,
  collapsed,
  label,
  onToggle,
}: ArchivedToggleButtonProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          data-tour-target="archivedMissions"
          variant={archived ? "secondary" : "ghost"}
          size={collapsed ? "icon" : "default"}
          className="rounded-full"
          onClick={onToggle}
          aria-label={label}
        >
          <Archive className="size-4" />
          {!collapsed && label}
        </Button>
      </TooltipTrigger>
      {collapsed && <TooltipContent side="bottom">{label}</TooltipContent>}
    </Tooltip>
  );
}
