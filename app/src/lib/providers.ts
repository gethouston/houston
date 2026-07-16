import type { CatalogModelEntry, ProviderCatalog } from "@houston/protocol";
// Value import via the self-contained subpath (NOT the barrel): the app's
// node --experimental-strip-types test runner can't resolve the barrel's
// extensionless re-exports, and this leaf module has no imports of its own.
import { resolveModelWindow } from "@houston/protocol/model-windows";
import type { Capabilities } from "@houston-ai/engine-client";
import { normalizeKey } from "./ai-hub/catalog-key.ts";
import {
  DROP_PI_PROVIDERS,
  isModelVisible,
  LOCAL_PROVIDER,
  PROVIDER_ID_RENAME,
  PROVIDER_OVERRIDES,
  type ProviderOverride,
} from "./provider-overrides.ts";

/**
 * Reasoning-effort levels, ordered low→high. `xhigh` is the top tier: it is the
 * deepest reasoning any provider actually exposes (pi's ceiling, which the
 * Claude backend maps to the SDK's `max` effort). Houston used to carry a fifth
 * `max` tier above `xhigh`, but the two produced the byte-identical API request
 * on every provider — a label with no effect — so it was removed. The set a
 * given model accepts is model-specific (see `ModelOption.effortLevels`),
 * derived from pi's per-model thinking levels (`deriveEffortLevels`).
 */
export type EffortLevel = "low" | "medium" | "high" | "xhigh";

/**
 * The full effort vocabulary, ascending. Drives the composer's effort-gauge so
 * the icon always shows the SAME number of bars (filled to the active level's
 * position), regardless of how many levels a given model offers — a model with
 * only `high`/`xhigh` reads as a nearly-full gauge, not two lone bars.
 */
export const EFFORT_ORDER: readonly EffortLevel[] = [
  "low",
  "medium",
  "high",
  "xhigh",
];

/** Effort applied when nothing else is configured. Mirrors the engine. */
export const DEFAULT_EFFORT: EffortLevel = "medium";

export interface ModelOption {
  id: string;
  label: string;
  description: string;
  /**
   * Reasoning-effort levels this model accepts, ordered low→high. Omitted
   * or empty means the model has no effort control and the picker hides the
   * effort row (e.g. Haiku).
   */
  effortLevels?: readonly EffortLevel[];
  /**
   * Default assumed context window (tokens) — the denominator the composer's
   * context-usage indicator STARTS with. The real window is plan/credit-gated
   * and is NOT reported by `claude -p` (verified: the stream's `system init`
   * event carries only `model`, no window; no flag, no env var). Specifically:
   *   - Opus 4.x: 1M only on Max/Team/Enterprise (automatic) or with usage
   *     credits; 200k on Pro without credits.
   *   - Sonnet 4.6: 200k unless usage credits are enabled (on every plan).
   *   - Codex caps gpt-5.5 at ~272k regardless of the 1M raw API offer.
   * So this is an estimate. The indicator snaps UP to `contextWindowMax` once
   * a session's observed usage exceeds this default, which PROVES the real
   * window is larger (Claude Code auto-compacts before the limit, so observed
   * usage can never exceed the true window). Omit to hide the % and show a raw
   * token count instead.
   */
  contextWindow?: number;
  /**
   * Snap-up ceiling (tokens) for the self-correcting estimate. When a
   * session's observed usage exceeds `contextWindow`, the indicator switches
   * the denominator to this value. Defaults to `contextWindow` when omitted
   * (no snapping). Set above `contextWindow` only for models whose window is
   * gated upward at runtime — e.g. Sonnet 4.6 (200k default → 1M with credits).
   */
  contextWindowMax?: number;
}

