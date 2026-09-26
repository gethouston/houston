import { useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAllConversations } from "../../hooks/queries";
import { useAgentWarmup } from "../../hooks/use-agent-warmup";
import { useCapabilities } from "../../hooks/use-capabilities";
import { useTeams } from "../../hooks/use-teams";
import { openMissionChat } from "../../lib/mission-chat";
import { openAgentSection } from "../../lib/open-agent";
import { visibleAgentSections } from "../../lib/teams-model";
import type { Agent } from "../../lib/types";
import { useAgentStore } from "../../stores/agents";
import { useUIStore } from "../../stores/ui";
import { TaskListFilter } from "../board/task-list-filter";
import type { TaskListFilterId } from "../board/task-list-model";
import { TaskListSearch } from "../board/task-list-search";
import { FirstDayLead } from "../first-day/first-day-banner";
import { FirstDayHero } from "../first-day/first-day-cta";
import { useFirstDayPlacement } from "../first-day/use-first-day-placement";
import { AgentDetail } from "../permissions/agent-detail";
import { AgentGettingReady } from "../shell/agent-getting-ready";
import { AgentSidebarIcon } from "../shell/agent-sidebar-status";
import { MobileDrilledHeader } from "../shell/mobile-drilled-header";
import { AgentMissionsList } from "./agent-missions-list";
import { AgentMissionsMenu } from "./agent-missions-menu";
import {
  type AgentMissionsMenuSection,
  agentMissionCount,
  agentMissionSections,
  agentMissionsMenuSections,
  liveMissionCount,
} from "./agent-missions-model";
import { AgentMissionsMoveDialogs } from "./agent-missions-move";
import type { AgentHomeConversation } from "./agents-home-model";
import { useAgentMissionsSettings } from "./use-agent-missions-settings";
import { useDrillInMissionTarget } from "./use-drill-in-mission-target";

/**
 * The phone's ONE task list for an employee: every task, archived ones
 * included, opens as the pushed chat above it, and so does a published target.
 * A new hire with no tasks yet shows its first-day start instead.
 */
export function AgentMissionsScreen({ agent }: { agent: Agent }) {
  const { t } = useTranslation(["shell", "dashboard"]);
  const openAgentsHome = useUIStore((s) => s.openAgentsHome);
  const agents = useAgentStore((s) => s.agents);
  const teams = useTeams();
  const { capabilities } = useCapabilities();
  const menuSections = agentMissionsMenuSections(
    visibleAgentSections(capabilities, agent),
  );
  const [moveOpen, setMoveOpen] = useState(false);
  const settings = useAgentMissionsSettings(agent.id);
  const [filter, setFilter] = useState<TaskListFilterId>("all");
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [archivedOpen, setArchivedOpen] = useState(false);
  const archived = useRef<HTMLDivElement>(null);

  const rosterPaths = useMemo(() => agents.map((a) => a.folderPath), [agents]);
  const { data: conversations } = useAllConversations(rosterPaths);
  useDrillInMissionTarget(agent, conversations);
  const sections = useMemo(
    () => agentMissionSections(conversations, agent.folderPath),
    [conversations, agent.folderPath],
  );
  const missionCount = agentMissionCount(sections);
  const firstDay = useFirstDayPlacement({
    agents: [agent],
    pinnedAgent: agent,
    pinnedTaskCount: missionCount,
  });
  // With no tasks, the hero IS the screen, and while the config still loads
  // the screen holds rather than flash "No tasks" before the button: blank for
  // the beat a read takes, "getting ready" for a warm-up that takes minutes.
  const showsTasks = missionCount > 0 || !firstDay.holdsAutoOpen;
  const warmup = useAgentWarmup(agent.folderPath);
  const gettingReady =
    !showsTasks && firstDay.placement.kind === "none" && warmup !== "ready";

  const openMission = (mission: AgentHomeConversation) => {
    openMissionChat(agent, mission.id);
  };
  // Settings opens in place, like any settings deep link into this list, so
  // its back chip returns here; Routines and Files are the employee screen's.
  const openSection = (section: AgentMissionsMenuSection) => {
    if (section !== "settings") return openAgentSection(agent.id, section);
    settings.openIndex();
  };
  const closeSearch = () => {
    setSearchOpen(false);
    setQuery("");
  };
  // Archived lives at the bottom of the UNFILTERED list, so reaching it from
  // the menu has to undo a narrowing segment as well as open the band.
  const revealArchived = () => {
    setFilter("all");
    setArchivedOpen(true);
    requestAnimationFrame(() =>
      archived.current?.scrollIntoView({ block: "start" }),
    );
  };

  if (settings.open) {
    return (
      <AgentDetail
        agent={agent}
        backLabel={agent.name}
        initialSection={settings.section}
        onBack={settings.close}
      />
    );
  }

  return (
    <div
      data-testid="agent-missions-screen"
      className="flex h-full min-h-0 flex-col"
    >
      <MobileDrilledHeader
        backLabel={t("shell:agentsHome.title")}
        onBack={() => openAgentsHome(null, { nav: "retreat" })}
        glyph={
          <AgentSidebarIcon
            color={agent.color}
            diameter={20}
            running={sections.running.length > 0}
            runningLabel={t("shell:sidebar.runningCount", {
              count: sections.running.length,
            })}
          />
        }
        title={agent.name}
        subtitle={t("shell:agentsHome.taskCount", {
          count: liveMissionCount(sections),
        })}
        trailing={
          <AgentMissionsMenu
            onSearch={() => setSearchOpen(true)}
            onArchived={revealArchived}
            onMove={teams.length > 0 ? () => setMoveOpen(true) : undefined}
            sections={menuSections}
            onOpenSection={openSection}
          />
        }
        testId="agent-missions-back"
      />
      <AgentMissionsMoveDialogs
        agent={agent}
        open={moveOpen}
        onOpenChange={setMoveOpen}
      />
      {showsTasks && (
        <TaskListFilter
          active={filter}
          needsYouCount={sections.needsYou.length}
          onSelect={setFilter}
          testId="agent-missions-filter"
        />
      )}
      {showsTasks && searchOpen && (
        <TaskListSearch
          query={query}
          onQuery={setQuery}
          onClose={closeSearch}
          testId="agent-missions-search"
        />
      )}
      <div className="min-h-0 flex-1 overflow-y-auto pb-6">
        {firstDay.placement.kind === "hero" && (
          <FirstDayHero agent={firstDay.placement.agent} />
        )}
        {gettingReady && (
          <AgentGettingReady agent={agent} stalled={warmup === "stalled"} />
        )}
        {showsTasks && <FirstDayLead placement={firstDay.placement} />}
        {showsTasks && (
          <AgentMissionsList
            sections={sections}
            agentColor={agent.color}
            filter={filter}
            query={query}
            archivedOpen={archivedOpen}
            archivedRef={archived}
            onToggleArchived={() => setArchivedOpen((open) => !open)}
            onOpen={openMission}
          />
        )}
      </div>
    </div>
  );
}
