import {
  ConfirmDialog,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@houston-ai/core";
import {
  CheckCircle2Icon,
  MoreHorizontalIcon,
  SearchIcon,
  Trash2Icon,
} from "lucide-react";
import { type RefObject, useRef, useState } from "react";
import type { ConversationMapActions } from "./conversation-map";
import type { ResolvedConversationMapLabels } from "./conversation-map-labels";

interface ConversationActionsMenuProps {
  actions?: ConversationMapActions;
  canFind: boolean;
  labels: ResolvedConversationMapLabels;
  onFind: () => void;
  triggerRef?: RefObject<HTMLButtonElement | null>;
}

/**
 * The chat header's overflow menu: find-in-chat plus the mission actions.
 * Lives in the detail-panel header row (left of the people stack), so the
 * trigger mirrors the plain close button beside it rather than a pill Button.
 */
export function ConversationActionsMenu({
  actions,
  canFind,
  labels,
  onFind,
  triggerRef,
}: ConversationActionsMenuProps) {
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const openFindAfterMenuCloses = useRef(false);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            aria-label={labels.moreActions}
            className="relative size-7 flex items-center justify-center rounded-md text-ink-muted hover:text-ink hover:bg-hover/50 data-[state=open]:bg-hover/50 data-[state=open]:text-ink transition-[color,background-color,scale] active:scale-[0.96] md:active:scale-100 shrink-0 after:absolute after:-inset-2 md:after:hidden"
            ref={triggerRef}
            type="button"
          >
            <MoreHorizontalIcon aria-hidden className="size-4" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          className="w-52"
          onCloseAutoFocus={(event) => {
            if (!openFindAfterMenuCloses.current) return;
            event.preventDefault();
            openFindAfterMenuCloses.current = false;
            onFind();
          }}
          sideOffset={6}
        >
          <DropdownMenuItem
            disabled={!canFind}
            onSelect={() => {
              openFindAfterMenuCloses.current = true;
            }}
          >
            <SearchIcon aria-hidden />
            {labels.find}
          </DropdownMenuItem>
          {actions?.onMoveToDone ? (
            <DropdownMenuItem onSelect={actions.onMoveToDone}>
              <CheckCircle2Icon aria-hidden />
              {labels.moveToDone}
            </DropdownMenuItem>
          ) : null}
          {actions?.onDelete ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onSelect={() => setConfirmingDelete(true)}
                variant="destructive"
              >
                <Trash2Icon aria-hidden />
                {labels.delete}
              </DropdownMenuItem>
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
      <ConfirmDialog
        description={
          actions?.deleteDescription ??
          "This mission and its history will be permanently removed."
        }
        onConfirm={() => {
          setConfirmingDelete(false);
          actions?.onDelete?.();
        }}
        onOpenChange={setConfirmingDelete}
        open={confirmingDelete}
        title={actions?.deleteTitle ?? "Delete this mission?"}
      />
    </>
  );
}
