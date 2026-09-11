import type { Routine } from "@houston/protocol";
import { actingSubFromHeader } from "../auth/acting";

/**
 * A trigger delivery carried a minted acting-as token whose subject is not the
 * routine's creator. Permanent for THIS delivery: the control plane minted the
 * token from its projected `created_by`, so a mismatch means the projection and
 * the pod's routines file disagree, and re-posting the same token cannot fix
 * that. The route answers 400 with this code (parity with `routine-fires.ts`).
 */
export class TriggerCreatorMismatchError extends Error {
  readonly code = "routine_creator_mismatch" as const;

  constructor(routineId: string) {
    super(
      `acting-as subject does not match the creator of routine ${routineId}`,
    );
    this.name = "TriggerCreatorMismatchError";
  }
}

/**
 * Require the delivery's acting-as token to name the routine's creator.
 *
 * Pods hold no gateway HMAC key, so this is the strongest check available on a
 * pod-token-authenticated internal route: decode the minted payload and demand
 * its subject equal `created_by`. A token that fires the routine as anyone else
 * would resolve THAT person's credential scope for a run they never authored.
 */
export function assertActingIsCreator(
  actingAs: string,
  routine: Routine,
): void {
  const sub = actingSubFromHeader(actingAs);
  if (!sub || !routine.created_by || sub !== routine.created_by)
    throw new TriggerCreatorMismatchError(routine.id);
}
