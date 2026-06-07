/**
 * Reasoning-effort levels, ordered low→high. The set a given model accepts
 * is model-specific (see `ModelOption.effortLevels`):
 * - Codex `model_reasoning_effort`: low/medium/high/xhigh (no `max`).
 * - Claude `--effort`: Opus 4.7 and 4.8 = all five; Sonnet 4.6 =
 *   low/medium/high/max (no `xhigh`). Claude self-clamps an unsupported
 *   value; Codex does not.
 */
export type EffortLevel = "low" | "medium" | "high" | "xhigh" | "max";

/** Effort applied when nothing else is configured. Mirrors the engine. */
export const DEFAULT_EFFORT: EffortLevel = "medium";

export interface ModelOption {
  id: string;
  label: string;
  description: string;
  /**
   * Reasoning-effort levels this model accepts, ordered low→high. Omitted
   * or empty means the model has no effort control and the picker hides the
   * effort row (e.g. Gemini, Haiku).
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
  /**
   * When `false`, the model is chat-only under the Codex harness: Houston
   * blocks sends that need bash, web search, or file tools. OpenRouter models
   * that do not complete Codex's Responses tool loop (e.g. DeepSeek V3) emit
   * fake `openrouter_*` calls in plain text instead of real CLI tool events.
   */
  agenticTools?: boolean;
}

/**
 * How a provider authenticates.
 *
 * - `"cli"`: CLI login command (e.g. `claude login`, `codex login`).
 * - `"apiKey"`: API-key paste only (OpenRouter).
 * - `"oauth"`: OAuth-primary connect dialog with optional API-key path (Anthropic, OpenAI).
 */
export type ProviderLoginKind = "cli" | "apiKey" | "oauth";

export interface ProviderInfo {
  id: string;
  name: string;
  subtitle: string;
  cliName: string;
  installUrl: string;
  loginCommand: string;
  cost: string;
  models: readonly ModelOption[];
  defaultModel: string;
  /** Auth flow this provider uses. Defaults to "cli" when omitted. */
  loginKind?: ProviderLoginKind;
  /**
   * Optional URL the connect dialog points API-key users at to mint a key.
   * Only meaningful when `loginKind === "apiKey"` or `"oauth"`.
   */
  apiKeyConsoleUrl?: string;
  /**
   * Shell `export` command (env var name) for API-key providers. Shown in
   * the connect dialog so the user can paste it into their shell rc.
   */
  apiKeyEnvVar?: string;
}

