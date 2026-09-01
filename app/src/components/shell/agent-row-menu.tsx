import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@houston-ai/core";
import { sidebarRowAffordanceClasses } from "@houston-ai/layout";
import { Copy, MoreHorizontal, Store, Trash2 } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useAgentActions } from "../../hooks/use-agent-actions";
import { useCapabilities } from "../../hooks/use-capabilities";
import { useTeams } from "../../hooks/use-teams";
import { isIdentityConfigured } from "../../lib/identity";
import { hasAgentTeams } from "../../lib/org-roles";
import { teamOfAgent } from "../../lib/teams-model";
import type { Agent } from "../../lib/types";
import { useAgentStore } from "../../stores/agents";
import { useUIStore } from "../../stores/ui";
import { useWorkspaceStore } from "../../stores/workspaces";
import { AgentCopyDialog } from "../agent-actions/agent-copy-action";
import { AgentDeleteDialog } from "../agent-actions/agent-delete-action";
import { useCopyAgent } from "../agent-actions/use-copy-agent";
import { useSidebarOverlayLayout } from "./use-sidebar-overlay-layout";

type RowDialog = "copy" | "delete";

/**
 * The agent row's "..." menu in the rail: Copy agent, Publish to the Agent
 * Store, Delete agent — the same three actions the agent's Settings section
 * offers, opening the SAME surfaces (the copy dialog, the share wizard via
 * `setShareAgentId`, the delete confirm), so the rail can never diverge from
 * the settings page on what these actions mean.
 *
 * The trigger wears the library's own affordance treatment
 * (`sidebarRowAffordanceClasses`): always visible and muted, strengthening on
 * hover / focus / open — Houston forbids hover-GATED affordances. It sits in
 * the row's affordance slot, a SIBLING of the row button, so activating the
 * row and opening its menu stay two separate controls.
 *
 * The dialogs (and the hooks that feed them) mount only once an action is
 * picked: the rail draws one of these per agent, and a dormant menu should
 * cost a button, not a teams read.
 */
export function AgentRowMenu({ agent }: { agent: Agent }) {
  const { t } = useTranslation(["agents", "teams"]);
  const setShareAgentId = useUIStore((s) => s.setShareAgentId);
  const [dialog, setDialog] = useState<RowDialog | null>(null);
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label={t("agents:rowMenu.label", { name: agent.name })}
            data-testid="agent-row-menu"
            className={sidebarRowAffordanceClasses}
          >
            <MoreHorizontal className="size-4" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-56">
          <DropdownMenuItem onSelect={() => setDialog("copy")}>
            <Copy className="size-3.5" />
            {t("agents:copyAgent.row")}
          </DropdownMenuItem>
          {isIdentityConfigured() && (
            <DropdownMenuItem onSelect={() => setShareAgentId(agent.id)}>
              <Store className="size-3.5" />
              {t("teams:agentSettings.manage.publish")}
            </DropdownMenuItem>
          )}
          <DropdownMenuItem
            variant="destructive"
            onSelect={() => setDialog("delete")}
          >
            <Trash2 className="size-3.5" />
            {t("teams:agentSettings.manage.delete")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {dialog !== null && (
        <AgentRowMenuDialogs
          agent={agent}
          dialog={dialog}
          onClose={() => setDialog(null)}
        />
      )}
    </>
  );
}

/** The picked action's surface — the settings page's own dialogs, re-anchored. */
function AgentRowMenuDialogs({
  agent,
  dialog,
  onClose,
}: {
  agent: Agent;
  dialog: RowDialog;
  onClose: () => void;
}) {
  const { t } = useTranslation(["agents", "shell", "teams", "common"]);
  const { capabilities } = useCapabilities();
  const teams = useTeams();
  const currentTeam = teamOfAgent(teams, agent.id);
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
  const copyAgent = useCopyAgent();

  const deleteAgentHandled = async () => {
    onClose();
    try {
      await actions.remove(agent.id);
    } catch {
      // Already toasted + reported by `call()`.
    }
  };

  const closeOn = (open: boolean) => {
    if (!open) onClose();
  };

  return (
    <>
      <AgentCopyDialog
        agent={agent}
        open={dialog === "copy"}
        onOpenChange={closeOn}
        teams={teams}
        currentTeamId={currentTeam?.id ?? null}
        existingNames={agents.map((entry) => entry.name)}
        onCopy={(name, team) => copyAgent({ agent, name, team })}
      />
      <AgentDeleteDialog
        open={dialog === "delete"}
        onOpenChange={closeOn}
        onConfirm={deleteAgentHandled}
      />
    </>
  );
}
