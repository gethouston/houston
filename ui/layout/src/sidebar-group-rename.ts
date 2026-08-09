import { useCallback, useEffect, useRef, useState } from "react";
import { clampToRunes } from "./rune-clamp";

export interface UseGroupRenameArgs {
  /** The group's saved name, and the value the draft is seeded from. */
  name: string;
  /** Ceiling in RUNES (see `rune-clamp.ts`). Absent means no cap. */
  maxRunes?: number;
  onCommit: (newName: string) => void;
  onCancel: () => void;
}

export interface GroupRenameSession {
  renaming: boolean;
  draft: string;
  inputRef: React.RefObject<HTMLInputElement | null>;
  begin: () => void;
  /** Clamped to the rune ceiling; never refuses input, so a paste lands
   *  truncated rather than being swallowed. */
  setDraft: (value: string) => void;
  /** `true` commits a trimmed, actually-new name; anything else abandons. */
  end: (commit: boolean) => void;
}

/**
 * A group header's inline-rename session, lifted out of the header component so
 * that component can stay about LAYOUT.
 *
 * Two behaviours here are load-bearing and easy to lose in a rewrite:
 *
 * 1. **Focus + select happen ONCE**, when the session begins, not on every
 *    render. A ref callback that re-focuses per render re-`select()`s the field
 *    and eats every keystroke after the first.
 * Committing requires a trimmed name that is actually DIFFERENT. Enter over an
 * empty or unchanged field abandons for the same reason a blur does: nothing
 * was named, so nothing can be created.
 */
export function useGroupRename({
  name,
  maxRunes,
  onCommit,
  onCancel,
}: UseGroupRenameArgs): GroupRenameSession {
  const [renaming, setRenaming] = useState(false);
  const [draft, setDraftState] = useState(name);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (renaming) {
      const el = inputRef.current;
      el?.focus();
      el?.select();
    }
  }, [renaming]);

  const begin = useCallback(() => {
    setDraftState(name);
    setRenaming(true);
  }, [name]);

  const setDraft = useCallback(
    (value: string) =>
      setDraftState(
        maxRunes === undefined ? value : clampToRunes(value, maxRunes),
      ),
    [maxRunes],
  );

  const end = useCallback(
    (commit: boolean) => {
      const trimmed = draft.trim();
      if (commit && trimmed && trimmed !== name) onCommit(trimmed);
      else onCancel();
      setRenaming(false);
    },
    [draft, name, onCommit, onCancel],
  );

  return { renaming, draft, inputRef, begin, setDraft, end };
}
