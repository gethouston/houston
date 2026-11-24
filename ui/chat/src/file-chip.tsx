import { cn, FileTypeGlyphInline } from "@houston-ai/core";
import type { ReactNode } from "react";
import { extensionOf } from "./file-path";

const FILE_CHIP_CLASS = cn(
  "inline-flex max-w-full items-center gap-1.5 align-[-3px]",
  "rounded border border-line bg-chip px-1.5 py-0.5 text-ink",
  "transition-colors duration-200 hover:bg-hover",
  "[overflow-wrap:anywhere]",
);

export interface FileChipProps {
  /** Workspace-relative path — the tooltip, and what picks the type glyph. */
  path: string;
  /** Opens the file (in-app preview, or the OS on a co-located desktop). */
  onOpen: () => void;
  /** The agent's own label, or the file name when it wrote the path as the
   *  label. The glyph already says "file", so the text is free to read as
   *  prose. */
  children: ReactNode;
}

export function FileChip({ path, onOpen, children }: FileChipProps) {
  return (
    <button
      type="button"
      title={path}
      className={FILE_CHIP_CLASS}
      onClick={(e) => {
        e.preventDefault();
        onOpen();
      }}
    >
      <FileTypeGlyphInline extension={extensionOf(path)} />
      <span className="min-w-0 truncate">{children}</span>
    </button>
  );
}
