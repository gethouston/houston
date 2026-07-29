/**
 * FilesBrowser — Drive-style card grid (default) with per-folder breadcrumb
 * navigation, plus a Library-style list view behind a toggle, which shows the
 * WHOLE workspace and browses it by expanding folder rows in place. Borderless
 * on the canvas: a header band (utilities, plus the breadcrumb trail when the
 * grid is inside a folder) over a full-bleed scroll body, both using the pane's
 * whole width with one shared gutter, and no rule between them. Drag-and-drop,
 * context menus and inline rename in both views. The drop container wraps EVERY
 * state, the zero-files one included, so an empty workspace accepts a drop like
 * any other.
 *
 * A click OPENS a file in both views. Selecting is a separate gesture living on
 * the list's checkbox gutter, and it exists at all only when `onDeleteMany`
 * gives it somewhere to go.
 */

import { BgContextMenu } from "./bg-context-menu";
import type { FileMenuLabels } from "./file-menu";
import { FilesBody } from "./files-body";
import { FilesBrowserHeader } from "./files-browser-header";
import {
  DEFAULT_FILES_BROWSER_LABELS,
  type FilesBrowserLabels,
  toSelectionLabels,
} from "./files-browser-labels";
import { FilesEmptyState } from "./files-empty-state";
import { FILES_CONTENT_COLUMN } from "./files-header";
import { buildFilesSelection } from "./files-selection";
import type { FileEntry, FilesViewMode, LoadFilePreview } from "./types";
import { useFilesBrowser } from "./use-files-browser";

export interface FilesBrowserProps {
  files: FileEntry[];
  loading?: boolean;
  /** Controlled view mode; omit to let the browser manage it internally. */
  view?: FilesViewMode;
  onViewChange?: (view: FilesViewMode) => void;
  /** First breadcrumb (the workspace root), e.g. the agent's name. */
  rootLabel?: string;
  /** BCP-47 tag the Modified column formats its dates in (the app passes the
   *  active i18n language). Undefined follows the browser's own locale. */
  locale?: string;
  /** Lazily fetch thumbnail bytes for a visible card or list-row icon. */
  loadPreview?: LoadFilePreview;
  onOpen?: (file: FileEntry) => void;
  onReveal?: (file: FileEntry) => void;
  /** Save the file to the user's machine (browser builds; desktop uses onOpen/onReveal). */
  onDownload?: (file: FileEntry) => void;
  /** Save a folder's subtree as a zip. Adds a context menu to folder rows/cards. */
  onDownloadFolder?: (folder: FileEntry) => void;
  onDelete?: (file: FileEntry) => void;
  /** Delete this whole selection. Passing it is what turns the list's
   *  checkbox column on: with no bulk handler there is nothing a selection
   *  could do, so no checkbox is drawn at all. */
  onDeleteMany?: (files: FileEntry[]) => void;
  onFilesDropped?: (files: File[], targetFolder?: string) => void;
  /** Surfaces dropped-folder expansion failures (unreadable entries, too many
   *  files). Pass whenever onFilesDropped is set — the async folder walk has
   *  nowhere to throw to, and errors must never be swallowed. */
  onDropError?: (error: unknown) => void;
  /** Move a file/folder to a new location (null = root) */
  onMove?: (sourcePath: string, targetFolder: string | null) => void;
  onRename?: (file: FileEntry, newName: string) => void;
  /** Receives the workspace-relative path (grid view creates inside the open folder). */
  onCreateFolder?: (name: string) => void;
  /** Empty-workspace CTA: pick files for the root, which is all there is. */
  onBrowse?: () => void;
  emptyTitle?: string;
  emptyDescription?: string;
  /** An upload is in flight: the upload actions go busy. Browsing stays free. */
  uploading?: boolean;
  /** Pick files to upload (header's filled primary pill). Receives the open
   *  folder's workspace-relative path, undefined at the root, so a picked file
   *  lands where the user is looking, exactly like a drop does. */
  onUpload?: (targetFolder?: string) => void;
  /** Pick a whole folder to upload (turns the pill into a files/folder menu).
   *  Same target-folder argument as onUpload. */
  onUploadFolder?: (targetFolder?: string) => void;
  /** Reveal the agent's folder in the OS file manager (co-located desktop). */
  onRevealAgent?: () => void;
  /** Download the whole workspace as one zip (browser/remote builds). */
  onDownloadAll?: () => void;
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
    onCreateFolder: props.onCreateFolder,
    onFilesDropped: props.onFilesDropped,
    onDropError: props.onDropError,
    onMove: props.onMove,
    onUpload: props.onUpload,
    onUploadFolder: props.onUploadFolder,
  });

  // Undefined unless the consumer passed onDeleteMany: no bulk handler, no
  // checkbox column anywhere in the list.
  const selection = buildFilesSelection(
    b,
    props.onDeleteMany,
    toSelectionLabels(l),
  );

  return (
    <div
      className="relative flex h-full flex-col"
      {...(props.onFilesDropped || props.onMove ? b.dragHandlers : {})}
    >
      <FilesBrowserHeader b={b} props={props} l={l} />

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
        {b.isEmpty ? (
          <FilesEmptyState
            title={props.emptyTitle ?? "No files yet"}
            description={
              props.emptyDescription ??
              "When agents create files, they’ll appear here."
            }
            browseLabel={l.browseFiles}
            onBrowse={props.onBrowse}
            folderLabel={l.uploadFolder}
            onBrowseFolder={b.uploadFolderHere}
            dropHint={l.dropHint}
            dragActive={b.isBgDropTarget}
            uploading={props.uploading}
            uploadingLabel={l.uploadingBusy}
          />
        ) : (
          <div
            className={`${FILES_CONTENT_COLUMN} flex min-h-0 flex-1 flex-col pt-4 pb-6`}
          >
            <FilesBody b={b} props={props} l={l} selection={selection} />
          </div>
        )}
      </div>

      {b.bgMenu && (
        <BgContextMenu
          position={b.bgMenu}
          label={l.newFolder}
          onNewFolder={() => {
            b.startCreatingFolder();
            b.setBgMenu(null);
          }}
          onClose={() => b.setBgMenu(null)}
        />
      )}
    </div>
  );
}
