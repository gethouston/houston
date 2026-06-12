/**
 * Finder-style file and folder rows.
 * Files: click to select, double-click to open, right-click context menu, draggable.
 * Folders: click to expand/collapse, drop target for moves.
 */
import { useEffect, useRef, useState } from "react"
import { cn } from "@houston-ai/core"
import type { FileEntry } from "./types"
import type { FolderNode } from "./tree"
import { INTERNAL_DRAG_TYPE, useFolderDropTarget } from "./drop-zone"
import { FolderIcon, DisclosureChevron, getFileIcon } from "./file-manager-icons"
import { formatSize, formatFileManagerDate, getKind } from "./utils"
import { FileMenu, type FileMenuLabels } from "./file-menu"

const DEPTH_INDENT = 20
const BASE_INDENT = 12
const TRIANGLE_AREA = 16

/** Column grid shared between header and rows. */
export const COL_GRID = "1fr 190px 80px 130px"

export function FolderSection({
  node, depth, selectedPath, onSelect, onOpen, onReveal, onDownload, onDelete,
  onRename, onFilesDropped, onDragActive, onMove, menuLabels,
}: {
  node: FolderNode
  depth: number
  selectedPath?: string | null
  onSelect?: (file: FileEntry) => void
  onOpen?: (file: FileEntry) => void
  onReveal?: (file: FileEntry) => void
  onDownload?: (file: FileEntry) => void
  onDelete?: (file: FileEntry) => void
  onRename?: (file: FileEntry, newName: string) => void
  onFilesDropped?: (files: File[], targetFolder?: string) => void
  onDragActive?: (folder: string | null) => void
  onMove?: (sourcePath: string, targetFolder: string | null) => void
  menuLabels?: FileMenuLabels
}) {
  const [open, setOpen] = useState(true)
  const [dragging, setDragging] = useState(false)
  const { isOver, folderHandlers } = useFolderDropTarget()

  useEffect(() => {
    onDragActive?.(isOver ? node.path : null)
  }, [isOver, node.path, onDragActive])

  const padLeft = BASE_INDENT + depth * DEPTH_INDENT

  return (
    <>
      <div
        role="button"
        tabIndex={0}
        draggable={!!onMove}
        onDragStart={(e) => { e.dataTransfer.setData(INTERNAL_DRAG_TYPE, node.path); e.dataTransfer.effectAllowed = "move"; setDragging(true) }}
        onDragEnd={() => setDragging(false)}
        onClick={() => setOpen(!open)}
        onKeyDown={(e) => e.key === "Enter" && setOpen(!open)}
        className={cn(
          "h-[24px] select-none cursor-default items-center",
          isOver ? "!bg-[rgba(0,122,255,0.12)] !rounded-lg" : "",
          dragging && "opacity-40",
        )}
        style={{ display: "grid", gridTemplateColumns: COL_GRID }}
        {...folderHandlers}
      >
        <div className="flex items-center gap-1.5 min-w-0" style={{ paddingLeft: padLeft }}>
          <DisclosureChevron open={open} />
          <FolderIcon />
          <span className="text-[13px] truncate">{node.name}</span>
        </div>
        <span className="text-[11px] text-muted-foreground truncate px-2">{"\u2014"}</span>
        <span className="text-[11px] text-muted-foreground text-right px-2">--</span>
        <span className="text-[11px] text-muted-foreground truncate px-2">Folder</span>
      </div>
      {open &&
        node.children.map((child) =>
          child.kind === "folder" ? (
            <FolderSection
              key={child.path} node={child} depth={depth + 1}
              selectedPath={selectedPath} onSelect={onSelect}
              onOpen={onOpen} onReveal={onReveal} onDownload={onDownload} onDelete={onDelete}
              onRename={onRename}
              onFilesDropped={onFilesDropped} onDragActive={onDragActive} onMove={onMove}
              menuLabels={menuLabels}
            />
          ) : (
            <FileRow
              key={child.entry.path} file={child.entry} depth={depth + 1}
              selected={selectedPath === child.entry.path}
              onSelect={onSelect} onOpen={onOpen}
              onReveal={onReveal} onDownload={onDownload} onDelete={onDelete} onRename={onRename} onMove={onMove}
              menuLabels={menuLabels}
            />
          ),
        )}
    </>
  )
}

