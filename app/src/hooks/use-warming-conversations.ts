import {
  type WarmingAgentRef,
  type WarmingConversation,
  warmingConversations,
} from "../lib/warming-board-rows";
import { useAgentProvisioningStore } from "../stores/agent-provisioning";

const NONE: WarmingConversation[] = [];

export function useWarmingConversations(
  agents: readonly WarmingAgentRef[],
): WarmingConversation[] {
  const provisioning = useAgentProvisioningStore((s) => s.provisioning);
  useAgentProvisioningStore((s) => s.sendsVersion);
  const rows = warmingConversations(agents, provisioning);
  return rows.length > 0 ? rows : NONE;
}
