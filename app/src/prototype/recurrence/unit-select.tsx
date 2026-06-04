/**
 * PROTOTYPE — recurrence picker (issue #430). Throwaway. Not shipped.
 *
 * The "[unit] picker" half of "Repeat every [N] [unit]" — a dropdown, as in
 * Google / Notion / Apple custom recurrence. Pluralizes with the count
 * ("week" → "weeks"). Calendar-style units only (hour…year); sub-hour cadences
 * stay in the preset row, matching every reference app.
 */
import { cn } from "@houston-ai/core"
import type { Freq } from "./cron"

export const UNIT_OPTIONS: { value: Freq; label: string }[] = [
  { value: "hour", label: "hour" },
  { value: "day", label: "day" },
  { value: "week", label: "week" },
  { value: "month", label: "month" },
  { value: "year", label: "year" },
]

export function UnitSelect({
  value,
  count,
  onChange,
  className,
}: {
  value: Freq
  count: number
  onChange: (unit: Freq) => void
  className?: string
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as Freq)}
      className={cn(
        "rounded-lg border border-border/20 bg-background px-3 py-2 text-sm text-foreground outline-none transition-shadow focus:shadow-sm",
        className,
      )}
    >
      {UNIT_OPTIONS.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
          {count > 1 ? "s" : ""}
        </option>
      ))}
    </select>
  )
}
