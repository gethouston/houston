/**
 * State/behavior hook backing FilesBrowser: view mode, the list's multi-file
 * selection, sort, the name search, per-folder navigation and drag-and-drop
 * targeting shared by both views.
 */
import { useCallback, useMemo, useState } from "react";
import { filterFolder } from "./filter";
import { folderAtPath, resolveExistingPath } from "./grid-utils";
import { buildTree } from "./tree";
import type { FileEntry, FilesViewMode } from "./types";
import { useFilesDropTarget } from "./use-files-drop-target";
import { useFilesSelection } from "./use-files-selection";
import { type SortDirection, type SortKey, sortTree } from "./utils";

export function useFilesBrowser(opts: {
  files: FileEntry[];
  loading?: boolean;
  controlledView?: FilesViewMode;
  onViewChange?: (view: FilesViewMode) => void;
  onCreateFolder?: (name: string) => void;
  onFilesDropped?: (files: File[], targetFolder?: string) => void;
  /** Surfaces dropped-folder expansion failures (see DropZoneOptions). */
  onDropError?: (error: unknown) => void;
  onMove?: (sourcePath: string, targetFolder: string | null) => void;
  /** Open a file picker for the given folder (undefined = workspace root). */
  onUpload?: (targetFolder?: string) => void;
  /** Same, for a whole-folder pick. */
  onUploadFolder?: (targetFolder?: string) => void;
}) {
  const [internalView, setInternalView] = useState<FilesViewMode>("grid");
  const view = opts.controlledView ?? internalView;
  const {
    onViewChange,
    onCreateFolder,
    onFilesDropped,
    onDropError,
    onMove,
    onUpload,
    onUploadFolder,
  } = opts;
  const changeView = useCallback(
    (v: FilesViewMode) => {
      setInternalView(v);
      onViewChange?.(v);
    },
    [onViewChange],
  );

  // The list's multi-file selection, derived against the listing (see the
  // module for why that is not an effect).
  const {
    selectedPaths,
    selectedFiles,
    toggleSelected,
    toggleAllSelected,
    clearSelection,
  } = useFilesSelection(opts.files);

  const [currentPath, setCurrentPath] = useState("");
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [bgMenu, setBgMenu] = useState<{ x: number; y: number } | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<SortDirection>("asc");
  const [query, setQuery] = useState("");

  const isEmpty = !opts.loading && opts.files.length === 0;
  const tree = useMemo(() => {
    if (isEmpty) return null;
    return sortTree(buildTree(opts.files), sortKey, sortDir);
  }, [opts.files, isEmpty, sortKey, sortDir]);
  // Survive the current folder being deleted/renamed under us.
  const resolvedPath = tree ? resolveExistingPath(tree, currentPath) : "";
  const currentFolder = tree ? folderAtPath(tree, resolvedPath) : null;

  // The two views browse differently, so they render different roots. The GRID
  // walks folder by folder and renders the open one; the LIST renders the whole
  // workspace and browses it by expanding rows inline, which is the only way
  // around it now that the trail is grid-only. Both are pruned by the search
  // query, so a list search reaches the entire tree while a grid search stays
  // inside the folder you are looking at.
  const scopedFolder = view === "grid" ? currentFolder : tree;
  const visibleFolder = useMemo(
    () => (scopedFolder ? filterFolder(scopedFolder, query) : null),
    [scopedFolder, query],
  );

  // The query SURVIVES navigation: a folder kept by a descendant match is only
  // worth opening if the search follows you in, and the field keeps its text
  // so the way back to everything is still one click away.
  const navigate = useCallback(
    (path: string) => {
      setCurrentPath(path);
      clearSelection();
      setCreatingFolder(false);
    },
    [clearSelection],
  );

  const { onDragActive, dragHandlers, isBgDropTarget } = useFilesDropTarget({
    view,
    resolvedPath,
    onFilesDropped,
    onDropError,
    onMove,
  });

  const handleSort = useCallback((key: SortKey) => {
    setSortKey((prev) => {
      if (prev === key) {
        setSortDir((d) => (d === "asc" ? "desc" : "asc"));
        return prev;
      }
      setSortDir("asc");
      return key;
    });
  }, []);

  // A click on the canvas both drops the selection and (on right-click) opens
  // the background menu: clicking away from everything is how you say "never
  // mind" to a half-built selection.
  const handleBackgroundInteraction = useCallback(
    (menuPosition?: { x: number; y: number }) => {
      clearSelection();
      setBgMenu(menuPosition && onCreateFolder ? menuPosition : null);
    },
    [clearSelection, onCreateFolder],
  );

  // Every entry point into create-folder mode goes through here: it drops the
  // search first, so the new card/row is never hidden behind a filter that
  // cannot match a folder which does not exist yet.
  const startCreatingFolder = useCallback(() => {
    setQuery("");
    setCreatingFolder(true);
  }, []);

  // New folders land where that view creates them: inside the open folder in
  // the grid, at the workspace root in the list, which is the level its inline
  // new-folder row sits on.
  const createFolderAt = useCallback(
    (name: string) => {
      onCreateFolder?.(
        view === "grid" && resolvedPath ? `${resolvedPath}/${name}` : name,
      );
      setCreatingFolder(false);
    },
    [onCreateFolder, view, resolvedPath],
  );

  // Button-initiated uploads land where the user is looking, like drops do.
  // Both take no argument on purpose: they are wired straight to click and
  // menu-select handlers, whose event must never reach the folder argument.
  const folderArg = view === "grid" ? resolvedPath || undefined : undefined;
  const uploadHere = useCallback(
    () => onUpload?.(folderArg),
    [onUpload, folderArg],
  );
  const uploadFolderHere = useCallback(
    () => onUploadFolder?.(folderArg),
    [onUploadFolder, folderArg],
  );

  return {
    view,
    changeView,
    selectedPaths,
    selectedFiles,
    toggleSelected,
    toggleAllSelected,
    clearSelection,
    creatingFolder,
    setCreatingFolder,
    startCreatingFolder,
    bgMenu,
    setBgMenu,
    sortKey,
    sortDir,
    handleSort,
    query,
    setQuery,
    isEmpty,
    /** Search-filtered root of the current view: the open folder in the grid,
     *  the whole workspace in the list. */
    visibleFolder,
    resolvedPath,
    navigate,
    onDragActive,
    dragHandlers,
    isBgDropTarget,
    handleBackgroundInteraction,
    createFolderAt,
    /** Undefined when the consumer passed no upload handler. */
    uploadHere: onUpload ? uploadHere : undefined,
    uploadFolderHere: onUploadFolder ? uploadFolderHere : undefined,
  };
}
