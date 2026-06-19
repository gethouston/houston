/**
 * Human-readable summaries for ScheduleBuilder — turns a preset or a raw cron
 * expression into plain language for non-technical users. The cron building and
 * classification live in `./schedule-cron-utils`; this file only describes.
 *
 * Every user-visible string arrives via `labels` and localizes through the pure
 * formatters in `./schedule-format` (which use `Intl.*Format(locale)` for day
 * names and clock time). The package itself stays i18n-agnostic — see `./labels`.
 */
import type { SchedulePreset } from "./types"
import {
  interp,
  DEFAULT_SCHEDULE_SUMMARY_LABELS,
  type ScheduleSummaryLabels,
} from "./labels.ts"
import {
  formatTime,
  ordinal,
  weekdayName,
  shortWeekdayNames,
  joinList,
} from "./schedule-format.ts"
import {
  cronToPreset,
  cronToOptions,
  type ScheduleOptions,
} from "./schedule-cron-utils.ts"

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
 * Human-readable summary of any cron expression, written for non-technical
 * users. Recognizes the presets and the common interval patterns (every N
 * minutes / hours / days, weekly on chosen days, every N months) so a
 * `*​/5 * * * *` reads as "Runs every 5 minutes" instead of raw cron, and
 * otherwise falls back to a generic label.
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

    // Weekly on specific days: "M H * * d,d,d" (a multi-day list; a single day
    // is the Weekly preset, handled above).
    if (
      dom === "*" && month === "*" &&
      /^\d+$/.test(min) && /^\d+$/.test(hour) && /^[0-6](,[0-6])*$/.test(dow)
    ) {
      const t = formatTime(`${hour}:${min}`, locale)
      const names = shortWeekdayNames(locale)
      const days = dow
        .split(",")
        .map(Number)
        .sort((a, b) => a - b)
        .map((d) => names[d])
      return interp(labels.weeklyOnDays, { days: joinList(days, locale), time: t })
    }

    // On a day-of-month, every N months: "M H D */N *" (every 1 month is the
    // Monthly preset, handled above).
    const monthStep = month.match(/^\*\/(\d+)$/)
    if (dow === "*" && monthStep && /^\d+$/.test(min) && /^\d+$/.test(hour) && /^\d+$/.test(dom)) {
      const t = formatTime(`${hour}:${min}`, locale)
      return interp(labels.everyNMonths, {
        ordinal: ordinal(Number(dom)),
        n: Number(dom),
        months: Number(monthStep[1]),
        time: t,
      })
    }
  }

  return labels.custom
}
