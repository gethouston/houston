/**
 * Inline new-folder input: a list row being named. It keeps the emphasis ring
 * a row under active edit deserves — that ring is no longer a SELECTION state
 * anywhere else, so it now says exactly one thing: this row is what you are
 * typing into.
 */
import { cn, FolderGlyph } from "@houston-ai/core";
import { useEffect, useRef, useState } from "react";
import {
  colGrid,
  NAME_CELL_INNER,
  NAME_TEXT,
  ROW_CLASS,
  ROW_TILE_GLYPH,
} from "./files-list-chrome";
import { DisclosureChevron, RowIndent } from "./files-list-indent";

/** The row being named: filled and ringed, so the caret is never hunted for. */
const NAMING_ROW = "bg-chip-subtle ring-2 ring-action";

export function NewFolderInput({
  onConfirm,
  onCancel,
  placeholder = "untitled folder",
}: {
  onConfirm: (name: string) => void;
  onCancel: () => void;
  placeholder?: string;
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
      className={cn(ROW_CLASS, "hover:bg-transparent", NAMING_ROW)}
      style={{
        display: "grid",
        gridTemplateColumns: colGrid(),
      }}
    >
      <div className="flex h-full min-w-0 items-center">
        <RowIndent depth={0} />
        {/* Invisible, not absent: the row keeps the exact geometry of the
            folder row it is about to become. */}
        <DisclosureChevron open={false} className="invisible mr-1" />
        <div className={NAME_CELL_INNER}>
          <FolderGlyph small className={ROW_TILE_GLYPH} />
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
            className={cn(
              "min-w-0 flex-1 bg-transparent outline-none placeholder:text-ink-muted/60",
              NAME_TEXT,
            )}
          />
        </div>
      </div>
      {/* Modified, Size and the actions column: a folder being named has
          nothing true to say in any of them. */}
      <span />
      <span />
      <span />
    </div>
  );
}
