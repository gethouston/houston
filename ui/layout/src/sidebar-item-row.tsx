import {
  cn,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@houston-ai/core";
import { MoreHorizontal } from "lucide-react";
import { type KeyboardEvent, useCallback, useRef, useState } from "react";
import type { SidebarItem } from "./sidebar";
import { sidebarItemRowClasses } from "./sidebar-classes";

export interface SidebarItemRowLabels {
  moreOptions?: string;
  renameItem?: string;
  deleteItem?: string;
}

const DEFAULT_LABELS: Required<SidebarItemRowLabels> = {
  moreOptions: "More options",
  renameItem: "Rename",
  deleteItem: "Delete",
};

export interface SidebarItemRowProps {
  item: SidebarItem;
  isActive: boolean;
  isEditing: boolean;
  editValue: string;
  hasMenu: boolean;
  onSelect: (id: string) => void;
  /** Pointer entered the row (see SidebarRowContext.onItemHover). */
  onHover?: (id: string) => void;
  onKeyDown: (e: KeyboardEvent, id: string) => void;
  onEditChange: (value: string) => void;
  onCommitRename: (id: string) => void;
  onCancelEdit: () => void;
  onStartRename?: (id: string, name: string) => void;
  onDelete?: (id: string) => void;
  labels?: SidebarItemRowLabels;
}

export function SidebarItemRow({
  item,
  isActive,
  isEditing,
  editValue,
  hasMenu,
  onSelect,
  onHover,
  onKeyDown,
  onEditChange,
  onCommitRename,
  onCancelEdit,
  onStartRename,
  onDelete,
  labels,
}: SidebarItemRowProps) {
  const l = { ...DEFAULT_LABELS, ...labels };
  const [menuOpen, setMenuOpen] = useState(false);
  // Picking Rename swaps the whole row (trigger included) for the input, so
  // nothing focuses it by default — the user had to click again before typing.
  // Focus + select-all when the input mounts (stable callback: a fresh inline
  // ref would re-run per keystroke and re-select what's being typed), and stop
  // the closing menu's focus restore from stealing it back.
  const renameStarted = useRef(false);
  const focusEditInput = useCallback((el: HTMLInputElement | null) => {
    el?.focus();
    el?.select();
  }, []);

  return (
    <div
      onPointerEnter={onHover ? () => onHover(item.id) : undefined}
      className={cn(
        sidebarItemRowClasses.root,
        isActive ? "bg-accent" : "hover:bg-accent/50",
      )}
    >
      {isEditing ? (
        <input
          ref={focusEditInput}
          value={editValue}
          onChange={(e) => onEditChange(e.target.value)}
          onBlur={() => onCommitRename(item.id)}
          onKeyDown={(e) => {
            // Keep every keystroke inside the field: the sortable wrapper
            // spreads @dnd-kit's keyboard-sensor listeners, whose Space/Enter
            // activator would otherwise start a drag mid-type and swallow the
            // character (e.g. spaces vanish from the new name).
            e.stopPropagation();
            if (e.key === "Enter") onCommitRename(item.id);
            if (e.key === "Escape") onCancelEdit();
          }}
          className={sidebarItemRowClasses.editInput}
        />
      ) : (
        <button
          type="button"
          onClick={() => onSelect(item.id)}
          onKeyDown={(e) => onKeyDown(e, item.id)}
          className={cn(
            sidebarItemRowClasses.selectButton,
            isActive ? "text-foreground" : "text-accent-foreground",
          )}
        >
          {item.icon && (
            <span className={sidebarItemRowClasses.icon}>{item.icon}</span>
          )}
          <span className={sidebarItemRowClasses.name}>{item.name}</span>
        </button>
      )}

      {!isEditing && (item.trailing || hasMenu) && (
        <div className={sidebarItemRowClasses.actions}>
          {item.trailing && (
            <span
              className={cn(
                sidebarItemRowClasses.trailing,
                hasMenu && sidebarItemRowClasses.trailingWithMenu,
                menuOpen && sidebarItemRowClasses.trailingMenuOpen,
              )}
            >
              {item.trailing}
            </span>
          )}
          {hasMenu && (
            <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  aria-label={l.moreOptions}
                  className={sidebarItemRowClasses.menuButton}
                  onClick={(e) => e.stopPropagation()}
                >
                  <MoreHorizontal className="size-4" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                side="bottom"
                onCloseAutoFocus={(e) => {
                  if (renameStarted.current) {
                    renameStarted.current = false;
                    e.preventDefault();
                  }
                }}
              >
                {onStartRename && (
                  <DropdownMenuItem
                    onClick={() => {
                      renameStarted.current = true;
                      onStartRename(item.id, item.name);
                    }}
                  >
                    {l.renameItem}
                  </DropdownMenuItem>
                )}
                {item.menuContent}
                {onDelete && (
                  <DropdownMenuItem
                    onClick={() => onDelete(item.id)}
                    className="text-destructive focus:text-destructive"
                  >
                    {l.deleteItem}
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      )}
    </div>
  );
}
