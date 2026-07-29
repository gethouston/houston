/**
 * Row 1 of the Files header: a capped search field, then ONE filled black pill
 * ("New", which owns every way of adding something) and, after it, quiet
 * icon-only glyphs — download-all / reveal, sort, and the grid/list tabs. The
 * band reads as a library's chrome rather than a strip of competing buttons:
 * exactly one thing here is loud, and it is the thing that creates.
 *
 * Every control is 36px tall with 16px glyphs. Sort stays grid-only (the list
 * sorts from its column headers) but its slot stays reserved in BOTH views, so
 * toggling grid/list never shifts the cluster sideways. On an empty workspace
 * only the controls with nothing to act on step aside: New and the
 * download/reveal glyph stay exactly put.
 */
import { Button } from "@houston-ai/core";
import { Download, FolderOpen } from "lucide-react";
import { FilesNewMenu } from "./files-new-menu";
import { FilesSearch } from "./files-search";
import { SortMenu, type SortMenuLabels } from "./sort-menu";
import type { FilesViewMode } from "./types";
import type { SortDirection, SortKey } from "./utils";
import { ViewToggle } from "./view-toggle";

export interface FilesToolbarProps {
  /** Zero files in the workspace: keep New and the layout, drop the rest. */
  empty?: boolean;
  view: FilesViewMode;
  onViewChange: (view: FilesViewMode) => void;
  sortKey: SortKey;
  sortDir: SortDirection;
  onSort: (key: SortKey) => void;
  sortLabels: SortMenuLabels;
  /** Name search: the open folder's subtree in the grid, the whole workspace
   *  in the list (each view filters the tree it renders). */
  query: string;
  onQueryChange: (query: string) => void;
  searchPlaceholder: string;
  searchClearLabel: string;
  viewGridLabel: string;
  viewListLabel: string;
  /** The New pill's own label; its items come from the three handlers below. */
  newMenuLabel: string;
  onNewFolder?: () => void;
  newFolderLabel: string;
  onUpload?: () => void;
  uploadFilesLabel: string;
  onUploadFolder?: () => void;
  uploadFolderLabel: string;
  /** Reveal the agent's folder in the OS file manager (co-located desktop). */
  onRevealAgent?: () => void;
  revealAgentLabel: string;
  /** Download the whole workspace as one zip (browser/remote builds). */
  onDownloadAll?: () => void;
  downloadAllLabel: string;
  /** An upload is in flight (see FilesNewMenu). */
  uploading?: boolean;
  uploadingLabel: string;
}

export function FilesToolbar({
  empty,
  view,
  onViewChange,
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
  newMenuLabel,
  onNewFolder,
  newFolderLabel,
  onUpload,
  uploadFilesLabel,
  onUploadFolder,
  uploadFolderLabel,
  onRevealAgent,
  revealAgentLabel,
  onDownloadAll,
  downloadAllLabel,
  uploading,
  uploadingLabel,
}: FilesToolbarProps) {
  const secondary = onRevealAgent
    ? {
        onClick: onRevealAgent,
        icon: <FolderOpen aria-hidden className="size-4" />,
        label: revealAgentLabel,
      }
    : onDownloadAll
      ? {
          onClick: onDownloadAll,
          icon: <Download aria-hidden className="size-4" />,
          label: downloadAllLabel,
        }
      : null;

  return (
    <div className="flex items-center gap-2">
      {/* The slot search lives in takes every pixel the fixed cluster does not
          need; the field itself caps inside it (files-search.tsx), so the slack
          becomes the gutter between the two and the cluster stays anchored to
          the pane's right edge. On an empty workspace the slot is the spacer. */}
      <div className="flex min-w-0 flex-1">
        {!empty && (
          <FilesSearch
            value={query}
            onChange={onQueryChange}
            placeholder={searchPlaceholder}
            clearLabel={searchClearLabel}
          />
        )}
      </div>
      <FilesNewMenu
        label={newMenuLabel}
        onUpload={onUpload}
        uploadFilesLabel={uploadFilesLabel}
        onUploadFolder={onUploadFolder}
        uploadFolderLabel={uploadFolderLabel}
        onNewFolder={onNewFolder}
        newFolderLabel={newFolderLabel}
        uploading={uploading}
        uploadingLabel={uploadingLabel}
      />
      {secondary && (
        <Button
          variant="ghost"
          size="icon"
          aria-label={secondary.label}
          title={secondary.label}
          onClick={secondary.onClick}
        >
          {secondary.icon}
        </Button>
      )}
      {!empty && (
        <>
          {/* Reserved slot: the sort glyph is grid-only, and a slot that
              collapsed would slide the tabs out from under the cursor on
              every toggle. */}
          <div className="flex size-9 shrink-0 items-center justify-center">
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
        </>
      )}
    </div>
  );
}
