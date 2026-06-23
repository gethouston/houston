/**
 * Legacy → pi provider/model migration (pure, table-driven, no I/O).
 *
 * The Rust-desktop era stored each agent's choice in
 * `~/.houston/workspaces/<W>/<A>/.houston/config/config.json` as
 * `{ provider, model }` using the OLD names ("openai", bare "opus"/"sonnet",
 * CLI-era model ids). The pi runtime resolves a turn's model from its OWN
 * `settings.json` (`activeProvider` + `models[provider]`) and calls pi-ai's
 * `getModel(provider, id)`. For an id the provider doesn't offer, pi-ai returns
 * `undefined` — which then crashes the turn downstream — so an un-migrated
 * legacy value breaks the agent's first turn with a confusing error. Migrating
 * the id up front (or the runtime's read-time guard, packages/runtime
 * safeGetModel) avoids that.
 *
 * This module maps a stored `(provider, model)` to a `(ProviderId, model)` pi
 * actually accepts:
 *   - provider: "openai" → "openai-codex"; already-valid pi ids pass through;
 *     anything else falls back to the default provider WITH a diagnostic.
 *   - model: if already a valid pi model for the mapped provider, keep it; else
 *     map a known legacy alias to the closest pi id AT THE SAME TIER (never an
 *     auto-upgrade); else fall soft to the provider's default WITH a diagnostic.
 *
 * It is intentionally self-contained (the valid-model catalog is hard-coded
 * below, NOT read from pi-ai) so `@houston/domain` stays free of the pi-ai
 * dependency and the open/closed boundary. The catalog was captured from
 * `getModels("anthropic")` / `getModels("openai-codex")` — keep it in sync when
 * pi's catalog changes (a stale entry only ever means we migrate to the
 * provider default + emit a diagnostic, never a throw).
 */

import type { DocDiagnostic } from "./store";

/** pi's provider ids (mirror of packages/runtime ProviderId). */
export type ProviderId =
  | "anthropic"
  | "openai-codex"
  | "opencode"
  | "opencode-go";

const PROVIDER_IDS: readonly ProviderId[] = [
  "anthropic",
  "openai-codex",
  "opencode",
  "opencode-go",
];

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
const DEFAULT_MODEL: Record<ProviderId, string> = {
  anthropic: "claude-sonnet-4-6",
  "openai-codex": "gpt-5.5",
  opencode: "claude-sonnet-4-6",
  "opencode-go": "glm-5.1",
};

/**
 * pi's REAL model catalog per provider (captured from `getModels(...)`).
 *
 * Only the two OAuth providers are enumerated: `getModel` throws for an
 * unlisted id on these, so a stored model MUST be checked against this set.
 * The api-key gateways (opencode / opencode-go) are OPEN catalogs — pi forwards
 * an arbitrary model id to the gateway — so they are intentionally absent here
 * and their stored models always pass through untouched.
 */
const VALID_MODELS: Partial<Record<ProviderId, ReadonlySet<string>>> = {
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
const PROVIDER_ALIASES: Record<string, ProviderId> = {
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
 * tier. "claude-3-5-sonnet" et al. are already in the catalog, so absent here.
 */
const MODEL_ALIASES: Partial<Record<ProviderId, Record<string, string>>> = {
  anthropic: {
    // Bare tier names the Claude CLI accepted.
    opus: "claude-opus-4-8",
    sonnet: "claude-sonnet-4-6",
    haiku: "claude-haiku-4-5",
    // "latest"-style aliases the CLI used that pi doesn't expose verbatim.
    "claude-opus-latest": "claude-opus-4-8",
    "claude-sonnet-latest": "claude-sonnet-4-6",
    "claude-haiku-latest": "claude-haiku-4-5",
    // "-4-5"/"-4-0" short forms without a date stay at the same minor where pi
    // already lists a dateless id; only add entries pi does NOT already offer.
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

const isProviderId = (s: string): s is ProviderId =>
  (PROVIDER_IDS as readonly string[]).includes(s);

/** Map a stored provider string to a pi ProviderId, recording a diagnostic when
 * it falls back. Returns the mapped id + whether a diagnostic was emitted. */
function mapProvider(
  raw: string | undefined,
  diagnostics: DocDiagnostic[],
  key: string,
): ProviderId {
  if (raw && isProviderId(raw)) return raw;
  if (raw && PROVIDER_ALIASES[raw]) return PROVIDER_ALIASES[raw];
  diagnostics.push({
    key,
    message: `unknown provider ${JSON.stringify(raw)} → defaulting to ${DEFAULT_PROVIDER}`,
  });
  return DEFAULT_PROVIDER;
}

/** Map a stored model to a valid pi model for `provider`, recording a
 * diagnostic when it can't be placed and falls back to the provider default. */
function mapModel(
  provider: ProviderId,
  raw: string | undefined,
  diagnostics: DocDiagnostic[],
  key: string,
): string {
  const valid = VALID_MODELS[provider];
  // Open-catalog provider (opencode / opencode-go): pi forwards any id to the
  // gateway, so keep whatever was stored (or its default when absent).
  if (!valid) return raw || DEFAULT_MODEL[provider];
  if (!raw) return DEFAULT_MODEL[provider];
  if (valid.has(raw)) return raw;
  const alias = MODEL_ALIASES[provider]?.[raw];
  if (alias && valid.has(alias)) return alias;
  diagnostics.push({
    key,
    message: `unknown ${provider} model ${JSON.stringify(raw)} → falling back to ${DEFAULT_MODEL[provider]}`,
  });
  return DEFAULT_MODEL[provider];
}

export interface MigratedProviderModel {
  provider: ProviderId;
  model: string;
  diagnostics: DocDiagnostic[];
}

/**
 * Migrate a stored `(provider, model)` (legacy or current) to a `(ProviderId,
 * model)` pi-ai accepts. Pure. The result's provider is ALWAYS a valid
 * ProviderId and the model is ALWAYS one pi offers for that provider (for the
 * OAuth providers) or the stored/default id (for the open-catalog gateways).
 * Unknowns never throw — they fall soft to a documented default and surface a
 * diagnostic (beta no-silent-failure policy).
 *
 * `diagnosticKey` is the source the diagnostic points at (defaults to the
 * config doc path so a UI can show "we adjusted this agent's model").
 */
export function migrateProviderModel(
  rawProvider: string | undefined,
  rawModel: string | undefined,
  diagnosticKey = ".houston/config/config.json",
): MigratedProviderModel {
  const diagnostics: DocDiagnostic[] = [];
  const provider = mapProvider(rawProvider, diagnostics, diagnosticKey);
  const model = mapModel(provider, rawModel, diagnostics, diagnosticKey);
  return { provider, model, diagnostics };
}
