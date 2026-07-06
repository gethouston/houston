import type { EffortLevel, ProviderInfo } from "./providers.ts";

/**
 * Houston's provider/model catalog is now DYNAMIC: the runnable set (providers,
 * models, context windows, thinking levels, pricing, vision/reasoning flags)
 * comes from pi-ai over the host's `GET /v1/catalog` route and is hydrated into
 * `PROVIDERS` at runtime (see `hydrateProviderCatalog`).
 *
 * pi-ai does NOT ship the Houston-specific presentation metadata, though: brand
 * names (its provider `name` is a titleized id like "Openrouter" or an OAuth
 * subscription string), per-model marketing labels/descriptions, the credit-gated
 * snap-up ceilings (`contextWindowMax`), or the curated per-gateway effort sets
 * (pi has no `"max"` level, and the same model exposes different effort via
 * different gateways). This module carries ONLY that missing metadata, keyed by
 * the Houston provider id, so the hydrator can layer it over pi's catalog.
 *
 * It also defines the two constructs pi-ai has no concept of: the local
 * OpenAI-compatible provider (appended verbatim), and the `openai-codex → openai`
 * id rename (+ the drop of pi's colliding direct api-key `openai` provider).
 */

/** Per-model presentation metadata pi-ai can't supply, keyed by model id. */
export interface ModelOverride {
  /** Marketing label for the picker (pi's `name` is the raw model name). */
  label?: string;
  /** One-line picker description (pi ships none). */
  description?: string;
  /**
   * Snap-up ceiling (tokens) for the self-correcting usage estimate — set only
   * for models whose window is gated upward at runtime (credits/plan). pi
   * reports the default window; this is Houston's known ceiling above it.
   */
  contextWindowMax?: number;
  /**
   * Curated reasoning-effort set, overriding what `deriveEffortLevels` would
   * produce from pi's `thinkingLevels`. Present where the curation differs from
   * pi (adds Houston's `"max"`, caps a gateway that can't reach a level, or
   * pins `[]` to hide the effort row for a model pi marks reasoning). An empty
   * array explicitly hides the effort row.
   */
  effortLevels?: readonly EffortLevel[];
}

/** Provider-level presentation metadata pi-ai can't supply, keyed by provider id. */
export interface ProviderOverride {
  /** Brand label (pi's `name` is a titleized id or an OAuth subscription string). */
  name?: string;
  subtitle?: string;
  cost?: string;
  installUrl?: string;
  /** For api-key providers: the dashboard URL where the user creates/copies the key. */
  apiKeyUrl?: string;
  /**
   * How the user connects this provider. Defaults from pi's `auth` (oauth →
   * `"oauth"`, else `"apiKey"`); pinned to `"oauth"` for the three subscription
   * providers, or `"openaiCompatible"` for the local provider.
   */
  auth?: "oauth" | "apiKey" | "openaiCompatible";
  /** GitHub Copilot's Personal-vs-Enterprise connect dialog. */
  copilotConnect?: boolean;
  /** The engine gateway ids one connect card stands in for (merged OpenCode). */
  gatewayIds?: readonly string[];
  /** Curated default model pick, when different from pi's first model. */
  defaultModel?: string;
  /** Per-model presentation overrides, keyed by pi model id. */
  models?: Record<string, ModelOverride>;
}

/**
 * pi-ai's OAuth OpenAI provider is `openai-codex`, but Houston's frontend
 * card/logo/connect uses the id `openai`. The hydrator renames it so the override
 * below (keyed `openai`) and the `openai` logo apply. pi ALSO ships a DIRECT
 * api-key `openai` provider (~42 models) that would collide with the rename, so
 * it is dropped first (see `DROP_PI_PROVIDERS`).
 */
export const PROVIDER_ID_RENAME: Readonly<Record<string, string>> = {
  "openai-codex": "openai",
};

/**
 * pi providers dropped BEFORE the rename is applied. pi's direct api-key `openai`
 * provider collides with the `openai-codex → openai` rename (Houston surfaces the
 * OAuth Codex provider under `openai`, not the raw API-key one), so it is removed.
 */
export const DROP_PI_PROVIDERS: ReadonlySet<string> = new Set(["openai"]);

/**
 * The local OpenAI-compatible provider (Ollama / LM Studio / vLLM, direct or via
 * a tunnel). pi-ai has no such provider — the user supplies a base URL + model id
 * at runtime — so it is appended to the hydrated catalog verbatim. Gated by the
 * host's `openaiCompatible` capability (see `getVisibleProviders`).
 */
