// `getProviders` is pi-ai's legacy static-catalog read (preserved on `/compat`):
// the baked, network-free list of every provider the runtime can run.
import { getProviders } from "@earendil-works/pi-ai/compat";
import { PROVIDERS } from "./catalog";
import { QWEN_PROVIDER_ID } from "./qwen-dashscope";
import type { HostProvider } from "./types";

const byId = new Map(PROVIDERS.map((p) => [p.id as string, p]));

/** The OpenAI-compatible (BYO endpoint) provider id. */
export const OPENAI_COMPATIBLE = "openai-compatible";

/**
 * A provider the LEGACY cloudrun per-turn path serves.
 *
 * `CLOUD_PROVIDERS` / `isCloudProvider` feed ONLY that legacy path
 * (`turn/dispatch-providers.ts`, `turn/cloud-provider.ts`) — NOT the managed
 * pod's provider catalog. The managed pod runs the local-profile host/runtime
 * and serves the FULL pi-ai provider set via `GET /v1/catalog`
 * (`providers/pi-catalog.ts`), regardless of the `cloud` flags here. So flipping
 * a `cloud` flag changes only the legacy per-turn eligibility, not what a hosted
 * user sees in the picker.
 */
export const CLOUD_PROVIDERS: readonly HostProvider[] = PROVIDERS.filter(
  (p) => p.cloud,
);

/** True when `id` is a provider the legacy cloudrun per-turn path offers. */
export function isCloudProvider(id: string): boolean {
  return byId.get(id)?.cloud === true;
}

/**
 * Whether the cloud per-turn runtime can SERVE a turn on `provider`. The catalog
 * `cloud` flag is OVERLOADED: it gates both this dispatch eligibility AND the
 * curated model-picker list (`CLOUD_PROVIDERS`). openai-compatible is turn-
 * servable but has NO curated models, so it stays `cloud: false` (out of the
 * picker) and has its eligibility decided HERE instead — servable iff the agent
 * has a custom endpoint configured. Every other provider follows the catalog
 * flag. This is the decoupling of the flag's two meanings; the boolean is passed
 * in (not read) so this stays pure and the caller owns the vfs lookup.
 */
export function isTurnServable(
  provider: string,
  hasCustomEndpoint: boolean,
): boolean {
  if (provider === OPENAI_COMPATIBLE) return hasCustomEndpoint;
  return isCloudProvider(provider);
}

/**
 * Every provider id this host recognises: the curated catalog plus pi-ai's full
 * baked registry (the same source `/v1/catalog` and the capabilities hint
 * enumerate). Mirrors the runtime's own `isProvider` so a pin the runtime could
 * run is never refused earlier by the host as "unknown".
 */
const KNOWN_PROVIDER_IDS: ReadonlySet<string> = new Set([
  ...PROVIDERS.map((p) => p.id as string),
  ...getProviders(),
  QWEN_PROVIDER_ID,
]);

/** Whether `id` names a provider this deployment could run at all. */
export function isKnownProvider(id: string): boolean {
  return KNOWN_PROVIDER_IDS.has(id);
}

/** Lookup a provider by id. */
export function hostProvider(id: string): HostProvider | undefined {
  return byId.get(id);
}

/** A provider's display name, or the id itself when unknown. */
export function providerName(id: string): string {
  return byId.get(id)?.name ?? id;
}
