import { cn } from "@houston-ai/core";
import { Pencil } from "lucide-react";
import { useCallback, useRef, useState } from "react";

export interface EditableSkillTitleProps {
  title: string;
  onRename?: (title: string) => void;
  renameLabel?: string;
  level?: 1 | 2;
}

export function EditableSkillTitle({
  title,
  onRename,
  renameLabel = "Rename skill",
  level = 1,
}: EditableSkillTitleProps) {
  const Heading = level === 2 ? "h2" : "h1";
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(title);
  const cancelled = useRef(false);

  const start = useCallback(() => {
    setDraft(title);
    cancelled.current = false;
    setEditing(true);
  }, [title]);

  const commit = useCallback(() => {
    setEditing(false);
    if (cancelled.current) return;
    const next = draft.trim();
    if (next && next !== title) onRename?.(next);
  }, [draft, title, onRename]);

  return (
    <div className="flex min-w-0 items-center gap-1.5">
      <Heading
        className={cn(
          "truncate font-normal text-ink text-2xl",
          editing && "sr-only",
        )}
      >
        {title}
      </Heading>
      {editing ? (
        <input
          // biome-ignore lint/a11y/noAutofocus: the input replaces the title the user just clicked to edit.
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commit();
            } else if (e.key === "Escape") {
              cancelled.current = true;
              setEditing(false);
            }
          }}
          aria-label={renameLabel}
          className={cn(
            "min-w-0 flex-1 rounded-md border border-line/20 bg-input px-2 py-0.5",
            "font-normal text-2xl leading-tight text-ink",
            "outline-none transition-colors duration-200",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus",
          )}
        />
      ) : (
        onRename && (
          <button
            type="button"
            onClick={start}
            aria-label={renameLabel}
            title={renameLabel}
            className={cn(
              "flex size-6 shrink-0 items-center justify-center rounded-lg",
              "text-ink-muted transition-colors hover:bg-ink/[0.05] hover:text-ink",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus",
            )}
          >
            <Pencil className="size-3.5" />
          </button>
        )
      )}
    </div>
  );
}
