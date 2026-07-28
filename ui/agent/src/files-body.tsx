/**
 * FilesBody — the current view (grid or list) for the open folder, plus the
 * three states that replace it: the loading skeleton, the empty search result
 * and the empty folder. All three are hoisted ABOVE the view switch, so the
 * list view gets them too instead of showing bare column headers. Chrome
 * (header, scroll container, drop tinting, background menu) stays in
 * FilesBrowser; this owns only what renders inside the content column.
 */
import type { FilesBrowserProps } from "./files-browser";
import {
  type FilesBrowserLabels,
  toColumnLabels,
  toGridLabels,
} from "./files-browser-labels";
import { FilesEmptyFolder } from "./files-empty-folder";
import { FilesGrid } from "./files-grid";
import { FilesListView } from "./files-list-view";
import { FilesSearchEmpty } from "./files-search-empty";
import { FilesGridSkeleton, FilesListSkeleton } from "./files-skeleton";
import type { useFilesBrowser } from "./use-files-browser";

export function FilesBody({
  b,
  props,
  l,
}: {
  b: ReturnType<typeof useFilesBrowser>;
  props: FilesBrowserProps;
  l: Required<FilesBrowserLabels>;
}) {
  if (props.loading || !b.visibleFolder) {
    return (
      <div role="status" aria-label={l.loading}>
        {b.view === "grid" ? <FilesGridSkeleton /> : <FilesListSkeleton />}
      </div>
    );
  }

  const onCreateFolder = props.onCreateFolder ? b.createFolderAt : undefined;
  const onCancelCreateFolder = () => b.setCreatingFolder(false);
  const onNewFolder = onCreateFolder ? b.startCreatingFolder : undefined;
  // Create-folder mode always wins: the new card/row has to be able to render,
  // or the affordances that start it are dead clicks.
  const isBlank = b.visibleFolder.children.length === 0 && !b.creatingFolder;

  if (isBlank && b.query) {
    return (
      <FilesSearchEmpty
        message={l.searchNoResults}
        query={b.query}
        clearLabel={l.searchClear}
        onClear={() => b.setQuery("")}
      />
    );
  }

  if (isBlank) {
    return (
      <FilesEmptyFolder
        message={l.emptyFolder}
        onUpload={b.uploadHere}
        uploadLabel={l.emptyFolderUploadCta}
        onNewFolder={onNewFolder}
        newFolderLabel={l.emptyFolderNewFolderCta}
      />
    );
  }

  return b.view === "grid" ? (
    <FilesGrid
      folder={b.visibleFolder}
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
      onCreateFolder={onCreateFolder}
      onCancelCreateFolder={onCancelCreateFolder}
      menuLabels={props.menuLabels}
      labels={toGridLabels(l)}
    />
  ) : (
    <FilesListView
      tree={b.visibleFolder}
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
      onCreateFolder={onCreateFolder}
      onCancelCreateFolder={onCancelCreateFolder}
      newFolderPlaceholder={l.newFolderPlaceholder}
      columnLabels={toColumnLabels(l)}
      menuLabels={props.menuLabels}
      menuButtonLabel={l.menuButton}
    />
  );
}
