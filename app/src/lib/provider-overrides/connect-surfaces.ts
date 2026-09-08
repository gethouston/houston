/**
 * Provider ids the CONNECT and AI-hub surfaces treat specially: which api-key
 * dialogs collect an endpoint, and which cards the hub pins to the front.
 */

/**
 * Api-key providers whose connect dialog collects a per-account ENDPOINT
 * alongside the key (PRODUCT-1477). Azure OpenAI is the only one today: every
 * Azure request goes to the user's own resource URL, so a key alone can never
 * be verified or used. The dialog shows an endpoint field for these ids and
 * sends it with the key; the runtime validates and persists it.
 */
export const API_KEY_ENDPOINT_PROVIDERS: ReadonlySet<string> = new Set([
  "azure-openai-responses",
]);

/**
 * Providers pinned to the front of the AI Hub Providers tab, in this order.
 * Ordering applies ONLY inside the hub (see `orderFeaturedFirst`) — the chat
 * model picker maps `PROVIDERS` directly and is untouched. The local
 * OpenAI-compatible provider is capability-gated and may be absent; the ordering
 * tolerates any id here being missing.
 */
export const FEATURED_PROVIDER_IDS = [
  "anthropic",
  "openai",
  "google",
  "github-copilot",
  "openai-compatible",
] as const;
