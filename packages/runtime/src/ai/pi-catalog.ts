import type { Api, Model, Provider } from "@earendil-works/pi-ai";
// `getModels`/`getProviders` are pi-ai's legacy static-catalog reads, preserved
// on `/compat` (the new `Models`/`Provider` collection API needs an
// instantiated registry we don't otherwise carry here).
import {
  type BuiltinProvider,
  getModels,
  getProviders,
} from "@earendil-works/pi-ai/compat";
import { builtinProviders } from "@earendil-works/pi-ai/providers/all";
import { QWEN_PROVIDER_ID, qwenModels } from "./qwen-dashscope";

/**
 * pi-ai is the model-catalog source of truth. These predicates read its LIVE
 * registry so a provider Houston hasn't hand-curated in `providers.ts` is still
 * connectable, resolvable, and runnable from a pasted API key — ADDITIVELY, and
 * without touching how the curated providers behave.
 *
 * pi surfaces three facts we key off:
 * - `getProviders()` — every provider id pi's baked catalog knows (~35, and it
 *   drifts).
 * - `Provider.auth` — how a provider can authenticate. Since pi 0.81 many
 *   api-key providers ALSO expose an optional OAuth login (xai, kimi-coding,
 *   openrouter); Houston's connect surface keeps those on the pasted-key path,
 *   so "OAuth provider" here means OAuth is the ONLY way in (openai-codex
 *   today — anthropic/github-copilot are curated `oauth` in providers.ts).
 * - `getModels(id)` — a provider's model catalog (empty for the open gateways
 *   that accept arbitrary ids, e.g. opencode).
 */

/** pi's builtin provider objects, constructed once (auth surface + names). */
let cachedBuiltins: readonly Provider[] | undefined;
function piBuiltinProviders(): readonly Provider[] {
  cachedBuiltins ??= builtinProviders();
  return cachedBuiltins;
}

/**
 * Every provider id pi-ai knows (its full, drifting catalog) — plus Houston's
 * own `qwen` extension provider (see ./qwen-dashscope), which every read
 * below must treat exactly like a pi builtin so it is connectable, listable,
 * and resolvable.
 */
export function piProviderIds(): string[] {
  return [...(getProviders() as string[]), QWEN_PROVIDER_ID];
}

/** Whether pi-ai knows this provider id at all. */
export function isPiProvider(id: string): boolean {
  return piProviderIds().includes(id);
}

/**
 * Whether pi-ai authenticates this provider ONLY by OAuth (subscription
 * sign-in) — i.e. a pasted API key cannot work. Providers with BOTH auth kinds
 * (xai, kimi-coding, openrouter since pi 0.81) deliberately read false: an
 * uncurated provider's pasted key must keep being accepted (login.ts setApiKey
 * gate) instead of being sent down an OAuth flow the connect UI can't drive.
 */
export function isPiOAuthProvider(id: string): boolean {
  return piBuiltinProviders().some(
    (p) => p.id === id && p.auth.oauth !== undefined && !p.auth.apiKey,
  );
}

/**
 * Every pi provider id a pasted API key can authenticate — pi knows it and
 * OAuth is not the only way in. This is the runtime mirror of the host's
 * `isApiKeyProvider` connect gate: whatever connect accepts, the serve sync
 * must be able to re-hydrate, or an uncurated provider's centrally-stored key
 * silently reads disconnected after the next pod recycle (PRODUCT-1213).
 */
export function piApiKeyProviderIds(): string[] {
  return piProviderIds().filter((id) => !isPiOAuthProvider(id));
}

/**
 * The model ids pi lists for a provider, or `[]` when it has no catalog (the
 * open gateways) or isn't a pi builtin. Never throws — a bad id is `[]`.
 */
export function piModelIds(id: string): string[] {
  if (id === QWEN_PROVIDER_ID) return qwenModels().map((m) => m.id);
  try {
    return getModels(id as BuiltinProvider).map((m: Model<Api>) => m.id);
  } catch {
    return [];
  }
}
