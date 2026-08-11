import { useMemo } from "react";
import { useAllConversations } from "../../hooks/queries/use-conversations";
import { useIntegrationConnections } from "../../hooks/queries/use-integrations";
import { useCanCreateAgents } from "../../hooks/use-can-create-agents";
import { useCapabilities } from "../../hooks/use-capabilities";
import { useProviderStatuses } from "../../hooks/use-provider-statuses";
import { providerIsConnected } from "../../lib/provider-connection.ts";
import { useAgentStore } from "../../stores/agents";
import { INTEGRATION_PROVIDER } from "../integrations/model";
import { integrationsAvailable } from "./missions/onboarding-flow";

const EMPTY_ROWS: never[] = [];

/**
 * The in-app onboarding's world signals, all read from queries and stores the
 * app maintains anyway (shared cache keys — the tutorial adds no fetches of
 * its own):
 *
 * - AI connected — the ONE shared provider derivation (HOU-979), invalidated
 *   on login events.
 * - Integration connected — the user-level Composio connections list, which
 *   the real connect flow refreshes itself.
 * - Agent roster — the agents store, which grows synchronously on create.
 * - Missions — the cross-agent conversations aggregate; the sidebar mounts
 *   the same key, and the board send invalidates it.
 * - Gates — whether this deployment serves integrations at all, and whether
 *   this caller may create agents (a plain org member may not).
 */
export function useInAppOnboardingSignals() {
  const { statuses } = useProviderStatuses();
  const aiConnected = Object.values(statuses).some(providerIsConnected);
  const connectedProviderId =
    Object.entries(statuses).find(([, s]) => providerIsConnected(s))?.[0] ??
    "anthropic";

  const integrationConnections = useIntegrationConnections(
    INTEGRATION_PROVIDER,
    true,
  );
  const integrationConnected = (integrationConnections.data ?? []).some(
    (c) => c.status === "active",
  );

  const { capabilities } = useCapabilities();
  const integrationsOn = integrationsAvailable(capabilities);
  const { canCreate: canCreateAgents } = useCanCreateAgents();

  const agents = useAgentStore((s) => s.agents);
  const agentPaths = useMemo(() => agents.map((a) => a.folderPath), [agents]);
  const conversations = useAllConversations(agentPaths);
  const missionRows = conversations.data ?? EMPTY_ROWS;
  // Settled = real data for the CURRENT roster key, no refetch in flight; an
  // in-flight sweep must never seed a baseline (it reads as zero missions).
  const missionRowsSettled =
    conversations.data !== undefined && !conversations.isFetching;

  // The email toolkit the guided first task can run through, if one is
  // connected — same order preference the legacy email mission offered.
  const emailToolkit = useMemo(() => {
    const active = new Set(
      (integrationConnections.data ?? [])
        .filter((c) => c.status === "active")
        .map((c) => c.toolkit),
    );
    if (active.has("gmail")) return { toolkit: "gmail", label: "Gmail" };
    if (active.has("outlook")) return { toolkit: "outlook", label: "Outlook" };
    return null;
  }, [integrationConnections.data]);

  return {
    aiConnected,
    connectedProviderId,
    integrationConnected,
    integrationsOn,
    canCreateAgents,
    agentCount: agents.length,
    missionRows,
    missionRowsSettled,
    missionCount: missionRows.length,
    emailToolkit,
  };
}