export interface ProviderInfo {
  id: string;
  name: string;
  subtitle: string;
  installUrl: string;
  cost: string;
  models: readonly ModelOption[];
  defaultModel: string;
  /**
   * How the user connects this provider. Default (absent) is subscription OAuth
   * (Claude / Codex). `"apiKey"` providers ask the user to
   * paste a key instead. Houston opens `apiKeyUrl` for them to grab one.
   * `"openaiCompatible"` providers (an OpenAI-compatible server: Ollama / vLLM /
   * LM Studio, reached directly or through a tunnel) ask for a base URL + model
   * id. Both run only on the new TS engine, and `openaiCompatible` surfaces
   * wherever the host reports the `openaiCompatible` capability (desktop, cloud,
   * or self-host) — see `getVisibleProviders`.
   */
  auth?: "oauth" | "apiKey" | "openaiCompatible";
  /** For `auth: "apiKey"`: the dashboard URL where the user creates/copies the key. */
  apiKeyUrl?: string;
  /**
   * GitHub Copilot: connecting opens a small dialog to choose Personal
   * (github.com) vs Company / GitHub Enterprise (which collects the company
   * GitHub domain). Both drive the single `github-copilot` engine provider — the
   * only difference is the domain passed at login (stored as the credential's
   * `enterpriseUrl`, which routes the device-code flow + central token refresh at
   * the company's GitHub). See `useCopilotConnect`.
   */
  copilotConnect?: boolean;
  /**
   * The engine gateway ids a single connect card stands in for. Only the merged
   * "OpenCode" account sets it (`["opencode", "opencode-go"]`); absent on every
   * other provider, which is its own single gateway. A pasted key is written to
   * (and sign-out clears) every id in this set. See `getConnectProviders` and
   * `providerGatewayIds`.
   */
  gatewayIds?: readonly string[];
}

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
 * Build one `ProviderInfo` from a pi catalog provider + its Houston override. pi
 * supplies the runnable model set (ids, windows, thinking levels, reasoning); the
 * override layers on the brand name, per-model label/description/effort, and the
 * credit-gated snap-up ceiling pi can't know. `finalId` is the Houston provider
 * id (post-rename), which selects the override and the frontend logo/card.
 */
function buildProvider(
  piProvider: ProviderCatalog[number],
  finalId: string,
  override: ProviderOverride | undefined,
): ProviderInfo {
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
        label: mo?.label ?? entry.name,
        description: mo?.description ?? "",
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
    defaultModel: override?.defaultModel ?? models[0]?.id ?? "",
    auth: override?.auth ?? (piProvider.auth === "oauth" ? "oauth" : "apiKey"),
    apiKeyUrl: override?.apiKeyUrl,
    copilotConnect: override?.copilotConnect,
    gatewayIds: override?.gatewayIds,
  };
}

/**
 * The full provider list built from a pi catalog: drop the pi providers that
 * collide with a rename (`DROP_PI_PROVIDERS`, applied first), rename ids
 * (`PROVIDER_ID_RENAME` — pi `openai-codex` → Houston `openai`), layer on the
 * Houston overrides, then append the local OpenAI-compatible provider pi has no
 * concept of.
 */
function buildCatalog(catalog: ProviderCatalog): ProviderInfo[] {
  const built: ProviderInfo[] = [];
  for (const piProvider of catalog) {
    if (DROP_PI_PROVIDERS.has(piProvider.id)) continue;
    const finalId = PROVIDER_ID_RENAME[piProvider.id] ?? piProvider.id;
    built.push(buildProvider(piProvider, finalId, PROVIDER_OVERRIDES[finalId]));
  }
  built.push({ ...LOCAL_PROVIDER });
  return built;
}

/**
 * Seed the provider list from the Houston overrides ALONE — every first-class
 * provider with its metadata but an EMPTY model list, plus the local provider —
 * so every helper below works before the pi catalog has loaded (nothing throws,
 * the connect surfaces render their cards) and the picker fills in models once
 * `hydrateProviderCatalog` runs.
 */
function buildSeed(): ProviderInfo[] {
  const seed: ProviderInfo[] = [];
  for (const [id, override] of Object.entries(PROVIDER_OVERRIDES)) {
    seed.push({
      id,
      name: override.name ?? id,
      subtitle: override.subtitle ?? "",
      installUrl: override.installUrl ?? "",
      cost: override.cost ?? "",
      models: [],
      defaultModel: override.defaultModel ?? "",
      auth: override.auth ?? "apiKey",
      apiKeyUrl: override.apiKeyUrl,
      copilotConnect: override.copilotConnect,
      gatewayIds: override.gatewayIds,
    });
  }
  seed.push({ ...LOCAL_PROVIDER });
  return seed;
}

/**
 * The live provider catalog. A MUTABLE array with a STABLE reference: it starts
 * as the override-only seed and is rebuilt IN PLACE by `hydrateProviderCatalog`
 * from the host's `/v1/catalog` payload, so every module that imported `PROVIDERS`
 * sees the hydrated set at read time without re-importing. All the helpers below
 * read this array.
 */
export const PROVIDERS: ProviderInfo[] = buildSeed();

/** Display name for a provider id, falling back to the id itself. */
export function providerName(id: string): string {
  return PROVIDERS.find((p) => p.id === id)?.name ?? id;
}

