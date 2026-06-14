/**
 * The scrollable columns inside the TimePicker popover. Kept apart from
 * time-picker.tsx so each file stays small; these are presentational and own no
 * time logic — the parent computes values and hands selection callbacks down.
 */
import { useEffect, useRef } from "react"
import { cn } from "@houston-ai/core"
import { pad2, type Period } from "./time-picker-utils.ts"

/**
 * One scrollable column of zero-padded numbers. On mount (the popover opens) the
 * selected value is centered so the user lands on the current time, not the top
 * of the list. We set `scrollTop` directly rather than `scrollIntoView` so only
 * the column scrolls — never the surrounding page or popover.
 */
export function TimeColumn({
  ariaLabel,
  options,
  selected,
  onSelect,
}: {
  ariaLabel: string
  options: number[]
  selected: number
  onSelect: (n: number) => void
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const selectedRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    const c = containerRef.current
    const el = selectedRef.current
    if (c && el) c.scrollTop = el.offsetTop - c.clientHeight / 2 + el.clientHeight / 2
  }, [])

  return (
    <div
      ref={containerRef}
      role="group"
      aria-label={ariaLabel}
      className="relative flex h-48 w-14 flex-col gap-0.5 overflow-y-auto scroll-smooth"
    >
      {options.map((n) => {
        const on = n === selected
        return (
          <button
            key={n}
            ref={on ? selectedRef : undefined}
            type="button"
            aria-label={`${ariaLabel} ${n}`}
            aria-pressed={on}
            onClick={() => onSelect(n)}
            className={cn(
              "shrink-0 rounded-md py-1.5 text-center text-sm tabular-nums transition-colors",
              on
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            {pad2(n)}
          </button>
        )
      })}
    </div>
  )
}

/** The AM/PM column, shown only for 12-hour locales. */
export function PeriodColumn({
  ariaLabel,
  periods,
  selected,
  onSelect,
}: {
  ariaLabel: string
  periods: { am: string; pm: string }
  selected: Period
  onSelect: (p: Period) => void
}) {
  const items: { key: Period; label: string }[] = [
    { key: "am", label: periods.am },
    { key: "pm", label: periods.pm },
  ]
  return (
    <div role="group" aria-label={ariaLabel} className="flex w-14 flex-col gap-0.5">
      {items.map((it) => {
        const on = it.key === selected
        return (
          <button
            key={it.key}
            type="button"
            aria-pressed={on}
            onClick={() => onSelect(it.key)}
            className={cn(
              "shrink-0 rounded-md py-1.5 text-center text-sm uppercase transition-colors",
              on
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            {it.label}
          </button>
        )
      })}
    </div>
  )
}
