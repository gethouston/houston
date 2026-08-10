import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@houston-ai/core";
import { sidebarRowAffordanceClasses } from "@houston-ai/layout";
import { MoreHorizontal } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useAgentActions } from "../../hooks/use-agent-actions";
import { useCapabilities } from "../../hooks/use-capabilities";
import { openAgentSettings } from "../../lib/open-agent";
import { hasAgentTeams } from "../../lib/org-roles";
import type { Agent } from "../../lib/types";
import { useAgentStore } from "../../stores/agents";
import { useWorkspaceStore } from "../../stores/workspaces";
import { AgentRenameDialog } from "../team-view/agent-rename-dialog";
import { AgentSidebarColorMenu } from "./agent-sidebar-color-menu";
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
  const [renaming, setRenaming] = useState(false);

  // Radix restores focus when the menu closes. Open the dialog after that
  // tick, or focus restoration can immediately dismiss it.
  const afterMenuCloses = (run: () => void) => {
    setMenuOpen(false);
    setTimeout(run, 0);
  };

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
              onSelect={() => afterMenuCloses(() => setRenaming(true))}
            >
              {t("teams:teamView.agentMenu.rename")}
            </DropdownMenuItem>
            <AgentSidebarColorMenu
              color={agent.color}
              onChange={(color) => void actions.changeColor(agent.id, color)}
            />
            <DropdownMenuItem
              onSelect={() => {
                openAgentSettings(agent.id);
              }}
            >
              {t("shell:sidebar.agentMenu.editAgent")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </span>
      <AgentRenameDialog
        agent={agent}
        open={renaming}
        onOpenChange={setRenaming}
        onRename={(name) => void actions.rename(agent.id, name)}
      />
    </>
  );
}
