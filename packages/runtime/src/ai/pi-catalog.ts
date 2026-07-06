import {
  type Api,
  getModels,
  getProviders,
  type KnownProvider,
  type Model,
} from "@earendil-works/pi-ai";
import { getOAuthProviders } from "@earendil-works/pi-ai/oauth";

/**
 * pi-ai is the model-catalog source of truth. These predicates read its LIVE
 * registry so a provider Houston hasn't hand-curated in `providers.ts` is still
 * connectable, resolvable, and runnable from a pasted API key — ADDITIVELY, and
 * without touching how the curated providers behave.
 *
 * pi surfaces three facts we key off:
 * - `getProviders()` — every provider id pi knows (~35, and it drifts).
 * - `getOAuthProviders()` — the subset that authenticate by OAuth sign-in
 *   (anthropic, github-copilot, openai-codex); every other pi provider takes a
 *   pasted API key.
 * - `getModels(id)` — a provider's model catalog (empty for the open gateways
 *   that accept arbitrary ids, e.g. opencode).
 */

/** Every provider id pi-ai knows (its full, drifting catalog). */
export function piProviderIds(): string[] {
  return getProviders() as string[];
}

/** Whether pi-ai knows this provider id at all. */
export function isPiProvider(id: string): boolean {
  return piProviderIds().includes(id);
}

/**
 * Whether pi-ai authenticates this provider by OAuth (subscription sign-in) —
 * as opposed to a pasted API key. Only anthropic / github-copilot / openai-codex
 * qualify today; the check reads pi's registry so a future OAuth provider stays
 * on the OAuth path rather than being mistaken for an api-key one.
 */
export function isPiOAuthProvider(id: string): boolean {
  return getOAuthProviders().some((p) => p.id === id);
}

/**
 * The model ids pi lists for a provider, or `[]` when it has no catalog (the
 * open gateways) or isn't a pi KnownProvider. Never throws — a bad id is `[]`.
 */
export function piModelIds(id: string): string[] {
  try {
    return getModels(id as KnownProvider).map((m: Model<Api>) => m.id);
  } catch {
    return [];
  }
}
