import type { ProviderId } from "./provider-ids";

export const DEFAULT_MODEL: Partial<Record<ProviderId, string>> = {
  anthropic: "claude-sonnet-5-5",
  "openai-codex": "gpt-6-luna",
  "github-copilot": "gpt-6-luna",
  opencode: "claude-sonnet-4-6",
  "opencode-go": "glm-5.3",
  openrouter: "anthropic/claude-sonnet-4.6",
  deepseek: "deepseek-flash",
  google: "gemini-3.8-flash",
  "amazon-bedrock": "global.anthropic.claude-sonnet-4-6",
  minimax: "MiniMax-M3.1-Flash",
  nvidia: "minimaxai/minimax-m3.1-flash",
  qwen: "qwen3.7-max",
  mistral: "mistral-large-4",
  "qwen-token-plan": "qwen3.7-max",
  "qwen-token-plan-individual": "qwen3.7-max",
  moonshotai: "kimi-k3",
  "azure-openai-responses": "gpt-5.5",
};
