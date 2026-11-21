import { type AgentNameIssue, agentNameIssue } from "../../lib/agent-name.ts";

export type EmployeeNameIssue = AgentNameIssue | "required";

export function employeeNameIssue(
  name: string,
  takenNames: readonly string[],
  currentName?: string,
): EmployeeNameIssue | null {
  if (name.trim() === "") return "required";
  return agentNameIssue(name, [...takenNames], currentName);
}

export function visibleNameIssue(
  issue: EmployeeNameIssue | null,
  attempted: boolean,
): EmployeeNameIssue | null {
  return issue === "required" && !attempted ? null : issue;
}

export function firstNameIssueIndex(
  issues: readonly (EmployeeNameIssue | null)[],
): number | null {
  const index = issues.findIndex((issue) => issue !== null);
  return index === -1 ? null : index;
}
