import {
  DEFAULT_GRID_LABELS,
  DEFAULT_NEXT_FIRE_LABELS,
  DEFAULT_ROW_LABELS,
  DEFAULT_SCHEDULE_SUMMARY_LABELS,
  DEFAULT_TRIGGER_LABELS,
} from "./labels";
import { RoutineDraftRow } from "./routine-draft-row";
import { RoutineRow } from "./routine-row";
import type { RoutinesGridProps } from "./routines-grid";
import type { Routine } from "./types";

export function RoutinesGridList({
  sorted,
  lastRuns = {},
  draftActivities = [],
  accountTimezone,
  selectedRoutineId,
  selectedDraftId,
  onOpenChat,
  onToggle,
  onDeleteRoutine,
  onRunNow,
  onStopRun,
  onResumeDraft,
  onDiscardDraft,
  leadingIcon,
  warningChip,
  onScheduleChange,
  labels = DEFAULT_GRID_LABELS,
  rowLabels = DEFAULT_ROW_LABELS,
  scheduleLabels,
  scheduleFloor,
  scheduleSummaryLabels = DEFAULT_SCHEDULE_SUMMARY_LABELS,
  nextFireLabels = DEFAULT_NEXT_FIRE_LABELS,
  triggerLabels = DEFAULT_TRIGGER_LABELS,
  triggerStatuses = {},
  triggerSummaries = {},
  onReconnectTrigger,
  locale = "en-US",
}: RoutinesGridProps & { sorted: Routine[] }) {
  const row = (routine: Routine) => {
    const lastRun = lastRuns[routine.id];
    return (
      <RoutineRow
        key={routine.id}
        routine={routine}
        lastRun={lastRun}
        accountTimezone={accountTimezone}
        selected={selectedRoutineId === routine.id}
        leadingIcon={leadingIcon}
        warningChip={warningChip?.(routine)}
        onScheduleChange={onScheduleChange}
        onOpenChat={onOpenChat ? () => onOpenChat(routine.id) : undefined}
        onToggle={
          onToggle ? (enabled) => onToggle(routine.id, enabled) : undefined
        }
        onDelete={
          onDeleteRoutine ? () => onDeleteRoutine(routine.id) : undefined
        }
        onRunNow={onRunNow ? () => onRunNow(routine.id) : undefined}
        onStopRun={
          onStopRun && lastRun
            ? () => onStopRun(routine.id, lastRun.id)
            : undefined
        }
        triggerStatus={triggerStatuses[routine.id]}
        triggerSummary={triggerSummaries[routine.id]}
        onReconnectTrigger={
          onReconnectTrigger ? () => onReconnectTrigger(routine.id) : undefined
        }
        labels={rowLabels}
        scheduleLabels={scheduleLabels}
        scheduleFloor={scheduleFloor}
        scheduleSummaryLabels={scheduleSummaryLabels}
        nextFireLabels={nextFireLabels}
        triggerLabels={triggerLabels}
        locale={locale}
      />
    );
  };

  return (
    <div className="flex-1 min-h-0 overflow-y-auto bg-transparent px-3 py-3">
      <div
        role="listbox"
        aria-label={labels.listLabel ?? DEFAULT_GRID_LABELS.listLabel}
        className="space-y-1.5"
      >
        {draftActivities.map((draft) => (
          <RoutineDraftRow
            key={draft.id}
            selected={selectedDraftId === draft.id}
            onResume={() => onResumeDraft?.(draft.id)}
            onDiscard={() => onDiscardDraft?.(draft.id)}
            labels={labels}
          />
        ))}
        {sorted.map(row)}
      </div>
    </div>
  );
}
