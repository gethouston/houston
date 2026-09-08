/**
 * pi's provider ids — the vocabulary every other provider table is keyed by.
 *
 * A dependency-free LEAF (see `provider-dialect.ts` for why the provider
 * modules stay loadable on their own).
 */

/** pi's provider ids (mirror of packages/runtime ProviderId). */
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
  // Any other pi-ai provider id (the catalog is ~35 providers and drifts). The
  // `(string & {})` widening accepts any provider id while keeping literal
  // autocomplete for the named ids above.
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

/**
 * The provider a migration falls back to when the stored provider is
 * unrecognizable. Codex (ChatGPT) is the cloud default and the only provider
 * cloud serves, so it is the safe universal floor.
 */
export const DEFAULT_PROVIDER: ProviderId = "openai-codex";
