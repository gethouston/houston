import { useDroppable } from "@dnd-kit/core";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { cn } from "@houston-ai/core";
import { useId } from "react";
import { SidebarAddRow } from "./sidebar-add-row";
import { SidebarBlockContent } from "./sidebar-block-content";
import { SidebarBlockHeader } from "./sidebar-block-header";
import { containerDndId, groupDndId } from "./sidebar-dnd";
import type { SidebarDefaultGroupView, SidebarSection } from "./sidebar-groups";
import type { SidebarRowContext } from "./sidebar-row-context";

export interface SidebarGroupSectionProps {
  section: SidebarSection;
  ctx: SidebarRowContext;
  /** Renders the trailing default section as a labelled block (see the type).
   *  Ignored for a named group's section. */
  defaultGroup?: SidebarDefaultGroupView;
  /** This group is the current drop target — highlight it. Only ever true for
   *  the block a drag STARTED in, since a drag may not leave it. */
  highlight?: boolean;
  /** Rune ceiling for the header's inline rename; absent means no cap. */
  maxNameRunes?: number;
  onAdd?: (groupId: string | null) => void;
  addItemLabel?: string;
  addItemDataAttrs?: Record<string, string>;
  /** The header row was activated. What that MEANS is the host's: it may open
   *  the block's screen, fold it, or both (see {@link SidebarProps}). */
  onActivateGroup?: (groupId: string) => void;
  /** The DEFAULT block's header was activated. Its own callback because that
   *  block is not a stored group and has no id to hand back. */
  onActivateDefault?: () => void;
  onRenameGroup?: (groupId: string, newName: string) => void;
  onDeleteGroup?: (groupId: string) => void;
  /** Leave the group (the caller's membership, not the group). */
  onLeaveGroup?: (groupId: string) => void;
}

/**
 * One block of the grouped sidebar: a header row, then a droppable container
 * holding the block's item rows as a vertical {@link SortableContext}.
 *
 * **Collapsing folds away everything under the header.** The hole it leaves
 * (the open view's block is now a single row) is answered by the header itself:
 * the host marks it `active` and it wears the selected fill, and by the header's
 * own `trailing` slot, which rolls up what the hidden rows were signalling.
 *
 * **The droppable stays mounted while collapsed.** Only the CONTENT is
 * conditional, so a folded block still measures in the drag layer and its own
 * items can still be reordered back into it. It is NOT a way in from another
 * block: an item may only be dropped in the block it was picked up from
 * ({@link useSidebarDragState}).
 *
 * The default block renders through the SAME header, so it collapses like any
 * other. What it still does not get is the affordances the container itself
 * lacks: no delete, no leave, no sortable handle. It DOES rename, when the host
 * wires `defaultGroup.onRename` — see {@link SidebarBlockHeader}.
 */
export function SidebarGroupSection({
  section,
  ctx,
  defaultGroup,
  highlight,
  maxNameRunes,
  onAdd,
  addItemLabel,
  addItemDataAttrs,
  onActivateGroup,
  onActivateDefault,
  onRenameGroup,
  onDeleteGroup,
  onLeaveGroup,
}: SidebarGroupSectionProps) {
  const { group, groupId, items } = section;
  const contentId = useId();
  // A labelled block: a named group, or the default section once the caller
  // gives it a name. Both indent their rows.
  const block = group ?? (groupId === null ? defaultGroup : undefined);
  // With no block there is no header, so there is nothing to fold behind.
  const collapsed = block ? (block.collapsed ?? false) : false;

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
        // NO spacing of its own. A block is not a section floating above the
        // next one: it is a run of rows in the same list, so it stacks on the
        // list's own `space-y-0.5` rhythm and nothing else. Anything extra
        // between two teams reads as a gap in the rail, which is exactly what
        // it is — Linear's rail keeps one rhythm from the band to the last row.
        header.isDragging && "opacity-50",
      )}
    >
      <div
        data-drop-active={highlight ? "" : undefined}
        className={cn(
          "flex flex-col gap-px rounded-lg transition-colors duration-150",
          // Subtle fill on the section while it is the active drop target — a
          // quiet "drop here", no ring.
          highlight && "bg-hover/60 pb-1",
        )}
      >
        {block && (
          <SidebarBlockHeader
            block={block}
            group={group}
            // Only the DEFAULT block's own rename, and only when this section
            // IS that block: `block` is the union, so the header cannot read
            // the field off it.
            onRenameDefault={group ? undefined : defaultGroup?.onRename}
            ctx={ctx}
            contentId={contentId}
            dragAttributes={group ? header.attributes : undefined}
            dragListeners={group ? header.listeners : undefined}
            collapsed={collapsed}
            maxNameRunes={maxNameRunes}
            onActivateGroup={onActivateGroup}
            onActivateDefault={onActivateDefault}
            onRenameGroup={onRenameGroup}
            onDeleteGroup={onDeleteGroup}
            onLeaveGroup={onLeaveGroup}
          />
        )}

        {/* The droppable is ALWAYS mounted, even collapsed — see the header. */}
        <div
          ref={setDropRef}
          id={contentId}
          data-sidebar-drop-section={groupId ?? ""}
          className="flex flex-col gap-px rounded-md transition-colors duration-150"
        >
          {!collapsed && (
            <SidebarBlockContent
              items={items}
              containerId={groupId}
              ctx={ctx}
            />
          )}
          {!collapsed && block && onAdd && addItemLabel && (
            <SidebarAddRow
              label={addItemLabel}
              onClick={() => onAdd(groupId)}
              dataAttrs={addItemDataAttrs}
            />
          )}
        </div>
      </div>
    </div>
  );
}
