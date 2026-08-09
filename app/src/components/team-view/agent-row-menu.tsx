import {
  Button,
  ConfirmDialog,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@houston-ai/core";
import { MoreHorizontal } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useAgentActions } from "../../hooks/use-agent-actions";
import { useCapabilities } from "../../hooks/use-capabilities";
import { useTeams } from "../../hooks/use-teams";
import { hasAgentTeams } from "../../lib/org-roles";
import type { TeamView } from "../../lib/teams-model";
import type { Agent } from "../../lib/types";
import { useAgentStore } from "../../stores/agents";
import { useWorkspaceStore } from "../../stores/workspaces";
import { AgentSidebarColorMenu } from "../shell/agent-sidebar-color-menu";
import { TeamGlyph } from "../shell/team-glyph";
import { useSidebarOverlayLayout } from "../shell/use-sidebar-overlay-layout";
import { AgentRenameDialog } from "./agent-rename-dialog";
import { moveTargetTeams } from "./move-agent-model";
import { useMoveAgentTeam } from "./use-move-agent-team";

/**
 * Everything you can do TO an agent, on the one page that is about
 * administering agents: its row in a team's Manage agents list.
 *
 * The rail used to carry this menu on every agent row. It does not any more —
 * an agent row in the sidebar is a destination, and hanging rename/delete off
 * a navigation row put a destructive act one slip away from a click people
 * make dozens of times a day. So the menu moved to the roster, where the row
 * you click is already the agent you are managing, and it grew the action the
 * rail's cross-team DRAG used to be.
 *
 * The HANDLERS are the rail's, moved intact (`hooks/use-agent-actions.ts`):
 * rename validates before the PATCH and names a conflict in the user's own
 * words, and those rules must not exist twice.
 */
export function AgentRowMenu({
  agent,
  teamId,
}: {
  agent: Agent;
  /** The team the row belongs to: the one team "Move to" leaves out. */
  teamId: string;
}) {
  const { t } = useTranslation("teams");
  const { capabilities } = useCapabilities();
  const teams = useTeams();
  const agents = useAgentStore((s) => s.agents);
  const currentWorkspace = useWorkspaceStore((s) => s.current);
  const sidebar = useSidebarOverlayLayout(
    currentWorkspace?.id,
    hasAgentTeams(capabilities),
  );
  const actions = useAgentActions({
    t: useTranslation(["agents"]).t,
    workspaceId: currentWorkspace?.id,
    agentNamesById: agents,
    remapAgentId: sidebar.remapAgentId,
  });
  const moveAgent = useMoveAgentTeam();

  const [renaming, setRenaming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [pendingTeam, setPendingTeam] = useState<TeamView | null>(null);

  const moveTargets = moveTargetTeams(teams, teamId);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            className="rounded-full"
            aria-label={t("teamView.move.trigger", { name: agent.name })}
          >
            <MoreHorizontal className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => setRenaming(true)}>
            {t("teamView.agentMenu.rename")}
          </DropdownMenuItem>
          <AgentSidebarColorMenu
            color={agent.color}
            onChange={(color) => void actions.changeColor(agent.id, color)}
          />
          {/* Only when there is somewhere to go: a submenu whose only honest
              content is "no other teams" is a dead end. */}
          {moveTargets.length > 0 && (
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                {t("teamView.move.action")}
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                {moveTargets.map((team) => (
                  <DropdownMenuItem
                    key={team.id}
                    className="gap-2"
                    onSelect={() => setPendingTeam(team)}
                  >
                    <TeamGlyph team={team} className="size-4 shrink-0" />
                    <span className="truncate">{team.name}</span>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          )}
          {/* Below a separator, and the only destructive entry: it acts on the
              agent's existence, not on where it sits. */}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            variant="destructive"
            onSelect={() => setDeleting(true)}
          >
            {t("teamView.agentMenu.delete")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <AgentRenameDialog
        agent={agent}
        open={renaming}
        onOpenChange={setRenaming}
        onRename={(name) => void actions.rename(agent.id, name)}
      />

      <ConfirmDialog
        open={pendingTeam !== null}
        onOpenChange={(open) => {
          if (!open) setPendingTeam(null);
        }}
        title={t("teamView.move.confirmTitle", {
          agent: agent.name,
          team: pendingTeam?.name ?? "",
        })}
        description={t("teamView.move.confirmBody", {
          agent: agent.name,
          team: pendingTeam?.name ?? "",
        })}
        confirmLabel={t("teamView.move.confirm")}
        cancelLabel={t("teamView.move.cancel")}
        // Moving an agent takes nothing away: it is a placement, and the
        // destructive red would claim otherwise.
        variant="default"
        onConfirm={() => {
          if (pendingTeam) moveAgent(agent.id, pendingTeam);
          setPendingTeam(null);
        }}
      />

      <ConfirmDialog
        open={deleting}
        onOpenChange={setDeleting}
        title={t("shell:agentDelete.title")}
        description={t("shell:agentDelete.description")}
        confirmLabel={t("teamView.agentMenu.delete")}
        cancelLabel={t("teamView.move.cancel")}
        variant="destructive"
        onConfirm={() => {
          setDeleting(false);
          void actions.remove(agent.id);
        }}
      />
    </>
  );
}
