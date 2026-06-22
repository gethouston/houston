/**
 * Picker fields used by ScheduleBuilder — day-of-month and the "On these days"
 * weekday multi-select. The clock-button time picker lives in time-picker.tsx
 * and the "Repeat every N [unit]" control in schedule-interval-picker.tsx; both
 * reuse `labelClass` exported here.
 *
 * All visible text arrives via props so the package stays i18n-agnostic;
 * weekday names come from `Intl` in the given `locale`.
 */
import { cn } from "@houston-ai/core";
import { narrowWeekdayNames, shortWeekdayNames } from "./schedule-format";

const inputClass = cn(
  "px-3 py-2 rounded-lg border border-border/20 bg-background",
  "text-sm text-foreground",
  "focus:outline-none focus:shadow-sm transition-shadow",
);

export const labelClass =
  "text-xs font-medium text-muted-foreground mb-1.5 block";

export function DayOfMonthPicker({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (day: number) => void;
}) {
  return (
    <div>
      <label className={labelClass}>
        {label}
        <input
          type="number"
          min={1}
          max={31}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className={cn(inputClass, "w-24")}
        />
      </label>
    </div>
  );
}

const WEEKDAY_SHORTCUTS: {
  key: "everyDay" | "weekdays" | "weekends";
  days: number[];
}[] = [
  { key: "everyDay", days: [0, 1, 2, 3, 4, 5, 6] },
  { key: "weekdays", days: [1, 2, 3, 4, 5] },
  { key: "weekends", days: [0, 6] },
];

/**
 * "On these days" — multi-select weekday toggle (S M T W T F S) plus quick
 * shortcuts (Every day / Weekdays / Weekends), used by the Weekly preset to
 * pick one or more days. Weekday glyphs and aria-labels come from `Intl` in the
 * given `locale`.
 */
export function WeekdaysPicker({
  label,
  locale = "en-US",
  shortcuts,
  value,
  onChange,
}: {
  label: string;
  locale?: string;
  shortcuts: { everyDay: string; weekdays: string; weekends: string };
  value: number[];
  onChange: (days: number[]) => void;
}) {
  const narrow = narrowWeekdayNames(locale);
  const short = shortWeekdayNames(locale);
  const toggle = (d: number) =>
    onChange(
      value.includes(d)
        ? value.filter((x) => x !== d)
        : [...value, d].sort((a, b) => a - b),
    );
  return (
    <fieldset className="contents">
      <legend className={labelClass}>{label}</legend>
      <div className="flex gap-1.5">
        {narrow.map((glyph, d) => {
          const on = value.includes(d);
          // `d` is the weekday number (0 = Sun … 6 = Sat), not a volatile list
          // position, so it is a stable semantic key.
          const weekdayKey = `weekday-${d}`;
          return (
            <button
              key={weekdayKey}
              type="button"
              aria-label={short[d]}
              aria-pressed={on}
              onClick={() => toggle(d)}
              className={cn(
                "size-9 rounded-full text-xs font-medium transition-colors",
                on
                  ? "bg-primary text-primary-foreground"
                  : "bg-background border border-border/20 text-muted-foreground hover:text-foreground",
              )}
            >
              {glyph}
            </button>
          );
        })}
      </div>
      <div className="mt-2 flex gap-1.5">
        {WEEKDAY_SHORTCUTS.map((s) => (
          <button
            key={s.key}
            type="button"
            onClick={() => onChange(s.days)}
            className="h-7 rounded-full border border-border/20 bg-background px-3 text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            {shortcuts[s.key]}
          </button>
        ))}
      </div>
    </fieldset>
  );
}
