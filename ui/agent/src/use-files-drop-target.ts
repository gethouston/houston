/** Resolves all list drops inside one filesystem boundary. */
import { useCallback, useRef, useState } from "react";
import { useDropZone } from "./drop-zone";

export function useFilesDropTarget(opts: {
  dragScope?: string;
  onFilesDropped?: (files: File[], targetFolder?: string) => void;
  onDropError?: (error: unknown) => void;
  onMove?: (sourcePath: string, targetFolder: string | null) => void;
}) {
  const targetRef = useRef<string | null>(null);
  const [, setTarget] = useState<string | null>(null);
  const onDragActive = useCallback((folder: string | null) => {
    targetRef.current = folder;
    setTarget(folder);
  }, []);
  const resolveTarget = useCallback(
    () => (targetRef.current === "" ? null : targetRef.current),
    [],
  );
  const { isDragging, dragHandlers } = useDropZone({
    dragScope: opts.dragScope,
    onFilesDropped: opts.onFilesDropped,
    onDropError: opts.onDropError,
    onMove: (source) => opts.onMove?.(source, resolveTarget()),
    resolveTargetFolder: () => resolveTarget() ?? undefined,
  });

  return {
    onDragActive,
    dragHandlers,
    isBgDropTarget: isDragging && targetRef.current === null,
  };
}
