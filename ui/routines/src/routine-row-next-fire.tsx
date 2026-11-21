import { DEFAULT_NEXT_FIRE_LABELS, type NextFireLabels } from "./labels";
import { nextFire } from "./next-fire";
import { describeNextFire } from "./next-fire-describe";
import type { Routine } from "./types";
import { useNow } from "./use-now";

export function RoutineRowNextFire({
  routine,
  accountTimezone,
  labels = DEFAULT_NEXT_FIRE_LABELS,
  locale = "en-US",
}: {
  routine: Routine;
  accountTimezone: string;
  labels?: NextFireLabels;
  locale?: string;
}) {
  const now = useNow(60_000);
  const next =
    routine.enabled && routine.schedule
      ? nextFire(routine.schedule, accountTimezone, now)
      : null;
  if (!next) return null;
  return (
    <span className="hidden whitespace-nowrap text-xs tabular-nums text-ink-muted md:inline">
      {describeNextFire(next, accountTimezone, now, labels, locale).relative}
    </span>
  );
}
