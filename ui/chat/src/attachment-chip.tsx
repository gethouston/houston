/**
 * Internal pieces used by ChatInput. Not exported from the package index.
 *  - AttachmentChip: rich attachment card with type icon + remove button
 *  - ComposerTrailing: dictate / voice / submit button row
 */

import {
  FileSpreadsheetIcon,
  FileTextIcon,
  ImageIcon,
  FileIcon as LucideFileIcon,
  MicIcon,
  XIcon,
} from "lucide-react";
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

/** File type icon matching @houston-ai/agent's FileRow icons. */
export function AttachmentIcon({ ext }: { ext: string }) {
  if (ext === "pdf") {
    return (
      <div className="size-8 rounded-md bg-[#E5252A] flex items-center justify-center shrink-0">
        <svg
          className="size-4"
          viewBox="0 0 16 16"
          fill="none"
          role="img"
          aria-label="PDF"
        >
          <text
            x="8"
            y="11.5"
            textAnchor="middle"
            fill="white"
            fontSize="8"
            fontWeight="700"
            fontFamily="system-ui, sans-serif"
          >
            PDF
          </text>
        </svg>
      </div>
    );
  }
  if (["xlsx", "xls", "csv"].includes(ext)) {
    return (
      <div className="size-8 rounded-md bg-[#34A853] flex items-center justify-center shrink-0">
        <FileSpreadsheetIcon className="size-4 text-white" strokeWidth={2} />
      </div>
    );
  }
  if (["doc", "docx", "txt", "rtf"].includes(ext)) {
    return (
      <div className="size-8 rounded-md bg-[#4285F4] flex items-center justify-center shrink-0">
        <FileTextIcon className="size-4 text-white" strokeWidth={2} />
      </div>
    );
  }
  if (
    ["png", "jpg", "jpeg", "gif", "svg", "webp", "tif", "tiff"].includes(ext)
  ) {
    return (
      <div className="size-8 rounded-md bg-[#9333EA] flex items-center justify-center shrink-0">
        <ImageIcon className="size-4 text-white" strokeWidth={2} />
      </div>
    );
  }
  return (
    <div className="size-8 rounded-md bg-stone-400 flex items-center justify-center shrink-0">
      <LucideFileIcon className="size-4 text-white" strokeWidth={2} />
    </div>
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

export interface ComposerTrailingProps {
  status: "ready" | "streaming" | "submitted";
  hasContent: boolean;
  onStop?: () => void;
  /** When absent (e.g. the web build) no mic affordance renders at all. */
  dictation?: DictationControl;
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

  const submitDisabled = status === "ready" && !hasContent;
  return (
    <div className="flex items-center gap-1.5 [grid-area:trailing]">
      {view.kind === "idle" && status === "ready" && dictation && (
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
