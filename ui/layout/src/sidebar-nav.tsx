import { cn, Tooltip, TooltipContent, TooltipTrigger } from "@houston-ai/core";
import type { ReactNode } from "react";
import { sidebarCollapsedItemClasses } from "./sidebar-paint";
import { SidebarRowButton } from "./sidebar-row-button";

export interface SidebarNavItemProps {
  icon: ReactNode;
  label: string;
  active?: boolean;
  onClick: () => void;
  /** Optional right-aligned slot (e.g. a "Beta" badge, a count). */
  trailing?: ReactNode;
  /** Extra DOM attributes (e.g. `data-tour-target`) on the row's root. */
  dataAttrs?: Record<string, string>;
  /** Icon-only rail mode: hide the label, surface it via a tooltip instead. */
  collapsed?: boolean;
}

/**
 * One top-level destination above the agent list: Mission Control,
 * Integrations, Skills, AI Models, the Agent Store, Settings.
 *
 * Expanded, it is a {@link SidebarRowButton} at BLOCK depth — the same row, the
 * same 28px box, the same glyph column and the same pill as the team headers
 * below it. It has to be: these rows and the team blocks are one continuous
 * list down the rail, and a destination that sat a pixel off the team glyphs
 * put two optical columns in a rail that only has room for one.
 *
 * Collapsed is the one fork, and it is a different anatomy rather than a
 * narrower version of this one: a centred 36px glyph whose label is carried by
 * a tooltip. The primitive deliberately does not own that.
 */
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
            aria-current={active ? "page" : undefined}
            {...dataAttrs}
            className={cn(
              "relative flex size-9 items-center justify-center rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus",
              active ? "bg-sidebar-active text-ink" : "text-ink hover:bg-hover",
            )}
          >
            {icon}
            {/* Pinned to the glyph's corner, not laid out beside it: the
                collapsed row is a fixed 36px box with a 16px mark centred in
                it, so a count chip in FLOW would push the glyph off-centre and
                then overflow the box. The shared class is the same corner
                treatment the collapsed agent rows wear. */}
            {trailing && (
              <span className={sidebarCollapsedItemClasses.trailing}>
                {trailing}
              </span>
            )}
          </button>
        </TooltipTrigger>
        <TooltipContent side="right" sideOffset={8}>
          {label}
        </TooltipContent>
      </Tooltip>
    );
  }

  return (
    <SidebarRowButton
      label={label}
      icon={icon}
      depth="block"
      active={active}
      onActivate={onClick}
      trailing={trailing}
      dataAttrs={dataAttrs}
    />
  );
}
