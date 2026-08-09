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
import type { FilesBrowserLabels } from "./files-browser-labels";
import { FilesEmptyFolder } from "./files-empty-folder";
import { FilesListView } from "./files-list-view";
import { FilesSearchEmpty } from "./files-search-empty";
import type { FilesSelection } from "./files-selection";
import { FilesListSkeleton } from "./files-skeleton";
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
  if (props.loading) {
    return (
      <div role="status" aria-label={l.loading}>
        <FilesListSkeleton selectable={!!props.onDeleteMany} />
      </div>
    );
  }

  if (!b.visibleFolder) {
    return (
      <FilesEmptyFolder
        message={l.emptyFolder}
        onUpload={b.uploadHere}
        uploadLabel={l.emptyFolderUploadCta}
        onNewFolder={props.onCreateFolder ? b.startCreatingFolder : undefined}
        newFolderLabel={l.emptyFolderNewFolderCta}
      />
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

  return (
    <FilesListView
      tree={b.visibleFolder}
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
      locale={props.locale}
      modifiedTodayLabel={l.modifiedToday}
      itemSingular={l.itemSingular}
      itemPlural={l.itemPlural}
      menuLabels={props.menuLabels}
      menuButtonLabel={l.menuButton}
      emptyFolderLabel={l.emptyFolder}
      dragScope={props.dragScope}
      depth={props.depth}
    />
  );
}
