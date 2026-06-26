/**
 * The data tables for the legacy → pi provider/model migration
 * (see `provider-model.ts` for the mapping logic). Kept separate so the logic
 * file stays small and the catalog is easy to refresh when pi's model line moves.
 *
 * The catalog is hard-coded (NOT read from pi-ai) so `@houston/domain` stays free
 * of the pi-ai dependency and the open/closed boundary. The valid-model sets were
 * captured from `getModels("anthropic")` / `getModels("openai-codex")` — keep them
 * in sync when pi's catalog changes (a stale entry only ever means we migrate to
 * the provider default + emit a diagnostic, never a throw).
 */

/** pi's provider ids (mirror of packages/runtime ProviderId). */
export type ProviderId =
  | "anthropic"
  | "openai-codex"
  | "github-copilot"
  | "opencode"
  | "opencode-go"
  | "openrouter"
  | "google"
  | "openai-compatible";

const PROVIDER_IDS: readonly ProviderId[] = [
  "anthropic",
  "openai-codex",
  "github-copilot",
  "opencode",
  "opencode-go",
  "openrouter",
  "google",
  "openai-compatible",
];

export const isProviderId = (s: string): s is ProviderId =>
  (PROVIDER_IDS as readonly string[]).includes(s);

/**
 * The provider a migration falls back to when the stored provider is
 * unrecognizable. Codex (ChatGPT) is the cloud default and the only provider
 * cloud serves, so it is the safe universal floor.
 */
export const DEFAULT_PROVIDER: ProviderId = "openai-codex";

/**
 * Each provider's default model. These MUST match the runtime's env defaults
 * (`packages/runtime/src/config.ts`: HOUSTON_MODEL / HOUSTON_CODEX_MODEL / ...).
 * A migration that can't place the stored model lands here.
 */
export const DEFAULT_MODEL: Record<ProviderId, string> = {
  anthropic: "claude-sonnet-4-6",
  "openai-codex": "gpt-5.5",
  // Copilot uses DOTTED model ids (claude-sonnet-4.6), unlike native Anthropic.
  "github-copilot": "claude-sonnet-4.6",
  opencode: "claude-sonnet-4-6",
  "opencode-go": "glm-5.1",
  openrouter: "anthropic/claude-sonnet-4.6",
  google: "gemini-3-flash-preview",
  // No catalog default — the model is whatever the user's local server serves.
  "openai-compatible": "",
};

/**
 * pi's REAL model catalog per provider (captured from `getModels(...)`).
 *
 * Only the native subscription providers (anthropic / openai-codex) are
 * enumerated: `getModel` returns undefined for an unlisted id on these, so a
 * stored model MUST be checked against this set. Every other provider is left
 * absent on purpose and its stored model passes through untouched —
 * opencode / opencode-go / openrouter / google forward an arbitrary id to the
 * gateway, openai-compatible has no catalog at all, and github-copilot is left
 * open here (its dotted ids change with the gateway) with the runtime's
 * read-time `safeGetModel` guard as the backstop for a stale id.
 */
export const VALID_MODELS: Partial<Record<ProviderId, ReadonlySet<string>>> = {
  anthropic: new Set([
    "claude-3-5-haiku-20241022",
    "claude-3-5-haiku-latest",
    "claude-3-5-sonnet-20240620",
    "claude-3-5-sonnet-20241022",
    "claude-3-7-sonnet-20250219",
    "claude-3-haiku-20240307",
    "claude-3-opus-20240229",
    "claude-3-sonnet-20240229",
    "claude-haiku-4-5",
    "claude-haiku-4-5-20251001",
    "claude-opus-4-0",
    "claude-opus-4-1",
    "claude-opus-4-1-20250805",
    "claude-opus-4-20250514",
    "claude-opus-4-5",
    "claude-opus-4-5-20251101",
    "claude-opus-4-6",
    "claude-opus-4-7",
    "claude-opus-4-8",
    "claude-sonnet-4-0",
    "claude-sonnet-4-20250514",
    "claude-sonnet-4-5",
    "claude-sonnet-4-5-20250929",
    "claude-sonnet-4-6",
  ]),
  "openai-codex": new Set([
    "gpt-5.3-codex-spark",
    "gpt-5.4",
    "gpt-5.4-mini",
    "gpt-5.5",
  ]),
};

/**
 * Legacy provider name → pi ProviderId. The CLI era spoke "openai" (and the
 * informal "codex"/"chatgpt"); pi calls that same subscription "openai-codex".
 * Everything else is either already a pi id (handled separately) or unknown.
 */
export const PROVIDER_ALIASES: Record<string, ProviderId> = {
  openai: "openai-codex",
  codex: "openai-codex",
  chatgpt: "openai-codex",
  claude: "anthropic",
};

/**
 * Legacy / CLI-era model id → pi model id, AT THE SAME TIER (never an upgrade).
 * Keyed by the MAPPED provider so the same bare alias resolves correctly per
 * provider. Only ids that are NOT already in VALID_MODELS need an entry here —
 * a still-valid id (e.g. "claude-opus-4-8", "gpt-5.5") is kept verbatim and
 * never consults this table.
 *
 * Anthropic tiers: opus (most capable) / sonnet (balanced) / haiku (fastest).
 * The bare aliases the Claude CLI accepted map to the current pi id at the SAME
 * tier.
 */
export const MODEL_ALIASES: Partial<
  Record<ProviderId, Record<string, string>>
> = {
  anthropic: {
    // Bare tier names the Claude CLI accepted.
    opus: "claude-opus-4-8",
    sonnet: "claude-sonnet-4-6",
    haiku: "claude-haiku-4-5",
    // "latest"-style aliases the CLI used that pi doesn't expose verbatim.
    "claude-opus-latest": "claude-opus-4-8",
    "claude-sonnet-latest": "claude-sonnet-4-6",
    "claude-haiku-latest": "claude-haiku-4-5",
  },
  "openai-codex": {
    // CLI-era Codex ids that predate pi's gpt-5.x line, mapped to the closest
    // current tier. Codex's full tier is gpt-5.5; the mini tier is gpt-5.4-mini.
    "gpt-5": "gpt-5.5",
    "gpt-5-codex": "gpt-5.5",
    "gpt-5.1": "gpt-5.5",
    "gpt-5.2": "gpt-5.5",
    codex: "gpt-5.5",
    "gpt-5-mini": "gpt-5.4-mini",
    "gpt-5.1-mini": "gpt-5.4-mini",
  },
};
