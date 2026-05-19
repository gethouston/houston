/**
 * Lightweight right-click context menu for file rows.
 * Portal-based — renders at cursor position, closes on outside click or Escape.
 */
import type { ReactNode } from "react"
import { createPortal } from "react-dom"
import { ExternalLink, FolderSearch, Pencil, Trash2 } from "lucide-react"
import type { FileEntry } from "./types"

export interface FileMenuLabels {
  open?: string
  rename?: string
  reveal?: string
  delete?: string
}

const DEFAULT_LABELS: Required<FileMenuLabels> = {
  open: "Open",
  rename: "Rename",
  reveal: "Show in File Manager",
  delete: "Move to Trash",
}

export function FileMenu({
  file,
  position,
  onClose,
  onOpen,
  onRename,
  onReveal,
  onDelete,
  labels,
}: {
  file: FileEntry
  position: { x: number; y: number }
  onClose: () => void
  onOpen?: (file: FileEntry) => void
  onRename?: () => void
  onReveal?: (file: FileEntry) => void
  onDelete?: (file: FileEntry) => void
  labels?: FileMenuLabels
}) {
  const l = { ...DEFAULT_LABELS, ...labels }
  return createPortal(
    <>
      <div
        className="fixed inset-0 z-40"
        onClick={onClose}
        onContextMenu={(e) => { e.preventDefault(); onClose() }}
      />
      <div
        className="fixed z-50 min-w-[160px] rounded-md border bg-popover p-1 text-popover-foreground shadow-md"
        style={{ left: position.x, top: position.y }}
        onKeyDown={(e) => e.key === "Escape" && onClose()}
      >
        {onOpen && (
          <MenuItem onClick={() => { onOpen(file); onClose() }} icon={<ExternalLink />} label={l.open} />
        )}
        {onRename && (
          <MenuItem onClick={() => { onRename(); onClose() }} icon={<Pencil />} label={l.rename} />
        )}
        {onReveal && (
          <MenuItem onClick={() => { onReveal(file); onClose() }} icon={<FolderSearch />} label={l.reveal} />
        )}
        {(onOpen || onRename || onReveal) && onDelete && <div className="-mx-1 my-1 h-px bg-border" />}
        {onDelete && (
          <MenuItem onClick={() => { onDelete(file); onClose() }} icon={<Trash2 />} label={l.delete} destructive />
        )}
      </div>
    </>,
    document.body,
  )
}

function MenuItem({ onClick, icon, label, destructive }: {
  onClick: () => void
  icon: ReactNode
  label: string
  destructive?: boolean
}) {
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none select-none hover:bg-accent [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-muted-foreground ${destructive ? "text-destructive [&_svg]:text-destructive" : ""}`}
    >
      {icon}
      {label}
    </button>
  )
}
