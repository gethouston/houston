export type IntervalScheduleUnit = "minutes" | "hours";

export interface IntervalSchedule {
  every: number;
  unit: IntervalScheduleUnit;
  stepMinutes: number;
}

export const MAX_INTERVAL_MINUTES = 10_080;

const INTERVAL_FORM = /^@every ([1-9]\d{0,4})(m|h)$/;
const MINUTE_MS = 60_000;

export function isIntervalForm(schedule: string): boolean {
  return schedule.trim().startsWith("@every");
}

export function parseIntervalSchedule(
  schedule: string,
): IntervalSchedule | null {
  const match = schedule.trim().match(INTERVAL_FORM);
  if (!match) return null;
  const every = Number(match[1]);
  const unit: IntervalScheduleUnit = match[2] === "h" ? "hours" : "minutes";
  const stepMinutes = unit === "hours" ? every * 60 : every;
  if (stepMinutes > MAX_INTERVAL_MINUTES) return null;
  return { every, unit, stepMinutes };
}

export function intervalScheduleError(schedule: string): string | null {
  if (parseIntervalSchedule(schedule)) return null;
  if (!INTERVAL_FORM.test(schedule.trim())) {
    return "an interval is written '@every <N>m' or '@every <N>h' with one whole number and one unit (90m, not 1h30m)";
  }
  return "an interval can be at most 7 days (10080m or 168h)";
}

export function nextIntervalRun(interval: IntervalSchedule, after: Date): Date {
  const step = interval.stepMinutes * MINUTE_MS;
  return new Date((Math.floor(after.getTime() / step) + 1) * step);
}

export function intervalSchedule(
  every: number,
  unit: IntervalScheduleUnit,
): string {
  if (unit === "minutes" && every < 60 && 60 % every === 0) {
    return every === 1 ? "* * * * *" : `*/${every} * * * *`;
  }
  const hours = unit === "hours" ? every : every / 60;
  if (Number.isInteger(hours) && 24 % hours === 0) {
    return hours === 1 ? "0 * * * *" : `0 */${hours} * * *`;
  }
  return `@every ${every}${unit === "hours" ? "h" : "m"}`;
}

export function canonicalSchedule(schedule: string): string {
  const interval = parseIntervalSchedule(schedule);
  return interval ? intervalSchedule(interval.every, interval.unit) : schedule;
}
