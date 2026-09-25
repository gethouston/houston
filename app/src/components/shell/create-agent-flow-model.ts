import type { EmployeeNameIssue } from "../employee-card/employee-name-validation.ts";

/** Why a submitted hire did not land. */
export type CreateFailureKind = "nameConflict" | "failed";

/** The identity a hire is checked against: names it cannot take, and the
 *  color it is born with. */
export interface CreateFlowIdentity {
  takenNames: readonly string[];
  color: string;
}

/**
 * The identity the card shows. While a hire is creating, the one it was
 * submitted with: the agent store adopts the new employee before the create
 * settles, and the live identity would then call its own name taken and
 * cross-fade the card to the next free color.
 */
export function createFlowIdentity(args: {
  live: CreateFlowIdentity;
  submitted: CreateFlowIdentity | null;
  creating: boolean;
}): CreateFlowIdentity {
  return args.creating && args.submitted ? args.submitted : args.live;
}

/** Whether the name field is marked invalid: only when the NAME is what holds
 *  the hire back, never for a create that failed for another reason. */
export function createNameInvalid(
  shown: EmployeeNameIssue | null,
  failure: CreateFailureKind | null,
): boolean {
  return shown !== null || failure === "nameConflict";
}
