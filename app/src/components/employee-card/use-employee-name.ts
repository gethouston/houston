import { useTranslation } from "react-i18next";
import { AGENT_NAME_MAX_LENGTH } from "../../lib/agent-name";
import type { EmployeeNameIssue } from "./employee-name-validation";

export interface EmployeeNameIssueCopy {
  (issue: EmployeeNameIssue, name: string): string;
  (issue: EmployeeNameIssue | null, name: string): string | null;
}

export interface EmployeeNameIssueCopyOptions {
  taken?: (name: string) => string;
}

export function useEmployeeNameIssueCopy(
  options: EmployeeNameIssueCopyOptions = {},
): EmployeeNameIssueCopy {
  const { t } = useTranslation(["agents", "shell"]);
  function copy(issue: EmployeeNameIssue, name: string): string;
  function copy(issue: EmployeeNameIssue | null, name: string): string | null;
  function copy(issue: EmployeeNameIssue | null, name: string): string | null {
    switch (issue) {
      case null:
        return null;
      case "required":
        return t("shell:employeeCard.nameRequired");
      case "invalidChars":
        return t("agents:nameErrors.invalidChars");
      case "tooLong":
        return t("agents:nameErrors.tooLong", { max: AGENT_NAME_MAX_LENGTH });
      case "reserved":
        return t("agents:nameErrors.reserved");
      case "taken":
        return options.taken
          ? options.taken(name.trim())
          : t("agents:toasts.nameConflict", { name: name.trim() });
    }
  }
  return copy;
}
