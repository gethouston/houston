import { cn, Tooltip, TooltipContent, TooltipTrigger } from "@houston-ai/core";
import { useRef } from "react";
import { useFittingLabel } from "./fit-label";
import { formatMessageTime, type MessageTimeFormatter } from "./message-time";

/** The same visible timestamp and full-date tooltip on cards and list rows.
 *  A compact (card) label from another year steps down to the longest of its
 *  shorter forms that fits; rows with room keep the full date. */
export function KanbanTime({
  iso,
  formatTime = formatMessageTime,
  compact = false,
}: {
  iso: string;
  formatTime?: MessageTimeFormatter;
  compact?: boolean;
}) {
  const time = formatTime(iso);
  const ref = useRef<HTMLTimeElement>(null);
  const label = useFittingLabel(
    compact && time.compact ? time.compact : [time.short],
    ref,
  );
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <time
          ref={ref}
          dateTime={iso}
          style={compact ? { fontSize: "var(--ht-font-size-xxs)" } : undefined}
          data-relative-time
          className={cn(
            "ml-1.5 text-xs text-ink-muted tabular-nums",
            compact
              ? "min-w-0 truncate @min-card-agent/card:shrink-0"
              : "shrink-0 whitespace-nowrap",
          )}
        >
          {label}
        </time>
      </TooltipTrigger>
      <TooltipContent>{time.full}</TooltipContent>
    </Tooltip>
  );
}
