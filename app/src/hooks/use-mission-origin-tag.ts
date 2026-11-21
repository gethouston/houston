import {
  type MissionStartFacts,
  missionStartedBy,
} from "@houston/sdk/mission-started-by";
import { useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  type MissionOriginLabels,
  missionOriginLabel,
} from "../lib/mission-card";
import { missionOriginAgentName } from "../lib/mission-card-agent";
import type { Agent } from "../lib/types";

export function useMissionOriginTag(
  agents: readonly Agent[],
): (row: MissionStartFacts) => string | undefined {
  const { t } = useTranslation("board");
  const labels = useMemo<MissionOriginLabels>(
    () => ({
      routine: t("tags.routine"),
      setup: t("tags.setup"),
      houston: t("tags.houstonStarted"),
      api: t("tags.apiStarted"),
      employee: t("tags.agentStarted"),
      employeeNamed: (name) => t("tags.startedByAgent", { name }),
    }),
    [t],
  );
  return useCallback(
    (row) => {
      const startedBy = missionStartedBy(row);
      const name =
        startedBy.kind === "employee"
          ? missionOriginAgentName(agents, startedBy.agentId)
          : undefined;
      return missionOriginLabel(startedBy, labels, name);
    },
    [agents, labels],
  );
}
