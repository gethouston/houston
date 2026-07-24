// `getProviders` is pi-ai's legacy static-catalog read, preserved on `/compat`.
import { getProviders } from "@earendil-works/pi-ai/compat";
import { piOAuthProviders } from "./pi-oauth";

/**
 * The generic api-key-provider predicate, derived from pi-ai's own registries so
 * it stays in lockstep with what the runtime can actually run (and with the
 * `GET /v1/catalog` body, which enumerates the same two lists). NOT the curated
 * host catalog (`../providers` `PROVIDERS`): that list only names the providers
 * whose cloud reachability / model picker is hand-tuned, and gating connect on it
 * 400d every other pi provider (groq, mistral, xai, together, fireworks,
 * cerebras, nvidia, ...) even though the runtime resolves their models the same
 * generic way. The sets are baked (no network), so computing them once at module
 * load is deterministic and identical on desktop and inside a cloud pod.
 */

/** Every provider id pi-ai knows — its full baked model registry (~35). */
const PI_PROVIDER_IDS: ReadonlySet<string> = new Set<string>(getProviders());

/**
 * pi-ai provider ids that authenticate via an OAuth subscription sign-in
 * (anthropic, openai-codex, github-copilot) rather than a pasted key. These go
 * through the OAuth flow, never the api-key connect route.
 */
const PI_OAUTH_IDS: ReadonlySet<string> = new Set(
  piOAuthProviders().map((p) => p.id),
);

/**
 * True when `id` is a pi-ai provider connectable with a pasted API key: pi-ai
 * knows it AND it is not one of pi-ai's OAuth (subscription) providers. This is
 * the gate the api-key connect route (`POST /agents/:id/credential/api-key`)
 * uses, so EVERY pi api-key provider can be connected with a key — not just the
 * curated cloud set. The OpenAI-compatible provider is NOT a pi provider id (it
 * carries a base URL + model, not a gateway key), so it is naturally excluded and
 * keeps its own base-URL route.
 */
export function isApiKeyProvider(id: string): boolean {
  return PI_PROVIDER_IDS.has(id) && !PI_OAUTH_IDS.has(id);
}
