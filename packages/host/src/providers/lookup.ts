import { getProviders } from "@earendil-works/pi-ai/compat";
import { PROVIDERS } from "./catalog";
import { QWEN_PROVIDER_ID } from "./qwen-dashscope";
import type { HostProvider } from "./types";

const byId = new Map(PROVIDERS.map((p) => [p.id as string, p]));

export const OPENAI_COMPATIBLE = "openai-compatible";

export const LOCAL_PLACEHOLDER_KEY = "houston-local";

export const CLOUD_PROVIDERS: readonly HostProvider[] = PROVIDERS.filter(
  (p) => p.cloud,
);

export function isCloudProvider(id: string): boolean {
  return byId.get(id)?.cloud === true;
}

export function isTurnServable(
  provider: string,
  hasCustomEndpoint: boolean,
): boolean {
  if (provider === OPENAI_COMPATIBLE) return hasCustomEndpoint;
  return isCloudProvider(provider);
}

const KNOWN_PROVIDER_IDS: ReadonlySet<string> = new Set([
  ...PROVIDERS.map((p) => p.id as string),
  ...getProviders(),
  QWEN_PROVIDER_ID,
]);

export function isKnownProvider(id: string): boolean {
  return KNOWN_PROVIDER_IDS.has(id);
}

export function hostProvider(id: string): HostProvider | undefined {
  return byId.get(id);
}

export function providerName(id: string): string {
  return byId.get(id)?.name ?? id;
}
