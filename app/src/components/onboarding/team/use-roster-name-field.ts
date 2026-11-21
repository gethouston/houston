import { type KeyboardEvent, useState } from "react";
import type { EmployeeNameIssue } from "../../employee-card/employee-name-validation";
import { useEmployeeNameIssueCopy } from "../../employee-card/use-employee-name";
import { rosterNameCommit } from "./team-roster-edit";
import type { RosterMember } from "./team-roster-model";

export interface RosterNameField {
  value: string;
  error: string | null;
  onChange: (value: string) => void;
  onBlur: () => void;
  onKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void;
}

export function useRosterNameField(
  member: RosterMember,
  takenNames: readonly string[],
  onRename: (name: string) => void,
): RosterNameField {
  const issueCopy = useEmployeeNameIssueCopy();
  const [draft, setDraft] = useState<string | null>(null);
  const [issue, setIssue] = useState<EmployeeNameIssue | null>(null);

  const settle = (name: string) => {
    setDraft(null);
    setIssue(null);
    if (name !== member.name) onRename(name);
  };

  const commit = () => {
    if (draft === null) return;
    const result = rosterNameCommit(draft, member, takenNames);
    if (result.kind === "issue") setIssue(result.issue);
    else settle(result.name);
  };

  return {
    value: draft ?? member.name,
    error: draft === null ? null : issueCopy(issue, draft),
    onChange: (value) => {
      setDraft(value);
      setIssue(null);
    },
    onBlur: commit,
    onKeyDown: (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        commit();
      } else if (event.key === "Escape" && draft !== null) {
        setDraft(null);
        setIssue(null);
      }
    },
  };
}
