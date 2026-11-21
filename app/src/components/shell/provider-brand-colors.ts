import { type BrandKey, providerBrandKey } from "./provider-logo-map.ts";

const BRAND_COLORS: Partial<Record<BrandKey, string>> = {
  anthropic: "#D97757",
  cohere: "#FF7759",
  meta: "#0668E1",
  qwen: "#615CED",
  openai: "#10A37F",
  google: "#4285F4",
  "google-vertex": "#4285F4",
  "github-copilot": "#8250DF",
  openrouter: "#6366F1",
  "amazon-bedrock": "#FF9900",
  "openai-compatible": "#10B981",
  deepseek: "#4D6BFE",
  minimax: "#F23F5D",
  mistral: "#FA520F",
  groq: "#F55036",
  cerebras: "#F15A22",
  huggingface: "#FFD21E",
  "cloudflare-workers-ai": "#F6821F",
  "cloudflare-ai-gateway": "#F6821F",
  nvidia: "#76B900",
  together: "#0F6FFF",
  fireworks: "#7C3AED",
  xiaomi: "#FF6900",
  "azure-openai-responses": "#0078D4",
};

export function providerBrandColor(providerId: string): string | undefined {
  const key = providerBrandKey(providerId);
  return key ? BRAND_COLORS[key] : undefined;
}
