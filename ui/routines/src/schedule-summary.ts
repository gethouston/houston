import {
  DEFAULT_SCHEDULE_SUMMARY_LABELS,
  interp,
  type ScheduleSummaryLabels,
} from "./labels.ts";
import {
  cronToOptions,
  cronToPreset,
  type ScheduleOptions,
} from "./schedule-cron-utils.ts";
import {
  formatTime,
  joinList,
  ordinal,
  shortWeekdayNames,
  weekdayName,
} from "./schedule-format.ts";
import { parseEverySchedule } from "./schedule-interval-form.ts";
import type { SchedulePreset } from "./types";

/** Generate a human-readable summary of a schedule preset */
export function presetSummary(
  preset: SchedulePreset,
  options: ScheduleOptions,
  labels: ScheduleSummaryLabels = DEFAULT_SCHEDULE_SUMMARY_LABELS,
  locale = "en-US",
): string {
  const t = formatTime(options.time, locale);

  switch (preset) {
    case "every_30min":
      return labels.every30;
    case "hourly":
      return labels.everyHourStart;
    case "daily":
      return interp(labels.everyDay, { time: t });
    case "weekly": {
      const days = [...options.daysOfWeek].sort((a, b) => a - b);
      if (days.length <= 1) {
        return interp(labels.weekly, {
          day: weekdayName(days[0] ?? 1, locale),
          time: t,
        });
      }
      const shorts = shortWeekdayNames(locale);
      return interp(labels.weeklyOnDays, {
        days: joinList(
          days.map((d) => shorts[d]),
          locale,
        ),
        time: t,
      });
    }
    case "monthly":
      return interp(labels.monthly, {
        n: options.dayOfMonth,
        ordinal: ordinal(options.dayOfMonth),
        time: t,
      });
    case "custom":
      return labels.customCron;
  }
}

/**
 * Human-readable summary of any schedule (cron or an `@every` interval),
 * written for non-technical users. Recognizes the presets and the common
 * interval patterns (every N minutes / hours / days, weekly on chosen days,
 * every N months) so a `*​/5 * * * *` reads as "Runs every 5 minutes"
 * instead of raw cron, and otherwise falls back to a generic label.
 */
export function cronSummary(
  cron: string,
  labels: ScheduleSummaryLabels = DEFAULT_SCHEDULE_SUMMARY_LABELS,
  locale = "en-US",
): string {
  const trimmed = cron.trim();
  if (!trimmed) return labels.noSchedule;

  const interval = parseEverySchedule(trimmed);
  if (interval) {
    const n = interval.every;
    if (interval.unit === "hours") {
      return n === 1 ? labels.everyHour : interp(labels.everyNHours, { n });
    }
    return n === 1 ? labels.everyMinute : interp(labels.everyNMinutes, { n });
  }

  const preset = cronToPreset(trimmed);
  if (preset && preset !== "custom") {
    const o = cronToOptions(trimmed);
    return presetSummary(
      preset,
      {
        time: o.time ?? "09:00",
        daysOfWeek: o.daysOfWeek ?? [1],
        dayOfMonth: o.dayOfMonth ?? 1,
      },
      labels,
      locale,
    );
  }

  const parts = trimmed.split(/\s+/);
  if (parts.length === 5) {
    const [min, hour, dom, month, dow] = parts;
    const everyDay = dom === "*" && month === "*" && dow === "*";
    if (everyDay) {
      const minStep = min.match(/^\*\/(\d+)$/);
      if (hour === "*" && (min === "*" || minStep)) {
        const n = minStep ? Number(minStep[1]) : 1;
        return n === 1
          ? labels.everyMinute
          : interp(labels.everyNMinutes, { n });
      }
      const hourStep = hour.match(/^\*\/(\d+)$/);
      if (/^\d+$/.test(min) && hourStep) {
        const n = Number(hourStep[1]);
        return n === 1 ? labels.everyHour : interp(labels.everyNHours, { n });
      }
    }
    const domStep = dom.match(/^\*\/(\d+)$/);
    if (
      month === "*" &&
      dow === "*" &&
      /^\d+$/.test(min) &&
      /^\d+$/.test(hour) &&
      domStep
    ) {
      const n = Number(domStep[1]);
      const t = formatTime(`${hour}:${min}`, locale);
      return n === 1
        ? interp(labels.everyDay, { time: t })
        : interp(labels.everyNDays, { n, time: t });
    }

    const monthStep = month.match(/^\*\/(\d+)$/);
    if (
      dow === "*" &&
      monthStep &&
      /^\d+$/.test(min) &&
      /^\d+$/.test(hour) &&
      /^\d+$/.test(dom)
    ) {
      const t = formatTime(`${hour}:${min}`, locale);
      return interp(labels.everyNMonths, {
        ordinal: ordinal(Number(dom)),
        n: Number(dom),
        months: Number(monthStep[1]),
        time: t,
      });
    }
  }

  return labels.custom;
}
