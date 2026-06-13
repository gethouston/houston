/**
 * "Repeat every [N] [unit]" — the non-technical custom-interval picker, styled
 * after the chosen prototype (Variant A): a number stepper plus a row of unit
 * pills (minute / hour / day / month). Every unit takes a count.
 *
 * Stays i18n-agnostic: the heading, unit names (singular/plural) and stepper
 * aria-labels arrive via props; the consumer passes localized strings in.
 */
import { cn } from "@houston-ai/core"
import { Minus, Plus } from "lucide-react"
import type { IntervalUnit } from "./schedule-interval-utils"
import { labelClass } from "./schedule-picker-fields"

function NumberStepper({
  value,
  onChange,
  invalid,
  decreaseLabel,
  increaseLabel,
}: {
  value: string
  onChange: (value: string) => void
  invalid?: boolean
  decreaseLabel: string
  increaseLabel: string
}) {
  const n = Number(value) || 1
  return (
    <div
      className={cn(
        "inline-flex items-center rounded-lg border bg-background transition-opacity",
        invalid ? "border-red-500/50" : "border-border/20",
      )}
    >
      <button
        type="button"
        aria-label={decreaseLabel}
        onClick={() => onChange(String(Math.max(1, n - 1)))}
        disabled={n <= 1}
        className="grid size-9 place-items-center text-muted-foreground hover:text-foreground disabled:opacity-30"
      >
        <Minus className="size-4" />
      </button>
      <input
        type="text"
        inputMode="numeric"
        value={value}
        // Keep digits only; an empty string is allowed (and flagged invalid) so
        // it can be cleared while typing.
        onChange={(e) => onChange(e.target.value.replace(/[^\d]/g, ""))}
        className="w-10 bg-transparent text-center text-sm tabular-nums outline-none disabled:cursor-not-allowed"
      />
      <button
        type="button"
        aria-label={increaseLabel}
        onClick={() => onChange(String(n + 1))}
        className="grid size-9 place-items-center text-muted-foreground hover:text-foreground disabled:opacity-30"
      >
        <Plus className="size-4" />
      </button>
    </div>
  )
}

const UNIT_ORDER: IntervalUnit[] = ["minutes", "hours", "days", "months"]

export function IntervalPicker({
  label,
  units,
  decreaseLabel,
  increaseLabel,
  every,
  unit,
  invalid,
  onEveryChange,
  onUnitChange,
}: {
  label: string
  units: Record<IntervalUnit, { one: string; other: string }>
  decreaseLabel: string
  increaseLabel: string
  every: string
  unit: IntervalUnit
  invalid?: boolean
  onEveryChange: (every: string) => void
  onUnitChange: (unit: IntervalUnit) => void
}) {
  const plural = Number(every) > 1
  return (
    <div>
      <label className={labelClass}>{label}</label>
      <div className="flex flex-wrap items-center gap-2">
        <NumberStepper
          value={every}
          onChange={onEveryChange}
          invalid={invalid}
          decreaseLabel={decreaseLabel}
          increaseLabel={increaseLabel}
        />
        <div className="flex flex-wrap gap-1.5">
          {UNIT_ORDER.map((u) => (
            <button
              key={u}
              type="button"
              onClick={() => onUnitChange(u)}
              className={cn(
                "h-9 rounded-full px-3 text-xs font-medium transition-colors",
                unit === u
                  ? "bg-primary text-primary-foreground"
                  : "bg-background border border-border/20 text-muted-foreground hover:text-foreground",
              )}
            >
              {plural ? units[u].other : units[u].one}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
