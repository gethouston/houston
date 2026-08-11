import { cn, DialogTitle } from "@houston-ai/core";
import { Pencil } from "lucide-react";
import { useCallback, useRef, useState } from "react";

const RENAME_INPUT_ATTR = "data-skill-rename-input";

/**
 * `DialogContent` `onEscapeKeyDown` guard for dialogs hosting an
 * {@link EditableSkillTitle}: Radix hears Escape on a document-level capture
 * listener, so the input's own handler can't stop it — without this guard,
 * cancelling a rename closes the whole dialog.
 */
export function skillRenameEscapeGuard(event: KeyboardEvent) {
  if (
    event.target instanceof HTMLElement &&
    event.target.hasAttribute(RENAME_INPUT_ATTR)
  )
    event.preventDefault();
}

export interface EditableSkillTitleProps {
  /** The current display name (a pending rename included, if any). */
  title: string;
  /** Commit a new display name. Omit to render a plain, pencil-less title. */
  onRename?: (title: string) => void;
  /** Accessible label for the pencil button and the name input. */
  renameLabel?: string;
}

/**
 * EditableSkillTitle — a dialog title with a rename pencil at the end of the
 * name (PRODUCT-1018). The pencil swaps the title for an inline input; Enter
 * or blur commits the trimmed name (unchanged or empty commits are a plain
 * cancel), Escape cancels without closing the host dialog. Committing only
 * reports the name upward — persisting it is the caller's concern, so both
 * skill dialogs can ride their existing save paths.
 *
 * The `DialogTitle` stays mounted (visually hidden while editing) so Radix
 * always finds the dialog's accessible title.
 */
export function EditableSkillTitle({
  title,
  onRename,
  renameLabel = "Rename skill",
}: EditableSkillTitleProps) {
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
      <DialogTitle className={cn("truncate", editing && "sr-only")}>
        {title}
      </DialogTitle>
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
              // The host dialog's Escape is fended off by
              // `skillRenameEscapeGuard`; this handler only cancels the edit.
              cancelled.current = true;
              setEditing(false);
            }
          }}
          {...{ [RENAME_INPUT_ATTR]: "" }}
          aria-label={renameLabel}
          className={cn(
            "min-w-0 flex-1 rounded-md border border-line/20 bg-input px-2 py-0.5",
            "text-lg leading-tight font-semibold text-ink",
            "outline-none transition-shadow duration-200 focus:shadow-sm",
          )}
        />
      ) : (
        onRename && (
          <button
            type="button"
            onClick={start}
            aria-label={renameLabel}
            title={renameLabel}
            className="shrink-0 rounded-md p-1 text-ink-muted transition-colors hover:bg-ink/[0.05] hover:text-ink"
          >
            <Pencil className="size-3.5" />
          </button>
        )
      )}
    </div>
  );
}
