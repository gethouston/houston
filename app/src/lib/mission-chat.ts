/**
 * "Push this mission's chat", performed — the imperative binding for the
 * phone's first-class chat screen (`stores/ui.ts` `openMissionChat`), bound
 * to the stores the way `open-agent.ts` binds `agent-nav.ts`. Every phone
 * entry point routes through here — a board card, an Agents-home mission row,
 * the compose flow — so adopting the agent as current and pushing the screen
 * can never come apart.
 */

import { useAgentStore } from "../stores/agents.ts";
import { useUIStore } from "../stores/ui.ts";
import type { NavMode } from "./nav-stack.ts";
import type { Agent } from "./types.ts";

/** Push `agent`'s chat on `missionId` (`null` = an empty draft chat). */
export function openMissionChat(
  agent: Agent,
  missionId: string | null,
  opts?: { nav?: NavMode },
): void {
  useAgentStore.getState().setCurrent(agent);
  useUIStore.getState().openMissionChat(agent.id, missionId, opts);
}

/**
 * The board-card binding: resolve the card's owning agent from the roster by
 * its folder path and push the chat. Answers whether it could — a card whose
 * agent left the roster mid-render falls back to the caller's desktop
 * selection path instead of a dead tap.
 */
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
