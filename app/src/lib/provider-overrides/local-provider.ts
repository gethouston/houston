import type { ProviderInfo } from "../providers/types.ts";

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
