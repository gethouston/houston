import { cn } from "@houston-ai/core";
import type { FilesBrowserProps } from "./files-browser";
import type { FilesBrowserLabels } from "./files-browser-labels";
import { FilesEmptyFolder } from "./files-empty-folder";
import { LIST_INSET } from "./files-list-chrome";
import { FilesListView } from "./files-list-view";
import { FilesSearchEmpty } from "./files-search-empty";
import type { FilesSelection } from "./files-selection";
import { FilesListSkeleton } from "./files-skeleton";
import { FolderEmptyRow } from "./folder-empty-row";
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
  selection?: FilesSelection;
}) {
  if (props.loading) {
    return (
      <div role="status" aria-label={l.loading}>
        <span className="sr-only">{l.loading}</span>
        <FilesListSkeleton selectable={!!selection} depth={props.depth ?? 0} />
      </div>
    );
  }

  if (!b.visibleFolder) {
    if (props.inFrame) {
      return (
        <div className={cn("flex flex-col", LIST_INSET)}>
          <FolderEmptyRow
            depth={props.depth ?? 0}
            label={l.emptyFolder}
            onUpload={b.uploadHere}
            uploadLabel={l.emptyFolderUploadCta}
            onNewFolder={
              props.onCreateFolder ? b.startCreatingFolder : undefined
            }
            newFolderLabel={l.emptyFolderNewFolderCta}
          />
        </div>
      );
    }
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
    if (props.inFrame) {
      return (
        <div className={cn("flex flex-col", LIST_INSET)}>
          <FolderEmptyRow
            depth={props.depth ?? 0}
            label={l.emptyFolder}
            onUpload={b.uploadHere}
            uploadLabel={l.emptyFolderUploadCta}
            onNewFolder={onNewFolder}
            newFolderLabel={l.emptyFolderNewFolderCta}
          />
        </div>
      );
    }
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
