/**
 * "Repeat every [N] [unit]" — the non-technical custom-interval picker, styled
 * after the chosen prototype (Variant A): a number stepper plus a row of unit
 * pills (minute / hour / day / week / month). The "weeks" unit has no count
 * (cron can't express "every N weeks"), so the stepper is hidden and the
 * WeekdaysPicker carries the schedule instead.
 */
import { cn } from "@houston-ai/core"
import { Minus, Plus } from "lucide-react"
import type { IntervalUnit } from "./schedule-interval-utils"
import { labelClass } from "./schedule-picker-fields"

const FREQS: { value: IntervalUnit; singular: string }[] = [
  { value: "minutes", singular: "minute" },
  { value: "hours", singular: "hour" },
  { value: "days", singular: "day" },
  { value: "weeks", singular: "week" },
  { value: "months", singular: "month" },
]

function NumberStepper({
  value,
  onChange,
  invalid,
  disabled,
}: {
  value: string
  onChange: (value: string) => void
  invalid?: boolean
  // "weeks" has no count, so the stepper is disabled (but kept mounted) to hold
  // its place and stop the unit pills jumping left when that unit is picked.
  disabled?: boolean
}) {
  const n = Number(value) || 1
  return (
    <div
      className={cn(
        "inline-flex items-center rounded-lg border bg-background transition-opacity",
        invalid ? "border-red-500/50" : "border-border/20",
        disabled && "opacity-40",
      )}
    >
      <button
        type="button"
        aria-label="Decrease"
        onClick={() => onChange(String(Math.max(1, n - 1)))}
        disabled={disabled || n <= 1}
        className="grid size-9 place-items-center text-muted-foreground hover:text-foreground disabled:opacity-30"
      >
        <Minus className="size-4" />
      </button>
      <input
        type="text"
        inputMode="numeric"
        value={value}
        disabled={disabled}
        // Keep digits only; an empty string is allowed (and flagged invalid) so
        // it can be cleared while typing.
        onChange={(e) => onChange(e.target.value.replace(/[^\d]/g, ""))}
        className="w-10 bg-transparent text-center text-sm tabular-nums outline-none disabled:cursor-not-allowed"
      />
      <button
        type="button"
        aria-label="Increase"
        onClick={() => onChange(String(n + 1))}
        disabled={disabled}
        className="grid size-9 place-items-center text-muted-foreground hover:text-foreground disabled:opacity-30"
      >
        <Plus className="size-4" />
      </button>
    </div>
  )
}

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
  // "weeks" has no count; keep the stepper mounted-but-disabled so the unit
  // pills don't shift left when it's hidden.
  const countDisabled = unit === "weeks"
  const plural = Number(every) > 1
  return (
    <div>
      <label className={labelClass}>Repeat every</label>
      <div className="flex flex-wrap items-center gap-2">
        <NumberStepper
          value={every}
          onChange={onEveryChange}
          invalid={invalid && !countDisabled}
          disabled={countDisabled}
        />
        <div className="flex flex-wrap gap-1.5">
          {FREQS.map((f) => (
            <button
              key={f.value}
              type="button"
              onClick={() => onUnitChange(f.value)}
              className={cn(
                "h-9 rounded-full px-3 text-xs font-medium transition-colors",
                unit === f.value
                  ? "bg-primary text-primary-foreground"
                  : "bg-background border border-border/20 text-muted-foreground hover:text-foreground",
              )}
            >
              {f.singular}{plural ? "s" : ""}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
