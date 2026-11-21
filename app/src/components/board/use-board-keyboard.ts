import type { KanbanColumnConfig, KanbanItem } from "@houston-ai/board";
import { useCallback, useEffect, useRef } from "react";
import { navigateBoard } from "../../lib/board-navigate";
import { useUIStore } from "../../stores/ui";

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
  isActive: boolean;
  items: KanbanItem[];
  columns: KanbanColumnConfig[];
  selectedId: string | null;
  setSelectedId: (id: string | null) => void;
  highlightedId: string | null;
  setHighlightedId: (id: string | null) => void;
  missionPanelOpen: boolean;
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

  useEffect(() => {
    if (isActive) return;
    closerRef.current?.();
    setSelectedId(null);
    setPanelOpen(false);
  }, [isActive, setSelectedId, setPanelOpen]);

  useEffect(() => {
    if (selectedId && selectedId !== highlightedIdRef.current) {
      setHighlightedId(selectedId);
    }
  }, [selectedId, setHighlightedId]);

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
