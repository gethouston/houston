/**
 * Reasoning-effort levels, ordered low→high. The set a given model accepts
 * is model-specific (see `ModelOption.effortLevels`):
 * - Codex `model_reasoning_effort`: low/medium/high/xhigh (no `max`).
 * - Claude `--effort`: Opus 4.7 and 4.8 = all five; Sonnet 4.6 =
 *   low/medium/high/max (no `xhigh`). Claude self-clamps an unsupported
 *   value; Codex does not.
 */
export type EffortLevel = "low" | "medium" | "high" | "xhigh" | "max";

/**
 * The full effort vocabulary, ascending. Drives the composer's effort-gauge so
 * the icon always shows the SAME number of bars (filled to the active level's
 * position), regardless of how many levels a given model offers — a model with
 * only `high`/`max` reads as a full gauge filled high, not two lone bars.
 */
export const EFFORT_ORDER: readonly EffortLevel[] = [
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
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
  cliName: string;
  installUrl: string;
  loginCommand: string;
  cost: string;
  models: readonly ModelOption[];
  defaultModel: string;
  /**
   * How the user connects this provider. Default (absent) is subscription OAuth
   * (Claude / Codex). `"apiKey"` providers (OpenCode Zen / Go) ask the user to
   * paste a key instead — Houston opens `apiKeyUrl` for them to grab one. API-key
   * providers run only on the new TS engine (see `getVisibleProviders`).
   */
  auth?: "oauth" | "apiKey";
  /** For `auth: "apiKey"`: the dashboard URL where the user creates/copies the key. */
  apiKeyUrl?: string;
  /**
   * GitHub Copilot Enterprise card: connecting it first asks for the company
   * GitHub domain, then runs the same `github-copilot` engine login against that
   * GitHub. The two Copilot cards are mutually exclusive (one engine credential);
   * see the control-plane adapter's `providerStatus`/`providerLogin`.
   */
  enterprise?: boolean;
}

/**
 * GitHub Copilot's curated models, shared by the individual and Enterprise cards
 * (both drive the single `github-copilot` engine provider). pi-ai
 * `github-copilot` ids — note the DOTTED form (claude-sonnet-4.6), distinct from
 * the native Anthropic provider's dashed claude-sonnet-4-6. `contextWindow`s are
 * the FIXED windows the Copilot gateway serves per model (from pi-ai) — not
 * plan/credit-gated like a direct Claude/Codex subscription, so no snap-up
 * `contextWindowMax`. `effortLevels` mirror the same underlying model's native
 * catalog entry (pi-ai clamps per model); Haiku has no effort row by convention.
 */
