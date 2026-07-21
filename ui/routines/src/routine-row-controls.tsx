/**
 * RoutineRowControls — the row's trailing action cluster: the enable/disable
 * switch and the three-dot menu (run/stop, delete). The whole row is already the
 * open-chat affordance (a `role="option"` click target), so there is no separate
 * chat button here. The cluster stops click/keydown from bubbling to the row, so
 * operating a control never opens the chat. Split out of RoutineRow to keep that
 * file focused on layout and under the size cap.
 */
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
  // The row opens its chat on click; each control stops the click bubbling so
  // operating it never opens the chat. (Keydown is safe: the row only opens on
  // Enter/Space when it is itself the event target, never a focused control.)
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