export const PROVIDERS: readonly ProviderInfo[] = [
  {
    id: "openai",
    name: "OpenAI",
    subtitle: "Codex",
    cliName: "codex",
    installUrl: "https://github.com/openai/codex",
    loginCommand: "codex login",
    cost: "Your ChatGPT subscription",
    models: [
      {
        id: "gpt-5.5",
        label: "GPT-5.5",
        description: "OpenAI's frontier model.",
        effortLevels: ["low", "medium", "high", "xhigh"],
        // Codex's EFFECTIVE window = raw context_window (272k) x
        // effective_context_window_percent (95%) = 258_400. Confirmed in
        // Codex's own models_cache.json and the rollout's `model_context_window`
        // — it's the number Codex `/status` shows, so it's what we divide by.
        // The opt-in 1M gpt-5.5 variant maxes at 1_000_000 x 95% = 950_000, the
        // snap-up ceiling reached only when observed usage exceeds 258_400
        // (analogous to Claude's credit-gated 1M). The numerator comes from the
        // rollout's last_token_usage (see engine `codex_rollout`), not the
        // cumulative `turn.completed.usage`.
        contextWindow: 258_400,
        contextWindowMax: 950_000,
      },
    ],
    defaultModel: "gpt-5.5",
    loginKind: "oauth",
    apiKeyConsoleUrl: "https://platform.openai.com/api-keys",
    apiKeyEnvVar: "OPENAI_API_KEY",
  },
  {
    id: "anthropic",
    name: "Anthropic",
    subtitle: "Claude Code",
    cliName: "claude",
    installUrl: "https://docs.anthropic.com/en/docs/claude-code/overview",
    loginCommand: "claude login",
    cost: "Your Claude subscription",
    models: [
      {
        id: "claude-sonnet-4-6",
        label: "Sonnet 4.6",
        description: "Best balance of speed and quality.",
        // Sonnet 4.6: has `max`, no `xhigh`.
        effortLevels: ["low", "medium", "high", "max"],
        // Sonnet 4.6 in Claude Code defaults to 200k on EVERY plan; the
        // 1M window is opt-in via usage credits (`/extra-usage`) and is NOT
        // part of any automatic upgrade. So start at 200k and snap to 1M only
        // once observed usage proves the credits-enabled window is active.
        contextWindow: 200_000,
        contextWindowMax: 1_000_000,
      },
      {
        id: "claude-opus-4-8",
        label: "Opus 4.8",
        description: "Newest flagship. Most capable, slower.",
        // Opus 4.8: full range (same as 4.7). NOTE: `ultracode` is a Claude
        // Code harness mode, NOT an effort level — never add it here.
        effortLevels: ["low", "medium", "high", "xhigh", "max"],
        // Opus 4.x auto-upgrades to 1M on Max/Team/Enterprise (the power-user
        // default; matches what `/context` shows there). Pro WITHOUT usage
        // credits actually runs 200k — the one case this over-estimates, and
        // it can't self-correct downward, so the dialog flags it as estimated.
        contextWindow: 1_000_000,
      },
      {
        id: "claude-opus-4-7",
        label: "Opus 4.7",
        description: "Previous flagship. Very capable, slower.",
        // Opus 4.7: full range. Same 1M-on-Max default as Opus 4.8 above.
        effortLevels: ["low", "medium", "high", "xhigh", "max"],
        contextWindow: 1_000_000,
      },
    ],
    defaultModel: "claude-sonnet-4-6",
    loginKind: "oauth",
    apiKeyConsoleUrl: "https://console.anthropic.com/settings/keys",
    apiKeyEnvVar: "ANTHROPIC_API_KEY",
  },
  {
    id: "openrouter",
    name: "OpenRouter",
    subtitle: "OpenRouter",
    cliName: "codex",
    installUrl: "https://github.com/openai/codex",
    loginCommand: "codex login",
    cost: "Pay as you go",
    loginKind: "apiKey",
    apiKeyConsoleUrl: "https://openrouter.ai/keys",
    apiKeyEnvVar: "OPENROUTER_API_KEY",
    models: [
      {
        id: "anthropic/claude-sonnet-4",
        label: "Claude Sonnet 4",
        description:
          "Anthropic Sonnet via OpenRouter. Runs via Codex harness, not native Claude Code.",
      },
      {
        id: "openai/gpt-4.1",
        label: "GPT-4.1",
        description: "OpenAI GPT-4.1 via OpenRouter. Runs via Codex harness, not native OpenAI.",
      },
      {
        id: "openai/gpt-4o-mini",
        label: "GPT-4o Mini",
        description: "Fast OpenAI model via OpenRouter.",
        // Chat-only: no OpenRouter Responses tool loop (see ModelOption.agenticTools).
        agenticTools: false,
      },
      {
        id: "google/gemini-2.5-flash",
        label: "Gemini 2.5 Flash",
        description: "Google Flash via OpenRouter. Strong for agents and coding.",
      },
      {
        id: "google/gemini-2.5-pro",
        label: "Gemini 2.5 Pro",
        description: "Google Pro via OpenRouter. Deeper reasoning and tools.",
      },
      {
        id: "qwen/qwen3-coder-next",
        label: "Qwen3 Coder Next",
        description: "Alibaba Qwen coding model via OpenRouter.",
      },
      {
        id: "mistralai/mistral-large-2512",
        label: "Mistral Large 3",
        description: "Mistral flagship via OpenRouter.",
      },
      {
        id: "minimax/minimax-m3",
        label: "MiniMax M3",
        description: "MiniMax agentic model via OpenRouter.",
      },
      {
        id: "meta-llama/llama-3.3-70b-instruct",
        label: "Llama 3.3 70B",
        description: "Meta open-weight model via OpenRouter.",
        // Instruct-only: no OpenRouter Responses tool loop (see ModelOption.agenticTools).
        agenticTools: false,
      },
      {
        id: "qwen/qwen3-coder:free",
        label: "Qwen3 Coder (Free)",
        description: "Alibaba Qwen coding model via OpenRouter free tier.",
      },
      {
        id: "google/gemma-3-27b-it:free",
        label: "Gemma 3 27B (Free)",
        description: "Google Gemma via OpenRouter free tier.",
      },
      {
        id: "mistralai/mistral-small-3.1-24b-instruct:free",
        label: "Mistral Small 3.1 (Free)",
        description: "Mistral small model via OpenRouter free tier.",
      },
      {
        id: "deepseek/deepseek-r1-distill-llama-70b:free",
        label: "DeepSeek R1 Distill 70B (Free)",
        description: "DeepSeek distilled reasoning via OpenRouter free tier.",
      },
    ],
    defaultModel: "anthropic/claude-sonnet-4",
  },
] as const;

/** Providers whose connect flow is a dedicated dialog, not `launchLogin`. */
export function usesConnectDialog(provider: ProviderInfo | null | undefined): boolean {
  return provider?.loginKind === "apiKey" || provider?.loginKind === "oauth";
}

/** i18n keys under `providers` for CLI harness labels in the picker. */
export type ProviderHarnessI18nKey =
  | "harness.anthropic"
  | "harness.openai"
  | "harness.openrouter";

/** Typed `providers` key for the harness label shown on provider cards. */
export function providerHarnessI18nKey(providerId: string): ProviderHarnessI18nKey {
  switch (providerId) {
    case "openai":
      return "harness.openai";
    case "openrouter":
      return "harness.openrouter";
    default:
      return "harness.anthropic";
  }
}

