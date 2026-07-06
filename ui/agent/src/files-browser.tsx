/**
 * FilesBrowser — macOS Finder list-view clone.
 * Column headers with sort, file/folder tree, status bar, drag-and-drop.
 */

import { Button, cn } from "@houston-ai/core";
import { Upload } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useDropZone } from "./drop-zone";
import type { FileMenuLabels } from "./file-menu";
import { COL_GRID, FileRow, FolderSection } from "./file-row";
import { NewFolderInput } from "./new-folder-input";
import { buildTree } from "./tree";
import type { FileEntry } from "./types";
import { type SortDirection, type SortKey, sortTree } from "./utils";

export interface FilesBrowserLabels {
  columnName?: string;
  columnDateModified?: string;
  columnDateCreated?: string;
  columnSize?: string;
  columnKind?: string;
  loading?: string;
  browseFiles?: string;
}

const DEFAULT_LABELS: Required<FilesBrowserLabels> = {
  columnName: "Name",
  columnDateModified: "Date Modified",
  columnDateCreated: "Date Created",
  columnSize: "Size",
  columnKind: "Kind",
  loading: "Loading\u2026",
  browseFiles: "Browse files",
};

export interface FilesBrowserProps {
  files: FileEntry[];
  loading?: boolean;
  selectedPath?: string | null;
  onSelect?: (file: FileEntry) => void;
  onOpen?: (file: FileEntry) => void;
  onReveal?: (file: FileEntry) => void;
  /** Save the file to the user's machine (browser builds; desktop uses onOpen/onReveal). */
  onDownload?: (file: FileEntry) => void;
  /** Save a folder's subtree as a zip. Adds a context menu to folder rows. */
  onDownloadFolder?: (folder: FileEntry) => void;
  onDelete?: (file: FileEntry) => void;
  onFilesDropped?: (files: File[], targetFolder?: string) => void;
  /** Move a file/folder to a new location (null = root) */
  onMove?: (sourcePath: string, targetFolder: string | null) => void;
  onRename?: (file: FileEntry, newName: string) => void;
  onCreateFolder?: (name: string) => void;
  onBrowse?: () => void;
  emptyTitle?: string;
  emptyDescription?: string;
  /** Optional action rendered in the bottom status bar (e.g. "Open in File Manager" link) */
  statusBarAction?: React.ReactNode;
  /** Overrides for chrome labels (column headers, loading, browse CTA). */
  labels?: FilesBrowserLabels;
  /** Overrides for the right-click context-menu labels. */
  menuLabels?: FileMenuLabels;
}

