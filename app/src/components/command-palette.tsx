import {
  CommandDialog,
  CommandEmpty,
  CommandInput,
  CommandList,
} from "@houston-ai/core";
import { useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useAllConversations } from "../hooks/queries";
import { useSidebarLayoutValue } from "../hooks/use-sidebar-layout";
import { useTeams } from "../hooks/use-teams";
import { flatSidebarOrder } from "../lib/agent-order";
import { analytics } from "../lib/analytics";
import { openHome } from "../lib/home-nav";
import { isSetupChatMode } from "../lib/integration-chat-setup";
import { ARCHIVED_STATUS } from "../lib/mission-selection";
import { openAgentBoard } from "../lib/open-agent";
import { isMissionBoardView } from "../lib/top-level-views";
import { useAgentStore } from "../stores/agents";
import { useUIStore } from "../stores/ui";
import { useWorkspaceStore } from "../stores/workspaces";
import { agentsByPath } from "./board/mission-card-agent";
import { PaletteActions } from "./command-palette-actions";
import {
  PaletteAgents,
  PaletteMissions,
  PaletteTeams,
} from "./command-palette-lists";

const RECENT_MISSION_LIMIT = 12;

/**
 * Global ⌘K command palette. Open state lives in the UI store so any
 * shortcut handler can toggle it. Sections:
 *  - Actions: top-level navigation + new-mission
 *  - Teams: open a team's Mission Control (every board belongs to a team)
 *  - Agents: jump to any agent (sidebar order)
 *  - Recent missions: open a card directly on its board
 *
 * Keeps its data sources out of the board tree so it works from any
 * view (settings, integrations, agent files, etc.). The three list groups
 * render from `command-palette-lists.tsx`.
 */
export function CommandPalette() {
  const { t } = useTranslation("shell");
  const open = useUIStore((s) => s.paletteOpen);
  const setOpen = useUIStore((s) => s.setPaletteOpen);
  useEffect(() => {
    if (open) analytics.track("command_palette_opened");
  }, [open]);
  const openTeamView = useUIStore((s) => s.openTeamView);
  const setActivityPanelId = useUIStore((s) => s.setActivityPanelId);
  const agents = useAgentStore((s) => s.agents);
  const setCurrentAgent = useAgentStore((s) => s.setCurrent);
  const teams = useTeams();
  const workspaceId = useWorkspaceStore((s) => s.current?.id);
  const layout = useSidebarLayoutValue(workspaceId);
  const orderedAgents = useMemo(
    () => flatSidebarOrder(agents, layout),
    [agents, layout],
  );
  const agentPaths = useMemo(() => agents.map((a) => a.folderPath), [agents]);
  const { data: convos } = useAllConversations(agentPaths);

  const recentMissions = useMemo(() => {
    if (!convos) return [];
    return (
      convos
        // Archived missions live in the board's archived view, and
        // guided-setup chats are never missions — neither belongs in the
        // quick-switcher's recent list.
        .filter(
          (c) =>
            c.type === "activity" &&
            c.status !== ARCHIVED_STATUS &&
            !isSetupChatMode(c.agent),
        )
        .slice()
        .sort((a, b) => (b.updated_at ?? "").localeCompare(a.updated_at ?? ""))
        .slice(0, RECENT_MISSION_LIMIT)
    );
  }, [convos]);

  const colorByPath = useMemo(() => {
    const m: Record<string, string | undefined> = {};
    for (const a of agents) m[a.folderPath] = a.color;
    return m;
  }, [agents]);
  const rosterByPath = useMemo(() => agentsByPath(agents), [agents]);

  const close = () => setOpen(false);

  function jumpToTeam(teamId: string) {
    openTeamView(teamId, "mission-control");
    close();
  }

  function jumpToAgent(agentId: string) {
    const agent = agents.find((a) => a.id === agentId);
    if (!agent) return;
    setCurrentAgent(agent);
    // An agent has no screen of its own any more: "jump to Kai" means Kai's
    // team board, filtered to Kai.
    openAgentBoard(agent.id);
    close();
  }

  function openMission(agentPath: string, missionId: string) {
    const agent = agents.find((a) => a.folderPath === agentPath);
    if (!agent) {
      openHome();
      close();
      return;
    }
    // Same handoff `session-notifications.ts` uses: open the board the
    // mission's card lives on (its agent's team, filtered to that agent), then
    // publish the mission id via `activityPanelId`. The board on the glass
    // consumes it and selects the card, which opens the right panel.
    setCurrentAgent(agent);
    openAgentBoard(agent.id);
    setActivityPanelId(missionId);
    close();
  }

  function startNewMission() {
    close();
    // Defer to ensure the palette is unmounted before the next view
    // change runs, so focus lands on the right place.
    setTimeout(() => {
      const ui = useUIStore.getState();
      // A team's board owns the handler already. The guard is two-part because
      // the `team` view also renders Team Settings, Routines, Files and the
      // no-agents empty state, none of which mounts a board — with no
      // registered handler this has to fall through to the navigate-then-fire
      // path instead of silently doing nothing.
      if (isMissionBoardView(ui.viewMode) && ui.onStartMission) {
        ui.onStartMission();
        return;
      }
      // Anywhere else (Settings, Files, the Store): go to the board that owns
      // the handler. The agent the user last worked with names the team board
      // to land on; with none, home does.
      const current = useAgentStore.getState().current;
      if (current) openAgentBoard(current.id);
      else openHome();
      setTimeout(() => useUIStore.getState().onStartMission?.(), 50);
    }, 30);
  }

  return (
    <CommandDialog
      open={open}
      onOpenChange={setOpen}
      title={t("palette.title")}
      description={t("palette.description")}
    >
      <CommandInput placeholder={t("palette.placeholder")} />
      <CommandList>
        <CommandEmpty>{t("palette.empty")}</CommandEmpty>

        <PaletteActions onNewMission={startNewMission} onClose={close} />

        <PaletteTeams teams={teams} onSelect={jumpToTeam} />
        <PaletteAgents agents={orderedAgents} onSelect={jumpToAgent} />
        <PaletteMissions
          missions={recentMissions}
          colorByPath={colorByPath}
          agentsByPath={rosterByPath}
          onSelect={openMission}
        />
      </CommandList>
    </CommandDialog>
  );
}
