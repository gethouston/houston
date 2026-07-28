import { useCallback } from "react";
import {
  type ProviderConnectionState,
  providerConnectionState,
} from "../../lib/provider-connection";
import type { ProviderInfo } from "../../lib/providers";
import type { ProviderStatus } from "../../lib/tauri";

/** The per-provider reader every hub surface asks the connections layer. */
export interface ProviderConnectionReaders {
  connectionState(p: ProviderInfo): ProviderConnectionState;
}

/**
 * Turn the probed status map into the hub's connection reader, derived from the
 * ONE shared derivation (`lib/provider-connection.ts`, HOU-979).
 *
 * Kept beside the probing hook rather than inline in `use-provider-connections`
 * so that file stays under the size budget.
 *
 * ONE reader, deliberately: a boolean sibling shipped alongside this and every
 * surface that reached for it collapsed the third state — an `unknown` probe
 * grouped as "available to connect" and drew a Connect CTA for an account that
 * may well be signed in. A missing status while `loading`, and an `unknown`
 * probe, both land on `checking`: visible, neutral, non-actionable. Never a
 * false Connected, never a Connect button on an unconfirmable account.
 */
export function useConnectionReaders(
  statuses: Record<string, ProviderStatus | undefined>,
  loading: boolean,
): ProviderConnectionReaders {
  const connectionState = useCallback(
    (p: ProviderInfo): ProviderConnectionState =>
      providerConnectionState(statuses[p.id], loading),
    [statuses, loading],
  );
  return { connectionState };
}
