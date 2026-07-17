/**
 * Inline new-folder input, styled as a selected folder row.
 */
import { useEffect, useRef, useState } from "react";
import { DisclosureChevron, FolderIcon } from "./file-manager-icons";
import { COL_GRID } from "./file-row";

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
      className="h-[24px] items-center rounded-lg bg-action"
      style={{ display: "grid", gridTemplateColumns: COL_GRID }}
    >
      <div className="flex items-center gap-1.5 min-w-0 pl-3">
        <DisclosureChevron open={false} className="invisible" />
        <FolderIcon />
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
          className="min-w-0 flex-1 bg-transparent text-[13px] text-action-text outline-none placeholder:text-action-text/50"
        />
      </div>
      <span />
      <span />
      <span className="px-2 text-[11px] text-action-text/70">Folder</span>
    </div>
  );
}
