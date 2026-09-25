import {
  type AgentWarmup,
  agentWarmup,
} from "../lib/agent-provisioning/warmup";
import { useAgentProvisioningStore } from "../stores/agent-provisioning";

/** The live warm-up of one AI Employee; `ready` when there is none. */
export function useAgentWarmup(agentPath: string | null): AgentWarmup {
  return useAgentProvisioningStore((s) =>
    agentPath === null
      ? "ready"
      : agentWarmup(Object.values(s.provisioning), agentPath),
  );
}
