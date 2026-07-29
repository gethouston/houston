/**
 * Where a Files drop lands. Folder chips and rows report their hover through
 * `onDragActive` ("" = the breadcrumb root, null = nothing hovered); a direct
 * hit on one of them always wins. With nothing hovered the drop falls back to
 * what the current VIEW is showing: the open folder in the grid (you are
 * looking at it) and the workspace root in the list (it is rooted there and has
 * no trail to say otherwise).
 *
 * The hovered target is kept in a ref as well as state: `useDropZone` reads it
 * synchronously at drop time, while the state copy is what re-renders the
 * background tint.
 */
import { useCallback, useRef, useState } from "react";
import { useDropZone } from "./drop-zone";
import type { FilesViewMode } from "./types";

export function useFilesDropTarget(opts: {
  view: FilesViewMode;
  /** The grid's open folder, "" at the workspace root. */
  resolvedPath: string;
  onFilesDropped?: (files: File[], targetFolder?: string) => void;
  /** Surfaces dropped-folder expansion failures (see DropZoneOptions). */
  onDropError?: (error: unknown) => void;
  onMove?: (sourcePath: string, targetFolder: string | null) => void;
}) {
  const { view, resolvedPath, onFilesDropped, onDropError, onMove } = opts;
  const folderTargetRef = useRef<string | null>(null);
  const [, setFolderDropTarget] = useState<string | null>(null);

  const onDragActive = useCallback((folder: string | null) => {
    setFolderDropTarget(folder);
    folderTargetRef.current = folder;
  }, []);

  const resolveDropTarget = useCallback((): string | null => {
    const hovered = folderTargetRef.current;
    if (hovered === "") return null;
    if (hovered != null) return hovered;
    return view === "grid" && resolvedPath ? resolvedPath : null;
  }, [view, resolvedPath]);

  const handleMove = useCallback(
    (src: string) => onMove?.(src, resolveDropTarget()),
    [onMove, resolveDropTarget],
  );

  const { isDragging, dragHandlers } = useDropZone({
    onFilesDropped,
    onDropError,
    onMove: handleMove,
    resolveTargetFolder: () => resolveDropTarget() ?? undefined,
  });

  return {
    onDragActive,
    dragHandlers,
    /** A drag is in flight with no folder under the cursor: tint the canvas. */
    isBgDropTarget: isDragging && folderTargetRef.current === null,
  };
}
