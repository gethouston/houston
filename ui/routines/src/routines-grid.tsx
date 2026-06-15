/**
 * RoutinesGrid — list view of routines, with an empty state and primary CTA.
 *
 * The parent tab already labels this surface "Routines", so this view skips
 * a redundant page header and goes straight to a meta row + the list.
 *
 * Timezone is an account-wide setting (one zone for every routine), so its
 * picker lives HERE on the list — not inside each routine's editor. It sits
 * directly under the "New routine" row, capping the list it governs.
 */
import { useMemo } from "react"
import {
  cn,
  EmptyHeader,
  EmptyTitle,
  EmptyDescription,
  Button,
} from "@houston-ai/core"
import { Plus, Globe } from "lucide-react"
import type { Routine, RoutineRun } from "./types"
import { RoutineRow } from "./routine-row"
import {
  DEFAULT_GRID_LABELS,
  DEFAULT_ROW_LABELS,
  DEFAULT_SCHEDULE_SUMMARY_LABELS,
  DEFAULT_NEXT_FIRE_LABELS,
  type RoutinesGridLabels,
  type RoutineRowLabels,
  type ScheduleSummaryLabels,
  type NextFireLabels,
} from "./labels"

const COMMON_TIMEZONES = [
  "UTC",
  "America/Los_Angeles",
  "America/Denver",
  "America/Chicago",
  "America/New_York",
  "America/Bogota",
  "America/Mexico_City",
  "America/Sao_Paulo",
  "Europe/London",
  "Europe/Madrid",
  "Europe/Berlin",
  "Europe/Athens",
  "Africa/Lagos",
  "Asia/Dubai",
  "Asia/Kolkata",
  "Asia/Singapore",
  "Asia/Tokyo",
  "Australia/Sydney",
]

function listTimezones(): string[] {
  try {
    const supported = (
      Intl as { supportedValuesOf?: (k: string) => string[] }
    ).supportedValuesOf?.("timeZone")
    if (supported && supported.length) return supported
  } catch {
    // fall through
  }
  return COMMON_TIMEZONES
}

export interface RoutinesGridProps {
  routines: Routine[]
  /** Most recent run per routine, keyed by routine ID. */
  lastRuns?: Record<string, RoutineRun>
  /** The account-wide IANA timezone every routine fires in. */
  accountTimezone: string
  /**
   * Persist a new account-wide timezone. Changing it re-times every routine.
   * Omit it (standalone callers) and the timezone bar is hidden.
   */
  onTimezoneChange?: (tz: string) => void
  loading?: boolean
  onSelect: (routineId: string) => void
  onCreate?: () => void
  onToggle?: (routineId: string, enabled: boolean) => void
  /**
   * Localized labels. English defaults so existing callers still work.
   * Consumers pass `t()` results for localization — `ui/` stays i18n-agnostic
   * per the library-boundary rule.
   */
  labels?: RoutinesGridLabels
  /** Row-level labels + schedule/next-run formatter labels, threaded to rows. */
  rowLabels?: RoutineRowLabels
  scheduleSummaryLabels?: ScheduleSummaryLabels
  nextFireLabels?: NextFireLabels
  /** BCP-47 locale for day names + time formatting in row summaries. */
  locale?: string
}

/**
 * Account-wide timezone control. A gray "card" (matching the routine editor's
 * section cards) holding a labeled white-well `<select>` and a one-line hint,
 * so the user reads "this zone applies to every routine below".
 */
