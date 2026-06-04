/**
 * PROTOTYPE — recurrence picker (issue #430). Throwaway. Not shipped.
 *
 * Full-name weekday selectors for the refined Google/Notion/Apple-style
 * variants (E/F/G). Monday-first ordering, as requested in the spec. Two
 * presentations — a wrapping pill row (Google/Notion feel) and a vertical
 * checklist (Apple iOS feel) — so each variant can pick the one that fits.
 */
import { cn } from "@houston-ai/core"
import { Check } from "lucide-react"
import { WEEKDAYS_LONG, WEEKDAYS_SHORT } from "./format"

/** Display order Mon → Sun (data values stay 0=Sun … 6=Sat). */
export const WEEKDAY_ORDER_MON = [1, 2, 3, 4, 5, 6, 0]

function toggle(value: number[], d: number): number[] {
  return value.includes(d) ? value.filter((x) => x !== d) : [...value, d].sort((a, b) => a - b)
}

/** Wrapping row of full-name (or abbreviated) day buttons — "Repeat on". */
export function WeekdayPillRow({
  value,
  onChange,
  labels = "full",
}: {
  value: number[]
  onChange: (days: number[]) => void
  labels?: "full" | "short"
}) {
  const names = labels === "full" ? WEEKDAYS_LONG : WEEKDAYS_SHORT
  return (
    <div className="flex flex-wrap gap-1.5">
      {WEEKDAY_ORDER_MON.map((d) => {
        const on = value.includes(d)
        return (
          <button
            key={d}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(toggle(value, d))}
            className={cn(
              "h-9 rounded-full px-3.5 text-sm font-medium transition-colors",
              on
                ? "bg-primary text-primary-foreground"
                : "bg-background border border-border/25 text-muted-foreground hover:text-foreground hover:border-border/50",
            )}
          >
            {names[d]}
          </button>
        )
      })}
    </div>
  )
}

/** Vertical checklist of full day names with a trailing check — Apple style. */
export function WeekdayChecklist({
  value,
  onChange,
}: {
  value: number[]
  onChange: (days: number[]) => void
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-border/20 bg-background">
      {WEEKDAY_ORDER_MON.map((d, i) => {
        const on = value.includes(d)
        return (
          <button
            key={d}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(toggle(value, d))}
            className={cn(
              "flex w-full items-center justify-between px-4 py-2.5 text-left text-sm transition-colors hover:bg-secondary",
              i > 0 && "border-t border-border/15",
              on ? "text-foreground" : "text-muted-foreground",
            )}
          >
            {WEEKDAYS_LONG[d]}
            {on && <Check className="size-4 text-primary" strokeWidth={2.5} />}
          </button>
        )
      })}
    </div>
  )
}