export function FilesBrowser({
  files,
  loading,
  selectedPath: controlledSelected,
  onSelect,
  onOpen,
  onReveal,
  onDownload,
  onDownloadFolder,
  onDelete,
  onFilesDropped,
  onMove,
  onRename,
  onCreateFolder,
  onBrowse,
  emptyTitle = "No files yet",
  emptyDescription = "When agents create files, they\u2019ll appear here.",
  statusBarAction,
  labels,
  menuLabels,
}: FilesBrowserProps) {
  const l = { ...DEFAULT_LABELS, ...labels };
  // Internal selection state — used when consumer doesn't control selection
  const [internalSelected, setInternalSelected] = useState<string | null>(null);
  const selectedPath =
    controlledSelected !== undefined ? controlledSelected : internalSelected;
  const handleSelect = useCallback(
    (file: FileEntry) => {
      setInternalSelected(file.path);
      onSelect?.(file);
    },
    [onSelect],
  );

  const [creatingFolder, setCreatingFolder] = useState(false);
  const [bgMenu, setBgMenu] = useState<{ x: number; y: number } | null>(null);

  const [folderDropTarget, setFolderDropTarget] = useState<string | null>(null);
  const folderTargetRef = useRef<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<SortDirection>("asc");

  const onDragActive = useCallback((f: string | null) => {
    setFolderDropTarget(f);
    folderTargetRef.current = f;
  }, []);

  // Wrap callbacks so container drops target the hovered folder (or root)
  const handleDrop = useCallback(
    (files: File[]) => {
      onFilesDropped?.(files, folderTargetRef.current ?? undefined);
    },
    [onFilesDropped],
  );
  const handleMove = useCallback(
    (src: string) => {
      onMove?.(src, folderTargetRef.current);
    },
    [onMove],
  );
  const { isDragging, dragHandlers } = useDropZone(handleDrop, handleMove);

  const isEmpty = !loading && files.length === 0;
  const isRootTarget = isDragging && folderDropTarget === null;

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

  const tree = useMemo(() => {
    if (isEmpty) return null;
    return sortTree(buildTree(files), sortKey, sortDir);
  }, [files, isEmpty, sortKey, sortDir]);

  const fileCount = useMemo(() => {
    if (!tree) return 0;
    let count = 0;
    const walk = (children: typeof tree.children) => {
      for (const c of children) {
        count++;
        if (c.kind === "folder") walk(c.children);
      }
    };
    walk(tree.children);
    return count;
  }, [tree]);

  if (isEmpty) {
    return (
      <div className="flex-1 flex flex-col items-center pt-[20vh] gap-4 px-8">
        <div className="space-y-2 text-center max-w-md">
          <h1 className="text-2xl font-semibold tracking-tight">
            {emptyTitle}
          </h1>
          <p className="text-sm text-muted-foreground">{emptyDescription}</p>
        </div>
        {onBrowse && (
          <Button variant="default" size="sm" onClick={onBrowse}>
            <Upload className="size-4 mr-1.5" /> {l.browseFiles}
          </Button>
        )}
      </div>
    );
  }

  return (
    <div
      className="relative flex flex-col overflow-hidden bg-background border border-border rounded-xl h-full"
      {...(onFilesDropped || onMove ? dragHandlers : {})}
    >
      <div className="h-[24px] shrink-0 border-b border-border bg-muted/40 select-none flex items-center rounded-t-xl px-1">
        <div
          className="flex-1 min-w-0 items-center h-full"
          style={{ display: "grid", gridTemplateColumns: COL_GRID }}
        >
          <HeaderCell
            label={l.columnName}
            col="name"
            sortKey={sortKey}
            sortDir={sortDir}
            onSort={handleSort}
            className="pl-7"
          />
          <HeaderCell
            label={l.columnDateModified}
            col="dateModified"
            sortKey={sortKey}
            sortDir={sortDir}
            onSort={handleSort}
          />
          <HeaderCell
            label={l.columnDateCreated}
            col="dateCreated"
            sortKey={sortKey}
            sortDir={sortDir}
            onSort={handleSort}
          />
          <HeaderCell
            label={l.columnSize}
            col="size"
            sortKey={sortKey}
            sortDir={sortDir}
            onSort={handleSort}
          />
          <HeaderCell
            label={l.columnKind}
            col="kind"
            sortKey={sortKey}
            sortDir={sortDir}
            onSort={handleSort}
            last
          />
        </div>
      </div>

      {/* biome-ignore lint/a11y/noStaticElementInteractions: click-to-deselect and right-click-for-context-menu on the file list backdrop are pointer-only affordances; no keyboard equivalent exists for these background gestures */}
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: same rationale — background click deselection has no keyboard equivalent */}
      <div
        className="flex-1 flex flex-col overflow-y-auto px-1"
        style={{
          backgroundColor: isRootTarget ? "rgba(0,122,255,0.06)" : undefined,
        }}
        onClick={(e) => {
          if (e.target === e.currentTarget) {
            setInternalSelected(null);
            setBgMenu(null);
          }
        }}
        onContextMenu={(e) => {
          if (e.target === e.currentTarget && onCreateFolder) {
            e.preventDefault();
            setInternalSelected(null);
            setBgMenu({ x: e.clientX, y: e.clientY });
          }
        }}
      >
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <p className="text-sm text-muted-foreground/50">{l.loading}</p>
          </div>
        ) : (
          <>
            <div className="shrink-0 [&>:nth-child(even)]:bg-muted/30 [&>:nth-child(even)]:rounded-lg">
              {creatingFolder && (
                <NewFolderInput
                  onConfirm={(n) => {
                    onCreateFolder?.(n);
                    setCreatingFolder(false);
                  }}
                  onCancel={() => setCreatingFolder(false)}
                />
              )}
              {tree?.children.map((child) =>
                child.kind === "folder" ? (
                  <FolderSection
                    key={child.path}
                    node={child}
                    depth={0}
                    selectedPath={selectedPath}
                    onSelect={handleSelect}
                    onOpen={onOpen}
                    onReveal={onReveal}
                    onDownload={onDownload}
                    onDownloadFolder={onDownloadFolder}
                    onDelete={onDelete}
                    onRename={onRename}
                    onFilesDropped={onFilesDropped}
                    onDragActive={onDragActive}
                    onMove={onMove}
                    menuLabels={menuLabels}
                  />
                ) : (
                  <FileRow
                    key={child.entry.path}
                    file={child.entry}
                    selected={selectedPath === child.entry.path}
                    onSelect={handleSelect}
                    onOpen={onOpen}
                    onReveal={onReveal}
                    onDownload={onDownload}
                    onDelete={onDelete}
                    onRename={onRename}
                    onMove={onMove}
                    menuLabels={menuLabels}
                  />
                ),
              )}
            </div>
            <FillerStripes
              startIndex={fileCount}
              onDeselect={() => {
                setInternalSelected(null);
                setBgMenu(null);
              }}
              onContextMenu={
                onCreateFolder
                  ? (e) => {
                      e.preventDefault();
                      setInternalSelected(null);
                      setBgMenu({ x: e.clientX, y: e.clientY });
                    }
                  : undefined
              }
            />
          </>
        )}
      </div>

      <div className="h-[22px] shrink-0 border-t border-border bg-muted/40 select-none flex items-center justify-between px-3 rounded-b-xl">
        <span className="text-[11px] text-muted-foreground">
          {fileCount} {fileCount === 1 ? "item" : "items"}
        </span>
        {statusBarAction}
      </div>

      {bgMenu && (
        <BgContextMenu
          position={bgMenu}
          onNewFolder={() => {
            setCreatingFolder(true);
            setBgMenu(null);
          }}
          onClose={() => setBgMenu(null)}
        />
      )}
    </div>
  );
}

