/**
 * RoutineRow — a single full-width row in the routines list.
 *
 * Visual: hairline-divided rows, generous height, status as a left-edge dot
 * + colored accent. Switch on the right. The whole row is clickable; the
 * switch stops propagation so toggling doesn't open the editor.
 */
import { cn, Switch } from "@houston-ai/core"
import type { Routine, RoutineRun } from "./types"
import { cronSummary } from "./schedule-summary"
import { nextFire, describeNextFire } from "./next-fire"
import { useNow } from "./use-now"
import {
  interp,
  DEFAULT_ROW_LABELS,
  DEFAULT_SCHEDULE_SUMMARY_LABELS,
  DEFAULT_NEXT_FIRE_LABELS,
  type RoutineRowLabels,
  type ScheduleSummaryLabels,
  type NextFireLabels,
} from "./labels"

export interface RoutineRowProps {
  routine: Routine
  lastRun?: RoutineRun
  /** The account-wide IANA timezone every routine fires in. */
  accountTimezone: string
  onClick?: () => void
  onToggle?: (enabled: boolean) => void
  /** Localized row labels. English defaults so standalone callers still work. */
  labels?: RoutineRowLabels
  /** Schedule-summary + next-run labels, threaded to the cron/time formatters. */
  scheduleSummaryLabels?: ScheduleSummaryLabels
  nextFireLabels?: NextFireLabels
  /** BCP-47 locale for day names + time formatting. */
  locale?: string
}

const STATUS_DOT: Record<string, string> = {
  silent: "bg-gray-400",
  surfaced: "bg-foreground",
  running: "bg-blue-500",
  error: "bg-red-500",
  cancelled: "bg-gray-400",
}

function lastRunLabel(
  lastRun: RoutineRun | undefined,
  now: Date,
  labels: RoutineRowLabels,
): string | null {
  if (!lastRun) return null
  const date = new Date(lastRun.started_at)
  const diff = now.getTime() - date.getTime()
  const mins = Math.floor(diff / 60_000)
  if (mins < 1) return labels.justRan
  if (mins < 60) return interp(labels.ranMinutes, { n: mins })
  const hours = Math.floor(mins / 60)
  if (hours < 24) return interp(labels.ranHours, { n: hours })
  const days = Math.floor(hours / 24)
  return interp(labels.ranDays, { n: days })
}

export function RoutineRow({
  routine,
  lastRun,
  accountTimezone,
  onClick,
  onToggle,
  labels = DEFAULT_ROW_LABELS,
  scheduleSummaryLabels = DEFAULT_SCHEDULE_SUMMARY_LABELS,
  nextFireLabels = DEFAULT_NEXT_FIRE_LABELS,
  locale = "en-US",
}: RoutineRowProps) {
  const now = useNow(60_000)
  const next = routine.enabled
    ? nextFire(routine.schedule, accountTimezone, now)
    : null
  const nextDescr = next
    ? describeNextFire(next, accountTimezone, now, nextFireLabels, locale)
    : null
  const lastLabel = lastRunLabel(lastRun, now, labels)
  const isPaused = lastRun?.status === "running" && !!lastRun.paused_until

  return (
    <div
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault()
          onClick?.()
        }
      }}
      className={cn(
        "group relative flex items-center gap-4 px-5 py-4 cursor-pointer",
        "transition-colors duration-150",
        "hover:bg-black/[0.03]",
        "focus-visible:outline-none focus-visible:bg-black/[0.03]",
        !routine.enabled && "opacity-55",
      )}
    >
      {/* Status dot — small but always present. Amber when the in-flight run
          is sleeping on a usage-limit window so the row reads as "waiting"
          rather than "thrashing". */}
      <div
        className={cn(
          "size-2 rounded-full shrink-0",
          !routine.enabled
            ? "bg-gray-300"
            : isPaused
              ? "bg-amber-500"
              : STATUS_DOT[lastRun?.status ?? "silent"] ?? "bg-gray-300",
          lastRun?.status === "running" && !isPaused && "animate-pulse",
        )}
        aria-hidden
      />

      {/* Title + meta column */}
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-foreground truncate leading-tight">
          {routine.name || labels.untitled}
        </p>
        <p className="text-xs text-muted-foreground truncate mt-0.5">
          {cronSummary(routine.schedule, scheduleSummaryLabels, locale)}
        </p>
      </div>

      {/* Right meta column: next run + last run */}
      <div className="hidden sm:flex flex-col items-end shrink-0 min-w-[140px]">
        {nextDescr ? (
          <>
            <p className="text-xs text-foreground tabular-nums">
              {interp(labels.next, { relative: nextDescr.relative })}
            </p>
            <p className="text-[11px] text-muted-foreground tabular-nums mt-0.5">
              {nextDescr.absolute}
            </p>
          </>
        ) : routine.enabled ? (
          <p className="text-xs text-muted-foreground">{labels.noNextRun}</p>
        ) : (
          <p className="text-xs text-muted-foreground">{labels.paused}</p>
        )}
        {isPaused ? (
          <p className="text-[11px] text-amber-700 mt-0.5 tabular-nums">
            {interp(labels.waiting, { time: lastRun?.paused_until ?? "" })}
          </p>
        ) : (
          lastLabel && (
            <p className="text-[11px] text-muted-foreground/70 mt-0.5 tabular-nums">
              {lastLabel}
            </p>
          )
        )}
      </div>

      {/* Switch */}
      {onToggle && (
        <div onClick={(e) => e.stopPropagation()} className="shrink-0">
          <Switch
            checked={routine.enabled}
            onCheckedChange={(checked) => onToggle(checked)}
            aria-label={routine.enabled ? labels.pauseRoutine : labels.resumeRoutine}
          />
        </div>
      )}
    </div>
  )
}
