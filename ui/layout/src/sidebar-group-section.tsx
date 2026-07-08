import { useDroppable } from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { cn } from "@houston-ai/core";
import type { KeyboardEvent } from "react";
import type { SidebarLabels } from "./sidebar";
import { containerDndId, groupDndId } from "./sidebar-dnd";
import { SidebarGroupHeader } from "./sidebar-group-header";
import type { SidebarSection } from "./sidebar-groups";
import { SidebarSortableRow } from "./sidebar-sortable-row";

/** Item-level editing state + handlers shared by every rendered section. */
export interface SidebarRowContext {
  selectedId?: string | null;
  editingId: string | null;
  editValue: string;
  hasDefaultMenu: boolean;
  onSelect: (id: string) => void;
  onItemKeyDown: (e: KeyboardEvent, id: string) => void;
  onEditChange: (value: string) => void;
  onCommitRename: (id: string) => void;
  onCancelEdit: () => void;
  onStartRename?: (id: string, name: string) => void;
  onDeleteItem?: (id: string) => void;
  labels: Required<SidebarLabels>;
}

/** Item editing state/handlers shared by both list modes. */
export type SidebarBaseRowContext = SidebarRowContext;

export interface SidebarGroupSectionProps {
  section: SidebarSection;
  ctx: SidebarRowContext;
  /** An item drag is in flight (opens the default section as a drop-out zone). */
  dragging?: boolean;
  /** There are named groups — the default section then shows its own header so
   *  the ungrouped agents are a first-class, obvious drop target. */
  hasGroups?: boolean;
  /** This group is the current drop target — highlight it. */
  highlight?: boolean;
  /** Play a one-shot confirmation pulse (an agent just landed in this group). */
  pulse?: boolean;
  /** This group should open directly in inline-rename (just created). */
  renaming?: boolean;
  onRenameHandled?: () => void;
  onToggleCollapsed?: (groupId: string) => void;
  onRenameGroup?: (groupId: string, newName: string) => void;
  onDeleteGroup?: (groupId: string) => void;
}

/**
 * One sidebar section for the @dnd-kit grouped list: a collapsible, drag-to-
 * reorder group header (null for the trailing default section) plus a droppable
 * container whose item rows are a vertical {@link SortableContext}. An empty
 * group shows a faint drop hint and keeps a drop target. Rows animate to make
 * room via @dnd-kit; the lifted copy is the parent's DragOverlay.
 */
export function SidebarGroupSection({
  section,
  ctx,
  dragging,
  hasGroups,
  highlight,
  pulse,
  renaming,
  onRenameHandled,
  onToggleCollapsed,
  onRenameGroup,
  onDeleteGroup,
}: SidebarGroupSectionProps) {
  const { group, groupId, items } = section;
  const collapsed = group?.collapsed ?? false;
  // The default (ungrouped) section shows its "Ungrouped" header ONLY while
  // dragging (and only when named groups exist) — a clear drop-out target that
  // appears on drag and disappears at rest, so the resting sidebar stays clean.
  const showDefaultHeader = !group && !!hasGroups && !!dragging;

  const header = useSortable({
    id: group ? groupDndId(group.id) : "grp:__default__",
    data: { type: "group", groupId: group?.id },
    disabled: !group,
  });

  const { setNodeRef: setDropRef } = useDroppable({
    id: containerDndId(groupId),
    data: { type: "container", containerId: groupId },
  });

  return (
    <div
      ref={header.setNodeRef}
      data-sidebar-drop-group={groupId ?? ""}
      style={{
        transform: CSS.Translate.toString(header.transform),
        transition: header.transition,
      }}
      className={cn(
        "flex flex-col",
        group && "pt-2.5",
        header.isDragging && "opacity-50",
      )}
    >
      <div
        data-drop-active={highlight ? "" : undefined}
        className={cn(
          "flex flex-col rounded-lg transition-colors duration-150",
          // Subtle fill on the section (group OR ungrouped) while it is the
          // active drop target — a quiet "drop here" for both, no ring.
          highlight && "bg-accent/60 pb-1",
          // One-shot confirmation flash after an agent lands in this group.
          pulse && "sidebar-group-dropped",
        )}
      >
        {group && (
          <SidebarGroupHeader
            group={group}
            count={items.length}
            labels={ctx.labels}
            dragAttributes={header.attributes}
            dragListeners={header.listeners}
            startRenaming={renaming}
            onRenameStarted={onRenameHandled}
            onToggleCollapsed={onToggleCollapsed}
            onRenameGroup={onRenameGroup}
            onDeleteGroup={onDeleteGroup}
          />
        )}

        {!collapsed && (
          <div
            ref={setDropRef}
            data-sidebar-drop-section={groupId ?? ""}
            className={cn(
              "flex flex-col rounded-md transition-colors duration-150",
              // Indent grouped rows (no dividing line — spacing carries hierarchy).
              group && "mt-0.5 pl-3",
              // While dragging, the ungrouped section reserves a comfortable
              // target below the groups so an agent can always be pulled back out
              // of a group (and it clearly glows).
              !group && dragging && "min-h-[52px]",
            )}
          >
            {showDefaultHeader && (
              <div className="flex items-center gap-1.5 px-2 pb-0.5 pt-0.5">
                <span className="min-w-0 flex-1 truncate text-[12px] font-medium text-muted-foreground/70">
                  {ctx.labels.ungroupedLabel}
                </span>
                <span className="shrink-0 text-[10px] font-medium tabular-nums text-muted-foreground/40">
                  {items.length}
                </span>
              </div>
            )}
            <SortableContext
              items={items.map((it) => `item:${it.id}`)}
              strategy={verticalListSortingStrategy}
            >
              {items.map((item) => (
                <SidebarSortableRow
                  key={item.id}
                  item={item}
                  containerId={groupId}
                  ctx={ctx}
                />
              ))}
            </SortableContext>
            {group && items.length === 0 && (
              <div className="px-3 py-1.5 text-[11px] text-muted-foreground/40">
                {ctx.labels.emptyGroupHint}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
