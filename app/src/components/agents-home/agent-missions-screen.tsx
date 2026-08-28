import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@houston-ai/core";
import { ChevronDown, ChevronRight } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAllConversations } from "../../hooks/queries";
import { openMissionChat } from "../../lib/mission-chat";
import { openAgentBoard } from "../../lib/open-agent";
import type { Agent } from "../../lib/types";
import { useAgentStore } from "../../stores/agents";
import { useUIStore } from "../../stores/ui";
import { AgentSidebarIcon } from "../shell/agent-sidebar-status";
import { BackBarScreen } from "../shell/back-bar-screen";
import { PageContainer, PageHero } from "../shell/page-shell";
import { AgentMissionRow } from "./agent-mission-row";
import {
  type AgentHomeConversation,
  agentMissionSections,
} from "./agents-home-model";

/**
 * One agent's missions, pushed from the mobile Agents home list: the board's
 * three sections as a phone list (Needs you / Running / Done, the board's own
 * status mapping) with the archive folded behind a trailing row. Reads the
 * same one-sweep query the boards read; no fetch path of its own.
 *
 * Tapping an ACTIVE mission pushes its chat as a first-class nav level
 * (`lib/mission-chat.ts`) — the same push a board card performs — so back
 * pops straight from the chat to this screen. An ARCHIVED mission has no
 * chat-screen surface, so its rows keep the notification three-step (make
 * the agent current, push its board, publish the mission id): the board's
 * surface router swaps in its archive and opens the panel over it.
 */
export function AgentMissionsScreen({ agent }: { agent: Agent }) {
  const { t } = useTranslation(["shell", "dashboard"]);
  const openAgentsHome = useUIStore((s) => s.openAgentsHome);
  const agents = useAgentStore((s) => s.agents);
  const [archivedOpen, setArchivedOpen] = useState(false);

  const rosterPaths = useMemo(() => agents.map((a) => a.folderPath), [agents]);
  const { data: conversations } = useAllConversations(rosterPaths);
  const sections = useMemo(
    () => agentMissionSections(conversations, agent.folderPath),
    [conversations, agent.folderPath],
  );

  const openMission = (mission: AgentHomeConversation) => {
    openMissionChat(agent, mission.id);
  };
  const openArchivedMission = (mission: AgentHomeConversation) => {
    useAgentStore.getState().setCurrent(agent);
    openAgentBoard(agent.id);
    useUIStore.getState().setActivityPanelId(mission.id, { forceOpen: true });
  };

  const active = [
    { key: "needsYou", label: t("dashboard:columns.needsYou") },
    { key: "running", label: t("dashboard:columns.running") },
    { key: "done", label: t("dashboard:columns.done") },
  ] as const;
  const hasActive = active.some(({ key }) => sections[key].length > 0);

  return (
    <BackBarScreen
      backLabel={t("shell:agentsHome.title")}
      onBack={() => openAgentsHome(null, { nav: "retreat" })}
    >
      <div data-testid="agent-missions-screen" className="flex flex-col">
        <PageContainer className="shrink-0">
          <PageHero
            title={
              <span className="flex items-center gap-3">
                <AgentSidebarIcon
                  color={agent.color}
                  running={sections.running.length > 0}
                  runningLabel={t("shell:sidebar.runningCount", {
                    count: sections.running.length,
                  })}
                />
                <span className="truncate">{agent.name}</span>
              </span>
            }
            className="mb-4 px-3"
          />
        </PageContainer>
        <PageContainer className="pb-6">
          {!hasActive && sections.archived.length === 0 ? (
            <Empty className="border-0">
              <EmptyHeader>
                <EmptyTitle>
                  {t("shell:agentsHome.noMissions.title")}
                </EmptyTitle>
                <EmptyDescription>
                  {t("shell:agentsHome.noMissions.description")}
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <>
              {active.map(
                ({ key, label }) =>
                  sections[key].length > 0 && (
                    <section key={key} className="mb-4">
                      <h2 className="px-3 pb-1 text-sm font-medium text-ink">
                        {label}
                      </h2>
                      <ul>
                        {sections[key].map((mission) => (
                          <li key={mission.id}>
                            <AgentMissionRow
                              mission={mission}
                              onOpen={openMission}
                            />
                          </li>
                        ))}
                      </ul>
                    </section>
                  ),
              )}
              {sections.archived.length > 0 && (
                <section>
                  <button
                    type="button"
                    data-testid="agent-missions-archived-toggle"
                    aria-expanded={archivedOpen}
                    onClick={() => setArchivedOpen((open) => !open)}
                    className="flex min-h-11 w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium text-ink-muted transition-colors hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
                  >
                    {archivedOpen ? (
                      <ChevronDown className="size-4" />
                    ) : (
                      <ChevronRight className="size-4" />
                    )}
                    {t("shell:agentsHome.archived", {
                      count: sections.archived.length,
                    })}
                  </button>
                  {archivedOpen && (
                    <ul>
                      {sections.archived.map((mission) => (
                        <li key={mission.id}>
                          <AgentMissionRow
                            mission={mission}
                            onOpen={openArchivedMission}
                          />
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              )}
            </>
          )}
        </PageContainer>
      </div>
    </BackBarScreen>
  );
}
