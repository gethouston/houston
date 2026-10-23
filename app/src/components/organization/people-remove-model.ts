import type { MemberRoutine, MemberRoutines } from "@houston/engine-adapter";

/**
 * What the remove confirmation says about the member's routines, derived from
 * the read's state. A failed read never blocks the removal: it says, neutrally,
 * that the check did not happen.
 */
export type RemoveRoutinesNote =
  | { kind: "loading" }
  | { kind: "failed" }
  | { kind: "none" }
  | { kind: "some"; routines: MemberRoutine[] };

export function removeRoutinesNote(read: {
  data?: MemberRoutines;
  isError: boolean;
}): RemoveRoutinesNote {
  if (read.data) {
    return read.data.routines.length === 0
      ? { kind: "none" }
      : { kind: "some", routines: read.data.routines };
  }
  return read.isError ? { kind: "failed" } : { kind: "loading" };
}

/** A stable React key: a routine id is unique per employee, not per space. */
export function memberRoutineKey(routine: MemberRoutine): string {
  return `${routine.agentSlug}/${routine.routineId}`;
}
