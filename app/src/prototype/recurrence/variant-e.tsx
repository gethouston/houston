/**
 * PROTOTYPE — recurrence picker (issue #430). Throwaway. Not shipped.
 *
 * VARIANT E — Notion Calendar style. Minimal & inline: a live summary sentence
 * is the headline "value" (Notion's signature — the Repeat field reads back the
 * rule), then a tight, low-chrome builder. "Repeat every [N] [unit ▾]" on one
 * row; choosing "week" reveals a "Repeat on" row of full-name day buttons.
 * One accent, lots of whitespace, no heavy chrome.
 */
import { Repeat } from "lucide-react"
import type { Recurrence } from "./cron"
import { summarize } from "./summary"
import { NumberStepper, TimeField, EndPicker } from "./controls"
import { UnitSelect } from "./unit-select"
import { WeekdayPillRow } from "./weekday-buttons"
import { MonthlyAnchor } from "./monthly"

const Label = ({ children }: { children: React.ReactNode }) => (
  <p className="mb-2 text-xs font-medium text-muted-foreground">{children}</p>
)

export function VariantE({ rec, onChange }: { rec: Recurrence; onChange: (p: Partial<Recurrence>) => void }) {
  const showTime = rec.freq !== "hour"
  const headline = summarize(rec).replace(/^Runs /, "")
  const titled = headline.charAt(0).toUpperCase() + headline.slice(1)

  return (
    <div className="space-y-6">
      {/* Notion summary-as-value headline */}
      <div className="flex items-center gap-2.5 border-b border-border/15 pb-4">
        <Repeat className="size-4 text-muted-foreground" strokeWidth={1.75} />
        <span className="text-base text-foreground">{titled}</span>
      </div>

      {/* Repeat every [N] [unit] — one row */}
      <div className="flex flex-wrap items-center gap-2.5">
        <span className="text-sm text-muted-foreground">Repeat every</span>
        <NumberStepper value={rec.interval} onChange={(interval) => onChange({ interval })} />
        <UnitSelect value={rec.freq} count={rec.interval} onChange={(freq) => onChange({ freq })} />
      </div>

      {/* Weekly — Repeat on (full-name day buttons) */}
      {rec.freq === "week" && (
        <div>
          <Label>Repeat on</Label>
          <WeekdayPillRow value={rec.weekdays} onChange={(weekdays) => onChange({ weekdays })} />
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
          <Label>At</Label>
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
