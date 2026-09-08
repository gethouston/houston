import { assistantApprovals } from "../assistant/approvals";
import { liveTurns } from "./live-turn";
import { missionFanout } from "./mission-fanout";

/**
 * Everything this process holds in memory KEYED BY AN AGENT ID, dropped in one
 * place when that id stops naming the agent it named.
 *
 * A local agent's id is its `<Workspace>/<Agent>` path, so a rename frees the
 * old id and a delete frees it for reuse: whatever the host still remembers
 * under it would be inherited by the next agent to hold that path. That is a
 * pending approval receipt answering for an agent the user never approved
 * anything for, a mission fan-out budget already spent, and a live-turn record
 * naming a conversation that no longer exists.
 */
export function forgetAgentState(agentId: string): void {
  liveTurns.forget(agentId);
  missionFanout.forget(agentId);
  assistantApprovals.clear(agentId);
}
