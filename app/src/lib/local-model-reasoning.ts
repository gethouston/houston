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

export function looksLikeReasoningModel(modelId: string): boolean {
  const id = modelId.toLowerCase();
  return REASONING_ID_HINTS.some((hint) => id.includes(hint));
}
