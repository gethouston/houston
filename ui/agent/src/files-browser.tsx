/** List-only file tree for one filesystem boundary. */

import { cn } from "@houston-ai/core";
import type { ReactNode } from "react";
import { BgContextMenu } from "./bg-context-menu";
import type { FileMenuLabels } from "./file-menu";
import { FilesBody } from "./files-body";
import {
  DEFAULT_FILES_BROWSER_LABELS,
  type FilesBrowserLabels,
  toSelectionLabels,
} from "./files-browser-labels";
import { FilesEmptyFolder } from "./files-empty-folder";
import { FILES_CONTENT_COLUMN, LIST_INSET } from "./files-list-chrome";
import { FilesSearchEmpty } from "./files-search-empty";
import { buildFilesSelection } from "./files-selection";
import { FolderEmptyRow } from "./folder-empty-row";
import type { FileEntry, LoadFilePreview } from "./types";
import { useFilesBrowser } from "./use-files-browser";
import type { SortDirection, SortKey } from "./utils";

export interface FilesBrowserProps {
  files: FileEntry[];
  loading?: boolean;
  query?: string;
  onQueryChange?: (query: string) => void;
  sortKey?: SortKey;
  sortDir?: SortDirection;
  depth?: number;
  dragScope?: string;
  header?: ReactNode;
  notice?: ReactNode;
  footer?: ReactNode;
  expanded?: boolean;
  createFolderRequest?: number;
  /** The team frame already owns the shared horizontal gutter. */
  inFrame?: boolean;
  locale?: string;
  loadPreview?: LoadFilePreview;
  onOpen?: (file: FileEntry) => void;
  onReveal?: (file: FileEntry) => void;
  onDownload?: (file: FileEntry) => void;
  onDownloadFolder?: (folder: FileEntry) => void;
  onDelete?: (file: FileEntry) => void;
  onDeleteMany?: (files: FileEntry[]) => void;
  onFilesDropped?: (files: File[], targetFolder?: string) => void;
  onDropError?: (error: unknown) => void;
  onMove?: (sourcePath: string, targetFolder: string | null) => void;
  onRename?: (file: FileEntry, newName: string) => void;
  onCreateFolder?: (name: string) => void;
  uploading?: boolean;
  onUpload?: (targetFolder?: string) => void;
  onUploadFolder?: (targetFolder?: string) => void;
  labels?: FilesBrowserLabels;
  menuLabels?: FileMenuLabels;
}

export function FilesBrowser(props: FilesBrowserProps) {
  const labels = { ...DEFAULT_FILES_BROWSER_LABELS, ...props.labels };
  const browser = useFilesBrowser(props);
  const selection = buildFilesSelection(
    browser,
    props.onDeleteMany,
    toSelectionLabels(labels),
  );

  return (
    <div
      className="relative flex min-h-0 flex-col"
      {...(props.onFilesDropped || props.onMove ? browser.dragHandlers : {})}
    >
      {props.header}
      {props.expanded !== false && props.notice}
      {props.expanded !== false && (
        // biome-ignore lint/a11y/noStaticElementInteractions: backdrop gestures only clear selection or open its pointer context menu
        // biome-ignore lint/a11y/useKeyWithClickEvents: the backdrop itself has no keyboard action
        <div
          className={`${props.inFrame ? "w-full" : FILES_CONTENT_COLUMN} flex min-h-0 flex-col`}
          onClick={(event) => {
            if (event.target === event.currentTarget)
              browser.handleBackgroundInteraction();
          }}
          onContextMenu={(event) => {
            if (event.target === event.currentTarget && props.onCreateFolder) {
              event.preventDefault();
              browser.handleBackgroundInteraction({
                x: event.clientX,
                y: event.clientY,
              });
            }
          }}
        >
          {browser.visibleFolder || props.loading || !browser.query ? (
            <FilesBody
              b={browser}
              props={props}
              l={labels}
              selection={selection}
            />
          ) : browser.query ? (
            <FilesSearchEmpty
              message={labels.searchNoResults}
              query={browser.query}
              clearLabel={labels.searchClear}
              onClear={() => browser.setQuery("")}
            />
          ) : props.inFrame ? (
            <div className={cn("flex flex-col", LIST_INSET)}>
              <FolderEmptyRow
                depth={props.depth ?? 0}
                label={labels.emptyFolder}
                onUpload={browser.uploadHere}
                uploadLabel={labels.emptyFolderUploadCta}
                onNewFolder={
                  props.onCreateFolder ? browser.startCreatingFolder : undefined
                }
                newFolderLabel={labels.emptyFolderNewFolderCta}
              />
            </div>
          ) : (
            <FilesEmptyFolder
              message={labels.emptyFolder}
              onUpload={browser.uploadHere}
              uploadLabel={labels.emptyFolderUploadCta}
              onNewFolder={
                props.onCreateFolder ? browser.startCreatingFolder : undefined
              }
              newFolderLabel={labels.emptyFolderNewFolderCta}
            />
          )}
        </div>
      )}
      {browser.bgMenu && (
        <BgContextMenu
          position={browser.bgMenu}
          label={labels.newFolder}
          onNewFolder={() => {
            browser.startCreatingFolder();
            browser.setBgMenu(null);
          }}
          onClose={() => browser.setBgMenu(null)}
        />
      )}
      {props.footer}
    </div>
  );
}
