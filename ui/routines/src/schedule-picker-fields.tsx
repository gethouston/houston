/**
 * Picker fields used by ScheduleBuilder — time, day-of-week, day-of-month,
 * and the friendly "every N minutes/hours/days" interval picker.
 */
import { cn } from "@houston-ai/core"
import type { IntervalUnit } from "./schedule-interval-utils"
import { INTERVAL_UNIT_LABELS } from "./schedule-interval-utils"

const INTERVAL_UNITS: IntervalUnit[] = ["minutes", "hours", "days"]

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

/**
 * Friendly "Every [N] [minutes/hours/days]" picker — the non-technical
 * replacement for typing a raw cron expression. The count is a free-text string
 * so it can be cleared completely while typing; the builder validates it and
 * turns the interval into cron.
 */
export function IntervalPicker({
  every,
  unit,
  invalid,
  onEveryChange,
  onUnitChange,
}: {
  every: string
  unit: IntervalUnit
  invalid?: boolean
  onEveryChange: (every: string) => void
  onUnitChange: (unit: IntervalUnit) => void
}) {
  return (
    <div>
      <label className={labelClass}>Run every</label>
      <div className="flex items-center gap-2">
        <input
          type="text"
          inputMode="numeric"
          value={every}
          // Keep digits only so the field stays a plain whole number; an empty
          // string is allowed (and flagged invalid) so it can be fully cleared.
          onChange={(e) => onEveryChange(e.target.value.replace(/[^\d]/g, ""))}
          placeholder="1"
          className={cn(
            inputClass,
            "w-20",
            invalid && "border-red-500/50",
          )}
        />
        <div className="flex gap-1">
          {INTERVAL_UNITS.map((u) => (
            <button
              key={u}
              onClick={() => onUnitChange(u)}
              className={cn(
                "h-8 px-3 rounded-lg text-xs font-medium transition-colors capitalize",
                unit === u
                  ? "bg-primary text-primary-foreground"
                  : "bg-background border border-border/20 text-muted-foreground hover:text-foreground",
              )}
            >
              {INTERVAL_UNIT_LABELS[u]}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
