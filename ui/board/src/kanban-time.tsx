import { cn, Tooltip, TooltipContent, TooltipTrigger } from "@houston-ai/core";
import { formatMessageTime, type MessageTimeFormatter } from "./message-time";

/** The same visible timestamp and full-date tooltip on cards and list rows. */
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
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <time
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
          {time.short}
        </time>
      </TooltipTrigger>
      <TooltipContent>{time.full}</TooltipContent>
    </Tooltip>
  );
}
