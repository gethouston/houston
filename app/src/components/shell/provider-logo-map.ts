import { BRAND_ALIASES } from "../../lib/providers/brand-aliases.ts";

export type BrandKey =
  | "anthropic"
  | "cohere"
  | "meta"
  | "qwen"
  | "openai"
  | "google"
  | "google-vertex"
  | "github-copilot"
  | "openrouter"
  | "amazon-bedrock"
  | "opencode"
  | "opencode-go"
  | "openai-compatible"
  | "deepseek"
  | "minimax"
  | "mistral"
  | "groq"
  | "cerebras"
  | "huggingface"
  | "cloudflare-workers-ai"
  | "cloudflare-ai-gateway"
  | "xai"
  | "vercel"
  | "nvidia"
  | "together"
  | "moonshotai"
  | "zai"
  | "fireworks"
  | "xiaomi"
  | "azure-openai-responses";

export const BRAND_KEYS: ReadonlySet<BrandKey> = new Set([
  "anthropic",
  "cohere",
  "meta",
  "qwen",
  "openai",
  "google",
  "google-vertex",
  "github-copilot",
  "openrouter",
  "amazon-bedrock",
  "opencode",
  "opencode-go",
  "openai-compatible",
  "deepseek",
  "minimax",
  "mistral",
  "groq",
  "cerebras",
  "huggingface",
  "cloudflare-workers-ai",
  "cloudflare-ai-gateway",
  "xai",
  "vercel",
  "nvidia",
  "together",
  "moonshotai",
  "zai",
  "fireworks",
  "xiaomi",
  "azure-openai-responses",
]);

export function providerBrandKey(id: string): BrandKey | null {
  if (BRAND_KEYS.has(id as BrandKey)) return id as BrandKey;
  const parent = BRAND_ALIASES[id];
  return parent !== undefined && BRAND_KEYS.has(parent as BrandKey)
    ? (parent as BrandKey)
    : null;
}

export function monogramText(seed: string): string {
  const cleaned = seed.replace(/[^\p{L}\p{N}]/gu, "");
  if (cleaned.length === 0) return "?";
  if (cleaned.length <= 2) return cleaned.toUpperCase();
  return cleaned.charAt(0).toUpperCase();
}
