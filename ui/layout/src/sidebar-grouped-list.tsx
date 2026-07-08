import {
  type CollisionDetection,
  DndContext,
  type DragEndEvent,
  type DragOverEvent,
  DragOverlay,
  type DragStartEvent,
  KeyboardSensor,
  MeasuringStrategy,
  PointerSensor,
  pointerWithin,
  rectIntersection,
  TouchSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { restrictToVerticalAxis } from "@dnd-kit/modifiers";
import { arrayMove, sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { cn } from "@houston-ai/core";
import { Plus } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { SidebarItem } from "./sidebar";
import { sidebarClasses } from "./sidebar-classes";
import {
  type ContainerId,
  containerOfItem,
  containerOfOverId,
  itemMoveDest,
  placeItem,
  rawGroupId,
  rawItemId,
  sameOrder,
  toWorkingSections,
  type WorkingSection,
} from "./sidebar-dnd";
import { SidebarGroupHeader } from "./sidebar-group-header";
import {
  type SidebarBaseRowContext,
  SidebarGroupSection,
} from "./sidebar-group-section";
import {
  computeSidebarSections,
  type SidebarGroupView,
  type SidebarSection,
} from "./sidebar-groups";
import { SidebarItemRow } from "./sidebar-item-row";

export interface SidebarGroupedListProps {
  items: SidebarItem[];
  groups: SidebarGroupView[];
  rowCtx: SidebarBaseRowContext;
  onToggleGroupCollapsed?: (groupId: string) => void;
  onRenameGroup?: (groupId: string, newName: string) => void;
  onDeleteGroup?: (groupId: string) => void;
  renamingGroupId?: string | null;
  onRenamingGroupIdHandled?: () => void;
  onMoveItem?: (
    itemId: string,
    dest: { groupId: string | null; beforeItemId: string | null },
  ) => void;
  onMoveGroup?: (groupId: string, beforeGroupId: string | null) => void;
  onAdd?: () => void;
  addItemDataAttrs?: Record<string, string>;
}

/** Resolve any over-target id to the container (group id, or null default) it
 *  belongs to — including a group header, so hovering a collapsed group drops
 *  into it. */
function overContainerId(
  working: WorkingSection[],
  overId: string,
): string | null | undefined {
  // The ungrouped section's own sortable node ("grp:__default__") must resolve
  // to the null default container, not the literal "__default__" string — else
  // dropping over the empty ungrouped area targets a container that doesn't
  // exist (no highlight, and the agent is lost).
  if (overId === "grp:__default__") return null;
  const grp = rawGroupId(overId);
  if (grp !== null) return grp;
  return containerOfOverId(working, overId);
}

/**
 * Pointer-first collision that PREFERS the item directly under the cursor over
 * any container. `closestCorners` kept snapping to a spatially-near group, so
 * top-level agents couldn't be reordered and an agent couldn't be dragged out
 * of a group. With pointer-within + item preference, the drop target is exactly
 * what the cursor is over; empty areas (a group, the drop-out zone) fall through
 * to the container.
 */
const collisionDetection: CollisionDetection = (args) => {
  const pointer = pointerWithin(args);
  const hits = pointer.length > 0 ? pointer : rectIntersection(args);
  const item = hits.find((h) => String(h.id).startsWith("item:"));
  return item ? [item] : hits;
};

/**
 * Expanded grouped sidebar with @dnd-kit drag-and-drop (always on): a lifted
 * `DragOverlay` copy follows the cursor, sibling rows animate out of the way,
 * agents move within and across groups (and the trailing default section), and
 * group headers reorder whole groups. Cross-group movement is applied live to a
 * working copy in `onDragOver`; the final position commits through `onMoveItem`
 * / `onMoveGroup` on drop. Pointer, touch (press-hold) and keyboard sensors;
 * vertical-axis constrained; droppables always measured for smooth reflow.
 */
export function SidebarGroupedList({
  items,
  groups,
  rowCtx,
  onToggleGroupCollapsed,
  onRenameGroup,
  onDeleteGroup,
  renamingGroupId,
  onRenamingGroupIdHandled,
  onMoveItem,
  onMoveGroup,
  onAdd,
  addItemDataAttrs,
}: SidebarGroupedListProps) {
  const [working, setWorking] = useState<WorkingSection[] | null>(null);
  const [activeItemId, setActiveItemId] = useState<string | null>(null);
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null);
  // The container the drag currently targets, and where the item started —
  // used to highlight the destination group and fade the overlay when the
  // agent is crossing INTO a folder.
  const [overContainer, setOverContainer] = useState<ContainerId | undefined>(
    undefined,
  );
  const [sourceContainer, setSourceContainer] = useState<
    ContainerId | undefined
  >(undefined);
  // One-shot pulse on the group that just RECEIVED a dropped agent (confirms
  // the drop, especially when the folder is collapsed).
  const [pulseGroupId, setPulseGroupId] = useState<string | null>(null);
  const pulseTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 160, tolerance: 6 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const byId = new Map(items.map((it) => [it.id, it]));
  const groupById = new Map(groups.map((g) => [g.id, g]));
  const base = computeSidebarSections(items, groups);
  const sections: SidebarSection[] = working
    ? working.map((ws) => ({
        groupId: ws.groupId,
        group: ws.groupId ? (groupById.get(ws.groupId) ?? null) : null,
        items: ws.itemIds
          .map((id) => byId.get(id))
          .filter((it): it is SidebarItem => !!it),
      }))
    : base;

  const activeItem = activeItemId ? byId.get(activeItemId) : undefined;
  const activeGroup = activeGroupId ? groupById.get(activeGroupId) : undefined;
  // The group currently receiving the drag (highlight it); whether the agent is
  // crossing INTO a folder from elsewhere (fade the overlay to read as "going in").
  const overGroupId =
    overContainer != null && groupById.has(overContainer)
      ? overContainer
      : null;
  const droppingIntoGroup =
    activeItemId !== null &&
    overGroupId !== null &&
    overGroupId !== sourceContainer;

  function onDragStart(e: DragStartEvent) {
    const type = e.active.data.current?.type;
    if (type === "group") {
      setActiveGroupId((e.active.data.current?.groupId as string) ?? null);
    } else {
      const id = rawItemId(String(e.active.id));
      const snapshot = toWorkingSections(base);
      const from = id ? containerOfItem(snapshot, id) : undefined;
      setActiveItemId(id);
      setWorking(snapshot);
      setSourceContainer(from);
      setOverContainer(from);
    }
  }

  // Live-reorder the working copy on every hover (same- AND cross-container), so
  // `working` is the single source of truth the UI renders and `onDragEnd` just
  // commits — no recompute from a possibly-self `over` at drop time.
  function onDragOver(e: DragOverEvent) {
    if (!activeItemId || !working || !e.over) return;
    const target = overContainerId(working, String(e.over.id));
    if (target === undefined) return;
    setOverContainer(target);
    const overItem = rawItemId(String(e.over.id));
    const next = placeItem(working, activeItemId, target, overItem);
    if (!sameOrder(next, working)) setWorking(next);
  }

  function onDragEnd(e: DragEndEvent) {
    const { over } = e;
    if (activeGroupId && over) {
      const overGroup = overContainerId(working ?? [], String(over.id));
      const ids = groups.map((g) => g.id);
      const from = ids.indexOf(activeGroupId);
      const to = overGroup ? ids.indexOf(overGroup) : ids.length - 1;
      if (from !== -1 && to !== -1 && from !== to) {
        const next = arrayMove(ids, from, to);
        const pos = next.indexOf(activeGroupId);
        onMoveGroup?.(activeGroupId, next[pos + 1] ?? null);
      }
      reset();
    } else if (activeItemId && working) {
      const dest = itemMoveDest(working, activeItemId);
      if (dest) onMoveItem?.(activeItemId, dest);
      // Confirm a drop INTO a different group with a one-shot pulse.
      if (dest && dest.groupId !== null && dest.groupId !== sourceContainer) {
        pulse(dest.groupId);
      }
      // Keep `working` mounted (it holds the correct new order) so the list
      // doesn't flash the stale prop order while the optimistic write lands —
      // the effect below releases it once props catch up. Only clear the drag
      // markers here.
      clearActive();
    } else {
      reset();
    }
  }

  function clearActive() {
    setActiveItemId(null);
    setActiveGroupId(null);
    setOverContainer(undefined);
    setSourceContainer(undefined);
  }

  function reset() {
    setWorking(null);
    clearActive();
  }

  function pulse(groupId: string) {
    if (pulseTimer.current) clearTimeout(pulseTimer.current);
    setPulseGroupId(groupId);
    pulseTimer.current = setTimeout(() => setPulseGroupId(null), 650);
  }
  useEffect(() => () => clearTimeout(pulseTimer.current), []);

  // Release the post-drop `working` overlay once the incoming props reflect the
  // committed order (no flicker); a safety timer covers a rejected write whose
  // props roll back and never match.
  useEffect(() => {
    if (!working || activeItemId) return;
    if (
      sameOrder(
        toWorkingSections(computeSidebarSections(items, groups)),
        working,
      )
    ) {
      setWorking(null);
      return;
    }
    const t = window.setTimeout(() => setWorking(null), 800);
    return () => window.clearTimeout(t);
  }, [working, activeItemId, items, groups]);

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collisionDetection}
      modifiers={[restrictToVerticalAxis]}
      measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragEnd={onDragEnd}
      onDragCancel={reset}
    >
      <div className={sidebarClasses.itemsList}>
        {sections.map((section) => (
          <SidebarGroupSection
            key={section.groupId ?? "__default"}
            section={section}
            ctx={rowCtx}
            dragging={activeItemId !== null}
            hasGroups={groups.length > 0}
            highlight={
              activeItemId !== null && overContainer === section.groupId
            }
            pulse={section.group != null && section.groupId === pulseGroupId}
            renaming={!!section.groupId && section.groupId === renamingGroupId}
            onRenameHandled={onRenamingGroupIdHandled}
            onToggleCollapsed={onToggleGroupCollapsed}
            onRenameGroup={onRenameGroup}
            onDeleteGroup={onDeleteGroup}
          />
        ))}
        {onAdd && (
          <button
            type="button"
            aria-label={rowCtx.labels.addItem}
            onClick={onAdd}
            className={sidebarClasses.addButton}
            {...(addItemDataAttrs ?? {})}
          >
            <span className={sidebarClasses.addButtonInner}>
              <Plus className={sidebarClasses.addButtonIcon} />
              <span className={sidebarClasses.addButtonLabel}>
                {rowCtx.labels.addItem}
              </span>
            </span>
          </button>
        )}
      </div>

      <DragOverlay dropAnimation={{ duration: 180, easing: "ease" }}>
        {activeItem ? (
          <div
            className={cn(
              "rounded-lg bg-card shadow-lg ring-1 ring-border transition-opacity",
              droppingIntoGroup && "opacity-50",
            )}
          >
            <SidebarItemRow
              item={activeItem}
              isActive={activeItem.id === rowCtx.selectedId}
              isEditing={false}
              editValue=""
              hasMenu={false}
              onSelect={() => {}}
              onKeyDown={() => {}}
              onEditChange={() => {}}
              onCommitRename={() => {}}
              onCancelEdit={() => {}}
              labels={rowCtx.labels}
            />
          </div>
        ) : activeGroup ? (
          <div className="rounded-lg bg-card shadow-lg ring-1 ring-border">
            <SidebarGroupHeader
              group={activeGroup}
              count={
                base.find((s) => s.groupId === activeGroup.id)?.items.length ??
                0
              }
              labels={rowCtx.labels}
            />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
