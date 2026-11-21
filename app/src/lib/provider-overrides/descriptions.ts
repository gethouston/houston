import { PROVIDER_OVERRIDES } from "./overrides.ts";
import { REGIONAL_SUFFIX } from "./pi-catalog-filters.ts";

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
  "zai-coding": "GLM coding subscription from Z.ai.",
};

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

export function providerCostLine(id: string): string | undefined {
  return PROVIDER_OVERRIDES[id]?.cost;
}
