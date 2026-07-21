/**
 * FilesBody — the current view (grid or list) for the resolved folder, or the
 * loading notice. Chrome (header, scroll container, drop tinting, background
 * menu) stays in FilesBrowser; this owns only which view renders and forwards
 * the shared callbacks to it.
 */
import type { FilesBrowserProps } from "./files-browser";
import {
  type FilesBrowserLabels,
  toColumnLabels,
  toGridLabels,
} from "./files-browser-labels";
import { FilesGrid } from "./files-grid";
import { FilesListView } from "./files-list-view";
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
  if (props.loading || !b.tree || !b.currentFolder) {
    return (
      <div className="flex items-center justify-center py-16">
        <p className="text-sm text-ink-muted/50">{l.loading}</p>
      </div>
    );
  }

  const onCreateFolder = props.onCreateFolder ? b.createFolderAt : undefined;
  const onCancelCreateFolder = () => b.setCreatingFolder(false);

  return b.view === "grid" ? (
    <FilesGrid
      folder={b.currentFolder}
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
      tree={b.tree}
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
    />
  );
}
