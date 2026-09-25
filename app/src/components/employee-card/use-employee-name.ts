import { useTranslation } from "react-i18next";
import { AGENT_NAME_MAX_LENGTH } from "../../lib/agent-name";
import {
  nameSuggestionLocale,
  suggestEmployeeName,
} from "./employee-name-suggestions";
import type { EmployeeNameIssue } from "./employee-name-validation";

/** The copy a card's message slot shows for a name issue, or null. */
export function useEmployeeNameIssueCopy(): (
  issue: EmployeeNameIssue | null,
  name: string,
) => string | null {
  const { t } = useTranslation(["agents", "shell"]);
  return (issue, name) => {
    switch (issue) {
      case null:
        return null;
      case "required":
        return t("shell:employeeCard.nameRequired");
      case "invalidChars":
        return t("agents:nameErrors.invalidChars");
      case "tooLong":
        return t("agents:nameErrors.tooLong", { max: AGENT_NAME_MAX_LENGTH });
      case "taken":
        return t("agents:toasts.nameConflict", { name: name.trim() });
    }
  };
}

/**
 * The next name Suggest offers for `role`, in the app's language, stepping
 * over the names in `taken` (`suggestEmployeeName`).
 */
export function useEmployeeNameSuggester(): (input: {
  role: string;
  current: string;
  taken: readonly string[];
}) => string {
  const { i18n } = useTranslation();
  const locale = nameSuggestionLocale(i18n.language);
  return (input) => suggestEmployeeName({ locale, ...input });
}
