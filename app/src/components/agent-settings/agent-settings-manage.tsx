import {
  Building2,
  Copy,
  Palette,
  Store,
  Trash2,
  UsersRound,
} from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useAgentActions } from "../../hooks/use-agent-actions";
import { useCapabilities } from "../../hooks/use-capabilities";
import { usePersonalSpace } from "../../hooks/use-personal-space";
import { useTeams } from "../../hooks/use-teams";
import { isIdentityConfigured } from "../../lib/identity";
import { hasAgentTeams } from "../../lib/org-roles";
import { type TeamView, teamOfAgent } from "../../lib/teams-model";
import type { Agent } from "../../lib/types";
import { useAgentStore } from "../../stores/agents";
import { useUIStore } from "../../stores/ui";
import { useWorkspaceStore } from "../../stores/workspaces";
import { AgentShareSurfaces } from "../agent/agent-share-surfaces";
import { AgentCopyDialog } from "../agent-actions/agent-copy-action";
import { AgentDeleteDialog } from "../agent-actions/agent-delete-action";
import { AgentIdentityDialog } from "../agent-actions/agent-identity-dialog";
import {
  AgentMoveDialog,
  AgentMovePickerDialog,
} from "../agent-actions/agent-move-action";
import {
  type AgentIdentityPatch,
  useAgentIdentitySave,
} from "../agent-actions/use-agent-identity-save";
import { useCopyAgent } from "../agent-actions/use-copy-agent";
import { SettingsCard, SettingsRow } from "../settings/settings-row";
import { useSidebarOverlayLayout } from "../shell/use-sidebar-overlay-layout";
import { moveTargetTeams } from "../team-view/move-agent-model";
import { useMoveAgentTeam } from "../team-view/use-move-agent-team";

export function AgentSettingsManage({ agent }: { agent: Agent }) {
  const { t } = useTranslation(["shell", "teams", "agents"]);
  const { capabilities } = useCapabilities();
  const personalSpace = usePersonalSpace();
  const teams = useTeams();
  const currentTeam = teamOfAgent(teams, agent.id);
  const targets = currentTeam ? moveTargetTeams(teams, currentTeam.id) : [];
  const workspaceId = useWorkspaceStore((state) => state.current?.id);
  const agents = useAgentStore((state) => state.agents);
  const sidebar = useSidebarOverlayLayout(
    workspaceId,
    hasAgentTeams(capabilities),
  );
  const actions = useAgentActions({
    t,
    workspaceId,
    agentNamesById: agents,
    remapAgentId: sidebar.remapAgentId,
  });
  const saveIdentity = useAgentIdentitySave(agent, t);
  const moveAgent = useMoveAgentTeam();
  const copyAgent = useCopyAgent();
  const setShareAgentId = useUIStore((state) => state.setShareAgentId);
  const [identityOpen, setIdentityOpen] = useState(false);
  const [moveOpen, setMoveOpen] = useState(false);
  const [pendingTeam, setPendingTeam] = useState<TeamView | null>(null);
  const [organizationOpen, setOrganizationOpen] = useState(false);
  const [copyOpen, setCopyOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Both writes reject AFTER `call()` has toasted the failure and reported it
  // to Sentry, so there is exactly one user-visible surface already. Awaiting
  // them here is what stops that rejection from escaping the handler unhandled;
  // the catch adds no second surface and hides nothing.
  const saveIdentityHandled = async (patch: AgentIdentityPatch) => {
    try {
      await saveIdentity(patch);
    } catch {
      // Already toasted + reported by `call()`.
    }
  };
  const deleteAgentHandled = async () => {
    setDeleting(false);
    try {
      await actions.remove(agent.id);
    } catch {
      // Already toasted + reported by `call()`.
    }
  };

  return (
    <>
      <SettingsCard>
        <SettingsRow
          icon={Palette}
          title={t("teams:agentSettings.manage.identity")}
          chevron={false}
          onClick={() => setIdentityOpen(true)}
        />
        {currentTeam && targets.length > 0 && (
          <SettingsRow
            icon={UsersRound}
            title={t("teams:agentSettings.manage.moveTeam")}
            onClick={() => setMoveOpen(true)}
          />
        )}
        {personalSpace && (
          <SettingsRow
            icon={Building2}
            title={t("teams:agentSettings.manage.moveOrganization")}
            description={t(
              "teams:agentSettings.manage.moveOrganizationDescription",
            )}
            onClick={() => setOrganizationOpen(true)}
          />
        )}
        <SettingsRow
          icon={Copy}
          title={t("agents:copyAgent.row")}
          description={t("agents:copyAgent.rowDescription")}
          onClick={() => setCopyOpen(true)}
        />
        {isIdentityConfigured() && (
          <SettingsRow
            icon={Store}
            title={t("teams:agentSettings.manage.publish")}
            description={t("teams:agentSettings.manage.publishDescription")}
            onClick={() => setShareAgentId(agent.id)}
          />
        )}
        <SettingsRow
          icon={Trash2}
          title={t("teams:agentSettings.manage.delete")}
          destructive
          chevron={false}
          onClick={() => setDeleting(true)}
        />
      </SettingsCard>

      <AgentIdentityDialog
        agent={agent}
        open={identityOpen}
        onOpenChange={setIdentityOpen}
        onSave={saveIdentityHandled}
      />
      {currentTeam && (
        <AgentMovePickerDialog
          open={moveOpen}
          onOpenChange={setMoveOpen}
          teams={teams}
          currentTeamId={currentTeam.id}
          onSelect={(team) => {
            setMoveOpen(false);
            setPendingTeam(team);
          }}
        />
      )}
      <AgentMoveDialog
        agent={agent}
        team={pendingTeam}
        onOpenChange={(open) => {
          if (!open) setPendingTeam(null);
        }}
        onConfirm={() => {
          if (pendingTeam) void moveAgent(agent.id, pendingTeam);
          setPendingTeam(null);
        }}
      />
      <AgentShareSurfaces
        agent={agent}
        surface="inviteTeam"
        open={organizationOpen}
        onOpenChange={setOrganizationOpen}
      />
      <AgentCopyDialog
        agent={agent}
        open={copyOpen}
        onOpenChange={setCopyOpen}
        teams={teams}
        currentTeamId={currentTeam?.id ?? null}
        existingNames={agents.map((entry) => entry.name)}
        onCopy={(name, team) => copyAgent({ agent, name, team })}
      />
      <AgentDeleteDialog
        open={deleting}
        onOpenChange={setDeleting}
        onConfirm={deleteAgentHandled}
      />
    </>
  );
}