/** Fills remaining vertical space with real rounded stripe divs. */
function FillerStripes({
  startIndex,
  onDeselect,
  onContextMenu,
}: {
  startIndex: number;
  onDeselect: () => void;
  onContextMenu?: (e: React.MouseEvent) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [count, setCount] = useState(0);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => {
      const h = el.clientHeight;
      setCount(Math.ceil(h / 24));
    };
    update();
    const obs = new ResizeObserver(update);
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  return (
    <div ref={containerRef} className="flex-1 min-h-0">
      {Array.from({ length: count }, (_, i) => {
        const rowIndex = startIndex + i;
        return (
          // biome-ignore lint/a11y/noStaticElementInteractions: decorative filler stripe; click-to-deselect and right-click-for-context-menu are pointer-only background gestures with no keyboard equivalent
          // biome-ignore lint/a11y/useKeyWithClickEvents: same rationale as noStaticElementInteractions above
          <div
            key={`filler-${rowIndex}`}
            className={cn(
              "h-[24px]",
              rowIndex % 2 === 1 && "bg-muted/30 rounded-lg",
            )}
            onClick={onDeselect}
            onContextMenu={onContextMenu}
          />
        );
      })}
    </div>
  );
}

function BgContextMenu({
  position,
  onNewFolder,
  onClose,
}: {
  position: { x: number; y: number };
  onNewFolder: () => void;
  onClose: () => void;
}) {
  return createPortal(
    <>
      {/* biome-ignore lint/a11y/noStaticElementInteractions: full-screen backdrop that closes the context menu on pointer interaction; no keyboard role applies */}
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: backdrop dismiss is a pointer-only pattern; Escape key is handled at the document level by the menu itself */}
      <div
        className="fixed inset-0 z-50"
        onClick={onClose}
        onContextMenu={(e) => {
          e.preventDefault();
          onClose();
        }}
      />
      <div
        className="fixed z-50 bg-popover/95 backdrop-blur-xl border border-border rounded-lg shadow-lg py-1 min-w-[160px]"
        style={{ left: position.x, top: position.y }}
      >
        <button
          type="button"
          onClick={onNewFolder}
          className="w-full text-left px-3 py-1.5 text-[13px] hover:bg-primary hover:text-primary-foreground rounded-md mx-0.5"
          style={{ width: "calc(100% - 4px)" }}
        >
          New Folder
        </button>
      </div>
    </>,
    document.body,
  );
}

function HeaderCell({
  label,
  col,
  sortKey,
  sortDir,
  onSort,
  className,
  last,
}: {
  label: string;
  col: SortKey;
  sortKey: SortKey;
  sortDir: SortDirection;
  onSort: (key: SortKey) => void;
  className?: string;
  last?: boolean;
}) {
  const active = sortKey === col;
  return (
    <button
      type="button"
      onClick={() => onSort(col)}
      className={cn(
        "flex items-center justify-between h-full px-2 text-[11px] font-medium text-muted-foreground hover:bg-muted transition-colors",
        !last && "border-r border-border",
        className,
      )}
    >
      <span className="truncate">{label}</span>
      {active && (
        <svg
          className="size-[8px] shrink-0"
          viewBox="0 0 8 6"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          role="img"
          aria-label={
            sortDir === "asc" ? "sorted ascending" : "sorted descending"
          }
        >
          {sortDir === "asc" ? (
            <path d="M1 4.5L4 1.5L7 4.5" />
          ) : (
            <path d="M1 1.5L4 4.5L7 1.5" />
          )}
        </svg>
      )}
    </button>
  );
}
