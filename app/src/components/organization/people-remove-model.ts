import type { MemberRoutine, MemberRoutines } from "@houston/engine-adapter";

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

export function memberRoutineKey(routine: MemberRoutine): string {
  return `${routine.agentSlug}/${routine.routineId}`;
}
