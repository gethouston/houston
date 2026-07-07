import type {
  IntegrationConnection,
  IntegrationToolkit,
} from "@houston-ai/engine-client";
import { useMemo } from "react";
import {
  useIntegrationConnections,
  useIntegrationToolkits,
} from "../../hooks/queries";
import { useCapabilities } from "../../hooks/use-capabilities";
import { canEditAgentGrants } from "../../lib/org-roles";
import { useAgentStore } from "../../stores/agents";
import {
  type AgentChip,
  appDisplay,
  groupConnectionsByToolkit,
  INTEGRATION_PROVIDER,
  toAgentChip,
  useAllAgentGrants,
  useCustomIntegrations,
  useMcpIntegrations,
  useProviderDisconnect,
} from "../integrations";
import type { ActiveAppCard, RecoveringAppRow } from "./connected-apps-list";
import {
  accountAgentIds,
  agentChipsFor,
  partitionConnections,
  unionAgentIds,
} from "./integrations-view-model";

export interface ConnectedApps {
  agentChips: AgentChip[];
  connData: IntegrationConnection[];
  catalogData: IntegrationToolkit[];
  bySlug: ReadonlyMap<string, IntegrationToolkit>;
  /** Toolkit slugs (== connectionIds) that are custom API-key integrations. */
  customSlugs: ReadonlySet<string>;
  /** The host serves the custom provider (drives the "add custom" CTA). */
  customEnabled: boolean;
  /** Toolkit slugs (== connectionIds) that are remote MCP server integrations. */
  mcpSlugs: ReadonlySet<string>;
  /** The host serves the mcp provider (drives the "add MCP server" CTA). */
  mcpEnabled: boolean;
  /** Disconnect an account, routed to its provider (composio, custom, or mcp). */
  disconnect: (connectionId: string) => void;
  chipById: ReadonlyMap<string, AgentChip>;
  /** `connectionId -> agent ids that have THAT account granted`. */
  accountAgents: ReadonlyMap<string, string[]>;
  /** `connectionId -> agent ids as a set`, for the detail sheet's switches. */
  activeAgentIdsByConnection: ReadonlyMap<string, ReadonlySet<string>>;
  /** One card per connected app; multiple accounts collapse into it. */
  activeCards: ActiveAppCard[];
  /** Pending / errored connections, kept PER ACCOUNT for recovery. */
  recoveringRows: RecoveringAppRow[];
  grantsSupported: boolean;
  canEdit: boolean;
  /** The catalog query alone is still fetching (the picker shows a loader). */
  catalogLoading: boolean;
  isLoading: boolean;
}

/**
 * All the derived read-model for the global Integrations page in one place: the
 * connection + catalog queries, the per-account grant map, the active apps
 * grouped one-card-per-app (each carrying the union of agents across its
 * accounts), and the per-account recovering rows. Kept out of the view so the
 * JSX stays a thin render of these values.
 */
export function useConnectedApps(): ConnectedApps {
  const agents = useAgentStore((s) => s.agents);
  const { capabilities } = useCapabilities();
  const connections = useIntegrationConnections(INTEGRATION_PROVIDER, true);
  const catalog = useIntegrationToolkits(INTEGRATION_PROVIDER, true);
  const custom = useCustomIntegrations(true);
  const mcp = useMcpIntegrations(true);

  const agentChips = useMemo(() => agents.map(toAgentChip), [agents]);
  const agentIds = useMemo(() => agents.map((a) => a.id), [agents]);
  const grants = useAllAgentGrants(agentIds, agentIds.length > 0);

  // Custom integrations render as normal app cards, so they merge into the
  // connection + display-catalog lists here; the BROWSE catalog stays composio
  // only (custom apps are added via the "add custom" CTA, not the OAuth grid).
  const composioConns = connections.data ?? [];
  const connData = useMemo(
    () => [...composioConns, ...custom.connections, ...mcp.connections],
    [composioConns, custom.connections, mcp.connections],
  );
  const catalogData = catalog.data ?? [];
  const displayCatalog = useMemo(
    () => [...catalogData, ...custom.toolkits, ...mcp.toolkits],
    [catalogData, custom.toolkits, mcp.toolkits],
  );
  const accountAgents = useMemo(
    () => accountAgentIds(grants.byAgent),
    [grants.byAgent],
  );
  const activeAgentIdsByConnection = useMemo(() => {
    const map = new Map<string, ReadonlySet<string>>();
    for (const [connectionId, ids] of accountAgents) {
      map.set(connectionId, new Set(ids));
    }
    return map;
  }, [accountAgents]);
  const bySlug = useMemo(
    () => new Map(displayCatalog.map((tk) => [tk.slug, tk])),
    [displayCatalog],
  );
  const chipById = useMemo(
    () => new Map(agentChips.map((c) => [c.id, c])),
    [agentChips],
  );

  const { activeCards, recoveringRows } = useMemo(() => {
    const { active, recovering } = partitionConnections(connData);
    const byName = (
      a: { app: { name: string } },
      b: { app: { name: string } },
    ) => a.app.name.localeCompare(b.app.name);
    return {
      activeCards: groupConnectionsByToolkit(active)
        .map(({ toolkit, connections: conns }) => ({
          toolkit,
          app: appDisplay(toolkit, bySlug.get(toolkit)),
          connections: conns,
          chips: agentChipsFor(
            unionAgentIds(
              conns.map((c) => c.connectionId),
              accountAgents,
            ),
            chipById,
          ),
        }))
        .sort(byName),
      recoveringRows: recovering
        .map((c) => ({
          connection: c,
          app: appDisplay(c.toolkit, bySlug.get(c.toolkit)),
        }))
        .sort(byName),
    };
  }, [connData, bySlug, accountAgents, chipById]);

  // A single boolean gates every toggle in the detail sheet, so editing is
  // allowed only when the caller can manage grants for every agent shown
  // (single-player has no roles and is always editable; the gateway enforces).
  const canEdit = agents.every((a) => canEditAgentGrants(capabilities, a));

  // Disconnect routes to the owning provider (composio / custom / mcp), keyed by
  // connectionId; the shared hook holds the three-way routing.
  const disconnect = useProviderDisconnect(custom.slugs, mcp.slugs);

  return {
    agentChips,
    connData,
    catalogData,
    bySlug,
    customSlugs: custom.slugs,
    customEnabled: custom.supported,
    mcpSlugs: mcp.slugs,
    mcpEnabled: mcp.supported,
    disconnect,
    chipById,
    accountAgents,
    activeAgentIdsByConnection,
    activeCards,
    recoveringRows,
    grantsSupported: grants.supported,
    canEdit,
    catalogLoading: catalog.isLoading,
    // Gate the list (and its per-agent toggles) on the grant queries too, not
    // just connections + catalog: rendering a toggle before an agent's grant set
    // has loaded lets a click PUT a replace-set built from an empty base and
    // silently wipe that agent's real grants (and flashes "No agents yet").
    isLoading:
      connections.isLoading ||
      catalog.isLoading ||
      grants.isLoading ||
      custom.isLoading ||
      mcp.isLoading,
  };
}
