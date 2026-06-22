/**
 * TimePicker — a friendly clock-button time picker for the schedule builder.
 *
 * The trigger shows the time in the user's locale (12h for en, 24h for es/pt)
 * next to an always-visible clock icon; clicking opens a popover with scrollable
 * hour / minute (and AM/PM, for 12h locales) columns. The stored value stays
 * "HH:MM" 24-hour regardless of how it's displayed, so the cron logic upstream
 * is unaffected.
 *
 * Replaces the bare `<input type="time">`, which in the app's macOS webview
 * renders as a digit-only spinner with no pop-up picker — the user could only
 * type or nudge with arrow keys (HOU-456).
 *
 * i18n-agnostic per the library boundary: the field label + column names arrive
 * via props; AM/PM markers and the 12h-vs-24h choice come from `Intl` in the
 * given `locale`. The scroll columns live in time-picker-columns.tsx.
 */
import { Clock } from "lucide-react";
import { cn, Popover, PopoverContent, PopoverTrigger } from "@houston-ai/core";
import { parseTime, formatTime } from "./schedule-format.ts";
import { labelClass } from "./schedule-picker-fields.tsx";
import { TimeColumn, PeriodColumn } from "./time-picker-columns.tsx";
import {
  is12HourLocale,
  periodLabels,
  to12Hour,
  from12Hour,
  buildTime,
  hourOptions,
  minuteOptions,
  type Period,
} from "./time-picker-utils.ts";

/** Accessible names for the picker's columns. */
export interface TimePickerLabels {
  hour: string;
  minute: string;
  period: string;
}

export function TimePicker({
  label,
  value,
  onChange,
  locale = "en-US",
  labels,
}: {
  label: string;
  value: string;
  onChange: (time: string) => void;
  locale?: string;
  labels: TimePickerLabels;
}) {
  const twelveHour = is12HourLocale(locale);
  const { hour: hour24, minute } = parseTime(value);
  const { hour: hour12, period } = to12Hour(hour24);
  const periods = periodLabels(locale);

  const selectHour = (h: number) =>
    onChange(buildTime(twelveHour ? from12Hour(h, period) : h, minute));
  const selectMinute = (m: number) => onChange(buildTime(hour24, m));
  const selectPeriod = (p: Period) =>
    onChange(buildTime(from12Hour(hour12, p), minute));

  return (
    <div>
      <label className={labelClass}>{label}</label>
      <Popover>
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label={`${label}: ${formatTime(value, locale)}`}
            className={cn(
              "flex w-full items-center justify-between gap-2 px-3 py-2",
              "rounded-lg border border-border/20 bg-background",
              "text-sm text-foreground transition-shadow",
              "focus:outline-none focus:shadow-sm",
            )}
          >
            <span>{formatTime(value, locale)}</span>
            <Clock className="size-4 text-muted-foreground" aria-hidden />
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-auto rounded-2xl p-2">
          <div className="flex gap-1" role="group" aria-label={label}>
            <TimeColumn
              ariaLabel={labels.hour}
              options={hourOptions(twelveHour)}
              selected={twelveHour ? hour12 : hour24}
              onSelect={selectHour}
            />
            <TimeColumn
              ariaLabel={labels.minute}
              options={minuteOptions()}
              selected={minute}
              onSelect={selectMinute}
            />
            {twelveHour && (
              <PeriodColumn
                ariaLabel={labels.period}
                periods={periods}
                selected={period}
                onSelect={selectPeriod}
              />
            )}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
