import { useEffect } from "react";
import type { TeamView } from "../../lib/teams-model";
import type { Agent } from "../../lib/types";
import { useUIStore } from "../../stores/ui";
import { AgentDetail } from "../permissions/agent-detail";
import { useAgentSettingsNav } from "./agent-settings-nav-store";

export function AgentSettingsPane({
  team,
  agent,
}: {
  team: TeamView;
  agent: Agent;
}) {
  const requestedAgentId = useAgentSettingsNav((s) => s.requestedAgentId);
  const requestedSection = useAgentSettingsNav((s) => s.requestedSection);
  const clearRequested = useAgentSettingsNav((s) => s.clearRequested);
  const openTeamView = useUIStore((s) => s.openTeamView);
  const initialSection =
    requestedAgentId === agent.id ? (requestedSection ?? undefined) : undefined;

  useEffect(() => {
    if (requestedAgentId === agent.id) clearRequested();
  }, [agent.id, clearRequested, requestedAgentId]);

  return (
    <AgentDetail
      agent={agent}
      backLabel={agent.name}
      initialSection={initialSection}
      onBack={() =>
        openTeamView(team.id, "mission-control", {
          agentFilter: agent.id,
          agentFocus: true,
        })
      }
    />
  );
}
