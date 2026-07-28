/**
 * Inline new-folder input, styled as a selected folder row.
 */
import { cn } from "@houston-ai/core";
import { useEffect, useRef, useState } from "react";
import { ROW_SELECTED_CLASS } from "./file-row";
import { FolderGlyph } from "./file-type-icons";
import {
  BASE_INDENT,
  COL_GRID,
  DisclosureChevron,
  META_CELL,
} from "./files-list-chrome";

export function NewFolderInput({
  onConfirm,
  onCancel,
  placeholder = "untitled folder",
  kindFolderLabel,
}: {
  onConfirm: (name: string) => void;
  onCancel: () => void;
  placeholder?: string;
  /** The Kind column's word for a folder. */
  kindFolderLabel: string;
}) {
  const [value, setValue] = useState("");
  const committed = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const commit = () => {
    if (committed.current) return;
    const trimmed = value.trim();
    if (trimmed) {
      committed.current = true;
      onConfirm(trimmed);
    } else {
      onCancel();
    }
  };

  return (
    <div
      className={cn("h-8 items-center rounded-lg", ROW_SELECTED_CLASS)}
      style={{ display: "grid", gridTemplateColumns: COL_GRID }}
    >
      <div
        className="flex min-w-0 items-center gap-1.5 pr-1.5"
        style={{ paddingLeft: BASE_INDENT }}
      >
        <DisclosureChevron open={false} className="invisible" />
        <FolderGlyph small />
        <input
          ref={inputRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit();
            if (e.key === "Escape") onCancel();
          }}
          onBlur={commit}
          placeholder={placeholder}
          className="min-w-0 flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-ink-muted/60"
        />
      </div>
      <span />
      <span />
      <span />
      <span className={META_CELL}>{kindFolderLabel}</span>
      <span />
    </div>
  );
}
