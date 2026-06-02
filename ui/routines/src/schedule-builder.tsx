/**
 * ScheduleBuilder — Visual cron schedule builder with preset buttons.
 * Supports presets (daily, weekly, etc.) and custom cron expressions.
 */
import { useState, useEffect, useRef } from "react"
import { cn } from "@houston-ai/core"
import type { SchedulePreset } from "./types"
import { SCHEDULE_PRESET_LABELS } from "./types"
import { TimePicker, DayOfWeekPicker, DayOfMonthPicker, CronInput } from "./schedule-picker-fields"
import {
  presetToCron,
  presetSummary,
  cronToPreset,
  cronToOptions,
  cronSummary,
  type ScheduleOptions,
} from "./schedule-cron-utils"

export interface ScheduleBuilderProps {
  value: string
  onChange: (cronExpression: string) => void
  presets?: SchedulePreset[]
}

const DEFAULT_PRESETS: SchedulePreset[] = [
  "every_30min", "hourly", "daily", "weekdays", "weekly", "monthly", "custom",
]

const DEFAULT_OPTIONS: ScheduleOptions = {
  time: "09:00",
  dayOfWeek: 1,
  dayOfMonth: 1,
}

const NEEDS_TIME: SchedulePreset[] = ["daily", "weekdays", "weekly", "monthly"]

export function ScheduleBuilder({
  value,
  onChange,
  presets = DEFAULT_PRESETS,
}: ScheduleBuilderProps) {
  // Detect initial preset from incoming cron
  const detectedPreset = cronToPreset(value)
  const detectedOptions = cronToOptions(value)

  const [activePreset, setActivePreset] = useState<SchedulePreset>(
    detectedPreset ?? "daily",
  )
  const [options, setOptions] = useState<ScheduleOptions>({
    ...DEFAULT_OPTIONS,
    ...detectedOptions,
  })
  const [customCron, setCustomCron] = useState(
    detectedPreset === "custom" ? value : "",
  )

  // Stable ref for onChange to avoid infinite effect loops
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  // Emit cron when preset or options change
  useEffect(() => {
    if (activePreset === "custom") {
      if (customCron.trim()) onChangeRef.current(customCron.trim())
      return
    }
    const cron = presetToCron(activePreset, options)
    onChangeRef.current(cron)
  }, [activePreset, options, customCron])

  const updateOption = (patch: Partial<ScheduleOptions>) => {
    setOptions((prev) => ({ ...prev, ...patch }))
  }

  const showTime = NEEDS_TIME.includes(activePreset)
  const summary = activePreset === "custom"
    ? (customCron.trim() ? cronSummary(customCron) : "Enter a cron expression")
    : presetSummary(activePreset, options)
  const cronDisplay = activePreset === "custom"
    ? customCron
    : presetToCron(activePreset, options)

  return (
    <div className="space-y-4">
      {/* Preset buttons */}
      <div className="flex flex-wrap gap-1.5">
        {presets.map((preset) => (
          <button
            key={preset}
            onClick={() => setActivePreset(preset)}
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

        {activePreset === "custom" && (
          <CronInput
            value={customCron}
            onChange={setCustomCron}
          />
        )}
      </div>

      {/* Cron expression display */}
      {cronDisplay && (
        <p className="text-[11px] text-muted-foreground font-mono">
          cron: {cronDisplay}
        </p>
      )}
    </div>
  )
}
