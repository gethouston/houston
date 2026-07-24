/**
 * Drop zone hooks for drag-and-drop.
 * Container handles ALL drops. Folders only provide visual highlight state.
 */
import {
  collectDroppedItems,
  resolveDroppedFiles,
  visibleAttachmentFiles,
} from "@houston-ai/core";
import { useCallback, useRef, useState } from "react";

/** MIME type used for internal file moves. */
export const INTERNAL_DRAG_TYPE = "application/x-houston-file";

function hasDragData(e: React.DragEvent) {
  return (
    e.dataTransfer.types.includes("Files") ||
    e.dataTransfer.types.includes(INTERNAL_DRAG_TYPE)
  );
}

export interface DropZoneOptions {
  onFilesDropped?: (files: File[], targetFolder?: string) => void;
  onMove?: (sourcePath: string, targetFolder: string | null) => void;
  /** Snapshot the hovered drop target SYNCHRONOUSLY at drop time — folder
   *  expansion is async, so reading it later could see a newer drag. */
  resolveTargetFolder?: () => string | undefined;
  /** Folder expansion failures (unreadable entries, too many files). REQUIRED
   *  for surfacing when onFilesDropped is set — the async walk has no caller
   *  to throw to, and swallowing the error would drop the upload silently. */
  onDropError?: (error: unknown) => void;
}

/** Container-level drop zone. Handles ALL drop events (both external and
 *  internal). Dropped folders are walked recursively; each produced File
 *  carries its folder-relative path (`webkitRelativePath`), hidden entries
 *  skipped — same behavior as the chat composer (HOU-808). */
export function useDropZone({
  onFilesDropped,
  onMove,
  resolveTargetFolder,
  onDropError,
}: DropZoneOptions) {
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
      // Both the DataTransfer entries and the hovered folder must be captured
      // before the first await: the DataTransfer is neutered when the handler
      // returns, and the drop target belongs to THIS drag.
      const items = collectDroppedItems(e.dataTransfer);
      const targetFolder = resolveTargetFolder?.();
      void resolveDroppedFiles(items)
        .then((files) => {
          const visible = visibleAttachmentFiles(files);
          if (visible.length > 0) onFilesDropped(visible, targetFolder);
        })
        .catch((error: unknown) => {
          if (!onDropError) throw error;
          onDropError(error);
        });
    },
    [onFilesDropped, onMove, resolveTargetFolder, onDropError],
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
