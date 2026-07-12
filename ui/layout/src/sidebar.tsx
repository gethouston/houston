import {
  cn,
  ScrollArea,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@houston-ai/core";
import { PanelLeftClose, Plus } from "lucide-react";
import {
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
  useState,
} from "react";
import { SidebarFlatList } from "./sidebar-flat-list";
import type { SidebarBaseRowContext } from "./sidebar-group-section";
import { SidebarGroupedList } from "./sidebar-grouped-list";
import type { SidebarGroupView } from "./sidebar-groups";
import type { SidebarItemRowLabels } from "./sidebar-item-row";
import { SidebarNavItem } from "./sidebar-nav";
import { shouldExpandFromRailClick } from "./sidebar-rail-expand";

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
  /** Inline action rendered at the right edge of the section label row,
   *  expanded mode only (e.g. a "new group" icon button). */
  sectionAction?: ReactNode;
  /**
   * Named groups in display order. When provided (even []), the grouped
   * drag-and-drop layout renders; items whose id is in no group render in a
   * trailing default section. When undefined → current flat list, unchanged.
   * Agents are always drag-reorderable in grouped mode.
   */
  groups?: SidebarGroupView[];
  onToggleGroupCollapsed?: (groupId: string) => void;
  onEditGroupContext?: (groupId: string) => void;
  onRenameGroup?: (groupId: string, newName: string) => void;
  onDeleteGroup?: (groupId: string) => void;
  /** A group id to open directly in inline-rename (e.g. a just-created group). */
  renamingGroupId?: string | null;
  onRenamingGroupIdHandled?: () => void;
  /** Move item into group `groupId` (null = default section), before `beforeItemId` (null = append to end of that section). */
  onMoveItem?: (
    itemId: string,
    dest: { groupId: string | null; beforeItemId: string | null },
  ) => void;
  /** Reorder group before `beforeGroupId` (null = move to end). */
  onMoveGroup?: (groupId: string, beforeGroupId: string | null) => void;
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
  createGroup?: string;
  renameGroup?: string;
  deleteGroup?: string;
  /** Menu item that opens the group's shared-context editor. */
  editGroupContext?: string;
  /** aria label for the group "..." menu trigger. */
  groupMenu?: string;
  newGroupPlaceholder?: string;
  /** Faint hint shown inside an empty group. */
  emptyGroupHint?: string;
  /** Label for the default section holding agents in no group. */
  ungroupedLabel?: string;
}

const DEFAULT_LABELS: Required<SidebarLabels> = {
  addItem: "Add item",
  moreOptions: "More options",
  renameItem: "Rename",
  deleteItem: "Delete",
  collapseSidebar: "Collapse sidebar",
  createGroup: "New group",
  renameGroup: "Rename group",
  deleteGroup: "Delete group",
  editGroupContext: "Edit shared context",
  groupMenu: "Group options",
  newGroupPlaceholder: "Group name",
  emptyGroupHint: "Drag agents here",
  ungroupedLabel: "Ungrouped",
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
  sectionAction,
  groups,
  onToggleGroupCollapsed,
  onEditGroupContext,
  onRenameGroup,
  onDeleteGroup,
  renamingGroupId,
  onRenamingGroupIdHandled,
  onMoveItem,
  onMoveGroup,
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

  // Shared item editing state/handlers, consumed by both list modes.
  const baseRowCtx: SidebarBaseRowContext = {
    selectedId,
    editingId,
    editValue,
    hasDefaultMenu,
    onSelect,
    onItemKeyDown: handleKeyDown,
    onEditChange: setEditValue,
    onCommitRename: commitRename,
    onCancelEdit: () => setEditingId(null),
    onStartRename: onRename ? startRename : undefined,
    onDeleteItem: onDelete,
    labels: l,
  };

  const showLogo = logo && !header;

  // Collapse control for the EXPANDED state only. When collapsed, expanding
  // happens at the top of the rail (the header's monogram doubles as the
  // expand button) or by clicking anywhere on the rail itself.
  const toggleButton = onToggleCollapsed ? (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={l.collapseSidebar}
          onClick={onToggleCollapsed}
          className="flex size-7 shrink-0 items-center justify-center rounded-lg text-ink-muted transition-colors hover:bg-hover hover:text-ink focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-focus"
        >
          <PanelLeftClose className="size-4" />
        </button>
      </TooltipTrigger>
      <TooltipContent side="right" sideOffset={8}>
        {l.collapseSidebar}
      </TooltipContent>
    </Tooltip>
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
          "bg-sidebar text-sidebar-text flex flex-col h-full shrink-0 overflow-hidden",
          "transition-[width] duration-200 ease-out",
          collapsed ? "w-[56px] cursor-pointer" : "w-[220px]",
        )}
      >
        {/* Header + collapse toggle. Expanded: the toggle shares the workspace
            switcher's row (top-right). Collapsed: the header's monogram is the
            expand button (see WorkspaceSwitcher onExpand), and clicking any
            non-interactive spot on the rail also expands. Always visible,
            never hover-gated. */}
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
          {/* Section label + inline action (expanded only) */}
          {sectionLabel && !collapsed && (
            <div className="flex items-center gap-1 px-3 pt-3 pb-1">
              <div className="min-w-0 flex-1 text-xs font-medium text-ink-muted">
                {sectionLabel}
              </div>
              {sectionAction}
              {onAdd && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      aria-label={l.addItem}
                      onClick={onAdd}
                      className="flex size-6 shrink-0 items-center justify-center rounded-md text-ink-muted transition-colors hover:bg-hover hover:text-ink focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-focus"
                      {...(addItemDataAttrs ?? {})}
                    >
                      <Plus className="size-4" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">{l.addItem}</TooltipContent>
                </Tooltip>
              )}
            </div>
          )}

          {/* Items list */}
          <ScrollArea
            className={cn("flex-1", collapsed ? "px-2 pt-2" : "px-2")}
          >
            {!collapsed && groups !== undefined ? (
              <SidebarGroupedList
                items={items}
                groups={groups}
                onToggleGroupCollapsed={onToggleGroupCollapsed}
                onEditGroupContext={onEditGroupContext}
                onRenameGroup={onRenameGroup}
                onDeleteGroup={onDeleteGroup}
                renamingGroupId={renamingGroupId}
                onRenamingGroupIdHandled={onRenamingGroupIdHandled}
                onMoveItem={onMoveItem}
                onMoveGroup={onMoveGroup}
                rowCtx={baseRowCtx}
              />
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
        </div>

        {/* Footer slot (e.g., update notification) */}
        {footer}
      </aside>

      {children}
    </>
  );
}
