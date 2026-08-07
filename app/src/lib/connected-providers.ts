/**
 * "Which providers has this user actually connected?" as ONE derivation, for
 * the surfaces that must answer it outside a chat panel (the routine, skill and
 * custom-integration setup-chat kickoffs).
 *
 * The answer is deliberately three-valued, and `null` is the load-bearing case:
 * a scan that is still loading (`isLoading`), that FAILED (`isError` — an
 * unreachable engine resolves every provider as `unknown`, HOU-1153), or that
 * carries any unconfirmable probe (HOU-979) is NOT evidence that nothing is
 * connected. Handing an empty list to a caller in that state would let it act
 * on a fabricated "you have nothing connected"; `null` says "we could not
 * check", and every caller must defer rather than switch.
 */

import {
  type ProviderConnectionStatus,
  providerConnectionState,
  providerIsConnected,
} from "./provider-connection.ts";
import { providerName } from "./providers.ts";
import type { ConnectedProviderRef } from "./setup-chat-prompt-shared.ts";

/** A status row as the provider scan reports it (id + the connection fields). */
export interface ScannedProviderStatus extends ProviderConnectionStatus {
  provider: string;
}

/** The provider scan's result, exactly as `useProviderStatuses` returns it. */
export interface ProviderScan {
  statuses: Record<string, ScannedProviderStatus>;
  isLoading: boolean;
  isError: boolean;
}

/**
 * The user's CONFIRMED connected providers, or `null` when the scan cannot
 * answer (see the module doc). Order follows the scan so the kickoff prompts
 * keep listing providers as the engine reported them.
 */
export function confirmedConnectedProviders(
  scan: ProviderScan,
): ConnectedProviderRef[] | null {
  const values = Object.values(scan.statuses);
  const unconfirmable = values.some(
    (status) => providerConnectionState(status, false) === "checking",
  );
  if (scan.isLoading || scan.isError || unconfirmable) return null;
  return values
    .filter((status) => providerIsConnected(status))
    .map((status) => ({
      id: status.provider,
      name: providerName(status.provider),
    }));
}

/** The ids of a (possibly unconfirmable) connected set, preserving `null`. */
export function connectedProviderIds(
  connected: readonly ConnectedProviderRef[] | null,
): string[] | null {
  return connected ? connected.map((provider) => provider.id) : null;
}
