import {
  Button,
  Command,
  CommandInput,
  cn,
  type HighlightRange,
  Popover,
  PopoverAnchor,
  PopoverContent,
} from "@houston-ai/core";
import { XIcon } from "lucide-react";
import { useRef } from "react";
import { ConversationActionsMenu } from "./conversation-actions-menu";
import type { ConversationMapActions } from "./conversation-map";
import type { ResolvedConversationMapLabels } from "./conversation-map-labels";
import type { ConversationMoment } from "./conversation-map-model";
import { ConversationMapResults } from "./conversation-map-results";

interface ConversationMapPanelProps {
  activeMessageKey: string | null;
  actions?: ConversationMapActions;
  availableMomentCount: number;
  hasQuery: boolean;
  labels: ResolvedConversationMapLabels;
  moments: ConversationMoment[];
  open: boolean;
  onBackToLatest: () => void;
  onOpenChange: (open: boolean) => void;
  onQueryChange: (query: string) => void;
  onSelectMoment: (moment: ConversationMoment) => void;
  query: string;
  rangesById: Record<string, HighlightRange[]>;
}

export function ConversationMapPanel({
  activeMessageKey,
  actions,
  availableMomentCount,
  hasQuery,
  labels,
  moments,
  open,
  onBackToLatest,
  onOpenChange,
  onQueryChange,
  onSelectMoment,
  query,
  rangesById,
}: ConversationMapPanelProps) {
  const keepDestinationFocus = useRef(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  if (
    availableMomentCount === 0 &&
    !actions?.onDelete &&
    !actions?.onMoveToDone
  )
    return null;

  const selectMoment = (moment: ConversationMoment) => {
    keepDestinationFocus.current = true;
    onSelectMoment(moment);
  };
  const backToLatest = () => {
    keepDestinationFocus.current = true;
    onBackToLatest();
    onOpenChange(false);
  };

  return (
    <>
      <ConversationActionsMenu
        actions={actions}
        canFind={availableMomentCount > 0}
        labels={labels}
        onFind={() => onOpenChange(true)}
        triggerRef={triggerRef}
      />
      <Popover onOpenChange={onOpenChange} open={open}>
        <PopoverAnchor asChild>
          <span
            aria-hidden
            className="pointer-events-none absolute right-4 top-3 size-8"
          />
        </PopoverAnchor>
        <PopoverContent
          align="end"
          className="ht-hairline w-80 max-w-[calc(100vw-2rem)] overflow-hidden border-line bg-popover p-0 text-popover-text shadow-none"
          collisionPadding={16}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            if (keepDestinationFocus.current) {
              keepDestinationFocus.current = false;
              return;
            }
            triggerRef.current?.focus();
          }}
          side="bottom"
          sideOffset={8}
        >
          <Command shouldFilter={false}>
            <div className="relative">
              <CommandInput
                aria-label={labels.searchPlaceholder}
                autoComplete="off"
                className={cn("pr-9 text-base", query && "pr-16")}
                onValueChange={onQueryChange}
                placeholder={labels.searchPlaceholder}
                role="searchbox"
                value={query}
              />
              <div className="absolute right-1 top-0.5 flex items-center">
                {query ? (
                  <Button
                    aria-label={labels.clearSearch}
                    onClick={() => onQueryChange("")}
                    size="icon-sm"
                    type="button"
                    variant="ghost"
                  >
                    <XIcon aria-hidden className="size-3.5" />
                  </Button>
                ) : null}
                <Button
                  aria-label={labels.hide}
                  onClick={() => onOpenChange(false)}
                  size="icon-sm"
                  type="button"
                  variant="ghost"
                >
                  <XIcon aria-hidden className="size-4" />
                </Button>
              </div>
            </div>
            <ConversationMapResults
              activeMessageKey={activeMessageKey}
              hasQuery={hasQuery}
              labels={labels}
              moments={moments}
              onBackToLatest={backToLatest}
              onSelectMoment={selectMoment}
              rangesById={rangesById}
            />
            <span className="sr-only" role="status">
              {activeMessageKey ? labels.selected : ""}
            </span>
          </Command>
        </PopoverContent>
      </Popover>
    </>
  );
}
