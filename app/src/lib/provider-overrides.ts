import type { EffortLevel, ProviderInfo } from "./providers.ts";

/**
 * Houston's provider/model catalog is now DYNAMIC: the runnable set (providers,
 * models, context windows, thinking levels, pricing, vision/reasoning flags)
 * comes from pi-ai over the host's `GET /v1/catalog` route and is hydrated into
 * `PROVIDERS` at runtime (see `hydrateProviderCatalog`).
 *
 * pi-ai does NOT ship the Houston-specific presentation metadata, though: brand
 * names (its provider `name` is a titleized id like "Openrouter" or an OAuth
 * subscription string) and per-model marketing labels/descriptions. This module
 * carries ONLY that missing metadata, keyed by the Houston provider id, so the
 * hydrator can layer it over pi's catalog. A model's reasoning-effort set is NO
 * longer curated here: it is derived from pi's per-model thinking levels
 * (`deriveEffortLevels`), the same source the runtime clamps against, so the two
 * can't drift. An override may still pin `effortLevels` for a genuine gateway cap
 * pi doesn't encode, but none currently need it. The per-model CONTEXT-WINDOW
 * overrides (defaults + credit-gated
 * snap-up ceilings) live in `@houston/protocol` (`MODEL_WINDOW_OVERRIDES`), shared
 * verbatim with the runtime's autocompact so the bar and the engine agree.
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
   * ESCAPE HATCH for a genuine gateway cap `deriveEffortLevels` can't see. By
   * default a model's effort set is derived from pi's per-model thinking levels;
   * set this ONLY when a specific gateway documents a real ceiling below what pi
   * reports (then comment the source), or `[]` to hide the effort row for a
   * model pi wrongly flags as reasoning. Do NOT use it to merely duplicate or
   * trim the derived list — that is the exact drift this catalog removed, and
   * the drift guard test rejects any id here that pi doesn't ship. None are set
   * today.
   */
  effortLevels?: readonly EffortLevel[];
}

