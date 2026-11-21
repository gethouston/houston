import {
  DEFAULT_ROW_LABELS,
  DEFAULT_SCHEDULE_LABELS,
  DEFAULT_SCHEDULE_SUMMARY_LABELS,
  DEFAULT_TRIGGER_LABELS,
  type RoutineRowLabels,
  type ScheduleLabels,
  type ScheduleSummaryLabels,
  type TriggerLabels,
} from "./labels";
import { RoutineRowScheduleEdit } from "./routine-row-schedule-edit";
import { RoutineTriggerStatus } from "./routine-trigger-status";
import type { ScheduleFloor } from "./schedule-floor";
import { cronSummary } from "./schedule-summary";
import type { Routine, RoutineRun, TriggerStatusItem } from "./types";

export interface RoutineRowSummaryProps {
  routine: Routine;
  lastRun?: RoutineRun;
  onScheduleChange?: (routineId: string, cron: string) => void;
  labels?: RoutineRowLabels;
  scheduleLabels?: ScheduleLabels;
  scheduleFloor?: ScheduleFloor;
  scheduleSummaryLabels?: ScheduleSummaryLabels;
  triggerLabels?: TriggerLabels;
  triggerStatus?: TriggerStatusItem;
  triggerSummary?: string;
  onReconnectTrigger?: () => void;
  locale?: string;
}

export function RoutineRowSummary({
  routine,
  lastRun,
  onScheduleChange,
  labels = DEFAULT_ROW_LABELS,
  scheduleLabels = DEFAULT_SCHEDULE_LABELS,
  scheduleFloor,
  scheduleSummaryLabels = DEFAULT_SCHEDULE_SUMMARY_LABELS,
  triggerLabels = DEFAULT_TRIGGER_LABELS,
  triggerStatus,
  triggerSummary,
  onReconnectTrigger,
  locale = "en-US",
}: RoutineRowSummaryProps) {
  if (routine.trigger) {
    return (
      <div className="mt-0.5 flex min-w-0 items-center gap-1.5 text-xs">
        <RoutineTriggerStatus
          status={triggerStatus}
          hasRun={!!lastRun}
          onReconnect={onReconnectTrigger}
          labels={triggerLabels}
          className="shrink-0"
        />
        <span className="min-w-0 truncate text-ink-muted">
          <span aria-hidden className="mr-1">
            ·
          </span>
          {triggerSummary ?? triggerLabels.wakeEvent}
        </span>
      </div>
    );
  }

  const scheduleText = cronSummary(
    routine.schedule ?? "",
    scheduleSummaryLabels,
    locale,
  );

  if (onScheduleChange && routine.schedule) {
    return (
      <RoutineRowScheduleEdit
        routineId={routine.id}
        cron={routine.schedule}
        summary={scheduleText}
        onScheduleChange={onScheduleChange}
        labels={labels}
        scheduleLabels={scheduleLabels}
        scheduleFloor={scheduleFloor}
        locale={locale}
      />
    );
  }

  return (
    <p className="mt-0.5 truncate text-xs text-ink-muted">{scheduleText}</p>
  );
}
