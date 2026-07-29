/**
 * FilesBody — the current view (the grid's open folder, or the list's whole
 * workspace tree), plus the three states that replace it: the loading skeleton,
 * the empty search result and the empty folder. All three are hoisted ABOVE the
 * view switch, so the list gets the search miss too instead of showing bare
 * column headers (the empty FOLDER is a grid state now: the list is rooted at
 * the workspace, and an empty folder inside it says so on its own row). Chrome
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
import type { FilesSelection } from "./files-selection";
import { FilesGridSkeleton, FilesListSkeleton } from "./files-skeleton";
import type { useFilesBrowser } from "./use-files-browser";

export function FilesBody({
  b,
  props,
  l,
  selection,
}: {
  b: ReturnType<typeof useFilesBrowser>;
  props: FilesBrowserProps;
  l: Required<FilesBrowserLabels>;
  /** Built by FilesBrowser only when the consumer passed onDeleteMany. */
  selection?: FilesSelection;
}) {
  if (props.loading || !b.visibleFolder) {
    return (
      <div role="status" aria-label={l.loading}>
        {b.view === "grid" ? (
          <FilesGridSkeleton />
        ) : (
          // Read from the PROP, not from `selection` (which needs a listing to
          // exist): the gutter has to be in the skeleton too, or the columns
          // jump sideways the moment the listing lands.
          <FilesListSkeleton selectable={!!props.onDeleteMany} />
        )}
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
      loadPreview={props.loadPreview}
      onNavigate={b.navigate}
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
      selection={selection}
      loadPreview={props.loadPreview}
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
      locale={props.locale}
      modifiedTodayLabel={l.modifiedToday}
      itemSingular={l.itemSingular}
      itemPlural={l.itemPlural}
      menuLabels={props.menuLabels}
      menuButtonLabel={l.menuButton}
      emptyFolderLabel={l.emptyFolder}
    />
  );
}
