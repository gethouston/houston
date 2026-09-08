import type { ProviderOverride } from "./types.ts";

/**
 * The API-KEY cards that also curate their model rows: labs and clouds whose
 * picker entries carry a Houston-written one-line description.
 */
export const CURATED_API_KEY_OVERRIDES: Record<string, ProviderOverride> = {
  deepseek: {
    name: "DeepSeek",
    subtitle: "Official DeepSeek API",
    description: "Frontier reasoning at low cost, from DeepSeek.",
    cost: "Pay-as-you-go on your DeepSeek account",
    installUrl: "https://platform.deepseek.com",
    apiKeyUrl: "https://platform.deepseek.com/api_keys",
    models: {
      "deepseek-v4-flash": {
        description: "Fast, low-cost DeepSeek model.",
      },
      "deepseek-v4-pro": {
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
    // Effort rows for 3.7/3.8 derive to low/medium/high; Google rejects
    // `minimal` on both (the carried pi-ai patch floors the no-effort path
    // at LOW).
    models: {
      "gemini-3.8-flash": {
        description: "Google's newest Flash. Best for agents and coding.",
      },
      "gemini-3.7-flash": {
        description: "Strong coding workhorse. Same price as 3.8.",
      },
      "gemini-3.6-flash": {
        description:
          "Previous Flash generation. Stronger agents, cheaper output.",
      },
      "gemini-3.5-flash": {
        description: "Fast and capable.",
      },
      "gemini-3.5-flash-lite": {
        description: "Lowest cost and latency for simpler tasks.",
      },
      "gemini-3.1-flash-lite": {
        description: "Lightweight and quick for simpler tasks.",
      },
      "gemma-4-26b-a4b-it": {
        description: "Google's open Gemma model. Fast and efficient.",
      },
      "gemma-4-31b-it": {
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
    models: {
      "global.anthropic.claude-sonnet-4-6": {
        description: "Anthropic's balanced model, via Bedrock.",
      },
      "global.anthropic.claude-opus-4-8": {
        description: "Anthropic's flagship, via Bedrock.",
      },
      "amazon.nova-pro-v1:0": {
        description: "Amazon's capable general-purpose model.",
      },
      "amazon.nova-lite-v1:0": {
        description: "Amazon's fast, lower-cost model.",
      },
    },
  },
  minimax: {
    name: "MiniMax",
    subtitle: "Global API",
    description: "Fast, affordable models for agent work.",
    // The Coding Plan key is separate from a pay-as-you-go key and they are NOT
    // interchangeable (HOU-1160) — the card must say which one to paste.
    cost: "Coding Plan subscription (paste that plan's API key) or pay-as-you-go",
    installUrl: "https://platform.minimax.io",
    apiKeyUrl:
      "https://platform.minimax.io/user-center/basic-information/interface-key",
    // The 1M-context tier MiniMax's Coding/Token plan bills against; also works
    // pay-as-you-go. A subscription key run on bare MiniMax-M3 reads as
    // "usage ran out" (HOU-1160), so this is the connect default.
    models: {
      "MiniMax-M3[1m]": {
        description:
          "Best default. 1M-context tier for the MiniMax coding/token plan or pay-as-you-go.",
      },
      "MiniMax-M3": {
        description: "Long-context multimodal model, pay-as-you-go.",
      },
      "MiniMax-M2.7": {
        description: "Lower cost. Text-only reasoning model.",
      },
      "MiniMax-M2.7-highspeed": {
        description: "Faster M2.7 tier for latency-sensitive chats.",
      },
    },
  },
};
