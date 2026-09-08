import type { ProviderOverride } from "./types.ts";

/**
 * The GATEWAY cards: one key that routes to many labs' models, billed by the
 * gateway rather than the lab.
 */
export const GATEWAY_OVERRIDES: Record<string, ProviderOverride> = {
  opencode: {
    name: "OpenCode Zen",
    subtitle: "Curated frontier models",
    description: "Curated frontier coding models, one key.",
    cost: "Pay as you go",
    installUrl: "https://opencode.ai/auth",
    apiKeyUrl: "https://opencode.ai/auth",
    models: {
      "claude-sonnet-4-6": {
        description: "Best balance of speed and quality.",
      },
      "claude-opus-4-8": {
        description: "Most capable Claude, slower.",
      },
      // OpenCode Zen's own gateway, not the ChatGPT subscription — gpt-5.5
      // stays runnable here (see the `openai` set above).
      "gpt-5.5": {
        description: "OpenAI's frontier model.",
      },
      "gemini-3.5-flash": {
        description: "Fast and capable.",
      },
      "mimo-v2.5-free": {
        description: "Free to try.",
      },
      "nemotron-3-ultra-free": {
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
    models: {
      "glm-5.1": {
        description: "Strong open coding model.",
      },
      "kimi-k2.6": {
        description: "Fast, capable open model.",
      },
      "minimax-m3": {
        description: "Capable open model.",
      },
      "qwen3.7-max": {
        description: "Large open model.",
      },
      "deepseek-v4-pro": {
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
    models: {
      "openrouter/free": {
        description: "OpenRouter's free tier. Good for testing, no cost.",
      },
      "anthropic/claude-sonnet-4.6": {
        description: "Anthropic's balanced model, via OpenRouter.",
      },
      "anthropic/claude-opus-4.8": {
        description: "Anthropic's flagship, via OpenRouter.",
      },
      "google/gemini-3-flash-preview": {
        description: "Google's fast model, via OpenRouter.",
      },
      "deepseek/deepseek-v4-pro": {
        description: "DeepSeek's flagship, via OpenRouter.",
      },
    },
  },
};
