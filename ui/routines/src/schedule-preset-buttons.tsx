import { cn } from "@houston-ai/core";
import type { SchedulePreset } from "./types";

export function SchedulePresetButtons({
  presets,
  active,
  labels,
  onSelect,
}: {
  presets: SchedulePreset[];
  active: SchedulePreset;
  labels: Record<SchedulePreset, string>;
  onSelect: (preset: SchedulePreset) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {presets.map((preset) => (
        <button
          type="button"
          key={preset}
          onClick={() => onSelect(preset)}
          className={cn(
            "h-8 px-3 rounded-full text-xs font-medium transition-colors",
            active === preset
              ? "bg-action text-action-text"
              : "bg-input border border-ink/[0.04] text-ink-muted hover:text-ink",
          )}
        >
          {labels[preset]}
        </button>
      ))}
    </div>
  );
}
