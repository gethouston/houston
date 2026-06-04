/**
 * PROTOTYPE — recurrence picker (issue #430). Throwaway. Not shipped.
 *
 * Google/Notion-style monthly anchor: a dropdown that switches between "on a
 * day of the month" (BYMONTHDAY) and "on the Nth weekday" (BYDAY ordinal),
 * with the relevant inline detail control. Shared by variants E + G. (Variant F
 * uses Apple's own "Each / On the…" idiom instead.)
 */
import { cn } from "@houston-ai/core"
import type { MonthMode, Recurrence } from "./cron"
import { WEEKDAYS_LONG, ordinalWord } from "./format"

const selectClass =
  "rounded-lg border border-border/20 bg-background px-2.5 py-2 text-sm text-foreground outline-none transition-shadow focus:shadow-sm"

export function MonthlyAnchor({
  rec,
  onChange,
}: {
  rec: Recurrence
  onChange: (p: Partial<Recurrence>) => void
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
      <select
        value={rec.monthMode}
        onChange={(e) => onChange({ monthMode: e.target.value as MonthMode })}
        className={selectClass}
      >
        <option value="day">On a day of the month</option>
        <option value="weekday">On a weekday</option>
      </select>

      {rec.monthMode === "day" ? (
        <span className="flex items-center gap-2">
          day
          <input
            type="number"
            min={1}
            max={31}
            value={rec.monthDay}
            onChange={(e) => onChange({ monthDay: Math.min(31, Math.max(1, Number(e.target.value))) })}
            className={cn(selectClass, "w-16")}
          />
        </span>
      ) : (
        <span className="flex flex-wrap items-center gap-2">
          the
          <select
            value={rec.monthOrdinal}
            onChange={(e) => onChange({ monthOrdinal: Number(e.target.value) })}
            className={selectClass}
          >
            {[1, 2, 3, 4, 5, -1].map((o) => (
              <option key={o} value={o}>{ordinalWord(o)}</option>
            ))}
          </select>
          <select
            value={rec.monthWeekday}
            onChange={(e) => onChange({ monthWeekday: Number(e.target.value) })}
            className={selectClass}
          >
            {WEEKDAYS_LONG.map((d, i) => (
              <option key={i} value={i}>{d}</option>
            ))}
          </select>
        </span>
      )}
    </div>
  )
}
