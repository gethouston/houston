import { useCallback, useMemo, useState } from "react";
import type { FileEntry } from "./types";

export function useFilesSelection(files: FileEntry[]) {
  const [rawSelected, setRawSelected] = useState<ReadonlySet<string>>(
    () => new Set(),
  );

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

  const clearSelection = useCallback(() => {
    setRawSelected((prev) => (prev.size === 0 ? prev : new Set()));
  }, []);

  return {
    selectedPaths,
    selectedFiles,
    toggleSelected,
    toggleAllSelected,
    clearSelection,
  };
}
