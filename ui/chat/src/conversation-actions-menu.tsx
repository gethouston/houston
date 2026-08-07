import {
  Button,
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
  triggerRef: RefObject<HTMLButtonElement | null>;
}

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
          <Button
            aria-label={labels.moreActions}
            className="absolute right-4 top-3 z-20 rounded-full text-ink-muted hover:text-ink"
            ref={triggerRef}
            size="icon-sm"
            type="button"
            variant="ghost"
          >
            <MoreHorizontalIcon aria-hidden className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          className="ht-hairline w-48 border-line shadow-none"
          onCloseAutoFocus={(event) => {
            if (!openFindAfterMenuCloses.current) return;
            event.preventDefault();
            openFindAfterMenuCloses.current = false;
            onFind();
          }}
          sideOffset={8}
        >
          <DropdownMenuItem
            disabled={!canFind}
            onSelect={() => {
              openFindAfterMenuCloses.current = true;
            }}
          >
            <SearchIcon aria-hidden className="size-4" />
            {labels.find}
          </DropdownMenuItem>
          {actions?.onMoveToDone ? (
            <DropdownMenuItem onSelect={actions.onMoveToDone}>
              <CheckCircle2Icon aria-hidden className="size-4" />
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
                <Trash2Icon aria-hidden className="size-4" />
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
