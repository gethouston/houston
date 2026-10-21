import {
  Building2,
  Copy,
  KeyRound,
  Palette,
  Trash2,
  UsersRound,
} from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useCapabilities } from "../../hooks/use-capabilities";
import { useOrgWriteLock } from "../../hooks/use-org-write-lock";
import { usePersonalSpace } from "../../hooks/use-personal-space";
import { useTeams } from "../../hooks/use-teams";
import { apiKeysSupported } from "../../lib/api-keys-model";
import { teamOfAgent } from "../../lib/teams-model";
import type { Agent } from "../../lib/types";
import { useAgentStore } from "../../stores/agents";
import { AgentShareSurfaces } from "../agent/agent-share-surfaces";
import { AgentCopyDialog } from "../agent-actions/agent-copy-action";
import { AgentDeleteDialog } from "../agent-actions/agent-delete-action";
import { AgentIdentityDialog } from "../agent-actions/agent-identity-dialog";
import {
  AgentMoveDialog,
  AgentMovePickerDialog,
  type MoveTarget,
} from "../agent-actions/agent-move-action";
import { useCopyAgent } from "../agent-actions/use-copy-agent";
import { SettingsCard, SettingsRow } from "../settings/settings-row";
import { useAgentSettingsNav } from "../team-view/agent-settings-nav-store";
import { useMoveAgentTeam } from "../team-view/use-move-agent-team";
import { AgentApiAccess } from "./agent-api-access";
import { useAgentManageWrites } from "./use-agent-manage-writes";

export function AgentSettingsManage({ agent }: { agent: Agent }) {
  const { t } = useTranslation(["shell", "teams", "agents", "settings"]);
  const personalSpace = usePersonalSpace();
  const teams = useTeams();
  const currentTeam = teamOfAgent(teams, agent.id);
  const agents = useAgentStore((state) => state.agents);
  const writes = useAgentManageWrites(agent);
  // A locked org refuses these writes; moving the AI Employee stays open.
  const { locked } = useOrgWriteLock();
  const moveAgent = useMoveAgentTeam();
  const copyAgent = useCopyAgent();
  const [identityOpen, setIdentityOpen] = useState(false);
  const [moveOpen, setMoveOpen] = useState(false);
  const [pendingTeam, setPendingTeam] = useState<MoveTarget | null>(null);
  const [organizationOpen, setOrganizationOpen] = useState(false);
  const [copyOpen, setCopyOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const apiAvailable = apiKeysSupported(useCapabilities().capabilities);
  const apiFor = useAgentSettingsNav((s) => s.apiAccessFor);
  const setApiFor = useAgentSettingsNav((s) => s.setApiAccessFor);

  if (apiAvailable && apiFor === agent.id)
    return <AgentApiAccess agent={agent} onBack={() => setApiFor(null)} />;

  return (
    <>
      <SettingsCard>
        <SettingsRow
          icon={Palette}
          title={t("teams:agentSettings.manage.identity")}
          chevron={false}
          disabled={locked}
          onClick={() => setIdentityOpen(true)}
        />
        {teams.length > 0 && (
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
          title={t("agents:copyAgent.row", { name: agent.name })}
          description={t("agents:copyAgent.rowDescription")}
          disabled={locked}
          onClick={() => setCopyOpen(true)}
        />
        {apiAvailable && (
          <SettingsRow
            icon={KeyRound}
            title={t("settings:apiKeys.agentAccess.title")}
            badge={t("settings:advancedBadge")}
            description={t("settings:apiKeys.agentAccess.rowDescription", {
              name: agent.name,
            })}
            onClick={() => setApiFor(agent.id)}
          />
        )}
        <SettingsRow
          icon={Trash2}
          title={t("teams:agentSettings.manage.delete", { name: agent.name })}
          destructive
          chevron={false}
          disabled={locked}
          onClick={() => setDeleting(true)}
        />
      </SettingsCard>

      <AgentIdentityDialog
        agent={agent}
        otherNames={agents
          .filter((other) => other.id !== agent.id)
          .map((other) => other.name)}
        open={identityOpen}
        onOpenChange={setIdentityOpen}
        onSave={writes.saveIdentity}
      />
      {teams.length > 0 && (
        <AgentMovePickerDialog
          open={moveOpen}
          onOpenChange={setMoveOpen}
          teams={teams}
          currentTeamId={currentTeam?.id ?? null}
          onSelect={(target) => {
            setMoveOpen(false);
            setPendingTeam(target);
          }}
        />
      )}
      <AgentMoveDialog
        agent={agent}
        target={pendingTeam}
        onOpenChange={(open) => {
          if (!open) setPendingTeam(null);
        }}
        onConfirm={() => {
          if (pendingTeam)
            moveAgent(
              agent.id,
              pendingTeam.kind === "team" ? pendingTeam.team : null,
            );
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
        onConfirm={() => {
          setDeleting(false);
          return writes.remove();
        }}
      />
    </>
  );
}
