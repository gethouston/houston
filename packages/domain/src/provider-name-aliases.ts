import { PROVIDER_CANONICAL_RENAME } from "./provider-dialect";
import type { ProviderId } from "./provider-ids";

const SPOKEN_ALIASES: Readonly<Record<string, ProviderId>> = {
  codex: "openai-codex",
  chatgpt: "openai-codex",
  claude: "anthropic",
  gemini: "google",
  bedrock: "amazon-bedrock",
  copilot: "github-copilot",
};

export const PROVIDER_ALIASES: Readonly<Record<string, ProviderId>> = {
  ...PROVIDER_CANONICAL_RENAME,
  ...SPOKEN_ALIASES,
};
