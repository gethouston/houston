import {
  Button,
  Command,
  CommandInput,
  cn,
  type HighlightRange,
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@houston-ai/core";
import { SearchIcon, XIcon } from "lucide-react";
import { useRef } from "react";
import type { ResolvedConversationMapLabels } from "./conversation-map-labels";
import type { ConversationMoment } from "./conversation-map-model";
import { ConversationMapResults } from "./conversation-map-results";

interface ConversationMapPanelProps {
  activeMessageKey: string | null;
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
  if (availableMomentCount < 3) return null;

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
    <Popover onOpenChange={onOpenChange} open={open}>
      <PopoverTrigger asChild>
        <Button
          aria-label={labels.view}
          className="absolute right-4 top-3 z-20 rounded-full"
          size="sm"
          type="button"
          variant="outline"
        >
          <SearchIcon aria-hidden className="size-4" />
          {labels.view}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="ht-hairline w-80 max-w-[calc(100vw-2rem)] overflow-hidden border-line bg-popover p-0 text-popover-text shadow-none"
        collisionPadding={16}
        onCloseAutoFocus={(event) => {
          if (!keepDestinationFocus.current) return;
          event.preventDefault();
          keepDestinationFocus.current = false;
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
  );
}
