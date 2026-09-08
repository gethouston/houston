/**
 * Legacy / CLI-era model id → pi model id, AT THE SAME TIER (never an upgrade).
 * Keyed by the CANONICAL provider so the same bare alias resolves correctly per
 * provider. Only ids that are NOT already in `VALID_MODELS` need an entry here —
 * a still-valid id (e.g. "claude-opus-4-8") is kept verbatim and never consults
 * this table.
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
    // Codex ids the subscription no longer serves, mapped to the closest tier
    // it does. The full tier is gpt-6-astra; the mini tier is gpt-5.4-mini.
    // gpt-5.4 / gpt-5.5 were full-tier rows themselves until OpenAI retired
    // them, and gpt-5.5-codex never shipped at all — they are legacy ids here
    // for the same reason the CLI-era ones are: a stored value that must land
    // somewhere that runs.
    "gpt-5": "gpt-6-astra",
    "gpt-5-codex": "gpt-6-astra",
    "gpt-5.1": "gpt-6-astra",
    "gpt-5.2": "gpt-6-astra",
    "gpt-5.4": "gpt-6-astra",
    "gpt-5.5": "gpt-6-astra",
    "gpt-5.5-codex": "gpt-6-astra",
    codex: "gpt-6-astra",
    "gpt-5-mini": "gpt-5.4-mini",
    "gpt-5.1-mini": "gpt-5.4-mini",
  },
};
