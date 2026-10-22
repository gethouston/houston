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
 * Haiku comes last: it is the light, fast tier, not a step up from Sonnet. A
 * stored Haiku 4.5 pin runs on Haiku 5.5, within its own family like every
 * other Claude id.
 */
export const ANTHROPIC_LINEUP = {
  sonnet: "claude-sonnet-5-5",
  opus: "claude-opus-5-5",
  fable: "claude-fable-5-1",
  haiku: "claude-haiku-5-5",
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
 * Sonnet, a Haiku pin never up to Sonnet). Undefined for an id with no family
 * in the lineup (`claude-2.1`, a non-Claude id).
 */
export function anthropicLineupModel(model: string): string | undefined {
  const family = CLAUDE_FAMILY.exec(model)?.[1];
  return family && Object.hasOwn(ANTHROPIC_LINEUP, family)
    ? ANTHROPIC_LINEUP[family as keyof typeof ANTHROPIC_LINEUP]
    : undefined;
}

export const MODEL_ALIASES: Partial<
  Record<ProviderId, Readonly<Record<string, string>>>
> = {
  "openai-codex": {
    // Codex ids the subscription does not serve, mapped to the closest tier it
    // does. The full tier is gpt-6-astra; the small/cheap tier is gpt-6-luna.
    // gpt-5.4 is a full-tier id OpenAI retired and gpt-5.5-codex is one that
    // never shipped — they belong here for the same reason the CLI-era ids do:
    // a stored value that must land somewhere that runs.
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
    // Refused since 2026-10-22 and dropped by pi 1.4.0. The latest Sol is
    // cheaper per token than gpt-5.5 and is the successor GitHub names for it.
    "gpt-5.5": "gpt-6.1-sol",
  },
  // Rows GitHub retired from Copilot (2026-09-10 to 2026-10-19) and pi 1.4.0
  // dropped, each mapped to the successor GitHub's retirement table names.
  // Copilot is open in VALID_MODELS, so each entry is a rename.
  "github-copilot": {
    "gpt-5-mini": "gpt-6-luna",
    "gpt-5.4-mini": "gpt-6-luna",
    "gpt-5.4": "gpt-6.1-sol",
    "gpt-5.5": "gpt-6.1-sol",
    "claude-opus-4.7": "claude-opus-5.5",
    "gemini-3.5-flash": "gemini-3.8-flash",
    "gemini-3.6-flash": "gemini-3.8-flash",
    "gemini-3.7-flash": "gemini-3.8-flash",
    "kimi-k2.7-code": "kimi-k3",
    "mai-code-1-flash-picker": "mai-code-1.1-flash",
  },
  // pi 1.4.0 dropped the MiMo V2.5 line. Each V2.6 row costs the same as the
  // V2.5 row it replaces; UltraSpeed V2.6 costs 3x more, so the V2.5 UltraSpeed
  // pin lands on V2.6 Pro instead.
  xiaomi: {
    "mimo-v2.5": "mimo-v2.6-flash",
    "mimo-v2.5-pro": "mimo-v2.6-pro",
    "mimo-v2.5-pro-ultraspeed": "mimo-v2.6-pro",
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
  // Each row is a model pi dropped from OpenCode Go, mapped to its successor.
  // 0.99.1 dropped the glm, kimi and qwen rows, each to the same price tier.
  // 1.1.0 dropped the free `space-bunny-free` preview: `space-bunny` is the
  // same model (same 1M window and output cap) out of preview, so a pin on it
  // now draws plan usage. It is still the cheapest runnable home; with no row
  // the pin would fall to glm-5.2, which costs about 9x more.
  // 1.3.0 dropped four rows, each for its next version at the same price.
  // deepseek-v4.1-flash also takes images, so the vision pin keeps them.
  // 1.4.0 dropped `space-bunny`; deepseek-v4.1-flash has its exact price,
  // window and image input, so both Space Bunny ids land there.
  "opencode-go": {
    "glm-5.1": "glm-5.2",
    "kimi-k2.6": "kimi-k2.7-code",
    "qwen3.7-max": "qwen3.8-max",
    "space-bunny-free": "deepseek-v4.1-flash",
    "space-bunny": "deepseek-v4.1-flash",
    "deepseek-v4-flash": "deepseek-v4.1-flash",
    "deepseek-v4-flash-vision-exp": "deepseek-v4.1-flash",
    "minimax-m2.7": "minimax-m3",
    "grok-4.6": "grok-4.7",
  },
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
