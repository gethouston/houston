/**
 * RoutineRowNextFire — the row's compact trailing "in 2h 10m" stamp.
 *
 * Its own component because it owns the minute ticker: keeping `useNow` here
 * means only this span re-renders each minute, not the whole row (and every
 * chip and menu inside it). It renders nothing for a paused routine or an
 * event-driven one, which have no next fire to name — the chat header carries
 * the absolute time and the last-run detail.
 */

import { DEFAULT_NEXT_FIRE_LABELS, type NextFireLabels } from "./labels";
import { describeNextFire, nextFire } from "./next-fire";
import type { Routine } from "./types";
import { useNow } from "./use-now";

export function RoutineRowNextFire({
  routine,
  accountTimezone,
  labels = DEFAULT_NEXT_FIRE_LABELS,
  locale = "en-US",
}: {
  routine: Routine;
  /** The account-wide IANA timezone every routine fires in. */
  accountTimezone: string;
  labels?: NextFireLabels;
  /** BCP-47 locale for day names + time formatting. */
  locale?: string;
}) {
  const now = useNow(60_000);
  const next =
    routine.enabled && routine.schedule
      ? nextFire(routine.schedule, accountTimezone, now)
      : null;
  if (!next) return null;
  return (
    <span className="hidden whitespace-nowrap text-xs tabular-nums text-ink-muted sm:inline">
      {describeNextFire(next, accountTimezone, now, labels, locale).relative}
    </span>
  );
}
