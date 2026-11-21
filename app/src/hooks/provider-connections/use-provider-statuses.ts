import { useCallback, useEffect, useRef, useState } from "react";
import { analytics } from "../../lib/analytics";
import { providerIsConnected } from "../../lib/provider-connection";
import {
  activeProviderStatusScope,
  loadCachedProviderStatuses,
  providerProbeScopeChanged,
  saveCachedProviderStatuses,
} from "../../lib/provider-status-cache";
import { type ProviderInfo, providerGatewayIds } from "../../lib/providers";
import {
  mergeGatewayStatus,
  type ProviderStatus,
  tauriProvider,
} from "../../lib/tauri";
import { useAgentStore } from "../../stores/agents";
import { useWorkspaceStore } from "../../stores/workspaces";
import { scanIsUnreachable } from "./unreachable-scan";

export interface ProviderStatusState {
  statuses: Record<string, ProviderStatus>;
  loading: boolean;
  probed: boolean;
  loadStatuses(): Promise<void>;
  patchAuthState(providerId: string, authenticated: boolean): void;
}

export function useProviderStatuses(
  visibleProviders: readonly ProviderInfo[],
): ProviderStatusState {
  const [statuses, setStatuses] = useState<Record<string, ProviderStatus>>(
    loadCachedProviderStatuses,
  );
  const [loading, setLoading] = useState(
    () => Object.keys(statuses).length === 0,
  );
  const [probed, setProbed] = useState(false);
  const hasBaseline = useRef(false);
  const prevStatuses = useRef<Record<string, ProviderStatus>>({});

  const currentWorkspaceId = useWorkspaceStore((s) => s.current?.id ?? null);
  const agentsLoading = useAgentStore((s) => s.loading);
  const agentsLoaded = useAgentStore((s) => s.loaded);
  const seededWorkspaceIdRef = useRef(currentWorkspaceId);
  const probedWorkspaceIdRef = useRef(currentWorkspaceId);

  const loadStatuses = useCallback(async () => {
    const gatewayIds = [
      ...new Set(visibleProviders.flatMap((p) => providerGatewayIds(p))),
    ];
    const scope = activeProviderStatusScope();
    const byId = await tauriProvider.checkAllStatuses(gatewayIds);
    if (providerProbeScopeChanged(scope)) return;
    if (scanIsUnreachable(gatewayIds, byId)) {
      setLoading(false);
      setProbed(true);
      return;
    }
    const next: Record<string, ProviderStatus> = {};
    for (const p of visibleProviders) {
      const merged = mergeGatewayStatus(providerGatewayIds(p), byId);
      if (merged) next[p.id] = merged;
    }
    setStatuses((prev) => ({ ...prev, ...next }));
    if (hasBaseline.current) {
      for (const prov of visibleProviders) {
        const prev = prevStatuses.current[prov.id];
        const cur = next[prov.id];
        const wasConnected = providerIsConnected(prev);
        const isConnected = providerIsConnected(cur);
        if (!wasConnected && isConnected) {
          analytics.track("provider_configured", { provider: prov.id });
        }
      }
    }
    prevStatuses.current = next;
    hasBaseline.current = true;
    setLoading(false);
    setProbed(true);
    saveCachedProviderStatuses(next);
  }, [visibleProviders]);

  useEffect(() => {
    if (seededWorkspaceIdRef.current === currentWorkspaceId) return;
    seededWorkspaceIdRef.current = currentWorkspaceId;
    const seed = loadCachedProviderStatuses();
    setStatuses(seed);
    setLoading(Object.keys(seed).length === 0);
    setProbed(false);
    prevStatuses.current = {};
    hasBaseline.current = false;
  }, [currentWorkspaceId]);

  useEffect(() => {
    if (probedWorkspaceIdRef.current === currentWorkspaceId) return;
    if (!agentsLoaded || agentsLoading) return;
    probedWorkspaceIdRef.current = currentWorkspaceId;
    void loadStatuses();
  }, [currentWorkspaceId, agentsLoaded, agentsLoading, loadStatuses]);

  const patchAuthState = useCallback(
    (providerId: string, authenticated: boolean) => {
      setStatuses((prev) => {
        const existing = prev[providerId];
        return {
          ...prev,
          [providerId]: {
            provider: existing?.provider ?? providerId,
            cli_name: existing?.cli_name ?? "",
            cli_installed: existing?.cli_installed ?? true,
            auth_state: authenticated ? "authenticated" : "unauthenticated",
            authenticated,
          },
        };
      });
    },
    [],
  );

  return { statuses, loading, probed, loadStatuses, patchAuthState };
}
