/**
 * FilesBrowser — Drive-style card grid (default) with per-folder breadcrumb
 * navigation, plus the original Finder-style list view behind a toggle.
 * Status bar, drag-and-drop, context menus and inline rename in both views.
 */

import { BgContextMenu } from "./bg-context-menu";
import type { FileMenuLabels } from "./file-menu";
import {
  DEFAULT_FILES_BROWSER_LABELS,
  type FilesBrowserLabels,
  toColumnLabels,
  toGridLabels,
  toSortLabels,
} from "./files-browser-labels";
import { FilesEmptyState } from "./files-empty-state";
import { FilesGrid } from "./files-grid";
import { FilesListView } from "./files-list-view";
import { FilesToolbar } from "./files-toolbar";
import type { FileEntry, FilesViewMode, LoadFilePreview } from "./types";
import { useFilesBrowser } from "./use-files-browser";

export interface FilesBrowserProps {
  files: FileEntry[];
  loading?: boolean;
  selectedPath?: string | null;
  /** Controlled view mode; omit to let the browser manage it internally. */
  view?: FilesViewMode;
  onViewChange?: (view: FilesViewMode) => void;
  /** First breadcrumb (the workspace root), e.g. the agent's name. */
  rootLabel?: string;
  /** Lazily fetch thumbnail bytes for a visible card (grid view). */
  loadPreview?: LoadFilePreview;
  onSelect?: (file: FileEntry) => void;
  onOpen?: (file: FileEntry) => void;
  onReveal?: (file: FileEntry) => void;
  /** Save the file to the user's machine (browser builds; desktop uses onOpen/onReveal). */
  onDownload?: (file: FileEntry) => void;
  /** Save a folder's subtree as a zip. Adds a context menu to folder rows/cards. */
  onDownloadFolder?: (folder: FileEntry) => void;
  onDelete?: (file: FileEntry) => void;
  onFilesDropped?: (files: File[], targetFolder?: string) => void;
  /** Move a file/folder to a new location (null = root) */
  onMove?: (sourcePath: string, targetFolder: string | null) => void;
  onRename?: (file: FileEntry, newName: string) => void;
  /** Receives the workspace-relative path (grid view creates inside the open folder). */
  onCreateFolder?: (name: string) => void;
  onBrowse?: () => void;
  emptyTitle?: string;
  emptyDescription?: string;
  /** Optional action rendered in the bottom status bar (e.g. "Open in File Manager" link) */
  statusBarAction?: React.ReactNode;
  /** Overrides for chrome labels (toolbar, columns, loading, browse CTA). */
  labels?: FilesBrowserLabels;
  /** Overrides for the right-click context-menu labels. */
  menuLabels?: FileMenuLabels;
}

