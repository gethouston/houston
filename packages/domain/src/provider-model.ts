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
 *     auto-upgrade); else fall soft to THAT provider's own default WITH a
 *     diagnostic, and to `""` when it has none.
 *
 * The catalog/alias tables live in `provider-model-catalog.ts`.
 */

import {
  DEFAULT_MODEL,
  DEFAULT_PROVIDER,
  isProviderId,
  MODEL_ALIASES,
  PROVIDER_ALIASES,
  type ProviderId,
  VALID_MODELS,
} from "./provider-model-catalog";
import type { DocDiagnostic } from "./store";

export type { ProviderId } from "./provider-model-catalog";
export { DEFAULT_PROVIDER } from "./provider-model-catalog";

/**
 * A table read keyed by STORED user data. Every table here is an object
 * literal, so a plain `table[key]` also answers `Object.prototype`'s members: a
 * stored id of `constructor` or `toString` reads a function where a provider or
 * model id belongs, and that function then travels on as the migrated value (or
 * lands where a `ReadonlySet`'s `.has` is called). Only an OWN key is an entry.
 */
function ownEntry<T>(
  table: Readonly<Record<string, T | undefined>>,
  key: string,
): T | undefined {
  return Object.hasOwn(table, key) ? table[key] : undefined;
}

/**
 * Resolve a stored provider string to a pi ProviderId: a known id passes
 * through, a known legacy alias maps ("openai" → "openai-codex"), and any other
 * NON-EMPTY id passes through UNCHANGED — the pi-ai catalog is open (~35
 * providers, drifting), so a genuinely new id ("groq", "mistral") is NOT invalid
 * and must not be silently rewritten to the default. Only an empty/nullish id is
 * null. The ONE alias-resolution ladder — every consumer (agent-config
 * migration, routine pins, write-time validation) wraps this with its own
 * fallback policy.
 */
export function canonicalProviderId(raw: string): ProviderId | null {
  if (!raw) return null;
  if (isProviderId(raw)) return raw;
  return ownEntry(PROVIDER_ALIASES, raw) ?? raw;
}

/**
 * Resolve a stored model id for `provider`: a valid id passes through, a known
 * legacy alias maps at the same tier, an open-catalog gateway keeps anything
 * else verbatim, and a finite-catalog provider answers null for anything else.
 * Same single-ladder contract as `canonicalProviderId` — callers pick their own
 * fallback.
 *
 * The alias table is consulted for an open-catalog gateway TOO. Pass-through is
 * what lets a gateway route a model pi never baked, but a row pi RENAMED
 * (opencode's `mimo-v2.5-free` → `mimo-v2.6-flash-free`) has no model object
 * left to build a turn on, so passing it through is a pin that fails on every
 * fire. There is no valid-set to check the alias against — the gateway's live
 * catalog is the only authority — so the mapped id stands on the table's own
 * same-tier rule.
 */
export function canonicalModelId(
  provider: ProviderId,
  raw: string,
): string | null {
  const valid = ownEntry(VALID_MODELS, provider);
  const aliases = ownEntry(MODEL_ALIASES, provider);
  const alias = aliases ? ownEntry(aliases, raw) : undefined;
  if (!valid) return alias ?? raw;
  if (valid.has(raw)) return raw;
  return alias && valid.has(alias) ? alias : null;
}

/** Map a stored provider string to a pi ProviderId, recording a diagnostic when
 * it falls back. Returns the mapped id + whether a diagnostic was emitted. */
function mapProvider(
  raw: string | undefined,
  diagnostics: DocDiagnostic[],
  key: string,
): ProviderId {
  const canonical = raw ? canonicalProviderId(raw) : null;
  if (canonical) return canonical;
  diagnostics.push({
    key,
    message: `unknown provider ${JSON.stringify(raw)} → defaulting to ${DEFAULT_PROVIDER}`,
  });
  return DEFAULT_PROVIDER;
}

/**
 * A provider's OWN catalog default, or `""` when DEFAULT_MODEL has no entry for
 * it. Never another provider's model: the table is `Partial` over an open
 * ProviderId, so a floor keyed on DEFAULT_PROVIDER answered every uncurated
 * provider (groq, mistral, xai, …) with Codex's id — and this result is
 * PERSISTED, so a Groq agent's stored model became an OpenAI one.
 *
 * `""` is the honest "no opinion": the runtime's own ladder (the domain pick if
 * pi still lists it, else pi's first model for that provider) decides, and
 * every settings writer skips a falsy model rather than storing one.
 */
function defaultModelFor(provider: ProviderId): string {
  return ownEntry(DEFAULT_MODEL, provider) ?? "";
}

/** Map a stored model to a valid pi model for `provider`, recording a
 * diagnostic whenever the stored value is not what comes back. */
function mapModel(
  provider: ProviderId,
  raw: string | undefined,
  diagnostics: DocDiagnostic[],
  key: string,
): string {
  const fallback = defaultModelFor(provider);
  if (!raw) {
    // A config that GAINED a model it never carried is a change to the user's
    // data and is reported like any other. Nothing is gained when the provider
    // has no catalog default, so nothing is said.
    if (fallback)
      diagnostics.push({
        key,
        message: `no ${provider} model stored → defaulting to ${fallback}`,
      });
    return fallback;
  }
  const canonical = canonicalModelId(provider, raw);
  if (canonical) return canonical;
  diagnostics.push({
    key,
    message: fallback
      ? `unknown ${provider} model ${JSON.stringify(raw)} → falling back to ${fallback}`
      : `unknown ${provider} model ${JSON.stringify(raw)} → ${provider} has no catalog default, so the model is left unset`,
  });
  return fallback;
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
 * OAuth providers), the stored/default id (for the open-catalog gateways), or
 * `""` when that provider has no catalog default — never a model belonging to
 * a DIFFERENT provider. An empty model means the caller's own ladder picks;
 * `setSettings` skips it rather than storing it. Unknowns never throw — they
 * fall soft and surface a diagnostic (beta no-silent-failure policy).
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
