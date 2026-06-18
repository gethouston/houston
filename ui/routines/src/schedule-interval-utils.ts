/**
 * Friendly "every N minutes/hours/days" interval helpers for the custom branch
 * of ScheduleBuilder. Keeps the non-technical interval model and its mapping to
 * and from cron expressions in one place, separate from the preset cron logic.
 */
import { parseTime } from "./schedule-format.ts"

/** Unit for the friendly "every N …" custom-interval picker. */
export type IntervalUnit = "minutes" | "hours" | "days"

export interface ScheduleInterval {
  every: number      // 1, 2, 3, …
  unit: IntervalUnit
}

/**
 * Build a cron expression from a friendly "every N minutes/hours/days" interval.
 * Days carry a time-of-day (`*​/N` in the day-of-month field, which fires on the
 * 1st, then every N days, resetting each month — the standard cron interval
 * approximation). Minutes and hours run around the clock.
 */
export function intervalToCron(
  interval: ScheduleInterval,
  time: string,
): string {
  const every = Math.max(1, Math.floor(interval.every))
  switch (interval.unit) {
    case "minutes":
      return every === 1 ? "* * * * *" : `*/${every} * * * *`
    case "hours":
      return every === 1 ? "0 * * * *" : `0 */${every} * * *`
    case "days": {
      const { hour, minute } = parseTime(time)
      return every === 1
        ? `${minute} ${hour} * * *`
        : `${minute} ${hour} */${every} * *`
    }
  }
}

/**
 * Parse a cron expression back into a friendly interval, when it maps cleanly
 * onto one. Returns `null` for anything the interval picker can't represent
 * (e.g. weekday or specific-day-of-week schedules), so the caller can fall back
 * to the advanced raw-cron field instead of silently misrepresenting it.
 */
export function cronToInterval(cron: string): ScheduleInterval | null {
  const parts = cron.trim().split(/\s+/)
  if (parts.length !== 5) return null
  const [min, hour, dom, month, dow] = parts
  if (month !== "*" || dow !== "*") return null

  if (dom === "*") {
    // Every N minutes: "*/N * * * *" (and "* * * * *" = every minute).
    const minStep = min.match(/^\*\/(\d+)$/)
    if (hour === "*" && (min === "*" || minStep)) {
      return { every: minStep ? Number(minStep[1]) : 1, unit: "minutes" }
    }
    // Every N hours on the hour: "0 */N * * *" (and "0 * * * *" = hourly).
    const hourStep = hour.match(/^\*\/(\d+)$/)
    if (min === "0" && (hour === "*" || hourStep)) {
      return { every: hourStep ? Number(hourStep[1]) : 1, unit: "hours" }
    }
    // Daily at a fixed time: "M H * * *".
    if (/^\d+$/.test(min) && /^\d+$/.test(hour)) {
      return { every: 1, unit: "days" }
    }
    return null
  }

  // Every N days at a fixed time: "M H */N * *".
  const domStep = dom.match(/^\*\/(\d+)$/)
  if (/^\d+$/.test(min) && /^\d+$/.test(hour) && domStep) {
    return { every: Number(domStep[1]), unit: "days" }
  }
  return null
}