const COPILOT_MODELS: readonly ModelOption[] = [
  {
    id: "claude-sonnet-4.6",
    label: "Claude Sonnet 4.6",
    description: "Best balance of speed and quality.",
    effortLevels: ["low", "medium", "high", "max"],
    contextWindow: 1_000_000,
  },
  {
    id: "claude-opus-4.8",
    label: "Claude Opus 4.8",
    description: "Anthropic's flagship. Most capable, slower.",
    effortLevels: ["low", "medium", "high", "xhigh", "max"],
    // Copilot's gateway caps Opus at 200k (smaller than a direct Max plan).
    contextWindow: 200_000,
  },
  {
    id: "claude-haiku-4.5",
    label: "Claude Haiku 4.5",
    description: "Anthropic's fastest, for quick tasks.",
    contextWindow: 200_000,
  },
  {
    id: "gpt-5.5",
    label: "GPT-5.5",
    description: "OpenAI's frontier model.",
    effortLevels: ["low", "medium", "high", "xhigh"],
    contextWindow: 400_000,
  },
  {
    id: "gpt-5-mini",
    label: "GPT-5 Mini",
    description: "OpenAI's fast, lightweight model.",
    effortLevels: ["low", "medium", "high"],
    contextWindow: 264_000,
  },
  {
    id: "gemini-3-flash-preview",
    label: "Gemini 3 Flash",
    description: "Google's fast model.",
    effortLevels: ["low", "medium", "high"],
    contextWindow: 128_000,
  },
];

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
  },
  {
    id: "github-copilot",
    name: "GitHub Copilot",
    subtitle: "Frontier models, one subscription",
    cliName: "github-copilot",
    installUrl: "https://github.com/features/copilot",
    loginCommand: "",
    cost: "Your GitHub Copilot subscription",
    models: COPILOT_MODELS,
    defaultModel: "claude-sonnet-4.6",
  },
  {
    // Copilot provided by the user's company (GitHub Enterprise). Same engine
    // provider + models as individual Copilot; the connect flow first collects
    // the company GitHub domain (see the provider picker's enterprise dialog),
    // then logs in against that GitHub. Mutually exclusive with the individual
    // card — a person has personal OR company Copilot, one engine credential.
    id: "github-copilot-enterprise",
    name: "GitHub Copilot Enterprise",
    subtitle: "Copilot from your company's GitHub",
    cliName: "github-copilot",
    installUrl: "https://github.com/features/copilot",
    loginCommand: "",
    cost: "Your company's GitHub Copilot",
    enterprise: true,
    models: COPILOT_MODELS,
    defaultModel: "claude-sonnet-4.6",
  },
  {
    id: "opencode",
    name: "OpenCode Zen",
    subtitle: "Curated frontier models",
    cliName: "opencode",
    installUrl: "https://opencode.ai/auth",
    loginCommand: "",
    cost: "Pay as you go",
    auth: "apiKey",
    apiKeyUrl: "https://opencode.ai/auth",
    // Context windows are the FIXED windows the OpenCode Zen gateway serves per
    // model (from pi-ai) — unlike a Claude/Codex subscription, they are not
    // plan/credit-gated, so no snap-up `contextWindowMax` is needed.
    // `effortLevels` come from models.dev's `reasoning_options.effort.values`
    // (the source OpenCode itself uses), intersected with what the installed
    // pi-ai actually maps to the gateway. Most open models expose only a
    // reasoning on/off toggle (not discrete levels), so they omit effortLevels.
    models: [
      {
        id: "claude-sonnet-4-6",
        label: "Sonnet 4.6",
        description: "Best balance of speed and quality.",
        contextWindow: 1_000_000,
        // models.dev: low/medium/high/max; pi-ai can't reach this gateway's
        // "max" yet, so cap at high.
        effortLevels: ["low", "medium", "high"],
      },
      {
        id: "claude-opus-4-8",
        label: "Opus 4.8",
        description: "Most capable Claude, slower.",
        contextWindow: 1_000_000,
        effortLevels: ["low", "medium", "high", "xhigh"],
      },
      {
        id: "gpt-5.5",
        label: "GPT-5.5",
        description: "OpenAI's frontier model.",
        contextWindow: 1_050_000,
        effortLevels: ["low", "medium", "high", "xhigh"],
      },
      {
        id: "gemini-3.5-flash",
        label: "Gemini 3.5 Flash",
        description: "Fast and capable.",
        contextWindow: 1_048_576,
        // No discrete effort on this gateway model (models.dev lists none).
      },
      // Free trial models (OpenCode Zen) — test the provider without spending credits.
      {
        id: "deepseek-v4-flash-free",
        label: "DeepSeek V4 Flash (Free)",
        description: "Fast. Free to try.",
        contextWindow: 200_000,
        // models.dev effort = [high, max] (plus a reasoning on/off toggle).
        effortLevels: ["high", "max"],
      },
      {
        id: "minimax-m3-free",
        label: "MiniMax M3 (Free)",
        description: "Capable. Free to try.",
        contextWindow: 200_000,
        // Reasoning toggle only (no discrete effort) per models.dev.
      },
      {
        id: "mimo-v2.5-free",
        label: "MiMo V2.5 (Free)",
        description: "Free to try.",
        contextWindow: 200_000,
      },
      {
        id: "nemotron-3-ultra-free",
        label: "Nemotron 3 Ultra (Free)",
        description: "NVIDIA. Free to try.",
        contextWindow: 1_000_000,
      },
    ],
    defaultModel: "claude-sonnet-4-6",
  },
  {
    id: "opencode-go",
    name: "OpenCode Go",
    subtitle: "Open coding models",
    cliName: "opencode-go",
    installUrl: "https://opencode.ai/auth",
    loginCommand: "",
    cost: "$10 / month",
    auth: "apiKey",
    apiKeyUrl: "https://opencode.ai/auth",
    // Fixed per-model context windows the OpenCode Go gateway serves (from pi-ai).
    // effortLevels come from models.dev's reasoning_options; the open models here
    // expose only a reasoning toggle (no discrete effort), so they omit it.
    models: [
      {
        id: "glm-5.1",
        label: "GLM-5.1",
        description: "Strong open coding model.",
        contextWindow: 202_752,
      },
      {
        id: "kimi-k2.6",
        label: "Kimi K2.6",
        description: "Fast, capable open model.",
        contextWindow: 262_144,
      },
      {
        id: "minimax-m3",
        label: "MiniMax M3",
        description: "Capable open model.",
        contextWindow: 512_000,
      },
      {
        id: "qwen3.7-max",
        label: "Qwen3.7 Max",
        description: "Large open model.",
        contextWindow: 1_000_000,
      },
      {
        id: "deepseek-v4-pro",
        label: "DeepSeek V4 Pro",
        description: "Strong reasoning.",
        contextWindow: 1_000_000,
        // models.dev effort = [high, max].
        effortLevels: ["high", "max"],
      },
    ],
    defaultModel: "glm-5.1",
  },
  {
    id: "openrouter",
    name: "OpenRouter",
    subtitle: "Any model, one key",
    cliName: "openrouter",
    installUrl: "https://openrouter.ai",
    loginCommand: "",
    cost: "Pay-as-you-go on your OpenRouter account",
    auth: "apiKey",
    apiKeyUrl: "https://openrouter.ai/settings/keys",
    // A small curated set of strong models OpenRouter routes to (pi-ai
    // `openrouter` ids). OpenRouter exposes hundreds; these are sensible
    // defaults, not the full catalog. `effortLevels` come from models.dev's
    // per-model `reasoning_options.effort.values` (the same source OpenCode
    // uses), intersected with what pi-ai actually maps; `minimal` is dropped
    // (Houston's effort scale starts at `low`). Context windows are pi-ai's.
    models: [
      {
        id: "openrouter/free",
        label: "Free (auto-routed)",
        description: "OpenRouter's free tier. Good for testing, no cost.",
        // models.dev lists no discrete effort for this meta-router, so no row.
        contextWindow: 200_000,
      },
      {
        id: "anthropic/claude-sonnet-4.6",
        label: "Claude Sonnet 4.6",
        description: "Anthropic's balanced model, via OpenRouter.",
        effortLevels: ["low", "medium", "high", "max"],
        contextWindow: 1_000_000,
      },
      {
        id: "anthropic/claude-opus-4.8",
        label: "Claude Opus 4.8",
        description: "Anthropic's flagship, via OpenRouter.",
        effortLevels: ["low", "medium", "high", "xhigh", "max"],
        contextWindow: 1_000_000,
      },
      {
        id: "google/gemini-3-flash-preview",
        label: "Gemini 3 Flash",
        description: "Google's fast model, via OpenRouter.",
        effortLevels: ["low", "medium", "high"],
        contextWindow: 1_048_576,
      },
      {
        id: "deepseek/deepseek-v4-pro",
        label: "DeepSeek V4 Pro",
        description: "DeepSeek's flagship, via OpenRouter.",
        effortLevels: ["high", "xhigh"],
        contextWindow: 1_048_576,
      },
    ],
    defaultModel: "anthropic/claude-sonnet-4.6",
  },
  {
    id: "google",
    name: "Google Gemini",
    subtitle: "Free key from AI Studio",
    cliName: "google",
    installUrl: "https://ai.google.dev",
    loginCommand: "",
    cost: "Free tier on your Google account",
    auth: "apiKey",
    apiKeyUrl: "https://aistudio.google.com/apikey",
    // pi-ai `google` model ids. `effortLevels` from models.dev's
    // `reasoning_options.effort.values` (minus `minimal`): Gemini 3 Flash =
    // low/medium/high, Gemini 3 Pro = low/high (its only two), and the 2.5
    // models expose budget-mapped low/medium/high via pi-ai. Windows = 1 MiB.
    models: [
      {
        id: "gemini-3-flash-preview",
        label: "Gemini 3 Flash",
        description: "Fast and capable. Best default.",
        effortLevels: ["low", "medium", "high"],
        contextWindow: 1_048_576,
      },
      {
        id: "gemini-3-pro-preview",
        label: "Gemini 3 Pro",
        description: "Google's most capable, slower.",
        effortLevels: ["low", "high"],
        contextWindow: 1_048_576,
      },
      {
        id: "gemini-2.5-flash",
        label: "Gemini 2.5 Flash",
        description: "Previous fast model.",
        effortLevels: ["low", "medium", "high"],
        contextWindow: 1_048_576,
      },
      {
        id: "gemini-2.5-pro",
        label: "Gemini 2.5 Pro",
        description: "Previous flagship.",
        effortLevels: ["low", "medium", "high"],
        contextWindow: 1_048_576,
      },
    ],
    defaultModel: "gemini-3-flash-preview",
  },
] as const;

