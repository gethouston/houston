import { useEffect } from "react";
import type { Agent } from "../../lib/types";
import { isMobileViewport } from "../../lib/viewport";
import { useUIStore } from "../../stores/ui";
import { AgentDetail } from "../permissions/agent-detail";
import { useAgentSettingsNav } from "./agent-settings-nav-store";
import { openPhoneTaskList } from "./open-phone-task-list";

export function AgentSettingsPane({ agent }: { agent: Agent }) {
  const requestedAgentId = useAgentSettingsNav((s) => s.requestedAgentId);
  const requestedSection = useAgentSettingsNav((s) => s.requestedSection);
  const clearRequested = useAgentSettingsNav((s) => s.clearRequested);
  const openAgentView = useUIStore((s) => s.openAgentView);
  const initialSection =
    requestedAgentId === agent.id ? (requestedSection ?? undefined) : undefined;

  useEffect(() => {
    if (requestedAgentId === agent.id) clearRequested();
  }, [agent.id, clearRequested, requestedAgentId]);
  // The phone's Tasks is the employee's task list, never this screen's board.
  const back = () => {
    if (isMobileViewport()) openPhoneTaskList(agent.id);
    else openAgentView(agent.id, "mission-control");
  };

  return (
    <AgentDetail
      agent={agent}
      backLabel={agent.name}
      initialSection={initialSection}
      onBack={back}
    />
  );
}
