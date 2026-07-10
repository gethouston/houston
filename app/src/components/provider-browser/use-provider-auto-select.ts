/**
 * The {@link ProviderBrowser}'s auto-advance watcher: it observes the
 * connect-status snapshots for a not-connected -> connected transition and hands
 * the newly-connected provider + model to `onSelect` (resolved as
 * `provider.defaultModel || status.active_model`). The status hook already fires
 * `provider_configured` analytics, so this does not.
 *
 * Gated on `probed`, not `ready`: `ready` flips true off the cached last-scan
 * snapshot, and a stale cached "connected" must never auto-advance onboarding or
 * dismiss the migration gate before a live probe confirms it. When `selectOnMount`
 * is true an already-connected provider detected on the FIRST status load also
 * fires (the user restarted onboarding).
 *
 * Extracted from `provider-browser.tsx` so the component stays under the 200-line
 * limit and this self-contained behavior lives on its own.
 */

import { useEffect, useRef } from "react";
import type { ProviderConnections } from "../../hooks/use-provider-connections";
import type { ProviderInfo } from "../../lib/providers";
import { resolveAutoSelect, type StatusSnapshot } from "./auto-select";

export function useProviderAutoSelect(
  connections: ProviderConnections,
  providers: readonly ProviderInfo[],
  onSelect: ((providerId: string, model: string) => void) | undefined,
  selectOnMount: boolean,
): void {
  const prevStatuses = useRef<StatusSnapshot | null>(null);
  useEffect(() => {
    if (!onSelect || !connections.probed) return;
    const selection = resolveAutoSelect(
      prevStatuses.current,
      connections.statuses,
      providers,
      { selectOnMount },
    );
    prevStatuses.current = connections.statuses;
    if (selection) onSelect(selection.providerId, selection.model);
  }, [
    onSelect,
    connections.probed,
    connections.statuses,
    providers,
    selectOnMount,
  ]);
}
