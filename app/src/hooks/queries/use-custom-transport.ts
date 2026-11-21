import {
  customIntegrationScope,
  resolveCustomTransportAgent,
} from "@houston/sdk";
import { useMemo } from "react";
import { useAgentStore } from "../../stores/agents";
import { useUIStore } from "../../stores/ui";
import { useCapabilities } from "../use-capabilities";

export function useCustomIntegrationScope() {
  const { capabilities } = useCapabilities();
  return customIntegrationScope(capabilities);
}

export function useCustomTransportAgentId() {
  const scope = useCustomIntegrationScope();
  const agents = useAgentStore((s) => s.agents);
  const currentAgentId = useAgentStore((s) => s.current?.id ?? null);
  const pickedAgentId = useUIStore((s) => s.customIntegrationsAgentId);
  const setupAgentId = useUIStore((s) => s.integrationSetupChatAgentId);
  return useMemo(
    () =>
      resolveCustomTransportAgent({
        scope,
        agentIds: agents.map((a) => a.id),
        setupAgentId,
        pickedAgentId,
        currentAgentId,
      }),
    [scope, agents, setupAgentId, pickedAgentId, currentAgentId],
  );
}
