/**
 * State and cron-derivation logic for ScheduleBuilder, kept separate from the
 * JSX so each file stays small and the behaviour is easy to reason about.
 */
import { useState, useEffect, useRef } from "react"
import type { SchedulePreset } from "./types"
import {
  presetToCron,
  cronToPreset,
  cronToOptions,
  type ScheduleOptions,
} from "./schedule-cron-utils"
import { presetSummary, cronSummary } from "./schedule-summary"
import {
  intervalToCron,
  cronToInterval,
  type IntervalUnit,
} from "./schedule-interval-utils"
import { DEFAULT_SCHEDULE_LABELS, type ScheduleLabels } from "./labels"

const DEFAULT_OPTIONS: ScheduleOptions = {
  time: "09:00",
  daysOfWeek: [1],
  dayOfMonth: 1,
}

const NEEDS_TIME: SchedulePreset[] = ["daily", "weekly", "monthly"]

export interface ScheduleBuilderState {
  activePreset: SchedulePreset
  selectPreset: (preset: SchedulePreset) => void
  options: ScheduleOptions
  updateOption: (patch: Partial<ScheduleOptions>) => void
  intervalEvery: string
  setIntervalEvery: (every: string) => void
  intervalUnit: IntervalUnit
  setIntervalUnit: (unit: IntervalUnit) => void
  everyValid: boolean
  isCustom: boolean
  showTime: boolean
  summary: string
}

export function useScheduleBuilder(
  value: string,
  onChange: (cronExpression: string) => void,
  labels: ScheduleLabels = DEFAULT_SCHEDULE_LABELS,
  locale = "en-US",
): ScheduleBuilderState {
  // Detect initial preset/interval from the incoming cron.
  const detectedPreset = cronToPreset(value)
  const detectedOptions = cronToOptions(value)
  const detectedInterval = detectedPreset === "custom" ? cronToInterval(value) : null

  // A pre-existing custom cron the picker can't represent (e.g. a weekday range
  // from a legacy routine). We keep it untouched until the user actively edits,
  // so opening the editor never silently rewrites their schedule.
  const [unrepresentable] = useState(
    () => detectedPreset === "custom" && !cronToInterval(value),
  )
  const [touched, setTouched] = useState(false)

  const [activePreset, setActivePreset] = useState<SchedulePreset>(
    detectedPreset ?? "daily",
  )
  const [options, setOptions] = useState<ScheduleOptions>({
    ...DEFAULT_OPTIONS,
    ...detectedOptions,
  })
  // The interval count is held as a string so the field can be cleared fully
  // while typing (e.g. to replace "1" with "984"); "" means no valid number.
  const [intervalEvery, setEvery] = useState(
    detectedInterval ? String(detectedInterval.every) : "5",
  )
  const [intervalUnit, setUnit] = useState<IntervalUnit>(
    detectedInterval ? detectedInterval.unit : "minutes",
  )

  const everyNumber = Number(intervalEvery)
  // The custom interval count must be a positive whole number.
  const everyValid =
    intervalEvery.trim() !== "" &&
    Number.isInteger(everyNumber) &&
    everyNumber >= 1
  // The Weekly preset needs at least one weekday selected.
  const weeklyValid = activePreset !== "weekly" || options.daysOfWeek.length > 0

  // Stable ref for onChange to avoid infinite effect loops.
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  // Emit cron when preset, options or interval change. An invalid (empty)
  // interval count emits "" so the parent's save validation can block saving.
  useEffect(() => {
    if (unrepresentable && !touched) return
    if (activePreset === "custom") {
      onChangeRef.current(
        everyValid
          ? intervalToCron(
              {
                every: everyNumber,
                unit: intervalUnit,
                dayOfMonth: options.dayOfMonth,
              },
              options.time,
            )
          : "",
      )
      return
    }
    onChangeRef.current(weeklyValid ? presetToCron(activePreset, options) : "")
  }, [activePreset, options, intervalEvery, intervalUnit, touched])

  const selectPreset = (preset: SchedulePreset) => {
    setActivePreset(preset)
    setTouched(true)
  }
  const updateOption = (patch: Partial<ScheduleOptions>) => {
    setOptions((prev) => ({ ...prev, ...patch }))
    setTouched(true)
  }
  const setIntervalEvery = (every: string) => {
    setEvery(every)
    setTouched(true)
  }
  const setIntervalUnit = (unit: IntervalUnit) => {
    setUnit(unit)
    setTouched(true)
  }

  const isCustom = activePreset === "custom"
  const customCron = everyValid
    ? intervalToCron(
        {
          every: everyNumber,
          unit: intervalUnit,
          dayOfMonth: options.dayOfMonth,
        },
        options.time,
      )
    : ""

  // While an unrepresentable legacy cron is still untouched, describe the actual
  // saved schedule rather than the placeholder picker state.
  let summary: string
  if (unrepresentable && !touched) {
    summary = cronSummary(value, labels.summary, locale)
  } else if (!isCustom) {
    summary = weeklyValid
      ? presetSummary(activePreset, options, labels.summary, locale)
      : labels.pickDay
  } else if (everyValid) {
    summary = cronSummary(customCron, labels.summary, locale)
  } else {
    summary = labels.enterNumber
  }

  return {
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
    showTime: NEEDS_TIME.includes(activePreset),
    summary,
  }
}
