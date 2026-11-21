import { useAgentStore } from "../stores/agents.ts";
import { useUIStore } from "../stores/ui.ts";
import type { NavMode } from "./nav-stack.ts";
import type { Agent } from "./types.ts";

export function openMissionChat(
  agent: Agent,
  missionId: string | null,
  opts?: { nav?: NavMode },
): void {
  useAgentStore.getState().setCurrent(agent);
  useUIStore.getState().openMissionChat(agent.id, missionId, opts);
}

export function openMissionChatForPath(
  agentPath: string | undefined,
  missionId: string,
): boolean {
  const agent = useAgentStore
    .getState()
    .agents.find((a) => a.folderPath === agentPath);
  if (!agent) return false;
  openMissionChat(agent, missionId);
  return true;
}
