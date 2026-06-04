/**
 * "Repeat every [N] [unit]" — the non-technical custom-interval picker. The unit
 * is a dropdown; the count is a free-text string so it can be cleared while
 * typing. The "weeks" unit has no count (cron can't express "every N weeks"), so
 * the number is hidden and the WeekdaysPicker carries the schedule instead.
 */
import { cn } from "@houston-ai/core"
import type { IntervalUnit } from "./schedule-interval-utils"
import { inputClass, labelClass } from "./schedule-picker-fields"

// The custom-interval units, with their singular noun (pluralized in the UI).
const UNIT_OPTIONS: { value: IntervalUnit; singular: string }[] = [
  { value: "minutes", singular: "minute" },
  { value: "hours", singular: "hour" },
  { value: "days", singular: "day" },
  { value: "weeks", singular: "week" },
  { value: "months", singular: "month" },
]

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
  const showCount = unit !== "weeks"
  const plural = showCount && Number(every) > 1
  return (
    <div>
      <label className={labelClass}>Repeat every</label>
      <div className="flex items-center gap-2">
        {showCount && (
          <input
            type="text"
            inputMode="numeric"
            value={every}
            // Keep digits only; an empty string is allowed (and flagged invalid)
            // so it can be fully cleared while typing.
            onChange={(e) => onEveryChange(e.target.value.replace(/[^\d]/g, ""))}
            placeholder="1"
            className={cn(inputClass, "w-20", invalid && "border-red-500/50")}
          />
        )}
        <select
          value={unit}
          onChange={(e) => onUnitChange(e.target.value as IntervalUnit)}
          className={cn(inputClass, "cursor-pointer")}
        >
          {UNIT_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.singular}{plural ? "s" : ""}
            </option>
          ))}
        </select>
      </div>
    </div>
  )
}
