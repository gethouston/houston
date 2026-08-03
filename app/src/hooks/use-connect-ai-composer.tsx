/**
 * Wires the connect-AI composer replacement: reads the remaining world signals
 * (catalog, capabilities, active space), applies the pure rule
 * (`shouldReplaceComposerWithConnectAi`), and returns the node the chat panel
 * hands to `composerOverride` in `replace` mode.
 *
 * The connection counts come in as PROPS rather than being re-derived here: the
 * chat panel already computes them from the ONE shared derivation
 * (`providerIsConnected` / `providerConnectionState`), and a second derivation
 * is exactly how two surfaces drift apart about whether a provider is connected.
 *
 * Reactivity is free: `useProviderStatuses` (whose settled counts feed this) is
 * a TanStack query invalidated on `ProviderLoginComplete`, so connecting a
 * provider re-probes, the count goes above zero, and the composer returns with
 * no manual wiring.
 */

import { type ReactNode, useCallback, useMemo } from "react";
import { ChatConnectAiEmptyState } from "../components/chat-connect-ai-empty-state.tsx";
import { pickerEmptyState } from "../components/chat-model-selector-labels.ts";
import { shouldReplaceComposerWithConnectAi } from "../lib/composer-connect-ai.ts";
import { isTeamWorkspace } from "../lib/space-id.ts";
import { AI_HUB_VIEW_ID } from "../lib/top-level-views.ts";
import { useUIStore } from "../stores/ui";
import { useWorkspaceStore } from "../stores/workspaces";
import { useCapabilities } from "./use-capabilities";
import { useProviderCatalog } from "./use-provider-catalog";

export interface ConnectAiComposer {
  /** True while the empty state stands in for the composer. */
  active: boolean;
  /** The replacement node, or null when the normal composer stands. */
  node: ReactNode | null;
}

export function useConnectAiComposer(opts: {
  /** Providers confirmed connected. */
  connectedCount: number;
  /** Providers whose probe is still inconclusive. */
  checkingCount: number;
  /** `useProviderStatuses().isLoading`. */
  statusesLoading: boolean;
  /** `useProviderStatuses().isError`. */
  statusesError: boolean;
}): ConnectAiComposer {
  const { connectedCount, checkingCount, statusesLoading, statusesError } =
    opts;
  const { capabilities, isLoading: capabilitiesLoading } = useCapabilities();
  const { isReady: catalogReady } = useProviderCatalog();
  const workspaceId = useWorkspaceStore((s) => s.current?.id ?? null);
  const setViewMode = useUIStore((s) => s.setViewMode);

  // Same decision the picker's empty state makes, from the same helper: which
  // story to tell, and whether this viewer may act on it at all.
  const { variant, canConnect } = pickerEmptyState({
    teamSpace: workspaceId ? isTeamWorkspace(workspaceId) : false,
    capabilities,
    capabilitiesLoaded: !capabilitiesLoading,
  });

  const active = shouldReplaceComposerWithConnectAi({
    statusesLoading,
    statusesError,
    connectedCount,
    checkingCount,
    catalogReady,
    capabilitiesLoaded: !capabilitiesLoading,
  });

  const goToAiHub = useCallback(
    () => setViewMode(AI_HUB_VIEW_ID),
    [setViewMode],
  );

  const node = useMemo<ReactNode | null>(
    () =>
      active ? (
        <ChatConnectAiEmptyState
          variant={variant}
          onConnect={canConnect ? goToAiHub : undefined}
        />
      ) : null,
    [active, variant, canConnect, goToAiHub],
  );

  return { active, node };
}
