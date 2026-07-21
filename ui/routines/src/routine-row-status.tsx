/**
 * RoutineRowStatus — the row's leading IDENTITY icon, with run state layered
 * around it (not replacing it). The identity slot says WHAT a routine is: a
 * clock for a schedule, the triggering app's logo for an event trigger (the app
 * supplies that through `identityIcon` — `ui/` cannot resolve logos), or a bell
 * fallback for a trigger with no logo yet.
 *
 * Run state rides on top of that identity, kept minimal: a soft pulsing ring
 * AROUND the icon while a run is in flight, and a static danger ring when a
 * schedule routine's last run errored. A run sleeping on a usage-limit window
 * shows no ring here — the row's amber "Waiting · resumes at…" meta carries it.
 * Trigger routines carry their error in the status badge below, so they skip the
 * danger ring here.
 *
 * Decorative (aria-hidden): the row's title + summary + meta text carry the same
 * information for screen readers.
 */
import { cn } from "@houston-ai/core";
import { Bell, Clock } from "lucide-react";
import type { ReactNode } from "react";
import type { Routine, RoutineRun } from "./types";

export interface RoutineRowStatusProps {
  routine: Routine;
  lastRun?: RoutineRun;
  /** True while the in-flight run sleeps on a usage-limit window. */
  isPaused: boolean;
  /** App-supplied identity icon (e.g. a trigger app's logo). Null/undefined
   *  falls back to a default glyph: a clock for schedules, a bell for triggers. */
  identityIcon?: ReactNode;
}

export function RoutineRowStatus({
  routine,
  lastRun,
  isPaused,
  identityIcon,
}: RoutineRowStatusProps) {
  const identity =
    identityIcon ??
    (routine.trigger ? (
      <Bell className="size-4 text-ink-muted" aria-hidden />
    ) : (
      <Clock className="size-4 text-ink-muted" aria-hidden />
    ));

  // Running (and not sleeping on a usage-limit window) draws a soft pulsing
  // ring; a schedule run that errored draws a static danger ring. Trigger
  // routines surface errors in the status badge below, so they skip it.
  const running = routine.enabled && lastRun?.status === "running" && !isPaused;
  const errored =
    routine.enabled && lastRun?.status === "error" && !routine.trigger;

  return (
    <span className="relative inline-grid size-6 shrink-0 place-items-center">
      {running && (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-full ring-2 ring-focus/40 animate-pulse"
        />
      )}
      {!running && errored && (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-full ring-2 ring-danger/40"
        />
      )}
      <span
        className={cn(
          "inline-grid size-4 place-items-center",
          "[&_img]:size-4 [&_svg]:size-4 [&_svg]:shrink-0",
        )}
      >
        {identity}
      </span>
    </span>
  );
}
