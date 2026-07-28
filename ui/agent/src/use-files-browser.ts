/**
 * State/behavior hook backing FilesBrowser: view mode, selection, sort, the
 * name search, per-folder navigation and drag-and-drop targeting shared by
 * both views.
 */
import { useCallback, useMemo, useRef, useState } from "react";
import { useDropZone } from "./drop-zone";
import { filterFolder } from "./filter";
import { folderAtPath, resolveExistingPath } from "./grid-utils";
import { buildTree } from "./tree";
import type { FileEntry, FilesViewMode } from "./types";
import { type SortDirection, type SortKey, sortTree } from "./utils";

export function useFilesBrowser(opts: {
  files: FileEntry[];
  loading?: boolean;
  controlledView?: FilesViewMode;
  onViewChange?: (view: FilesViewMode) => void;
  controlledSelected?: string | null;
  onSelect?: (file: FileEntry) => void;
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
    onSelect,
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

  const [internalSelected, setInternalSelected] = useState<string | null>(null);
  const selectedPath =
    opts.controlledSelected !== undefined
      ? opts.controlledSelected
      : internalSelected;
  const handleSelect = useCallback(
    (file: FileEntry) => {
      setInternalSelected(file.path);
      onSelect?.(file);
    },
    [onSelect],
  );

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

  // What the two views actually render: the open folder (grid) and its whole
  // subtree (list), both pruned by the search query.
  const visibleFolder = useMemo(
    () => (currentFolder ? filterFolder(currentFolder, query) : null),
    [currentFolder, query],
  );

  // The query SURVIVES navigation: a folder kept by a descendant match is only
  // worth opening if the search follows you in, and the field keeps its text
  // so the way back to everything is still one click away.
  const navigate = useCallback((path: string) => {
    setCurrentPath(path);
    setInternalSelected(null);
    setCreatingFolder(false);
  }, []);

  // Drop targeting: hovered folder ("" = breadcrumb root, null = none).
  // With nothing hovered, drops land in the open folder — both views are
  // scoped to it.
  const folderTargetRef = useRef<string | null>(null);
  const [, setFolderDropTarget] = useState<string | null>(null);
  const onDragActive = useCallback((f: string | null) => {
    setFolderDropTarget(f);
    folderTargetRef.current = f;
  }, []);
  const resolveDropTarget = useCallback((): string | null => {
    const hovered = folderTargetRef.current;
    if (hovered === "") return null;
    if (hovered != null) return hovered;
    return resolvedPath || null;
  }, [resolvedPath]);
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
  const isBgDropTarget = isDragging && folderTargetRef.current === null;

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

  const handleBackgroundInteraction = useCallback(
    (menuPosition?: { x: number; y: number }) => {
      setInternalSelected(null);
      setBgMenu(menuPosition && onCreateFolder ? menuPosition : null);
    },
    [onCreateFolder],
  );

  // Every entry point into create-folder mode goes through here: it drops the
  // search first, so the new card/row is never hidden behind a filter that
  // cannot match a folder which does not exist yet.
  const startCreatingFolder = useCallback(() => {
    setQuery("");
    setCreatingFolder(true);
  }, []);

  const createFolderAt = useCallback(
    (name: string) => {
      onCreateFolder?.(resolvedPath ? `${resolvedPath}/${name}` : name);
      setCreatingFolder(false);
    },
    [onCreateFolder, resolvedPath],
  );

  // Button-initiated uploads land where the user is looking, like drops do.
  // Both take no argument on purpose: they are wired straight to click and
  // menu-select handlers, whose event must never reach the folder argument.
  const folderArg = resolvedPath || undefined;
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
    selectedPath,
    handleSelect,
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
    /** The open folder, search-filtered — what both views render. */
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
