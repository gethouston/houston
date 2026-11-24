import {
  collectDroppedItems,
  resolveDroppedFiles,
  visibleAttachmentFiles,
} from "@houston-ai/core";
import { useCallback, useRef, useState } from "react";
import {
  dragAllowsScope,
  INTERNAL_DRAG_TYPE,
  parseInternalDragPayload,
  resolveInternalMoveTarget,
} from "./internal-file-drag";

export { INTERNAL_DRAG_TYPE } from "./internal-file-drag";

function hasDragData(e: React.DragEvent) {
  return (
    e.dataTransfer.types.includes("Files") ||
    e.dataTransfer.types.includes(INTERNAL_DRAG_TYPE)
  );
}

export interface DropZoneOptions {
  dragScope?: string;
  onFilesDropped?: (files: File[], targetFolder?: string) => void;
  onMove?: (sourcePath: string, targetFolder: string | null) => void;
  resolveTargetFolder?: () => string | undefined;
  onDropError?: (error: unknown) => void;
}

/** Container-level drop zone. Handles ALL drop events (both external and
 *  internal). Dropped folders are walked recursively; each produced File
 *  carries its folder-relative path (`webkitRelativePath`), hidden entries
 *  skipped — same behavior as the chat composer. */
export function useDropZone({
  onFilesDropped,
  onMove,
  resolveTargetFolder,
  onDropError,
  dragScope,
}: DropZoneOptions) {
  const [isDragging, setIsDragging] = useState(false);
  const counter = useRef(0);

  const onDragEnter = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      counter.current++;
      if (
        hasDragData(e) &&
        dragAllowsScope(Array.from(e.dataTransfer.types), dragScope)
      )
        setIsDragging(true);
    },
    [dragScope],
  );

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
        let payload: { path: string; scope?: string };
        try {
          payload = parseInternalDragPayload(internal);
        } catch (error) {
          onDropError?.(error);
          return;
        }
        if (payload.scope !== dragScope) {
          onDropError?.(new Error("Files cannot move between agents"));
          return;
        }
        onMove(payload.path, resolveInternalMoveTarget(resolveTargetFolder));
        return;
      }
      if (!onFilesDropped) return;
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
    [dragScope, onFilesDropped, onMove, resolveTargetFolder, onDropError],
  );

  return {
    isDragging,
    dragHandlers: { onDragEnter, onDragLeave, onDragOver, onDrop },
  };
}

/** Folder-level highlight only — does NOT handle the drop (container does). */
export function useFolderDropTarget(dragScope?: string) {
  const [isOver, setIsOver] = useState(false);
  const counter = useRef(0);

  const onDragEnter = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      counter.current++;
      if (
        hasDragData(e) &&
        dragAllowsScope(Array.from(e.dataTransfer.types), dragScope)
      )
        setIsOver(true);
    },
    [dragScope],
  );

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
    counter.current = 0;
    setIsOver(false);
  }, []);

  return {
    isOver,
    folderHandlers: { onDragEnter, onDragLeave, onDragOver, onDrop },
  };
}
