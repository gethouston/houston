import { legacyModelAlias } from "./model-aliases";
import {
  DEFAULT_MODEL,
  DEFAULT_PROVIDER,
  isProviderId,
  PROVIDER_ALIASES,
  type ProviderId,
  VALID_MODELS,
} from "./provider-model-catalog";
import type { DocDiagnostic } from "./store";

export type { ProviderId } from "./provider-model-catalog";
export { DEFAULT_PROVIDER } from "./provider-model-catalog";

function ownEntry<T>(
  table: Readonly<Record<string, T | undefined>>,
  key: string,
): T | undefined {
  return Object.hasOwn(table, key) ? table[key] : undefined;
}

export function canonicalProviderId(raw: string): ProviderId | null {
  if (!raw) return null;
  if (isProviderId(raw)) return raw;
  return ownEntry(PROVIDER_ALIASES, raw) ?? raw;
}

export function canonicalModelId(
  provider: ProviderId,
  raw: string,
): string | null {
  const valid = ownEntry(VALID_MODELS, provider);
  const alias = legacyModelAlias(provider, raw);
  if (!valid) return alias ?? raw;
  if (valid.has(raw)) return raw;
  return alias && valid.has(alias) ? alias : null;
}

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

function defaultModelFor(provider: ProviderId): string {
  return ownEntry(DEFAULT_MODEL, provider) ?? "";
}

function mapModel(
  provider: ProviderId,
  raw: string | undefined,
  diagnostics: DocDiagnostic[],
  key: string,
): string {
  const fallback = defaultModelFor(provider);
  if (!raw) {
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
