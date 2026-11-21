import type { ReactNode } from "react";
import type {
  NextFireLabels,
  RoutineRowLabels,
  ScheduleLabels,
  ScheduleSummaryLabels,
  TriggerLabels,
} from "./labels";
import { DEFAULT_GRID_LABELS, type RoutinesGridLabels } from "./labels";
import { RoutinesGridEmpty } from "./routines-grid-empty";
import { RoutinesGridList } from "./routines-grid-list";
import type { ScheduleFloor } from "./schedule-floor";
import type { Routine, RoutineRun, TriggerStatusItem } from "./types";

export interface RoutineDraft {
  id: string;
}

export interface RoutinesGridProps {
  routines: Routine[];
  lastRuns?: Record<string, RoutineRun>;
  draftActivities?: RoutineDraft[];
  accountTimezone: string;
  selectedRoutineId?: string | null;
  selectedDraftId?: string | null;
  loading?: boolean;
  onOpenChat?: (routineId: string) => void;
  onToggle?: (routineId: string, enabled: boolean) => void;
  onDeleteRoutine?: (routineId: string) => void;
  onRunNow?: (routineId: string) => void;
  onStopRun?: (routineId: string, runId: string) => void;
  onResumeDraft?: (activityId: string) => void;
  onDiscardDraft?: (activityId: string) => void;
  leadingIcon?: (routine: Routine) => ReactNode;
  warningChip?: (routine: Routine) => ReactNode;
  onScheduleChange?: (routineId: string, cron: string) => void;
  labels?: RoutinesGridLabels;
  rowLabels?: RoutineRowLabels;
  scheduleLabels?: ScheduleLabels;
  scheduleFloor?: ScheduleFloor;
  scheduleSummaryLabels?: ScheduleSummaryLabels;
  nextFireLabels?: NextFireLabels;
  triggerLabels?: TriggerLabels;
  triggerStatuses?: Record<string, TriggerStatusItem>;
  triggerSummaries?: Record<string, string>;
  onReconnectTrigger?: (routineId: string) => void;
  locale?: string;
  emptyAction?: ReactNode;
}

export function RoutinesGrid(props: RoutinesGridProps) {
  const {
    routines,
    draftActivities = [],
    loading,
    labels = DEFAULT_GRID_LABELS,
  } = props;

  const sorted = [...routines].sort((a, b) => {
    if (a.enabled !== b.enabled) return a.enabled ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  if (loading && routines.length === 0 && draftActivities.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center bg-transparent">
        <p className="text-sm text-ink-muted animate-pulse">{labels.loading}</p>
      </div>
    );
  }

  if (sorted.length === 0 && draftActivities.length === 0) {
    return <RoutinesGridEmpty labels={labels} action={props.emptyAction} />;
  }

  return <RoutinesGridList {...props} sorted={sorted} />;
}
