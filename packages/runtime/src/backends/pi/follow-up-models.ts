/**
 * The models the follow-up pass (session/follow-up-pass.ts) asks for next-step
 * suggestions. The pass holds the turn's `done` for up to its timeout, so it
 * runs only on hosted APIs that answer a small request quickly. A local model,
 * the desktop's bridge or a custom OpenAI-compatible endpoint (provider
 * `openai-compatible`) is not on the list: there the person would wait seconds
 * after every reply for bubbles a slow model rarely gets right.
 */

/** Chat Completions hosts known to serve small requests fast. */
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
