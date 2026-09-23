/**
 * Legacy / CLI-era model id → pi model id, AT THE SAME TIER (never an upgrade).
 * Keyed by the CANONICAL provider so the same bare alias resolves correctly per
 * provider. On a finite-catalog provider only ids that are NOT in
 * `VALID_MODELS` need an entry — a still-valid id (e.g. "claude-opus-4-8") is
 * kept verbatim and never consults this table. On an open-catalog gateway an
 * entry is a RENAME and nothing else: every other id passes straight through to
 * the gateway.
 *
 * Anthropic tiers: opus (most capable) / sonnet (balanced) / haiku (fastest).
 * The bare aliases the Claude CLI accepted map to the current pi id at the SAME
 * tier.
 *
 * A LEAF (see `provider-dialect.ts`): exposed as the
 * `@houston/domain/model-aliases` subpath so the app reads legacy model ids
 * through this table instead of restating its Anthropic half. Its ONE
 * dependency is the sibling `provider-default-models` leaf, reached through the
 * package's own subpath so both stay loadable under plain
 * `node --experimental-strip-types` — where an extensionless relative specifier
 * does not resolve and a `.ts` one is a type error under this package's
 * emitting tsconfig.
 */

import { DEFAULT_MODEL } from "@houston/domain/provider-default-models";
import { toCanonicalProviderId } from "@houston/domain/provider-dialect";
import type { ProviderId } from "./provider-ids";

/**
 * The bare + "latest" sonnet aliases, read from the provider's ONE default so
 * saying "sonnet" and saying nothing land on the SAME model. A "latest" alias
 * pinned to a dated id is a lie the moment the default moves.
 *
 * Absent while the table carries no Anthropic default: no alias at all is
 * better than a stale one, and the caller then falls to its own ladder.
 */
const anthropicDefault = DEFAULT_MODEL.anthropic;
const SONNET_ALIASES: Readonly<Record<string, string>> = anthropicDefault
  ? { sonnet: anthropicDefault, "claude-sonnet-latest": anthropicDefault }
  : {};

export const MODEL_ALIASES: Partial<
  Record<ProviderId, Readonly<Record<string, string>>>
> = {
  anthropic: {
    // Bare tier names the Claude CLI accepted, plus the "latest"-style aliases
    // it used that pi doesn't expose verbatim. Opus and Haiku are hand-pinned:
    // the default table holds ONE model per provider, not one per tier.
    opus: "claude-opus-5",
    haiku: "claude-haiku-4-5",
    "claude-opus-latest": "claude-opus-5",
    "claude-haiku-latest": "claude-haiku-4-5",
    ...SONNET_ALIASES,
  },
  "openai-codex": {
    // Codex ids the subscription does not serve, mapped to the closest tier it
    // does. The full tier is gpt-6-astra; the small/cheap tier is gpt-6-luna.
    // gpt-5.4 is a full-tier id OpenAI retired and gpt-5.5-codex is one that
    // never shipped — they belong here for the same reason the CLI-era ids do:
    // a stored value that must land somewhere that runs. gpt-5.5 has NO row,
    // because the subscription serves it and a pin on it must stay on it.
    "gpt-5": "gpt-6-astra",
    "gpt-5-codex": "gpt-6-astra",
    "gpt-5.1": "gpt-6-astra",
    "gpt-5.2": "gpt-6-astra",
    "gpt-5.4": "gpt-6-astra",
    "gpt-5.5-codex": "gpt-6-astra",
    codex: "gpt-6-astra",
    "gpt-5-mini": "gpt-6-luna",
    "gpt-5.1-mini": "gpt-6-luna",
    "gpt-5.4-mini": "gpt-6-luna",
    // Spark is a small/fast row the 2026-09-23 probe reads as refused, and
    // stored pins on it exist; gpt-6-luna is the small/fast tier it maps to.
    "gpt-5.3-codex-spark": "gpt-6-luna",
  },
  deepseek: {
    // pi 0.87.1 names the Flash tier `deepseek-flash` (DeepSeek V4.1 Flash) and
    // serves text+image from it, so the separate vision row maps there too:
    // same tier, same modalities, nothing the pin was chosen for is lost.
    "deepseek-v4-flash": "deepseek-flash",
    "deepseek-v4-flash-vision-exp": "deepseek-flash",
  },
  // An open-catalog gateway carries ONLY renames (see `canonicalModelId`): a
  // gateway id with no successor keeps passing through, because the gateway —
  // not this table — is the authority on what it routes. `mimo-v2.5-free` is
  // `mimo-v2.6-flash-free` in pi 0.87.1: the same free tier (zero cost,
  // text+image, 200k window), so the map holds the tier.
  opencode: { "mimo-v2.5-free": "mimo-v2.6-flash-free" },
};

/**
 * The legacy aliases of ONE provider, in either id dialect, or an empty table
 * for a provider that has none.
 *
 * Per-provider by construction: the same bare id means different things to
 * different providers ("gpt-5.4" is a retired Codex row, and reading the
 * Anthropic row for it hands a Codex pin straight through as a hard pin on a
 * model the picker never showed).
 */
export function modelAliasesFor(
  provider: string | null | undefined,
): Readonly<Record<string, string>> {
  if (!provider) return {};
  const canonical = toCanonicalProviderId(provider);
  for (const [id, aliases] of Object.entries(MODEL_ALIASES))
    if (id === canonical && aliases) return aliases;
  return {};
}
