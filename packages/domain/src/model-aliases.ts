/**
 * Legacy / CLI-era model id → pi model id, AT THE SAME TIER (never an upgrade).
 * Keyed by the CANONICAL provider so the same bare alias resolves correctly per
 * provider. On a finite-catalog provider only ids that are NOT in
 * `VALID_MODELS` need an entry — a still-valid id is kept verbatim and never
 * consults this table. On an open-catalog gateway an entry is a RENAME and
 * nothing else: every other id passes straight through to the gateway.
 *
 * The `anthropic` provider has no table: it offers one model per Claude family
 * (`ANTHROPIC_LINEUP`), and every other Claude id resolves to its own family's
 * model by RULE (`anthropicLineupModel`), so a dated or CLI-era spelling no
 * table enumerated still lands in its family.
 *
 * A LEAF (see `provider-dialect.ts`): exposed as the
 * `@houston/domain/model-aliases` subpath so the app reads legacy model ids
 * through this module instead of restating it. Its ONE dependency is the
 * sibling `provider-dialect` leaf, reached through the package's own subpath so
 * both stay loadable under plain `node --experimental-strip-types` — where an
 * extensionless relative specifier does not resolve and a `.ts` one is a type
 * error under this package's emitting tsconfig.
 */

import { toCanonicalProviderId } from "@houston/domain/provider-dialect";
import type { ProviderId } from "./provider-ids";

/**
 * The Claude models the `anthropic` provider offers: exactly one per family, in
 * picker order. Every other Claude id on that provider is retired from it.
 *
 * Haiku has no model here, on purpose: nothing maps a Haiku id UP into another
 * family, so a stored Haiku pin falls to the caller's own ladder (the provider
 * default, with a diagnostic) rather than being silently re-tiered here.
 */
export const ANTHROPIC_LINEUP = {
  sonnet: "claude-sonnet-5-5",
  opus: "claude-opus-5-5",
  fable: "claude-fable-5-1",
} as const;

/**
 * A Claude id's family, in every spelling the provider has carried: current
 * (`claude-opus-4-8`), dated (`claude-opus-4-1-20250805`), Claude 3
 * (`claude-3-5-sonnet-20241022`), "latest" (`claude-sonnet-latest`), the CLI's
 * `[1m]` variants, and the bare tier names the Claude CLI accepted (`opus`).
 */
const CLAUDE_FAMILY =
  /^(?:claude-(?:\d+-)*)?(opus|sonnet|fable|haiku)(?:$|[-[])/;

/**
 * The lineup model a Claude id on the `anthropic` provider runs on: its own
 * family's model, never another family's (an Opus pin is never moved to
 * Sonnet). Undefined for an id with no family in the lineup (Haiku, `claude-2.1`,
 * a non-Claude id).
 */
export function anthropicLineupModel(model: string): string | undefined {
  const family = CLAUDE_FAMILY.exec(model)?.[1];
  if (family === "opus" || family === "sonnet" || family === "fable")
    return ANTHROPIC_LINEUP[family];
  return undefined;
}

export const MODEL_ALIASES: Partial<
  Record<ProviderId, Readonly<Record<string, string>>>
> = {
  "openai-codex": {
    // Codex ids the subscription no longer serves, mapped to the closest tier
    // it does. The full tier is gpt-6-astra; the small tier is gpt-5.6-luna.
    // gpt-5.4 / gpt-5.5 were full-tier rows themselves until OpenAI retired
    // them, and gpt-5.5-codex never shipped at all — they are legacy ids here
    // for the same reason the CLI-era ones are: a stored value that must land
    // somewhere that runs. gpt-5.4-mini was the small tier until pi 0.99.1
    // dropped it, so stored pins on it exist.
    "gpt-5": "gpt-6-astra",
    "gpt-5-codex": "gpt-6-astra",
    "gpt-5.1": "gpt-6-astra",
    "gpt-5.2": "gpt-6-astra",
    "gpt-5.4": "gpt-6-astra",
    "gpt-5.5": "gpt-6-astra",
    "gpt-5.5-codex": "gpt-6-astra",
    codex: "gpt-6-astra",
    "gpt-5-mini": "gpt-5.6-luna",
    "gpt-5.1-mini": "gpt-5.6-luna",
    "gpt-5.4-mini": "gpt-5.6-luna",
  },
  deepseek: {
    // pi names the Flash tier `deepseek-flash` (DeepSeek V4.1 Flash) and serves
    // text+image from it, so the separate vision row maps there too: same
    // tier, same modalities, nothing the pin was chosen for is lost.
    "deepseek-v4-flash": "deepseek-flash",
    "deepseek-v4-flash-vision-exp": "deepseek-flash",
  },
  // An open-catalog gateway carries ONLY renames (see `canonicalModelId`): a
  // gateway id with no successor keeps passing through, because the gateway —
  // not this table — is the authority on what it routes. Each row is a model
  // pi 0.99.1 dropped, mapped to its successor in the same price tier.
  opencode: { "mimo-v2.5-free": "mimo-v2.6-flash-free" },
  "opencode-go": {
    "glm-5.1": "glm-5.2",
    "kimi-k2.6": "kimi-k2.7-code",
    "qwen3.7-max": "qwen3.8-max",
  },
};

/**
 * The legacy aliases of ONE provider, in either id dialect, or an empty table
 * for a provider that has none.
 *
 * Per-provider by construction: the same bare id means different things to
 * different providers ("gpt-5.5" is a retired Codex row, and reading the
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

/**
 * The id a stored `model` resolves to on `provider` (either id dialect) by the
 * provider's legacy aliases or, on `anthropic`, by its family lineup; undefined
 * when neither says anything. An id that is already current resolves to itself
 * on `anthropic` and to undefined elsewhere.
 */
export function legacyModelAlias(
  provider: string | null | undefined,
  model: string,
): string | undefined {
  const aliases = modelAliasesFor(provider);
  // `hasOwn` so a hand-edited "constructor"/"__proto__" never reads an
  // Object.prototype member as an alias.
  if (Object.hasOwn(aliases, model)) return aliases[model];
  if (provider && toCanonicalProviderId(provider) === "anthropic")
    return anthropicLineupModel(model);
  return undefined;
}
