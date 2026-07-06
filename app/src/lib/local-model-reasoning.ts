/**
 * Reasoning-model heuristic for the "connect a local model" flow. DOM-free and
 * Tauri-free so it unit-tests under bare Node (`app/tests/local-model.test.ts`).
 *
 * Used ONLY to pre-check the "show the model's thinking" toggle as a hint — the
 * user can always override it. The saved endpoint's `reasoning` flag is what
 * actually surfaces the model's chain-of-thought (the backend already consumes
 * it); this heuristic just picks a sensible default.
 */

/** Substrings that mark a model id as a reasoning (chain-of-thought) model. */
const REASONING_ID_HINTS = [
  "r1",
  "qwq",
  "magistral",
  "thinking",
  "reasoning",
  "deepseek-r",
  "o1",
  "o3",
  "-a4b",
  "phi-4-reasoning",
] as const;

/**
 * Heuristic: does this model id look like a reasoning model? Case-insensitive
 * substring match against common reasoning-model markers.
 */
export function looksLikeReasoningModel(modelId: string): boolean {
  const id = modelId.toLowerCase();
  return REASONING_ID_HINTS.some((hint) => id.includes(hint));
}