/** Provider-level presentation metadata pi-ai can't supply, keyed by provider id. */
export interface ProviderOverride {
  /** Brand label (pi's `name` is a titleized id or an OAuth subscription string). */
  name?: string;
  subtitle?: string;
  /**
   * One-line provider description for the Providers LIST row (what the provider
   * is / its niche), rendered muted after the bold live model count. Kept short
   * (~60 chars) so it fits the compact row. Plain English, rendered directly
   * (the overrides layer is i18n-agnostic, matching `subtitle`) — NOT the longer
   * marketing copy the provider modal reads from `aiHub:providers.*.description`.
   * Every provider id resolves to one via `providerDescription`.
   */
  description?: string;
  cost?: string;
  /**
   * Has a usable free tier the user can start on without paying (the friendly
   * "free" quick-filter facet reads this). Curated and conservative — set only
   * where the provider verifiably lets a new user run models at no cost today
   * (Google's free AI Studio key, Groq/Cerebras free tiers, Hugging Face's
   * monthly credits, OpenRouter's free-routed models). Local models cost
   * nothing too, but that facet is derived from the auth chip, not this flag.
   */
  freeTier?: boolean;
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
/**
 * Providers pinned to the front of the AI Hub Providers tab, in this order.
 * Ordering applies ONLY inside the hub (see `orderFeaturedFirst`) — the chat
 * model picker maps `PROVIDERS` directly and is untouched. The local
 * OpenAI-compatible provider is capability-gated and may be absent; the ordering
 * tolerates any id here being missing.
 */
export const FEATURED_PROVIDER_IDS = [
  "anthropic",
  "openai",
  "google",
  "github-copilot",
  "openai-compatible",
] as const;

/** Regional-deployment id suffixes (China / Singapore / Amsterdam). */
const REGIONAL_SUFFIX = /-(cn|sgp|ams)$/;

export const PROVIDER_OVERRIDES: Record<string, ProviderOverride> = {
  openai: {
    name: "OpenAI",
    subtitle: "Codex",
    description: "GPT and Codex via your ChatGPT subscription.",
    cost: "Your ChatGPT subscription",
    installUrl: "https://github.com/openai/codex",
    auth: "oauth",
    defaultModel: "gpt-5.5",
    models: {
      "gpt-5.5": {
        label: "GPT-5.5",
        description: "OpenAI's frontier model.",
      },
      "gpt-5.4": {
        label: "GPT-5.4",
        description: "Strong model for everyday coding.",
      },
      "gpt-5.4-mini": {
        label: "GPT-5.4-Mini",
        description: "Small, fast, and cost-efficient for simpler tasks.",
      },
      "gpt-5.3-codex-spark": {
        label: "GPT-5.3-Codex-Spark",
        description: "Ultra-fast coding model.",
      },
    },
  },
  anthropic: {
    name: "Anthropic",
    subtitle: "Claude Code",
    description: "Claude models via your Claude subscription.",
    cost: "Your Claude subscription",
    installUrl: "https://docs.anthropic.com/en/docs/claude-code/overview",
    auth: "oauth",
    defaultModel: "claude-sonnet-4-6",
    models: {
      "claude-sonnet-4-6": {
        label: "Sonnet 4.6",
        description: "Best balance of speed and quality.",
      },
      "claude-opus-4-8": {
        label: "Opus 4.8",
        description:
          "Latest Opus. Better alignment and agentic coding than 4.7.",
      },
      "claude-fable-5": {
        label: "Fable 5",
        description: "Most capable model. Costs 2x more credits than Opus 4.8.",
      },
      "claude-opus-4-7": {
        label: "Opus 4.7",
        description:
          "Previous flagship. Strong coding autonomy and complex reasoning.",
      },
    },
  },
  "github-copilot": {
    // ONE Copilot card; connecting opens the Personal-vs-Enterprise dialog. Both
    // drive the single `github-copilot` engine provider. pi-ai `github-copilot`
    // ids use the DOTTED form (claude-sonnet-4.6).
    name: "GitHub Copilot",
    subtitle: "Personal or your company's plan",
    description: "Claude, GPT, and Gemini on one Copilot plan.",
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
      },
      "claude-sonnet-4.6": {
        label: "Claude Sonnet 4.6",
        description: "Best balance of speed and quality. Needs Copilot Pro.",
      },
      "claude-opus-4.8": {
        label: "Claude Opus 4.8",
        description:
          "Anthropic's flagship. Most capable, slower. Needs Copilot Pro.",
      },
      "claude-haiku-4.5": {
        label: "Claude Haiku 4.5",
        description: "Anthropic's fastest, for quick tasks. Needs Copilot Pro.",
      },
      "gpt-5.5": {
        label: "GPT-5.5",
        description: "OpenAI's frontier model. Needs Copilot Pro.",
      },
      "gpt-5-mini": {
        label: "GPT-5 Mini",
        description: "OpenAI's fast, lightweight model. Needs Copilot Pro.",
      },
      "gemini-3-flash-preview": {
        label: "Gemini 3 Flash",
        description: "Google's fast model. Needs Copilot Pro.",
      },
    },
  },
  opencode: {
    name: "OpenCode Zen",
    subtitle: "Curated frontier models",
    description: "Curated frontier coding models, one key.",
    cost: "Pay as you go",
    installUrl: "https://opencode.ai/auth",
    apiKeyUrl: "https://opencode.ai/auth",
    defaultModel: "claude-sonnet-4-6",
    models: {
      "claude-sonnet-4-6": {
        label: "Sonnet 4.6",
        description: "Best balance of speed and quality.",
      },
      "claude-opus-4-8": {
        label: "Opus 4.8",
        description: "Most capable Claude, slower.",
      },
      "gpt-5.5": {
        label: "GPT-5.5",
        description: "OpenAI's frontier model.",
      },
      "gemini-3.5-flash": {
        label: "Gemini 3.5 Flash",
        description: "Fast and capable.",
      },
      "deepseek-v4-flash-free": {
        label: "DeepSeek V4 Flash (Free)",
        description: "Fast. Free to try.",
      },
      "mimo-v2.5-free": {
        label: "MiMo V2.5 (Free)",
        description: "Free to try.",
      },
      "nemotron-3-ultra-free": {
        label: "Nemotron 3 Ultra (Free)",
        description: "NVIDIA. Free to try.",
      },
    },
  },
  "opencode-go": {
    name: "OpenCode Go",
    subtitle: "Open coding models",
    description: "Open coding models on a flat monthly plan.",
    cost: "$10 / month",
    installUrl: "https://opencode.ai/auth",
    apiKeyUrl: "https://opencode.ai/auth",
    defaultModel: "glm-5.1",
    models: {
      "glm-5.1": {
        label: "GLM-5.1",
        description: "Strong open coding model.",
      },
      "kimi-k2.6": {
        label: "Kimi K2.6",
        description: "Fast, capable open model.",
      },
      "minimax-m3": {
        label: "MiniMax M3",
        description: "Capable open model.",
      },
      "qwen3.7-max": {
        label: "Qwen3.7 Max",
        description: "Large open model.",
      },
      "deepseek-v4-pro": {
        label: "DeepSeek V4 Pro",
        description: "Strong reasoning.",
      },
    },
  },
  openrouter: {
    name: "OpenRouter",
    subtitle: "Any model, one key",
    description: "Any model from one key.",
    cost: "Free models, then pay as you go",
    freeTier: true,
    installUrl: "https://openrouter.ai",
    apiKeyUrl: "https://openrouter.ai/settings/keys",
    defaultModel: "anthropic/claude-sonnet-4.6",
    models: {
      "openrouter/free": {
        label: "Free (auto-routed)",
        description: "OpenRouter's free tier. Good for testing, no cost.",
      },
      "anthropic/claude-sonnet-4.6": {
        label: "Claude Sonnet 4.6",
        description: "Anthropic's balanced model, via OpenRouter.",
      },
      "anthropic/claude-opus-4.8": {
        label: "Claude Opus 4.8",
        description: "Anthropic's flagship, via OpenRouter.",
      },
      "google/gemini-3-flash-preview": {
        label: "Gemini 3 Flash",
        description: "Google's fast model, via OpenRouter.",
      },
      "deepseek/deepseek-v4-pro": {
        label: "DeepSeek V4 Pro",
        description: "DeepSeek's flagship, via OpenRouter.",
      },
    },
  },
  deepseek: {
    name: "DeepSeek",
    subtitle: "Official DeepSeek API",
    description: "Frontier reasoning at low cost, from DeepSeek.",
    cost: "Pay-as-you-go on your DeepSeek account",
    installUrl: "https://platform.deepseek.com",
    apiKeyUrl: "https://platform.deepseek.com/api_keys",
    defaultModel: "deepseek-v4-flash",
    models: {
      "deepseek-v4-flash": {
        label: "DeepSeek V4 Flash",
        description: "Fast, low-cost DeepSeek model.",
      },
      "deepseek-v4-pro": {
        label: "DeepSeek V4 Pro",
        description: "DeepSeek's most capable model.",
      },
    },
  },
  google: {
    name: "Google Gemini",
    subtitle: "Free key from AI Studio",
    description: "Gemini models, free key from AI Studio.",
    cost: "Free tier on your Google account",
    freeTier: true,
    installUrl: "https://ai.google.dev",
    apiKeyUrl: "https://aistudio.google.com/apikey",
    defaultModel: "gemini-3-flash-preview",
    models: {
      "gemini-3-flash-preview": {
        label: "Gemini 3 Flash",
        description: "Fast and capable. Best default.",
      },
      "gemini-3-pro-preview": {
        label: "Gemini 3 Pro",
        description: "Google's most capable, slower.",
      },
      "gemini-2.5-flash": {
        label: "Gemini 2.5 Flash",
        description: "Previous fast model.",
      },
      "gemini-2.5-pro": {
        label: "Gemini 2.5 Pro",
        description: "Previous flagship.",
      },
    },
  },
  "amazon-bedrock": {
    name: "Amazon Bedrock",
    subtitle: "Use Bedrock with your AWS account",
    description: "Claude and Nova on your own AWS account.",
    cost: "Pay-as-you-go on your AWS account",
    installUrl: "https://aws.amazon.com/bedrock/",
    apiKeyUrl: "https://console.aws.amazon.com/bedrock/home#/api-keys",
    defaultModel: "anthropic.claude-sonnet-4-6",
    models: {
      "anthropic.claude-sonnet-4-6": {
        label: "Claude Sonnet 4.6",
        description: "Anthropic's balanced model, via Bedrock.",
      },
      "anthropic.claude-opus-4-8": {
        label: "Claude Opus 4.8",
        description: "Anthropic's flagship, via Bedrock.",
      },
      "amazon.nova-pro-v1:0": {
        label: "Nova Pro",
        description: "Amazon's capable general-purpose model.",
      },
      "amazon.nova-lite-v1:0": {
        label: "Nova Lite",
        description: "Amazon's fast, lower-cost model.",
      },
    },
  },
  minimax: {
    name: "MiniMax",
    subtitle: "Global API",
    description: "Fast, affordable models for agent work.",
    cost: "Pay-as-you-go on your MiniMax account",
    installUrl: "https://platform.minimax.io",
    apiKeyUrl: "https://platform.minimax.io",
    defaultModel: "MiniMax-M3",
    models: {
      "MiniMax-M3": {
        label: "MiniMax M3",
        description: "Best default. Long-context multimodal model.",
      },
      "MiniMax-M2.7": {
        label: "MiniMax M2.7",
        description: "Lower cost. Text-only reasoning model.",
      },
      "MiniMax-M2.7-highspeed": {
        label: "MiniMax M2.7 Highspeed",
        description: "Faster M2.7 tier for latency-sensitive chats.",
      },
    },
  },
  // Free-tier curation: these entries exist so the "Free to try" quick filter
  // and the card's cost line can tell users they can start at no cost. Row
  // descriptions still come from `DESCRIPTION_BY_ID` (no `description` here);
  // names are set because every override entry seeds a pre-hydration card.
  groq: {
    name: "Groq",
    subtitle: "Fast inference",
    cost: "Free tier, then pay as you go",
    freeTier: true,
    installUrl: "https://groq.com",
    apiKeyUrl: "https://console.groq.com/keys",
  },
  cerebras: {
    name: "Cerebras",
    subtitle: "Very fast inference",
    cost: "Free tier, then pay as you go",
    freeTier: true,
    installUrl: "https://www.cerebras.ai",
    apiKeyUrl: "https://cloud.cerebras.ai",
  },
  huggingface: {
    name: "Hugging Face",
    subtitle: "Open models hub",
    cost: "Free monthly credits, then pay as you go",
    freeTier: true,
    installUrl: "https://huggingface.co",
    apiKeyUrl: "https://huggingface.co/settings/tokens",
  },
};

