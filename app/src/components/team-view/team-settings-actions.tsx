import { Building2, LogOut, Palette, Trash2 } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useCanCreateAgents } from "../../hooks/use-can-create-agents";
import { useCapabilities } from "../../hooks/use-capabilities";
import { usePersonalSpace } from "../../hooks/use-personal-space";
import { useTeams } from "../../hooks/use-teams";
import { hasAgentTeams, hasSpaces } from "../../lib/org-roles";
import {
  canDeleteTeam,
  canLeaveTeam,
  type TeamView,
} from "../../lib/teams-model";
import { useUIStore } from "../../stores/ui";
import { useWorkspaceStore } from "../../stores/workspaces";
import { SettingsCard, SettingsRow } from "../settings/settings-row";
import { useServerTeamActions } from "../shell/use-server-team-actions";
import { useSidebarOverlayLayout } from "../shell/use-sidebar-overlay-layout";
import { TeamMoveFlow } from "./team-move-flow";

export function TeamSettingsActions({ team }: { team: TeamView }) {
  const { t } = useTranslation("teams");
  const { capabilities } = useCapabilities();
  const personalSpace = usePersonalSpace();
  const teams = useTeams();
  const workspaceId = useWorkspaceStore((s) => s.current?.id);
  const serverBacked = hasAgentTeams(capabilities);
  const sidebar = useSidebarOverlayLayout(workspaceId, serverBacked);
  const { canCreate } = useCanCreateAgents();
  const actions = useServerTeamActions({
    serverBacked,
    teams,
    sidebar,
    canCreateAgents: canCreate,
    personalSpace,
  });
  const setEditTeamIdentityId = useUIStore((s) => s.setEditTeamIdentityId);
  const mayLeave = canLeaveTeam(team, personalSpace) && actions.leaveGroup;
  const [moveOpen, setMoveOpen] = useState(false);
  return (
    <SettingsCard>
      <SettingsRow
        icon={Palette}
        title={t("teamView.settingsActions.identity")}
        chevron={false}
        testId="team-settings-identity"
        onClick={() => setEditTeamIdentityId(team.id)}
      />
      {personalSpace && hasSpaces(capabilities) && (
        <SettingsRow
          icon={Building2}
          title={t("teamView.settingsActions.moveToOrganization")}
          description={t(
            "teamView.settingsActions.moveToOrganizationDescription",
          )}
          chevron={false}
          testId="team-settings-move-to-organization"
          onClick={() => setMoveOpen(true)}
        />
      )}
      {mayLeave && (
        <SettingsRow
          icon={LogOut}
          title={t("teamView.settingsActions.leave")}
          destructive
          chevron={false}
          testId="team-settings-leave"
          onClick={() => actions.leaveGroup?.(team.id)}
        />
      )}
      {canDeleteTeam(team) && (
        <SettingsRow
          icon={Trash2}
          title={t("teamView.settingsActions.delete")}
          destructive
          chevron={false}
          testId="team-settings-delete"
          onClick={() => actions.deleteGroup(team.id)}
        />
      )}
      <TeamMoveFlow
        source={{
          id: team.id,
          name: team.name,
          icon: team.icon,
          color: team.color,
          context: team.context,
          isDefault: team.isDefault,
          agents: team.agents.map((agent) => ({
            id: agent.id,
            name: agent.name,
          })),
        }}
        open={moveOpen}
        onOpenChange={setMoveOpen}
      />
    </SettingsCard>
  );
}
