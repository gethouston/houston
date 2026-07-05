import type { Capabilities } from "@houston-ai/engine-client";

/**
 * Reasoning-effort levels, ordered low→high. The set a given model accepts
 * is model-specific (see `ModelOption.effortLevels`):
 * - Codex `model_reasoning_effort`: low/medium/high/xhigh (no `max`).
 * - Claude `--effort`: Opus 4.7/4.8 and Sonnet 5 = all five; Sonnet 4.6 =
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
   * (Claude / Codex). `"apiKey"` providers ask the user to
   * paste a key instead. Houston opens `apiKeyUrl` for them to grab one.
   * `"openaiCompatible"` providers (a local server: Ollama / vLLM / LM Studio)
   * ask for a base URL + model id. Both run only on the new TS engine, and
   * `openaiCompatible` is desktop-only (the URL is the user's own machine) — see
   * `getVisibleProviders`.
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
    id: "gpt-4.1",
    label: "GPT-4.1",
    // The one BASE model every Copilot plan serves, INCLUDING Copilot Free —
    // the premium models below (Claude / GPT-5.x / Gemini) need Copilot Pro and
    // answer `model_not_supported` on Free (HOU-578). Listed first as the safe,
    // always-works default. gpt-4o is also base but isn't in pi-ai's catalog, so
    // the engine can't resolve it — gpt-4.1 is the only selectable base model.
    description: "Available on every plan, including Copilot Free.",
    contextWindow: 200_000,
  },
  {
    id: "claude-sonnet-4.6",
    label: "Claude Sonnet 4.6",
    description: "Best balance of speed and quality. Needs Copilot Pro.",
    effortLevels: ["low", "medium", "high", "max"],
    contextWindow: 1_000_000,
  },
  {
    id: "claude-opus-4.8",
    label: "Claude Opus 4.8",
    description:
      "Anthropic's flagship. Most capable, slower. Needs Copilot Pro.",
    effortLevels: ["low", "medium", "high", "xhigh", "max"],
    // Copilot's gateway caps Opus at 200k (smaller than a direct Max plan).
    contextWindow: 200_000,
  },
  {
    id: "claude-haiku-4.5",
    label: "Claude Haiku 4.5",
    description: "Anthropic's fastest, for quick tasks. Needs Copilot Pro.",
    contextWindow: 200_000,
  },
  {
    id: "gpt-5.5",
    label: "GPT-5.5",
    description: "OpenAI's frontier model. Needs Copilot Pro.",
    effortLevels: ["low", "medium", "high", "xhigh"],
    contextWindow: 400_000,
  },
  {
    id: "gpt-5-mini",
    label: "GPT-5 Mini",
    description: "OpenAI's fast, lightweight model. Needs Copilot Pro.",
    effortLevels: ["low", "medium", "high"],
    contextWindow: 264_000,
  },
  {
    id: "gemini-3-flash-preview",
    label: "Gemini 3 Flash",
    description: "Google's fast model. Needs Copilot Pro.",
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
      {
        id: "gpt-5.4",
        label: "GPT-5.4",
        description: "Strong model for everyday coding.",
        effortLevels: ["low", "medium", "high", "xhigh"],
        // Same window math as gpt-5.5: raw context_window 272k × 95%
        // effective = 258_400 default. gpt-5.4 also exposes the opt-in 1M
        // variant (max_context_window 1_000_000 in Codex's models_cache.json),
        // so the snap-up ceiling is 1_000_000 × 95% = 950_000, reached only
        // once observed usage exceeds the default.
        contextWindow: 258_400,
        contextWindowMax: 950_000,
      },
      {
        id: "gpt-5.4-mini",
        label: "GPT-5.4-Mini",
        description: "Small, fast, and cost-efficient for simpler tasks.",
        effortLevels: ["low", "medium", "high", "xhigh"],
        // 272k raw × 95% = 258_400. No 1M opt-in (max_context_window == base in
        // models_cache.json), so no snap-up ceiling.
        contextWindow: 258_400,
      },
      {
        id: "gpt-5.3-codex-spark",
        label: "GPT-5.3-Codex-Spark",
        description: "Ultra-fast coding model.",
        effortLevels: ["low", "medium", "high", "xhigh"],
        // Smaller window than the 5.4/5.5 line: 128k raw × 95% = 121_600. No
        // upward gating (max_context_window == base in models_cache.json).
        contextWindow: 121_600,
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
        id: "claude-sonnet-5",
        label: "Sonnet 5",
        description: "Newest Sonnet. Stronger agentic coding and tool use.",
        // Sonnet 5 accepts the full effort range, INCLUDING `xhigh` (unlike
        // Sonnet 4.6, which has `max` but not `xhigh`). API default is `high`.
        effortLevels: ["low", "medium", "high", "xhigh", "max"],
        // Unlike Sonnet 4.6 (whose 1M is a credit-gated opt-in over a 200k
        // default), Sonnet 5's 1M window is the default AND the only variant:
        // per Anthropic, "1M tokens is both the default and the maximum; there
        // is no smaller context variant," and it's the Claude Code default on
        // Pro and up. So a flat 1M denominator with no snap-up, like Opus 4.8.
        contextWindow: 1_000_000,
      },
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
        description:
          "Latest Opus. Better alignment and agentic coding than 4.7.",
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
        id: "claude-fable-5",
        label: "Fable 5",
        description: "Most capable model. Costs 2x more credits than Opus 4.8.",
        // Fable 5: full range like Opus 4.8. ultracode is a harness mode, not
        // an effort level — it is intentionally excluded for this model.
        effortLevels: ["low", "medium", "high", "xhigh", "max"],
        contextWindow: 1_000_000,
      },
      {
        id: "claude-opus-4-7",
        label: "Opus 4.7",
        description:
          "Previous flagship. Strong coding autonomy and complex reasoning.",
        // Opus 4.7: full range. Same 1M-on-Max default as Opus 4.8 above.
        effortLevels: ["low", "medium", "high", "xhigh", "max"],
        contextWindow: 1_000_000,
      },
    ],
    defaultModel: "claude-sonnet-4-6",
  },
  {
    // ONE Copilot card. Connecting opens a dialog to choose Personal (github.com)
    // or Company / GitHub Enterprise (which collects the company GitHub domain) —
    // both drive this single `github-copilot` engine provider. See
    // `useCopilotConnect` + `provider-copilot-connect-dialog`.
    id: "github-copilot",
    name: "GitHub Copilot",
    subtitle: "Personal or your company's plan",
    cliName: "github-copilot",
    installUrl: "https://github.com/features/copilot",
    loginCommand: "",
    cost: "Your GitHub Copilot subscription",
    copilotConnect: true,
    models: COPILOT_MODELS,
    // Base model that works on EVERY Copilot plan incl. Free (HOU-578); premium
    // models 404 on Free. Mirrors the engine's `config.githubCopilotModel`.
    defaultModel: "gpt-4.1",
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
    id: "deepseek",
    name: "DeepSeek",
    subtitle: "Official DeepSeek API",
    cliName: "deepseek",
    installUrl: "https://platform.deepseek.com",
    loginCommand: "",
    cost: "Pay-as-you-go on your DeepSeek account",
    auth: "apiKey",
    apiKeyUrl: "https://platform.deepseek.com/api_keys",
    // pi-ai `deepseek` model ids. Direct DeepSeek supports reasoning at high
    // and max; pi maps Houston's xhigh to DeepSeek's max.
    models: [
      {
        id: "deepseek-v4-flash",
        label: "DeepSeek V4 Flash",
        description: "Fast, low-cost DeepSeek model.",
        effortLevels: ["high", "xhigh"],
        contextWindow: 1_000_000,
      },
      {
        id: "deepseek-v4-pro",
        label: "DeepSeek V4 Pro",
        description: "DeepSeek's most capable model.",
        effortLevels: ["high", "xhigh"],
        contextWindow: 1_000_000,
      },
    ],
    defaultModel: "deepseek-v4-flash",
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
  {
    id: "amazon-bedrock",
    name: "Amazon Bedrock",
    subtitle: "Use Bedrock with your AWS account",
    cliName: "amazon-bedrock",
    installUrl: "https://aws.amazon.com/bedrock/",
    loginCommand: "",
    cost: "Pay-as-you-go on your AWS account",
    auth: "apiKey",
    apiKeyUrl: "https://console.aws.amazon.com/bedrock/home#/api-keys",
    // pi-ai `amazon-bedrock` model ids. Houston's paste-a-key flow stores a
    // Bedrock API key, which the runtime maps to pi's provider-specific
    // `bearerToken` option before each request.
    models: [
      {
        id: "anthropic.claude-sonnet-4-6",
        label: "Claude Sonnet 4.6",
        description: "Anthropic's balanced model, via Bedrock.",
        effortLevels: ["low", "medium", "high", "xhigh"],
        contextWindow: 1_000_000,
      },
      {
        id: "anthropic.claude-opus-4-8",
        label: "Claude Opus 4.8",
        description: "Anthropic's flagship, via Bedrock.",
        effortLevels: ["low", "medium", "high", "xhigh"],
        contextWindow: 1_000_000,
      },
      {
        id: "amazon.nova-pro-v1:0",
        label: "Nova Pro",
        description: "Amazon's capable general-purpose model.",
        contextWindow: 300_000,
      },
      {
        id: "amazon.nova-lite-v1:0",
        label: "Nova Lite",
        description: "Amazon's fast, lower-cost model.",
        contextWindow: 300_000,
      },
    ],
    defaultModel: "anthropic.claude-sonnet-4-6",
  },
  {
    id: "minimax",
    name: "MiniMax",
    subtitle: "Global API",
    cliName: "minimax",
    installUrl: "https://platform.minimax.io",
    loginCommand: "",
    cost: "Pay-as-you-go on your MiniMax account",
    auth: "apiKey",
    apiKeyUrl: "https://platform.minimax.io",
    // pi-ai `minimax` model ids from the global endpoint (api.minimax.io), NOT
    // the separate `minimax-cn` provider (api.minimaxi.com).
    models: [
      {
        id: "MiniMax-M3",
        label: "MiniMax M3",
        description: "Best default. Long-context multimodal model.",
        effortLevels: ["low", "medium", "high"],
        contextWindow: 512_000,
      },
      {
        id: "MiniMax-M2.7",
        label: "MiniMax M2.7",
        description: "Lower cost. Text-only reasoning model.",
        effortLevels: ["low", "medium", "high"],
        contextWindow: 204_800,
      },
      {
        id: "MiniMax-M2.7-highspeed",
        label: "MiniMax M2.7 Highspeed",
        description: "Faster M2.7 tier for latency-sensitive chats.",
        effortLevels: ["low", "medium", "high"],
        contextWindow: 204_800,
      },
    ],
    defaultModel: "MiniMax-M3",
  },
  {
    id: "openai-compatible",
    name: "Local model",
    subtitle: "Ollama, LM Studio, vLLM…",
    cliName: "openai-compatible",
    installUrl: "https://ollama.com",
    loginCommand: "",
    cost: "Runs on your computer, free",
    // Connects by base URL + model id (no pasted gateway key). Desktop-only and
    // new-engine-only (see getVisibleProviders). The model list is whatever the
    // user's server serves, so there's no static catalog here — the runtime
    // reports the one configured model.
    auth: "openaiCompatible",
    models: [],
    defaultModel: "",
  },
] as const;

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

function capabilityIdsForProvider(provider: ProviderInfo): readonly string[] {
  if (provider.id === "openai") return ["openai", "openai-codex"];
  return [provider.id];
}

/**
 * Providers to show in connect UIs. API-key providers run
 * only on the new TS engine — they paste a key Houston serves through the host —
 * so they're hidden when the legacy Rust engine is active. The OpenAI-compatible
 * (local) provider is additionally desktop-only: its base URL points at the
 * user's own machine, unreachable from a browser/cloud deployment (the host
 * enforces the same via its `openaiCompatible` capability). Pass
 * `newEngineActive()` and `osIsTauri()` from the caller.
 */
export function getVisibleProviders(opts: {
  newEngine: boolean;
  desktop?: boolean;
  capabilities?: Pick<Capabilities, "providers" | "openaiCompatible">;
}): readonly ProviderInfo[] {
  const allowed = opts.capabilities
    ? new Set(opts.capabilities.providers)
    : null;
  return PROVIDERS.filter((p) => {
    if (p.auth === "openaiCompatible") {
      if (opts.capabilities) {
        return (
          opts.newEngine && !!opts.desktop && opts.capabilities.openaiCompatible
        );
      }
      return opts.newEngine && !!opts.desktop;
    }
    if (allowed)
      return capabilityIdsForProvider(p).some((id) => allowed.has(id));
    if (p.auth === "apiKey") return opts.newEngine;
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
  cliName: "opencode",
  installUrl: "https://opencode.ai/auth",
  loginCommand: "",
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
 * card. Otherwise identical to `getVisibleProviders` (same new-engine / desktop
 * gating), preserving catalog order — the merged card takes OpenCode's slot.
 */
export function getConnectProviders(opts: {
  newEngine: boolean;
  desktop?: boolean;
  capabilities?: Pick<Capabilities, "providers" | "openaiCompatible">;
}): readonly ProviderInfo[] {
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
] as const;
