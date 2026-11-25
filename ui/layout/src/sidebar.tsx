import { cn, ScrollArea } from "@houston-ai/core";
import { SidebarFlatList } from "./sidebar-flat-list";
import {
  sidebarCollapsedWidth,
  sidebarExpandedWidth,
  sidebarWindowControlsWidth,
} from "./sidebar-frame";
import { sidebarRailInset } from "./sidebar-geometry";
import { SidebarGroupedList } from "./sidebar-grouped-list";
import { SidebarHeader } from "./sidebar-header";
import { DEFAULT_SIDEBAR_LABELS } from "./sidebar-labels";
import { sidebarPinnedNeighbour } from "./sidebar-paint";
import { SidebarPinnedList } from "./sidebar-pinned-list";
import type { SidebarProps } from "./sidebar-props";
import type { SidebarBaseRowContext } from "./sidebar-row-context";

const DEFAULT_PINNED_ITEMS: never[] = [];

export type { SidebarLabels } from "./sidebar-labels";
export type { SidebarItem, SidebarProps } from "./sidebar-props";

/**
 * The rail: a top line (the collapse toggle and the host's verbs), an optional
 * full-width notice under it, the list of people, and the host's footer.
 *
 * The list is the rail's only content: pinned rows first, outside the scroll
 * box so scrolling never takes them away, then the grouped (or flat) list,
 * closed by the host's `listFooter` (the add shortcut). Everything that is
 * not a person lives in the host's footer.
 */
export function AppSidebar({
  headerActions,
  headerBelow,
  items,
  pinnedItems = DEFAULT_PINNED_ITEMS,
  selectedId,
  onSelect,
  groups,
  order,
  onActivateGroup,
  onArrange,
  listFooter,
  footer,
  labels,
  collapsed = false,
  windowControlsInset = false,
  onToggleCollapsed,
  children,
}: SidebarProps) {
  const l = { ...DEFAULT_SIDEBAR_LABELS, ...labels };
  const grouped = !collapsed && groups !== undefined;
  const baseRowCtx: SidebarBaseRowContext = { selectedId, onSelect };

  // Pinned rows sit on the list's inset but outside its scroll box.
  const pinned = !collapsed && pinnedItems.length > 0 && (
    <div className={cn("shrink-0", sidebarRailInset, sidebarPinnedNeighbour)}>
      <SidebarPinnedList items={pinnedItems} ctx={baseRowCtx} />
    </div>
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
          actions={headerActions}
          collapsed={collapsed}
          windowControlsInset={windowControlsInset}
          collapseLabel={l.collapseSidebar}
          expandLabel={l.expandSidebar}
          onToggleCollapsed={onToggleCollapsed}
        />

        {headerBelow}

        {/* Wrapped so the tour can spotlight just the list. */}
        <div data-tour-target="agents" className="flex min-h-0 flex-1 flex-col">
          {pinned}
          <ScrollArea
            className={cn(
              "min-h-0 flex-1",
              collapsed ? "px-2 pt-2" : sidebarRailInset,
            )}
          >
            {grouped ? (
              <div className="sidebar-disclosure-in">
                <SidebarGroupedList
                  items={items}
                  groups={groups}
                  order={order}
                  onActivateGroup={onActivateGroup}
                  onArrange={onArrange}
                  rowCtx={baseRowCtx}
                  labels={l}
                />
              </div>
            ) : (
              <SidebarFlatList
                items={collapsed ? [...pinnedItems, ...items] : items}
                collapsed={collapsed}
                ctx={baseRowCtx}
              />
            )}
            {listFooter && (
              <div data-sidebar-list-footer="" className="pb-2">
                {listFooter}
              </div>
            )}
          </ScrollArea>
        </div>

        {/* shrink-0 so a short window squeezes the scrollable list, never the
            footer. */}
        {footer && <div className="shrink-0">{footer}</div>}
      </aside>

      {children}
    </>
  );
}
