/**
 * State/behavior hook backing FilesBrowser: view mode, selection, sort,
 * per-folder navigation and drag-and-drop targeting shared by both views.
 */
import { useCallback, useMemo, useRef, useState } from "react";
import { useDropZone } from "./drop-zone";
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
  onMove?: (sourcePath: string, targetFolder: string | null) => void;
}) {
  const [internalView, setInternalView] = useState<FilesViewMode>("grid");
  const view = opts.controlledView ?? internalView;
  const { onViewChange, onSelect, onCreateFolder, onFilesDropped, onMove } =
    opts;
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

  const isEmpty = !opts.loading && opts.files.length === 0;
  const tree = useMemo(() => {
    if (isEmpty) return null;
    return sortTree(buildTree(opts.files), sortKey, sortDir);
  }, [opts.files, isEmpty, sortKey, sortDir]);
  // Survive the current folder being deleted/renamed under us.
  const resolvedPath = tree ? resolveExistingPath(tree, currentPath) : "";
  const currentFolder = tree ? folderAtPath(tree, resolvedPath) : null;

  const navigate = useCallback((path: string) => {
    setCurrentPath(path);
    setInternalSelected(null);
    setCreatingFolder(false);
  }, []);

  // Drop targeting: hovered folder ("" = breadcrumb root, null = none).
  // With nothing hovered, grid drops land in the open folder, list drops at root.
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
    return view === "grid" && resolvedPath ? resolvedPath : null;
  }, [view, resolvedPath]);
  const handleDrop = useCallback(
    (dropped: File[]) => {
      onFilesDropped?.(dropped, resolveDropTarget() ?? undefined);
    },
    [onFilesDropped, resolveDropTarget],
  );
  const handleMove = useCallback(
    (src: string) => onMove?.(src, resolveDropTarget()),
    [onMove, resolveDropTarget],
  );
  const { isDragging, dragHandlers } = useDropZone(handleDrop, handleMove);
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

  const createFolderAt = useCallback(
    (name: string) => {
      onCreateFolder?.(
        view === "grid" && resolvedPath ? `${resolvedPath}/${name}` : name,
      );
      setCreatingFolder(false);
    },
    [onCreateFolder, view, resolvedPath],
  );

  return {
    view,
    changeView,
    selectedPath,
    handleSelect,
    creatingFolder,
    setCreatingFolder,
    bgMenu,
    setBgMenu,
    sortKey,
    sortDir,
    handleSort,
    isEmpty,
    tree,
    resolvedPath,
    currentFolder,
    navigate,
    onDragActive,
    dragHandlers,
    isBgDropTarget,
    handleBackgroundInteraction,
    createFolderAt,
  };
}
