import { PROVIDER_OVERRIDES } from "./overrides.ts";
import { REGIONAL_SUFFIX } from "./pi-catalog-filters.ts";

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
