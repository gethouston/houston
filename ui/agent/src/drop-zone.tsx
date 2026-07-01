/**
 * Drop zone hooks for drag-and-drop.
 * Container handles ALL drops. Folders only provide visual highlight state.
 */
import { useCallback, useRef, useState } from "react";

/** MIME type used for internal file moves. */
export const INTERNAL_DRAG_TYPE = "application/x-houston-file";

function hasDragData(e: React.DragEvent) {
  return (
    e.dataTransfer.types.includes("Files") ||
    e.dataTransfer.types.includes(INTERNAL_DRAG_TYPE)
  );
}

/** Container-level drop zone. Handles ALL drop events (both external and internal). */
export function useDropZone(
  onFilesDropped?: (files: File[], targetFolder?: string) => void,
  onMove?: (sourcePath: string, targetFolder: string | null) => void,
) {
  const [isDragging, setIsDragging] = useState(false);
  const counter = useRef(0);

  const onDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    counter.current++;
    if (hasDragData(e)) setIsDragging(true);
  }, []);

  const onDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    counter.current--;
    if (counter.current === 0) setIsDragging(false);
  }, []);

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
  }, []);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      counter.current = 0;
      setIsDragging(false);
      const internal = e.dataTransfer.getData(INTERNAL_DRAG_TYPE);
      if (internal && onMove) {
        onMove(internal, null);
        return;
      }
      if (!onFilesDropped) return;
      const files = Array.from(e.dataTransfer.files);
      if (files.length > 0) onFilesDropped(files);
    },
    [onFilesDropped, onMove],
  );

  return {
    isDragging,
    dragHandlers: { onDragEnter, onDragLeave, onDragOver, onDrop },
  };
}

/** Folder-level highlight only — does NOT handle the drop (container does). */
export function useFolderDropTarget() {
  const [isOver, setIsOver] = useState(false);
  const counter = useRef(0);

  const onDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    counter.current++;
    if (hasDragData(e)) setIsOver(true);
  }, []);

  const onDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    counter.current--;
    if (counter.current === 0) setIsOver(false);
  }, []);

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
  }, []);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    // Do NOT stopPropagation — let container handle the actual drop
    counter.current = 0;
    setIsOver(false);
  }, []);

  return {
    isOver,
    folderHandlers: { onDragEnter, onDragLeave, onDragOver, onDrop },
  };
}
