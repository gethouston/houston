import type { Routine, RoutineUpdate } from "@houston/engine-adapter";

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
  if (updates.schedule) delete next.trigger;
  if (updates.trigger) delete next.schedule;
  return next as unknown as Routine;
}

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

export function replaceRoutineInList(
  list: Routine[] | undefined,
  routine: Routine,
): Routine[] | undefined {
  if (!list || !routine?.id) return list;
  return list.map((entry) => (entry.id === routine.id ? routine : entry));
}

export function removeRoutineFromList(
  list: Routine[] | undefined,
  routineId: string,
): Routine[] | undefined {
  if (!list?.some((entry) => entry.id === routineId)) return list;
  return list.filter((entry) => entry.id !== routineId);
}
