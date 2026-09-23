import { cn } from "@houston-ai/core";
import { Pencil } from "lucide-react";
import { useCallback, useRef, useState } from "react";

export interface EditableSkillTitleProps {
  /** The current display name (a pending rename included, if any). */
  title: string;
  /** Commit a new display name. Omit to render a plain, pencil-less title. */
  onRename?: (title: string) => void;
  /** Accessible label for the pencil button and the name input. */
  renameLabel?: string;
  /** Where the name sits in the page's outline. `1` is a skill that owns the
   *  screen; `2` is one opened inside a frame whose own title is the `h1`. */
  level?: 1 | 2;
}

/**
 * EditableSkillTitle — a skill page's heading with a rename pencil at the end
 * of the name (PRODUCT-1018). The pencil swaps the title for an inline input;
 * Enter or blur commits the trimmed name (unchanged or empty commits are a
 * plain cancel), Escape cancels. Committing only reports the name upward —
 * persisting it is the caller's concern, so a skill surface can ride its
 * existing save path.
 *
 * The heading stays mounted (visually hidden while editing) so the page always
 * carries its accessible name. It reads as the screen's `h1` by default and
 * steps down to an `h2` for a frame that already has one — two `h1`s on one
 * screen leave a screen-reader user with two answers to "where am I".
 */
export function EditableSkillTitle({
  title,
  onRename,
  renameLabel = "Rename skill",
  level = 1,
}: EditableSkillTitleProps) {
  const Heading = level === 2 ? "h2" : "h1";
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(title);
  // Escape both cancels and blurs; the ref keeps the blur commit from
  // resurrecting the draft the user just discarded.
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
