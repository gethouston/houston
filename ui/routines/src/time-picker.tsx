import { cn, Popover, PopoverContent, PopoverTrigger } from "@houston-ai/core";
import { Clock } from "lucide-react";
import { formatTime, parseTime } from "./schedule-format.ts";
import { labelClass } from "./schedule-picker-fields.tsx";
import { PeriodColumn, TimeColumn } from "./time-picker-columns.tsx";
import {
  buildTime,
  from12Hour,
  hourOptions,
  is12HourLocale,
  minuteOptions,
  type Period,
  periodLabels,
  to12Hour,
} from "./time-picker-utils.ts";

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

  const triggerId = `time-picker-trigger-${label.toLowerCase().replace(/\s+/g, "-")}`;

  return (
    <div>
      <label htmlFor={triggerId} className={labelClass}>
        {label}
      </label>
      <Popover>
        <PopoverTrigger asChild>
          <button
            id={triggerId}
            type="button"
            aria-label={`${label}: ${formatTime(value, locale)}`}
            className={cn(
              "flex w-full items-center justify-between gap-2 px-3 py-2",
              "rounded-lg border border-line/20 bg-input",
              "text-sm text-ink transition-shadow",
              "focus:outline-none focus:shadow-sm",
            )}
          >
            <span>{formatTime(value, locale)}</span>
            <Clock className="size-4 text-ink-muted" aria-hidden />
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-auto rounded-2xl p-2">
          <fieldset className="flex gap-1 border-0 p-0 m-0" aria-label={label}>
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
          </fieldset>
        </PopoverContent>
      </Popover>
    </div>
  );
}
