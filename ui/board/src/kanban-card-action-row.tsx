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

/** Rename and delete sit inline only from the `card-actions` container width
 *  up. Below it they fold into one always-visible "more" button: three 24px
 *  targets in a 180px column leave the time too little room for labels like
 *  "10 de ago.", and a target may not shrink under 24px. */
const INLINE_ONLY = "hidden @min-card-actions/card:inline-flex";
const FOLDED_ONLY = "@min-card-actions/card:hidden";
const CONTROL_KEYS = new Set(["Enter", " ", "ArrowDown", "ArrowUp"]);

/** The board answers bare Enter (open the highlighted mission) and the arrows
 *  (move the highlight) on window. A key that presses a button or opens the
 *  menu is the button's alone. */
function keepControlKeys(e: KeyboardEvent<HTMLButtonElement>) {
  if (CONTROL_KEYS.has(e.key)) e.stopPropagation();
}

export interface KanbanCardActionLabels {
  approveTooltip: string;
  archiveTooltip: string;
  renameTooltip: string;
  deleteTooltip: string;
  moreActions: string;
}

/** Every button is a 24px box holding a 16px glyph at the same light
 *  `ink-muted/40` resting tint (ACTION_BUTTON_CLASS). Colour appears on hover
 *  only where the outcome is semantic: approve turns green, delete red. */
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
          onKeyDown={keepControlKeys}
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

/** The card's top-right controls. At most ONE status-gated primary action
 *  (approve on Needs you, archive on Done) always stays inline. */
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
  /** Gets the menu's trigger when chosen from the menu: the menu item it was
   *  opened from is gone, so the confirm dialog returns focus there. */
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
        // Non-modal: delete opens a confirm dialog straight from the menu, and
        // a modal menu closing under a dialog leaves the page inert.
        <DropdownMenu modal={false}>
          <Tooltip>
            <TooltipTrigger asChild>
              <DropdownMenuTrigger asChild>
                <button
                  ref={trigger}
                  type="button"
                  onClick={(e) => e.stopPropagation()}
                  onKeyDown={keepControlKeys}
                  className={cn(ACTION_BUTTON_CLASS, FOLDED_ONLY)}
                  aria-label={labels.moreActions}
                >
                  <MoreHorizontal className={ACTION_ICON_CLASS} />
                </button>
              </DropdownMenuTrigger>
            </TooltipTrigger>
            <TooltipContent side="top">{labels.moreActions}</TooltipContent>
          </Tooltip>
          {/* The content is portalled, but React still bubbles its clicks to
              the card, which would open the mission. Closing returns focus to
              the trigger, except after Rename, whose input takes it. */}
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
