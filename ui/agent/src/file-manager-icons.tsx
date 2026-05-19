/**
 * macOS Finder-style file icons and disclosure triangle.
 * SVGs designed to match Finder's 16x16 list-view icons.
 */
import type { ReactNode } from "react"
import { cn } from "@houston-ai/core"

const IC = "size-4 shrink-0"

// Shared document outline
const BODY =
  "M3.5 1.5C3.5 1.22 3.72 1 4 1H10L13 4V14.5C13 14.78 12.78 15 12.5 15H4C3.72 15 3.5 14.78 3.5 14.5V1.5Z"
const FOLD =
  "M10 1L13 4H10.5C10.22 4 10 3.78 10 3.5V1Z"

function DocBase({ children }: { children?: ReactNode }) {
  return (
    <svg className={IC} viewBox="0 0 16 16" fill="none">
      <path d={BODY} fill="white" stroke="#BEBEBE" strokeWidth="0.6" />
      <path
        d={FOLD}
        fill="#E8E8E8"
        stroke="#BEBEBE"
        strokeWidth="0.6"
        strokeLinejoin="round"
      />
      {children}
    </svg>
  )
}

/** Blue macOS folder */
export function FolderIcon() {
  return (
    <svg className={IC} viewBox="0 0 16 16" fill="none">
      <path
        d="M1.5 3C1.5 2.45 1.95 2 2.5 2H6.29L7.79 3.5H13.5C14.05 3.5 14.5 3.95 14.5 4.5V13C14.5 13.55 14.05 14 13.5 14H2.5C1.95 14 1.5 13.55 1.5 13V3Z"
        fill="#A0D0F8"
      />
      <path
        d="M1.5 5.5C1.5 4.95 1.95 4.5 2.5 4.5H13.5C14.05 4.5 14.5 4.95 14.5 5.5V13C14.5 13.55 14.05 14 13.5 14H2.5C1.95 14 1.5 13.55 1.5 13V5.5Z"
        fill="#5DB5F5"
      />
    </svg>
  )
}

/** White document (generic) */
export function DocumentIcon() {
  return <DocBase />
}

/** Red-badged PDF document */
export function PdfIcon() {
  return (
    <DocBase>
      <rect x="4.5" y="9" width="7" height="4.5" rx="0.5" fill="#E5252A" />
      <text
        x="8"
        y="12.5"
        textAnchor="middle"
        fill="white"
        fontSize="4"
        fontWeight="700"
        fontFamily="system-ui, sans-serif"
      >
        PDF
      </text>
    </DocBase>
  )
}

/** Image document with landscape */
export function ImageDocIcon() {
  return (
    <DocBase>
      <path d="M5 12.5L7.5 8.5L9 10.5L10 9L12 12.5H5Z" fill="#4CAF50" opacity="0.6" />
      <circle cx="10.5" cy="7" r="1" fill="#FFC107" opacity="0.6" />
    </DocBase>
  )
}

/** Code document with angle brackets */
export function CodeDocIcon() {
  return (
    <DocBase>
      <path
        d="M7 7L5.5 9.5L7 12"
        stroke="#777"
        strokeWidth="0.8"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M9.5 7L11 9.5L9.5 12"
        stroke="#777"
        strokeWidth="0.8"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </DocBase>
  )
}

/** Spreadsheet with green grid */
export function SheetDocIcon() {
  return (
    <DocBase>
      <rect x="5" y="7" width="6.5" height="5.5" rx="0.3" fill="none" stroke="#34A853" strokeWidth="0.6" />
      <line x1="7.2" y1="7" x2="7.2" y2="12.5" stroke="#34A853" strokeWidth="0.4" />
      <line x1="9.3" y1="7" x2="9.3" y2="12.5" stroke="#34A853" strokeWidth="0.4" />
      <line x1="5" y1="9" x2="11.5" y2="9" stroke="#34A853" strokeWidth="0.4" />
      <line x1="5" y1="10.8" x2="11.5" y2="10.8" stroke="#34A853" strokeWidth="0.4" />
    </DocBase>
  )
}

/** Archive/zip document */
export function ArchiveDocIcon() {
  return (
    <DocBase>
      <rect x="7.2" y="5.5" width="1.6" height="1" rx="0.2" fill="#999" />
      <rect x="7.2" y="7.5" width="1.6" height="1" rx="0.2" fill="#999" />
      <rect x="7.2" y="9.5" width="1.6" height="1" rx="0.2" fill="#999" />
      <rect x="6.8" y="11.5" width="2.4" height="2" rx="0.5" fill="#999" />
    </DocBase>
  )
}

/** Chevron disclosure indicator (rotates 90deg when open) */
export function DisclosureChevron({
  open,
  className,
}: {
  open: boolean
  className?: string
}) {
  return (
    <svg
      className={cn(
        "size-[10px] shrink-0 transition-transform duration-150",
        open && "rotate-90",
        className,
      )}
      viewBox="0 0 10 10"
      fill="none"
      stroke="#8e8e8e"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3.5 1.5L7 5L3.5 8.5" />
    </svg>
  )
}

// --- Extension mapping ---

const IMAGE_EXT = new Set(["png", "jpg", "jpeg", "gif", "svg", "webp", "ico", "bmp", "tiff", "heic"])
const CODE_EXT = new Set(["js", "ts", "tsx", "jsx", "rs", "py", "go", "rb", "sh", "c", "cpp", "h", "java", "swift", "kt", "html", "css", "scss", "vue", "svelte"])
const SHEET_EXT = new Set(["xlsx", "xls", "csv", "numbers", "ods"])
const ARCHIVE_EXT = new Set(["zip", "gz", "tar", "7z", "rar", "dmg", "iso"])

/** Return the appropriate Finder-style icon for a file extension. */
export function getFileIcon(extension: string): ReactNode {
  const ext = extension.toLowerCase()
  if (ext === "pdf") return <PdfIcon />
  if (IMAGE_EXT.has(ext)) return <ImageDocIcon />
  if (CODE_EXT.has(ext)) return <CodeDocIcon />
  if (SHEET_EXT.has(ext)) return <SheetDocIcon />
  if (ARCHIVE_EXT.has(ext)) return <ArchiveDocIcon />
  return <DocumentIcon />
}
