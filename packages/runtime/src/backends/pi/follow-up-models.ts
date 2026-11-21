const FAST_COMPLETIONS_PROVIDERS: ReadonlySet<string> = new Set([
  "openrouter",
  "groq",
  "cerebras",
  "together",
  "fireworks",
]);

export function followUpPassServes(model: {
  api: string;
  provider: string;
}): boolean {
  switch (model.api) {
    case "openai-codex-responses":
    case "azure-openai-responses":
    case "google-vertex":
      return true;
    case "openai-responses":
      return model.provider === "openai";
    case "openai-completions":
      return FAST_COMPLETIONS_PROVIDERS.has(model.provider);
    case "anthropic-messages":
      return model.provider === "anthropic";
    case "google-generative-ai":
      return model.provider === "google";
    default:
      return false;
  }
}
