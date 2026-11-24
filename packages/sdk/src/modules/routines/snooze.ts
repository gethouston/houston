import type { RoutineSnooze } from "@houston/protocol";
import type { Routine } from "./types";

export interface RoutineSnoozeNotice {
  /** The provider id whose plan limit holds the routine (e.g. "anthropic"). */
  provider: string;
  /** The model the limit applies to, when known: the one to move away from. */
  model: string | null;
  /** ISO time fires resume by themselves. */
  until: string;
  /** ISO time the engine recorded the hold. */
  snoozedAt: string;
}

/**
 * The notice for a snoozed routine at `now`, or null when it is not held: a
 * disabled routine, a trigger routine, no snooze, or one whose instant has passed (a stale
 * `snoozed` is inert, never a notice). `now` defaults to the clock.
 */
export function routineSnoozeNotice(
  routine: Pick<Routine, "enabled" | "schedule"> & { snoozed?: RoutineSnooze },
  now: Date = new Date(),
): RoutineSnoozeNotice | null {
  const snooze = routine.snoozed;
  if (!routine.enabled || !routine.schedule || !snooze) return null;
  const untilMs = Date.parse(snooze.until);
  if (!Number.isFinite(untilMs) || untilMs <= now.getTime()) return null;
  return {
    provider: snooze.provider,
    model: snooze.model,
    until: snooze.until,
    snoozedAt: snooze.at,
  };
}
