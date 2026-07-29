/**
 * The list view's multi-file selection state. Kept apart from the browser's
 * navigation/sort/search state because it obeys a different rule: it is never
 * SYNCED to the listing, it is DERIVED against it on every render.
 *
 * That is load-bearing. When the app deletes the checked files and the query
 * refetches, the deleted paths fall out of the selection by themselves — no
 * effect, no race, no stale check on a file that is gone. A CANCELLED confirm
 * changes nothing, so every check stays exactly where the user put it.
 */
import { useCallback, useMemo, useState } from "react";
import type { FileEntry } from "./types";

export function useFilesSelection(files: FileEntry[]) {
  // The RAW checked paths. Never read directly — `selectedPaths` is the truth.
  const [rawSelected, setRawSelected] = useState<ReadonlySet<string>>(
    () => new Set(),
  );

  // Folders are not selectable: deleting one is a heavier act with its own
  // confirm, and it is not part of this selection model.
  const selectablePaths = useMemo(() => {
    const paths = new Set<string>();
    for (const file of files) if (!file.is_directory) paths.add(file.path);
    return paths;
  }, [files]);

  const selectedPaths = useMemo<ReadonlySet<string>>(() => {
    const paths = new Set<string>();
    for (const path of rawSelected) {
      if (selectablePaths.has(path)) paths.add(path);
    }
    return paths;
  }, [rawSelected, selectablePaths]);

  const selectedFiles = useMemo(
    () => files.filter((file) => selectedPaths.has(file.path)),
    [files, selectedPaths],
  );

  const toggleSelected = useCallback((path: string) => {
    setRawSelected((prev) => {
      const next = new Set(prev);
      if (!next.delete(path)) next.add(path);
      return next;
    });
  }, []);

  /** All on → all off; anything else → all on. */
  const toggleAllSelected = useCallback((paths: string[]) => {
    setRawSelected((prev) => {
      const next = new Set(prev);
      const allOn = paths.length > 0 && paths.every((p) => next.has(p));
      for (const path of paths) {
        if (allOn) next.delete(path);
        else next.add(path);
      }
      return next;
    });
  }, []);

  // Bail out when there is nothing to clear, so a background click on an
  // unselected listing is not a re-render.
  const clearSelection = useCallback(() => {
    setRawSelected((prev) => (prev.size === 0 ? prev : new Set()));
  }, []);

  return {
    /** Checked file paths, already reconciled against the current listing. */
    selectedPaths,
    /** The entries behind `selectedPaths`, for a bulk handler to act on. */
    selectedFiles,
    toggleSelected,
    toggleAllSelected,
    clearSelection,
  };
}
