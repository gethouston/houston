import { confirmedConnectedProviders } from "../lib/connected-providers";
import type { ConnectedProviderRef } from "../lib/setup-chat-prompt-shared";
import { useProviderStatuses } from "./use-provider-statuses";

export function useConnectedProviders(): ConnectedProviderRef[] | null {
  const { statuses, isLoading, isError } = useProviderStatuses();
  return confirmedConnectedProviders({ statuses, isLoading, isError });
}
