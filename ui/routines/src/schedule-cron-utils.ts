/**
 * Cron expression utilities for ScheduleBuilder.
 * Converts preset + options into cron expressions and generates summaries.
 *
 * Every user-visible string arrives via `labels` and localizes through the
 * pure formatters in `./schedule-format` (which use `Intl.*Format(locale)` for
 * day names and clock time). The package itself stays i18n-agnostic — see
 * `./labels`.
 */
import type { SchedulePreset } from "./types"
import {
  interp,
  DEFAULT_SCHEDULE_SUMMARY_LABELS,
  type ScheduleSummaryLabels,
} from "./labels.ts"
import { parseTime, formatTime, ordinal, weekdayName } from "./schedule-format.ts"

export interface ScheduleOptions {
  time: string       // "09:00"
  dayOfWeek: number  // 0-6
  dayOfMonth: number // 1-31
}

/** Build a cron expression from preset and options */
export function presetToCron(
  preset: SchedulePreset,
  options: ScheduleOptions,
): string {
  const { hour, minute } = parseTime(options.time)

  switch (preset) {
    case "every_30min":
      return "*/30 * * * *"
    case "hourly":
      return "0 * * * *"
    case "daily":
      return `${minute} ${hour} * * *`
    case "weekdays":
      return `${minute} ${hour} * * 1-5`
    case "weekly":
      return `${minute} ${hour} * * ${options.dayOfWeek}`
    case "monthly":
      return `${minute} ${hour} ${options.dayOfMonth} * *`
    case "custom":
      return "" // caller provides raw cron
  }
}

/** Generate a human-readable summary of a schedule preset */
export function presetSummary(
  preset: SchedulePreset,
  options: ScheduleOptions,
  labels: ScheduleSummaryLabels = DEFAULT_SCHEDULE_SUMMARY_LABELS,
  locale = "en-US",
): string {
  const t = formatTime(options.time, locale)

  switch (preset) {
    case "every_30min":
      return labels.every30
    case "hourly":
      return labels.everyHourStart
    case "daily":
      return interp(labels.everyDay, { time: t })
    case "weekdays":
      return interp(labels.weekdays, { time: t })
    case "weekly":
      return interp(labels.weekly, {
        day: weekdayName(options.dayOfWeek, locale),
        time: t,
      })
    case "monthly":
      return interp(labels.monthly, {
        n: options.dayOfMonth,
        ordinal: ordinal(options.dayOfMonth),
        time: t,
      })
    case "custom":
      return labels.customCron
  }
}

/**
 * Classify a cron expression for the schedule builder. Three-way result, and
 * the distinction is load-bearing:
 *   - a known preset slug  → the matching preset UI is shown
 *   - `"custom"`           → a valid-but-non-preset cron (e.g. `*​/5 * * * *`);
 *                            the raw-cron input is shown, seeded with the value
 *   - `null`               → no schedule at all (empty string)
 *
 * Returning `null` for a *non-empty* custom cron was the source of issue #374:
 * the builder treated "unrecognized" the same as "empty" and silently fell
 * back to the Daily preset, clobbering every-N-minutes schedules on reopen.
 */
export function cronToPreset(cron: string): SchedulePreset | null {
  const trimmed = cron.trim()
  if (!trimmed) return null
  if (trimmed === "*/30 * * * *") return "every_30min"
  if (trimmed === "0 * * * *") return "hourly"
  if (/^\d+ \d+ \* \* \*$/.test(trimmed)) return "daily"
  if (/^\d+ \d+ \* \* 1-5$/.test(trimmed)) return "weekdays"
  if (/^\d+ \d+ \* \* [0-6]$/.test(trimmed)) return "weekly"
  if (/^\d+ \d+ \d+ \* \*$/.test(trimmed)) return "monthly"
  return "custom"
}

/** Extract time/day options from a cron expression (best-effort) */
export function cronToOptions(cron: string): Partial<ScheduleOptions> {
  const parts = cron.trim().split(/\s+/)
  if (parts.length !== 5) return {}
  const [min, hr, dom, , dow] = parts
  const result: Partial<ScheduleOptions> = {}

  const minute = Number(min)
  const hour = Number(hr)
  if (!isNaN(minute) && !isNaN(hour)) {
    result.time = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`
  }

  const dayOfWeek = Number(dow)
  if (!isNaN(dayOfWeek) && dayOfWeek >= 0 && dayOfWeek <= 6) {
    result.dayOfWeek = dayOfWeek
  }

  const dayOfMonth = Number(dom)
  if (!isNaN(dayOfMonth) && dayOfMonth >= 1 && dayOfMonth <= 31) {
    result.dayOfMonth = dayOfMonth
  }

  return result
}

/**
 * Human-readable summary of any cron expression, written for non-technical
 * users. Recognizes the presets and the common interval patterns (every N
 * minutes / hours / days) so a `*​/5 * * * *` reads as "Runs every 5 minutes"
 * instead of raw cron, and otherwise falls back to a generic label.
 */
export function cronSummary(
  cron: string,
  labels: ScheduleSummaryLabels = DEFAULT_SCHEDULE_SUMMARY_LABELS,
  locale = "en-US",
): string {
  const trimmed = cron.trim()
  if (!trimmed) return labels.noSchedule

  const preset = cronToPreset(trimmed)
  if (preset && preset !== "custom") {
    const o = cronToOptions(trimmed)
    return presetSummary(
      preset,
      {
        time: o.time ?? "09:00",
        dayOfWeek: o.dayOfWeek ?? 1,
        dayOfMonth: o.dayOfMonth ?? 1,
      },
      labels,
      locale,
    )
  }

  const parts = trimmed.split(/\s+/)
  if (parts.length === 5) {
    const [min, hour, dom, month, dow] = parts
    const everyDay = dom === "*" && month === "*" && dow === "*"
    if (everyDay) {
      // Every N minutes: "*/N * * * *" (and "* * * * *" = every minute).
      const minStep = min.match(/^\*\/(\d+)$/)
      if (hour === "*" && (min === "*" || minStep)) {
        const n = minStep ? Number(minStep[1]) : 1
        return n === 1 ? labels.everyMinute : interp(labels.everyNMinutes, { n })
      }
      // Every N hours on the hour: "M */N * * *".
      const hourStep = hour.match(/^\*\/(\d+)$/)
      if (/^\d+$/.test(min) && hourStep) {
        const n = Number(hourStep[1])
        return n === 1 ? labels.everyHour : interp(labels.everyNHours, { n })
      }
    }
    // Every N days at a fixed time: "M H */N * *".
    const domStep = dom.match(/^\*\/(\d+)$/)
    if (month === "*" && dow === "*" && /^\d+$/.test(min) && /^\d+$/.test(hour) && domStep) {
      const n = Number(domStep[1])
      const t = formatTime(`${hour}:${min}`, locale)
      return n === 1
        ? interp(labels.everyDay, { time: t })
        : interp(labels.everyNDays, { n, time: t })
    }
  }

  return labels.custom
}
