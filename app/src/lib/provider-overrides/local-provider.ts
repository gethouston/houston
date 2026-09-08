import type { ProviderInfo } from "../providers/types.ts";

/**
 * The local OpenAI-compatible provider (Ollama / LM Studio / vLLM, direct or via
 * a tunnel). pi-ai has no such provider — the user supplies a base URL + model id
 * at runtime — so it is appended to the hydrated catalog verbatim. Gated by the
 * host's `openaiCompatible` capability (see `getVisibleProviders`).
 */
export const LOCAL_PROVIDER: ProviderInfo = {
  id: "openai-compatible",
  name: "Local model",
  subtitle: "Ollama, LM Studio, vLLM…",
  installUrl: "https://ollama.com",
  cost: "Runs on your computer, free",
  auth: "openaiCompatible",
  models: [],
  defaultModel: "",
};
