import type { Model } from "@earendil-works/pi-ai";
import { GOOGLE_MODELS } from "@earendil-works/pi-ai/providers/google.models";

/**
 * Backport Gemini 3.6 Flash and Gemini 3.5 Flash-Lite into pi-ai 0.80.6's
 * baked Google catalog, so `GET /v1/catalog` advertises them and the picker
 * can offer them.
 *
 * Unlike the Kimi K3 patch (copied verbatim from pi-ai 0.80.10), NO shipped
 * pi-ai version carries these yet — Google released both models on
 * 2026-07-21. The entries are hand-authored from the official specs
 * (ai.google.dev model + pricing pages: 1,048,576-token window, 65,536 max
 * output, multimodal input, thinking; 3.6 Flash $1.50/$7.50 + $0.15 cache
 * read, 3.5 Flash-Lite $0.30/$2.50 + $0.03 cache read), mirroring the shape
 * of the sibling `gemini-3.5-flash` entry. `thinkingLevelMap: { off: null }`
 * matches every shipped Gemini Flash entry (thinking on, no exposed level
 * control) — revisit when pi ships the models natively with a level map.
 * Gemini 3.5 Flash Cyber is deliberately NOT added: it has no public API
 * (governments/trusted-partners pilot only).
 *
 * Idempotent: a no-op once pi-ai serves them natively. The runtime has a twin
 * (packages/runtime/src/ai/gemini-flash-catalog-patch.ts) because host and
 * runtime are separate processes — DELETE BOTH when the pi bump lands.
 */
const GOOGLE_BASE_URL = "https://generativelanguage.googleapis.com/v1beta";

const GEMINI_FLASH_BACKPORTS: Model<"google-generative-ai">[] = [
  {
    id: "gemini-3.6-flash",
    name: "Gemini 3.6 Flash",
    api: "google-generative-ai",
    provider: "google",
    baseUrl: GOOGLE_BASE_URL,
    reasoning: true,
    thinkingLevelMap: { off: null },
    input: ["text", "image"],
    cost: { input: 1.5, output: 7.5, cacheRead: 0.15, cacheWrite: 0 },
    contextWindow: 1048576,
    maxTokens: 65536,
  },
  {
    id: "gemini-3.5-flash-lite",
    name: "Gemini 3.5 Flash Lite",
    api: "google-generative-ai",
    provider: "google",
    baseUrl: GOOGLE_BASE_URL,
    reasoning: true,
    thinkingLevelMap: { off: null },
    input: ["text", "image"],
    cost: { input: 0.3, output: 2.5, cacheRead: 0.03, cacheWrite: 0 },
    contextWindow: 1048576,
    maxTokens: 65536,
  },
] as Model<"google-generative-ai">[];

export function ensureGeminiFlashBackports(): void {
  const table = GOOGLE_MODELS as Record<string, Model<"google-generative-ai">>;
  for (const model of GEMINI_FLASH_BACKPORTS) {
    if (!table[model.id]) table[model.id] = model;
  }
}

ensureGeminiFlashBackports();
