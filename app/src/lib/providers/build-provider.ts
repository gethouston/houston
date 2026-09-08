import type { CatalogModelEntry, ProviderCatalog } from "@houston/protocol";
// Value import via the self-contained subpath (NOT the barrel): the app's
// node --experimental-strip-types test runner can't resolve the barrel's
// extensionless re-exports, and this leaf module has no imports of its own.
import { resolveModelWindow } from "@houston/protocol/model-windows";
// Same self-contained-subpath rule: the ONE provider dialect + default-model +
// legacy-alias tables, owned by `@houston/domain` and re-exported by the SDK.
import {
  DEFAULT_MODEL,
  modelDisplayName,
  toCanonicalProviderId,
} from "@houston/sdk/provider-catalog";
import { normalizeKey } from "../ai-hub/catalog-key.ts";
import { isModelVisible } from "../provider-overrides/pi-catalog-filters.ts";
import type { ProviderOverride } from "../provider-overrides/types.ts";
import type { EffortLevel, ModelOption, ProviderInfo } from "./types.ts";

/**
 * ONE pi catalog provider → ONE Houston provider card. The assembly the live
 * catalog (`./catalog.ts`) runs over every pi provider it keeps.
 */

/**
 * pi-ai's per-model `thinkingLevels` → Houston `EffortLevel`s, low→high. Drops
 * pi's `off` and `minimal` (Houston's effort scale starts at `low`) and passes
 * `low|medium|high|xhigh` through 1:1. This is the DEFAULT source of a model's
 * effort set — pi's per-model reasoning ladder is authoritative, so the catalog
 * stays honest as pi adds models without a hand-curated list to maintain.
 * Non-reasoning models, or reasoning models with no thinking levels, get `[]`,
 * so the picker hides the effort row. Input order (pi emits ascending) is
 * preserved.
 */
const PI_EFFORT_MAP: Readonly<Record<string, EffortLevel>> = {
  low: "low",
  medium: "medium",
  high: "high",
  xhigh: "xhigh",
};

export function deriveEffortLevels(
  thinkingLevels: string[] | undefined,
  reasoning: boolean,
): EffortLevel[] {
  if (!reasoning || !thinkingLevels) return [];
  const out: EffortLevel[] = [];
  for (const level of thinkingLevels) {
    const mapped = PI_EFFORT_MAP[level];
    if (mapped) out.push(mapped);
  }
  return out;
}

/**
 * Collapse pi model entries that fold to the SAME picker identity within one
 * provider, so a provider never yields two rows the hub catalog merges into a
 * single enriched entry (which would leave the other row bare + un-enriched).
 * Two entries collapse when their display names normalize to the same
 * cross-provider key (e.g. Bedrock's regional `us.`/`eu.` Opus variants). The
 * survivor is the SAME one the hub keeps as its offer — the CLEANER id (shortest,
 * then lexicographically first) — so the surviving row's `${providerId}::${id}`
 * matches the hub offer and gets enriched. First-seen order is preserved.
 */
function dedupeModelEntries(
  entries: readonly CatalogModelEntry[],
): CatalogModelEntry[] {
  const indexByKey = new Map<string, number>();
  const out: CatalogModelEntry[] = [];
  for (const entry of entries) {
    const key = normalizeKey(entry.name);
    const at = indexByKey.get(key);
    if (at === undefined) {
      indexByKey.set(key, out.length);
      out.push(entry);
      continue;
    }
    const kept = out[at];
    const cleaner =
      entry.id.length < kept.id.length ||
      (entry.id.length === kept.id.length && entry.id < kept.id);
    if (cleaner) out[at] = entry;
  }
  return out;
}

/**
 * The default model Houston pre-selects for a provider, from the ONE table that
 * owns it (`@houston/domain` `provider-default-models.ts`, keyed by pi's
 * canonical ids). `undefined` for a provider with no catalog default — the
 * caller falls back to the provider's first pi model, never to another
 * provider's.
 *
 * Read here rather than restated in `PROVIDER_OVERRIDES`: the app, the runtime
 * env defaults and the migration that rewrites stored configs all answered this
 * question separately, and Anthropic drifted to two different models.
 */
function catalogDefaultModel(houstonId: string): string | undefined {
  return DEFAULT_MODEL[toCanonicalProviderId(houstonId)];
}

/**
 * The model a provider card pre-selects: its curated default, else the first
 * model it offers, else `""` — no default to pin. ONE chain for the hydrated
 * and the seeded card: the seed's model list is empty until the pi catalog
 * arrives, so a provider without a curated default honestly seeds `""` instead
 * of a fabricated id (see `getDefaultModel` for how callers read it).
 */
export function defaultModelFor(
  houstonId: string,
  models: readonly ModelOption[],
): string {
  return catalogDefaultModel(houstonId) ?? models[0]?.id ?? "";
}

/**
 * Build one `ProviderInfo` from a pi catalog provider + its Houston override. pi
 * supplies the runnable model set (ids, windows, thinking levels, reasoning); the
 * override layers on the brand name, per-model label/description/effort, and the
 * credit-gated snap-up ceiling pi can't know. `finalId` is the Houston provider
 * id (post-rename), which selects the override and the frontend logo/card.
 */
export function buildProvider(
  piProvider: ProviderCatalog[number],
  finalId: string,
  override: ProviderOverride | undefined,
): ProviderInfo {
  // Model NAMES are shared vocabulary (picker, error cards, the assistant's
  // spoken-name ladder), so they come from the domain table, keyed by pi's ids.
  const canonicalId = toCanonicalProviderId(finalId);
  // Curated providers (`VISIBLE_MODELS`) surface only their curated ids; the
  // AI-hub directory applies the same gate (`piCatalogToCandidates`), so the
  // picker and the hub always show the identical set.
  const visibleEntries = piProvider.models.filter((entry) =>
    isModelVisible(finalId, entry.id),
  );
  const models: ModelOption[] = dedupeModelEntries(visibleEntries).map(
    (entry) => {
      const mo = override?.models?.[entry.id];
      const effort =
        mo?.effortLevels ??
        deriveEffortLevels(entry.thinkingLevels, entry.reasoning);
      // Window sizing comes from the SHARED `@houston/protocol` table (keyed by
      // pi's provider id — pre-rename, so Codex is `openai-codex` here), the same
      // source the runtime's autocompact reads, so the bar and the engine divide
      // by identical numbers. Falls back to pi's raw window when uncurated.
      const window = resolveModelWindow(
        piProvider.id,
        entry.id,
        entry.contextWindow,
      );
      return {
        id: entry.id,
        label: modelDisplayName(canonicalId, entry.id) ?? entry.name,
        description: mo?.description ?? "",
        acceptsImages: entry.vision === true,
        contextWindow: window.default,
        // Omit when there is no upward gating, matching the "absent = no snap"
        // contract `getContextWindowConfig` reads.
        contextWindowMax:
          window.max !== window.default ? window.max : undefined,
        // Empty → omit, so `getEffortLevels`/the picker treat it as no effort row.
        effortLevels: effort.length > 0 ? effort : undefined,
      };
    },
  );
  return {
    id: finalId,
    name: override?.name ?? piProvider.name,
    subtitle: override?.subtitle ?? "",
    installUrl: override?.installUrl ?? "",
    cost: override?.cost ?? "",
    models,
    defaultModel: defaultModelFor(finalId, models),
    auth: override?.auth ?? (piProvider.auth === "oauth" ? "oauth" : "apiKey"),
    apiKeyUrl: override?.apiKeyUrl,
    copilotConnect: override?.copilotConnect,
    gatewayIds: override?.gatewayIds,
  };
}
