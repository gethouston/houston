import type { ProviderOverride } from "./types.ts";

/**
 * The SUBSCRIPTION cards: a plan the user already pays for, connected by OAuth.
 */
export const SUBSCRIPTION_OVERRIDES: Record<string, ProviderOverride> = {
  openai: {
    name: "OpenAI",
    subtitle: "Codex",
    description: "GPT and Codex via your ChatGPT subscription.",
    cost: "Your ChatGPT subscription",
    installUrl: "https://github.com/openai/codex",
    auth: "oauth",
    models: {
      "gpt-6-luna": {
        description: "Houston's default. The lightest GPT-6 on your allowance.",
      },
      "gpt-6-sol": {
        description: "Mid GPT-6 tier. More depth than Luna for harder work.",
      },
      "gpt-6-astra": {
        description:
          "Most capable GPT-6. Uses your allowance 5x faster than Sol.",
      },
      "gpt-5.6-sol": {
        description: "Previous frontier model. Strong for complex work.",
      },
      "gpt-5.6-terra": {
        description: "Balanced mid-tier model.",
      },
      "gpt-5.6-luna": {
        description: "Fast and cost-efficient for simpler tasks.",
      },
      "gpt-5.5": {
        description: "Previous-generation full tier, from before GPT-5.6.",
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
    models: {
      "claude-sonnet-5": {
        description: "Newest Sonnet. Stronger agentic coding and tool use.",
      },
      "claude-fable-5-1": {
        description:
          "Newest Fable. Most capable model, costs 2x more credits than Opus 5.",
      },
      "claude-fable-5": {
        description: "Previous Fable. Costs 2x more credits than Opus 5.",
      },
      "claude-opus-5": {
        description:
          "Newest Opus. Deeper reasoning and stronger autonomous work.",
      },
      "claude-opus-4-8": {
        description: "Previous Opus. Strong alignment and agentic coding.",
      },
      "claude-opus-4-7": {
        description:
          "Older Opus. Strong coding autonomy and complex reasoning.",
      },
      "claude-sonnet-4-6": {
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
    models: {
      "gpt-5-mini": {
        description: "Fast and lightweight. Cheapest on every Copilot plan.",
      },
      // Sonnet 4.6 retired on Copilot 2026-09-01 (all but annual individual
      // plans); Sonnet 5 is GitHub's named replacement.
      "claude-sonnet-5": {
        description: "Best balance of speed and quality. Needs Copilot Pro.",
      },
      "claude-opus-4.8": {
        description:
          "Anthropic's flagship. Most capable, slower. Needs Copilot Pro.",
      },
      "claude-haiku-4.5": {
        description: "Anthropic's fastest, for quick tasks. Needs Copilot Pro.",
      },
      "gpt-5.5": {
        description: "OpenAI's frontier model. Needs Copilot Pro.",
      },
      "gemini-3.6-flash": {
        description: "Google's fast model. Needs Copilot Pro.",
      },
    },
  },
};
