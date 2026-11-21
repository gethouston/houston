import { parseTime } from "./schedule-format.ts";
import type { SchedulePreset } from "./types";

export interface ScheduleOptions {
  time: string;
  daysOfWeek: number[];
  dayOfMonth: number;
}

export function presetToCron(
  preset: SchedulePreset,
  options: ScheduleOptions,
): string {
  const { hour, minute } = parseTime(options.time);

  switch (preset) {
    case "every_30min":
      return "*/30 * * * *";
    case "hourly":
      return "0 * * * *";
    case "daily":
      return `${minute} ${hour} * * *`;
    case "weekly":
      return `${minute} ${hour} * * ${[...options.daysOfWeek].sort((a, b) => a - b).join(",")}`;
    case "monthly":
      return `${minute} ${hour} ${options.dayOfMonth} * *`;
    case "custom":
      return "";
  }
}

export function cronToPreset(cron: string): SchedulePreset | null {
  const trimmed = cron.trim();
  if (!trimmed) return null;
  if (trimmed === "*/30 * * * *") return "every_30min";
  if (trimmed === "0 * * * *") return "hourly";
  if (/^\d+ \d+ \* \* \*$/.test(trimmed)) return "daily";
  if (/^\d+ \d+ \* \* [0-6](,[0-6])*$/.test(trimmed)) return "weekly";
  if (/^\d+ \d+ \* \* [0-6]-[0-6]$/.test(trimmed)) return "weekly";
  if (/^\d+ \d+ \d+ \* \*$/.test(trimmed)) return "monthly";
  return "custom";
}

function parseWeekdayField(dow: string): number[] | null {
  if (/^[0-6](,[0-6])*$/.test(dow)) {
    return dow
      .split(",")
      .map(Number)
      .sort((a, b) => a - b);
  }
  const range = dow.match(/^([0-6])-([0-6])$/);
  if (range) {
    const a = Number(range[1]);
    const b = Number(range[2]);
    if (a <= b) return Array.from({ length: b - a + 1 }, (_, i) => a + i);
  }
  return null;
}

export function cronToOptions(cron: string): Partial<ScheduleOptions> {
  const parts = cron.trim().split(/\s+/);
  if (parts.length !== 5) return {};
  const [min, hr, dom, , dow] = parts;
  const result: Partial<ScheduleOptions> = {};

  const minute = Number(min);
  const hour = Number(hr);
  if (!Number.isNaN(minute) && !Number.isNaN(hour)) {
    result.time = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
  }

  const daysOfWeek = parseWeekdayField(dow);
  if (daysOfWeek) result.daysOfWeek = daysOfWeek;

  const dayOfMonth = Number(dom);
  if (!Number.isNaN(dayOfMonth) && dayOfMonth >= 1 && dayOfMonth <= 31) {
    result.dayOfMonth = dayOfMonth;
  }

  return result;
}
