/**
 * Which providers the AI hub shows, split into "yours" and "available" and
 * narrowed by the page's ONE search query. Lifted out of `AiHubView` so the page
 * stays a layout and this set of derivations lives in one place.
 *
 * The user's own providers ride the strip; only the ones we CONFIRMED are not
 * connected browse in the tab, so the tab's `+` connect is never offered for an
 * account that may already be signed in (HOU-979). A provider whose probe came
 * back unconfirmable rides the strip with its own checking dot. Until the first
 * status probe resolves everything counts as available (the pane holds a skeleton
 * and the counts stay hidden meanwhile).
 */

import { useMemo } from "react";
import { useCapabilities } from "../../hooks/use-capabilities";
import type { ProviderConnections } from "../../hooks/use-provider-connections";
import { newEngineActive } from "../../lib/engine";
import { osIsTauri } from "../../lib/os-bridge";
import {
  EMPTY_PROVIDER_CAPABILITIES,
  getConnectProviders,
  type ProviderInfo,
} from "../../lib/providers";
import { searchProviders } from "../provider-browser/provider-filtering";
import {
  groupProviders,
  providerOwnedSide,
} from "../provider-browser/provider-grouping";

export interface HubProviders {
  /** Confirmed-not-connected providers: the browse tab's catalog. */
  available: ProviderInfo[];
  /** The user's own side (connected + still checking): the Connected strip. */
  owned: ProviderInfo[];
  /** `owned` narrowed by the page query. */
  connectedMatches: ProviderInfo[];
  /** `available` narrowed by the page query. */
  availableMatches: ProviderInfo[];
  /** Whether the page query is active (uncaps the strip, switches the chips). */
  searching: boolean;
}

export function useHubProviders(
  connections: ProviderConnections,
  query: string,
): HubProviders {
  const { capabilities } = useCapabilities();
  const newEngine = newEngineActive();
  const providerCapabilities =
    capabilities ?? (newEngine ? EMPTY_PROVIDER_CAPABILITIES : undefined);
  // The connect cards this deployment can show (merged OpenCode account, engine
  // + capability gated) — the same set the catalog counts its offers from.
  const connectProviders = useMemo(
    () =>
      getConnectProviders({
        newEngine,
        desktop: osIsTauri(),
        capabilities: providerCapabilities,
      }),
    [newEngine, providerCapabilities],
  );
  const groups = useMemo(
    () => groupProviders(connectProviders, connections.connectionState),
    [connectProviders, connections.connectionState],
  );
  const available = groups.available;
  const owned = useMemo(() => providerOwnedSide(groups), [groups]);

  const searching = query.trim() !== "";
  const connectedMatches = useMemo(
    () => searchProviders(owned, query),
    [owned, query],
  );
  const availableMatches = useMemo(
    () => searchProviders(available, query),
    [available, query],
  );

  return { available, owned, connectedMatches, availableMatches, searching };
}
