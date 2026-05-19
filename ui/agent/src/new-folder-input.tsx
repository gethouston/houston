/**
 * Inline new-folder input, styled as a selected folder row.
 */
import { useRef, useState } from "react"
import { FolderIcon, DisclosureChevron } from "./file-manager-icons"
import { COL_GRID } from "./file-row"

export function NewFolderInput({ onConfirm, onCancel }: {
  onConfirm: (name: string) => void
  onCancel: () => void
}) {
  const [value, setValue] = useState("")
  const committed = useRef(false)

  const commit = () => {
    if (committed.current) return
    const trimmed = value.trim()
    if (trimmed) {
      committed.current = true
      onConfirm(trimmed)
    } else {
      onCancel()
    }
  }

  return (
    <div
      className="h-[24px] bg-[#2068d0] rounded-lg items-center"
      style={{ display: "grid", gridTemplateColumns: COL_GRID }}
    >
      <div className="flex items-center gap-1.5 min-w-0 pl-3">
        <DisclosureChevron open={false} className="invisible" />
        <FolderIcon />
        <input
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit()
            if (e.key === "Escape") onCancel()
          }}
          onBlur={commit}
          placeholder="untitled folder"
          className="flex-1 text-[13px] bg-transparent text-white outline-none placeholder:text-white/50 min-w-0"
        />
      </div>
      <span />
      <span />
      <span className="text-[11px] text-white/70 px-2">Folder</span>
    </div>
  )
}
