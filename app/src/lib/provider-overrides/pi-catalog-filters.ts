/**
 * Presentation-only gating of pi-ai's catalog: the providers Houston never
 * surfaces, the regional deployments it folds away, and the curated per-provider
 * model sets. Hiding is never removal — a hidden id stays runnable on the wire,
 * so a conversation already pinned to one keeps working.
 */

/**
 * pi providers dropped BEFORE the rename is applied. Two classes:
 * - `openai`: pi's direct api-key `openai` provider collides with the
 *   `openai-codex → openai` rename (Houston surfaces the OAuth Codex provider
 *   under `openai`, not the raw API-key one).
 * - Retired cards (2026-07 provider QA): Ant Ling, the Kimi For Coding
 *   subscription (Kimi models surface under Moonshot AI instead), Moonshot AI's
 *   China deployment, and the three regional Xiaomi Token Plans. Dropping is
 *   presentation-only: the ids stay runnable on the wire, so an existing
 *   conversation pinned to one keeps working; they just can't be connected or
 *   picked anymore.
 * - Structurally unconnectable (2026-07 provider QA): both Cloudflare providers
 *   need the user's ACCOUNT ID (AI Gateway also a gateway id) baked into the
 *   request URL, so the single-pasted-key connect dialog can never verify or
 *   run them — every attempt dead-ends in "could not verify". Dropped until a
 *   multi-field connect ships (mapped follow-up); same presentation-only rules.
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
 * carrying one are hidden from the catalog whenever their standard (unsuffixed)
 * deployment also ships — one card per provider, no regional duplicates (see
 * `buildCatalog`).
 */
export const REGIONAL_SUFFIX = /-(cn|sgp|ams)$/;

/**
 * Curated per-provider VISIBLE model sets, keyed by Houston (display) provider
 * id. A provider WITH an entry surfaces only these pi model ids; a provider
 * without one shows its full pi catalog. Both model surfaces read this one
 * table — the chat model picker (via `buildProvider` in `providers.ts`) and the
 * AI-hub models directory (via `piCatalogToCandidates`) — so the two can never
 * drift apart. Curation is presentation-only: a hidden id stays runnable on the
 * wire (an existing conversation pinned to one keeps working); it just can't be
 * picked anymore.
 *
 * Every id here must exist in the shipped pi-ai catalog — the drift guard
 * (`provider-overrides-drift.test.ts`) rejects orphans.
 */
export const VISIBLE_MODELS: Readonly<Record<string, ReadonlySet<string>>> = {
  // The current OpenAI line, minus pi's 2023-era gpt-4 rows. Azure serves a
  // model only when the user DEPLOYED it under that name, so a short current
  // list also keeps the "deployment named after the model id" rule legible.
  // Wider than the `openai` set below by gpt-5.5 / gpt-5.4: those two are
  // refused by the CODEX backend (a ChatGPT subscription), not by Azure, which
  // runs whatever the user's own resource has deployed.
  "azure-openai-responses": new Set([
    "gpt-6-astra",
    "gpt-5.5",
    "gpt-5.6-sol",
    "gpt-5.6-terra",
    "gpt-5.6-luna",
    "gpt-5.3-codex-spark",
    "gpt-5.4",
    "gpt-5.4-mini",
  ]),
  // Exactly what OpenAI's Codex backend serves a ChatGPT subscription, probed
  // live against its responses endpoint — `codexOfferedModelIds` in
  // packages/runtime/src/ai/codex-offered.ts is the documented source and
  // carries the evidence; `codex-models.test.ts` pins this set to it. pi's
  // catalog is a SUPERSET: it still lists gpt-5.5 (404 `model_not_found`) and
  // gpt-5.4 (400 "not supported when using Codex with a ChatGPT account"), and
  // offering either can only produce a dead turn.
  openai: new Set([
    "gpt-6-astra",
    "gpt-5.6-sol",
    "gpt-5.6-terra",
    "gpt-5.6-luna",
    "gpt-5.3-codex-spark",
    "gpt-5.4-mini",
  ]),
  anthropic: new Set([
    "claude-sonnet-5",
    "claude-fable-5-1",
    "claude-fable-5",
    "claude-opus-5",
    "claude-opus-4-8",
    "claude-opus-4-7",
    "claude-sonnet-4-6",
  ]),
  // NOTE: pi-ai ships no plain `gemini-3.1-flash` (only the Lite tier), so the
  // 3.1 line is represented by Flash Lite here.
  google: new Set([
    "gemini-3.8-flash",
    "gemini-3.7-flash",
    "gemini-3.6-flash",
    "gemini-3.5-flash",
    "gemini-3.5-flash-lite",
    "gemini-3.1-flash-lite",
    "gemma-4-26b-a4b-it",
    "gemma-4-31b-it",
  ]),
  // Moonshot AI retired the whole kimi-k2 preview series on 2026-05-25
  // (platform.kimi.ai/docs/models: kimi-k2-0711-preview, -0905-preview,
  // -turbo-preview, -thinking, -thinking-turbo) and closed kimi-k2.5 to new
  // accounts ahead of its 2026-08-31 sunset, but pi-ai's catalog still lists
  // them all — picking one answers `404 Not found the model` (PRODUCT-1411).
  // Only what Moonshot serves today. Presentation-only, like every set here.
  moonshotai: new Set([
    "kimi-k3",
    "kimi-k2.7-code",
    "kimi-k2.7-code-highspeed",
    "kimi-k2.6",
  ]),
};

/**
 * OpenRouter's rolling aliases (`~anthropic/claude-opus-latest`, named
 * "Anthropic: Claude Opus Latest") duplicate a concrete model under a name that
 * reads as the lab's own. In the hub / ceiling editor they surfaced as a
 * separate Anthropic-lab model offered ONLY by OpenRouter, so a Claude user who
 * allowed "Claude Opus Latest" got a ceiling nothing they connected could run
 * (PRODUCT-1657). Presentation-only, like `VISIBLE_MODELS`: an existing pin to
 * one stays runnable on the wire.
 */
function isOpenRouterAlias(providerId: string, modelId: string): boolean {
  return providerId === "openrouter" && modelId.startsWith("~");
}

/** Whether `modelId` may surface for `providerId` (a Houston display id). */
export function isModelVisible(providerId: string, modelId: string): boolean {
  if (isOpenRouterAlias(providerId, modelId)) return false;
  const visible = VISIBLE_MODELS[providerId];
  return !visible || visible.has(modelId);
}
