import { parseTime } from "./schedule-format.ts";
import {
  everySchedule,
  MAX_INTERVAL_MINUTES,
  parseEverySchedule,
} from "./schedule-interval-form.ts";

export type IntervalUnit = "minutes" | "hours" | "days" | "months";

export interface ScheduleInterval {
  every: number;
  unit: IntervalUnit;
  dayOfMonth?: number;
}

export function intervalCountMax(unit: IntervalUnit): number {
  switch (unit) {
    case "minutes":
      return MAX_INTERVAL_MINUTES;
    case "hours":
      return MAX_INTERVAL_MINUTES / 60;
    case "days":
      return 31;
    case "months":
      return 12;
  }
}

export function intervalCountAllowed(every: number, unit: IntervalUnit) {
  return (
    Number.isInteger(every) && every >= 1 && every <= intervalCountMax(unit)
  );
}

export function intervalToSchedule(
  interval: ScheduleInterval,
  time: string,
): string {
  const every = Math.max(1, Math.floor(interval.every));
  const { hour, minute } = parseTime(time);
  switch (interval.unit) {
    case "minutes":
    case "hours":
      return everySchedule(every, interval.unit);
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

export function scheduleToInterval(schedule: string): ScheduleInterval | null {
  const every = parseEverySchedule(schedule);
  if (every) return every;
  const parts = schedule.trim().split(/\s+/);
  if (parts.length !== 5) return null;
  const [min, hour, dom, month, dow] = parts;
  const numericTime = /^\d+$/.test(min) && /^\d+$/.test(hour);

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

  if (month !== "*" || dow !== "*") return null;

  if (dom === "*") {
    const minStep = min.match(/^\*\/(\d+)$/);
    if (hour === "*" && (min === "*" || minStep)) {
      return { every: minStep ? Number(minStep[1]) : 1, unit: "minutes" };
    }
    const hourStep = hour.match(/^\*\/(\d+)$/);
    if (min === "0" && (hour === "*" || hourStep)) {
      return { every: hourStep ? Number(hourStep[1]) : 1, unit: "hours" };
    }
    if (numericTime) return { every: 1, unit: "days" };
    return null;
  }

  const domStep = dom.match(/^\*\/(\d+)$/);
  if (numericTime && domStep)
    return { every: Number(domStep[1]), unit: "days" };
  return null;
}
