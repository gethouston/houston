/**
 * Internal hooks for ChatInput. Not exported from the package index.
 *
 * - useFileDropZone: drop-target handlers + drag-over state for a region.
 * - useControllable: controlled-or-internal value, the React-aria pattern.
 * - mergeUniqueFiles: append-and-dedupe helper for File[] state.
 */

import { collectDroppedItems, resolveDroppedFiles } from "@houston-ai/core";
import type { DragEvent, DragEventHandler } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { fileIdentityKey } from "./clipboard-files";

/**
 * Append `incoming` to `existing`, skipping files already present. Two files
 * are considered the same when name, size, and lastModified all match — the
 * standard identity triple for user-attached File objects.
 */
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

/**
 * Returns `[value, setValue]` that proxies to a controlled prop pair when
 * provided, otherwise falls back to internal state. Mirrors shadcn /
 * react-aria's "controllable" pattern.
 */
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
}

export function useFileDropZone(
  onFiles: (files: File[]) => void,
  /** Called when expanding a dropped folder fails (unreadable directory,
   *  too many files). Omitting it lets the rejection surface as an unhandled
   *  rejection — never swallowed. */
  onDropError?: (error: unknown) => void,
): FileDropZone {
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const dragDepthRef = useRef(0);
  // Folder expansion is async: by the time it resolves, the attachment state
  // may have moved on (another drop, a remove, a send). Deliver through a ref
  // so the LATEST ingest callback runs — never a stale closure that would
  // overwrite newer state.
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
      // Capture entries/files SYNCHRONOUSLY — the DataTransfer is neutered
      // once this handler returns. Expanding folders is async (directory
      // reads), so the ingest is deferred to the resolved promise.
      const dropped = collectDroppedItems(e.dataTransfer);
      if (dropped.length === 0) return;
      resolveDroppedFiles(dropped).then(
        (files) => {
          if (files.length > 0) onFilesRef.current(files);
        },
        (error) => {
          const handler = onDropErrorRef.current;
          if (!handler) throw error;
          handler(error);
        },
      );
    },
    [hasFiles],
  );

  return {
    isDraggingOver,
    dropProps: { onDragEnter, onDragOver, onDragLeave, onDrop },
  };
}
