import { Tooltip, TooltipContent, TooltipTrigger } from "@houston-ai/core";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { sidebarHeaderControlClasses } from "./sidebar-paint";

/** The rail's visible collapse or expand control in both sidebar states. */
export function SidebarCollapseToggle({
  label,
  onToggle,
  collapsed = false,
}: {
  label: string;
  onToggle: () => void;
  collapsed?: boolean;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={label}
          onClick={onToggle}
          className={sidebarHeaderControlClasses}
        >
          {collapsed ? (
            <PanelLeftOpen className="size-4" />
          ) : (
            <PanelLeftClose className="size-4" />
          )}
        </button>
      </TooltipTrigger>
      <TooltipContent side="right" sideOffset={8}>
        {label}
      </TooltipContent>
    </Tooltip>
  );
}
