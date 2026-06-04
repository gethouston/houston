/**
 * PROTOTYPE — recurrence picker (issue #430). Throwaway. Not shipped.
 *
 * VARIANT G — Houston-refined production candidate. Preset-first with
 * custom-deep (Google/Notion's "smart presets above Custom"), tuned to
 * Houston's pill-and-chip design system: warm quick chips for the common cases,
 * then the always-visible "Repeat every [N] [unit ▾]" builder with a "Repeat
 * on" row of full-name day buttons. The cleanest match to the requested spec.
 */
import { cn } from "@houston-ai/core"
import type { Recurrence } from "./cron"
import { NumberStepper, TimeField, EndPicker } from "./controls"
import { UnitSelect } from "./unit-select"
import { WeekdayPillRow } from "./weekday-buttons"
import { WeekdayShortcuts } from "./weekday-toggle"
import { MonthlyAnchor } from "./monthly"

type Patch = (p: Partial<Recurrence>) => void

const sameSet = (a: number[], b: number[]) =>
  a.length === b.length && [...a].sort((x, y) => x - y).join() === [...b].sort((x, y) => x - y).join()

const PRESETS: { key: string; label: string; patch: Partial<Recurrence> }[] = [
  { key: "daily", label: "Daily", patch: { freq: "day", interval: 1 } },
  { key: "weekdays", label: "Weekdays", patch: { freq: "week", interval: 1, weekdays: [1, 2, 3, 4, 5] } },
  { key: "weekends", label: "Weekends", patch: { freq: "week", interval: 1, weekdays: [0, 6] } },
  { key: "monthly", label: "Monthly", patch: { freq: "month", interval: 1, monthMode: "day" } },
]

function isActive(rec: Recurrence, key: string): boolean {
  if (key === "daily") return rec.freq === "day" && rec.interval === 1
  if (key === "weekdays") return rec.freq === "week" && sameSet(rec.weekdays, [1, 2, 3, 4, 5])
  if (key === "weekends") return rec.freq === "week" && sameSet(rec.weekdays, [0, 6])
  if (key === "monthly") return rec.freq === "month" && rec.interval === 1
  return false
}

const Label = ({ children }: { children: React.ReactNode }) => (
  <p className="mb-2 text-xs font-medium text-muted-foreground">{children}</p>
)

export function VariantG({ rec, onChange }: { rec: Recurrence; onChange: Patch }) {
  const showTime = rec.freq !== "hour"

  return (
    <div className="space-y-5">
      {/* Smart preset chips */}
      <div className="flex flex-wrap gap-1.5">
        {PRESETS.map((p) => (
          <button
            key={p.key}
            type="button"
            onClick={() => onChange(p.patch)}
            className={cn(
              "h-9 rounded-full px-3.5 text-sm font-medium transition-colors",
              isActive(rec, p.key)
                ? "bg-primary text-primary-foreground"
                : "bg-secondary text-muted-foreground hover:text-foreground",
            )}
          >
            {p.label}
          </button>
        ))}
      </div>

      <div className="h-px bg-border/15" />

      {/* Repeat every [N] [unit] */}
      <div className="flex flex-wrap items-center gap-2.5">
        <span className="text-sm text-muted-foreground">Repeat every</span>
        <NumberStepper value={rec.interval} onChange={(interval) => onChange({ interval })} />
        <UnitSelect value={rec.freq} count={rec.interval} onChange={(freq) => onChange({ freq })} />
      </div>

      {/* Weekly — Repeat on (full-name buttons + shortcuts) */}
      {rec.freq === "week" && (
        <div className="space-y-2.5">
          <Label>Repeat on</Label>
          <WeekdayPillRow value={rec.weekdays} onChange={(weekdays) => onChange({ weekdays })} />
          <WeekdayShortcuts onPick={(weekdays) => onChange({ weekdays })} />
        </div>
      )}

      {/* Monthly anchor */}
      {rec.freq === "month" && (
        <div>
          <Label>On</Label>
          <MonthlyAnchor rec={rec} onChange={onChange} />
        </div>
      )}

      {/* Time */}
      {showTime && (
        <div>
          <Label>At what time</Label>
          <TimeField value={rec.time} onChange={(time) => onChange({ time })} />
        </div>
      )}

      {/* Ends */}
      <div>
        <Label>Ends</Label>
        <EndPicker value={rec} onChange={onChange} />
      </div>
    </div>
  )
}
