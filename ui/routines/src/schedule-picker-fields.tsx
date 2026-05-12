/**
 * Picker fields used by ScheduleBuilder — time, day-of-week, day-of-month.
 */
import { cn } from "@houston-ai/core"

const inputClass = cn(
  "px-3 py-2 rounded-lg border border-border/20 bg-background",
  "text-sm text-foreground",
  "focus:outline-none focus:shadow-sm transition-shadow",
)

const labelClass = "text-xs font-medium text-muted-foreground mb-1.5 block"

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

export function CronInput({
  value,
  onChange,
}: {
  value: string
  onChange: (cron: string) => void
}) {
  return (
    <div>
      <label className={labelClass}>Cron Expression</label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="* * * * *"
        className={cn(inputClass, "w-full font-mono")}
      />
      <p className="text-[11px] text-muted-foreground mt-1">
        Format: minute hour day-of-month month day-of-week
      </p>
    </div>
  )
}
