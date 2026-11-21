import { savedActiveProvider } from "../ai/providers";

export function noProviderRefusal(): {
  error: string;
  code: "no_provider";
  provider?: string;
} {
  const saved = savedActiveProvider();
  return {
    error: "No provider connected. Connect an AI provider first.",
    code: "no_provider",
    ...(saved ? { provider: saved } : {}),
  };
}
