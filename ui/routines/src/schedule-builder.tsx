/**
 * ScheduleBuilder — Visual schedule builder with preset buttons.
 * Presets (daily, weekly, …) cover the common cases; the Weekly preset reveals
 * an "On these days" weekday multi-select. The "Custom" tab offers a "Repeat
 * every N [minutes/hours/days/months]" picker — choosing months reveals a
 * day-of-month field. There is no raw-cron input: the picker is the only way to
 * build a custom schedule, and the generated cron is shown read-only.
 *
 * Conditional fields are wrapped in `Reveal` so they animate in/out (and the
 * card resizes) instead of snapping — switching units never makes the layout
 * jump. State and cron derivation live in useScheduleBuilder; this file is JSX.
 *
 * All visible text arrives via `labels` (English defaults) so the package stays
 * i18n-agnostic; `locale` drives day names + time formatting in the summary.
 */
import type { ReactNode } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { cn } from "@houston-ai/core"
import type { SchedulePreset } from "./types"
import { DEFAULT_SCHEDULE_LABELS, type ScheduleLabels } from "./labels"
import {
  TimePicker,
  DayOfMonthPicker,
  WeekdaysPicker,
} from "./schedule-picker-fields"
import { IntervalPicker } from "./schedule-interval-picker"
import { useScheduleBuilder } from "./use-schedule-builder"

export interface ScheduleBuilderProps {
  value: string
  onChange: (cronExpression: string) => void
  presets?: SchedulePreset[]
  /** Localized labels. Defaults to English so standalone callers still work. */
  labels?: ScheduleLabels
  /** BCP-47 locale for day names + time formatting in the live summary. */
  locale?: string
}

const DEFAULT_PRESETS: SchedulePreset[] = [
  "every_30min", "hourly", "daily", "weekly", "monthly", "custom",
]

/**
 * Animated wrapper for a field that conditionally appears. `layout` lets the
 * surrounding fields slide to their new positions as this one mounts/unmounts,
 * so the card grows and shrinks smoothly. Values per design-system.md.
 */
function Reveal({ children }: { children: ReactNode }) {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.2, ease: [0.25, 0.1, 0.25, 1] }}
    >
      {children}
    </motion.div>
  )
}

export function ScheduleBuilder({
  value,
  onChange,
  presets = DEFAULT_PRESETS,
  labels = DEFAULT_SCHEDULE_LABELS,
  locale = "en-US",
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
    everyValid,
    isCustom,
    showTime,
    summary,
  } = useScheduleBuilder(value, onChange, labels, locale)

  const showCustomTime =
    isCustom && (intervalUnit === "days" || intervalUnit === "months")

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
            {labels.presets[preset]}
          </button>
        ))}
      </div>

      {/* Summary */}
      <p className="text-sm text-foreground">{summary}</p>

      {/* Preset-specific fields — animated so the card never snaps */}
      <div className="space-y-3">
        <AnimatePresence mode="popLayout" initial={false}>
          {showTime && (
            <Reveal key="preset-time">
              <TimePicker
                label={labels.timeLabel}
                value={options.time}
                onChange={(time) => updateOption({ time })}
              />
            </Reveal>
          )}

          {activePreset === "weekly" && (
            <Reveal key="weekly-days">
              <WeekdaysPicker
                label={labels.onTheseDays}
                locale={locale}
                shortcuts={labels.shortcuts}
                value={options.daysOfWeek}
                onChange={(daysOfWeek) => updateOption({ daysOfWeek })}
              />
            </Reveal>
          )}

          {activePreset === "monthly" && (
            <Reveal key="monthly-dom">
              <DayOfMonthPicker
                label={labels.dayOfMonthLabel}
                value={options.dayOfMonth}
                onChange={(dayOfMonth) => updateOption({ dayOfMonth })}
              />
            </Reveal>
          )}

          {isCustom && (
            <Reveal key="custom-interval">
              <IntervalPicker
                label={labels.repeatEvery}
                units={labels.units}
                decreaseLabel={labels.decrease}
                increaseLabel={labels.increase}
                every={intervalEvery}
                unit={intervalUnit}
                invalid={!everyValid}
                onEveryChange={setIntervalEvery}
                onUnitChange={setIntervalUnit}
              />
            </Reveal>
          )}

          {isCustom && intervalUnit === "months" && (
            <Reveal key="custom-dom">
              <DayOfMonthPicker
                label={labels.dayOfMonthLabel}
                value={options.dayOfMonth}
                onChange={(dayOfMonth) => updateOption({ dayOfMonth })}
              />
            </Reveal>
          )}

          {showCustomTime && (
            <Reveal key="custom-time">
              <TimePicker
                label={labels.timeLabel}
                value={options.time}
                onChange={(time) => updateOption({ time })}
              />
            </Reveal>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}
