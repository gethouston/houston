/**
 * Reasoning-effort levels, ordered low→high. The set a given model accepts
 * is model-specific (see `ModelOption.effortLevels`):
 * - Codex `model_reasoning_effort`: low/medium/high/xhigh (no `max`).
 * - Claude `--effort`: Opus 4.7 = all five; Sonnet 4.6 = low/medium/high/max
 *   (no `xhigh`). Claude self-clamps an unsupported value; Codex does not.
 */
export type EffortLevel = "low" | "medium" | "high" | "xhigh" | "max";

/** Effort applied when nothing else is configured. Mirrors the engine. */
export const DEFAULT_EFFORT: EffortLevel = "medium";

export interface ModelOption {
  id: string;
  label: string;
  description: string;
  /**
   * Reasoning-effort levels this model accepts, ordered low→high. Omitted
   * or empty means the model has no effort control and the picker hides the
   * effort row (e.g. Gemini, Haiku).
   */
  effortLevels?: readonly EffortLevel[];
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
    models: [
      {
        id: "gpt-5.5",
        label: "GPT-5.5",
        description: "OpenAI's frontier model.",
        effortLevels: ["low", "medium", "high", "xhigh"],
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
      {
        id: "sonnet",
        label: "Sonnet",
        description: "Best balance of speed and quality.",
        // Sonnet 4.6: has `max`, no `xhigh`.
        effortLevels: ["low", "medium", "high", "max"],
      },
      {
        id: "opus",
        label: "Opus",
        description: "Most capable. Slower, more tokens.",
        // Opus 4.7: full range.
        effortLevels: ["low", "medium", "high", "xhigh", "max"],
      },
    ],
    defaultModel: "sonnet",
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

/**
 * Return `providerId` only when it names a currently-active provider in
 * `PROVIDERS`. Used by the chat model selector and the per-chat
 * effective-provider fallback chain to skip stored values that point at
 * providers Houston has moved to `COMING_SOON_PROVIDERS` (e.g. an
 * activity record from a previous Houston version that selected Gemini
 * before it was paused). Callers chain it with `??` to fall through to
 * the next tier of preference.
 */
export function validProviderOrNull(providerId: string | null | undefined): string | null {
  return providerId && getProvider(providerId) ? providerId : null;
}

/**
 * Return `modelId` only when it names a model currently listed in `PROVIDERS`
 * for `providerId`. Stored configs can point at retired SKUs (e.g. the
 * phantom `gpt-5.5-codex` that ChatGPT never shipped); chain with `??
 * getDefaultModel(provider)` so the picker and the wire call agree on a
 * model the server will actually accept.
 */
export function validModelOrNull(
  providerId: string | null | undefined,
  modelId: string | null | undefined,
): string | null {
  return providerId && modelId && getModel(providerId, modelId) ? modelId : null;
}

/** Reasoning-effort levels the given provider+model accepts (low→high). */
export function getEffortLevels(
  providerId: string | null | undefined,
  modelId: string | null | undefined,
): readonly EffortLevel[] {
  if (!providerId || !modelId) return [];
  return getModel(providerId, modelId)?.effortLevels ?? [];
}

/**
 * The effort to actually use for a provider+model: the requested value when
 * the model accepts it, otherwise the shared default (or the lowest level if
 * the model somehow lacks `medium`). Returns `undefined` when the model has
 * no effort control, so callers omit the flag entirely. Mirrors the engine's
 * `sessions::resolve_effort`, keeping the picker honest about what will run.
 */
export function validEffortOrDefault(
  providerId: string | null | undefined,
  modelId: string | null | undefined,
  effort: string | null | undefined,
): EffortLevel | undefined {
  const levels = getEffortLevels(providerId, modelId);
  if (levels.length === 0) return undefined;
  if (effort && levels.includes(effort as EffortLevel)) return effort as EffortLevel;
  return levels.includes(DEFAULT_EFFORT) ? DEFAULT_EFFORT : levels[0];
}

export interface ComingSoonProviderInfo {
  readonly id: string;
  readonly name: string;
  readonly subtitle: string;
  readonly mark: string;
}

export const COMING_SOON_PROVIDERS: readonly ComingSoonProviderInfo[] = [
  // Gemini: engine support + bundled CLI machinery are intact in this
  // codebase. The UI keeps it under "coming soon" until the broader
  // rollout (account-tier gating, Windows fork-build) is ready. Listed
  // first so the alphabetised "next up" slot stays prominent.
  { id: "gemini", name: "Google", subtitle: "Gemini CLI", mark: "GM" },
  { id: "subq", name: "SubQ", subtitle: "SubQ Code", mark: "SQ" },
  { id: "deepseek", name: "DeepSeek", subtitle: "DeepSeek Coder", mark: "DS" },
  { id: "minimax", name: "MiniMax", subtitle: "M2", mark: "MM" },
] as const;