/**
 * Replace `PROVIDERS` in place with the catalog built from the host's pi-ai
 * catalog (`useProviderCatalog` calls this on fetch). Mutates the existing array
 * rather than reassigning so live `PROVIDERS` importers pick up the new set.
 */
export function hydrateProviderCatalog(catalog: ProviderCatalog): void {
  // An empty catalog is NOT a deployment with zero providers: every deployment
  // serves the full pi-ai set, so `[]` means a broken host or empty registry.
  // Rebuilding from it would wipe the override seed down to just the local
  // provider, emptying the picker + connect surfaces. Keep the seed instead so
  // the UI stays populated, but warn — an empty catalog is never expected on a
  // healthy host and points at a deploy/registry problem worth investigating.
  if (catalog.length === 0) {
    console.warn(
      "[providers] hydrateProviderCatalog called with an empty catalog; keeping the seed",
    );
    return;
  }
  const built = buildCatalog(catalog);
  PROVIDERS.length = 0;
  PROVIDERS.push(...built);
}

/** Find a provider by id. */
export function getProvider(id: string): ProviderInfo | undefined {
  return PROVIDERS.find((p) => p.id === id);
}

/** Empty capability set used while hosted capabilities are still loading. */
export const EMPTY_PROVIDER_CAPABILITIES: Pick<
  Capabilities,
  "providers" | "openaiCompatible"
> = Object.freeze({
  providers: [],
  openaiCompatible: false,
});

/** Options common to the provider-visibility helpers. */
interface ProviderVisibilityOpts {
  newEngine: boolean;
  desktop?: boolean;
  capabilities?: Pick<Capabilities, "providers" | "openaiCompatible">;
}

/**
 * Whether to show the OpenAI-compatible (local / BYO model) provider. It runs
 * only on the new TS engine, and the host's `openaiCompatible` capability
 * decides — desktop hosts report it, and cloud/pod hosts now can too, so this is
 * no longer desktop-gated. When capabilities have loaded, an explicit `true` is
 * required. Before they load, desktop shows it optimistically (its co-located
 * host always supports it) while web/hosted stays hidden, so the option never
 * flashes on a Rust-engine or capability-less host.
 */
function showOpenaiCompatible(opts: ProviderVisibilityOpts): boolean {
  if (!opts.newEngine) return false;
  if (opts.capabilities) return opts.capabilities.openaiCompatible === true;
  return !!opts.desktop;
}

/**
 * Providers to show in connect UIs. `/v1/catalog` is the SINGLE visibility
 * source: `PROVIDERS` is hydrated from it, so it already IS this deployment's
 * runnable set (the full pi-ai catalog, ~35, on every deployment) — no
 * `capabilities.providers` re-gate is applied here (that narrower list
 * under-showed the picker). The one exclusion: the local OpenAI-compatible (BYO
 * model) provider is gated by the host's `openaiCompatible` capability (see
 * `showOpenaiCompatible`). Pass `newEngineActive()` and `osIsTauri()` from the
 * caller (they steer the local-provider gate).
 */
export function getVisibleProviders(
  opts: ProviderVisibilityOpts,
): readonly ProviderInfo[] {
  return PROVIDERS.filter((p) => {
    if (p.auth === "openaiCompatible") return showOpenaiCompatible(opts);
    return true;
  });
}

/**
 * The two OpenCode gateways — `opencode` (Zen, pay-as-you-go) and `opencode-go`
 * (Go, $10/mo subscription) — authenticate with the SAME opencode.ai key (pi
 * reads `OPENCODE_API_KEY` for both). Houston therefore presents ONE connectable
 * "OpenCode" account on the connect surfaces: the pasted key is stored under both
 * gateways (the adapter fans it out — see `credentialSiblings`), so a single
 * connect lights up both, and sign-out clears both. There is no way to tell a Go
 * subscription apart from Zen credits at connect time, and no need to — the model
 * the user picks selects the gateway, and opencode.ai enforces entitlement per
 * request (surfaced as a provider-error card).
 *
 * The chat model picker does NOT use this card: it maps `PROVIDERS` directly, so
 * Zen and Go stay separate, clearly-labelled model sections (HOU-577).
 */
const OPENCODE_ACCOUNT: ProviderInfo = {
  id: "opencode",
  name: "OpenCode",
  subtitle: "Zen models or the Go subscription, one key",
  installUrl: "https://opencode.ai/auth",
  cost: "Pay as you go, or $10 / month with Go",
  auth: "apiKey",
  apiKeyUrl: "https://opencode.ai/auth",
  gatewayIds: ["opencode", "opencode-go"],
  // Connect surfaces never render a model list; the chat picker reads the two
  // real catalog entries (opencode / opencode-go) for its Zen + Go sections.
  models: [],
  defaultModel: "claude-sonnet-4-6",
};

