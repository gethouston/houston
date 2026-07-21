/**
 * RoutineRowScheduleEdit — the row's schedule-summary line rendered as a subtle,
 * always-visible edit affordance (never hover-gated): the plain-language summary
 * as a ghost button with a small pencil glyph. Clicking opens a Popover holding
 * the full ScheduleBuilder (seeded with the routine's current cron) over a
 * compact Save / Cancel footer. Save commits the edited cron and closes; Cancel
 * discards the draft.
 *
 * It re-enables pointer events and sits above the row-click button, so editing
 * the schedule never opens the routine's chat. Split out of RoutineRow to keep
 * that file focused on layout and under the size cap.
 */
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
}

export function RoutineRowScheduleEdit({
  routineId,
  cron,
  summary,
  onScheduleChange,
  labels,
  scheduleLabels = DEFAULT_SCHEDULE_LABELS,
  locale = "en-US",
}: RoutineRowScheduleEditProps) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(cron);

  // Reseed the draft from the live cron every time the popover opens, so a
  // previously cancelled edit never leaks into the next one.
  const handleOpenChange = (next: boolean) => {
    if (next) setDraft(cron);
    setOpen(next);
  };

  const save = () => {
    if (draft !== cron) onScheduleChange(routineId, draft);
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
            "relative z-10 mt-0.5 -ml-1 inline-flex max-w-full items-center gap-1",
            "rounded-md px-1 py-0.5 text-xs text-ink-muted transition-colors",
            "hover:bg-hover hover:text-ink",
            "outline-none focus-visible:ring-2 focus-visible:ring-focus",
          )}
        >
          <span className="truncate">{summary}</span>
          <Pencil className="size-3 shrink-0 opacity-70" aria-hidden />
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
        />
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
            {labels.cancel}
          </Button>
          <Button size="sm" onClick={save}>
            {labels.save}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
