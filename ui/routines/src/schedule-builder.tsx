/**
 * ScheduleBuilder — Visual schedule builder with preset buttons.
 * Presets (daily, weekly, …) cover the common cases; the "Custom" tab offers a
 * "Repeat every N [minutes/hours/days/weeks/months]" picker — choosing weeks
 * reveals an "On these days" weekday multi-select, months a day-of-month field.
 * There is no raw-cron input: the picker is the only way to build a custom
 * schedule, and the generated cron is shown read-only for reference.
 *
 * Conditional fields are wrapped in `Reveal` so they animate in/out (and the
 * card resizes) instead of snapping — switching units never makes the layout
 * jump. State and cron derivation live in useScheduleBuilder; this file is JSX.
 * All visible text arrives via `labels` (English defaults) so the package stays
 * i18n-agnostic; `locale` drives day names + time formatting in the summary.
 */
import { AnimatePresence } from "framer-motion"
import { cn } from "@houston-ai/core"
import type { SchedulePreset } from "./types"
import { DEFAULT_SCHEDULE_LABELS, type ScheduleLabels } from "./labels"
import {
  DayOfWeekPicker,
  DayOfMonthPicker,
  WeekdaysPicker,
} from "./schedule-picker-fields"
import { TimePicker } from "./time-picker"
import { IntervalPicker } from "./schedule-interval-picker"
import { Reveal } from "./schedule-reveal"
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
  "every_30min", "hourly", "daily", "weekdays", "weekly", "monthly", "custom",
]

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
    intervalWeekdays,
    setIntervalWeekdays,
    everyValid,
    isCustom,
    showTime,
    summary,
  } = useScheduleBuilder(value, onChange, labels, locale)

  const showCustomTime =
    isCustom &&
    (intervalUnit === "days" ||
      intervalUnit === "weeks" ||
      intervalUnit === "months")

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
                locale={locale}
                labels={labels.timePicker}
              />
            </Reveal>
          )}

          {activePreset === "weekly" && (
            <Reveal key="weekly-dow">
              <DayOfWeekPicker
                label={labels.dayLabel}
                locale={locale}
                value={options.dayOfWeek}
                onChange={(dayOfWeek) => updateOption({ dayOfWeek })}
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
                unitsSingular={labels.unitsSingular}
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

          {isCustom && intervalUnit === "weeks" && (
            <Reveal key="custom-weekdays">
              <WeekdaysPicker
                label={labels.weekdaysLabel}
                locale={locale}
                shortcuts={labels.weekdayShortcuts}
                value={intervalWeekdays}
                onChange={setIntervalWeekdays}
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
                locale={locale}
                labels={labels.timePicker}
              />
            </Reveal>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}
