import { useIsMobile } from "@houston-ai/core";
import { useEffect } from "react";
import { useCapabilities } from "../../hooks/use-capabilities";
import {
  resolveTeamSection,
  visibleAgentSections,
} from "../../lib/teams-model";
import { useAgentStore } from "../../stores/agents";
import { useUIStore } from "../../stores/ui";
import { useIsActiveView } from "../shell/keep-alive-views";
import { PageHeaderToolsProvider } from "../shell/page-header/page-header-tools";
import { AgentChrome } from "./agent-chrome";
import { AgentSettingsPane } from "./agent-settings-pane";
import { TEAM_STRIP_THRESHOLDS } from "./team-chrome-layout";
import { TeamFiles } from "./team-files";
import { TeamMissionControl } from "./team-mission-control";
import { TeamRoutines } from "./team-routines";

export function AgentView() {
  const agents = useAgentStore((store) => store.agents);
  const activeAgentId = useUIStore((s) => s.activeAgentId);
  const requestedSection = useUIStore((s) => s.agentSection);
  const { capabilities } = useCapabilities();
  const isMobile = useIsMobile();
  const isActive = useIsActiveView();
  const agent = agents.find((item) => item.id === activeAgentId);
  const sections = agent ? visibleAgentSections(capabilities, agent) : [];
  const section = resolveTeamSection(sections, requestedSection);
  // The phone's Tasks is the employee's task list on the AI Employees tab, so
  // a phone standing on this screen's Tasks (a resize, a restored entry) is
  // moved there rather than shown a desktop board.
  const phoneTasks =
    agent !== undefined && isMobile && section === "mission-control";
  useEffect(() => {
    if (phoneTasks && isActive && activeAgentId !== null)
      useUIStore.getState().openAgentsHome(activeAgentId, { nav: "replace" });
  }, [phoneTasks, isActive, activeAgentId]);
  if (!agent || phoneTasks) return null;
  const body =
    section === "settings" ? (
      <AgentSettingsPane agent={agent} />
    ) : section === "routines" ? (
      <TeamRoutines agent={agent} />
    ) : section === "files" ? (
      <TeamFiles agent={agent} />
    ) : (
      <TeamMissionControl agent={agent} />
    );

  return (
    <PageHeaderToolsProvider key={agent.id} thresholds={TEAM_STRIP_THRESHOLDS}>
      <div className="flex h-full flex-col overflow-hidden">
        {section !== "settings" && (
          <AgentChrome agent={agent} sections={sections} section={section} />
        )}
        <div className="min-h-0 flex-1">{body}</div>
      </div>
    </PageHeaderToolsProvider>
  );
}
