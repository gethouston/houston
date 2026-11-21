import { prefilledAgentName } from "../../../lib/agent-name-prefill.ts";
import {
  type EmployeeNameIssue,
  employeeNameIssue,
} from "../../employee-card/employee-name-validation.ts";
import type { BasicTeamDraft } from "./basic-team-model.ts";

export function basicTeamNames(
  drafts: readonly BasicTeamDraft[],
  takenNames: readonly string[],
): string[] {
  const typed = drafts.flatMap((draft) =>
    draft.rosterKey === null && draft.name !== null && draft.name.trim() !== ""
      ? [draft.name.trim()]
      : [],
  );
  const dealt: string[] = [];
  return drafts.map((draft) => {
    if (draft.name !== null) return draft.name;
    const name = prefilledAgentName(draft.roleLabel, [
      ...takenNames,
      ...typed,
      ...dealt,
    ]);
    dealt.push(name);
    return name;
  });
}

export function basicTeamNameIssues(
  drafts: readonly BasicTeamDraft[],
  takenNames: readonly string[],
): (EmployeeNameIssue | null)[] {
  const names = basicTeamNames(drafts, takenNames);
  return drafts.map((draft, index) => {
    if (draft.rosterKey !== null) return null;
    const siblings = names.filter(
      (name, other) =>
        other !== index &&
        drafts[other].rosterKey === null &&
        name.trim() !== "",
    );
    return employeeNameIssue(names[index], [
      ...takenNames,
      ...siblings.map((name) => name.trim()),
    ]);
  });
}
