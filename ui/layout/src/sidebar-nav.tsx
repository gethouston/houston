import { cn } from "@houston-ai/core";
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
}

export function SidebarNavItem({
  icon,
  label,
  active,
  onClick,
  trailing,
  dataAttrs,
}: SidebarNavItemProps) {
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
