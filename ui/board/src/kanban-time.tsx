import { Tooltip, TooltipContent, TooltipTrigger } from "@houston-ai/core";
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
          title={time.full}
          data-relative-time
          className="ml-1.5 shrink-0 whitespace-nowrap text-xs text-ink-muted tabular-nums"
        >
          {time.short}
        </time>
      </TooltipTrigger>
      <TooltipContent>{time.full}</TooltipContent>
    </Tooltip>
  );
}
