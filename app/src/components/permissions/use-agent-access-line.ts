import type { OrgMember } from "@houston-ai/engine-client";
import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import type { Agent } from "../../lib/types";
import { memberLabel } from "../organization/org-roster";
import { summarizeAgentAccess } from "./org-agents-model";

/**
 * The ONE plain-language access line an agent row wears ("Everyone on your
 * team", "3 people · Managed by Ana"). Shared by every agent list that drills
 * into the canonical agent settings page — Settings > Permissions and a team's
 * settings — so the same agent can never describe itself two different ways.
 *
 * `members` is the org roster used to name managers; single-player hosts pass
 * an empty list and simply get the access half of the line.
 */
export function useAgentAccessLine(
  members: OrgMember[],
): (agent: Agent) => string {
  const { t } = useTranslation("teams");
  return useCallback(
    (agent: Agent) => {
      const summary = summarizeAgentAccess(agent);
      const access = summary.everyone
        ? t("agentsTab.access.everyone")
        : summary.peopleCount !== null
          ? t("agentsTab.access.people", { count: summary.peopleCount })
          : t("agentsTab.access.you");
      if (summary.managerIds.length === 0) return access;
      const managedBy = t("agentsTab.managedBy", {
        names: summary.managerIds
          .map((id) => memberLabel(id, members))
          .join(", "),
      });
      return `${access} · ${managedBy}`;
    },
    [t, members],
  );
}