/** Find a provider by id. */
export function getProvider(id: string): ProviderInfo | undefined {
  return PROVIDERS.find((p) => p.id === id);
}

/**
 * Providers to show in connect UIs. API-key providers (OpenCode Zen / Go) run
 * only on the new TS engine — they paste a key Houston serves through the host —
 * so they're hidden when the legacy Rust engine is active. Pass
 * `newEngineActive()` from `lib/engine`.
 */
export function getVisibleProviders(opts: {
  newEngine: boolean;
}): readonly ProviderInfo[] {
  return PROVIDERS.filter((p) => p.auth !== "apiKey" || opts.newEngine);
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
 * providers Houston has moved to `COMING_SOON_PROVIDERS` or dropped
 * entirely (e.g. an activity record from a previous Houston version that
 * selected a provider that is no longer available). Callers chain it
 * with `??` to fall through to the next tier of preference.
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
export function validModelOrNull(
  providerId: string | null | undefined,
  modelId: string | null | undefined,
): string | null {
  return providerId && modelId && getModel(providerId, modelId)
    ? modelId
    : null;
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
  if (effort && levels.includes(effort as EffortLevel))
    return effort as EffortLevel;
  return levels.includes(DEFAULT_EFFORT) ? DEFAULT_EFFORT : levels[0];
}

export interface ComingSoonProviderInfo {
  readonly id: string;
  readonly name: string;
  readonly subtitle: string;
  readonly mark: string;
}

export const COMING_SOON_PROVIDERS: readonly ComingSoonProviderInfo[] = [
  { id: "subq", name: "SubQ", subtitle: "SubQ Code", mark: "SQ" },
  { id: "deepseek", name: "DeepSeek", subtitle: "DeepSeek Coder", mark: "DS" },
  { id: "minimax", name: "MiniMax", subtitle: "M2", mark: "MM" },
] as const;
