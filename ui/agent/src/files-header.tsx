/**
 * Files header: breadcrumb navigation on the left (both views are scoped to
 * the open folder, so the trail states the scope in either) and a right
 * cluster with search, sort, the grid/list toggle, new-folder, and the
 * promoted Upload + reveal/download-all actions. Sort stays grid-only (the
 * list sorts from its column headers) but its slot is reserved in BOTH views,
 * so toggling grid/list never shifts the row sideways. This row does not
 * scroll with the file list, and it stays put on an empty workspace: only the
 * controls with nothing to act on step aside.
 */
import { Button } from "@houston-ai/core";
import { Download, FolderOpen, FolderPlus } from "lucide-react";
import { FilesBreadcrumbs } from "./files-breadcrumbs";
import { FilesHeaderUpload } from "./files-header-upload";
import { FilesSearch } from "./files-search";
import { SortMenu, type SortMenuLabels } from "./sort-menu";
import type { FilesViewMode } from "./types";
import type { SortDirection, SortKey } from "./utils";
import { ViewToggle } from "./view-toggle";

/** Shared width cap so the header and the scroll body's content column align. */
export const FILES_CONTENT_COLUMN = "mx-auto w-full max-w-4xl px-6";

export function FilesHeader({
  empty,
  view,
  onViewChange,
  path,
  rootLabel,
  onNavigate,
  onDragActive,
  sortKey,
  sortDir,
  onSort,
  sortLabels,
  query,
  onQueryChange,
  searchPlaceholder,
  searchClearLabel,
  viewGridLabel,
  viewListLabel,
  breadcrumbsLabel,
  onNewFolder,
  newFolderLabel,
  onUpload,
  uploadLabel,
  onUploadFolder,
  uploadFilesLabel,
  uploadFolderLabel,
  onRevealAgent,
  revealAgentLabel,
  onDownloadAll,
  downloadAllLabel,
  uploading,
  uploadingLabel,
}: {
  /** Zero files in the workspace: keep Upload and the layout, drop the rest. */
  empty?: boolean;
  view: FilesViewMode;
  onViewChange: (view: FilesViewMode) => void;
  path: string;
  rootLabel: string;
  onNavigate: (path: string) => void;
  /** "" = root hovered, null = nothing hovered (see FilesBrowser). */
  onDragActive: (folder: string | null) => void;
  sortKey: SortKey;
  sortDir: SortDirection;
  onSort: (key: SortKey) => void;
  sortLabels: SortMenuLabels;
  /** Name search over the open folder's subtree. */
  query: string;
  onQueryChange: (query: string) => void;
  searchPlaceholder: string;
  searchClearLabel: string;
  viewGridLabel: string;
  viewListLabel: string;
  breadcrumbsLabel: string;
  onNewFolder?: () => void;
  newFolderLabel: string;
  /** Pick files to upload (filled primary pill). */
  onUpload?: () => void;
  uploadLabel: string;
  /** Pick a whole folder to upload. When set, the Upload pill opens a menu
   *  offering files or a folder instead of jumping straight to the picker. */
  onUploadFolder?: () => void;
  uploadFilesLabel: string;
  uploadFolderLabel: string;
  /** Reveal the agent's folder in the OS file manager (co-located desktop). */
  onRevealAgent?: () => void;
  revealAgentLabel: string;
  /** Download the whole workspace as one zip (browser/remote builds). */
  onDownloadAll?: () => void;
  downloadAllLabel: string;
  /** An upload is in flight (see FilesHeaderUpload). */
  uploading?: boolean;
  uploadingLabel: string;
}) {
  const secondary = onRevealAgent
    ? {
        onClick: onRevealAgent,
        icon: <FolderOpen aria-hidden />,
        label: revealAgentLabel,
      }
    : onDownloadAll
      ? {
          onClick: onDownloadAll,
          icon: <Download aria-hidden />,
          label: downloadAllLabel,
        }
      : null;
  return (
    <div
      className={`${FILES_CONTENT_COLUMN} flex shrink-0 items-center gap-2 pt-6 pb-4`}
    >
      <FilesBreadcrumbs
        path={path}
        rootLabel={rootLabel}
        label={breadcrumbsLabel}
        onNavigate={onNavigate}
        onDragActive={onDragActive}
      />
      {!empty && (
        <>
          <FilesSearch
            value={query}
            onChange={onQueryChange}
            placeholder={searchPlaceholder}
            clearLabel={searchClearLabel}
          />
          {/* Reserved width: the sort control is grid-only, and a slot that
              collapses would slide the whole right cluster on every toggle. */}
          <div className="flex w-7 shrink-0 justify-end sm:w-28">
            {view === "grid" && (
              <SortMenu
                sortKey={sortKey}
                sortDir={sortDir}
                onSort={onSort}
                labels={sortLabels}
              />
            )}
          </div>
          <ViewToggle
            view={view}
            onViewChange={onViewChange}
            viewGridLabel={viewGridLabel}
            viewListLabel={viewListLabel}
          />
          {onNewFolder && (
            <button
              type="button"
              aria-label={newFolderLabel}
              title={newFolderLabel}
              onClick={onNewFolder}
              className="shrink-0 rounded-lg p-1.5 text-ink-muted transition-colors hover:bg-hover hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
            >
              <FolderPlus aria-hidden className="size-4" />
            </button>
          )}
        </>
      )}
      {onUpload && (
        <FilesHeaderUpload
          onUpload={onUpload}
          uploadLabel={uploadLabel}
          onUploadFolder={onUploadFolder}
          uploadFilesLabel={uploadFilesLabel}
          uploadFolderLabel={uploadFolderLabel}
          uploading={uploading}
          uploadingLabel={uploadingLabel}
        />
      )}
      {secondary && (
        <Button
          size="sm"
          variant="ghost"
          onClick={secondary.onClick}
          className="shrink-0"
        >
          {secondary.icon} {secondary.label}
        </Button>
      )}
    </div>
  );
}
