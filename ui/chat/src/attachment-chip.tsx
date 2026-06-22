/**
 * Internal pieces used by ChatInput. Not exported from the package index.
 *  - AttachmentChip: rich attachment card with type icon + remove button
 *  - ComposerTrailing: dictate / voice / submit button row
 */

import {
  FileSpreadsheetIcon,
  FileTextIcon,
  ImageIcon,
  MicIcon,
  XIcon,
  FileIcon as LucideFileIcon,
} from "lucide-react";
import { PromptInputSubmit } from "./ai-elements/prompt-input";

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
        <svg className="size-4" viewBox="0 0 16 16" fill="none">
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
    <div className="relative flex items-center gap-2.5 rounded-xl border border-black/[0.08] bg-background pl-2.5 pr-8 py-2 min-w-0 shrink-0 max-w-[240px] shadow-sm">
      <AttachmentIcon ext={ext} />
      <div className="min-w-0">
        <p className="text-xs font-medium text-foreground truncate leading-tight">
          {name}
        </p>
        <p className="text-[10px] text-muted-foreground leading-tight">
          {getTypeLabel(ext)}
        </p>
      </div>
      <button
        type="button"
        onClick={onRemove}
        className="absolute top-1.5 right-1.5 size-4 rounded-full bg-foreground/60 text-background flex items-center justify-center hover:bg-foreground/80 transition-colors"
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
}

/**
 * Trailing button row: dictate (idle, optional) + always-visible submit.
 *
 * The submit button is rendered as `disabled` when there's no content to
 * send, which keeps the affordance stable in the same spot. The previous
 * "voice mode" wave icon was removed because it wasn't wired to anything.
 */
export function ComposerTrailing({
  status,
  hasContent,
  onStop,
}: ComposerTrailingProps) {
  return (
    <div className="flex items-center gap-1.5 [grid-area:trailing]">
      {status === "ready" && (
        <button
          type="button"
          className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground hover:bg-accent transition-colors"
          aria-label="Dictate"
        >
          <MicIcon className="size-5" />
        </button>
      )}
      <PromptInputSubmit
        status={status}
        onStop={onStop}
        disabled={status === "ready" && !hasContent}
      />
    </div>
  );
}
