/**
 * Internal pieces used by ChatInput. Not exported from the package index.
 *  - AttachmentChip: rich attachment card with type icon + remove button
 *  - FolderAttachmentChip: one chip for a whole attached folder
 * The send row beside them lives in `composer-trailing.tsx`.
 */

import { FileTypeGlyphInline, FolderGlyph } from "@houston-ai/core";
import { XIcon } from "lucide-react";
import {
  AttachmentProgress,
  type AttachmentProgressLabels,
  type AttachmentUploadProgress,
} from "./attachment-progress";

export function getExt(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot >= 0 ? name.slice(dot + 1).toLowerCase() : "";
}

export function getTypeLabel(ext: string): string {
  const map: Record<string, string> = {
    pdf: "PDF",
    doc: "Word",
    docx: "Word",
    txt: "Text",
    rtf: "Rich Text",
    csv: "Spreadsheet",
    xls: "Excel",
    xlsx: "Excel",
    png: "Image",
    jpg: "Image",
    jpeg: "Image",
    gif: "Image",
    svg: "Image",
    zip: "Zip Archive",
    rar: "Archive",
    "7z": "Archive",
  };
  return map[ext] ?? (ext ? ext.toUpperCase() : "File");
}

/**
 * The chip's icon column. Fixed at 32px whatever mark lands in it, so the name
 * and type lines beside it sit at the same x in every chip of a row.
 */
const ICON_SLOT = "flex size-8 shrink-0 items-center justify-center";

/** 20px in a 32px slot: the Files list's glyph-to-slot proportion. */
const GLYPH = "size-5";

/**
 * File identity drawn the way the Files list and chat's file chips draw it: the
 * bare Lucide glyph tinted with its `filetype` token (DESIGN.md §4), with the
 * extension classified by `@houston-ai/core` so a chip and a list row never
 * disagree about what a file is.
 */
export function AttachmentIcon({ ext }: { ext: string }) {
  return (
    <span className={ICON_SLOT}>
      <FileTypeGlyphInline extension={ext} className={GLYPH} />
    </span>
  );
}

export interface AttachmentChipProps {
  name: string;
  progress?: AttachmentUploadProgress;
  labels?: AttachmentProgressLabels;
  onRemove: () => void;
  /** The remove button's name for `name`; English default. */
  removeLabel?: (name: string) => string;
}

const defaultRemoveLabel = (name: string) => `Remove ${name}`;

export function AttachmentChip({
  name,
  onRemove,
  removeLabel = defaultRemoveLabel,
  progress,
  labels,
}: AttachmentChipProps) {
  const ext = getExt(name);
  return (
    <div className="relative flex items-center gap-2.5 rounded-xl border border-ink/[0.08] bg-input pl-2.5 pr-8 py-2 min-w-0 shrink-0 max-w-[240px] shadow-sm">
      <AttachmentIcon ext={ext} />
      <div className="min-w-0">
        <p className="text-xs font-medium text-ink truncate leading-tight">
          {name}
        </p>
        <p className="text-[10px] text-ink-muted leading-tight">
          {getTypeLabel(ext)}
        </p>
        {progress && (
          <AttachmentProgress name={name} progress={progress} labels={labels} />
        )}
      </div>
      <button
        type="button"
        onClick={onRemove}
        className="absolute top-1.5 right-1.5 size-4 rounded-full bg-ink/60 text-input flex items-center justify-center hover:bg-ink/80 transition-colors"
        aria-label={removeLabel(name)}
      >
        <XIcon className="size-2.5" strokeWidth={3} />
      </button>
    </div>
  );
}

export interface FolderAttachmentChipProps {
  name: string;
  progress?: AttachmentUploadProgress;
  labels?: AttachmentProgressLabels;
  /** Localized "N files" line under the folder name (HOU-808). */
  countLabel: string;
  onRemove: () => void;
  removeLabel?: (name: string) => string;
}

/** A whole attached folder as ONE chip — its files upload together and are
 *  removed together. Same card anatomy as AttachmentChip. */
export function FolderAttachmentChip({
  name,
  countLabel,
  onRemove,
  removeLabel = defaultRemoveLabel,
  progress,
  labels,
}: FolderAttachmentChipProps) {
  return (
    <div className="relative flex items-center gap-2.5 rounded-xl border border-ink/[0.08] bg-input pl-2.5 pr-8 py-2 min-w-0 shrink-0 max-w-[240px] shadow-sm">
      <span className={ICON_SLOT}>
        {/* A folder is not a file type, so it keeps the monochrome glyph. */}
        <FolderGlyph small className={GLYPH} />
      </span>
      <div className="min-w-0">
        <p className="text-xs font-medium text-ink truncate leading-tight">
          {name}
        </p>
        <p className="text-[10px] text-ink-muted leading-tight">{countLabel}</p>
        {progress && (
          <AttachmentProgress name={name} progress={progress} labels={labels} />
        )}
      </div>
      <button
        type="button"
        onClick={onRemove}
        className="absolute top-1.5 right-1.5 size-4 rounded-full bg-ink/60 text-input flex items-center justify-center hover:bg-ink/80 transition-colors"
        aria-label={removeLabel(name)}
      >
        <XIcon className="size-2.5" strokeWidth={3} />
      </button>
    </div>
  );
}
