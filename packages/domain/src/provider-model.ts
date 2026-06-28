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
  // Open-catalog gateways: pi forwards any id to the gateway, so keep whatever
  // was stored (or its default when absent).
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
