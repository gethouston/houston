/**
 * Friendly "Repeat every N …" interval helpers for the custom branch of
 * ScheduleBuilder. Keeps the non-technical interval model and its mapping to and
 * from cron expressions in one place, separate from the preset cron logic.
 *
 * Units: minutes / hours / days (run on an interval) and months (a day-of-month,
 * every N months). Weekly-on-chosen-days lives in the Weekly preset, not here.
 */
import { parseTime } from "./schedule-format.ts";

/** Unit for the friendly "Repeat every N …" custom-interval picker. */
export type IntervalUnit = "minutes" | "hours" | "days" | "months";

export interface ScheduleInterval {
  every: number; // 1, 2, 3, …
  unit: IntervalUnit;
  /** Day-of-month (1–31) for the "months" unit. */
  dayOfMonth?: number;
}

/**
 * Build a cron expression from a friendly interval.
 * - minutes/hours: run around the clock (`*​/N`).
 * - days: `*​/N` in the day-of-month field, at a fixed time.
 * - months: a fixed day-of-month, every N months (`*​/N` in the month field).
 */
export function intervalToCron(
  interval: ScheduleInterval,
  time: string,
): string {
  const every = Math.max(1, Math.floor(interval.every));
  const { hour, minute } = parseTime(time);
  switch (interval.unit) {
    case "minutes":
      return every === 1 ? "* * * * *" : `*/${every} * * * *`;
    case "hours":
      return every === 1 ? "0 * * * *" : `0 */${every} * * *`;
    case "days":
      return every === 1
        ? `${minute} ${hour} * * *`
        : `${minute} ${hour} */${every} * *`;
    case "months": {
      const dom =
        interval.dayOfMonth && interval.dayOfMonth >= 1
          ? interval.dayOfMonth
          : 1;
      return every === 1
        ? `${minute} ${hour} ${dom} * *`
        : `${minute} ${hour} ${dom} */${every} *`;
    }
  }
}

/**
 * Parse a cron expression back into a friendly interval, when it maps cleanly
 * onto one. Returns `null` for anything the picker can't represent, so the
 * caller can keep the raw cron untouched instead of misrepresenting it.
 */
export function cronToInterval(cron: string): ScheduleInterval | null {
  const parts = cron.trim().split(/\s+/);
  if (parts.length !== 5) return null;
  const [min, hour, dom, month, dow] = parts;
  const numericTime = /^\d+$/.test(min) && /^\d+$/.test(hour);

  // Monthly on a day-of-month: "M H <dom> <*|*/N> *".
  if (numericTime && dow === "*" && /^\d+$/.test(dom)) {
    if (month === "*")
      return { every: 1, unit: "months", dayOfMonth: Number(dom) };
    const monthStep = month.match(/^\*\/(\d+)$/);
    if (monthStep)
      return {
        every: Number(monthStep[1]),
        unit: "months",
        dayOfMonth: Number(dom),
      };
  }

  // Remaining (minute/hour/day) cases need an unrestricted month + day-of-week.
  if (month !== "*" || dow !== "*") return null;

  if (dom === "*") {
    // Every N minutes: "*/N * * * *" (and "* * * * *" = every minute).
    const minStep = min.match(/^\*\/(\d+)$/);
    if (hour === "*" && (min === "*" || minStep)) {
      return { every: minStep ? Number(minStep[1]) : 1, unit: "minutes" };
    }
    // Every N hours on the hour: "0 */N * * *" (and "0 * * * *" = hourly).
    const hourStep = hour.match(/^\*\/(\d+)$/);
    if (min === "0" && (hour === "*" || hourStep)) {
      return { every: hourStep ? Number(hourStep[1]) : 1, unit: "hours" };
    }
    // Daily at a fixed time: "M H * * *".
    if (numericTime) return { every: 1, unit: "days" };
    return null;
  }

  // Every N days at a fixed time: "M H */N * *".
  const domStep = dom.match(/^\*\/(\d+)$/);
  if (numericTime && domStep)
    return { every: Number(domStep[1]), unit: "days" };
  return null;
}
