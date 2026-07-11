import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
  HoustonAvatar,
  resolveAgentColor,
} from "@houston-ai/core";
import { Keyboard, LayoutDashboard, Plus, Settings } from "lucide-react";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { DEFAULT_TAB_ID } from "../agents/standard-tabs";
import { useAllConversations } from "../hooks/queries";
import { useSidebarLayout } from "../hooks/use-sidebar-layout";
import { flatSidebarOrder } from "../lib/agent-order";
import { isRoutineSetupMode } from "../lib/routine-chat-setup";
import { shortcutLabel } from "../lib/shortcuts";
import { useAgentStore } from "../stores/agents";
import { useUIStore } from "../stores/ui";
import { useWorkspaceStore } from "../stores/workspaces";

// 28px outer circle so the inner helmet (forced to 20px by cmdk's
// `[&_[cmdk-item]_svg]:h-5` rule) sits at roughly its native 65%
// proportion instead of overflowing the badge.
const AVATAR_PX = 28;

function PaletteAvatar({ color }: { color?: string }) {
  return (
    <HoustonAvatar color={resolveAgentColor(color)} diameter={AVATAR_PX} />
  );
}

const RECENT_MISSION_LIMIT = 12;

/**
 * Global ⌘K command palette. Open state lives in the UI store so any
 * shortcut handler can toggle it. Sections:
 *  - Actions: top-level navigation + new-mission
 *  - Agents: jump to any agent (sidebar order)
 *  - Recent missions: open a card directly in Mission Control
 *
 * Keeps its data sources out of the dashboard tree so it works from any
 * view (settings, integrations, agent files, etc.).
 */
export function CommandPalette() {
  const { t } = useTranslation(["shell", "dashboard"]);
  const open = useUIStore((s) => s.paletteOpen);
  const setOpen = useUIStore((s) => s.setPaletteOpen);
  const setViewMode = useUIStore((s) => s.setViewMode);
  const setActivityPanelId = useUIStore((s) => s.setActivityPanelId);
  const setCheatsheetOpen = useUIStore((s) => s.setCheatsheetOpen);
  const agents = useAgentStore((s) => s.agents);
  const setCurrentAgent = useAgentStore((s) => s.setCurrent);
  const workspaceId = useWorkspaceStore((s) => s.current?.id);
  const { layout } = useSidebarLayout(workspaceId);
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
        // Archived missions live in the per-agent Archived tab, not the
        // quick-switcher's recent list.
        .filter(
          (c) =>
            c.type === "activity" &&
            c.status !== "archived" &&
            !isRoutineSetupMode(c.agent),
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

  const close = () => setOpen(false);

  function jumpToAgent(agentId: string) {
    const agent = agents.find((a) => a.id === agentId);
    if (!agent) return;
    setCurrentAgent(agent);
    setViewMode(DEFAULT_TAB_ID);
    close();
  }

  function openMission(agentPath: string, missionId: string) {
    const agent = agents.find((a) => a.folderPath === agentPath);
    if (!agent) {
      setViewMode("dashboard");
      close();
      return;
    }
    // Same handoff `session-notifications.ts` uses: switch to the
    // agent's activity tab, then publish the mission id via
    // `activityPanelId`. BoardTab consumes it and selects the card,
    // which opens the right panel.
    setCurrentAgent(agent);
    setViewMode("activity");
    setActivityPanelId(missionId);
    close();
  }

  function startNewMission() {
    close();
    // Defer to ensure the palette is unmounted before the next view
    // change runs, so focus lands on the right place.
    setTimeout(() => {
      const ui = useUIStore.getState();
      if (ui.viewMode === "dashboard") {
        ui.onStartMission?.();
      } else if (useAgentStore.getState().current) {
        if (ui.viewMode !== "activity") {
          ui.setViewMode("activity");
          setTimeout(() => useUIStore.getState().onStartMission?.(), 50);
        } else {
          ui.onStartMission?.();
        }
      } else {
        ui.setViewMode("dashboard");
        setTimeout(() => useUIStore.getState().onStartMission?.(), 50);
      }
    }, 30);
  }

  return (
    <CommandDialog
      open={open}
      onOpenChange={setOpen}
      title={t("shell:palette.title")}
      description={t("shell:palette.description")}
    >
      <CommandInput placeholder={t("shell:palette.placeholder")} />
      <CommandList>
        <CommandEmpty>{t("shell:palette.empty")}</CommandEmpty>

        <CommandGroup heading={t("shell:palette.groups.actions")}>
          <CommandItem onSelect={startNewMission} value="action new-mission">
            <Plus />
            <span>{t("shell:palette.actions.newMission")}</span>
            <CommandShortcut>{shortcutLabel("newMission")}</CommandShortcut>
          </CommandItem>
          <CommandItem
            onSelect={() => {
              setViewMode("dashboard");
              close();
            }}
            value="action mission-control"
          >
            <LayoutDashboard />
            <span>{t("shell:palette.actions.missionControl")}</span>
            <CommandShortcut>{shortcutLabel("missionControl")}</CommandShortcut>
          </CommandItem>
          <CommandItem
            onSelect={() => {
              setViewMode("settings");
              close();
            }}
            value="action settings"
          >
            <Settings />
            <span>{t("shell:palette.actions.settings")}</span>
          </CommandItem>
          <CommandItem
            onSelect={() => {
              close();
              setTimeout(() => setCheatsheetOpen(true), 30);
            }}
            value="action shortcuts"
          >
            <Keyboard />
            <span>{t("shell:palette.actions.shortcuts")}</span>
            <CommandShortcut>{shortcutLabel("cheatsheet")}</CommandShortcut>
          </CommandItem>
        </CommandGroup>

        {orderedAgents.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading={t("shell:palette.groups.agents")}>
              {orderedAgents.map((agent) => (
                <CommandItem
                  key={agent.id}
                  value={`agent ${agent.name}`}
                  onSelect={() => jumpToAgent(agent.id)}
                >
                  <PaletteAvatar color={agent.color} />
                  <span>{agent.name}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}

        {recentMissions.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading={t("shell:palette.groups.recentMissions")}>
              {recentMissions.map((m) => (
                <CommandItem
                  key={m.id}
                  value={`mission ${m.title} ${m.agent_name}`}
                  onSelect={() => openMission(m.agent_path, m.id)}
                >
                  <PaletteAvatar color={colorByPath[m.agent_path]} />
                  <div className="flex min-w-0 flex-col">
                    <span className="truncate">{m.title}</span>
                    <span className="truncate text-xs text-muted-foreground">
                      {m.agent_name}
                    </span>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}
      </CommandList>
    </CommandDialog>
  );
}
