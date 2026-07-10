/**
 * WakeMechanismChoice — the two-option segmented control that picks how a
 * routine wakes: "On a schedule" (cron) or "When something happens" (an event
 * trigger, C9). Shown only when the deployment supports triggers; otherwise the
 * editor renders the schedule builder alone. Purely presentational — the parent
 * owns the selected mode and keeps BOTH sides' data so toggling never loses
 * work. Copy arrives via `labels` (English defaults) per the `ui/` boundary.
 */
import { cn } from "@houston-ai/core";
import { CalendarClock, Zap } from "lucide-react";
import { DEFAULT_TRIGGER_LABELS, type TriggerLabels } from "./labels";
import type { RoutineWakeMode } from "./types";

export interface WakeMechanismChoiceProps {
  value: RoutineWakeMode;
  onChange: (mode: RoutineWakeMode) => void;
  labels?: TriggerLabels;
}

export function WakeMechanismChoice({
  value,
  onChange,
  labels = DEFAULT_TRIGGER_LABELS,
}: WakeMechanismChoiceProps) {
  const options: {
    mode: RoutineWakeMode;
    icon: typeof CalendarClock;
    title: string;
    hint: string;
  }[] = [
    {
      mode: "schedule",
      icon: CalendarClock,
      title: labels.wakeSchedule,
      hint: labels.wakeScheduleHint,
    },
    {
      mode: "event",
      icon: Zap,
      title: labels.wakeEvent,
      hint: labels.wakeEventHint,
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-2">
      {options.map(({ mode, icon: Icon, title, hint }) => {
        const active = value === mode;
        return (
          <button
            type="button"
            key={mode}
            aria-pressed={active}
            onClick={() => onChange(mode)}
            className={cn(
              "flex flex-col gap-1 rounded-lg border p-3 text-left transition-colors",
              active
                ? "border-primary bg-primary/[0.04]"
                : "border-foreground/[0.08] hover:border-foreground/20",
            )}
          >
            <span className="flex items-center gap-2">
              <Icon
                className={cn(
                  "size-4 shrink-0",
                  active ? "text-primary" : "text-muted-foreground",
                )}
                strokeWidth={2}
              />
              <span className="text-sm font-medium text-foreground">
                {title}
              </span>
            </span>
            <span className="text-xs text-muted-foreground">{hint}</span>
          </button>
        );
      })}
    </div>
  );
}
