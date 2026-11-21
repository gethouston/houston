export type ProviderId =
  | "anthropic"
  | "openai-codex"
  | "github-copilot"
  | "opencode"
  | "opencode-go"
  | "openrouter"
  | "deepseek"
  | "google"
  | "amazon-bedrock"
  | "minimax"
  | "openai-compatible"
  | (string & {});

const PROVIDER_IDS: readonly ProviderId[] = [
  "anthropic",
  "openai-codex",
  "github-copilot",
  "opencode",
  "opencode-go",
  "openrouter",
  "deepseek",
  "google",
  "amazon-bedrock",
  "minimax",
  "openai-compatible",
];

export const isProviderId = (s: string): s is ProviderId =>
  (PROVIDER_IDS as readonly string[]).includes(s);

export const DEFAULT_PROVIDER: ProviderId = "openai-codex";
