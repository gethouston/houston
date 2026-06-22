import { cn, Tooltip, TooltipContent, TooltipTrigger } from "@houston-ai/core";
import type { ReactNode } from "react";

export interface SidebarNavItemProps {
  icon: ReactNode;
  label: string;
  active?: boolean;
  onClick: () => void;
  /** Optional right-aligned slot (e.g. a "Beta" badge, a count). */
  trailing?: ReactNode;
  /** Extra DOM attributes (e.g. `data-tour-target`) spread onto the button. */
  dataAttrs?: Record<string, string>;
  /** Icon-only rail mode: hide the label, surface it via a tooltip instead. */
  collapsed?: boolean;
}

export function SidebarNavItem({
  icon,
  label,
  active,
  onClick,
  trailing,
  dataAttrs,
  collapsed,
}: SidebarNavItemProps) {
  if (collapsed) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            onClick={onClick}
            aria-label={label}
            {...dataAttrs}
            className={cn(
              "relative flex size-9 items-center justify-center rounded-lg transition-colors",
              active
                ? "bg-accent text-foreground"
                : "text-foreground hover:bg-accent",
            )}
          >
            {icon}
            {trailing}
          </button>
        </TooltipTrigger>
        <TooltipContent side="right" sideOffset={8}>
          {label}
        </TooltipContent>
      </Tooltip>
    );
  }

  return (
    <button
      onClick={onClick}
      {...dataAttrs}
      className={cn(
        "w-full flex items-center gap-2 text-sm py-1.5 px-2.5 rounded-lg transition-colors",
        active
          ? "bg-accent font-medium text-foreground"
          : "text-foreground hover:bg-accent",
      )}
    >
      {icon}
      <span className="flex-1 text-left">{label}</span>
      {trailing}
    </button>
  );
}
