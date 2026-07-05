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
  INTEGRATION_PROVIDER,
  toAgentChip,
  useAllAgentGrants,
} from "../integrations";
import type { ActiveAppRow, RecoveringAppRow } from "./connected-apps-list";
import {
  agentChipsFor,
  partitionConnections,
  toolkitAgentIds,
} from "./integrations-view-model";

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
  canEdit: boolean;
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

  // A single boolean gates every toggle in the detail sheet, so editing is
  // allowed only when the caller can manage grants for every agent shown
  // (single-player has no roles and is always editable; the gateway enforces).
  const canEdit = agents.every((a) => canEditAgentGrants(capabilities, a));

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
    canEdit,
    catalogLoading: catalog.isLoading,
    // Gate the list (and its per-agent toggles) on the grant queries too, not
    // just connections + catalog: rendering a toggle before an agent's grant set
    // has loaded lets a click PUT a replace-set built from an empty base and
    // silently wipe that agent's real grants (and flashes "No agents yet").
    isLoading: connections.isLoading || catalog.isLoading || grants.isLoading,
  };
}
