/**
 * Cron expression utilities for ScheduleBuilder.
 * Converts preset + options into cron expressions and generates summaries.
 */
import type { SchedulePreset } from "./types";

const DAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

export interface ScheduleOptions {
  time: string; // "09:00"
  dayOfWeek: number; // 0-6
  dayOfMonth: number; // 1-31
}

/** Parse "HH:MM" into { hour, minute } */
function parseTime(time: string): { hour: number; minute: number } {
  const [h, m] = time.split(":").map(Number);
  return { hour: h ?? 9, minute: m ?? 0 };
}

/** Format hour:minute into human-readable time */
function formatTime(time: string): string {
  const { hour, minute } = parseTime(time);
  const ampm = hour >= 12 ? "PM" : "AM";
  const h12 = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
  const mm = String(minute).padStart(2, "0");
  return `${h12}:${mm} ${ampm}`;
}

/** Build a cron expression from preset and options */
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
    case "weekdays":
      return `${minute} ${hour} * * 1-5`;
    case "weekly":
      return `${minute} ${hour} * * ${options.dayOfWeek}`;
    case "monthly":
      return `${minute} ${hour} ${options.dayOfMonth} * *`;
    case "custom":
      return ""; // caller provides raw cron
  }
}

/** Generate a human-readable summary of a schedule preset */
export function presetSummary(
  preset: SchedulePreset,
  options: ScheduleOptions,
): string {
  const t = formatTime(options.time);

  switch (preset) {
    case "every_30min":
      return "Runs every 30 minutes";
    case "hourly":
      return "Runs at the start of every hour";
    case "daily":
      return `Runs every day at ${t}`;
    case "weekdays":
      return `Runs Monday through Friday at ${t}`;
    case "weekly":
      return `Runs every ${DAY_NAMES[options.dayOfWeek]} at ${t}`;
    case "monthly":
      return `Runs on the ${ordinal(options.dayOfMonth)} of every month at ${t}`;
    case "custom":
      return "Custom cron schedule";
  }
}

function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

/** Detect a preset from a cron expression (best-effort) */
export function cronToPreset(cron: string): SchedulePreset | null {
  const trimmed = cron.trim();
  if (trimmed === "*/30 * * * *") return "every_30min";
  if (trimmed === "0 * * * *") return "hourly";
  if (/^\d+ \d+ \* \* \*$/.test(trimmed)) return "daily";
  if (/^\d+ \d+ \* \* 1-5$/.test(trimmed)) return "weekdays";
  if (/^\d+ \d+ \* \* [0-6]$/.test(trimmed)) return "weekly";
  if (/^\d+ \d+ \d+ \* \*$/.test(trimmed)) return "monthly";
  return null;
}

/** Extract time/day options from a cron expression (best-effort) */
export function cronToOptions(cron: string): Partial<ScheduleOptions> {
  const parts = cron.trim().split(/\s+/);
  if (parts.length !== 5) return {};
  const [min, hr, dom, , dow] = parts;
  const result: Partial<ScheduleOptions> = {};

  const minute = Number(min);
  const hour = Number(hr);
  if (!isNaN(minute) && !isNaN(hour)) {
    result.time = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
  }

  const dayOfWeek = Number(dow);
  if (!isNaN(dayOfWeek) && dayOfWeek >= 0 && dayOfWeek <= 6) {
    result.dayOfWeek = dayOfWeek;
  }

  const dayOfMonth = Number(dom);
  if (!isNaN(dayOfMonth) && dayOfMonth >= 1 && dayOfMonth <= 31) {
    result.dayOfMonth = dayOfMonth;
  }

  return result;
}
