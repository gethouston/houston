/**
 * Inline-create chip: a folder chip under active edit, whose name is the
 * input. Enter/blur commits, Escape cancels. It sits with the folders group,
 * where the folder it becomes will live. The emphasis ring is no longer a
 * selection state anywhere on the grid, so here it says one thing only: this
 * is the chip you are typing into.
 */
import { cn } from "@houston-ai/core";
import { useEffect, useRef, useState } from "react";
import { chipClass } from "./card-chrome";
import { FolderGlyph } from "./file-type-icons";

export function NewFolderChip({
  onConfirm,
  onCancel,
  placeholder,
}: {
  onConfirm: (name: string) => void;
  onCancel: () => void;
  placeholder: string;
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
    <div className={cn(chipClass({}), "bg-chip-subtle ring-2 ring-action")}>
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
  );
}
