import { useCallback, useEffect, useRef, useState } from "react";
import { providerAppearsConnected } from "../../components/shell/provider-reconnect-state";
import { analytics } from "../../lib/analytics";
import {
  loadCachedProviderStatuses,
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
  /**
   * True until we have a paintable snapshot. The cached last scan seeds it, so
   * this is already false on mount when that snapshot is non-empty (instant
   * paint, no skeleton); otherwise it flips on the first probe's resolution.
   */
  loading: boolean;
  /**
   * True once the first LIVE probe (`loadStatuses`) has resolved. The cached
   * snapshot makes `loading` false instantly, but a stale cache must not drive
   * decisions that need confirmed state (e.g. the browser's mount auto-select).
   */
  probed: boolean;
  loadStatuses(): Promise<void>;
  patchAuthState(providerId: string, authenticated: boolean): void;
}

/**
 * Status probing for the provider-connections layer, extracted from the old
 * `provider-settings.tsx`:
 *
 *  - The cards seed from the last scan's snapshot (`loadCachedProviderStatuses`)
 *    so they paint instantly with their last-known connected state instead of
 *    hiding behind a skeleton while the CLIs are probed; the probe below
 *    reconciles within seconds and persists the confirmed scan
 *    (`saveCachedProviderStatuses`) for the next visit.
 *  - `loadStatuses` probes every visible card in ONE engine round-trip
 *    (`checkAllStatuses`): on the new engine that collapses to a single
 *    `listProviders()` (HOU-650) rather than a probe per gateway. A card may
 *    front several gateways (OpenCode's Zen + Go share one key), so we probe the
 *    union of gateway ids and merge per card with `mergeGatewayStatus`.
 *  - The FIRST scan is a baseline so opening the hub with a provider already
 *    connected doesn't fire a fake `provider_configured` analytics event;
 *    subsequent scans track disconnected -> connected transitions.
 *  - `patchAuthState` optimistically flips a card after a known auth outcome
 *    (completed connect / sign-out) so it doesn't wait on the multi-second
 *    CLI re-probe; `loadStatuses` reconciles against the real probe.
 */
export function useProviderStatuses(
  visibleProviders: readonly ProviderInfo[],
): ProviderStatusState {
  const [statuses, setStatuses] = useState<Record<string, ProviderStatus>>(
    loadCachedProviderStatuses,
  );
  // A non-empty seeded snapshot means the cards already have something to paint,
  // so we're "ready" immediately; an empty cache keeps the skeleton until the
  // first probe resolves.
  const [loading, setLoading] = useState(
    () => Object.keys(statuses).length === 0,
  );
  const [probed, setProbed] = useState(false);
  const hasBaseline = useRef(false);
  const prevStatuses = useRef<Record<string, ProviderStatus>>({});

  // The active-space signals (C8). Provider connections are tenant data, so a
  // space switch must re-seed from the NEW space's snapshot and re-probe live.
  // The shell stays mounted across a switch (HOU-907), so this hook is NOT
  // remounted — the mount-time seed (the `useState` initializer above, which
  // reads the per-scope cache) and the mount probe (in `use-provider-connections`)
  // won't re-run. These refs drive both off the active workspace id instead;
  // they start AT the current id so a fresh mount doesn't double-seed/probe.
  const currentWorkspaceId = useWorkspaceStore((s) => s.current?.id ?? null);
  const agentsLoading = useAgentStore((s) => s.loading);
  const agentsLoaded = useAgentStore((s) => s.loaded);
  const seededWorkspaceIdRef = useRef(currentWorkspaceId);
  const probedWorkspaceIdRef = useRef(currentWorkspaceId);

  const loadStatuses = useCallback(async () => {
    const gatewayIds = [
      ...new Set(visibleProviders.flatMap((p) => providerGatewayIds(p))),
    ];
    const byId = await tauriProvider.checkAllStatuses(gatewayIds);
    if (scanIsUnreachable(gatewayIds, byId)) {
      // The engine was unreachable — the scan carries no information. Keep
      // painting the last-known snapshot (never overwrite it, or the persisted
      // cache, with "unknown"s) and skip transition analytics. `probed` still
      // flips so mount-time decisions proceed on the cached confirmed state.
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
        const wasConnected = prev ? providerAppearsConnected(prev) : false;
        const isConnected = cur ? providerAppearsConnected(cur) : false;
        if (!wasConnected && isConnected) {
          analytics.track("provider_configured", { provider: prov.id });
        }
      }
    }
    prevStatuses.current = next;
    hasBaseline.current = true;
    setLoading(false);
    setProbed(true);
    // Persist the confirmed scan so the NEXT visit paints instantly.
    saveCachedProviderStatuses(next);
  }, [visibleProviders]);

  // On a real active-space change, immediately swap to the new scope's cached
  // snapshot (keyed by active org — provider-status-cache.ts). This must NOT
  // keep painting the previous space's connected cards: an empty new-scope cache
  // flips back to the loading state until the live probe below reconciles. A new
  // space is also a fresh analytics baseline, so its first probe emits no
  // provider_configured transition against the prior space's snapshot.
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

  // Re-probe LIVE after a switch, but ONLY once the new space's agents have
  // loaded. The probe routes per-agent (last_agent_id + knownAgentIds in the
  // engine adapter), so firing it before `loadAgents` settles would hit the OLD
  // space's agent under the new org header — the sidebar switch handler awaits
  // loadAgents, which repopulates knownAgentIds for the new org. Gating on the
  // agent store's settled state closes that window.
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
