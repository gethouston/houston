import type { KanbanColumnConfig, KanbanItem } from "@houston-ai/board";
import { useCallback, useEffect, useRef } from "react";
import { navigateBoard } from "../../lib/board-navigate";
import { useUIStore } from "../../stores/ui";

/**
 * Keyboard + panel orchestration shared by both board views.
 *
 * Owns: the arrow-key "highlight ring" navigator (Enter promotes the ring to
 * the open selection), the global Escape-to-close wiring, the highlight↔
 * selection sync, the empty-board auto-open, and the release of everything
 * this board holds of the shared shell panel when it goes off screen. Refs
 * hold the latest items / columns / highlight so the callbacks registered in
 * the UI store stay stable while always reading current state.
 *
 * Every global registration here is gated on `isActive`: a mission board can be
 * mounted while hidden (the kept-alive team screen), so an unconditional
 * registration is last-writer-wins and a HIDDEN board would own the arrow
 * navigator and the Enter opener.
 *
 * View-specific knobs (`autoOpenKey` / `autoOpenItemCount` / `autoOpenBlocked`
 * / `onAutoOpenEmpty`) come from the source so Mission Control and the board
 * tab keep their own "open when empty" semantics behind one shared guard.
 */
export function useBoardKeyboard({
  isActive,
  items,
  columns,
  selectedId,
  setSelectedId,
  highlightedId,
  setHighlightedId,
  missionPanelOpen,
  setPanelOpen,
  isLoaded,
  hasSearchQuery,
  openerReady,
  autoOpenKey,
  autoOpenItemCount,
  autoOpenBlocked,
  onAutoOpenEmpty,
}: {
  /** Whether THIS board is the one on screen (see the hook's doc comment). */
  isActive: boolean;
  items: KanbanItem[];
  columns: KanbanColumnConfig[];
  selectedId: string | null;
  setSelectedId: (id: string | null) => void;
  highlightedId: string | null;
  setHighlightedId: (id: string | null) => void;
  missionPanelOpen: boolean;
  /** This board's claim on the shared shell detail panel. */
  setPanelOpen: (open: boolean) => void;
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
  // it to the open selection. Only the board ON SCREEN registers them: the
  // `if (!isActive) return` with NO cleanup on the inactive path is deliberate,
  // because React runs every effect's destroy pass across the tree before the
  // create pass — the outgoing board nulls the handler, then the incoming one
  // claims it, in that order. Nulling from the inactive path instead would
  // clobber whichever board just claimed it.
  useEffect(() => {
    if (!isActive) return;
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
  }, [
    isActive,
    setOnBoardNavigate,
    setOnBoardOpen,
    setSelectedId,
    setHighlightedId,
  ]);

  // Escape closes the open panel — covers both a selected card and the empty
  // new-mission panel (whose state lives inside AIBoard, hence the closer the
  // board hands back via onPanelCloserReady).
  useEffect(() => {
    if (!isActive) return;
    if (!missionPanelOpen) {
      setOnPanelClose(null);
      return;
    }
    setOnPanelClose(() => {
      closerRef.current?.();
      setSelectedId(null);
    });
    return () => setOnPanelClose(null);
  }, [isActive, missionPanelOpen, setOnPanelClose, setSelectedId]);

  // Going off screen releases everything this board holds of the ONE shell
  // panel: the empty new-mission composer (state lives inside AIBoard,
  // reachable only through the closer it handed back), the open mission, and
  // the panel claim. Skipping the composer left AIBoard's `showPanel` stuck
  // true, so its open-change effect never fired again and the panel could not
  // reopen.
  useEffect(() => {
    if (isActive) return;
    closerRef.current?.();
    setSelectedId(null);
    setPanelOpen(false);
  }, [isActive, setSelectedId, setPanelOpen]);

  // Mouse selection (or any external selection change) drags the highlight
  // ring along, so closing the panel leaves it where the user last was.
  useEffect(() => {
    if (selectedId && selectedId !== highlightedIdRef.current) {
      setHighlightedId(selectedId);
    }
  }, [selectedId, setHighlightedId]);

  // Open the new-mission panel when the in-scope board is empty (and the user
  // isn't searching). Fires once per scope via the key ref, and only for the
  // board ON SCREEN — an off-screen empty team board would otherwise pop its
  // agent picker over whatever the user is actually looking at.
  const autoOpenKeyRef = useRef<string | null>(null);
  useEffect(() => {
    if (!isActive) return;
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
    isActive,
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
