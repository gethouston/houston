import { getProvider, type ModelOption } from "./providers.ts";

/** SQLite preference key for the user's OpenRouter model slug list. */
export const OPENROUTER_MODELS_PREF_KEY = "openrouter_models";

/** Curated paid OpenRouter slugs shipped in `providers.ts`. */
export function openRouterPaidRecommendedModelIds(): readonly string[] {
  return getProvider("openrouter")?.models.map((m) => m.id) ?? [];
}

/** @deprecated Use {@link openRouterPaidRecommendedModelIds}. */
export function openRouterRecommendedModelIds(): readonly string[] {
  return openRouterPaidRecommendedModelIds();
}

/** First-connect default: five OpenRouter-native picks (no Anthropic/OpenAI/Gemini duplicates). */
export const OPENROUTER_STARTER_MODEL_IDS = [
  "qwen/qwen3-coder:free",
  "meta-llama/llama-3.3-70b-instruct:free",
  "mistralai/mistral-small-3.1-24b-instruct:free",
  "qwen/qwen3-coder-next",
  "minimax/minimax-m3",
] as const;

export function openRouterStarterModelIds(): readonly string[] {
  return OPENROUTER_STARTER_MODEL_IDS;
}

/** True when the slug mirrors Houston's native Anthropic, OpenAI, or Gemini providers. */
export function isOpenRouterNativeDuplicateSlug(id: string): boolean {
  const lower = id.toLowerCase();
  if (lower.startsWith("anthropic/")) return true;
  if (lower.startsWith("openai/")) return true;
  if (lower.startsWith("google/gemini")) return true;
  return false;
}

/** Paid curated slugs excluding native-provider duplicates. */
export function openRouterDistinctPaidRecommendedModelIds(): readonly string[] {
  return openRouterPaidRecommendedModelIds().filter((id) => !isOpenRouterNativeDuplicateSlug(id));
}

/** Curated free models with tool support for the Codex harness. */
export const OPENROUTER_FREE_RECOMMENDED_MODEL_IDS = [
  "qwen/qwen3-coder:free",
  "google/gemma-3-27b-it:free",
  "meta-llama/llama-3.3-70b-instruct:free",
  "mistralai/mistral-small-3.1-24b-instruct:free",
  "deepseek/deepseek-r1-distill-llama-70b:free",
] as const;

/** One OpenRouter slug per line for the connect dialog textarea. */
export function formatOpenRouterModelsText(slugs: readonly string[]): string {
  return slugs.join("\n");
}

/** Parse textarea lines into deduped, non-empty OpenRouter slugs. */
export function parseOpenRouterModelsText(text: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const line of text.split(/\r?\n/)) {
    const slug = line.trim();
    if (!slug || seen.has(slug)) continue;
    if (!isOpenRouterModelSlug(slug)) continue;
    seen.add(slug);
    out.push(slug);
  }
  return out;
}

export function isOpenRouterModelSlug(id: string): boolean {
  return /^[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._:-]*$/i.test(id);
}

export function serializeOpenRouterModelSlugs(slugs: readonly string[]): string {
  return JSON.stringify([...slugs]);
}

export function deserializeOpenRouterModelSlugs(raw: string | null | undefined): string[] | null {
  if (!raw?.trim()) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    const slugs = parsed
      .filter((v): v is string => typeof v === "string")
      .map((s) => s.trim())
      .filter((s) => isOpenRouterModelSlug(s));
    return slugs.length > 0 ? [...new Set(slugs)] : null;
  } catch {
    return null;
  }
}

/** Human label for a slug not in the curated catalog. */
export function openRouterSlugLabel(slug: string): string {
  const tail = slug.split("/").pop() ?? slug;
  return tail.replace(/-/g, " ");
}

/** Resolve catalog metadata when known; otherwise synthesize a minimal option. */
export function openRouterModelOption(slug: string): ModelOption {
  const catalog = getProvider("openrouter")?.models.find((m) => m.id === slug);
  if (catalog) return catalog;
  return {
    id: slug,
    label: openRouterSlugLabel(slug),
    description: "",
  };
}

/** Build model options from stored slugs, preserving user order. */
export function openRouterModelsFromSlugs(slugs: readonly string[]): ModelOption[] {
  return slugs.map(openRouterModelOption);
}

/** Normalize slug list for persistence (falls back to curated defaults). */
export function normalizeOpenRouterModelSlugs(slugs: readonly string[]): string[] {
  const normalized = parseOpenRouterModelsText(formatOpenRouterModelsText(slugs));
  return normalized.length > 0 ? normalized : [...openRouterStarterModelIds()];
}
