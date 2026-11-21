import { collectDroppedItems, resolveDroppedFiles } from "@houston-ai/core";
import type { DragEvent, DragEventHandler } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { fileIdentityKey } from "./clipboard-files";

export function mergeUniqueFiles(existing: File[], incoming: File[]): File[] {
  const seen = new Set(existing.map(fileIdentityKey));
  const merged = [...existing];
  for (const file of incoming) {
    const k = fileIdentityKey(file);
    if (seen.has(k)) continue;
    seen.add(k);
    merged.push(file);
  }
  return merged;
}

export function useControllable<T>(
  controlledValue: T | undefined,
  controlledSetter: ((value: T) => void) | undefined,
  defaultValue: T,
): [T, (value: T) => void] {
  const isControlled = controlledValue !== undefined;
  const [internal, setInternal] = useState<T>(defaultValue);
  const value = isControlled ? (controlledValue as T) : internal;
  const setValue = useCallback(
    (next: T) => {
      if (isControlled) controlledSetter?.(next);
      else setInternal(next);
    },
    [isControlled, controlledSetter],
  );
  return [value, setValue];
}

export interface FileDropZoneProps {
  onDragEnter: DragEventHandler;
  onDragOver: DragEventHandler;
  onDragLeave: DragEventHandler;
  onDrop: DragEventHandler;
}

export interface FileDropZone {
  isDraggingOver: boolean;
  dropProps: FileDropZoneProps;
  reset: () => void;
}

export function useFileDropZone(
  onFiles: (files: File[]) => void,
  onDropError?: (error: unknown) => void,
): FileDropZone {
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const dragDepthRef = useRef(0);
  const onFilesRef = useRef(onFiles);
  const onDropErrorRef = useRef(onDropError);
  useEffect(() => {
    onFilesRef.current = onFiles;
    onDropErrorRef.current = onDropError;
  });

  const hasFiles = useCallback(
    (e: DragEvent) => e.dataTransfer.types.includes("Files"),
    [],
  );

  const onDragEnter = useCallback(
    (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      dragDepthRef.current += 1;
      setIsDraggingOver(true);
    },
    [hasFiles],
  );

  const onDragOver = useCallback(
    (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
    },
    [hasFiles],
  );

  const onDragLeave = useCallback(
    (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
      if (dragDepthRef.current === 0) setIsDraggingOver(false);
    },
    [hasFiles],
  );

  const onDrop = useCallback(
    (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      dragDepthRef.current = 0;
      setIsDraggingOver(false);
      const dropped = collectDroppedItems(e.dataTransfer);
      if (dropped.length === 0) return;
      const deliver = onFilesRef.current;
      const handler = onDropErrorRef.current;
      resolveDroppedFiles(dropped).then(
        (files) => {
          if (files.length > 0) deliver(files);
        },
        (error) => {
          if (!handler) throw error;
          handler(error);
        },
      );
    },
    [hasFiles],
  );

  const reset = useCallback(() => {
    dragDepthRef.current = 0;
    setIsDraggingOver(false);
  }, []);

  return {
    isDraggingOver,
    dropProps: { onDragEnter, onDragOver, onDragLeave, onDrop },
    reset,
  };
}