/**
 * One-line row descriptions for every pi provider whose override carries no
 * `description` field (plus the local `openai-compatible` provider, whose
 * `ProviderInfo` is appended verbatim, not built from an override). Accurate and
 * concise (~60 chars) — what the provider is / its niche, not marketing. Named
 * regional variants are listed so they read on their own; any other `*-cn` /
 * `*-sgp` / `*-ams` id falls back to its parent's description (see
 * `providerDescription`). Curated providers' row copy lives on their override's
 * `description` field, which wins over this map.
 */
export const DESCRIPTION_BY_ID: Readonly<Record<string, string>> = {
  "openai-compatible": "Local models via Ollama, LM Studio, or vLLM.",
  groq: "Ultra-low-latency inference on custom LPU hardware.",
  mistral: "European open-weight and frontier models.",
  xai: "Grok models from xAI.",
  cerebras: "Wafer-scale inference, very fast.",
  fireworks: "Fast serverless inference for open models.",
  together: "Open-weight models, hosted and fast.",
  nvidia: "Open models served on NVIDIA NIM.",
  huggingface: "Open models via Hugging Face Inference.",
  moonshotai: "Kimi models from Moonshot AI.",
  zai: "GLM open models from Z.ai.",
  cohere: "Enterprise RAG and Command models.",
  perplexity: "Search-grounded Sonar models.",
  "ant-ling": "Ling open models from Ant Group.",
  "vercel-ai-gateway": "One key for many models, from Vercel.",
  "cloudflare-ai-gateway": "Route to many models through Cloudflare.",
  "cloudflare-workers-ai": "Open models on Cloudflare's edge network.",
  "azure-openai-responses": "OpenAI models on Microsoft Azure.",
  "google-vertex": "Gemini and more on Google Cloud Vertex AI.",
  // Named regional / subscription variants (reuse the lab's niche).
  "kimi-coding": "Kimi coding subscription from Moonshot AI.",
  "zai-coding": "GLM coding subscription from Z.ai.",
};

