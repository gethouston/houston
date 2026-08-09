/** State and behavior for the list-only Files browser. */
import { useCallback, useEffect, useMemo, useState } from "react";
import { filterFolder } from "./filter";
import { buildTree } from "./tree";
import type { FileEntry } from "./types";
import { useFilesDropTarget } from "./use-files-drop-target";
import { useFilesSelection } from "./use-files-selection";
import { type SortDirection, type SortKey, sortTree } from "./utils";

export function useFilesBrowser(opts: {
  files: FileEntry[];
  loading?: boolean;
  query?: string;
  onQueryChange?: (query: string) => void;
  sortKey?: SortKey;
  sortDir?: SortDirection;
  onCreateFolder?: (name: string) => void;
  onFilesDropped?: (files: File[], targetFolder?: string) => void;
  onDropError?: (error: unknown) => void;
  onMove?: (sourcePath: string, targetFolder: string | null) => void;
  onUpload?: (targetFolder?: string) => void;
  onUploadFolder?: (targetFolder?: string) => void;
  dragScope?: string;
  createFolderRequest?: number;
}) {
  const [internalQuery, setInternalQuery] = useState("");
  const [internalSortKey, setInternalSortKey] = useState<SortKey>("name");
  const [internalSortDir, setInternalSortDir] = useState<SortDirection>("asc");
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [bgMenu, setBgMenu] = useState<{ x: number; y: number } | null>(null);
  const query = opts.query ?? internalQuery;
  const setQuery = opts.onQueryChange ?? setInternalQuery;
  const sortKey = opts.sortKey ?? internalSortKey;
  const sortDir = opts.sortDir ?? internalSortDir;
  const selection = useFilesSelection(opts.files);
  const visibleFolder = useMemo(() => {
    if (opts.loading) return null;
    return filterFolder(
      sortTree(buildTree(opts.files), sortKey, sortDir),
      query,
    );
  }, [opts.files, opts.loading, query, sortDir, sortKey]);
  const drop = useFilesDropTarget({
    dragScope: opts.dragScope,
    onFilesDropped: opts.onFilesDropped,
    onDropError: opts.onDropError,
    onMove: opts.onMove,
  });
  const handleSort = useCallback((key: SortKey) => {
    setInternalSortKey((previous) => {
      if (previous === key) {
        setInternalSortDir((direction) =>
          direction === "asc" ? "desc" : "asc",
        );
        return previous;
      }
      setInternalSortDir("asc");
      return key;
    });
  }, []);
  const startCreatingFolder = useCallback(() => {
    setQuery("");
    setCreatingFolder(true);
  }, [setQuery]);
  useEffect(() => {
    if (opts.createFolderRequest) startCreatingFolder();
  }, [opts.createFolderRequest, startCreatingFolder]);
  const createFolderAt = useCallback(
    (name: string) => {
      opts.onCreateFolder?.(name);
      setCreatingFolder(false);
    },
    [opts.onCreateFolder],
  );

  return {
    ...selection,
    ...drop,
    query,
    setQuery,
    sortKey,
    sortDir,
    handleSort,
    visibleFolder,
    creatingFolder,
    setCreatingFolder,
    startCreatingFolder,
    createFolderAt,
    bgMenu,
    setBgMenu,
    handleBackgroundInteraction(position?: { x: number; y: number }) {
      selection.clearSelection();
      setBgMenu(position && opts.onCreateFolder ? position : null);
    },
    uploadHere: opts.onUpload ? () => opts.onUpload?.() : undefined,
    uploadFolderHere: opts.onUploadFolder
      ? () => opts.onUploadFolder?.()
      : undefined,
  };
}
