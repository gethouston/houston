/**
 * ScheduleBuilder — Visual schedule builder with preset buttons.
 * Presets (daily, weekly, …) cover the common cases; the "Custom" tab offers a
 * "Repeat every N [minutes/hours/days/weeks/months]" picker — choosing weeks
 * reveals an "On these days" weekday multi-select, months a day-of-month field.
 * There is no raw-cron input: the picker is the only way to build a custom
 * schedule, and the generated cron is shown read-only for reference.
 *
 * State and cron derivation live in useScheduleBuilder; this file is just JSX.
 */
import { cn } from "@houston-ai/core"
import type { SchedulePreset } from "./types"
import { SCHEDULE_PRESET_LABELS } from "./types"
import {
  TimePicker,
  DayOfWeekPicker,
  DayOfMonthPicker,
  WeekdaysPicker,
} from "./schedule-picker-fields"
import { IntervalPicker } from "./schedule-interval-picker"
import { useScheduleBuilder } from "./use-schedule-builder"

export interface ScheduleBuilderProps {
  value: string
  onChange: (cronExpression: string) => void
  presets?: SchedulePreset[]
}

const DEFAULT_PRESETS: SchedulePreset[] = [
  "every_30min", "hourly", "daily", "weekdays", "weekly", "monthly", "custom",
]

export function ScheduleBuilder({
  value,
  onChange,
  presets = DEFAULT_PRESETS,
}: ScheduleBuilderProps) {
  const {
    activePreset,
    selectPreset,
    options,
    updateOption,
    intervalEvery,
    setIntervalEvery,
    intervalUnit,
    setIntervalUnit,
    intervalWeekdays,
    setIntervalWeekdays,
    everyValid,
    isCustom,
    showTime,
    summary,
  } = useScheduleBuilder(value, onChange)

  return (
    <div className="space-y-4">
      {/* Preset buttons */}
      <div className="flex flex-wrap gap-1.5">
        {presets.map((preset) => (
          <button
            key={preset}
            onClick={() => selectPreset(preset)}
            className={cn(
              "h-8 px-3 rounded-full text-xs font-medium transition-colors",
              activePreset === preset
                ? "bg-primary text-primary-foreground"
                : "bg-background border border-black/[0.04] text-muted-foreground hover:text-foreground",
            )}
          >
            {SCHEDULE_PRESET_LABELS[preset]}
          </button>
        ))}
      </div>

      {/* Summary */}
      <p className="text-sm text-foreground">{summary}</p>

      {/* Preset-specific fields */}
      <div className="space-y-3">
        {showTime && (
          <TimePicker
            value={options.time}
            onChange={(time) => updateOption({ time })}
          />
        )}

        {activePreset === "weekly" && (
          <DayOfWeekPicker
            value={options.dayOfWeek}
            onChange={(dayOfWeek) => updateOption({ dayOfWeek })}
          />
        )}

        {activePreset === "monthly" && (
          <DayOfMonthPicker
            value={options.dayOfMonth}
            onChange={(dayOfMonth) => updateOption({ dayOfMonth })}
          />
        )}

        {isCustom && (
          <>
            <IntervalPicker
              every={intervalEvery}
              unit={intervalUnit}
              invalid={!everyValid}
              onEveryChange={setIntervalEvery}
              onUnitChange={setIntervalUnit}
            />
            {intervalUnit === "weeks" && (
              <WeekdaysPicker
                value={intervalWeekdays}
                onChange={setIntervalWeekdays}
              />
            )}
            {intervalUnit === "months" && (
              <DayOfMonthPicker
                value={options.dayOfMonth}
                onChange={(dayOfMonth) => updateOption({ dayOfMonth })}
              />
            )}
            {(intervalUnit === "days" ||
              intervalUnit === "weeks" ||
              intervalUnit === "months") && (
              <TimePicker
                value={options.time}
                onChange={(time) => updateOption({ time })}
              />
            )}
          </>
        )}
      </div>
    </div>
  )
}
