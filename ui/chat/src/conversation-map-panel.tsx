import {
  Button,
  cn,
  HighlightedText,
  type HighlightRange,
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@houston-ai/core";
import { ArrowDownIcon, SearchIcon, XIcon } from "lucide-react";
import { useEffect, useRef } from "react";
import type { ResolvedConversationMapLabels } from "./conversation-map-labels";
import type { ConversationMoment } from "./conversation-map-model";

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
  const triggerRef = useRef<HTMLButtonElement>(null);
  const wasOpenRef = useRef(open);

  useEffect(() => {
    if (wasOpenRef.current && !open) triggerRef.current?.focus();
    wasOpenRef.current = open;
  }, [open]);

  if (availableMomentCount < 3) return null;

  return (
    <>
      {!open && (
        <Button
          aria-label={labels.view}
          className="absolute right-4 top-3 z-20 rounded-full"
          onClick={() => onOpenChange(true)}
          ref={triggerRef}
          size="sm"
          type="button"
          variant="outline"
        >
          <SearchIcon aria-hidden className="size-4" />
          {labels.view}
        </Button>
      )}
      {open && (
        <aside
          aria-label={labels.title}
          className="ht-hairline absolute inset-x-4 top-3 bottom-16 z-20 flex flex-col overflow-hidden rounded-2xl bg-popover text-popover-foreground md:left-auto md:w-80"
          onKeyDown={(event) => {
            if (event.key !== "Escape") return;
            event.preventDefault();
            onOpenChange(false);
          }}
        >
          <div className="border-line border-b p-3">
            <div className="mb-3 flex items-center justify-between gap-3 px-1">
              <h2 className="font-medium text-sm">{labels.title}</h2>
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
            <InputGroup className="rounded-full bg-input">
              <InputGroupAddon>
                <SearchIcon aria-hidden className="size-4" />
              </InputGroupAddon>
              <InputGroupInput
                aria-label={labels.searchPlaceholder}
                autoComplete="off"
                autoFocus
                className="text-base [&::-webkit-search-cancel-button]:hidden"
                onChange={(event) => onQueryChange(event.target.value)}
                placeholder={labels.searchPlaceholder}
                type="search"
                value={query}
              />
              {query ? (
                <InputGroupAddon align="inline-end">
                  <InputGroupButton
                    aria-label={labels.clearSearch}
                    onClick={() => onQueryChange("")}
                    size="icon-xs"
                  >
                    <XIcon aria-hidden className="size-3.5" />
                  </InputGroupButton>
                </InputGroupAddon>
              ) : null}
            </InputGroup>
          </div>
          <nav
            aria-label={labels.title}
            className="min-h-0 flex-1 overflow-y-auto p-2"
          >
            {hasQuery && moments.length === 0 ? (
              <p className="px-3 py-8 text-center text-sm text-ink-muted">
                {labels.noResults}
              </p>
            ) : (
              <ol className="flex flex-col gap-1">
                {moments.map((moment) => {
                  const active = activeMessageKey === moment.messageKey;
                  return (
                    <li key={moment.id}>
                      <button
                        aria-current={active ? "true" : undefined}
                        className={cn(
                          "flex w-full flex-col gap-1 rounded-lg px-3 py-2.5 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus",
                          active
                            ? "bg-chip text-ink"
                            : "text-ink-muted hover:bg-hover hover:text-hover-text",
                        )}
                        onClick={() => onSelectMoment(moment)}
                        type="button"
                      >
                        <span className="flex items-center justify-between gap-3 text-xs text-ink-muted">
                          <span>{labels.types[moment.type]}</span>
                          <span className="tabular-nums">
                            {labels.messagePosition(moment.position)}
                          </span>
                        </span>
                        <span className="line-clamp-2 text-ink">
                          <HighlightedText
                            ranges={rangesById[moment.id]}
                            text={moment.preview || labels.types[moment.type]}
                          />
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ol>
            )}
          </nav>
          <div className="border-line border-t p-3">
            <Button
              className="w-full justify-start"
              onClick={onBackToLatest}
              size="sm"
              type="button"
              variant="outline"
            >
              <ArrowDownIcon aria-hidden className="size-4" />
              {labels.backToLatest}
            </Button>
          </div>
          <span className="sr-only" role="status">
            {activeMessageKey ? labels.selected : ""}
          </span>
        </aside>
      )}
    </>
  );
}
