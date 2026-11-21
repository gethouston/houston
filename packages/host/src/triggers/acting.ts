import type { Routine } from "@houston/protocol";
import { actingMayRunRoutine } from "../assistant/manager-owner";
import { actingSubFromHeader } from "../auth/acting";

export class TriggerCreatorMismatchError extends Error {
  readonly code = "routine_creator_mismatch" as const;

  constructor(routineId: string) {
    super(
      `acting-as subject does not match the creator of routine ${routineId}`,
    );
    this.name = "TriggerCreatorMismatchError";
  }
}

export function assertActingIsCreator(
  actingAs: string,
  routine: Routine,
): void {
  if (!actingMayRunRoutine(actingSubFromHeader(actingAs), routine))
    throw new TriggerCreatorMismatchError(routine.id);
}
