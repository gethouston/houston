/**
 * PROTOTYPE — recurrence picker (issue #430). Throwaway. Not shipped.
 *
 * VARIANT F — Apple Calendar style. Frequency-first, in grouped sectioned rows:
 * a "Frequency" segmented control + an "Every N [unit]" stepper (unit follows
 * the frequency, Apple-style), then a frequency-specific section. Weekly uses
 * Apple iOS's vertical full-name day CHECKLIST; monthly uses the "Each / On
 * the…" dual mode. Spacious, one concept per section, accent checkmarks.
 */
import { cn } from "@houston-ai/core"
import type { Freq, Recurrence } from "./cron"
import { MONTHS_LONG, WEEKDAYS_LONG, ordinalWord } from "./format"
import { NumberStepper, TimeField, EndPicker } from "./controls"
import { WeekdayChecklist } from "./weekday-buttons"

const FREQ_TABS: { key: Freq; label: string }[] = [
  { key: "day", label: "Daily" },
  { key: "week", label: "Weekly" },
  { key: "month", label: "Monthly" },
  { key: "year", label: "Yearly" },
]

const UNIT_NOUN: Record<Freq, string> = {
  minute: "minute", hour: "hour", day: "day", week: "week", month: "month", year: "year",
}

const selectClass =
  "rounded-lg border border-border/20 bg-background px-2.5 py-2 text-sm text-foreground outline-none"

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-2 px-1 text-xs font-medium text-muted-foreground">{label}</p>
      <div className="space-y-3 rounded-xl border border-border/15 bg-background p-3">{children}</div>
    </div>
  )
}

export function VariantF({ rec, onChange }: { rec: Recurrence; onChange: (p: Partial<Recurrence>) => void }) {
  return (
    <div className="space-y-4">
      <Section label="Frequency">
        <div className="grid grid-cols-4 gap-1.5">
          {FREQ_TABS.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => onChange({ freq: f.key })}
              className={cn(
                "h-9 rounded-lg text-sm font-medium transition-colors",
                rec.freq === f.key
                  ? "bg-primary text-primary-foreground"
                  : "bg-secondary text-muted-foreground hover:text-foreground",
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2.5 text-sm text-muted-foreground">
          Every
          <NumberStepper value={rec.interval} onChange={(interval) => onChange({ interval })} />
          {UNIT_NOUN[rec.freq]}{rec.interval > 1 ? "s" : ""}
        </div>
      </Section>

      {rec.freq === "week" && (
        <Section label="On these days">
          <WeekdayChecklist value={rec.weekdays} onChange={(weekdays) => onChange({ weekdays })} />
        </Section>
      )}

      {rec.freq === "month" && (
        <Section label="On">
          <div className="grid grid-cols-2 gap-1.5">
            {(["day", "weekday"] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => onChange({ monthMode: mode })}
                className={cn(
                  "h-9 rounded-lg text-sm font-medium transition-colors",
                  rec.monthMode === mode ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground hover:text-foreground",
                )}
              >
                {mode === "day" ? "Each" : "On the…"}
              </button>
            ))}
          </div>
          {rec.monthMode === "day" ? (
            <div className="grid grid-cols-7 gap-1">
              {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => onChange({ monthDay: d })}
                  className={cn(
                    "grid h-9 place-items-center rounded-lg text-xs tabular-nums transition-colors",
                    rec.monthDay === d ? "bg-primary font-medium text-primary-foreground" : "text-muted-foreground hover:bg-secondary",
                  )}
                >
                  {d}
                </button>
              ))}
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <select value={rec.monthOrdinal} onChange={(e) => onChange({ monthOrdinal: Number(e.target.value) })} className={selectClass}>
                {[1, 2, 3, 4, 5, -1].map((o) => (
                  <option key={o} value={o}>{ordinalWord(o)}</option>
                ))}
              </select>
              <select value={rec.monthWeekday} onChange={(e) => onChange({ monthWeekday: Number(e.target.value) })} className={selectClass}>
                {WEEKDAYS_LONG.map((d, i) => (
                  <option key={i} value={i}>{d}</option>
                ))}
              </select>
            </div>
          )}
        </Section>
      )}

      {rec.freq === "year" && (
        <Section label="In">
          <div className="flex flex-wrap items-center gap-2">
            <select value={rec.yearMonth} onChange={(e) => onChange({ yearMonth: Number(e.target.value) })} className={selectClass}>
              {MONTHS_LONG.map((mo, i) => (
                <option key={mo} value={i + 1}>{mo}</option>
              ))}
            </select>
            <input
              type="number"
              min={1}
              max={31}
              value={rec.monthDay}
              onChange={(e) => onChange({ monthDay: Math.min(31, Math.max(1, Number(e.target.value))) })}
              className={cn(selectClass, "w-20")}
            />
          </div>
        </Section>
      )}

      {rec.freq !== "hour" && (
        <Section label="At">
          <TimeField value={rec.time} onChange={(time) => onChange({ time })} />
        </Section>
      )}

      <Section label="End repeat">
        <EndPicker value={rec} onChange={onChange} />
      </Section>
    </div>
  )
}