function TimezoneCard({
  accountTimezone,
  timezones,
  onTimezoneChange,
  label,
  hint,
  className,
}: {
  accountTimezone: string
  timezones: string[]
  onTimezoneChange: (tz: string) => void
  label: string
  hint: string
  className?: string
}) {
  return (
    <section className={cn("rounded-xl bg-secondary px-5 py-4", className)}>
      <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
        {label}
      </label>
      <div className="relative">
        <Globe
          className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground pointer-events-none"
          strokeWidth={1.75}
        />
        <select
          value={accountTimezone}
          onChange={(e) => onTimezoneChange(e.target.value)}
          aria-label={label}
          className={cn(
            "w-full rounded-lg border border-border/20 bg-background px-3 py-2 text-sm",
            "text-foreground transition-shadow duration-200",
            "pl-9 appearance-none cursor-pointer",
            "focus:outline-none focus:shadow-sm",
          )}
        >
          {timezones.map((tz) => (
            <option key={tz} value={tz}>
              {tz}
            </option>
          ))}
        </select>
      </div>
      <p className="text-xs text-muted-foreground/70 mt-1.5">{hint}</p>
    </section>
  )
}

export function RoutinesGrid({
  routines,
  lastRuns = {},
  accountTimezone,
  onTimezoneChange,
  loading,
  onSelect,
  onCreate,
  onToggle,
  labels = DEFAULT_GRID_LABELS,
  rowLabels = DEFAULT_ROW_LABELS,
  scheduleSummaryLabels = DEFAULT_SCHEDULE_SUMMARY_LABELS,
  nextFireLabels = DEFAULT_NEXT_FIRE_LABELS,
  locale = "en-US",
}: RoutinesGridProps) {
  const l = labels
  // Sort: enabled first, then alphabetical
  const sorted = [...routines].sort((a, b) => {
    if (a.enabled !== b.enabled) return a.enabled ? -1 : 1
    return a.name.localeCompare(b.name)
  })

  // The picker lists every zone with the account zone selected; ensure that
  // zone is present even if the platform's zone list happens to omit it.
  const timezones = useMemo(() => {
    const all = listTimezones()
    return all.includes(accountTimezone) ? all : [accountTimezone, ...all]
  }, [accountTimezone])

  if (loading && routines.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center bg-background">
        <p className="text-sm text-muted-foreground animate-pulse">
          {l.loading}
        </p>
      </div>
    )
  }

  if (sorted.length === 0) {
    return (
      <div className="flex-1 min-h-0 overflow-y-auto bg-background">
        <div className="mx-auto max-w-md flex flex-col items-center gap-6 text-center pt-24 px-6">
          <EmptyHeader>
            <EmptyTitle>{l.emptyTitle}</EmptyTitle>
            <EmptyDescription>
              {l.emptyDescription}
            </EmptyDescription>
          </EmptyHeader>
          {onCreate && (
            <Button onClick={onCreate}>
              <Plus className="size-4" />
              {l.newRoutine}
            </Button>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 min-h-0 overflow-y-auto bg-background">
      <div className="max-w-3xl mx-auto px-6 py-7">
        {/* Description + CTA. No page title — tab handles it. */}
        <div className="flex items-center justify-between gap-4 mb-4">
          <p className="text-xs text-muted-foreground max-w-md">
            {l.descriptionShort}
          </p>
          {onCreate && (
            <Button size="sm" onClick={onCreate} className="shrink-0">
              <Plus className="size-3.5" />
              {l.newRoutine}
            </Button>
          )}
        </div>

        {/* Account-wide timezone — governs every routine in the list below. */}
        {onTimezoneChange && (
          <TimezoneCard
            accountTimezone={accountTimezone}
            timezones={timezones}
            onTimezoneChange={onTimezoneChange}
            label={l.timezoneLabel}
            hint={l.timezoneHint}
            className="mb-3"
          />
        )}

        {/* List card — gray, divides hold rows */}
        <div
          className={cn(
            "rounded-xl bg-secondary overflow-hidden",
            "divide-y divide-border/60",
          )}
        >
          {sorted.map((routine) => (
            <RoutineRow
              key={routine.id}
              routine={routine}
              lastRun={lastRuns[routine.id]}
              accountTimezone={accountTimezone}
              onClick={() => onSelect(routine.id)}
              onToggle={
                onToggle ? (enabled) => onToggle(routine.id, enabled) : undefined
              }
              labels={rowLabels}
              scheduleSummaryLabels={scheduleSummaryLabels}
              nextFireLabels={nextFireLabels}
              locale={locale}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
