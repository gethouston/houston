import { cn } from "@houston-ai/core";
import type { ReactNode } from "react";
import {
  DEFAULT_NEXT_FIRE_LABELS,
  DEFAULT_ROW_LABELS,
  DEFAULT_SCHEDULE_LABELS,
  DEFAULT_SCHEDULE_SUMMARY_LABELS,
  DEFAULT_TRIGGER_LABELS,
  type NextFireLabels,
  type RoutineRowLabels,
  type ScheduleLabels,
  type ScheduleSummaryLabels,
  type TriggerLabels,
} from "./labels";
import { RoutineRowControls } from "./routine-row-controls";
import { RoutineRowNextFire } from "./routine-row-next-fire";
import { clickOpensRow, keyOpensRow } from "./routine-row-open-intent";
import { RoutineRowStatus } from "./routine-row-status";
import { RoutineRowSummary } from "./routine-row-summary";
import { RoutineRowTitle } from "./routine-row-title";
import type { ScheduleFloor } from "./schedule-floor";
import type { Routine, RoutineRun, TriggerStatusItem } from "./types";

export interface RoutineRowProps {
  routine: Routine;
  lastRun?: RoutineRun;
  accountTimezone: string;
  selected?: boolean;
  onOpenChat?: () => void;
  onToggle?: (enabled: boolean) => void;
  onDelete?: () => void;
  onRunNow?: () => void;
  onStopRun?: () => void;
  leadingIcon?: (routine: Routine) => ReactNode;
  warningChip?: ReactNode;
  onScheduleChange?: (routineId: string, cron: string) => void;
  labels?: RoutineRowLabels;
  scheduleLabels?: ScheduleLabels;
  scheduleFloor?: ScheduleFloor;
  scheduleSummaryLabels?: ScheduleSummaryLabels;
  nextFireLabels?: NextFireLabels;
  triggerLabels?: TriggerLabels;
  triggerStatus?: TriggerStatusItem;
  triggerSummary?: string;
  onReconnectTrigger?: () => void;
  locale?: string;
}

export function RoutineRow({
  routine,
  lastRun,
  accountTimezone,
  selected = false,
  onOpenChat,
  onToggle,
  onDelete,
  onRunNow,
  onStopRun,
  leadingIcon,
  warningChip,
  onScheduleChange,
  labels = DEFAULT_ROW_LABELS,
  scheduleLabels = DEFAULT_SCHEDULE_LABELS,
  scheduleFloor,
  scheduleSummaryLabels = DEFAULT_SCHEDULE_SUMMARY_LABELS,
  nextFireLabels = DEFAULT_NEXT_FIRE_LABELS,
  triggerLabels = DEFAULT_TRIGGER_LABELS,
  triggerStatus,
  triggerSummary,
  onReconnectTrigger,
  locale = "en-US",
}: RoutineRowProps) {
  const isRunning = lastRun?.status === "running";
  const isPaused = isRunning && !!lastRun?.paused_until;
  const identityIcon = leadingIcon?.(routine);
  const runNow = isRunning ? undefined : onRunNow;
  const stopRun = isRunning ? onStopRun : undefined;

  return (
    <div
      data-testid="routine-row"
      role="option"
      aria-selected={selected}
      aria-label={onOpenChat ? labels.openChat : undefined}
      tabIndex={onOpenChat ? 0 : undefined}
      onClick={(e) => {
        if (clickOpensRow(e.currentTarget, e.target)) onOpenChat?.();
      }}
      onKeyDown={(e) => {
        if (onOpenChat && keyOpensRow(e.key, e.target, e.currentTarget)) {
          e.preventDefault();
          onOpenChat();
        }
      }}
      className={cn(
        "flex items-center gap-2 rounded-lg border px-3 py-2 transition-colors",
        onOpenChat &&
          "cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-focus",
        selected
          ? "border-transparent bg-hover shadow-sm"
          : "border-line bg-card hover:bg-hover/40",
        !routine.enabled && !selected && "opacity-60",
      )}
    >
      <RoutineRowStatus
        routine={routine}
        lastRun={lastRun}
        isPaused={isPaused}
        identityIcon={identityIcon}
      />

      <div className="min-w-0 flex-1">
        <RoutineRowTitle
          name={routine.name || labels.untitled}
          warningChip={warningChip}
        />
        <RoutineRowSummary
          routine={routine}
          lastRun={lastRun}
          onScheduleChange={onScheduleChange}
          labels={labels}
          scheduleLabels={scheduleLabels}
          scheduleFloor={scheduleFloor}
          scheduleSummaryLabels={scheduleSummaryLabels}
          triggerLabels={triggerLabels}
          triggerStatus={triggerStatus}
          triggerSummary={triggerSummary}
          onReconnectTrigger={onReconnectTrigger}
          locale={locale}
        />
      </div>

      <div className="flex shrink-0 items-center gap-1">
        <RoutineRowNextFire
          routine={routine}
          accountTimezone={accountTimezone}
          labels={nextFireLabels}
          locale={locale}
        />
        <RoutineRowControls
          name={routine.name || labels.untitled}
          enabled={routine.enabled}
          labels={labels}
          onToggle={onToggle}
          runNow={runNow}
          stopRun={stopRun}
          onDelete={onDelete}
        />
      </div>
    </div>
  );
}
