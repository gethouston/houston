import { cn, ScrollArea } from "@houston-ai/core";
import { SidebarBand } from "./sidebar-band";
import { SidebarFlatList } from "./sidebar-flat-list";
import {
  sidebarBandInset,
  sidebarCollapsedWidth,
  sidebarExpandedWidth,
  sidebarWindowControlsWidth,
} from "./sidebar-geometry";
import { SidebarGroupedList } from "./sidebar-grouped-list";
import { SidebarHeader } from "./sidebar-header";
import { DEFAULT_SIDEBAR_LABELS } from "./sidebar-labels";
import type { SidebarProps } from "./sidebar-props";
import { SidebarNavList } from "./sidebar-rail-chrome";
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
  addItemDataAttrs,
  sectionLabel,
  sectionAction,
  sectionCollapsed = false,
  onToggleSectionCollapsed,
  groups,
  order,
  onActivateGroup,
  onArrange,
  footer,
  labels,
  collapsed = false,
  windowControlsInset = false,
  onToggleCollapsed,
  children,
}: SidebarProps) {
  const l = { ...DEFAULT_SIDEBAR_LABELS, ...labels };
  const grouped = !collapsed && groups !== undefined;
  // Folding is an EXPANDED-rail idea and `SidebarBand` owns it: the band
  // only exists when `!collapsed`, so the icon rail can never inherit a hidden
  // list — it renders `list` bare, with every row reachable.

  const baseRowCtx: SidebarBaseRowContext = { selectedId, onSelect };

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
            order={order}
            onActivateGroup={onActivateGroup}
            onArrange={onArrange}
            onAdd={onAdd}
            addItemLabel={l.addItem}
            addItemDataAttrs={addItemDataAttrs}
            rowCtx={baseRowCtx}
            labels={l}
          />
        </div>
      ) : (
        <SidebarFlatList
          items={items}
          collapsed={collapsed}
          ctx={baseRowCtx}
          onAdd={onAdd}
          addItemLabel={l.addItem}
          addItemDataAttrs={addItemDataAttrs}
        />
      )}
    </ScrollArea>
  );

  return (
    <>
      <aside
        data-tour-target="sidebar"
        className={cn(
          "flex h-full shrink-0 flex-col overflow-hidden bg-sidebar text-sidebar-text",
          "transition-[width] duration-200 ease-out",
          collapsed
            ? windowControlsInset
              ? sidebarWindowControlsWidth
              : sidebarCollapsedWidth
            : sidebarExpandedWidth,
        )}
      >
        <SidebarHeader
          collapsed={collapsed}
          windowControlsInset={windowControlsInset}
          collapseLabel={l.collapseSidebar}
          expandLabel={l.expandSidebar}
          onToggleCollapsed={onToggleCollapsed}
        >
          {header}
        </SidebarHeader>

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
            /* The host's section band is the SAME `SidebarBand` as the nav runs above
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
