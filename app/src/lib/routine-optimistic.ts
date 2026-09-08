/**
 * The optimistic shape of a routine edit (PRODUCT-1706): what the routines
 * list shows the instant a save is sent, before the host answers.
 *
 * A routine write on the hosted profile can take seconds (the agent's pod may
 * have to wake first), and the list used to keep painting the OLD schedule
 * for that whole window — a saved 7:00 still read 11:30, so the save looked
 * ignored. This mirrors the host's own `applyRoutineUpdate` closely enough
 * for the interim paint: defined keys replace, `null` clears a pin or the
 * trigger, and setting one wake mechanism drops the other. The host's applied
 * routine replaces the guess as soon as it lands.
 *
 * Pure + dependency-free so it is unit-tested without a query client
 * (`app/tests/routine-optimistic.test.ts`).
 */

import type { Routine, RoutineUpdate } from "@houston-ai/engine-client";

export function applyOptimisticRoutineUpdate(
  current: Routine,
  updates: RoutineUpdate,
  nowIso: string,
): Routine {
  const next: Record<string, unknown> = { ...current, updated_at: nowIso };
  for (const [key, value] of Object.entries(updates)) {
    if (value === undefined) continue;
    if (value === null) {
      delete next[key];
      continue;
    }
    next[key] = value;
  }
  // Exactly one wake mechanism: a real schedule clears the trigger and a real
  // trigger clears the schedule, exactly as the host applies it.
  if (updates.schedule) delete next.trigger;
  if (updates.trigger) delete next.schedule;
  return next as unknown as Routine;
}

/** The cached list with one routine's edit applied; untouched rows are the
 *  same objects, so unaffected rows do not re-render. */
export function patchRoutineList(
  list: Routine[] | undefined,
  routineId: string,
  updates: RoutineUpdate,
  nowIso: string,
): Routine[] | undefined {
  if (!list) return undefined;
  return list.map((routine) =>
    routine.id === routineId
      ? applyOptimisticRoutineUpdate(routine, updates, nowIso)
      : routine,
  );
}

/** The cached list with the host's applied routine in place of the guess. */
export function replaceRoutineInList(
  list: Routine[] | undefined,
  routine: Routine,
): Routine[] | undefined {
  if (!list || !routine?.id) return list;
  return list.map((entry) => (entry.id === routine.id ? routine : entry));
}
