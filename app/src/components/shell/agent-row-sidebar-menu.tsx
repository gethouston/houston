import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@houston-ai/core";
import { sidebarRowAffordanceClasses } from "@houston-ai/layout";
import { MoreHorizontal } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useAgentActions } from "../../hooks/use-agent-actions";
import { useCapabilities } from "../../hooks/use-capabilities";
import { useTeams } from "../../hooks/use-teams";
import { openAgentSettings } from "../../lib/open-agent";
import { hasAgentTeams } from "../../lib/org-roles";
import { type TeamView, teamOfAgent } from "../../lib/teams-model";
import type { Agent } from "../../lib/types";
import { useAgentStore } from "../../stores/agents";
import { useWorkspaceStore } from "../../stores/workspaces";
import {
  AgentDeleteDialog,
  AgentDeleteMenuItem,
} from "../agent-actions/agent-delete-action";
import {
  AgentMoveDialog,
  AgentMoveMenuItem,
} from "../agent-actions/agent-move-action";
import { useAgentIdentitySave } from "../agent-actions/use-agent-identity-save";
import { useMoveAgentTeam } from "../team-view/use-move-agent-team";
import { AgentIdentityDialog } from "./agent-identity-dialog";
import type { NeedsYouSignal } from "./agent-sidebar-items";
import { NeedsYouChip } from "./agent-sidebar-status";
import { useSidebarOverlayLayout } from "./use-sidebar-overlay-layout";

export function AgentRowSidebarMenu({
  agent,
  needsYou,
}: {
  agent: Agent;
  /** The row's needs-you count. The menu owns the row's right edge, so it
   *  draws the count at rest and swaps itself in on hover/focus/open. */
  needsYou: NeedsYouSignal | null;
}) {
  const { t } = useTranslation(["shell", "teams", "agents"]);
  const { capabilities } = useCapabilities();
  const agents = useAgentStore((state) => state.agents);
  const workspaceId = useWorkspaceStore((state) => state.current?.id);
  const teams = useTeams();
  const currentTeam = teamOfAgent(teams, agent.id);
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
  const [menuOpen, setMenuOpen] = useState(false);
  const [identityOpen, setIdentityOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [pendingTeam, setPendingTeam] = useState<TeamView | null>(null);
  const moveAgent = useMoveAgentTeam();

  // Radix restores focus when the menu closes. Open the dialog after that
  // tick, or focus restoration can immediately dismiss it.
  const afterMenuCloses = (run: () => void) => {
    setMenuOpen(false);
    setTimeout(run, 0);
  };

  // The ONE identity save path (sequenced rename-then-colour), shared with
  // the Agents pane's Color & Name row.
  const saveIdentity = useAgentIdentitySave(agent, t);

  return (
    <>
      <span className="relative flex shrink-0 items-center">
        {/* The count owns the right edge at rest; the "..." replaces it the
            moment the row is hovered, focused, or holding its menu open. The
            chip is presentation here (pointer-events-none), so it can sit over
            the trigger without stealing its first click. */}
        {needsYou && !menuOpen && (
          <span
            className="pointer-events-none absolute top-1/2 right-1.5 -translate-y-1/2 group-focus-within/row:hidden group-hover/row:hidden"
            data-agent-needs-you={agent.id}
          >
            <NeedsYouChip count={needsYou.count} label={needsYou.label} />
          </span>
        )}
        <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label={t("teams:teamView.move.trigger", {
                name: agent.name,
              })}
              // Quiet until the row is under the pointer: revealed by row hover,
              // keyboard focus, or the menu standing open — never hover-ONLY.
              className={`${sidebarRowAffordanceClasses} opacity-0 focus-visible:opacity-100 group-hover/row:opacity-100 data-[state=open]:opacity-100`}
              data-agent-menu={agent.id}
            >
              <MoreHorizontal className="size-3.5" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              onSelect={() => afterMenuCloses(() => setIdentityOpen(true))}
            >
              {t("shell:sidebar.agentMenu.identity")}
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() => {
                openAgentSettings(agent.id);
              }}
            >
              {t("shell:sidebar.agentMenu.configure")}
            </DropdownMenuItem>
            {currentTeam && (
              <AgentMoveMenuItem
                teams={teams}
                currentTeamId={currentTeam.id}
                onSelect={(team) => afterMenuCloses(() => setPendingTeam(team))}
              />
            )}
            <DropdownMenuSeparator />
            <AgentDeleteMenuItem
              onSelect={() => afterMenuCloses(() => setDeleting(true))}
            />
          </DropdownMenuContent>
        </DropdownMenu>
      </span>
      <AgentIdentityDialog
        agent={agent}
        open={identityOpen}
        onOpenChange={setIdentityOpen}
        onSave={(patch) => void saveIdentity(patch)}
      />
      <AgentMoveDialog
        agent={agent}
        team={pendingTeam}
        onOpenChange={(open) => {
          if (!open) setPendingTeam(null);
        }}
        onConfirm={() => {
          if (pendingTeam) moveAgent(agent.id, pendingTeam);
          setPendingTeam(null);
        }}
      />
      <AgentDeleteDialog
        open={deleting}
        onOpenChange={setDeleting}
        onConfirm={() => {
          setDeleting(false);
          void actions.remove(agent.id);
        }}
      />
    </>
  );
}
