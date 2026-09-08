// Same self-contained-subpath rule as `./build-provider.ts`: the ONE provider
// dialect table, owned by `@houston/domain` and re-exported by the SDK.
import { toDisplayProviderId } from "@houston/sdk/provider-catalog";
import { PROVIDERS } from "./catalog.ts";
import type { ProviderInfo } from "./types.ts";

/**
 * Finding a PROVIDER in the live catalog by id, in either dialect, and telling
 * whether an id is still one Houston serves. Per-model reads live in
 * `./model-values.ts`; which providers a surface shows, in `./visibility.ts`.
 */

/**
 * Display name for a provider id in either dialect, falling back to the id
 * itself for a provider the catalog does not carry. The label twin of
 * `providerBrandKey` (the logo path) — the two must alias the same way or a
 * surface draws one brand's mark beside another brand's name.
 */
export function providerName(id: string): string {
  return getProvider(id)?.name ?? id;
}

/**
 * Find a provider by id, in EITHER dialect. `PROVIDERS` is keyed by Houston's
 * display ids, but a provider id read off disk or off the wire (an agent
 * config, an activity row, a routine pin, a typed provider error) carries pi's
 * canonical id — so every lookup normalizes first. Unaliased, `openai-codex`
 * missed the catalog entirely: its label fell back to the raw id and its
 * default model fell through to another provider's.
 */
export function getProvider(id: string): ProviderInfo | undefined {
  const display = toDisplayProviderId(id);
  return PROVIDERS.find((p) => p.id === display);
}

/**
 * Return `providerId` only when it names a currently-active provider in
 * `PROVIDERS`. Used by the chat model selector and the per-chat
 * effective-provider fallback chain to skip stored values that point at
 * providers Houston has dropped (e.g. an activity record from a previous
 * Houston version that selected a provider that is no longer available).
 * Callers chain it with `??` to fall through to the next tier of preference.
 */
export function validProviderOrNull(
  providerId: string | null | undefined,
): string | null {
  // The catalog's own id, not the caller's spelling: a stored `openai-codex`
  // resolves to the display `openai` every other app surface speaks.
  return (providerId && getProvider(providerId)?.id) || null;
}

/**
 * Providers whose model catalog is OPEN: the hydrated `PROVIDERS[].models` is the
 * pi-ai runnable set for the picker, NOT the exhaustive set the gateway can
 * route, so a live selection must not be validated against it. OpenRouter serves
 * the 300+ models the picker fetches live; the two OpenCode gateways route to
 * models pi's static catalog doesn't enumerate; the local OpenAI-compatible
 * endpoint runs whatever model the user's server exposes. For every OTHER
 * provider, pi-ai's catalog IS the runnable set, so `getModel` is authoritative.
 * Mirrors the domain's pass-through set (providers absent from `VALID_MODELS` in
 * `@houston/domain`).
 */
const OPEN_CATALOG_PROVIDERS: ReadonlySet<string> = new Set([
  "openrouter",
  "opencode",
  "opencode-go",
  "openai-compatible",
]);

/** Whether `providerId` runs any model id its upstream serves (see above). */
export function isOpenCatalogProvider(
  providerId: string | null | undefined,
): boolean {
  return (
    !!providerId && OPEN_CATALOG_PROVIDERS.has(toDisplayProviderId(providerId))
  );
}
