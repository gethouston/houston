import { cn, Tooltip, TooltipContent, TooltipTrigger } from "@houston-ai/core";
import type { ReactNode } from "react";
import { sidebarCollapsedItem } from "./sidebar-geometry";

interface SidebarCollapsedControlProps {
  label: string;
  onClick: () => void;
  selected?: boolean;
  className?: string;
  dataAttrs?: Record<string, string>;
  children: ReactNode;
}

export function SidebarCollapsedControl({
  label,
  onClick,
  selected = false,
  className,
  dataAttrs,
  children,
}: SidebarCollapsedControlProps) {
  return (
    <div className="flex justify-center">
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            {...(dataAttrs ?? {})}
            aria-label={label}
            aria-current={selected ? "page" : undefined}
            onClick={onClick}
            className={cn(
              "group/control relative flex shrink-0 items-center justify-center transition-colors duration-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus",
              sidebarCollapsedItem.square,
              className,
            )}
          >
            {children}
          </button>
        </TooltipTrigger>
        <TooltipContent side="right" sideOffset={8}>
          {label}
        </TooltipContent>
      </Tooltip>
    </div>
  );
}