/**
 * Providers for the CONNECT surfaces (settings account list + onboarding
 * picker), where the two OpenCode gateways collapse into one "OpenCode" account
 * card. Otherwise identical to `getVisibleProviders` (same new-engine /
 * capability gating), preserving catalog order — the merged card takes
 * OpenCode's slot.
 */
export function getConnectProviders(
  opts: ProviderVisibilityOpts,
): readonly ProviderInfo[] {
  const out: ProviderInfo[] = [];
  let mergedOpenCode = false;
  for (const p of getVisibleProviders(opts)) {
    if (p.id === "opencode" || p.id === "opencode-go") {
      // Replace the first OpenCode gateway with the merged account, drop the
      // second — both are represented by the one card.
      if (!mergedOpenCode) {
        out.push(OPENCODE_ACCOUNT);
        mergedOpenCode = true;
      }
      continue;
    }
    out.push(p);
  }
  return out;
}

/**
 * The engine gateway ids a connect card maps to: its `gatewayIds` when set (the
 * merged OpenCode account → both gateways), else just its own id. Connect
 * surfaces fan their status probe / sign-out across this set.
 */
export function providerGatewayIds(p: ProviderInfo): readonly string[] {
  return p.gatewayIds ?? [p.id];
}

/** Find the model object for a provider + model id. */
export function getModel(
  providerId: string,
  modelId: string,
): ModelOption | undefined {
  return getProvider(providerId)?.models.find((m) => m.id === modelId);
}

/** Get the default provider + model for a provider id. */
export function getDefaultModel(providerId: string): string {
  return getProvider(providerId)?.defaultModel ?? "claude-sonnet-4-6";
}

/** Default + snap-up ceiling for a model's context window (tokens). */
export interface ContextWindowConfig {
  /** Starting denominator for the usage indicator (the estimate). */
  default: number;
  /** Snap-up ceiling once observed usage proves a larger window. */
  max: number;
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
 * Return `providerId` only when it names a currently-active provider in
 * `PROVIDERS`. Used by the chat model selector and the per-chat
 * effective-provider fallback chain to skip stored values that point at
 * providers Houston has dropped (e.g. an activity record from a previous
 * Houston version that selected a provider that is no longer available).
 * Callers chain it with `??` to fall through to the next tier of preference.
 */
export function validProviderOrNull(
  providerId: string | null | undefined,
): string | null {
  return providerId && getProvider(providerId) ? providerId : null;
}

/**
 * Return `modelId` only when it names a model currently listed in `PROVIDERS`
 * for `providerId`. Stored configs can point at retired SKUs (e.g. the
 * phantom `gpt-5.5-codex` that ChatGPT never shipped); chain with `??
 * getDefaultModel(provider)` so the picker and the wire call agree on a
 * model the server will actually accept.
 */
/**
 * Providers whose model catalog is OPEN: the hydrated `PROVIDERS[].models` is the
 * pi-ai runnable set for the picker, NOT the exhaustive set the gateway can
 * route, so a live selection must not be validated against it. OpenRouter serves
 * the 300+ models the picker fetches live; the two OpenCode gateways route to
 * models pi's static catalog doesn't enumerate; the local OpenAI-compatible
 * endpoint runs whatever model the user's server exposes. For every OTHER
 * provider, pi-ai's catalog IS the runnable set, so `getModel` is authoritative.
 * Mirrors the domain's pass-through set (providers absent from `VALID_MODELS` in
 * `@houston/domain`).
 */
const OPEN_CATALOG_PROVIDERS: ReadonlySet<string> = new Set([
  "openrouter",
  "opencode",
  "opencode-go",
  "openai-compatible",
]);

/** Whether `providerId` runs any model id its upstream serves (see above). */
export function isOpenCatalogProvider(
  providerId: string | null | undefined,
): boolean {
  return !!providerId && OPEN_CATALOG_PROVIDERS.has(providerId);
}

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
 * Retired Claude CLI aliases → the explicit catalog ID that replaced them.
 * Mirrors the engine map in `houston-agent-files/src/lib.rs`
 * (`LEGACY_MODEL_ALIASES`) — keep both in sync.
 */
const LEGACY_MODEL_ALIASES: Readonly<Record<string, string>> = {
  opus: "claude-opus-4-7",
  sonnet: "claude-sonnet-4-6",
};

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
