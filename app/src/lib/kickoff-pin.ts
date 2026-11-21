import { pickDefaultProviderModel } from "./default-provider-model.ts";

export interface KickoffPin {
  provider?: string;
  model?: string;
}

export interface KickoffPinFromScanOptions {
  connected: readonly string[] | null;
  lastUsedProvider: string | null | undefined;
  lastUsedModel: string | null | undefined;
}

export function kickoffPinFromScan({
  connected,
  lastUsedProvider,
  lastUsedModel,
}: KickoffPinFromScanOptions): KickoffPin | null {
  if (connected === null) return null;
  const resolved = pickDefaultProviderModel({
    lastUsedProvider,
    lastUsedModel,
    connectedProviders: connected,
  });
  return resolved.confirmed
    ? { provider: resolved.provider, model: resolved.model }
    : {};
}
