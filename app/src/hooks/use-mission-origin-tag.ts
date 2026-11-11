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

/**
 * The origin tag of a mission row, in the user's language: "Routine", "Set
 * up", "Started by Houston", "Started through the API", "Started by {{name}}"
 * or none. The ONE reading the active board, the archive and the phone's task
 * rows share, so a mission
 * never reads one way in one place and another way in the next. `agents` is
 * the roster that names the employee who started it.
 */
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