export function FilesBrowser(props: FilesBrowserProps) {
  const l = { ...DEFAULT_FILES_BROWSER_LABELS, ...props.labels };
  const b = useFilesBrowser({
    files: props.files,
    loading: props.loading,
    controlledView: props.view,
    onViewChange: props.onViewChange,
    controlledSelected: props.selectedPath,
    onSelect: props.onSelect,
    onCreateFolder: props.onCreateFolder,
    onFilesDropped: props.onFilesDropped,
    onMove: props.onMove,
  });

  if (b.isEmpty) {
    return (
      <FilesEmptyState
        title={props.emptyTitle ?? "No files yet"}
        description={
          props.emptyDescription ??
          "When agents create files, they’ll appear here."
        }
        browseLabel={l.browseFiles}
        onBrowse={props.onBrowse}
      />
    );
  }

  return (
    <div
      className="relative flex h-full flex-col overflow-hidden rounded-xl border border-line bg-input"
      {...(props.onFilesDropped || props.onMove ? b.dragHandlers : {})}
    >
      <FilesToolbar
        view={b.view}
        onViewChange={b.changeView}
        path={b.resolvedPath}
        rootLabel={props.rootLabel ?? "Files"}
        onNavigate={b.navigate}
        onDragActive={b.onDragActive}
        sortKey={b.sortKey}
        sortDir={b.sortDir}
        onSort={b.handleSort}
        sortLabels={toSortLabels(l)}
        viewGridLabel={l.viewGrid}
        viewListLabel={l.viewList}
        breadcrumbsLabel={l.breadcrumbs}
        onNewFolder={
          props.onCreateFolder ? () => b.setCreatingFolder(true) : undefined
        }
        newFolderLabel={l.newFolder}
      />

      {/* biome-ignore lint/a11y/noStaticElementInteractions: click-to-deselect and right-click-for-context-menu on the backdrop are pointer-only affordances; no keyboard equivalent exists for these background gestures */}
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: same rationale — background click deselection has no keyboard equivalent */}
      <div
        className="flex flex-1 flex-col overflow-y-auto"
        style={{
          backgroundColor: b.isBgDropTarget
            ? "color-mix(in srgb, var(--ht-focus) 6%, transparent)"
            : undefined,
        }}
        onClick={(e) => {
          if (e.target === e.currentTarget) b.handleBackgroundInteraction();
        }}
        onContextMenu={(e) => {
          if (e.target === e.currentTarget && props.onCreateFolder) {
            e.preventDefault();
            b.handleBackgroundInteraction({ x: e.clientX, y: e.clientY });
          }
        }}
      >
        {props.loading || !b.tree || !b.currentFolder ? (
          <div className="flex items-center justify-center py-16">
            <p className="text-sm text-ink-muted/50">{l.loading}</p>
          </div>
        ) : b.view === "grid" ? (
          <FilesGrid
            folder={b.currentFolder}
            selectedPath={b.selectedPath}
            loadPreview={props.loadPreview}
            onNavigate={b.navigate}
            onSelect={b.handleSelect}
            onOpen={props.onOpen}
            onReveal={props.onReveal}
            onDownload={props.onDownload}
            onDownloadFolder={props.onDownloadFolder}
            onDelete={props.onDelete}
            onRename={props.onRename}
            onMove={props.onMove}
            onDragActive={b.onDragActive}
            creatingFolder={b.creatingFolder}
            onCreateFolder={props.onCreateFolder ? b.createFolderAt : undefined}
            onCancelCreateFolder={() => b.setCreatingFolder(false)}
            menuLabels={props.menuLabels}
            labels={toGridLabels(l)}
          />
        ) : (
          <FilesListView
            tree={b.tree}
            fileCount={b.fileCount}
            sortKey={b.sortKey}
            sortDir={b.sortDir}
            onSort={b.handleSort}
            selectedPath={b.selectedPath}
            onSelect={b.handleSelect}
            onOpen={props.onOpen}
            onReveal={props.onReveal}
            onDownload={props.onDownload}
            onDownloadFolder={props.onDownloadFolder}
            onDelete={props.onDelete}
            onRename={props.onRename}
            onFilesDropped={props.onFilesDropped}
            onDragActive={b.onDragActive}
            onMove={props.onMove}
            creatingFolder={b.creatingFolder}
            onCreateFolder={props.onCreateFolder ? b.createFolderAt : undefined}
            onCancelCreateFolder={() => b.setCreatingFolder(false)}
            newFolderPlaceholder={l.newFolderPlaceholder}
            onBackgroundInteraction={b.handleBackgroundInteraction}
            columnLabels={toColumnLabels(l)}
            menuLabels={props.menuLabels}
          />
        )}
      </div>

      <div className="flex h-[22px] shrink-0 select-none items-center justify-between rounded-b-xl border-t border-line bg-chip-subtle/40 px-3">
        <span className="text-[11px] text-ink-muted">
          {b.fileCount} {b.fileCount === 1 ? l.itemSingular : l.itemPlural}
        </span>
        {props.statusBarAction}
      </div>

      {b.bgMenu && (
        <BgContextMenu
          position={b.bgMenu}
          label={l.newFolder}
          onNewFolder={() => {
            b.setCreatingFolder(true);
            b.setBgMenu(null);
          }}
          onClose={() => b.setBgMenu(null)}
        />
      )}
    </div>
  );
}
