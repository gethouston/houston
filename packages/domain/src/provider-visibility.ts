/**
 * The ONE list of pi-ai providers Houston does not surface, and the rule that
 * folds away regional duplicates.
 *
 * Both halves of the product must read the SAME list: the app's catalog builder
 * decides which provider CARDS exist, and the runtime's
 * `request_provider_connection` tool decides which ids an agent may ask the user
 * to connect. When only the catalog knew, the agent could queue a connect card
 * for a provider with no card behind it — the user got "unavailable here" with
 * no Connect button and a composer blocked until they pressed Skip.
 *
 * Hiding is never removal: a hidden id stays runnable on the wire, so a
 * conversation already pinned to one keeps working. It just cannot be connected
 * or picked any more.
 *
 * A dependency-free LEAF (see `provider-dialect.ts`): exposed as the
 * `@houston/domain/provider-visibility` subpath so surface code loads it under
 * plain `node --experimental-strip-types`, where a barrel's extensionless
 * internal imports do not resolve.
 */

import { toCanonicalProviderId } from "@houston/domain/provider-dialect";

/**
 * pi providers dropped BEFORE the rename is applied, keyed by pi's CANONICAL
 * id. Two classes:
 * - `openai`: pi's direct api-key `openai` provider collides with the
 *   `openai-codex → openai` rename (Houston surfaces the OAuth Codex provider
 *   under `openai`, not the raw API-key one).
 * - Retired cards (2026-07 provider QA): Ant Ling, the Kimi For Coding
 *   subscription (Kimi models surface under Moonshot AI instead), Moonshot AI's
 *   China deployment, and the three regional Xiaomi Token Plans.
 * - Structurally unconnectable (2026-07 provider QA): both Cloudflare providers
 *   need the user's ACCOUNT ID (AI Gateway also a gateway id) baked into the
 *   request URL, so the single-pasted-key connect dialog can never verify or
 *   run them — every attempt dead-ends in "could not verify". Dropped until a
 *   multi-field connect ships (mapped follow-up).
 *   (Azure OpenAI sat here briefly for the same reason; its connect dialog now
 *   collects the resource endpoint alongside the key — PRODUCT-1477.)
 */
export const DROP_PI_PROVIDERS: ReadonlySet<string> = new Set([
  "openai",
  "ant-ling",
  "kimi-coding",
  "moonshotai-cn",
  "xiaomi-token-plan-ams",
  "xiaomi-token-plan-cn",
  "xiaomi-token-plan-sgp",
  "cloudflare-ai-gateway",
  "cloudflare-workers-ai",
]);

/**
 * Regional-deployment id suffixes (China / Singapore / Amsterdam). Providers
 * carrying one are hidden whenever their standard (unsuffixed) deployment also
 * ships — one card per provider, no regional duplicates.
 */
export const REGIONAL_SUFFIX = /-(cn|sgp|ams)$/;

/**
 * Whether Houston hides `id` from its provider catalog — i.e. no connect card
 * exists for it, so nothing may queue one.
 *
 * `id` may arrive in EITHER dialect and is canonicalized first, which is what
 * keeps Houston's display `openai` (the Codex subscription) connectable while
 * pi's raw api-key `openai` — the id the drop list actually names — stays
 * unreachable. That is the same tradeoff `provider-dialect.ts` documents: a
 * bare `openai` means the Codex product.
 *
 * `piKnows` answers whether the shipped pi catalog carries a provider id. A
 * regional deployment is a DUPLICATE only when its parent also ships and is not
 * itself dropped; a provider whose ONLY deployment is regional stays visible
 * rather than vanishing entirely.
 */
export function isHiddenProviderId(
  id: string,
  piKnows: (candidate: string) => boolean,
): boolean {
  const canonical = toCanonicalProviderId(id);
  if (DROP_PI_PROVIDERS.has(canonical)) return true;
  const parent = canonical.replace(REGIONAL_SUFFIX, "");
  if (parent === canonical) return false;
  return piKnows(parent) && !DROP_PI_PROVIDERS.has(parent);
}
