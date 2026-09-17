import {
  customIntegrationScope,
  resolveCustomTransportAgent,
} from "@houston/sdk";
import { useMemo } from "react";
import { useAgentStore } from "../../stores/agents";
import { useUIStore } from "../../stores/ui";
import { useCapabilities } from "../use-capabilities";

/** Where custom integrations live here — see `customIntegrationScope`. */
export function useCustomIntegrationScope() {
  const { capabilities } = useCapabilities();
  return customIntegrationScope(capabilities);
}

/**
 * The transport agent for custom-integration calls from surfaces WITHOUT an
 * ambient agent (the global Integrations page, chat brand resolution). The
 * hosted gateway proxies ONLY the per-agent custom routes (HOU-823) — the
 * top-level form 404s there and the surface would silently hide. On a shared
 * host any agent's form returns the same list, so the first agent's does; on
 * a per-agent deployment the agent IS the list (PRODUCT-1773), so the user's
 * pick on the Integrations page (then the agent being set up) decides — see
 * `resolveCustomTransportAgent`. The top-level fallback covers a direct host
 * with no agents yet.
 */
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
