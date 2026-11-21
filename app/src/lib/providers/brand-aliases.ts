import { PROVIDER_DISPLAY_RENAME } from "@houston/sdk/provider-catalog";

export const BRAND_ALIASES: Readonly<Record<string, string>> = {
  ...PROVIDER_DISPLAY_RENAME,
  "minimax-cn": "minimax",
  "moonshotai-cn": "moonshotai",
  "kimi-coding": "moonshotai",
  "zai-coding-cn": "zai",
  "vercel-ai-gateway": "vercel",
  "xiaomi-token-plan-ams": "xiaomi",
  "xiaomi-token-plan-cn": "xiaomi",
  "xiaomi-token-plan-sgp": "xiaomi",
  "qwen-token-plan": "qwen",
  "qwen-token-plan-cn": "qwen",
  "qwen-token-plan-individual": "qwen",
  gemini: "google",
  amazon: "amazon-bedrock",
  moonshot: "moonshotai",
  "meta-llama": "meta",
  llama: "meta",
};
