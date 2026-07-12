/**
 * RoutineRowMeta — the row's right-hand meta column: the next fire time
 * (relative + absolute, in the account zone) over the last-run recency, with
 * the amber "waiting" note while an in-flight run sleeps on a usage-limit
 * window. Hidden below the sm breakpoint, exactly as before the extraction.
 */
import {
  DEFAULT_NEXT_FIRE_LABELS,
  DEFAULT_ROW_LABELS,
  interp,
  type NextFireLabels,
  type RoutineRowLabels,
} from "./labels";
import { describeNextFire, nextFire } from "./next-fire";
import type { Routine, RoutineRun } from "./types";

export interface RoutineRowMetaProps {
  routine: Routine;
  lastRun?: RoutineRun;
  accountTimezone: string;
  now: Date;
  /** True while the in-flight run sleeps on a usage-limit window. */
  isPaused: boolean;
  labels?: RoutineRowLabels;
  nextFireLabels?: NextFireLabels;
  locale?: string;
}

function lastRunLabel(
  lastRun: RoutineRun | undefined,
  now: Date,
  labels: RoutineRowLabels,
): string | null {
  if (!lastRun) return null;
  const date = new Date(lastRun.started_at);
  const diff = now.getTime() - date.getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return labels.justRan;
  if (mins < 60) return interp(labels.ranMinutes, { n: mins });
  const hours = Math.floor(mins / 60);
  if (hours < 24) return interp(labels.ranHours, { n: hours });
  const days = Math.floor(hours / 24);
  return interp(labels.ranDays, { n: days });
}

export function RoutineRowMeta({
  routine,
  lastRun,
  accountTimezone,
  now,
  isPaused,
  labels = DEFAULT_ROW_LABELS,
  nextFireLabels = DEFAULT_NEXT_FIRE_LABELS,
  locale = "en-US",
}: RoutineRowMetaProps) {
  // Event-driven routines have no cron "next fire" — the meta column shows only
  // the last-run recency (and the waiting note) for them.
  const isTrigger = !!routine.trigger;
  const next =
    routine.enabled && routine.schedule
      ? nextFire(routine.schedule, accountTimezone, now)
      : null;
  const nextDescr = next
    ? describeNextFire(next, accountTimezone, now, nextFireLabels, locale)
    : null;
  const lastLabel = lastRunLabel(lastRun, now, labels);

  return (
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
      ) : isTrigger ? null : routine.enabled ? (
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
  );
}
