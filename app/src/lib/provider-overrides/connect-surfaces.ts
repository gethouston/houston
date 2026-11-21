export const API_KEY_ENDPOINT_PROVIDERS: ReadonlySet<string> = new Set([
  "azure-openai-responses",
]);

export const FEATURED_PROVIDER_IDS = [
  "anthropic",
  "openai",
  "google",
  "github-copilot",
  "openai-compatible",
] as const;
