import type {
  IntegrationConnection,
  IntegrationToolkit,
} from "@houston-ai/engine-client";
import { useMemo } from "react";
import {
  useIntegrationConnections,
  useIntegrationToolkits,
} from "../../hooks/queries";
import { useAllAgentGrants } from "../../hooks/queries/use-all-agent-grants";
import { useCapabilities } from "../../hooks/use-capabilities";
import { canEditAgentGrants } from "../../lib/agent-access";
import { useAgentStore } from "../../stores/agents";
import { type AgentChip, toAgentChip } from "./agent-chip";
import { type AppDisplay, appDisplay } from "./app-display";
import {
  agentChipsFor,
  partitionConnections,
  toolkitAgentIds,
} from "./connected-apps-model";
import { INTEGRATION_PROVIDER } from "./model";

/** An active (usable) connection with its display + the agents that use it. */
export interface ActiveAppRow {
  connection: IntegrationConnection;
  app: AppDisplay;
  chips: AgentChip[];
}

/** A pending / errored connection with its display, shown for recovery. */
export interface RecoveringAppRow {
  connection: IntegrationConnection;
  app: AppDisplay;
}

export interface ConnectedApps {
  agentChips: AgentChip[];
  connData: IntegrationConnection[];
  catalogData: IntegrationToolkit[];
  bySlug: ReadonlyMap<string, IntegrationToolkit>;
  chipById: ReadonlyMap<string, AgentChip>;
  grantMap: ReadonlyMap<string, string[]>;
  activeRows: ActiveAppRow[];
  recoveringRows: RecoveringAppRow[];
  grantsSupported: boolean;
  /** Ids of the agents whose grants this caller may edit (per role/assignment). */
  editableAgentIds: ReadonlySet<string>;
  /** The catalog query alone is still fetching (the picker shows a loader). */
  catalogLoading: boolean;
  isLoading: boolean;
}

/**
 * All the derived read-model for the global Integrations page in one place:
 * the connection + catalog queries, the per-agent grant map, and the sorted
 * active / recovering rows (each active row carrying the agents that use it).
 * Kept out of the view so the JSX stays a thin render of these values.
 */
export function useConnectedApps(): ConnectedApps {
  const agents = useAgentStore((s) => s.agents);
  const { capabilities } = useCapabilities();
  const connections = useIntegrationConnections(INTEGRATION_PROVIDER, true);
  const catalog = useIntegrationToolkits(INTEGRATION_PROVIDER, true);

  const agentChips = useMemo(() => agents.map(toAgentChip), [agents]);
  const agentIds = useMemo(() => agents.map((a) => a.id), [agents]);
  const grants = useAllAgentGrants(agentIds, agentIds.length > 0);

  const connData = connections.data ?? [];
  const catalogData = catalog.data ?? [];
  const grantMap = useMemo(
    () => toolkitAgentIds(grants.byAgent),
    [grants.byAgent],
  );
  const bySlug = useMemo(
    () => new Map(catalogData.map((tk) => [tk.slug, tk])),
    [catalogData],
  );
  const chipById = useMemo(
    () => new Map(agentChips.map((c) => [c.id, c])),
    [agentChips],
  );

  const { activeRows, recoveringRows } = useMemo(() => {
    const { active, recovering } = partitionConnections(connData);
    const byName = (
      a: { app: { name: string } },
      b: { app: { name: string } },
    ) => a.app.name.localeCompare(b.app.name);
    return {
      activeRows: active
        .map((c) => ({
          connection: c,
          app: appDisplay(c.toolkit, bySlug.get(c.toolkit)),
          chips: agentChipsFor(grantMap.get(c.toolkit) ?? [], chipById),
        }))
        .sort(byName),
      recoveringRows: recovering
        .map((c) => ({
          connection: c,
          app: appDisplay(c.toolkit, bySlug.get(c.toolkit)),
        }))
        .sort(byName),
    };
  }, [connData, bySlug, grantMap, chipById]);

  // The agents whose grants this caller may edit (single-player: all; multiplayer:
  // the assigned ones). Settings > Connected accounts uses this to gate each
  // per-agent toggle; the gateway is the real enforcer.
  const editableAgentIds = useMemo(
    () =>
      new Set(
        agents
          .filter((a) => canEditAgentGrants(capabilities, a))
          .map((a) => a.id),
      ),
    [agents, capabilities],
  );

  return {
    agentChips,
    connData,
    catalogData,
    bySlug,
    chipById,
    grantMap,
    activeRows,
    recoveringRows,
    grantsSupported: grants.supported,
    editableAgentIds,
    catalogLoading: catalog.isLoading,
    // Gate the list (and its per-agent toggles) on the grant queries too, not
    // just connections + catalog: rendering a toggle before an agent's grant set
    // has loaded lets a click PUT a replace-set built from an empty base and
    // silently wipe that agent's real grants (and flashes "No agents yet").
    isLoading: connections.isLoading || catalog.isLoading || grants.isLoading,
  };
}
