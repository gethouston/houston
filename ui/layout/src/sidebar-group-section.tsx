import { useDroppable } from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { cn } from "@houston-ai/core";
import { SidebarDefaultHeader } from "./sidebar-default-header";
import { containerDndId, groupDndId } from "./sidebar-dnd";
import { SidebarGroupHeader } from "./sidebar-group-header";
import type { SidebarDefaultGroupView, SidebarSection } from "./sidebar-groups";
import type { SidebarRowContext } from "./sidebar-row-context";
import { SidebarSectionRows } from "./sidebar-section-rows";
import { SidebarSortableRow } from "./sidebar-sortable-row";

export interface SidebarGroupSectionProps {
  section: SidebarSection;
  ctx: SidebarRowContext;
  /** Renders the trailing default section as a labelled block (see the type).
   *  Ignored for a named group's section. */
  defaultGroup?: SidebarDefaultGroupView;
  /** An item drag is in flight (opens the default section as a drop-out zone). */
  dragging?: boolean;
  /** This group is the current drop target — highlight it. */
  highlight?: boolean;
  /** Play a one-shot confirmation pulse (an agent just landed in this group). */
  pulse?: boolean;
  /** This group should open directly in inline-rename (just created). */
  renaming?: boolean;
  onRenameHandled?: () => void;
  onToggleCollapsed?: (groupId: string) => void;
  onEditGroupContext?: (groupId: string) => void;
  onRenameGroup?: (groupId: string, newName: string) => void;
  onDeleteGroup?: (groupId: string) => void;
}

/**
 * One sidebar section for the @dnd-kit grouped list: a collapsible, drag-to-
 * reorder group header (null for the trailing default section) plus a droppable
 * container holding this section's destination rows and then its item rows as a
 * vertical {@link SortableContext}. An empty group shows a faint drop hint and
 * keeps a drop target. Collapsing folds away the agents only — the destination
 * rows stay. Rows animate to make room via @dnd-kit; the lifted copy is the
 * parent's DragOverlay.
 *
 * Given `defaultGroup`, the trailing default section renders as a labelled,
 * non-collapsible block instead of a bare list — same anatomy as a group, minus
 * the affordances the container itself does not have.
 */
export function SidebarGroupSection({
  section,
  ctx,
  defaultGroup,
  dragging,
  highlight,
  pulse,
  renaming,
  onRenameHandled,
  onToggleCollapsed,
  onEditGroupContext,
  onRenameGroup,
  onDeleteGroup,
}: SidebarGroupSectionProps) {
  const { group, groupId, items } = section;
  const collapsed = group?.collapsed ?? false;
  // A labelled block: a named group, or the default section once the caller
  // gives it a name. Both indent their rows and both carry section rows.
  const block = group ?? (groupId === null ? defaultGroup : undefined);
  const sectionRows = block?.sections ?? [];

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
        block && "pt-2.5",
        header.isDragging && "opacity-50",
      )}
    >
      <div
        data-drop-active={highlight ? "" : undefined}
        className={cn(
          "flex flex-col rounded-lg transition-colors duration-150",
          // Subtle fill on the section (group OR ungrouped) while it is the
          // active drop target — a quiet "drop here" for both, no ring.
          highlight && "bg-hover/60 pb-1",
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
            onEditContext={onEditGroupContext}
            onRenameGroup={onRenameGroup}
            onDeleteGroup={onDeleteGroup}
          />
        )}
        {!group && defaultGroup && (
          <SidebarDefaultHeader name={defaultGroup.name} count={items.length} />
        )}

        <div
          ref={setDropRef}
          data-sidebar-drop-section={groupId ?? ""}
          className={cn(
            "flex flex-col rounded-md transition-colors duration-150",
            // Indent a block's rows (no dividing line — spacing carries hierarchy).
            block && "mt-0.5 pl-3",
            // While dragging, the ungrouped section reserves a comfortable
            // target below the groups so an agent can always be pulled back out
            // of a group (and it clearly glows).
            !group && dragging && "min-h-[52px]",
          )}
        >
          <SidebarSectionRows rows={sectionRows} />
          {/* Collapse folds away the MEMBERS only. The destination rows above
              are how you get back to the team — Mission Control and Team
              Settings. Hiding them too would erase the team the user is
              currently looking at from the rail. */}
          {!collapsed && (
            <>
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
              {block && items.length === 0 && (
                <div className="px-3 py-1.5 text-[11px] text-ink-muted/40">
                  {ctx.labels.emptyGroupHint}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
