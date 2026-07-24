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
  installUrl?: string;
  /** For api-key providers: the dashboard URL where the user creates/copies the key. */
  apiKeyUrl?: string;
  /**
   * How the user connects this provider. Defaults from pi's `auth` (oauth →
   * `"oauth"`, else `"apiKey"`); pinned to `"oauth"` for the three subscription
   * providers, or `"openaiCompatible"` for the local provider.
   */
  auth?: "oauth" | "apiKey" | "openaiCompatible";
  /**
   * How this provider is BILLED, when it differs from what `auth` implies
   * (oauth → `"subscription"`, apiKey → `"payg"`). The Providers-tab filter
   * reads this (`providerBilling`), not `auth` directly — auth is how you
   * connect, this is how you pay, and they only coincide by default. The one
   * override that needs this today: OpenCode Go is a flat $10/month
   * subscription paid for with a pasted API key (`opencode-go` below).
   */
  billing?: "subscription" | "payg";
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

/** Inverse of `PROVIDER_ID_RENAME`: DISPLAY id → engine id (openai → openai-codex). */
const PROVIDER_ID_UNRENAME: Readonly<Record<string, string>> =
  Object.fromEntries(
    Object.entries(PROVIDER_ID_RENAME).map(([engine, display]) => [
      display,
      engine,
    ]),
  );

/**
 * ENGINE provider id → the DISPLAY id the picker/logos use (applies
 * `PROVIDER_ID_RENAME`: openai-codex → openai; everything else passes through).
 * Used to map a stored model-choice back to the display dialect on READ, mirror
 * of the engine-adapter's `toOldProvider` and `@houston/domain`'s
 * `PROVIDER_ALIASES` — duplicated here (not imported) because `app/` does not
 * depend on those packages, exactly as `use-conversation-vm` duplicates
 * `toOldProvider`.
 */
export function toDisplayProviderId(id: string): string {
  return PROVIDER_ID_RENAME[id] ?? id;
}

/**
 * DISPLAY provider id → the canonical ENGINE id (the inverse: openai →
 * openai-codex). The picker offers `openai` (Houston's rename of pi's
 * `openai-codex`), but the gateway/runtime resolve pi's `openai-codex`, so a
 * model-choice WRITE must canonicalize before it leaves the client — the same
 * mapping the direct-send path applies via `@houston/domain`
 * `canonicalProviderId` / `PROVIDER_ALIASES`. Houston never offers pi's raw
 * platform-key `openai`; if it ever does, this alias AND `PROVIDER_ID_RENAME`
 * must be removed together.
 */
export function toCanonicalProviderId(id: string): string {
  return PROVIDER_ID_UNRENAME[id] ?? id;
}

/**
 * pi providers dropped BEFORE the rename is applied. Two classes:
 * - `openai`: pi's direct api-key `openai` provider collides with the
 *   `openai-codex → openai` rename (Houston surfaces the OAuth Codex provider
 *   under `openai`, not the raw API-key one).
 * - Retired cards (2026-07 provider QA): Ant Ling, the Kimi For Coding
 *   subscription (Kimi models surface under Moonshot AI instead — see the
 *   moonshot-k3 catalog patch), Moonshot AI's China deployment, and the three
 *   regional Xiaomi Token Plans. Dropping is presentation-only: the ids stay
 *   runnable on the wire, so an existing conversation pinned to one keeps
 *   working; they just can't be connected or picked anymore.
 * - Structurally unconnectable (2026-07 provider QA): both Cloudflare providers
 *   need the user's ACCOUNT ID (AI Gateway also a gateway id) baked into the
 *   request URL, so the single-pasted-key connect dialog can never verify or
 *   run them — every attempt dead-ends in "could not verify". Dropped until a
 *   multi-field connect ships (mapped follow-up); same presentation-only rules.
 */
export const DROP_PI_PROVIDERS: ReadonlySet<string> = new Set([
  "openai",
  "ant-ling",
  "kimi-coding",
  "moonshotai-cn",
  "xiaomi-token-plan-ams",
  "xiaomi-token-plan-cn",
  "xiaomi-token-plan-sgp",
  "cloudflare-ai-gateway",
  "cloudflare-workers-ai",
]);

/**
 * Curated per-provider VISIBLE model sets, keyed by Houston (display) provider
 * id. A provider WITH an entry surfaces only these pi model ids; a provider
 * without one shows its full pi catalog. Both model surfaces read this one
 * table — the chat model picker (via `buildProvider` in `providers.ts`) and the
 * AI-hub models directory (via `piCatalogToCandidates`) — so the two can never
 * drift apart. Curation is presentation-only: a hidden id stays runnable on the
 * wire (an existing conversation pinned to one keeps working); it just can't be
 * picked anymore.
 *
 * Every id here must exist in the shipped pi-ai catalog — the drift guard
 * (`provider-overrides-drift.test.ts`) rejects orphans.
 */
