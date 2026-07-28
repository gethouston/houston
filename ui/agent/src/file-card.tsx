/**
 * Drive-style file card: type icon + name header, lazy thumbnail body,
 * date meta row. Click selects, double-click opens, kebab or right-click
 * opens the context menu, drag to move. The kebab sits in the shell's actions
 * slot, outside the role="button" surface (whose children are presentational).
 */
import { useState } from "react";
import {
  CardActions,
  CardMeta,
  CardShell,
  cardClass,
  cardHeaderClass,
  cardPreviewClass,
  KebabButton,
} from "./card-chrome";
import { INTERNAL_DRAG_TYPE } from "./drop-zone";
import { CardPreview } from "./file-card-preview";
import { FileMenu, type FileMenuLabels } from "./file-menu";
import { FileTypeIcon } from "./file-type-icons";
import { RenameInput, useInlineRename } from "./inline-rename";
import type { FileEntry, LoadFilePreview } from "./types";
import { formatFileManagerDate } from "./utils";

export function FileCard({
  file,
  selected,
  loadPreview,
  onSelect,
  onOpen,
  onReveal,
  onDownload,
  onDelete,
  onRename,
  onMove,
  menuLabels,
  menuButtonLabel,
}: {
  file: FileEntry;
  selected?: boolean;
  loadPreview?: LoadFilePreview;
  onSelect?: (file: FileEntry) => void;
  onOpen?: (file: FileEntry) => void;
  onReveal?: (file: FileEntry) => void;
  onDownload?: (file: FileEntry) => void;
  onDelete?: (file: FileEntry) => void;
  onRename?: (file: FileEntry, newName: string) => void;
  onMove?: (sourcePath: string, targetFolder: string | null) => void;
  menuLabels?: FileMenuLabels;
  menuButtonLabel?: string;
}) {
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const rename = useInlineRename(
    file.name,
    onRename ? (newName) => onRename(file, newName) : undefined,
  );
  const hasMenu = onOpen || onReveal || onDownload || onDelete || onRename;

  return (
    <CardShell>
      {/* biome-ignore lint/a11y/useSemanticElements: a native <button> cannot wrap the rename input; role=button + tabIndex keeps the card keyboard-reachable */}
      <div
        role="button"
        tabIndex={0}
        draggable={!!onMove && !rename.renaming}
        onDragStart={(e) => {
          e.dataTransfer.setData(INTERNAL_DRAG_TYPE, file.path);
          e.dataTransfer.effectAllowed = "move";
          setDragging(true);
        }}
        onDragEnd={() => setDragging(false)}
        onClick={() => !rename.renaming && onSelect?.(file)}
        onDoubleClick={() => !rename.renaming && onOpen?.(file)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && selected && !rename.renaming) {
            e.preventDefault();
            rename.start();
          }
          if (e.key === "Escape" && rename.renaming) rename.cancel();
        }}
        onContextMenu={(e) => {
          if (!hasMenu || rename.renaming) return;
          e.preventDefault();
          onSelect?.(file);
          setMenu({ x: e.clientX, y: e.clientY });
        }}
        data-selected={selected || undefined}
        className={cardClass({ selected, dragging })}
      >
        <div className={cardHeaderClass(!!hasMenu)}>
          <FileTypeIcon extension={file.extension} />
          {rename.renaming ? (
            <RenameInput rename={rename} />
          ) : (
            <span className="min-w-0 flex-1 truncate text-sm" title={file.name}>
              {file.name}
            </span>
          )}
        </div>
        <div className={cardPreviewClass}>
          <CardPreview file={file} loadPreview={loadPreview} />
        </div>
        <CardMeta left={formatFileManagerDate(file.dateModified)} />
      </div>
      {hasMenu && (
        <CardActions>
          <KebabButton
            label={menuButtonLabel}
            onOpen={(position) => {
              onSelect?.(file);
              setMenu(position);
            }}
          />
        </CardActions>
      )}
      {menu && (
        <FileMenu
          file={file}
          position={menu}
          onClose={() => setMenu(null)}
          onOpen={onOpen}
          onRename={onRename ? rename.start : undefined}
          onReveal={onReveal}
          onDownload={onDownload}
          onDelete={onDelete}
          labels={menuLabels}
        />
      )}
    </CardShell>
  );
}
