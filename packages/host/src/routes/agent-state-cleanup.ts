import { assistantApprovals } from "../assistant/approvals";
import { liveTurns } from "./live-turn";
import { missionFanout } from "./mission-fanout";

export function forgetAgentState(agentId: string): void {
  liveTurns.forget(agentId);
  missionFanout.forget(agentId);
  assistantApprovals.clear(agentId);
}
