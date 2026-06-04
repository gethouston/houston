/**
 * Picker fields used by ScheduleBuilder — time, day-of-week, day-of-month, and
 * the "Repeat on" weekday multi-select. The "Repeat every N [unit]" control
 * lives in schedule-interval-picker.tsx and reuses inputClass/labelClass here.
 */
import { cn } from "@houston-ai/core"

export const inputClass = cn(
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

const WEEKDAYS_MON_FIRST = [
  { value: 1, label: "Monday" },
  { value: 2, label: "Tuesday" },
  { value: 3, label: "Wednesday" },
  { value: 4, label: "Thursday" },
  { value: 5, label: "Friday" },
  { value: 6, label: "Saturday" },
  { value: 0, label: "Sunday" },
]

/**
 * "Repeat on" — full-name weekday multi-select for the custom weekly schedule.
 * One or more days; Monday-first. (Distinct from DayOfWeekPicker, which is the
 * single-day Sunday-first picker used by the Weekly preset.)
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
      <label className={labelClass}>Repeat on</label>
      <div className="flex flex-wrap gap-1.5">
        {WEEKDAYS_MON_FIRST.map((day) => {
          const on = value.includes(day.value)
          return (
            <button
              key={day.value}
              type="button"
              aria-pressed={on}
              onClick={() => toggle(day.value)}
              className={cn(
                "h-8 px-3 rounded-full text-xs font-medium transition-colors",
                on
                  ? "bg-primary text-primary-foreground"
                  : "bg-background border border-border/20 text-muted-foreground hover:text-foreground",
              )}
            >
              {day.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}

