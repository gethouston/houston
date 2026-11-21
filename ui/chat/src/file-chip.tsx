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
  path: string;
  onOpen: () => void;
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
