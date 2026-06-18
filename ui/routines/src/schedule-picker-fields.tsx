/**
 * Picker fields used by ScheduleBuilder — time, day-of-week, day-of-month,
 * and the friendly "every N minutes/hours/days" interval picker.
 *
 * All visible text arrives via props so the package stays i18n-agnostic;
 * weekday names come from `Intl` in the given `locale`.
 */
import { cn } from "@houston-ai/core"
import type { IntervalUnit } from "./schedule-interval-utils"
import { shortWeekdayNames } from "./schedule-format"

const INTERVAL_UNITS: IntervalUnit[] = ["minutes", "hours", "days"]

const inputClass = cn(
  "px-3 py-2 rounded-lg border border-border/20 bg-background",
  "text-sm text-foreground",
  "focus:outline-none focus:shadow-sm transition-shadow",
)

const labelClass = "text-xs font-medium text-muted-foreground mb-1.5 block"

export function TimePicker({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (time: string) => void
}) {
  return (
    <div>
      <label className={labelClass}>{label}</label>
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
  label,
  locale = "en-US",
  value,
  onChange,
}: {
  label: string
  locale?: string
  value: number
  onChange: (day: number) => void
}) {
  const names = shortWeekdayNames(locale)
  return (
    <div>
      <label className={labelClass}>{label}</label>
      <div className="flex gap-1">
        {names.map((name, day) => (
          <button
            key={day}
            onClick={() => onChange(day)}
            className={cn(
              "size-8 rounded-lg text-xs font-medium transition-colors",
              value === day
                ? "bg-primary text-primary-foreground"
                : "bg-background border border-border/20 text-muted-foreground hover:text-foreground",
            )}
          >
            {name}
          </button>
        ))}
      </div>
    </div>
  )
}

export function DayOfMonthPicker({
  label,
  value,
  onChange,
}: {
  label: string
  value: number
  onChange: (day: number) => void
}) {
  return (
    <div>
      <label className={labelClass}>{label}</label>
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
 * turns the interval into cron. Heading + unit names arrive via props.
 */
export function IntervalPicker({
  label,
  units,
  every,
  unit,
  invalid,
  onEveryChange,
  onUnitChange,
}: {
  label: string
  units: Record<IntervalUnit, string>
  every: string
  unit: IntervalUnit
  invalid?: boolean
  onEveryChange: (every: string) => void
  onUnitChange: (unit: IntervalUnit) => void
}) {
  return (
    <div>
      <label className={labelClass}>{label}</label>
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
              {units[u]}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
