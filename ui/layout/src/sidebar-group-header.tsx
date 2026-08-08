import type { DraggableAttributes } from "@dnd-kit/core";
import type { SyntheticListenerMap } from "@dnd-kit/core/dist/hooks/utilities";
import { cn } from "@houston-ai/core";
import { ChevronRight } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { clampToRunes } from "./rune-clamp";
import type { SidebarLabels } from "./sidebar";
import { sidebarGroupClasses } from "./sidebar-classes";
import { SidebarGroupMenu } from "./sidebar-group-menu";
import type { SidebarGroupView } from "./sidebar-groups";

export interface SidebarGroupHeaderProps {
  group: SidebarGroupView;
  /** Resolved count shown beside the name. */
  count: number;
  labels: Required<SidebarLabels>;
  dragAttributes?: DraggableAttributes;
  dragListeners?: SyntheticListenerMap;
  /**
   * Ceiling on the inline-rename field, in RUNES (see `rune-clamp.ts` for why
   * runes and not `maxLength`). ABSENT means no cap, so a host that passes
   * nothing renders exactly as before. The field CLAMPS rather than refusing,
   * so a paste that is too long lands truncated instead of being swallowed.
   */
  maxNameRunes?: number;
  /** Enter inline-rename immediately (a just-created group). */
  startRenaming?: boolean;
  onRenameStarted?: () => void;
  onToggleCollapsed?: (groupId: string) => void;
  onEditContext?: (groupId: string) => void;
  onRenameGroup?: (groupId: string, newName: string) => void;
  onDeleteGroup?: (groupId: string) => void;
  /**
   * Leave the group. Rendered last, behind a separator, because everything
   * above it edits the GROUP and this one edits the caller's membership of it.
   * Opt-in twice over: the callback must exist AND the group's mask must say
   * `leave: true`.
   */
  onLeave?: (groupId: string) => void;
  /**
   * The inline rename ended WITHOUT committing: Escape, or leaving the field
   * with nothing typed or nothing changed.
   *
   * It exists for the create-then-name flow. A host that mints the group only
   * once a name is typed — so no placeholder-named team is ever broadcast to a
   * team space — renders the not-yet-real group as a local draft row. Without
   * this signal it cannot tell an abandoned name from one still being typed,
   * and the draft stays on screen as a phantom row forever. Fires EXACTLY ONCE
   * per abandoned edit.
   */
  onCancelRename?: (groupId: string) => void;
}

/**
 * Collapsible group header (Mercury-clean: a quiet uppercase label, a hairline
 * chevron, a muted count, and a quiet always-visible "..." menu). The chevron + label are
 * the drag handle; clicking the label toggles collapse. The label swaps to an
 * inline rename input — focused ONCE on entry (a ref-callback that re-focuses
 * every render would re-`select()` and eat all but the first keystroke).
 */
export function SidebarGroupHeader({
  group,
  count,
  labels,
  dragAttributes,
  dragListeners,
  maxNameRunes,
  startRenaming,
  onRenameStarted,
  onToggleCollapsed,
  onEditContext,
  onRenameGroup,
  onDeleteGroup,
  onLeave,
  onCancelRename,
}: SidebarGroupHeaderProps) {
  const [renaming, setRenaming] = useState(false);
  const [nameDraft, setNameDraft] = useState(group.name);
  const inputRef = useRef<HTMLInputElement>(null);
  // A rename session reports its outcome EXACTLY ONCE. Escape ends it
  // synchronously and the input then unmounts; browsers disagree on whether
  // removing a focused node also fires blur, and this latch makes that
  // disagreement unobservable instead of a double `onCancelRename`.
  const ended = useRef(false);

  // A freshly created group opens straight into rename.
  useEffect(() => {
    if (startRenaming) {
      ended.current = false;
      setNameDraft(group.name);
      setRenaming(true);
      onRenameStarted?.();
    }
  }, [startRenaming, group.name, onRenameStarted]);

  // Focus + select ONCE when rename mode begins (not on every render).
  useEffect(() => {
    if (renaming) {
      const el = inputRef.current;
      el?.focus();
      el?.select();
    }
  }, [renaming]);

  // End the session. A trimmed name that is actually new IS the commit;
  // everything else is an abandonment and must SAY so, or a host that mints the
  // group on commit cannot tell a pending name from one the user walked away
  // from. Enter over an empty or unchanged field abandons for the same reason a
  // blur does: nothing was named, so nothing can be created.
  const endRename = (commit: boolean) => {
    if (ended.current) return;
    ended.current = true;
    const trimmed = nameDraft.trim();
    if (commit && trimmed && trimmed !== group.name) {
      onRenameGroup?.(group.id, trimmed);
    } else {
      onCancelRename?.(group.id);
    }
    setRenaming(false);
  };

  const beginRename = () => {
    ended.current = false;
    setNameDraft(group.name);
    setRenaming(true);
  };

  return (
    <div
      data-sidebar-group-header={group.id}
      className={sidebarGroupClasses.header}
    >
      <button
        type="button"
        aria-expanded={!group.collapsed}
        aria-label={group.name}
        onClick={() => onToggleCollapsed?.(group.id)}
        className={sidebarGroupClasses.caret}
        {...dragAttributes}
        {...dragListeners}
      >
        <ChevronRight
          className={cn(
            "size-3 transition-transform duration-150",
            !group.collapsed && "rotate-90",
          )}
        />
      </button>
      {renaming ? (
        <input
          ref={inputRef}
          value={nameDraft}
          placeholder={labels.newGroupPlaceholder}
          onChange={(e) =>
            setNameDraft(
              maxNameRunes === undefined
                ? e.target.value
                : clampToRunes(e.target.value, maxNameRunes),
            )
          }
          onBlur={() => endRename(true)}
          onKeyDown={(e) => {
            if (e.key === "Enter") endRename(true);
            if (e.key === "Escape") endRename(false);
          }}
          className={sidebarGroupClasses.nameInput}
        />
      ) : (
        <button
          type="button"
          className={sidebarGroupClasses.name}
          onClick={() => onToggleCollapsed?.(group.id)}
          {...dragAttributes}
          {...dragListeners}
        >
          {group.name}
        </button>
      )}
      {!renaming && <span className={sidebarGroupClasses.count}>{count}</span>}
      {!renaming && (
        <SidebarGroupMenu
          group={group}
          labels={labels}
          onEditContext={onEditContext}
          onStartRename={onRenameGroup ? beginRename : undefined}
          onDeleteGroup={onDeleteGroup}
          onLeave={onLeave}
        />
      )}
    </div>
  );
}
