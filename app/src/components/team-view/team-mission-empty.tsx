import {
  Button,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@houston-ai/core";
import { Plus } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useCanCreateAgents } from "../../hooks/use-can-create-agents";
import type { TeamView } from "../../lib/teams-model.ts";
import { useUIStore } from "../../stores/ui";

/**
 * What a team with no agents shows instead of a board. Two honest states, never
 * a "New mission" button with nobody to run it:
 *
 * - the DEFAULT team (the workspace itself) has no agents because the workspace
 *   has none yet, so it offers the same "create your first agent" door the
 *   dashboard does;
 * - a NAMED team is empty because nothing has been moved into it, and a new
 *   agent would land in the default team, so it says how to fill this one
 *   instead of offering a button that would not.
 */
export function TeamMissionEmpty({ team }: { team: TeamView }) {
  const { t } = useTranslation("teams");
  const { canCreate } = useCanCreateAgents();
  const setCreateAgentDialogOpen = useUIStore(
    (s) => s.setCreateAgentDialogOpen,
  );

  return (
    <div className="flex h-full items-center justify-center">
      <Empty className="border-0">
        <EmptyHeader>
          <EmptyTitle>
            {team.isDefault
              ? t("teamView.missionControl.empty.workspaceTitle")
              : t("teamView.missionControl.empty.teamTitle")}
          </EmptyTitle>
          <EmptyDescription>
            {team.isDefault
              ? t("teamView.missionControl.empty.workspaceBody")
              : t("teamView.missionControl.empty.teamBody", {
                  name: team.name,
                })}
          </EmptyDescription>
        </EmptyHeader>
        {team.isDefault && canCreate && (
          <Button
            className="mt-4 rounded-full"
            onClick={() => setCreateAgentDialogOpen(true)}
          >
            <Plus className="h-4 w-4" />
            {t("teamView.missionControl.empty.createAgent")}
          </Button>
        )}
      </Empty>
    </div>
  );
}