export const LOCAL_PROVIDER: ProviderInfo = {
  id: "openai-compatible",
  name: "Local model",
  subtitle: "Ollama, LM Studio, vLLM…",
  installUrl: "https://ollama.com",
  cost: "Runs on your computer, free",
  auth: "openaiCompatible",
  models: [],
  defaultModel: "",
};

/**
 * Houston presentation metadata for the ten first-class providers, keyed by
 * Houston provider id (post-rename for OpenAI). pi supplies everything else.
 * Insertion order sets the catalog order (the local provider is appended last).
 */
export const PROVIDER_OVERRIDES: Record<string, ProviderOverride> = {
  openai: {
    name: "OpenAI",
    subtitle: "Codex",
    cost: "Your ChatGPT subscription",
    installUrl: "https://github.com/openai/codex",
    auth: "oauth",
    defaultModel: "gpt-5.5",
    models: {
      "gpt-5.5": {
        label: "GPT-5.5",
        description: "OpenAI's frontier model.",
        effortLevels: ["low", "medium", "high", "xhigh"],
        // Codex exposes an opt-in 1M variant (max_context_window 1M × 95%
        // effective); the usage indicator snaps up to it once observed usage
        // exceeds pi's reported default window.
        contextWindowMax: 950_000,
      },
      "gpt-5.4": {
        label: "GPT-5.4",
        description: "Strong model for everyday coding.",
        effortLevels: ["low", "medium", "high", "xhigh"],
        contextWindowMax: 950_000,
      },
      "gpt-5.4-mini": {
        label: "GPT-5.4-Mini",
        description: "Small, fast, and cost-efficient for simpler tasks.",
        effortLevels: ["low", "medium", "high", "xhigh"],
      },
      "gpt-5.3-codex-spark": {
        label: "GPT-5.3-Codex-Spark",
        description: "Ultra-fast coding model.",
        effortLevels: ["low", "medium", "high", "xhigh"],
      },
    },
  },
  anthropic: {
    name: "Anthropic",
    subtitle: "Claude Code",
    cost: "Your Claude subscription",
    installUrl: "https://docs.anthropic.com/en/docs/claude-code/overview",
    auth: "oauth",
    defaultModel: "claude-sonnet-4-6",
    models: {
      "claude-sonnet-5": {
        label: "Sonnet 5",
        description: "Newest Sonnet. Stronger agentic coding and tool use.",
        // Sonnet 5 accepts the full range INCLUDING `xhigh` and `max`; pi has
        // no `max`, so the curated set carries it.
        effortLevels: ["low", "medium", "high", "xhigh", "max"],
      },
      "claude-sonnet-4-6": {
        label: "Sonnet 4.6",
        description: "Best balance of speed and quality.",
        // Sonnet 4.6: has `max`, no `xhigh`.
        effortLevels: ["low", "medium", "high", "max"],
        // Credit-gated 1M window over pi's reported default (200k on every plan).
        contextWindowMax: 1_000_000,
      },
      "claude-opus-4-8": {
        label: "Opus 4.8",
        description:
          "Latest Opus. Better alignment and agentic coding than 4.7.",
        // Full range. `ultracode` is a harness mode, not an effort level.
        effortLevels: ["low", "medium", "high", "xhigh", "max"],
      },
      "claude-fable-5": {
        label: "Fable 5",
        description: "Most capable model. Costs 2x more credits than Opus 4.8.",
        effortLevels: ["low", "medium", "high", "xhigh", "max"],
      },
      "claude-opus-4-7": {
        label: "Opus 4.7",
        description:
          "Previous flagship. Strong coding autonomy and complex reasoning.",
        effortLevels: ["low", "medium", "high", "xhigh", "max"],
      },
    },
  },
  "github-copilot": {
    // ONE Copilot card; connecting opens the Personal-vs-Enterprise dialog. Both
    // drive the single `github-copilot` engine provider. pi-ai `github-copilot`
    // ids use the DOTTED form (claude-sonnet-4.6).
    name: "GitHub Copilot",
    subtitle: "Personal or your company's plan",
    cost: "Your GitHub Copilot subscription",
    installUrl: "https://github.com/features/copilot",
    auth: "oauth",
    copilotConnect: true,
    // Base model that works on EVERY Copilot plan incl. Free (HOU-578).
    defaultModel: "gpt-4.1",
    models: {
      "gpt-4.1": {
        label: "GPT-4.1",
        description: "Available on every plan, including Copilot Free.",
        // Base model, no effort row.
        effortLevels: [],
      },
      "claude-sonnet-4.6": {
        label: "Claude Sonnet 4.6",
        description: "Best balance of speed and quality. Needs Copilot Pro.",
        effortLevels: ["low", "medium", "high", "max"],
      },
      "claude-opus-4.8": {
        label: "Claude Opus 4.8",
        description:
          "Anthropic's flagship. Most capable, slower. Needs Copilot Pro.",
        effortLevels: ["low", "medium", "high", "xhigh", "max"],
      },
      "claude-haiku-4.5": {
        label: "Claude Haiku 4.5",
        description: "Anthropic's fastest, for quick tasks. Needs Copilot Pro.",
        effortLevels: [],
      },
      "gpt-5.5": {
        label: "GPT-5.5",
        description: "OpenAI's frontier model. Needs Copilot Pro.",
        effortLevels: ["low", "medium", "high", "xhigh"],
      },
      "gpt-5-mini": {
        label: "GPT-5 Mini",
        description: "OpenAI's fast, lightweight model. Needs Copilot Pro.",
        effortLevels: ["low", "medium", "high"],
      },
      "gemini-3-flash-preview": {
        label: "Gemini 3 Flash",
        description: "Google's fast model. Needs Copilot Pro.",
        effortLevels: ["low", "medium", "high"],
      },
    },
  },
  opencode: {
    name: "OpenCode Zen",
    subtitle: "Curated frontier models",
    cost: "Pay as you go",
    installUrl: "https://opencode.ai/auth",
    apiKeyUrl: "https://opencode.ai/auth",
    defaultModel: "claude-sonnet-4-6",
    models: {
      "claude-sonnet-4-6": {
        label: "Sonnet 4.6",
        description: "Best balance of speed and quality.",
        // models.dev lists max; pi can't reach this gateway's max, cap at high.
        effortLevels: ["low", "medium", "high"],
      },
      "claude-opus-4-8": {
        label: "Opus 4.8",
        description: "Most capable Claude, slower.",
        effortLevels: ["low", "medium", "high", "xhigh"],
      },
      "gpt-5.5": {
        label: "GPT-5.5",
        description: "OpenAI's frontier model.",
        effortLevels: ["low", "medium", "high", "xhigh"],
      },
      "gemini-3.5-flash": {
        label: "Gemini 3.5 Flash",
        description: "Fast and capable.",
        // No discrete effort on this gateway model.
        effortLevels: [],
      },
      "deepseek-v4-flash-free": {
        label: "DeepSeek V4 Flash (Free)",
        description: "Fast. Free to try.",
        effortLevels: ["high", "max"],
      },
      "mimo-v2.5-free": {
        label: "MiMo V2.5 (Free)",
        description: "Free to try.",
        effortLevels: [],
      },
      "nemotron-3-ultra-free": {
        label: "Nemotron 3 Ultra (Free)",
        description: "NVIDIA. Free to try.",
        effortLevels: [],
      },
    },
  },
  "opencode-go": {
    name: "OpenCode Go",
    subtitle: "Open coding models",
    cost: "$10 / month",
    installUrl: "https://opencode.ai/auth",
    apiKeyUrl: "https://opencode.ai/auth",
    defaultModel: "glm-5.1",
    models: {
      "glm-5.1": {
        label: "GLM-5.1",
        description: "Strong open coding model.",
        effortLevels: [],
      },
      "kimi-k2.6": {
        label: "Kimi K2.6",
        description: "Fast, capable open model.",
        effortLevels: [],
      },
      "minimax-m3": {
        label: "MiniMax M3",
        description: "Capable open model.",
        effortLevels: [],
      },
      "qwen3.7-max": {
        label: "Qwen3.7 Max",
        description: "Large open model.",
        effortLevels: [],
      },
      "deepseek-v4-pro": {
        label: "DeepSeek V4 Pro",
        description: "Strong reasoning.",
        effortLevels: ["high", "max"],
      },
    },
  },
  openrouter: {
    name: "OpenRouter",
    subtitle: "Any model, one key",
    cost: "Pay-as-you-go on your OpenRouter account",
    installUrl: "https://openrouter.ai",
    apiKeyUrl: "https://openrouter.ai/settings/keys",
    defaultModel: "anthropic/claude-sonnet-4.6",
    models: {
      "openrouter/free": {
        label: "Free (auto-routed)",
        description: "OpenRouter's free tier. Good for testing, no cost.",
        effortLevels: [],
      },
      "anthropic/claude-sonnet-4.6": {
        label: "Claude Sonnet 4.6",
        description: "Anthropic's balanced model, via OpenRouter.",
        effortLevels: ["low", "medium", "high", "max"],
      },
      "anthropic/claude-opus-4.8": {
        label: "Claude Opus 4.8",
        description: "Anthropic's flagship, via OpenRouter.",
        effortLevels: ["low", "medium", "high", "xhigh", "max"],
      },
      "google/gemini-3-flash-preview": {
        label: "Gemini 3 Flash",
        description: "Google's fast model, via OpenRouter.",
        effortLevels: ["low", "medium", "high"],
      },
      "deepseek/deepseek-v4-pro": {
        label: "DeepSeek V4 Pro",
        description: "DeepSeek's flagship, via OpenRouter.",
        effortLevels: ["high", "xhigh"],
      },
    },
  },
  deepseek: {
    name: "DeepSeek",
    subtitle: "Official DeepSeek API",
    cost: "Pay-as-you-go on your DeepSeek account",
    installUrl: "https://platform.deepseek.com",
    apiKeyUrl: "https://platform.deepseek.com/api_keys",
    defaultModel: "deepseek-v4-flash",
    models: {
      "deepseek-v4-flash": {
        label: "DeepSeek V4 Flash",
        description: "Fast, low-cost DeepSeek model.",
        effortLevels: ["high", "xhigh"],
      },
      "deepseek-v4-pro": {
        label: "DeepSeek V4 Pro",
        description: "DeepSeek's most capable model.",
        effortLevels: ["high", "xhigh"],
      },
    },
  },
  google: {
    name: "Google Gemini",
    subtitle: "Free key from AI Studio",
    cost: "Free tier on your Google account",
    installUrl: "https://ai.google.dev",
    apiKeyUrl: "https://aistudio.google.com/apikey",
    defaultModel: "gemini-3-flash-preview",
    models: {
      "gemini-3-flash-preview": {
        label: "Gemini 3 Flash",
        description: "Fast and capable. Best default.",
        effortLevels: ["low", "medium", "high"],
      },
      "gemini-3-pro-preview": {
        label: "Gemini 3 Pro",
        description: "Google's most capable, slower.",
        effortLevels: ["low", "high"],
      },
      "gemini-2.5-flash": {
        label: "Gemini 2.5 Flash",
        description: "Previous fast model.",
        effortLevels: ["low", "medium", "high"],
      },
      "gemini-2.5-pro": {
        label: "Gemini 2.5 Pro",
        description: "Previous flagship.",
        effortLevels: ["low", "medium", "high"],
      },
    },
  },
  "amazon-bedrock": {
    name: "Amazon Bedrock",
    subtitle: "Use Bedrock with your AWS account",
    cost: "Pay-as-you-go on your AWS account",
    installUrl: "https://aws.amazon.com/bedrock/",
    apiKeyUrl: "https://console.aws.amazon.com/bedrock/home#/api-keys",
    defaultModel: "anthropic.claude-sonnet-4-6",
    models: {
      "anthropic.claude-sonnet-4-6": {
        label: "Claude Sonnet 4.6",
        description: "Anthropic's balanced model, via Bedrock.",
        effortLevels: ["low", "medium", "high", "xhigh"],
      },
      "anthropic.claude-opus-4-8": {
        label: "Claude Opus 4.8",
        description: "Anthropic's flagship, via Bedrock.",
        effortLevels: ["low", "medium", "high", "xhigh"],
      },
      "amazon.nova-pro-v1:0": {
        label: "Nova Pro",
        description: "Amazon's capable general-purpose model.",
        effortLevels: [],
      },
      "amazon.nova-lite-v1:0": {
        label: "Nova Lite",
        description: "Amazon's fast, lower-cost model.",
        effortLevels: [],
      },
    },
  },
  minimax: {
    name: "MiniMax",
    subtitle: "Global API",
    cost: "Pay-as-you-go on your MiniMax account",
    installUrl: "https://platform.minimax.io",
    apiKeyUrl: "https://platform.minimax.io",
    defaultModel: "MiniMax-M3",
    models: {
      "MiniMax-M3": {
        label: "MiniMax M3",
        description: "Best default. Long-context multimodal model.",
        effortLevels: ["low", "medium", "high"],
      },
      "MiniMax-M2.7": {
        label: "MiniMax M2.7",
        description: "Lower cost. Text-only reasoning model.",
        effortLevels: ["low", "medium", "high"],
      },
      "MiniMax-M2.7-highspeed": {
        label: "MiniMax M2.7 Highspeed",
        description: "Faster M2.7 tier for latency-sensitive chats.",
        effortLevels: ["low", "medium", "high"],
      },
    },
  },
};
