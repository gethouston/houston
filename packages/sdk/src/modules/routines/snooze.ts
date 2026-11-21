import type { RoutineSnooze } from "@houston/protocol";
import type { Routine } from "./types";

export interface RoutineSnoozeNotice {
  provider: string;
  model: string | null;
  until: string;
  snoozedAt: string;
}

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
