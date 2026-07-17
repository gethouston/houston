/**
 * Inline-create card: a selected-looking folder card whose header is the
 * name input. Enter/blur commits, Escape cancels.
 */
import { cn } from "@houston-ai/core";
import { useEffect, useRef, useState } from "react";
import { CardMeta, cardClass, cardPreviewClass } from "./card-chrome";
import { FolderGlyph } from "./folder-card";

export function NewFolderCard({
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
    <div className={cardClass({ selected: true })}>
      <div className="flex h-10 shrink-0 items-center gap-2 pr-1.5 pl-3">
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
          className="min-w-0 flex-1 bg-transparent text-[13px] text-ink outline-none placeholder:text-ink-muted/60"
        />
      </div>
      <div
        className={cn(
          cardPreviewClass,
          "flex items-center justify-center opacity-60",
        )}
      >
        <FolderGlyph />
      </div>
      <CardMeta left="" />
    </div>
  );
}
