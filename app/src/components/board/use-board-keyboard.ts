import type { KanbanColumnConfig, KanbanItem } from "@houston-ai/board";
import { useCallback, useEffect, useRef } from "react";
import { navigateBoard } from "../../lib/board-navigate";
import { useUIStore } from "../../stores/ui";

/**
 * Keyboard + panel orchestration shared by both board views.
 *
 * Owns: the arrow-key "highlight ring" navigator (Enter promotes the ring to
 * the open selection), the global Escape-to-close wiring, the highlight↔
 * selection sync, and the empty-board auto-open. Refs hold the latest items /
 * columns / highlight so the callbacks registered in the UI store stay stable
 * while always reading current state.
 *
 * View-specific knobs (`autoOpenKey` / `autoOpenItemCount` / `autoOpenBlocked`
 * / `onAutoOpenEmpty`) come from the source so Mission Control and the board
 * tab keep their own "open when empty" semantics behind one shared guard.
 */
export function useBoardKeyboard({
  items,
  columns,
  selectedId,
  setSelectedId,
  highlightedId,
  setHighlightedId,
  missionPanelOpen,
  isLoaded,
  hasSearchQuery,
  openerReady,
  autoOpenKey,
  autoOpenItemCount,
  autoOpenBlocked,
  onAutoOpenEmpty,
}: {
  items: KanbanItem[];
  columns: KanbanColumnConfig[];
  selectedId: string | null;
  setSelectedId: (id: string | null) => void;
  highlightedId: string | null;
  setHighlightedId: (id: string | null) => void;
  missionPanelOpen: boolean;
  isLoaded: boolean;
  hasSearchQuery: boolean;
  openerReady: boolean;
  autoOpenKey: string;
  autoOpenItemCount: number;
  autoOpenBlocked: boolean;
  onAutoOpenEmpty: () => void;
}) {
  const setOnBoardNavigate = useUIStore((s) => s.setOnBoardNavigate);
  const setOnBoardOpen = useUIStore((s) => s.setOnBoardOpen);
  const setOnPanelClose = useUIStore((s) => s.setOnPanelClose);

  // Refs hold the latest snapshot so the navigator registered in the UI store
  // stays stable while always reading current items / columns / highlight.
  const navItemsRef = useRef(items);
  const navColumnsRef = useRef(columns);
  const highlightedIdRef = useRef(highlightedId);
  const closerRef = useRef<(() => void) | null>(null);
  navItemsRef.current = items;
  navColumnsRef.current = columns;
  highlightedIdRef.current = highlightedId;

  const handleCloserReady = useCallback((close: () => void) => {
    closerRef.current = close;
  }, []);

  // Arrow navigation walks the HIGHLIGHT (no chat panel open); Enter promotes
  // it to the open selection.
  useEffect(() => {
    setOnBoardNavigate((dir) => {
      const next = navigateBoard(
        {
          items: navItemsRef.current,
          columns: navColumnsRef.current,
          selectedId: highlightedIdRef.current,
        },
        dir,
      );
      if (next) setHighlightedId(next);
    });
    setOnBoardOpen(() => {
      const id = highlightedIdRef.current;
      if (id) setSelectedId(id);
    });
    return () => {
      setOnBoardNavigate(null);
      setOnBoardOpen(null);
    };
  }, [setOnBoardNavigate, setOnBoardOpen, setSelectedId, setHighlightedId]);

  // Escape closes the open panel — covers both a selected card and the empty
  // new-mission panel (whose state lives inside AIBoard, hence the closer the
  // board hands back via onPanelCloserReady).
  useEffect(() => {
    if (!missionPanelOpen) {
      setOnPanelClose(null);
      return;
    }
    setOnPanelClose(() => {
      closerRef.current?.();
      setSelectedId(null);
    });
    return () => setOnPanelClose(null);
  }, [missionPanelOpen, setOnPanelClose, setSelectedId]);

  // Mouse selection (or any external selection change) drags the highlight
  // ring along, so closing the panel leaves it where the user last was.
  useEffect(() => {
    if (selectedId && selectedId !== highlightedIdRef.current) {
      setHighlightedId(selectedId);
    }
  }, [selectedId, setHighlightedId]);

  // Open the new-mission panel when the in-scope board is empty (and the user
  // isn't searching). Fires once per scope via the key ref.
  const autoOpenKeyRef = useRef<string | null>(null);
  useEffect(() => {
    if (!isLoaded) return;
    if (hasSearchQuery) return;
    if (autoOpenItemCount > 0) {
      if (autoOpenKeyRef.current === autoOpenKey) autoOpenKeyRef.current = null;
      return;
    }
    if (!openerReady || missionPanelOpen || autoOpenBlocked) return;
    if (autoOpenKeyRef.current === autoOpenKey) return;
    autoOpenKeyRef.current = autoOpenKey;
    onAutoOpenEmpty();
  }, [
    isLoaded,
    hasSearchQuery,
    autoOpenItemCount,
    autoOpenKey,
    openerReady,
    missionPanelOpen,
    autoOpenBlocked,
    onAutoOpenEmpty,
  ]);

  return { handleCloserReady };
}
