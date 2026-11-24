import {
  Button,
  cn,
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@houston-ai/core";
import { Pencil } from "lucide-react";
import { useState } from "react";
import {
  DEFAULT_SCHEDULE_LABELS,
  type RoutineRowLabels,
  type ScheduleLabels,
} from "./labels";
import { ScheduleBuilder } from "./schedule-builder";
import type { ScheduleFloor } from "./schedule-floor";

export interface RoutineRowScheduleEditProps {
  routineId: string;
  /** The routine's current cron expression — seeds the builder on open. */
  cron: string;
  /** Plain-language summary of `cron`, shown as the button's visible label. */
  summary: string;
  onScheduleChange: (routineId: string, cron: string) => void;
  labels: RoutineRowLabels;
  /** Schedule-builder labels; English defaults keep standalone callers working. */
  scheduleLabels?: ScheduleLabels;
  locale?: string;
  /**
   * Trigger presentation: `row` (default) is the list row's quiet inline
   * summary; `field` is the routine screen's obviously-editable control — a
   * bordered field with the summary and a visible pencil.
   */
  variant?: "row" | "field";
  /** A plan's minimum interval and its rule (memoized). Absent = no limit. */
  scheduleFloor?: ScheduleFloor;
}

export function RoutineRowScheduleEdit({
  routineId,
  cron,
  summary,
  onScheduleChange,
  labels,
  scheduleLabels = DEFAULT_SCHEDULE_LABELS,
  locale = "en-US",
  variant = "row",
  scheduleFloor,
}: RoutineRowScheduleEditProps) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(cron);
  const [openedWith, setOpenedWith] = useState(cron);

  const handleOpenChange = (next: boolean) => {
    if (next) {
      setDraft(cron);
      setOpenedWith(cron);
    }
    setOpen(next);
  };

  const valid = draft.trim() !== "" && (scheduleFloor?.allows(draft) ?? true);
  const save = () => {
    if (valid && draft !== openedWith) onScheduleChange(routineId, draft);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={labels.editSchedule}
          onClick={(e) => e.stopPropagation()}
          className={cn(
            "outline-none",
            variant === "row"
              ? cn(
                  "relative z-10 mt-0.5 -ml-1 inline-flex max-w-full items-center gap-1",
                  "rounded-md px-1 py-0.5 text-xs text-ink-muted transition-colors",
                  "hover:bg-hover hover:text-ink",
                  "focus-visible:ring-2 focus-visible:ring-focus",
                )
              : cn(
                  "inline-flex h-8 max-w-full items-center gap-2 rounded-lg",
                  "border border-line-input bg-input px-2.5 text-sm text-ink",
                  "transition-colors hover:bg-hover",
                  "focus-visible:ring-1 focus-visible:ring-focus",
                ),
          )}
        >
          <span className="truncate">{summary}</span>
          <Pencil
            aria-hidden
            className={cn(
              "shrink-0",
              variant === "row"
                ? "size-3 opacity-70"
                : "size-3.5 text-ink-muted",
            )}
          />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="pointer-events-auto w-80"
        onClick={(e) => e.stopPropagation()}
      >
        <ScheduleBuilder
          value={draft}
          onChange={setDraft}
          labels={scheduleLabels}
          locale={locale}
          floor={scheduleFloor}
        />
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
            {labels.cancel}
          </Button>
          <Button size="sm" onClick={save} disabled={!valid}>
            {labels.save}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
