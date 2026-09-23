/**
 * Internal pieces used by ChatInput. Not exported from the package index.
 *  - AttachmentChip: rich attachment card with type icon + remove button
 *  - ComposerTrailing: dictate / voice / submit button row
 */

import { FileTypeGlyphInline, FolderGlyph } from "@houston-ai/core";
import { MicIcon, XIcon } from "lucide-react";
import { PromptInputSubmit } from "./ai-elements/prompt-input";
import { DictationActions, DictationTranscribing } from "./dictation-controls";
import type { DictationControl } from "./dictation-types";
import { isDictationActive, resolveDictationView } from "./dictation-types";

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
  onRemove: () => void;
}

export function AttachmentChip({ name, onRemove }: AttachmentChipProps) {
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
      </div>
      <button
        type="button"
        onClick={onRemove}
        className="absolute top-1.5 right-1.5 size-4 rounded-full bg-ink/60 text-input flex items-center justify-center hover:bg-ink/80 transition-colors"
        aria-label={`Remove ${name}`}
      >
        <XIcon className="size-2.5" strokeWidth={3} />
      </button>
    </div>
  );
}

export interface FolderAttachmentChipProps {
  name: string;
  /** Localized "N files" line under the folder name (HOU-808). */
  countLabel: string;
  onRemove: () => void;
}

/** A whole attached folder as ONE chip — its files upload together and are
 *  removed together. Same card anatomy as AttachmentChip. */
export function FolderAttachmentChip({
  name,
  countLabel,
  onRemove,
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
      </div>
      <button
        type="button"
        onClick={onRemove}
        className="absolute top-1.5 right-1.5 size-4 rounded-full bg-ink/60 text-input flex items-center justify-center hover:bg-ink/80 transition-colors"
        aria-label={`Remove ${name}`}
      >
        <XIcon className="size-2.5" strokeWidth={3} />
      </button>
    </div>
  );
}

export interface ComposerTrailingProps {
  status: "ready" | "streaming" | "submitted";
  hasContent: boolean;
  onStop?: () => void;
  /** When absent (e.g. the web build) no mic affordance renders at all. */
  dictation?: DictationControl;
  /** Locks the composer: submit goes inert and the mic is hidden. */
  disabled?: boolean;
}

/**
 * Trailing button row. Idle/absent: an optional mic button (idle) + the
 * always-visible submit. While a capture is in flight the composer's input row
 * is taken over by the waveform, so this slot swaps to the dictation actions
 * (✕ cancel + ✓ accept, or a transcribing spinner) and hides submit entirely.
 */
export function ComposerTrailing({
  status,
  hasContent,
  onStop,
  dictation,
  disabled = false,
}: ComposerTrailingProps) {
  const view = resolveDictationView(dictation);

  if (isDictationActive(dictation) && dictation) {
    return (
      <div className="flex items-center gap-1.5 [grid-area:trailing]">
        {view.kind === "transcribing" ? (
          <DictationTranscribing label={dictation.labels.transcribing} />
        ) : (
          <DictationActions control={dictation} />
        )}
      </div>
    );
  }

  const submitDisabled = disabled || (status === "ready" && !hasContent);
  return (
    <div className="flex items-center gap-1.5 [grid-area:trailing]">
      {view.kind === "idle" && status === "ready" && !disabled && dictation && (
        <button
          type="button"
          onClick={dictation.onStart}
          className="flex h-9 w-9 items-center justify-center rounded-full text-ink-muted hover:bg-hover transition-colors"
          aria-label={dictation.labels.start}
        >
          <MicIcon className="size-5" />
        </button>
      )}
      <PromptInputSubmit
        status={status}
        onStop={onStop}
        disabled={submitDisabled}
      />
    </div>
  );
}
