// `.ts` extensions so the node test runner can load this module on its own.
import { type AgentNameIssue, agentNameIssue } from "../../lib/agent-name.ts";

/**
 * What stops an employee card's name from being hired under: blank (every AI
 * Employee needs a name), or anything the host would refuse.
 */
export type EmployeeNameIssue = AgentNameIssue | "required";

export function employeeNameIssue(
  name: string,
  takenNames: readonly string[],
): EmployeeNameIssue | null {
  if (name.trim() === "") return "required";
  return agentNameIssue(name, [...takenNames]);
}

/**
 * The issue a card shows. A blank name is only a problem once the person
 * tried to go on: an empty field on arrival is an invitation, not an error.
 * Every other issue shows as it is typed.
 */
export function visibleNameIssue(
  issue: EmployeeNameIssue | null,
  attempted: boolean,
): EmployeeNameIssue | null {
  return issue === "required" && !attempted ? null : issue;
}

/** The first card whose name holds the submit back, or null when none does. */
export function firstNameIssueIndex(
  issues: readonly (EmployeeNameIssue | null)[],
): number | null {
  const index = issues.findIndex((issue) => issue !== null);
  return index === -1 ? null : index;
}