export function FileRow({
  file, depth = 0, selected, onSelect, onOpen, onReveal, onDownload, onDelete, onRename, onMove, menuLabels,
}: {
  file: FileEntry
  depth?: number
  selected?: boolean
  onSelect?: (file: FileEntry) => void
  onOpen?: (file: FileEntry) => void
  onReveal?: (file: FileEntry) => void
  onDownload?: (file: FileEntry) => void
  onDelete?: (file: FileEntry) => void
  onRename?: (file: FileEntry, newName: string) => void
  onMove?: (sourcePath: string, targetFolder: string | null) => void
  menuLabels?: FileMenuLabels
}) {
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null)
  const [dragging, setDragging] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const [renameValue, setRenameValue] = useState("")
  const renameRef = useRef<HTMLInputElement>(null)
  const padLeft = BASE_INDENT + depth * DEPTH_INDENT + TRIANGLE_AREA
  const hasMenu = onOpen || onReveal || onDownload || onDelete
  const sec = selected ? "text-primary-foreground/80" : "text-muted-foreground"

  const startRename = () => {
    if (!onRename) return
    setRenameValue(file.name)
    setRenaming(true)
    requestAnimationFrame(() => {
      const input = renameRef.current
      if (!input) return
      input.focus()
      const dot = file.name.lastIndexOf(".")
      input.setSelectionRange(0, dot > 0 ? dot : file.name.length)
    })
  }

  const commitRename = () => {
    const trimmed = renameValue.trim()
    setRenaming(false)
    if (trimmed && trimmed !== file.name) onRename?.(file, trimmed)
  }

  return (
    <>
      <div
        role="row"
        tabIndex={0}
        draggable={!!onMove && !renaming}
        onDragStart={(e) => { e.dataTransfer.setData(INTERNAL_DRAG_TYPE, file.path); e.dataTransfer.effectAllowed = "move"; setDragging(true) }}
        onDragEnd={() => setDragging(false)}
        onClick={() => !renaming && onSelect?.(file)}
        onDoubleClick={() => !renaming && onOpen?.(file)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && selected && !renaming) { e.preventDefault(); startRename() }
          if (e.key === "Escape" && renaming) setRenaming(false)
        }}
        onContextMenu={(e) => {
          if (!hasMenu || renaming) return
          e.preventDefault()
          onSelect?.(file)
          setMenu({ x: e.clientX, y: e.clientY })
        }}
        data-selected={selected || undefined}
        className={cn(
          "h-[24px] cursor-default select-none items-center outline-none",
          selected && "!bg-[#2068d0] text-white rounded-lg",
          dragging && "opacity-40",
        )}
        style={{ display: "grid", gridTemplateColumns: COL_GRID }}
      >
        <div className="flex items-center gap-1.5 min-w-0" style={{ paddingLeft: padLeft }}>
          {getFileIcon(file.extension)}
          {renaming ? (
            <input
              ref={renameRef}
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") { e.preventDefault(); commitRename() }
                if (e.key === "Escape") { e.stopPropagation(); setRenaming(false) }
              }}
              onBlur={commitRename}
              className="flex-1 text-[13px] bg-white text-[#0d0d0d] outline-none rounded px-1 -ml-1 min-w-0 border border-[#2068d0] shadow-sm"
            />
          ) : (
            <span className="text-[13px] truncate">{file.name}</span>
          )}
        </div>
        <span className={cn("text-[11px] truncate px-2", sec)}>{formatFileManagerDate(file.dateModified)}</span>
        <span className={cn("text-[11px] text-right px-2", sec)}>{formatSize(file.size)}</span>
        <span className={cn("text-[11px] truncate px-2", sec)}>{getKind(file.extension)}</span>
      </div>
      {menu && (
        <FileMenu
          file={file} position={menu}
          onClose={() => setMenu(null)}
          onOpen={onOpen} onRename={onRename ? startRename : undefined} onReveal={onReveal} onDownload={onDownload} onDelete={onDelete}
          labels={menuLabels}
        />
      )}
    </>
  )
}
