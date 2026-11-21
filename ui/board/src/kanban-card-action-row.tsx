import {
  cn,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@houston-ai/core";
import { Archive, Check, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { type KeyboardEvent, type ReactNode, useRef } from "react";
import { ACTION_BUTTON_CLASS, ACTION_ICON_CLASS } from "./kanban-card-actions";

const INLINE_ONLY = "hidden @min-card-actions/card:inline-flex";
const FOLDED_ONLY = "@min-card-actions/card:hidden";
const PRESS_KEYS = new Set(["Enter", " "]);
const MENU_KEYS = new Set(["Enter", " ", "ArrowDown", "ArrowUp"]);

function keepKeys(keys: Set<string>) {
  return (e: KeyboardEvent<HTMLButtonElement>) => {
    if (keys.has(e.key)) e.stopPropagation();
  };
}
const keepPressKeys = keepKeys(PRESS_KEYS);
const keepMenuKeys = keepKeys(MENU_KEYS);

export interface KanbanCardActionLabels {
  approveTooltip: string;
  archiveTooltip: string;
  renameTooltip: string;
  deleteTooltip: string;
  moreActions: string;
}

function ActionButton({
  label,
  onClick,
  className,
  children,
}: {
  label: string;
  onClick: () => void;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onClick();
          }}
          onKeyDown={keepPressKeys}
          className={cn(ACTION_BUTTON_CLASS, className)}
          aria-label={label}
        >
          {children}
        </button>
      </TooltipTrigger>
      <TooltipContent side="top">{label}</TooltipContent>
    </Tooltip>
  );
}

export function KanbanCardActionRow({
  onApprove,
  onArchive,
  onRename,
  onDelete,
  labels,
}: {
  onApprove?: () => void;
  onArchive?: () => void;
  onRename?: () => void;
  onDelete?: (returnFocusTo?: HTMLElement | null) => void;
  labels: KanbanCardActionLabels;
}) {
  const renaming = useRef(false);
  const trigger = useRef<HTMLButtonElement>(null);
  return (
    <div className="ml-auto flex items-center gap-0.5 shrink-0">
      {onApprove && (
        <ActionButton
          label={labels.approveTooltip}
          onClick={onApprove}
          className="hover:bg-success/10 hover:text-success"
        >
          <Check className={ACTION_ICON_CLASS} />
        </ActionButton>
      )}
      {onArchive && (
        <ActionButton label={labels.archiveTooltip} onClick={onArchive}>
          <Archive className={ACTION_ICON_CLASS} />
        </ActionButton>
      )}
      {onRename && (
        <ActionButton
          label={labels.renameTooltip}
          onClick={onRename}
          className={INLINE_ONLY}
        >
          <Pencil className={ACTION_ICON_CLASS} />
        </ActionButton>
      )}
      {onDelete && (
        <ActionButton
          label={labels.deleteTooltip}
          onClick={() => onDelete()}
          className={cn("hover:bg-danger/10 hover:text-danger", INLINE_ONLY)}
        >
          <Trash2 className={ACTION_ICON_CLASS} />
        </ActionButton>
      )}
      {(onRename || onDelete) && (
        <DropdownMenu modal={false}>
          <Tooltip>
            <TooltipTrigger asChild>
              <DropdownMenuTrigger asChild>
                <button
                  ref={trigger}
                  type="button"
                  onClick={(e) => e.stopPropagation()}
                  onKeyDown={keepMenuKeys}
                  className={cn(ACTION_BUTTON_CLASS, FOLDED_ONLY)}
                  aria-label={labels.moreActions}
                >
                  <MoreHorizontal className={ACTION_ICON_CLASS} />
                </button>
              </DropdownMenuTrigger>
            </TooltipTrigger>
            <TooltipContent side="top">{labels.moreActions}</TooltipContent>
          </Tooltip>
          <DropdownMenuContent
            align="end"
            onClick={(e) => e.stopPropagation()}
            onCloseAutoFocus={(e) => {
              if (!renaming.current) return;
              renaming.current = false;
              e.preventDefault();
            }}
          >
            {onRename && (
              <DropdownMenuItem
                onSelect={() => {
                  renaming.current = true;
                  onRename();
                }}
              >
                <Pencil />
                {labels.renameTooltip}
              </DropdownMenuItem>
            )}
            {onDelete && (
              <DropdownMenuItem
                variant="destructive"
                onSelect={() => onDelete(trigger.current)}
              >
                <Trash2 />
                {labels.deleteTooltip}
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
}
