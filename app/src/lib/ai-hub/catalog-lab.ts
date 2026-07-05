/**
 * Deriving the making lab of a model from the snapshot. Uses OpenRouter
 * `vendor/model` id prefixes first, then models.dev `family` fields, then name
 * heuristics. Internal to the catalog build.
 */
import type { RawModel } from "./catalog-snapshot.ts";
import type { LabId } from "./catalog-types.ts";

/** The provider that IS the lab, used to pick a merged model's canonical name. */
export const HOME_PROVIDER: Partial<Record<LabId, string>> = {
  anthropic: "anthropic",
  openai: "openai",
  google: "google",
  amazon: "amazon-bedrock",
  deepseek: "deepseek",
  minimax: "minimax",
};

const VENDOR_LAB: Record<string, LabId> = {
  anthropic: "anthropic",
  openai: "openai",
  google: "google",
  "meta-llama": "meta",
  meta: "meta",
  mistralai: "mistral",
  mistral: "mistral",
  qwen: "qwen",
  "z-ai": "zai",
  zai: "zai",
  deepseek: "deepseek",
  minimax: "minimax",
  moonshotai: "moonshot",
  moonshot: "moonshot",
  cohere: "cohere",
  "x-ai": "xai",
  xai: "xai",
  amazon: "amazon",
  nvidia: "nvidia",
};

/** Map a family/name string to a lab, most specific rules first. */
function heuristicLab(text: string): LabId | undefined {
  if (text.includes("claude")) return "anthropic";
  if (/\bgpt\b|gpt-|codex|(^| )o\d|(^| )o-mini|(^| )o-pro/.test(text))
    return "openai";
  if (text.includes("gemini") || text.includes("gemma")) return "google";
  if (text.includes("llama")) return "meta";
  if (/mistral|codestral|devstral|ministral|magistral/.test(text))
    return "mistral";
  if (text.includes("qwen")) return "qwen";
  if (text.includes("deepseek")) return "deepseek";
  if (text.includes("grok")) return "xai";
  if (text.includes("nova")) return "amazon";
  if (text.includes("minimax")) return "minimax";
  if (text.includes("glm")) return "zai";
  if (text.includes("kimi")) return "moonshot";
  if (/\bcommand\b|command-/.test(text)) return "cohere";
  if (text.includes("nemotron")) return "nvidia";
  return undefined;
}

export function detectLab(providerId: string, raw: RawModel): LabId {
  if (providerId === "openrouter") {
    const vendor = raw.id.replace(/^~/, "").split("/")[0];
    const mapped = VENDOR_LAB[vendor];
    if (mapped) return mapped;
  }
  return (
    (raw.family ? heuristicLab(raw.family.toLowerCase()) : undefined) ??
    heuristicLab(raw.name.toLowerCase()) ??
    "other"
  );
}
