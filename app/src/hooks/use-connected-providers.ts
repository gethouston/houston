import { confirmedConnectedProviders } from "../lib/connected-providers";
import type { ConnectedProviderRef } from "../lib/setup-chat-prompt-shared";
import { useProviderStatuses } from "./use-provider-statuses";

/**
 * The user's confirmed connected providers, or `null` while that cannot be
 * confirmed (see `confirmedConnectedProviders`). Reads the shared provider-status
 * query, so mounting this in several setup surfaces costs no extra round-trip.
 */
export function useConnectedProviders(): ConnectedProviderRef[] | null {
  const { statuses, isLoading, isError } = useProviderStatuses();
  return confirmedConnectedProviders({ statuses, isLoading, isError });
}
