import { type KeyboardEvent, useState } from "react";
import { sameAgentName } from "../../../lib/agent-name";
import type { EmployeeNameIssue } from "../../employee-card/employee-name-validation";
import {
  useEmployeeNameIssueCopy,
  useEmployeeNameSuggester,
} from "../../employee-card/use-employee-name";
import { rosterNameCommit } from "./team-roster-edit";
import type { RosterMember } from "./team-roster-model";

export interface RosterNameField {
  value: string;
  /** The card's copy for a name that cannot be taken, or null. */
  error: string | null;
  onChange: (value: string) => void;
  onBlur: () => void;
  onKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void;
  onSuggest: () => void;
}

/**
 * A roster member's name field. Typing stays on the card until the person
 * leaves the field or presses Enter; only then is it a rename, since each one
 * is a round trip to the host. A blank name, or one another AI Employee holds,
 * stays in the field with why, and Escape puts the current name back. A
 * suggested name is free by construction, so it is a rename at once.
 */
export function useRosterNameField(
  member: RosterMember,
  takenNames: readonly string[],
  onRename: (name: string) => void,
): RosterNameField {
  const issueCopy = useEmployeeNameIssueCopy();
  const suggestName = useEmployeeNameSuggester();
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
    // While not typing, the field follows the member (a name the host tidied,
    // a rename it refused).
    value: draft ?? member.name,
    error: draft === null ? null : issueCopy(issue, draft),
    onChange: (value) => {
      setDraft(value);
      setIssue(null);
    },
    onBlur: commit,
    onKeyDown: (event) => {
      if (event.key === "Enter") {
        // Never the surrounding form's submit: Enter here is this rename.
        event.preventDefault();
        commit();
      } else if (event.key === "Escape" && draft !== null) {
        setDraft(null);
        setIssue(null);
      }
    },
    onSuggest: () =>
      settle(
        suggestName({
          role: member.brief.role,
          current: draft ?? member.name,
          taken: takenNames.filter((name) => !sameAgentName(name, member.name)),
        }),
      ),
  };
}