/**
 * Resolve a provider id to its one-line row description. A curated override's
 * `description` wins, then the `DESCRIPTION_BY_ID` map, then — for a regional
 * `*-cn` / `*-sgp` / `*-ams` id with no entry of its own — its parent provider's
 * description. Returns `""` only for a provider we have never described (so the
 * row shows nothing rather than a wrong niche). Never throws on an unknown id.
 */
export function providerDescription(id: string): string {
  const curated = PROVIDER_OVERRIDES[id]?.description;
  if (curated) return curated;
  const direct = DESCRIPTION_BY_ID[id];
  if (direct) return direct;
  const parent = id.replace(REGIONAL_SUFFIX, "");
  if (parent !== id) {
    return (
      PROVIDER_OVERRIDES[parent]?.description ?? DESCRIPTION_BY_ID[parent] ?? ""
    );
  }
  return "";
}

/**
 * The friendly one-line cost prose for a provider (e.g. "Your Claude
 * subscription", "Pay as you go"), read from its curated override's `cost`.
 * Returns `undefined` for any id without a curated cost line (the ~25 uncurated
 * pi providers, plus the local `openai-compatible` provider whose cost lives on
 * its `ProviderInfo`, not an override) so the card can omit the line rather than
 * show a wrong or empty one. The provider cards render this.
 */
export function providerCostLine(id: string): string | undefined {
  return PROVIDER_OVERRIDES[id]?.cost;
}
