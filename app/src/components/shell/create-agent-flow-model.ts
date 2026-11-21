import type { EmployeeNameIssue } from "../employee-card/employee-name-validation.ts";

export type CreateFailureKind = "nameConflict" | "failed";

export interface CreateFlowIdentity {
  takenNames: readonly string[];
  color: string;
}

export function createFlowIdentity(args: {
  live: CreateFlowIdentity;
  submitted: CreateFlowIdentity | null;
  creating: boolean;
}): CreateFlowIdentity {
  return args.creating && args.submitted ? args.submitted : args.live;
}

export function createNameInvalid(
  shown: EmployeeNameIssue | null,
  failure: CreateFailureKind | null,
): boolean {
  return shown !== null || failure === "nameConflict";
}
