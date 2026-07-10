import type { DraggableAttributes } from "@dnd-kit/core";
import type { SyntheticListenerMap } from "@dnd-kit/core/dist/hooks/utilities";
import {
  cn,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@houston-ai/core";
import { ChevronRight, MoreHorizontal } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { SidebarLabels } from "./sidebar";
import { sidebarGroupClasses } from "./sidebar-classes";
import type { SidebarGroupView } from "./sidebar-groups";

export interface SidebarGroupHeaderProps {
  group: SidebarGroupView;
  /** Resolved count shown beside the name. */
  count: number;
  labels: Required<SidebarLabels>;
  dragAttributes?: DraggableAttributes;
  dragListeners?: SyntheticListenerMap;
  /** Enter inline-rename immediately (a just-created group). */
  startRenaming?: boolean;
  onRenameStarted?: () => void;
  onToggleCollapsed?: (groupId: string) => void;
  onEditContext?: (groupId: string) => void;
  onRenameGroup?: (groupId: string, newName: string) => void;
  onDeleteGroup?: (groupId: string) => void;
}

/**
 * Collapsible group header (Mercury-clean: a quiet uppercase label, a hairline
 * chevron, a muted count, and a hover-only "..." menu). The chevron + label are
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
  startRenaming,
  onRenameStarted,
  onToggleCollapsed,
  onEditContext,
  onRenameGroup,
  onDeleteGroup,
}: SidebarGroupHeaderProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [nameDraft, setNameDraft] = useState(group.name);
  const inputRef = useRef<HTMLInputElement>(null);

  // A freshly created group opens straight into rename.
  useEffect(() => {
    if (startRenaming) {
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

  const commitName = () => {
    const trimmed = nameDraft.trim();
    if (trimmed && trimmed !== group.name) onRenameGroup?.(group.id, trimmed);
    setRenaming(false);
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
          onChange={(e) => setNameDraft(e.target.value)}
          onBlur={commitName}
          onKeyDown={(e) => {
            if (e.key === "Enter") commitName();
            if (e.key === "Escape") setRenaming(false);
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
      {!renaming && (onEditContext || onRenameGroup || onDeleteGroup) && (
        <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label={labels.groupMenu}
              className={sidebarGroupClasses.menuButton}
            >
              <MoreHorizontal className="size-3.5" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" side="bottom">
            {onEditContext && (
              <DropdownMenuItem onSelect={() => onEditContext(group.id)}>
                {labels.editGroupContext}
              </DropdownMenuItem>
            )}
            {onRenameGroup && (
              <DropdownMenuItem
                onSelect={() => {
                  setNameDraft(group.name);
                  setRenaming(true);
                }}
              >
                {labels.renameGroup}
              </DropdownMenuItem>
            )}
            {onDeleteGroup && (
              <DropdownMenuItem
                onSelect={() => onDeleteGroup(group.id)}
                className="text-destructive focus:text-destructive"
              >
                {labels.deleteGroup}
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
}
