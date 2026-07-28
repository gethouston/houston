/**
 * Drive-style folder card: same shell as a file card, folder glyph body.
 * Click navigates into the folder; kebab/right-click offers rename,
 * download-as-zip and delete; it is also a drop target for moves and
 * uploads. NewFolderCard is the inline-create variant.
 *
 * The kebab lives in the shell's actions slot, OUTSIDE the role="button"
 * surface: a button's children are presentational, so a nested kebab would be
 * invisible to assistive tech.
 */
import { useEffect, useState } from "react";
import {
  CardActions,
  CardMeta,
  CardShell,
  cardClass,
  cardHeaderClass,
  cardPreviewClass,
  KebabButton,
} from "./card-chrome";
import { INTERNAL_DRAG_TYPE, useFolderDropTarget } from "./drop-zone";
import { FileMenu, type FileMenuLabels } from "./file-menu";
import { FolderGlyph } from "./file-type-icons";
import { RenameInput, useInlineRename } from "./inline-rename";
import type { FolderNode } from "./tree";
import type { FileEntry } from "./types";
import { formatFileManagerDate } from "./utils";

export function FolderCard({
  node,
  onNavigate,
  onDownloadFolder,
  onDelete,
  onRename,
  onMove,
  onDragActive,
  menuLabels,
  menuButtonLabel,
  itemsLabel,
}: {
  node: FolderNode;
  onNavigate: (path: string) => void;
  onDownloadFolder?: (folder: FileEntry) => void;
  onDelete?: (folder: FileEntry) => void;
  onRename?: (folder: FileEntry, newName: string) => void;
  onMove?: (sourcePath: string, targetFolder: string | null) => void;
  onDragActive?: (folder: string | null) => void;
  menuLabels?: FileMenuLabels;
  menuButtonLabel?: string;
  /** Pre-pluralized child count, e.g. "3 items". */
  itemsLabel: string;
}) {
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const { isOver, folderHandlers } = useFolderDropTarget();

  useEffect(() => {
    onDragActive?.(isOver ? node.path : null);
  }, [isOver, node.path, onDragActive]);

  // The menu reuses FileMenu, which speaks FileEntry — implied parent folders
  // have no listing entry, so synthesize one from the node.
  const folderEntry: FileEntry = node.entry ?? {
    path: node.path,
    name: node.name,
    extension: "",
    size: 0,
    is_directory: true,
  };
  const rename = useInlineRename(
    node.name,
    onRename ? (newName) => onRename(folderEntry, newName) : undefined,
  );
  const hasMenu = onDownloadFolder || onDelete || onRename;

  return (
    <CardShell>
      {/* biome-ignore lint/a11y/useSemanticElements: a native <button> cannot wrap the rename input; role=button + tabIndex keeps the card keyboard-reachable */}
      <div
        role="button"
        tabIndex={0}
        draggable={!!onMove && !rename.renaming}
        onDragStart={(e) => {
          e.dataTransfer.setData(INTERNAL_DRAG_TYPE, node.path);
          e.dataTransfer.effectAllowed = "move";
          setDragging(true);
        }}
        onDragEnd={() => setDragging(false)}
        onClick={() => !rename.renaming && onNavigate(node.path)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !rename.renaming) {
            e.preventDefault();
            onNavigate(node.path);
          }
          if (e.key === "Escape" && rename.renaming) rename.cancel();
        }}
        onContextMenu={(e) => {
          if (!hasMenu || rename.renaming) return;
          e.preventDefault();
          setMenu({ x: e.clientX, y: e.clientY });
        }}
        className={cardClass({ dragging, dropTarget: isOver })}
        {...folderHandlers}
      >
        <div className={cardHeaderClass(!!hasMenu)}>
          <FolderGlyph small />
          {rename.renaming ? (
            <RenameInput rename={rename} />
          ) : (
            <span className="min-w-0 flex-1 truncate text-sm" title={node.name}>
              {node.name}
            </span>
          )}
        </div>
        <div className={`${cardPreviewClass} flex items-center justify-center`}>
          <FolderGlyph />
        </div>
        <CardMeta
          left={formatFileManagerDate(node.entry?.dateModified)}
          right={itemsLabel}
        />
      </div>
      {hasMenu && (
        <CardActions>
          <KebabButton label={menuButtonLabel} onOpen={setMenu} />
        </CardActions>
      )}
      {menu && (
        <FileMenu
          file={folderEntry}
          position={menu}
          onClose={() => setMenu(null)}
          onRename={onRename ? rename.start : undefined}
          onDownload={onDownloadFolder}
          onDelete={onDelete}
          labels={menuLabels}
        />
      )}
    </CardShell>
  );
}
