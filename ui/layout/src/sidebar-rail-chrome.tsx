import { cn, Tooltip, TooltipContent, TooltipTrigger } from "@houston-ai/core";
import { PanelLeftClose } from "lucide-react";
import { SidebarBand } from "./sidebar-band";
import { sidebarBandInset } from "./sidebar-geometry";
import { SidebarNavItem } from "./sidebar-nav";
import type { SidebarNavItemEntry, SidebarNavSection } from "./sidebar-props";

/**
 * The rail's collapse control, for the EXPANDED state only. Collapsed, the
 * header's monogram doubles as the expand button and clicking any dead space on
 * the rail expands it too, so a second control here would be a third way to do
 * the same thing.
 */
export function SidebarCollapseToggle({
  label,
  onToggle,
}: {
  label: string;
  onToggle: () => void;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={label}
          onClick={onToggle}
          className="flex size-7 shrink-0 items-center justify-center rounded-lg text-ink-muted transition-colors hover:bg-hover hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
        >
          <PanelLeftClose className="size-4" />
        </button>
      </TooltipTrigger>
      <TooltipContent side="right" sideOffset={8}>
        {label}
      </TooltipContent>
    </Tooltip>
  );
}

/**
 * The rail's top-level destinations, above the list. Centred glyphs in the icon
 * rail, full rows when expanded; the row component owns that switch, so this is
 * only the band they sit in.
 *
 * A LABELLED run is a {@link SidebarBand}, the same component "Your teams"
 * uses below: the band, its triangle, its fold and the flush rhythm under it
 * all live there, so the three bands in this rail cannot drift apart. Folding
 * is a host-CONTROLLED prop because the host persists it.
 *
 * Sections that a host's gates emptied are DROPPED here rather than at the call
 * site, so a band can never outlive the rows it names. The icon rail drops the
 * bands themselves, renders one continuous glyph column, and ignores every fold:
 * folding is an expanded-rail idea (a 12px heading has nowhere to go in 56px),
 * and inheriting a hidden run there would leave a destination unreachable with
 * nothing on screen to bring it back. That is the same `!collapsed` guard the
 * "Your teams" list uses.
 */
export function SidebarNavList({
  navSections,
  activeNavId,
  collapsed,
}: {
  navSections: SidebarNavSection[];
  activeNavId?: string;
  collapsed: boolean;
}) {
  const sections = navSections.filter((section) => section.items.length > 0);
  const row = (item: SidebarNavItemEntry) => (
    <SidebarNavItem
      key={item.id}
      icon={item.icon}
      label={item.label}
      trailing={item.trailing}
      active={activeNavId !== undefined ? item.id === activeNavId : item.active}
      onClick={item.onClick}
      dataAttrs={item.dataAttrs}
      collapsed={collapsed}
    />
  );

  return (
    // The expanded nav adds NO horizontal padding of its own: the inset belongs
    // to the band heading and to the run of rows, once each. When the `<nav>`
    // carried it too, these bands' labels were inset twice (16px) while "Your
    // teams" was inset once, and the rail read as two lists. The COLLAPSED rail
    // keeps its own padding — it renders no bands, only a centred glyph column.
    <nav
      className={cn(
        "py-1",
        collapsed && "flex flex-col items-center gap-0.5 px-2",
      )}
    >
      {sections.map((section) => {
        if (collapsed) return section.items.map(row);
        const rows = (
          <div className={cn(sidebarBandInset, "space-y-0.5")}>
            {section.items.map(row)}
          </div>
        );
        // An UNLABELLED run is not a section: no band, nothing to fold, so it
        // is just its rows. The rail's first two destinations are that run.
        if (section.label === undefined)
          return <div key={section.id}>{rows}</div>;
        return (
          <SidebarBand
            key={section.id}
            label={section.label}
            collapsed={section.collapsed}
            onToggleCollapsed={section.onToggleCollapsed}
          >
            {rows}
          </SidebarBand>
        );
      })}
    </nav>
  );
}
