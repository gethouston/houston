import { useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAllConversations } from "../../hooks/queries";
import { openMissionChat } from "../../lib/mission-chat";
import { openAgentBoard } from "../../lib/open-agent";
import type { Agent } from "../../lib/types";
import { useAgentStore } from "../../stores/agents";
import { useUIStore } from "../../stores/ui";
import { AgentSidebarIcon } from "../shell/agent-sidebar-status";
import { MobileDrilledHeader } from "../shell/mobile-drilled-header";
import { AgentMissionsFilter } from "./agent-missions-filter";
import { AgentMissionsList } from "./agent-missions-list";
import { AgentMissionsMenu } from "./agent-missions-menu";
import {
  agentMissionSections,
  type MissionFilterId,
} from "./agent-missions-model";
import { AgentMissionsSearch } from "./agent-missions-search";
import type { AgentHomeConversation } from "./agents-home-model";

/**
 * One agent's tasks, pushed from the mobile Agents home: the drilled header
 * (back chip to the Agents home, the agent, its task count), a status
 * segmented control, and the board's sections as a phone list. Reads the same
 * one-sweep query the boards read; no fetch path of its own.
 *
 * Tapping an ACTIVE task pushes its chat as a first-class nav level
 * (`lib/mission-chat.ts`) — the same push a board card performs — so back pops
 * straight from the chat to this screen. An ARCHIVED task has no chat-screen
 * surface, so its rows keep the notification three-step (make the agent
 * current, push its board, publish the mission id): the board's surface router
 * swaps in its archive and opens the panel over it.
 */
export function AgentMissionsScreen({ agent }: { agent: Agent }) {
  const { t } = useTranslation(["shell", "dashboard"]);
  const openAgentsHome = useUIStore((s) => s.openAgentsHome);
  const agents = useAgentStore((s) => s.agents);
  const [filter, setFilter] = useState<MissionFilterId>("all");
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [archivedOpen, setArchivedOpen] = useState(false);
  const archived = useRef<HTMLDivElement>(null);

  const rosterPaths = useMemo(() => agents.map((a) => a.folderPath), [agents]);
  const { data: conversations } = useAllConversations(rosterPaths);
  const sections = useMemo(
    () => agentMissionSections(conversations, agent.folderPath),
    [conversations, agent.folderPath],
  );
  // The subtitle counts the agent's LIVE work: the archive is filed away, and
  // counting it would make a finished agent look busy.
  const taskCount =
    sections.needsYou.length + sections.running.length + sections.done.length;

  const openMission = (mission: AgentHomeConversation) => {
    openMissionChat(agent, mission.id);
  };
  const openArchivedMission = (mission: AgentHomeConversation) => {
    useAgentStore.getState().setCurrent(agent);
    openAgentBoard(agent.id);
    useUIStore.getState().setActivityPanelId(mission.id, { forceOpen: true });
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
            running={sections.running.length > 0}
            runningLabel={t("shell:sidebar.runningCount", {
              count: sections.running.length,
            })}
          />
        }
        title={agent.name}
        subtitle={t("shell:agentsHome.taskCount", { count: taskCount })}
        trailing={
          <AgentMissionsMenu
            onSearch={() => setSearchOpen(true)}
            onArchived={revealArchived}
          />
        }
        testId="agent-missions-back"
      />
      <AgentMissionsFilter
        active={filter}
        needsYouCount={sections.needsYou.length}
        onSelect={setFilter}
      />
      {searchOpen && (
        <AgentMissionsSearch
          query={query}
          onQuery={setQuery}
          onClose={closeSearch}
        />
      )}
      <div className="min-h-0 flex-1 overflow-y-auto pb-6">
        <AgentMissionsList
          sections={sections}
          filter={filter}
          query={query}
          archivedOpen={archivedOpen}
          archivedRef={archived}
          onToggleArchived={() => setArchivedOpen((open) => !open)}
          onOpen={openMission}
          onOpenArchived={openArchivedMission}
        />
      </div>
    </div>
  );
}
