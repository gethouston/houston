import type { ProviderConnectionState } from "../../../lib/provider-connection.ts";

export function optimisticConnectionState(
  state: ProviderConnectionState,
  probeSettled: boolean,
): ProviderConnectionState {
  return !probeSettled && state === "checking" ? "disconnected" : state;
}
