/**
 * Picker fields used by ScheduleBuilder — time, day-of-week, day-of-month, and
 * the "On these days" weekday multi-select. The "Repeat every N [unit]" control
 * lives in schedule-interval-picker.tsx and reuses labelClass exported here.
 */
import { cn } from "@houston-ai/core"

const inputClass = cn(
  "px-3 py-2 rounded-lg border border-border/20 bg-background",
  "text-sm text-foreground",
  "focus:outline-none focus:shadow-sm transition-shadow",
)

export const labelClass = "text-xs font-medium text-muted-foreground mb-1.5 block"

const DAYS_OF_WEEK = [
  { value: 0, label: "Sun" },
  { value: 1, label: "Mon" },
  { value: 2, label: "Tue" },
  { value: 3, label: "Wed" },
  { value: 4, label: "Thu" },
  { value: 5, label: "Fri" },
  { value: 6, label: "Sat" },
]

export function TimePicker({
  value,
  onChange,
}: {
  value: string
  onChange: (time: string) => void
}) {
  return (
    <div>
      <label className={labelClass}>Time</label>
      <input
        type="time"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={cn(inputClass, "w-full")}
      />
    </div>
  )
}

export function DayOfWeekPicker({
  value,
  onChange,
}: {
  value: number
  onChange: (day: number) => void
}) {
  return (
    <div>
      <label className={labelClass}>Day</label>
      <div className="flex gap-1">
        {DAYS_OF_WEEK.map((day) => (
          <button
            key={day.value}
            onClick={() => onChange(day.value)}
            className={cn(
              "size-8 rounded-lg text-xs font-medium transition-colors",
              value === day.value
                ? "bg-primary text-primary-foreground"
                : "bg-background border border-border/20 text-muted-foreground hover:text-foreground",
            )}
          >
            {day.label}
          </button>
        ))}
      </div>
    </div>
  )
}

export function DayOfMonthPicker({
  value,
  onChange,
}: {
  value: number
  onChange: (day: number) => void
}) {
  return (
    <div>
      <label className={labelClass}>Day of month</label>
      <input
        type="number"
        min={1}
        max={31}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className={cn(inputClass, "w-24")}
      />
    </div>
  )
}

// Single-letter weekday labels (Sunday-first), matching the chosen prototype.
const WEEKDAYS_MIN = ["S", "M", "T", "W", "T", "F", "S"]
const WEEKDAYS_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]

const WEEKDAY_SHORTCUTS: { label: string; days: number[] }[] = [
  { label: "Every day", days: [0, 1, 2, 3, 4, 5, 6] },
  { label: "Weekdays", days: [1, 2, 3, 4, 5] },
  { label: "Weekends", days: [0, 6] },
]

/**
 * "On these days" — multi-select weekday toggle (S M T W T F S) plus quick
 * shortcuts, for the custom weekly schedule. Multi-select, so distinct from
 * DayOfWeekPicker (single-day, used by the Weekly preset).
 */
export function WeekdaysPicker({
  value,
  onChange,
}: {
  value: number[]
  onChange: (days: number[]) => void
}) {
  const toggle = (d: number) =>
    onChange(value.includes(d) ? value.filter((x) => x !== d) : [...value, d].sort((a, b) => a - b))
  return (
    <div>
      <label className={labelClass}>On these days</label>
      <div className="flex gap-1.5">
        {WEEKDAYS_MIN.map((label, d) => {
          const on = value.includes(d)
          return (
            <button
              key={d}
              type="button"
              aria-label={WEEKDAYS_SHORT[d]}
              aria-pressed={on}
              onClick={() => toggle(d)}
              className={cn(
                "size-9 rounded-full text-xs font-medium transition-colors",
                on
                  ? "bg-primary text-primary-foreground"
                  : "bg-background border border-border/20 text-muted-foreground hover:text-foreground",
              )}
            >
              {label}
            </button>
          )
        })}
      </div>
      <div className="mt-2 flex gap-1.5">
        {WEEKDAY_SHORTCUTS.map((s) => (
          <button
            key={s.label}
            type="button"
            onClick={() => onChange(s.days)}
            className="h-7 rounded-full border border-border/20 bg-background px-3 text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            {s.label}
          </button>
        ))}
      </div>
    </div>
  )
}

