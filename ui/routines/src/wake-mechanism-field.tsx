/**
 * WakeMechanismField — the routine editor's "how does this wake?" section. When
 * the deployment supports triggers it shows the two-option choice and renders
 * either the schedule builder or the app-supplied trigger editor slot; without
 * trigger support it renders exactly today's schedule builder. The parent
 * (RoutineRowEdit) owns the mode + both sides' data so toggling is lossless.
 *
 * The trigger editor itself needs app data (the app catalog, an async event
 * fetch) that `ui/` cannot reach, so the app injects it as `triggerSlot`; this
 * component only places it and, in the editor, the live status badge above it.
 */

import type { ReactNode } from "react";
import {
  DEFAULT_SCHEDULE_LABELS,
  DEFAULT_TRIGGER_LABELS,
  type ScheduleLabels,
  type TriggerLabels,
} from "./labels";
import { ScheduleBuilder } from "./schedule-builder";
import { TriggerStatusBadge } from "./trigger-status-badge";
import type { RoutineWakeMode, TriggerStatusItem } from "./types";
import { WakeMechanismChoice } from "./wake-mechanism-choice";

export interface WakeMechanismFieldProps {
  /** Whether the deployment supports event triggers (shows the choice). */
  triggersEnabled: boolean;
  mode: RoutineWakeMode;
  onModeChange: (mode: RoutineWakeMode) => void;
  schedule: string;
  onScheduleChange: (schedule: string) => void;
  /** The app-provided trigger editor (picker + generated config form). */
  triggerSlot?: ReactNode;
  /** Live status of an already-provisioned event routine (editor badge). */
  status?: TriggerStatusItem;
  onReconnect?: () => void;
  scheduleLabels?: ScheduleLabels;
  triggerLabels?: TriggerLabels;
  locale?: string;
}

export function WakeMechanismField({
  triggersEnabled,
  mode,
  onModeChange,
  schedule,
  onScheduleChange,
  triggerSlot,
  status,
  onReconnect,
  scheduleLabels = DEFAULT_SCHEDULE_LABELS,
  triggerLabels = DEFAULT_TRIGGER_LABELS,
  locale = "en-US",
}: WakeMechanismFieldProps) {
  // No trigger support (or nothing to inject) → today's schedule UI verbatim.
  if (!triggersEnabled || !triggerSlot) {
    return (
      <ScheduleBuilder
        value={schedule}
        onChange={onScheduleChange}
        labels={scheduleLabels}
        locale={locale}
      />
    );
  }

  return (
    <div className="space-y-3">
      <WakeMechanismChoice
        value={mode}
        onChange={onModeChange}
        labels={triggerLabels}
      />
      {mode === "schedule" ? (
        <ScheduleBuilder
          value={schedule}
          onChange={onScheduleChange}
          labels={scheduleLabels}
          locale={locale}
        />
      ) : (
        <div className="space-y-3">
          {status && (
            <TriggerStatusBadge
              status={status}
              onReconnect={onReconnect}
              withDetail
              labels={triggerLabels}
            />
          )}
          {triggerSlot}
        </div>
      )}
    </div>
  );
}
