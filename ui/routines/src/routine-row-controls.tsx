import { Switch } from "@houston-ai/core";
import type { RoutineRowLabels } from "./labels";
import { RoutineRowMenu } from "./routine-row-menu";

export interface RoutineRowControlsProps {
  name: string;
  enabled: boolean;
  labels: RoutineRowLabels;
  onToggle?: (enabled: boolean) => void;
  /** Fire the routine immediately — offered only when no run is in flight. */
  runNow?: () => void;
  /** Stop the in-flight run — offered only while one is running. */
  stopRun?: () => void;
  onDelete?: () => void;
}

export function RoutineRowControls({
  name,
  enabled,
  labels,
  onToggle,
  runNow,
  stopRun,
  onDelete,
}: RoutineRowControlsProps) {
  const hasMenu = runNow || stopRun || onDelete;
  if (!onToggle && !hasMenu) return null;
  return (
    <div className="flex shrink-0 items-center gap-1">
      {onToggle && (
        <Switch
          checked={enabled}
          onClick={(e) => e.stopPropagation()}
          onCheckedChange={(checked) => onToggle(checked)}
          aria-label={enabled ? labels.pauseRoutine : labels.resumeRoutine}
        />
      )}
      {hasMenu && (
        <RoutineRowMenu
          name={name}
          onRunNow={runNow}
          onStopRun={stopRun}
          onDelete={onDelete}
          labels={labels}
        />
      )}
    </div>
  );
}
