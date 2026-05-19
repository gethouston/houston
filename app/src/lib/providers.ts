export interface ModelOption {
  id: string;
  label: string;
  description: string;
}

/**
 * How a provider authenticates.
 *
 * - `"cli"`: the provider exposes a CLI login command (e.g. `claude login`,
 *   `codex login`). Houston runs it via `tauriProvider.launchLogin` and the
 *   provider's own browser flow takes over.
 * - `"apiKey"`: the provider has NO CLI login flow. The user must paste an
 *   API key from the provider's console and Houston surfaces a dedicated
 *   dialog with the instructions instead of calling `launchLogin`.
 */
export type ProviderLoginKind = "cli" | "apiKey";

export interface ProviderInfo {
  id: string;
  name: string;
  subtitle: string;
  cliName: string;
  installUrl: string;
  loginCommand: string;
  cost: string;
  models: readonly ModelOption[];
  defaultModel: string;
  /** Auth flow this provider uses. Defaults to "cli" when omitted. */
  loginKind?: ProviderLoginKind;
  /**
   * Optional URL the connect dialog points API-key users at to mint a key.
   * Only meaningful when `loginKind === "apiKey"`.
   */
  apiKeyConsoleUrl?: string;
  /**
   * Shell `export` command (env var name) for API-key providers. Shown in
   * the connect dialog so the user can paste it into their shell rc.
   */
  apiKeyEnvVar?: string;
}

export const PROVIDERS: readonly ProviderInfo[] = [
  {
    id: "openai",
    name: "OpenAI",
    subtitle: "Codex",
    cliName: "codex",
    installUrl: "https://github.com/openai/codex",
    loginCommand: "codex login",
    cost: "Your ChatGPT subscription",
    // `gpt-5.5` is the default because the `-codex` variant is not granted
    // on every ChatGPT plan (Business / Enterprise users hit a hard 400
    // "model is not supported when using Codex with a ChatGPT account").
    // Plain `gpt-5.5` works on every plan that Codex accepts at all, so we
    // default there and let users opt into `-codex` via the picker if their
    // plan allows it.
    models: [
      {
        id: "gpt-5.5",
        label: "GPT-5.5",
        description: "Works on every ChatGPT plan. Recommended default.",
      },
      {
        id: "gpt-5.5-codex",
        label: "GPT-5.5 Codex",
        description: "Coding-tuned. Some ChatGPT plans (e.g. Business) do not include it.",
      },
    ],
    defaultModel: "gpt-5.5",
  },
  {
    id: "anthropic",
    name: "Anthropic",
    subtitle: "Claude Code",
    cliName: "claude",
    installUrl: "https://docs.anthropic.com/en/docs/claude-code/overview",
    loginCommand: "claude login",
    cost: "Your Claude subscription",
    models: [
      { id: "sonnet", label: "Sonnet", description: "Best balance of speed and quality." },
      { id: "opus", label: "Opus", description: "Most capable. Slower, more tokens." },
    ],
    defaultModel: "sonnet",
  },
  {
    id: "gemini",
    name: "Google",
    subtitle: "Gemini CLI",
    cliName: "gemini",
    installUrl: "https://github.com/google-gemini/gemini-cli",
    // Gemini has no `gemini login` command. The engine returns BadRequest
    // if `launchLogin` is called for this provider; the picker MUST
    // short-circuit on `loginKind === "apiKey"` and open the API-key
    // connect dialog instead.
    loginCommand: "",
    cost: "Your Google account (free tier) or Gemini API key",
    // Pro Preview (`gemini-3.1-pro-preview`) is intentionally omitted — it
    // is gated behind paid Google AI tiers and free-tier OAuth accounts
    // get zero quota for it. Live test: 10 retries → "exhausted capacity"
    // on every call → 4+ minute hang with no response. Adding it back
    // requires either (a) an account-tier check that hides it for free
    // users, or (b) an "advanced models" disclosure card the user opts
    // into. Until then, ship the model that actually works.
    models: [
      {
        id: "gemini-3.1-flash-lite",
        label: "Gemini 3.1 Flash-Lite",
        description: "Fast and efficient. Works on the free tier.",
      },
    ],
    defaultModel: "gemini-3.1-flash-lite",
    loginKind: "apiKey",
    apiKeyConsoleUrl: "https://aistudio.google.com/app/apikey",
    apiKeyEnvVar: "GEMINI_API_KEY",
  },
] as const;

/** Find a provider by id. */
export function getProvider(id: string): ProviderInfo | undefined {
  return PROVIDERS.find((p) => p.id === id);
}

/** Find the model object for a provider + model id. */
export function getModel(providerId: string, modelId: string): ModelOption | undefined {
  return getProvider(providerId)?.models.find((m) => m.id === modelId);
}

/** Get the default provider + model for a provider id. */
export function getDefaultModel(providerId: string): string {
  return getProvider(providerId)?.defaultModel ?? "sonnet";
}

export interface ComingSoonProviderInfo {
  readonly id: string;
  readonly name: string;
  readonly subtitle: string;
  readonly mark: string;
}

export const COMING_SOON_PROVIDERS: readonly ComingSoonProviderInfo[] = [
  { id: "subq", name: "SubQ", subtitle: "SubQ Code", mark: "SQ" },
  { id: "deepseek", name: "DeepSeek", subtitle: "DeepSeek Coder", mark: "DS" },
  { id: "minimax", name: "MiniMax", subtitle: "M2", mark: "MM" },
] as const;
