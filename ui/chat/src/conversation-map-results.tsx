import {
  CommandItem,
  CommandList,
  CommandSeparator,
  cn,
  HighlightedText,
  type HighlightRange,
} from "@houston-ai/core";
import { ArrowDownIcon } from "lucide-react";
import type { ResolvedConversationMapLabels } from "./conversation-map-labels";
import type { ConversationMoment } from "./conversation-map-model";

interface ConversationMapResultsProps {
  activeMessageKey: string | null;
  hasQuery: boolean;
  labels: ResolvedConversationMapLabels;
  moments: ConversationMoment[];
  onBackToLatest: () => void;
  onSelectMoment: (moment: ConversationMoment) => void;
  rangesById: Record<string, HighlightRange[]>;
}

export function ConversationMapResults({
  activeMessageKey,
  hasQuery,
  labels,
  moments,
  onBackToLatest,
  onSelectMoment,
  rangesById,
}: ConversationMapResultsProps) {
  return (
    <nav aria-label={labels.title}>
      <CommandList className="max-h-80 p-1">
        {hasQuery && moments.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-ink-muted">
            {labels.noResults}
          </p>
        ) : null}
        {moments.map((moment) => {
          const active = activeMessageKey === moment.messageKey;
          return (
            <CommandItem
              aria-current={active ? "true" : undefined}
              className={cn(
                "group items-start gap-3 rounded-md px-3 py-2.5",
                active && "bg-chip text-ink",
              )}
              key={moment.id}
              onSelect={() => onSelectMoment(moment)}
              value={`${moment.id} ${moment.preview}`}
            >
              <span
                aria-hidden
                className="mt-1.5 size-1.5 shrink-0 rounded-full bg-ink-muted group-aria-[current=true]:bg-ink"
              />
              <span className="min-w-0 flex-1">
                <span className="flex items-center justify-between gap-3 text-xs text-ink-muted">
                  <span>{labels.types[moment.type]}</span>
                  <span className="tabular-nums">
                    {labels.messagePosition(moment.position)}
                  </span>
                </span>
                <span className="mt-0.5 line-clamp-2 text-sm text-ink">
                  <HighlightedText
                    ranges={rangesById[moment.id]}
                    text={moment.preview || labels.types[moment.type]}
                  />
                </span>
              </span>
            </CommandItem>
          );
        })}
        <CommandSeparator className="mx-2" />
        <CommandItem
          className="gap-3 px-3 py-2.5 text-ink-muted"
          onSelect={onBackToLatest}
          value={labels.backToLatest}
        >
          <ArrowDownIcon aria-hidden className="size-4" />
          {labels.backToLatest}
        </CommandItem>
      </CommandList>
    </nav>
  );
}