export const VISIBLE_MODELS: Readonly<Record<string, ReadonlySet<string>>> = {
  openai: new Set([
    "gpt-5.5",
    "gpt-5.6-sol",
    "gpt-5.6-terra",
    "gpt-5.6-luna",
    "gpt-5.3-codex-spark",
    "gpt-5.4",
    "gpt-5.4-mini",
  ]),
  anthropic: new Set([
    "claude-sonnet-5",
    "claude-fable-5",
    // Backported into pi's catalog by the opus-5 catalog patch
    // (packages/host/src/providers/opus-5-catalog-patch.ts).
    "claude-opus-5",
    "claude-opus-4-8",
    "claude-opus-4-7",
    "claude-sonnet-4-6",
  ]),
  // NOTE: pi-ai ships no plain `gemini-3.1-flash` (only the Lite tier), so the
  // 3.1 line is represented by Flash Lite here. `gemini-3.6-flash` and
  // `gemini-3.5-flash-lite` are backported into pi's catalog by the
  // gemini-flash catalog patch (packages/host/src/providers/).
  google: new Set([
    "gemini-3.6-flash",
    "gemini-3.5-flash",
    "gemini-3.5-flash-lite",
    "gemini-3.1-flash-lite",
    "gemma-4-26b-a4b-it",
    "gemma-4-31b-it",
  ]),
};

/** Whether `modelId` may surface for `providerId` (a Houston display id). */
export function isModelVisible(providerId: string, modelId: string): boolean {
  const visible = VISIBLE_MODELS[providerId];
  return !visible || visible.has(modelId);
}

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

/**
 * Regional-deployment id suffixes (China / Singapore / Amsterdam). Providers
 * carrying one are hidden from the catalog whenever their standard (unsuffixed)
 * deployment also ships — one card per provider, no regional duplicates (see
 * `buildCatalog`).
 */
