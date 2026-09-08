/**
 * The provider-catalog SHAPES a surface reads (`ProviderInfo`, `ModelOption`,
 * `ContextWindowConfig`) plus the reasoning-effort vocabulary. A leaf module
 * with no imports: the override tables in `../provider-overrides/` type against
 * it without a cycle back through the catalog it feeds (`./catalog.ts`).
 */

/**
 * Reasoning-effort levels, ordered low→high. `xhigh` is the top tier: it is the
 * deepest reasoning any provider actually exposes (pi's ceiling, which the
 * Claude backend maps to the SDK's `max` effort). Houston used to carry a fifth
 * `max` tier above `xhigh`, but the two produced the byte-identical API request
 * on every provider — a label with no effect — so it was removed. The set a
 * given model accepts is model-specific (see `ModelOption.effortLevels`),
 * derived from pi's per-model thinking levels (`deriveEffortLevels`).
 */
export type EffortLevel = "low" | "medium" | "high" | "xhigh";

/**
 * The full effort vocabulary, ascending. Drives the composer's effort-gauge so
 * the icon always shows the SAME number of bars (filled to the active level's
 * position), regardless of how many levels a given model offers — a model with
 * only `high`/`xhigh` reads as a nearly-full gauge, not two lone bars.
 */
export const EFFORT_ORDER: readonly EffortLevel[] = [
  "low",
  "medium",
  "high",
  "xhigh",
];

/** Effort applied when nothing else is configured. Mirrors the engine. */
export const DEFAULT_EFFORT: EffortLevel = "medium";

export interface ModelOption {
  id: string;
  label: string;
  description: string;
  /**
   * Whether the model accepts image INPUT (the catalog's `vision` flag).
   * Absent on seed/override-only entries (pre-hydration) = unknown — the
   * composer's image gate only blocks on a definitive `false`.
   */
  acceptsImages?: boolean;
  /**
   * Reasoning-effort levels this model accepts, ordered low→high. Omitted
   * or empty means the model has no effort control and the picker hides the
   * effort row (e.g. Haiku).
   */
  effortLevels?: readonly EffortLevel[];
  /**
   * Default assumed context window (tokens) — the denominator the composer's
   * context-usage indicator STARTS with. The real window is plan/credit-gated
   * and is NOT reported by `claude -p` (verified: the stream's `system init`
   * event carries only `model`, no window; no flag, no env var). Specifically:
   *   - Opus 4.x: 1M only on Max/Team/Enterprise (automatic) or with usage
   *     credits; 200k on Pro without credits.
   *   - Sonnet 4.6: 200k unless usage credits are enabled (on every plan).
   *   - Codex caps its full tier (gpt-6-astra) at ~272k regardless of the 1M
   *     raw API offer.
   * So this is an estimate. The indicator snaps UP to `contextWindowMax` once
   * a session's observed usage exceeds this default, which PROVES the real
   * window is larger (Claude Code auto-compacts before the limit, so observed
   * usage can never exceed the true window). Omit to hide the % and show a raw
   * token count instead.
   */
  contextWindow?: number;
  /**
   * Snap-up ceiling (tokens) for the self-correcting estimate. When a
   * session's observed usage exceeds `contextWindow`, the indicator switches
   * the denominator to this value. Defaults to `contextWindow` when omitted
   * (no snapping). Set above `contextWindow` only for models whose window is
   * gated upward at runtime — e.g. Sonnet 4.6 (200k default → 1M with credits).
   */
  contextWindowMax?: number;
}

export interface ProviderInfo {
  id: string;
  name: string;
  subtitle: string;
  installUrl: string;
  cost: string;
  models: readonly ModelOption[];
  defaultModel: string;
  /**
   * How the user connects this provider. Default (absent) is subscription OAuth
   * (Claude / Codex). `"apiKey"` providers ask the user to
   * paste a key instead. Houston opens `apiKeyUrl` for them to grab one.
   * `"openaiCompatible"` providers (an OpenAI-compatible server: Ollama / vLLM /
   * LM Studio, reached directly or through a tunnel) ask for a base URL + model
   * id. Both run only on the new TS engine, and `openaiCompatible` surfaces
   * wherever the host reports the `openaiCompatible` capability (desktop, cloud,
   * or self-host) — see `getVisibleProviders`.
   */
  auth?: "oauth" | "apiKey" | "openaiCompatible";
  /** For `auth: "apiKey"`: the dashboard URL where the user creates/copies the key. */
  apiKeyUrl?: string;
  /**
   * GitHub Copilot: connecting opens a small dialog to choose Personal
   * (github.com) vs Company / GitHub Enterprise (which collects the company
   * GitHub domain). Both drive the single `github-copilot` engine provider — the
   * only difference is the domain passed at login (stored as the credential's
   * `enterpriseUrl`, which routes the device-code flow + central token refresh at
   * the company's GitHub). See `useCopilotConnect`.
   */
  copilotConnect?: boolean;
  /**
   * The engine gateway ids a single connect card stands in for. Only the merged
   * "OpenCode" account sets it (`["opencode", "opencode-go"]`); absent on every
   * other provider, which is its own single gateway. A pasted key is written to
   * (and sign-out clears) every id in this set. See `getConnectProviders` and
   * `providerGatewayIds`.
   */
  gatewayIds?: readonly string[];
}

/** Default + snap-up ceiling for a model's context window (tokens). */
export interface ContextWindowConfig {
  /** Starting denominator for the usage indicator (the estimate). */
  default: number;
  /** Snap-up ceiling once observed usage proves a larger window. */
  max: number;
}
