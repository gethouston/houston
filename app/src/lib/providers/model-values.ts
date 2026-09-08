// Same self-contained-subpath rule as `./build-provider.ts`: the ONE
// legacy-alias table, owned by `@houston/domain` and re-exported by the SDK.
import { MODEL_ALIASES } from "@houston/sdk/provider-catalog";
import { getProvider, isOpenCatalogProvider } from "./lookup.ts";
import {
  type ContextWindowConfig,
  DEFAULT_EFFORT,
  type EffortLevel,
  type ModelOption,
} from "./types.ts";

/**
 * Reads about ONE model in the live catalog: its entry, a provider's default,
 * its context window, whether a stored value still names it, and the
 * reasoning-effort levels it accepts.
 */

/** Find the model object for a provider + model id. */
export function getModel(
  providerId: string,
  modelId: string,
): ModelOption | undefined {
  return getProvider(providerId)?.models.find((m) => m.id === modelId);
}

/**
 * The default model for a provider id (either dialect), or `""` when the
 * catalog does not carry that provider.
 *
 * `""` and not a literal: this used to answer `claude-sonnet-4-6` for ANY
 * provider it could not find, so a canonical `openai-codex` (which missed the
 * display-keyed catalog) was handed a Claude model — a pair no provider can
 * run, persisted into `config.json` by the creation flows. Callers treat the
 * empty answer as "no model to pin", which leaves the runtime to resolve the
 * turn; a model that belongs to someone else is never the safer answer.
 */
export function getDefaultModel(providerId: string): string {
  return getProvider(providerId)?.defaultModel ?? "";
}

/**
 * Context-window config for a provider+model, or `undefined` when the model is
 * unknown or its window isn't catalogued (the indicator then shows a raw token
 * count instead of a %). `max` falls back to `default` when the model has no
 * upward gating. See `effectiveContextWindow` for how the two combine with a
 * session's observed usage.
 */
export function getContextWindowConfig(
  providerId: string | null | undefined,
  modelId: string | null | undefined,
): ContextWindowConfig | undefined {
  if (!providerId || !modelId) return undefined;
  const model = getModel(providerId, modelId);
  if (model?.contextWindow == null) return undefined;
  return {
    default: model.contextWindow,
    max: model.contextWindowMax ?? model.contextWindow,
  };
}

/**
 * Return `modelId` only when it names a model currently listed in `PROVIDERS`
 * for `providerId`. Stored configs can point at retired SKUs (e.g. the
 * phantom `gpt-5.5-codex` that ChatGPT never shipped); chain with `??
 * getDefaultModel(provider)` so the picker and the wire call agree on a
 * model the server will actually accept.
 */
export function validModelOrNull(
  providerId: string | null | undefined,
  modelId: string | null | undefined,
): string | null {
  if (!providerId || !modelId) return null;
  // Open-catalog providers accept any live id, so never null a picked model
  // against the small curated seed list — otherwise the effective-model chain
  // silently reverts a live OpenRouter pick to the provider default.
  if (isOpenCatalogProvider(providerId)) return modelId;
  return getModel(providerId, modelId) ? modelId : null;
}

/**
 * Whether a model accepts image input, from the hydrated catalog. `undefined`
 * when the model isn't in `PROVIDERS` (pre-hydration, local/BYO, or an
 * open-catalog id) = unknown — callers must treat unknown as permitted, so a
 * missing catalog can never block an attachment the model might handle.
 */
export function modelAcceptsImages(
  providerId: string | null | undefined,
  modelId: string | null | undefined,
): boolean | undefined {
  if (!providerId || !modelId) return undefined;
  return getModel(providerId, modelId)?.acceptsImages;
}

/**
 * Retired Claude CLI aliases → the explicit catalog id that replaced them, read
 * from the SAME domain table the host applies when it rewrites a stored config
 * (`@houston/domain` `model-aliases.ts`). A bare tier name resolves to the
 * current model at that tier, never an upgrade.
 */
const LEGACY_MODEL_ALIASES: Readonly<Record<string, string>> =
  MODEL_ALIASES.anthropic ?? {};

/**
 * Interpret a model value that may have been persisted by an older Houston
 * build. The catalog pins explicit versions now, so a stored `"opus"`/`"sonnet"`
 * (an agent config the engine has not migrated yet, or an activity record —
 * those are never migrated) must be read as the version it denoted rather than
 * treated as unknown. Without this, `validModelOrNull` would null a legacy
 * `"opus"` and the effective-model chain would fall through to the default,
 * silently downgrading an Opus agent to Sonnet. Already-explicit IDs and other
 * providers' models pass through unchanged; null/undefined returns null so it
 * composes in `??` chains.
 */
export function normalizeLegacyModel(
  model: string | null | undefined,
): string | null {
  if (!model) return null;
  // `hasOwnProperty` guard so a hand-edited config with a model like
  // "constructor"/"__proto__" resolves to itself, not an Object.prototype member.
  return Object.hasOwn(LEGACY_MODEL_ALIASES, model)
    ? LEGACY_MODEL_ALIASES[model]
    : model;
}

/** Reasoning-effort levels the given provider+model accepts (low→high). */
export function getEffortLevels(
  providerId: string | null | undefined,
  modelId: string | null | undefined,
): readonly EffortLevel[] {
  if (!providerId || !modelId) return [];
  return getModel(providerId, modelId)?.effortLevels ?? [];
}

/**
 * Normalize a persisted effort value. Configs written by older Houston builds
 * may still carry the retired `"max"` tier; it always meant "the deepest
 * reasoning this model offers", which is now `"xhigh"` (the two produced the
 * identical API request), so map it there. Every other value passes through
 * unchanged, and `null`/`undefined` stay as-is so it composes in `??` chains.
 * The runtime still ACCEPTS `"max"` on the wire (`toThinkingLevel` maps it to
 * pi's `xhigh`), so a stored `"max"` runs correctly even before it is re-picked;
 * this keeps the UI honest by surfacing the level the user actually gets.
 */
export function normalizeEffort(
  effort: string | null | undefined,
): string | null | undefined {
  return effort === "max" ? "xhigh" : effort;
}

/**
 * The effort to actually use for a provider+model: the requested value when
 * the model accepts it, otherwise the shared default (or the lowest level if
 * the model somehow lacks `medium`). A legacy `"max"` is normalized to `"xhigh"`
 * first, so an agent carrying it keeps its top-tier reasoning instead of being
 * silently reset to the default. Returns `undefined` when the model has no
 * effort control, so callers omit the flag entirely. Mirrors the engine's
 * effort resolution, keeping the picker honest about what will run.
 */
export function validEffortOrDefault(
  providerId: string | null | undefined,
  modelId: string | null | undefined,
  effort: string | null | undefined,
): EffortLevel | undefined {
  const levels = getEffortLevels(providerId, modelId);
  if (levels.length === 0) return undefined;
  const normalized = normalizeEffort(effort);
  if (normalized && levels.includes(normalized as EffortLevel))
    return normalized as EffortLevel;
  return levels.includes(DEFAULT_EFFORT) ? DEFAULT_EFFORT : levels[0];
}