export const REGIONAL_SUFFIX = /-(cn|sgp|ams)$/;

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
      "gpt-5.6-sol": {
        label: "GPT-5.6 Sol",
        description: "OpenAI's newest frontier model.",
      },
      "gpt-5.6-terra": {
        label: "GPT-5.6 Terra",
        description: "Balanced mid-tier model.",
      },
      "gpt-5.6-luna": {
        label: "GPT-5.6 Luna",
        description: "Fast and cost-efficient for simpler tasks.",
      },
      "gpt-5.3-codex-spark": {
        label: "GPT-5.3 Codex Spark",
        description: "Ultra-fast coding model.",
      },
      "gpt-5.4": {
        label: "GPT-5.4",
        description: "Strong model for everyday coding.",
      },
      "gpt-5.4-mini": {
        label: "GPT-5.4 mini",
        description: "Small, fast, and cost-efficient for simpler tasks.",
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
    defaultModel: "claude-sonnet-5",
    models: {
      "claude-sonnet-5": {
        label: "Sonnet 5",
        description: "Newest Sonnet. Stronger agentic coding and tool use.",
      },
      "claude-fable-5": {
        label: "Fable 5",
        description: "Most capable model. Costs 2x more credits than Opus 5.",
      },
      "claude-opus-5": {
        label: "Opus 5",
        description:
          "Newest Opus. Deeper reasoning and stronger autonomous work.",
      },
      "claude-opus-4-8": {
        label: "Opus 4.8",
        description: "Previous Opus. Strong alignment and agentic coding.",
      },
      "claude-opus-4-7": {
        label: "Opus 4.7",
        description:
          "Older Opus. Strong coding autonomy and complex reasoning.",
      },
      "claude-sonnet-4-6": {
        label: "Sonnet 4.6",
        description: "Best balance of speed and quality.",
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
    billing: "subscription",
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
    installUrl: "https://ai.google.dev",
    apiKeyUrl: "https://aistudio.google.com/apikey",
    defaultModel: "gemini-3.5-flash",
    models: {
      "gemini-3.6-flash": {
        label: "Gemini 3.6 Flash",
        description: "Google's newest Flash. Stronger agents, cheaper output.",
      },
      "gemini-3.5-flash": {
        label: "Gemini 3.5 Flash",
        description: "Fast and capable. Best default.",
      },
      "gemini-3.5-flash-lite": {
        label: "Gemini 3.5 Flash Lite",
        description: "Lowest cost and latency for simpler tasks.",
      },
      "gemini-3.1-flash-lite": {
        label: "Gemini 3.1 Flash Lite",
        description: "Lightweight and quick for simpler tasks.",
      },
      "gemma-4-26b-a4b-it": {
        label: "Gemma 4 26B A4B IT",
        description: "Google's open Gemma model. Fast and efficient.",
      },
      "gemma-4-31b-it": {
        label: "Gemma 4 31B IT",
        description: "Google's open Gemma model. More capable.",
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
    apiKeyUrl:
      "https://platform.minimax.io/user-center/basic-information/interface-key",
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
  // Free-tier curation: these entries exist so the card's cost line can tell
  // users they can start at no cost. Row descriptions still come from
  // `DESCRIPTION_BY_ID` (no `description` here); names are set because every
  // override entry seeds a pre-hydration card.
  groq: {
    name: "Groq",
    subtitle: "Fast inference",
    cost: "Free tier, then pay as you go",
    installUrl: "https://groq.com",
    apiKeyUrl: "https://console.groq.com/keys",
  },
  cerebras: {
    name: "Cerebras",
    subtitle: "Very fast inference",
    cost: "Free tier, then pay as you go",
    installUrl: "https://www.cerebras.ai",
    apiKeyUrl: "https://cloud.cerebras.ai",
  },
  huggingface: {
    name: "Hugging Face",
    subtitle: "Open models hub",
    cost: "Free monthly credits, then pay as you go",
    installUrl: "https://huggingface.co",
    apiKeyUrl: "https://huggingface.co/settings/tokens",
  },
  mistral: {
    name: "Mistral",
    subtitle: "La Plateforme",
    cost: "Free tier, then pay as you go",
    installUrl: "https://mistral.ai",
    apiKeyUrl: "https://console.mistral.ai/api-keys",
  },
  xai: {
    name: "xAI",
    subtitle: "Grok models",
    cost: "Pay-as-you-go on your xAI account",
    installUrl: "https://x.ai",
    apiKeyUrl: "https://console.x.ai",
  },
  zai: {
    name: "Z.ai",
    subtitle: "GLM models",
    cost: "Pay-as-you-go on your Z.ai account",
    installUrl: "https://z.ai",
    apiKeyUrl: "https://z.ai/manage-apikey/apikey-list",
  },
  nvidia: {
    name: "NVIDIA",
    subtitle: "NIM inference",
    cost: "Free credits, then pay as you go",
    installUrl: "https://build.nvidia.com",
    apiKeyUrl: "https://build.nvidia.com/settings/api-keys",
  },
  "google-vertex": {
    name: "Google Vertex AI",
    subtitle: "Gemini on Google Cloud",
    cost: "Pay-as-you-go on your Google Cloud account",
    installUrl: "https://cloud.google.com/vertex-ai",
    apiKeyUrl: "https://console.cloud.google.com/apis/credentials",
  },
  fireworks: {
    name: "Fireworks",
    subtitle: "Serverless open models",
    cost: "Pay as you go",
    installUrl: "https://fireworks.ai",
    apiKeyUrl: "https://app.fireworks.ai/settings/users/api-keys",
  },
  together: {
    name: "Together AI",
    subtitle: "Open models, hosted",
    cost: "Pay as you go",
    installUrl: "https://together.ai",
    apiKeyUrl: "https://api.together.ai/settings/api-keys",
  },
  moonshotai: {
    name: "Moonshot AI",
    subtitle: "Kimi models",
    cost: "Pay as you go",
    installUrl: "https://platform.moonshot.ai",
    apiKeyUrl: "https://platform.moonshot.ai/console/api-keys",
    models: {
      // Backported into pi 0.80.6's catalog by the moonshot-k3 patch
      // (packages/host/src/providers/moonshot-k3-catalog-patch.ts).
      "kimi-k3": {
        label: "Kimi K3",
        description: "Moonshot's frontier model. Long context, vision.",
      },
    },
  },
  "zai-coding-cn": {
    name: "Z.ai Coding (China)",
    subtitle: "GLM coding plan, China endpoint",
    cost: "Your GLM Coding plan",
    billing: "subscription",
    installUrl: "https://open.bigmodel.cn",
    apiKeyUrl: "https://open.bigmodel.cn/usercenter/apikeys",
  },
  "vercel-ai-gateway": {
    name: "Vercel AI Gateway",
    subtitle: "Many models, one key",
    cost: "Pay-as-you-go on your Vercel account",
    installUrl: "https://vercel.com/ai-gateway",
    // The exact deep link Vercel's own 401 remedy points at: resolves to the
    // signed-in team's AI Gateway → API keys page with the create-key modal.
    apiKeyUrl:
      "https://vercel.com/d?to=%2F%5Bteam%5D%2F%7E%2Fai-gateway%2Fapi-keys%3FshowCreateKeyModal",
  },
  xiaomi: {
    name: "Xiaomi MiMo",
    subtitle: "MiMo models",
    cost: "Pay as you go",
    installUrl: "https://platform.xiaomimimo.com",
    apiKeyUrl: "https://platform.xiaomimimo.com",
  },
  "azure-openai-responses": {
    name: "Azure OpenAI",
    subtitle: "OpenAI on Microsoft Azure",
    cost: "Pay-as-you-go on your Azure account",
    installUrl:
      "https://azure.microsoft.com/products/ai-services/openai-service",
    // Azure keys live per-resource in the portal; there is no global key page.
    apiKeyUrl: "https://portal.azure.com",
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
  "vercel-ai-gateway": "One key for many models, from Vercel.",
  "azure-openai-responses": "OpenAI models on Microsoft Azure.",
  "google-vertex": "Gemini and more on Google Cloud Vertex AI.",
  xiaomi: "MiMo models from Xiaomi.",
  // Named regional / subscription variants (reuse the lab's niche).
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
