import { DndContext, MeasuringStrategy } from "@dnd-kit/core";
import { restrictToVerticalAxis } from "@dnd-kit/modifiers";
import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { cn } from "@houston-ai/core";
import { Fragment, useLayoutEffect, useRef, useState } from "react";
import {
  createSidebarAccessibility,
  keyboardMoveAnnouncement,
} from "./sidebar-drag-accessibility";
import { SidebarDragOverlay } from "./sidebar-drag-overlay";
import {
  blockStartKeys,
  emptyOpenGroupIds,
  SidebarEmptyGroupHint,
} from "./sidebar-group-block";
import type { SidebarGroupView, SidebarRootEntry } from "./sidebar-groups";
import { DEFAULT_SIDEBAR_LABELS, type SidebarLabels } from "./sidebar-labels";
import { sidebarListEnd } from "./sidebar-paint";
import type { SidebarItem } from "./sidebar-props";
import type { SidebarBaseRowContext } from "./sidebar-row-context";
import {
  type SidebarArrangement,
  type SidebarKeyboardDirection,
  treeRowKey,
} from "./sidebar-tree";
import { SidebarTreeRowView } from "./sidebar-tree-row";
import { useSidebarTreeDrag } from "./use-sidebar-tree-drag";

const DEFAULT_ORDER: never[] = [];

export interface SidebarGroupedListProps {
  items: SidebarItem[];
  groups: SidebarGroupView[];
  order?: SidebarRootEntry[];
  rowCtx: SidebarBaseRowContext;
  onActivateGroup?: (groupId: string) => void;
  /** A drop landed: the whole arrangement the rail now shows. Answers whether
   *  it was stored; absent, nothing can be dragged. */
  onArrange?: (arrangement: SidebarArrangement) => boolean;
  labels?: SidebarLabels;
}

/**
 * The grouped rail: top-level agents and groups interleaved, each open group's
 * members under its header, and one drag model for all of it (a sortable tree
 * over the flat row list, `sidebar-tree.ts`). The pointer stays free on both
 * axes while the overlay follows it vertically: the sideways offset is what
 * moves the ghost in or out of a group.
 */
export function SidebarGroupedList({
  items,
  groups,
  order = DEFAULT_ORDER,
  rowCtx,
  onActivateGroup,
  onArrange,
  labels,
}: SidebarGroupedListProps) {
  const drag = useSidebarTreeDrag({ items, groups, order, onArrange });
  const [announcement, setAnnouncement] = useState("");
  const listRef = useRef<HTMLDivElement>(null);
  // A row moved into a collapsed group leaves the screen and takes the focus
  // with it: the group's header takes it over. A row that stays mounted keeps
  // its focus on its own (React restores it after the commit).
  const [focusGroup, setFocusGroup] = useState<{ id: string } | null>(null);
  useLayoutEffect(() => {
    if (!focusGroup) return;
    const header = [
      ...(listRef.current?.querySelectorAll<HTMLElement>(
        "[data-sidebar-group]",
      ) ?? []),
    ].find((row) => row.dataset.sidebarGroup === focusGroup.id);
    header?.querySelector<HTMLElement>("button")?.focus();
  }, [focusGroup]);
  const itemById = new Map(items.map((item) => [item.id, item]));
  const groupById = new Map(groups.map((group) => [group.id, group]));
  const active = drag.ghost;
  // Drag hint, so only where a drag can land.
  const emptyGroups = drag.disabled
    ? new Set<string>()
    : emptyOpenGroupIds(drag.rows);
  const blockStarts = blockStartKeys(drag.rows);
  const emptyLabel = labels?.emptyGroup ?? DEFAULT_SIDEBAR_LABELS.emptyGroup;
  const keyboardMove = (key: string, direction: SidebarKeyboardDirection) => {
    const moved = drag.keyboardStep(key, direction);
    if (!moved) return;
    const landed = moved.after.find((row) => treeRowKey(row) === key);
    const parent =
      landed?.kind === "agent" && landed.parentId !== null
        ? groupById.get(landed.parentId)
        : undefined;
    if (parent?.collapsed) setFocusGroup({ id: parent.id });
    setAnnouncement(
      keyboardMoveAnnouncement(
        moved.before,
        moved.after,
        key,
        items,
        groups,
        labels,
      ),
    );
  };
  return (
    <DndContext
      accessibility={createSidebarAccessibility(items, groups, labels)}
      sensors={drag.sensors}
      collisionDetection={drag.collisionDetection}
      measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
      onDragStart={drag.onDragStart}
      onDragMove={drag.onDragMove}
      onDragOver={drag.onDragOver}
      onDragEnd={drag.onDragEnd}
      onDragCancel={drag.onDragCancel}
    >
      <div
        ref={listRef}
        className={cn("flex flex-col gap-px", sidebarListEnd)}
        data-sidebar-root-list=""
      >
        <span className="sr-only" aria-live="polite" aria-atomic="true">
          {announcement}
        </span>
        <SortableContext
          items={drag.rows.map(treeRowKey)}
          strategy={verticalListSortingStrategy}
        >
          {drag.rows.map((row) => {
            const key = treeRowKey(row);
            return (
              <Fragment key={key}>
                <SidebarTreeRowView
                  row={row}
                  item={row.kind === "agent" ? itemById.get(row.id) : undefined}
                  group={
                    row.kind === "group" ? groupById.get(row.id) : undefined
                  }
                  ctx={rowCtx}
                  ghost={key === drag.activeKey ? active : null}
                  disabled={drag.disabled}
                  opensBlock={blockStarts.has(key)}
                  onActivateGroup={onActivateGroup}
                  onKeyboardMove={drag.disabled ? undefined : keyboardMove}
                />
                {row.kind === "group" &&
                  emptyGroups.has(row.id) &&
                  key !== drag.activeKey && (
                    <SidebarEmptyGroupHint
                      groupId={row.id}
                      label={emptyLabel}
                    />
                  )}
              </Fragment>
            );
          })}
        </SortableContext>
      </div>
      <SidebarDragOverlay
        modifiers={[restrictToVerticalAxis]}
        activeItem={
          active?.kind === "agent" ? itemById.get(active.id) : undefined
        }
        activeGroup={
          active?.kind === "group" ? groupById.get(active.id) : undefined
        }
        rowCtx={rowCtx}
      />
    </DndContext>
  );
}
