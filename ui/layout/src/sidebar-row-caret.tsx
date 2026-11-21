import { cn } from "@houston-ai/core";
import { sidebarRowButtonClasses as c } from "./sidebar-paint";

export function SidebarRowCaret({
  expanded,
  className,
}: {
  expanded: boolean;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 16 16"
      aria-hidden="true"
      focusable="false"
      className={cn(c.caret, expanded && "rotate-90", className)}
    >
      <path d="M5.5 4.5 L10.5 8 L5.5 11.5 Z" />
    </svg>
  );
}
