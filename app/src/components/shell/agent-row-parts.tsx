import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { AgentRowLine } from "./agent-row-line";

export function AgentRowLineText({ line }: { line: AgentRowLine }): ReactNode {
  const { t } = useTranslation("shell");
  switch (line.kind) {
    case "empty":
      return null;
    case "role":
      return line.role;
    case "firstDay":
      return t("sidebar.firstDay");
    case "mission":
      return line.title || t("sidebar.working");
  }
}
