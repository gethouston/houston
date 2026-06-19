/**
 * Cron expression building + classification for ScheduleBuilder. Converts a
 * preset + options into a cron expression, classifies a cron back to a preset,
 * and extracts time/day options from one. The human-readable summaries live in
 * `./schedule-summary`; the friendly custom-interval model in
 * `./schedule-interval-utils`.
 */
import type { SchedulePreset } from "./types"
import { parseTime } from "./schedule-format.ts"

export interface ScheduleOptions {
  time: string         // "09:00"
  daysOfWeek: number[] // 0-6, one or more (Weekly preset)
  dayOfMonth: number   // 1-31
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
    case "weekly":
      return `${minute} ${hour} * * ${[...options.daysOfWeek].sort((a, b) => a - b).join(",")}`
    case "monthly":
      return `${minute} ${hour} ${options.dayOfMonth} * *`
    case "custom":
      return "" // caller provides raw cron
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
  // Weekly on one or more days: a comma list ("3", "1,3,5") or a legacy
  // day-range ("1-5", saved by the removed "Weekdays only" preset — kept so
  // those routines still open correctly; re-saving normalizes them to a list).
  if (/^\d+ \d+ \* \* [0-6](,[0-6])*$/.test(trimmed)) return "weekly"
  if (/^\d+ \d+ \* \* [0-6]-[0-6]$/.test(trimmed)) return "weekly"
  if (/^\d+ \d+ \d+ \* \*$/.test(trimmed)) return "monthly"
  return "custom"
}

/**
 * Parse a cron day-of-week field into a sorted day list. Accepts a comma list
 * ("1,3,5") or a single day ("3"), plus a legacy `a-b` range ("1-5") so crons
 * saved by the removed "Weekdays only" preset still expand to selected days.
 * Returns `null` for `*` or anything non-numeric.
 */
function parseWeekdayField(dow: string): number[] | null {
  if (/^[0-6](,[0-6])*$/.test(dow)) {
    return dow.split(",").map(Number).sort((a, b) => a - b)
  }
  const range = dow.match(/^([0-6])-([0-6])$/)
  if (range) {
    const a = Number(range[1])
    const b = Number(range[2])
    if (a <= b) return Array.from({ length: b - a + 1 }, (_, i) => a + i)
  }
  return null
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

  const daysOfWeek = parseWeekdayField(dow)
  if (daysOfWeek) result.daysOfWeek = daysOfWeek

  const dayOfMonth = Number(dom)
  if (!isNaN(dayOfMonth) && dayOfMonth >= 1 && dayOfMonth <= 31) {
    result.dayOfMonth = dayOfMonth
  }

  return result
}
