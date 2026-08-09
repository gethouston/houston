import {
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { arrayMove, sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { useEffect, useState } from "react";
import {
  type ContainerId,
  containerOfItem,
  itemMoveDest,
  placeItem,
  rawItemId,
  sameOrder,
  toWorkingSections,
  type WorkingSection,
} from "./sidebar-dnd";
import { projectSidebarDrag } from "./sidebar-drag-view";
import { overContainerId } from "./sidebar-drop-target";
import {
  computeSidebarSections,
  type SidebarGroupView,
} from "./sidebar-groups";
import type { SidebarItem } from "./sidebar-props";

export interface SidebarDragStateOptions {
  items: SidebarItem[];
  groups: SidebarGroupView[];
  /** Reorder an item WITHIN its own container, before `beforeItemId` (null =
   *  append to the end of that container). */
  onMoveItem?: (
    itemId: string,
    dest: { groupId: string | null; beforeItemId: string | null },
  ) => void;
  /** Reorder group before `beforeGroupId` (null = move to end). */
  onMoveGroup?: (groupId: string, beforeGroupId: string | null) => void;
}

/**
 * The @dnd-kit state machine behind the grouped sidebar: the working copy of
 * the sections, the drag markers, the sensors and the four `DndContext`
 * callbacks.
 *
 * **An item drag never leaves the block it started in.** Every hover resolves
 * to a container, and one that is not the source is REFUSED: the working copy
 * is left alone and the lifted copy reads as refused
 * ({@link SidebarDragProjection.rejected}). Moving an item between blocks is a
 * deliberate, named action the host mounts elsewhere, not something a stray
 * gesture across a rail full of blocks can do by accident — and a drop that
 * crossed blocks was the one drag here that could change what a block CONTAINS
 * rather than merely its order.
 *
 * Group headers still reorder whole groups. The final position commits through
 * `onMoveItem` / `onMoveGroup` on drop.
 */
export function useSidebarDragState({
  items,
  groups,
  onMoveItem,
  onMoveGroup,
}: SidebarDragStateOptions) {
  const [working, setWorking] = useState<WorkingSection[] | null>(null);
  const [activeItemId, setActiveItemId] = useState<string | null>(null);
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null);
  // Where the item started, and whether the pointer is currently over some
  // OTHER block — the one state the refusal affordance is drawn from.
  const [sourceContainer, setSourceContainer] = useState<
    ContainerId | undefined
  >(undefined);
  const [rejecting, setRejecting] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 160, tolerance: 6 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const projection = projectSidebarDrag(items, groups, {
    working,
    activeItemId,
    activeGroupId,
    rejecting,
  });

  function onDragStart(e: DragStartEvent) {
    const type = e.active.data.current?.type;
    if (type === "group") {
      setActiveGroupId((e.active.data.current?.groupId as string) ?? null);
    } else {
      const id = rawItemId(String(e.active.id));
      const snapshot = toWorkingSections(computeSidebarSections(items, groups));
      const from = id ? containerOfItem(snapshot, id) : undefined;
      setActiveItemId(id);
      setWorking(snapshot);
      setSourceContainer(from);
      setRejecting(false);
    }
  }

  // Live-reorder the working copy on every hover WITHIN the source block, so
  // `working` is the single source of truth the UI renders and `onDragEnd` just
  // commits. A hover over any other block changes nothing and marks the drag
  // refused; the item stays exactly where it was picked up from.
  function onDragOver(e: DragOverEvent) {
    if (!activeItemId || !working || !e.over) return;
    const target = overContainerId(working, String(e.over.id));
    if (target === undefined) return;
    if (target !== sourceContainer) {
      setRejecting(true);
      return;
    }
    setRejecting(false);
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
      // The working copy never left the source block, so this dest is always a
      // within-block position — including when the drop landed over another
      // block, which simply commits the order the item already had.
      const dest = itemMoveDest(working, activeItemId);
      if (dest) onMoveItem?.(activeItemId, dest);
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
    setSourceContainer(undefined);
    setRejecting(false);
  }

  function reset() {
    setWorking(null);
    clearActive();
  }

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

  return {
    ...projection,
    sensors,
    activeItemId,
    // The only block a drag can highlight is the one it started in: there is
    // nowhere else for it to land.
    overContainer:
      activeItemId !== null && !rejecting ? sourceContainer : undefined,
    onDragStart,
    onDragOver,
    onDragEnd,
    reset,
  };
}
