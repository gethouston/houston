import { cn, ScrollArea } from "@houston-ai/core";
import type { MouseEvent } from "react";
import { SidebarBand } from "./sidebar-band";
import { SidebarFlatList } from "./sidebar-flat-list";
import { sidebarBandInset } from "./sidebar-geometry";
import { SidebarGroupedList } from "./sidebar-grouped-list";
import { DEFAULT_SIDEBAR_LABELS } from "./sidebar-labels";
import type { SidebarProps } from "./sidebar-props";
import { SidebarCollapseToggle, SidebarNavList } from "./sidebar-rail-chrome";
import { shouldExpandFromRailClick } from "./sidebar-rail-expand";
import type { SidebarBaseRowContext } from "./sidebar-row-context";

export type { SidebarLabels } from "./sidebar-labels";
export type {
  SidebarItem,
  SidebarNavItemEntry,
  SidebarNavSection,
  SidebarProps,
} from "./sidebar-props";

export function AppSidebar({
  logo,
  header,
  headerBelow,
  navSections,
  activeNavId,
  items,
  selectedId,
  onSelect,
  onAdd,
  onAddToGroup,
  addItemDataAttrs,
  sectionLabel,
  sectionAction,
  sectionCollapsed = false,
  onToggleSectionCollapsed,
  groups,
  defaultGroup,
  onActivateGroup,
  onActivateDefault,
  onDeleteGroup,
  onLeaveGroup,
  onMoveItem,
  onMoveGroup,
  footer,
  labels,
  collapsed = false,
  onToggleCollapsed,
  children,
}: SidebarProps) {
  const l = { ...DEFAULT_SIDEBAR_LABELS, ...labels };
  const grouped = !collapsed && groups !== undefined;
  // Folding is an EXPANDED-rail idea and `SidebarBand` owns it: the band
  // only exists when `!collapsed`, so the icon rail can never inherit a hidden
  // list — it renders `list` bare, with every row reachable.

  const baseRowCtx: SidebarBaseRowContext = { selectedId, onSelect, labels: l };

  /* The rail's one list, on the SHARED band inset so its rows sit on the nav
     bands' left edge. Its own const because the band wraps it when there is a
     heading and the icon rail renders it bare, so a swap never remounts it. */
  const listInset = collapsed ? "px-2 pt-2" : sidebarBandInset;
  const list = (
    <ScrollArea className={cn("min-h-0 flex-1", listInset)}>
      {grouped ? (
        <div className="sidebar-disclosure-in">
          <SidebarGroupedList
            items={items}
            groups={groups}
            defaultGroup={defaultGroup}
            onActivateGroup={onActivateGroup}
            onActivateDefault={onActivateDefault}
            onDeleteGroup={onDeleteGroup}
            onLeaveGroup={onLeaveGroup}
            onMoveItem={onMoveItem}
            onMoveGroup={onMoveGroup}
            onAdd={onAdd}
            onAddToGroup={onAddToGroup}
            addItemLabel={l.addItem}
            addItemDataAttrs={addItemDataAttrs}
            rowCtx={baseRowCtx}
          />
        </div>
      ) : (
        <SidebarFlatList
          items={items}
          collapsed={collapsed}
          ctx={baseRowCtx}
          onAdd={onAdd}
          addItemDataAttrs={addItemDataAttrs}
        />
      )}
    </ScrollArea>
  );

  const toggleButton = onToggleCollapsed ? (
    <SidebarCollapseToggle
      label={l.collapseSidebar}
      onToggle={onToggleCollapsed}
    />
  ) : null;

  const handleRailClick = (e: MouseEvent<HTMLElement>) => {
    if (!collapsed || !onToggleCollapsed) return;
    if (!shouldExpandFromRailClick(e.target as HTMLElement)) return;
    onToggleCollapsed();
  };

  return (
    <>
      {/* Rail click-to-expand is a redundant convenience affordance; keyboard
          users expand via the always-focusable header button. */}
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: see above */}
      <aside
        data-tour-target="sidebar"
        onClick={handleRailClick}
        className={cn(
          "flex h-full shrink-0 flex-col overflow-hidden bg-sidebar text-sidebar-text",
          "transition-[width] duration-200 ease-out",
          collapsed ? "w-[56px] cursor-pointer" : "w-[220px]",
        )}
      >
        {collapsed ? (
          header
        ) : (
          <div className="flex items-center">
            <div className="min-w-0 flex-1">{header}</div>
            {toggleButton && (
              <div className="shrink-0 pr-2">{toggleButton}</div>
            )}
          </div>
        )}

        {headerBelow}

        {logo && !header && !collapsed && (
          <div className="flex items-center justify-between px-4 pt-4 pb-2">
            <div className="flex items-center gap-2">{logo}</div>
          </div>
        )}

        {navSections && navSections.length > 0 && (
          <SidebarNavList
            navSections={navSections}
            activeNavId={activeNavId}
            collapsed={collapsed}
          />
        )}

        {/* The list and the band that names it, wrapped so the tour can
            spotlight just this region. */}
        <div data-tour-target="agents" className="flex min-h-0 flex-1 flex-col">
          {sectionLabel && !collapsed ? (
            /* "Your teams" is the SAME `SidebarBand` as the nav runs above
               it — one band component for the whole rail. It is the only one
               that carries an affordance (the "+" that creates) and the only
               one whose content is a scroll box, hence the sizing classes. */
            <SidebarBand
              label={sectionLabel}
              collapsed={sectionCollapsed}
              onToggleCollapsed={onToggleSectionCollapsed}
              affordance={sectionAction}
              contentClassName="flex min-h-0 flex-1 flex-col"
            >
              {list}
            </SidebarBand>
          ) : (
            list
          )}
        </div>

        {/* shrink-0 so a short window squeezes the scrollable list, never the
            footer row. */}
        {footer && <div className="shrink-0">{footer}</div>}
      </aside>

      {children}
    </>
  );
}
