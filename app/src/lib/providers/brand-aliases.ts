// Self-contained subpath import (like `./build-provider.ts`): the app's
// node:test runner loads this module directly, through both of its readers.
import { PROVIDER_DISPLAY_RENAME } from "@houston/sdk/provider-catalog";

/**
 * Provider ids that ARE another provider's brand: a regional or variant id, a
 * dialect spelling, an AI-hub lab id that spells the brand differently. Keyed
 * by the incoming id, valued by the provider id whose identity it borrows.
 *
 * Both halves of a brand's presentation read this ONE table — the mark
 * (`components/shell/provider-logo-map.ts`) and the NAME (`./lookup.ts`) — so a
 * surface can never draw one brand's logo beside another brand's label, or
 * beside a raw id like "minimax-cn". Whether art actually exists for the parent
 * is the logo map's own question; this table only says who is who.
 */
export const BRAND_ALIASES: Readonly<Record<string, string>> = {
  // A provider Houston RENAMES for display is the same brand under both
  // spellings, so the dialect table IS an alias table — read from the ONE
  // module that owns it (`@houston/domain` provider-dialect) rather than
  // restated here, where a new rename would silently draw a monogram beside a
  // raw canonical id.
  ...PROVIDER_DISPLAY_RENAME,
  // Variant ids models.dev serves the generic default for — reuse a parent
  // brand's real mark rather than a monogram. Retired provider ids (kimi-coding,
  // moonshotai-cn, xiaomi-token-plan-*) keep their alias: they no longer render
  // a card (DROP_PI_PROVIDERS) but a legacy conversation pinned to one still
  // shows the right glyph.
  "minimax-cn": "minimax",
  "moonshotai-cn": "moonshotai",
  "kimi-coding": "moonshotai",
  "zai-coding-cn": "zai",
  "vercel-ai-gateway": "vercel",
  "xiaomi-token-plan-ams": "xiaomi",
  "xiaomi-token-plan-cn": "xiaomi",
  "xiaomi-token-plan-sgp": "xiaomi",
  "qwen-token-plan": "qwen",
  "qwen-token-plan-cn": "qwen",
  "qwen-token-plan-individual": "qwen",
  // AI-hub lab ids (see `catalog-lab.ts`) that differ from the provider id.
  // Most lab ids ARE provider ids (anthropic, openai, mistral, deepseek, xai,
  // minimax, zai, nvidia, meta, qwen, cohere, ...) so `providerBrandKey`
  // resolves them directly; only the ids that spell the brand differently need
  // an alias. The catch-all `other` lab has no mark of its own and renders the
  // monogram — never a borrowed provider logo, which would name one brand and
  // draw another.
  gemini: "google",
  amazon: "amazon-bedrock",
  moonshot: "moonshotai",
  "meta-llama": "meta",
  llama: "meta",
};
