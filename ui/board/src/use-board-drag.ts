import { useCallback, useEffect, useRef, useState } from "react";
import {
  cardIdOf,
  columnIdAt,
  createDragGhost,
  draggableCardAt,
  endDragCursor,
  moveDragGhost,
  removeDragGhost,
  setDragForbidden,
  startDragCursor,
} from "./board-drag-dom";
import { columnDragRole } from "./dnd";
import type { KanbanColumn, KanbanItem } from "./types";

const DRAG_THRESHOLD_PX = 4;

export interface UseBoardDragArgs {
  items: KanbanItem[];
  columns: KanbanColumn[];
  enabled: boolean;
  canDrop: (item: KanbanItem, columnId: string) => boolean;
  onItemMove?: (item: KanbanItem, toColumnId: string) => void;
}

export interface BoardDragHandlers {
  onPointerDown: (e: React.PointerEvent) => void;
  onPointerMove: (e: React.PointerEvent) => void;
  onPointerUp: (e: React.PointerEvent) => void;
  onPointerCancel: (e: React.PointerEvent) => void;
  onClickCapture: (e: React.MouseEvent) => void;
}

export interface UseBoardDrag {
  draggingId: string | null;
  hoverColumnId: string | null;
  dragHandlers: BoardDragHandlers;
}

interface Gesture {
  pointerId: number;
  item: KanbanItem;
  cardEl: HTMLElement;
  startX: number;
  startY: number;
  started: boolean;
  boardEl: HTMLElement;
}

export function useBoardDrag({
  items,
  columns,
  enabled,
  canDrop,
  onItemMove,
}: UseBoardDragArgs): UseBoardDrag {
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [hoverColumnId, setHoverColumnId] = useState<string | null>(null);

  const gesture = useRef<Gesture | null>(null);
  const justDragged = useRef(false);

  const finish = useCallback(() => {
    const g = gesture.current;
    if (g?.started && g.boardEl.hasPointerCapture(g.pointerId)) {
      g.boardEl.releasePointerCapture(g.pointerId);
    }
    endDragCursor();
    removeDragGhost();
    gesture.current = null;
    setDraggingId(null);
    setHoverColumnId(null);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && gesture.current?.started) finish();
    };
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      endDragCursor();
      removeDragGhost();
    };
  }, [finish]);

  const roleAt = useCallback(
    (item: KanbanItem, x: number, y: number) => {
      const colId = columnIdAt(x, y);
      const col = colId ? columns.find((c) => c.id === colId) : undefined;
      const role = col
        ? columnDragRole(item, col, canDrop(item, col.id))
        : "idle";
      return { colId, role };
    },
    [columns, canDrop],
  );

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      justDragged.current = false;
      if (!enabled || e.button !== 0 || e.pointerType === "touch") return;
      const cardEl = draggableCardAt(e.target);
      const id = cardEl && cardIdOf(cardEl);
      if (!cardEl || !id) return;
      const item = items.find((i) => i.id === id);
      if (!item) return;
      gesture.current = {
        pointerId: e.pointerId,
        item,
        cardEl,
        startX: e.clientX,
        startY: e.clientY,
        started: false,
        boardEl: e.currentTarget as HTMLElement,
      };
    },
    [enabled, items],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      const g = gesture.current;
      if (!g || e.pointerId !== g.pointerId) return;
      if (!g.started) {
        if (
          Math.hypot(e.clientX - g.startX, e.clientY - g.startY) <
          DRAG_THRESHOLD_PX
        ) {
          return;
        }
        g.started = true;
        setDraggingId(g.item.id);
        startDragCursor();
        createDragGhost(g.cardEl, e.clientX, e.clientY);
        g.boardEl.setPointerCapture(g.pointerId);
      }
      moveDragGhost(e.clientX, e.clientY);
      const { colId, role } = roleAt(g.item, e.clientX, e.clientY);
      setHoverColumnId(colId);
      setDragForbidden(role === "forbidden");
    },
    [roleAt],
  );

  const onPointerUp = useCallback(
    (e: React.PointerEvent) => {
      const g = gesture.current;
      if (!g || e.pointerId !== g.pointerId) return;
      if (g.started) {
        justDragged.current = true;
        const { colId, role } = roleAt(g.item, e.clientX, e.clientY);
        if (colId && role === "drop-target") onItemMove?.(g.item, colId);
      }
      finish();
    },
    [roleAt, onItemMove, finish],
  );

  const onPointerCancel = useCallback(
    (e: React.PointerEvent) => {
      const g = gesture.current;
      if (!g || e.pointerId !== g.pointerId) return;
      finish();
    },
    [finish],
  );

  const onClickCapture = useCallback((e: React.MouseEvent) => {
    if (justDragged.current) {
      justDragged.current = false;
      e.stopPropagation();
    }
  }, []);

  return {
    draggingId,
    hoverColumnId,
    dragHandlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp,
      onPointerCancel,
      onClickCapture,
    },
  };
}