/** Find a provider by id. */
export function getProvider(id: string): ProviderInfo | undefined {
  return PROVIDERS.find((p) => p.id === id);
}

/** Find the model object for a provider + model id. */
export function getModel(providerId: string, modelId: string): ModelOption | undefined {
  const catalog = getProvider(providerId)?.models.find((m) => m.id === modelId);
  if (catalog) return catalog;
  if (providerId === "openrouter" && isOpenRouterCustomSlug(modelId)) {
    const tail = modelId.split("/").pop() ?? modelId;
    return {
      id: modelId,
      label: tail.replace(/-/g, " "),
      description: "",
    };
  }
  return undefined;
}

function isOpenRouterCustomSlug(id: string): boolean {
  return /^[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._:-]*$/i.test(id);
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
 * providers Houston has moved to `COMING_SOON_PROVIDERS` (e.g. an
 * activity record from a previous Houston version that selected Gemini
 * before it was paused). Callers chain it with `??` to fall through to
 * the next tier of preference.
 */
export function validProviderOrNull(providerId: string | null | undefined): string | null {
  return providerId && getProvider(providerId) ? providerId : null;
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
  return providerId && modelId && getModel(providerId, modelId) ? modelId : null;
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
export function normalizeLegacyModel(model: string | null | undefined): string | null {
  if (!model) return null;
  // `hasOwnProperty` guard so a hand-edited config with a model like
  // "constructor"/"__proto__" resolves to itself, not an Object.prototype member.
  return Object.prototype.hasOwnProperty.call(LEGACY_MODEL_ALIASES, model)
    ? LEGACY_MODEL_ALIASES[model]
    : model;
}

/** Strip OpenRouter tier suffixes so `:free` slugs inherit curated metadata. */
export function openRouterBaseSlug(slug: string): string {
  return slug.replace(/:free$/i, "");
}

/** Curated OpenRouter entry by exact slug, then by base slug (e.g. `:free`). */
export function openRouterCatalogMatch(slug: string): ModelOption | undefined {
  const models = getProvider("openrouter")?.models;
  if (!models) return undefined;
  const exact = models.find((m) => m.id === slug);
  if (exact) return exact;
  const base = openRouterBaseSlug(slug);
  if (base === slug) return undefined;
  return models.find((m) => m.id === base);
}

/**
 * Whether the provider+model can run Codex/Claude agent tools (bash, web
 * search, edits). Defaults to `true` when the catalog omits the flag.
 */
export function modelSupportsAgenticTools(
  providerId: string | null | undefined,
  modelId: string | null | undefined,
): boolean {
  if (!providerId || !modelId) return true;
  if (providerId === "openrouter") {
    const catalog = openRouterCatalogMatch(modelId);
    if (catalog) return catalog.agenticTools !== false;
    // User-added slugs from the tools-capable OpenRouter catalog picker.
    if (isOpenRouterCustomSlug(modelId)) return true;
    return false;
  }
  const model = getModel(providerId, modelId);
  if (!model) return true;
  return model.agenticTools !== false;
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
 * The effort to actually use for a provider+model: the requested value when
 * the model accepts it, otherwise the shared default (or the lowest level if
 * the model somehow lacks `medium`). Returns `undefined` when the model has
 * no effort control, so callers omit the flag entirely. Mirrors the engine's
 * `sessions::resolve_effort`, keeping the picker honest about what will run.
 */
export function validEffortOrDefault(
  providerId: string | null | undefined,
  modelId: string | null | undefined,
  effort: string | null | undefined,
): EffortLevel | undefined {
  const levels = getEffortLevels(providerId, modelId);
  if (levels.length === 0) return undefined;
  if (effort && levels.includes(effort as EffortLevel)) return effort as EffortLevel;
  return levels.includes(DEFAULT_EFFORT) ? DEFAULT_EFFORT : levels[0];
}

export interface ComingSoonProviderInfo {
  readonly id: string;
  readonly name: string;
  readonly subtitle: string;
  readonly mark: string;
}

export const COMING_SOON_PROVIDERS: readonly ComingSoonProviderInfo[] = [
  // Gemini: engine support + bundled CLI machinery are intact in this
  // codebase. The UI keeps it under "coming soon" until the broader
  // rollout (account-tier gating, Windows fork-build) is ready. Listed
  // first so the alphabetised "next up" slot stays prominent.
  { id: "gemini", name: "Google", subtitle: "Gemini CLI", mark: "GM" },
  { id: "subq", name: "SubQ", subtitle: "SubQ Code", mark: "SQ" },
  { id: "deepseek", name: "DeepSeek", subtitle: "DeepSeek Coder", mark: "DS" },
  { id: "minimax", name: "MiniMax", subtitle: "M2", mark: "MM" },
] as const;
