import { cn } from "@houston-ai/core";
import { longWeekdayNames, narrowWeekdayNames } from "./schedule-format.ts";

const inputClass = cn(
  "px-3 py-2 rounded-lg border border-line/20 bg-input",
  "text-sm text-ink",
  "focus:outline-none focus:shadow-sm transition-shadow",
);

export const labelClass = "text-xs font-medium text-ink-muted mb-1.5 block";

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
  const full = longWeekdayNames(locale);
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
          const weekdayKey = `weekday-${d}`;
          return (
            <button
              key={weekdayKey}
              type="button"
              aria-label={full[d]}
              aria-pressed={on}
              onClick={() => toggle(d)}
              className={cn(
                "size-9 rounded-full text-xs font-medium transition-colors",
                on
                  ? "bg-action text-action-text"
                  : "bg-input border border-line/20 text-ink-muted hover:text-ink",
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
            className="h-7 rounded-full border border-line/20 bg-input px-3 text-xs text-ink-muted transition-colors hover:text-ink"
          >
            {shortcuts[s.key]}
          </button>
        ))}
      </div>
    </fieldset>
  );
}
