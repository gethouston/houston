/**
 * Cron expression utilities for ScheduleBuilder.
 * Converts preset + options into cron expressions and generates summaries.
 */
import type { SchedulePreset } from "./types"
import { parseTime, formatTime, ordinal, joinList } from "./schedule-format"

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]

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
): string {
  const t = formatTime(options.time)

  switch (preset) {
    case "every_30min":
      return "Runs every 30 minutes"
    case "hourly":
      return "Runs at the start of every hour"
    case "daily":
      return `Runs every day at ${t}`
    case "weekdays":
      return `Runs Monday through Friday at ${t}`
    case "weekly":
      return `Runs every ${DAY_NAMES[options.dayOfWeek]} at ${t}`
    case "monthly":
      return `Runs on the ${ordinal(options.dayOfMonth)} of every month at ${t}`
    case "custom":
      return "Custom cron schedule"
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
 * minutes / hours) so a `*​/5 * * * *` reads as "Runs every 5 minutes" instead
 * of raw cron, and otherwise falls back to a generic label.
 */
export function cronSummary(cron: string): string {
  const trimmed = cron.trim()
  if (!trimmed) return "No schedule set"

  const preset = cronToPreset(trimmed)
  if (preset && preset !== "custom") {
    const o = cronToOptions(trimmed)
    return presetSummary(preset, {
      time: o.time ?? "09:00",
      dayOfWeek: o.dayOfWeek ?? 1,
      dayOfMonth: o.dayOfMonth ?? 1,
    })
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
        return n === 1 ? "Runs every minute" : `Runs every ${n} minutes`
      }
      // Every N hours on the hour: "M */N * * *".
      const hourStep = hour.match(/^\*\/(\d+)$/)
      if (/^\d+$/.test(min) && hourStep) {
        const n = Number(hourStep[1])
        return n === 1 ? "Runs every hour" : `Runs every ${n} hours`
      }
    }
    // Every N days at a fixed time: "M H */N * *".
    const domStep = dom.match(/^\*\/(\d+)$/)
    if (month === "*" && dow === "*" && /^\d+$/.test(min) && /^\d+$/.test(hour) && domStep) {
      const n = Number(domStep[1])
      const t = formatTime(`${hour}:${min}`)
      return n === 1 ? `Runs every day at ${t}` : `Runs every ${n} days at ${t}`
    }

    // Weekly on specific days: "M H * * d,d,d".
    if (
      dom === "*" && month === "*" &&
      /^\d+$/.test(min) && /^\d+$/.test(hour) && /^[0-6](,[0-6])*$/.test(dow)
    ) {
      const t = formatTime(`${hour}:${min}`)
      const days = dow
        .split(",")
        .map(Number)
        .sort((a, b) => a - b)
        .map((d) => DAY_NAMES[d].slice(0, 3))
      return `Runs every week on ${joinList(days)} at ${t}`
    }

    // Monthly on a day-of-month, every N months: "M H D */N *".
    const monthStep = month.match(/^\*\/(\d+)$/)
    if (dow === "*" && monthStep && /^\d+$/.test(min) && /^\d+$/.test(hour) && /^\d+$/.test(dom)) {
      const t = formatTime(`${hour}:${min}`)
      return `Runs on the ${ordinal(Number(dom))} of every ${Number(monthStep[1])} months at ${t}`
    }
  }

  return "Custom schedule"
}
