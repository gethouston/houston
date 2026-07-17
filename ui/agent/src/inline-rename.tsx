/**
 * Shared inline-rename behavior for file/folder rows and cards: start with
 * the basename selected, Enter commits, Escape cancels, blur commits.
 */
import { cn } from "@houston-ai/core";
import { useRef, useState } from "react";

export interface InlineRename {
  renaming: boolean;
  value: string;
  setValue: (v: string) => void;
  inputRef: React.RefObject<HTMLInputElement | null>;
  start: () => void;
  commit: () => void;
  cancel: () => void;
}

export function useInlineRename(
  name: string,
  onRename?: (newName: string) => void,
): InlineRename {
  const [renaming, setRenaming] = useState(false);
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const start = () => {
    if (!onRename) return;
    setValue(name);
    setRenaming(true);
    requestAnimationFrame(() => {
      const input = inputRef.current;
      if (!input) return;
      input.focus();
      const dot = name.lastIndexOf(".");
      input.setSelectionRange(0, dot > 0 ? dot : name.length);
    });
  };

  const commit = () => {
    const trimmed = value.trim();
    setRenaming(false);
    if (trimmed && trimmed !== name) onRename?.(trimmed);
  };

  return {
    renaming,
    value,
    setValue,
    inputRef,
    start,
    commit,
    cancel: () => setRenaming(false),
  };
}

export function RenameInput({
  rename,
  className,
}: {
  rename: InlineRename;
  className?: string;
}) {
  return (
    <input
      ref={rename.inputRef}
      value={rename.value}
      onChange={(e) => rename.setValue(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          rename.commit();
        }
        if (e.key === "Escape") {
          e.stopPropagation();
          rename.cancel();
        }
      }}
      onBlur={rename.commit}
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      className={cn(
        "min-w-0 flex-1 rounded border border-focus bg-input px-1 text-[13px] text-ink shadow-sm outline-none",
        className,
      )}
    />
  );
}
