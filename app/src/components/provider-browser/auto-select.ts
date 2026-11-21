import type { ProviderInfo } from "../../lib/providers.ts";
import type { ProviderStatus } from "../../lib/tauri.ts";
import { providerIsAuthenticated } from "../shell/provider-reconnect-state.ts";

export type StatusSnapshot = Record<string, ProviderStatus | undefined>;

export interface AutoSelection {
  providerId: string;
  model: string;
}

function isConnected(status: ProviderStatus | undefined): boolean {
  return status ? providerIsAuthenticated(status) : false;
}

export function resolveAutoSelect(
  prev: StatusSnapshot | null,
  next: StatusSnapshot,
  providers: readonly ProviderInfo[],
  options: { selectOnMount: boolean },
): AutoSelection | null {
  const firstLoad = prev === null;
  for (const provider of providers) {
    const cur = next[provider.id];
    if (!isConnected(cur)) continue;
    const wasConnected = prev ? isConnected(prev[provider.id]) : false;
    if (wasConnected) continue;
    if (firstLoad && !options.selectOnMount) continue;
    const model = provider.defaultModel || cur?.active_model;
    if (model) return { providerId: provider.id, model };
  }
  return null;
}
