/**
 * RoutineRowStatus — the row's leading state icon. Replaces the old 8px status
 * dot with a glyph that says WHAT the routine is doing, not just that it has a
 * color: a clock while it waits for its schedule, a pulsing bolt while a run is
 * in flight, a pause badge while a run sleeps on a usage-limit window, an alert
 * when the last run errored. Color still reinforces state, but never alone.
 *
 * Decorative (aria-hidden): the row's text meta ("Next in…", "ran 2h ago",
 * "Waiting · resumes at…") carries the same information for screen readers,
 * exactly as it did with the dot.
 */
import { cn } from "@houston-ai/core";
import { CircleAlert, Clock, PauseCircle, Zap } from "lucide-react";
import type { Routine, RoutineRun } from "./types";

export interface RoutineRowStatusProps {
  routine: Routine;
  lastRun?: RoutineRun;
  /** True while the in-flight run sleeps on a usage-limit window. */
  isPaused: boolean;
}

export function RoutineRowStatus({
  routine,
  lastRun,
  isPaused,
}: RoutineRowStatusProps) {
  const cls = "size-4 shrink-0";
  if (routine.enabled && lastRun?.status === "running") {
    if (isPaused) {
      return <PauseCircle className={cn(cls, "text-amber-500")} aria-hidden />;
    }
    return (
      <Zap
        className={cn(cls, "text-blue-500 fill-current animate-pulse")}
        aria-hidden
      />
    );
  }
  if (routine.enabled && lastRun?.status === "error") {
    return <CircleAlert className={cn(cls, "text-red-500")} aria-hidden />;
  }
  // Idle (scheduled, waiting for the next fire) and disabled both read as a
  // clock; the row already dims to 55% opacity when disabled.
  return <Clock className={cn(cls, "text-ink-muted")} aria-hidden />;
}
