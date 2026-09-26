import {
  closestCenter,
  type DragEndEvent,
  type DragMoveEvent,
  type DragOverEvent,
  type DragStartEvent,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { useState } from "react";
import {
  computeSidebarSections,
  type SidebarGroupView,
  type SidebarRootEntry,
} from "./sidebar-groups";
import type { SidebarItem } from "./sidebar-props";
import {
  arrangementFromRows,
  flattenSidebar,
  groupsWithArrangement,
  keyboardSidebarStep,
  projectSidebarDrop,
  type SidebarArrangement,
  type SidebarKeyboardDirection,
  treeRowKey,
} from "./sidebar-tree";

/** Sideways drag, in px, that moves the ghost one level in or out. */
export const SIDEBAR_INDENT_STEP = 20;

interface DragState {
  activeKey: string;
  overKey: string;
  offsetX: number;
}

export interface SidebarTreeDragOptions {
  items: SidebarItem[];
  groups: SidebarGroupView[];
  order: SidebarRootEntry[];
  /** Stores a drop and answers whether it was accepted. Absent: the rail
   *  cannot store yet, so nothing can be dragged or moved. */
  onArrange?: (arrangement: SidebarArrangement) => boolean;
}

export function useSidebarTreeDrag({
  items,
  groups,
  order,
  onArrange,
}: SidebarTreeDragOptions) {
  const [drag, setDrag] = useState<DragState | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 160, tolerance: 6 },
    }),
  );

  // A drop is drawn from the arrangement it produced until the host's props
  // change: the host's store reaches this component a tick after the drop, and
  // rendering the old props in between would flash every row back to its
  // previous slot (and fly the drop animation there). Any props change ends
  // it, the stored arrangement or a rollback alike.
  const [landed, setLanded] = useState<SidebarArrangement | null>(null);
  const committed = JSON.stringify([
    order,
    groups.map((group) => [group.id, group.itemIds]),
  ]);
  const [seenCommitted, setSeenCommitted] = useState(committed);
  if (seenCommitted !== committed) {
    setSeenCommitted(committed);
    setLanded(null);
  }
  const shownGroups = landed ? groupsWithArrangement(groups, landed) : groups;
  const sections = computeSidebarSections(
    items,
    shownGroups,
    landed?.order ?? order,
  );
  const draggedGroupId = drag?.activeKey.startsWith("group:")
    ? drag.activeKey.slice(6)
    : null;
  const rows = flattenSidebar(sections, draggedGroupId);
  const depthDelta = (offsetX: number) =>
    Math.round(offsetX / SIDEBAR_INDENT_STEP);
  const projected = drag
    ? projectSidebarDrop(
        rows,
        drag.activeKey,
        drag.overKey,
        depthDelta(drag.offsetX),
      )
    : null;
  const ghost = projected?.find((row) => treeRowKey(row) === drag?.activeKey);

  const hiddenMembers = (): Record<string, string[]> =>
    Object.fromEntries(
      shownGroups
        .filter((group) => group.collapsed || group.id === draggedGroupId)
        .map((group) => [group.id, group.itemIds]),
    );

  const track = (event: DragMoveEvent | DragOverEvent) =>
    setDrag((current) =>
      current
        ? {
            ...current,
            overKey: event.over ? String(event.over.id) : current.overKey,
            offsetX: event.delta.x,
          }
        : current,
    );

  const arrange = (
    beforeRows: typeof rows,
    final: typeof rows,
    hidden: Record<string, string[]>,
  ) => {
    const next = arrangementFromRows(final, hidden);
    const before = arrangementFromRows(beforeRows, hidden);
    if (JSON.stringify(next) === JSON.stringify(before)) return false;
    if (!onArrange?.(next)) return false;
    setLanded(next);
    return true;
  };

  return {
    rows,
    /** No drag starts and no keyboard move applies: nothing could store it. */
    disabled: !onArrange,
    sensors,
    collisionDetection: closestCenter,
    activeKey: drag?.activeKey ?? null,
    /** The dragged row as it will land: where the ghost is drawn and indented. */
    ghost: ghost ?? null,
    keyboardStep: (activeKey: string, direction: SidebarKeyboardDirection) => {
      const groupId = activeKey.startsWith("group:")
        ? activeKey.slice(6)
        : null;
      const keyboardRows = flattenSidebar(sections, groupId);
      const final = keyboardSidebarStep(keyboardRows, activeKey, direction);
      if (!final) return null;
      const hidden = Object.fromEntries(
        shownGroups
          .filter((group) => group.collapsed || group.id === groupId)
          .map((group) => [group.id, group.itemIds]),
      );
      return arrange(keyboardRows, final, hidden)
        ? { before: keyboardRows, after: final }
        : null;
    },
    onDragStart: (event: DragStartEvent) => {
      const key = String(event.active.id);
      setDrag({ activeKey: key, overKey: key, offsetX: 0 });
    },
    onDragMove: track,
    onDragOver: track,
    onDragEnd: (event: DragEndEvent) => {
      const final =
        drag && event.over
          ? projectSidebarDrop(
              rows,
              drag.activeKey,
              String(event.over.id),
              depthDelta(event.delta.x),
            )
          : null;
      setDrag(null);
      if (!final) return;
      arrange(rows, final, hiddenMembers());
    },
    onDragCancel: () => setDrag(null),
  };
}
