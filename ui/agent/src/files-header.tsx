/**
 * Files header: breadcrumb navigation on the left (grid view only — the list
 * is a hierarchical tree always rooted at the workspace, so a path crumb would
 * misstate its scope) and a right cluster with sort, the grid/list toggle,
 * new-folder, and the promoted Upload + reveal/download-all actions.
 * Breadcrumbs are drop targets so a drag can move items to any ancestor
 * ("" signals the root). This row does not scroll with the file list.
 */
import { Button } from "@houston-ai/core";
import {
  ChevronRight,
  Download,
  FolderOpen,
  FolderPlus,
  House,
  Upload,
} from "lucide-react";
import { CrumbButton } from "./crumb-button";
import { crumbsForPath } from "./grid-utils";
import { SortMenu, type SortMenuLabels } from "./sort-menu";
import type { FilesViewMode } from "./types";
import type { SortDirection, SortKey } from "./utils";
import { ViewToggle } from "./view-toggle";

/** Shared width cap so the header and the scroll body's content column align. */
export const FILES_CONTENT_COLUMN = "mx-auto w-full max-w-4xl px-6";

export function FilesHeader({
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
  viewGridLabel,
  viewListLabel,
  breadcrumbsLabel,
  onNewFolder,
  newFolderLabel,
  onUpload,
  uploadLabel,
  onRevealAgent,
  revealAgentLabel,
  onDownloadAll,
  downloadAllLabel,
}: {
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
  viewGridLabel: string;
  viewListLabel: string;
  breadcrumbsLabel: string;
  onNewFolder?: () => void;
  newFolderLabel: string;
  /** Pick files to upload (filled primary pill). */
  onUpload?: () => void;
  uploadLabel: string;
  /** Reveal the agent's folder in the OS file manager (co-located desktop). */
  onRevealAgent?: () => void;
  revealAgentLabel: string;
  /** Download the whole workspace as one zip (browser/remote builds). */
  onDownloadAll?: () => void;
  downloadAllLabel: string;
}) {
  const crumbs = crumbsForPath(path);
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
      {view === "grid" && crumbs.length > 0 ? (
        <nav
          aria-label={breadcrumbsLabel}
          className="flex min-w-0 flex-1 items-center gap-0.5"
        >
          <CrumbButton
            crumb={{ name: rootLabel, path: "" }}
            current={false}
            droppable
            onNavigate={onNavigate}
            onDragActive={onDragActive}
          >
            <House aria-hidden className="size-3.5 shrink-0" />
          </CrumbButton>
          {crumbs.map((crumb, i) => (
            <span
              key={crumb.path}
              className="flex min-w-0 items-center gap-0.5"
            >
              <ChevronRight
                aria-hidden
                className="size-3.5 shrink-0 text-ink-muted/60"
              />
              <CrumbButton
                crumb={crumb}
                current={i === crumbs.length - 1}
                droppable
                onNavigate={onNavigate}
                onDragActive={onDragActive}
              />
            </span>
          ))}
        </nav>
      ) : (
        <div className="min-w-0 flex-1" />
      )}
      {view === "grid" && (
        <SortMenu
          sortKey={sortKey}
          sortDir={sortDir}
          onSort={onSort}
          labels={sortLabels}
        />
      )}
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
          className="shrink-0 rounded-lg p-1.5 text-ink-muted transition-colors hover:bg-hover hover:text-ink"
        >
          <FolderPlus aria-hidden className="size-4" />
        </button>
      )}
      {onUpload && (
        <Button size="sm" onClick={onUpload} className="shrink-0">
          <Upload aria-hidden /> {uploadLabel}
        </Button>
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
