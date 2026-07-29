/**
 * The adapter between FilesBrowser's world (props + the browser hook + the
 * merged label bag) and FilesHeader's flat prop surface — the same job
 * FilesBody does for the body. Keeping it here means FilesBrowser reads as
 * composition rather than as thirty lines of label plumbing.
 */
import type { FilesBrowserProps } from "./files-browser";
import { type FilesBrowserLabels, toSortLabels } from "./files-browser-labels";
import { FilesHeader } from "./files-header";
import type { useFilesBrowser } from "./use-files-browser";

export function FilesBrowserHeader({
  b,
  props,
  l,
}: {
  b: ReturnType<typeof useFilesBrowser>;
  props: FilesBrowserProps;
  l: Required<FilesBrowserLabels>;
}) {
  return (
    <FilesHeader
      empty={b.isEmpty}
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
      query={b.query}
      onQueryChange={b.setQuery}
      searchPlaceholder={l.searchPlaceholder}
      searchClearLabel={l.searchClear}
      viewGridLabel={l.viewGrid}
      viewListLabel={l.viewList}
      breadcrumbsLabel={l.breadcrumbs}
      newMenuLabel={l.newMenu}
      onNewFolder={props.onCreateFolder ? b.startCreatingFolder : undefined}
      newFolderLabel={l.newFolder}
      onUpload={b.uploadHere}
      onUploadFolder={b.uploadFolderHere}
      uploadFilesLabel={l.uploadFiles}
      uploadFolderLabel={l.uploadFolder}
      onRevealAgent={props.onRevealAgent}
      revealAgentLabel={l.openInFileManager}
      onDownloadAll={props.onDownloadAll}
      downloadAllLabel={l.downloadAll}
      uploading={props.uploading}
      uploadingLabel={l.uploadingBusy}
    />
  );
}
