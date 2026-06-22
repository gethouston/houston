import { useState, type KeyboardEvent, type ReactNode } from "react";
import { Plus, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import {
  cn,
  ScrollArea,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@houston-ai/core";
import { SidebarNavItem } from "./sidebar-nav";
import { SidebarItemRow } from "./sidebar-item-row";
import { SidebarCollapsedItem } from "./sidebar-collapsed-item";
import type { SidebarItemRowLabels } from "./sidebar-item-row";
import { sidebarClasses } from "./sidebar-classes";

export interface SidebarItem {
  id: string;
  name: string;
  icon?: ReactNode;
  /** Optional right-aligned slot for row badges or status indicators. */
  trailing?: ReactNode;
  /** Optional dropdown content rendered before built-in item actions. */
  menuContent?: ReactNode;
}

export interface SidebarNavItemEntry {
  id: string;
  label: string;
  icon: ReactNode;
  active?: boolean;
  onClick: () => void;
  /** Optional right-aligned slot (e.g. a "Beta" badge). */
  trailing?: ReactNode;
  /** Extra DOM attributes (e.g. `data-tour-target`) on the rendered button. */
  dataAttrs?: Record<string, string>;
}

export interface SidebarProps {
  logo?: ReactNode;
  /** Header area rendered at the very top (e.g., space/org switcher) */
  header?: ReactNode;
  /** Nav items rendered below the header and above the items list */
  navItems?: SidebarNavItemEntry[];
  /** ID of the currently active nav item (for highlighting) */
  activeNavId?: string;
  items: SidebarItem[];
  selectedId?: string | null;
  onSelect: (id: string) => void;
  onAdd?: () => void;
  /** Extra DOM attributes (e.g. `data-tour-target`) on the add-item button. */
  addItemDataAttrs?: Record<string, string>;
  onDelete?: (id: string) => void;
  onRename?: (id: string, newName: string) => void;
  sectionLabel?: string;
  /** Footer area rendered at the very bottom of the sidebar */
  footer?: ReactNode;
  labels?: SidebarLabels;
  /** Icon-only rail: hide all text labels, reveal them via hover/focus flyouts. */
  collapsed?: boolean;
  /** Toggle between expanded and collapsed. The toggle button is always visible. */
  onToggleCollapsed?: () => void;
  children?: ReactNode;
}

export interface SidebarLabels extends SidebarItemRowLabels {
  addItem?: string;
  collapseSidebar?: string;
  expandSidebar?: string;
}

const DEFAULT_LABELS: Required<SidebarLabels> = {
  addItem: "Add item",
  moreOptions: "More options",
  renameItem: "Rename",
  deleteItem: "Delete",
  collapseSidebar: "Collapse sidebar",
  expandSidebar: "Expand sidebar",
};

export function AppSidebar({
  logo,
  header,
  navItems,
  activeNavId,
  items,
  selectedId,
  onSelect,
  onAdd,
  addItemDataAttrs,
  onDelete,
  onRename,
  sectionLabel,
  footer,
  labels,
  collapsed = false,
  onToggleCollapsed,
  children,
}: SidebarProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const hasDefaultMenu = !!onDelete || !!onRename;
  const l = { ...DEFAULT_LABELS, ...labels };

  const startRename = (id: string, currentName: string) => {
    setEditingId(id);
    setEditValue(currentName);
  };

  const commitRename = (id: string) => {
    const trimmed = editValue.trim();
    const originalName = items.find((it) => it.id === id)?.name;
    if (trimmed && trimmed !== originalName && onRename) {
      onRename(id, trimmed);
    }
    setEditingId(null);
  };

  const handleKeyDown = (e: KeyboardEvent, id: string) => {
    if (onDelete && (e.key === "Delete" || e.key === "Backspace")) {
      e.preventDefault();
      onDelete(id);
    }
  };

  const showLogo = logo && !header;

  const toggleLabel = collapsed ? l.expandSidebar : l.collapseSidebar;

  const toggleButton = onToggleCollapsed ? (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={toggleLabel}
          aria-pressed={collapsed}
          onClick={onToggleCollapsed}
          className="flex size-7 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          {collapsed ? (
            <PanelLeftOpen className="size-4" />
          ) : (
            <PanelLeftClose className="size-4" />
          )}
        </button>
      </TooltipTrigger>
      <TooltipContent side="right" sideOffset={8}>
        {toggleLabel}
      </TooltipContent>
    </Tooltip>
  ) : null;

  return (
    <>
      <aside
        data-tour-target="sidebar"
        className={cn(
          "bg-sidebar text-sidebar-foreground flex flex-col h-full shrink-0 overflow-hidden",
          "transition-[width] duration-200 ease-out",
          collapsed ? "w-[56px]" : "w-[220px]",
        )}
      >
        {/* Header + collapse toggle. Expanded: the toggle shares the workspace
            switcher's row (top-right). Collapsed: just the monogram here — the
            toggle moves to the BOTTOM of the rail (see footer area). Always
            visible, never hover-gated. */}
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

        {/* Legacy logo area (only when no header) */}
        {showLogo && !collapsed && (
          <div className="flex items-center justify-between px-4 pt-4 pb-2">
            <div className="flex items-center gap-2">{logo}</div>
          </div>
        )}

        {/* Nav items */}
        {navItems && navItems.length > 0 && (
          <nav
            className={cn(
              "py-1",
              collapsed
                ? "flex flex-col items-center gap-0.5 px-2"
                : "px-2 space-y-0.5",
            )}
          >
            {navItems.map((item) => (
              <SidebarNavItem
                key={item.id}
                icon={item.icon}
                label={item.label}
                trailing={item.trailing}
                active={
                  activeNavId !== undefined
                    ? item.id === activeNavId
                    : item.active
                }
                onClick={item.onClick}
                dataAttrs={item.dataAttrs}
                collapsed={collapsed}
              />
            ))}
          </nav>
        )}

        {/* Agents section: label + items list, wrapped together so the tour
            can spotlight just this region. `flex-1 min-h-0` preserves the
            existing scroll behavior for the items list. */}
        <div data-tour-target="agents" className="flex min-h-0 flex-1 flex-col">
          {/* Section label (expanded only) */}
          {sectionLabel && !collapsed && (
            <div className="px-3 pt-3 pb-1">
              <div className="text-xs font-medium text-muted-foreground">
                {sectionLabel}
              </div>
            </div>
          )}

          {/* Items list */}
          <ScrollArea
            className={cn("flex-1", collapsed ? "px-2 pt-2" : "px-2")}
          >
            <div
              className={cn(
                collapsed
                  ? "flex flex-col items-center gap-1 pb-2"
                  : sidebarClasses.itemsList,
              )}
            >
              {items.map((item) =>
                collapsed ? (
                  <SidebarCollapsedItem
                    key={item.id}
                    item={item}
                    isActive={item.id === selectedId}
                    isEditing={editingId === item.id}
                    editValue={editValue}
                    hasMenu={hasDefaultMenu || !!item.menuContent}
                    onSelect={onSelect}
                    onKeyDown={handleKeyDown}
                    onEditChange={setEditValue}
                    onCommitRename={commitRename}
                    onCancelEdit={() => setEditingId(null)}
                    onStartRename={onRename ? startRename : undefined}
                    onDelete={onDelete}
                    labels={l}
                  />
                ) : (
                  <SidebarItemRow
                    key={item.id}
                    item={item}
                    isActive={item.id === selectedId}
                    isEditing={editingId === item.id}
                    editValue={editValue}
                    hasMenu={hasDefaultMenu || !!item.menuContent}
                    onSelect={onSelect}
                    onKeyDown={handleKeyDown}
                    onEditChange={setEditValue}
                    onCommitRename={commitRename}
                    onCancelEdit={() => setEditingId(null)}
                    onStartRename={onRename ? startRename : undefined}
                    onDelete={onDelete}
                    labels={l}
                  />
                ),
              )}
              {onAdd &&
                (collapsed ? (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        aria-label={l.addItem}
                        onClick={onAdd}
                        className="flex size-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                        {...(addItemDataAttrs ?? {})}
                      >
                        <Plus className="size-4" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="right" sideOffset={8}>
                      {l.addItem}
                    </TooltipContent>
                  </Tooltip>
                ) : (
                  <button
                    aria-label={l.addItem}
                    onClick={onAdd}
                    className={sidebarClasses.addButton}
                    {...(addItemDataAttrs ?? {})}
                  >
                    <span className={sidebarClasses.addButtonInner}>
                      <Plus className={sidebarClasses.addButtonIcon} />
                      <span className={sidebarClasses.addButtonLabel}>
                        {l.addItem}
                      </span>
                    </span>
                  </button>
                ))}
            </div>
          </ScrollArea>
        </div>

        {/* Footer slot (e.g., update notification) */}
        {footer}

        {/* Collapsed: the toggle lives at the bottom of the rail. */}
        {collapsed && toggleButton && (
          <div className="flex justify-center pb-4 pt-1">{toggleButton}</div>
        )}
      </aside>

      {children}
    </>
  );
}
