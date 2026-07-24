/**
 * The ONE source of truth for context-window sizing, shared by the frontend
 * usage indicator (the "context bar") and the runtime's autocompact + provider-
 * switch decisions. Both used to size the window independently — the bar divided
 * by Houston's per-model default (snapping up to a ceiling once observed usage
 * proved a larger window), while the runtime divided by pi-ai's RAW registry
 * window — so they disagreed: the runtime never compacted a 200k-real Claude
 * chat pi reports as 1M, and needlessly compacted a Gemini chat pi under-reports.
 *
 * This module lives in `@houston/protocol` (an OPEN, dependency-free leaf that
 * already owns the catalog wire shapes) so the runtime (`@houston/runtime`) and
 * the app catalog (`app/src/lib/providers.ts`) both import the SAME numbers and
 * the SAME snap-up rule. Option A of the context-bar fix: one table, no drift,
 * no cross-package parity test needed (the runtime tests pin these values).
 *
 * Keys are pi-ai PROVIDER ids (the runtime speaks these verbatim; the app looks
 * up by the pre-rename `piProvider.id`, so `openai-codex` — not the app's
 * post-rename `openai` — is the key here).
 *
 * Only models whose real window differs from pi-ai's raw registry value appear.
 * Notably ABSENT: the `google` provider's Gemini models — pi-ai already reports
 * their true 1,048,576 window, so no override is needed (the stale 128,000 some
 * research cited is `github-copilot`'s Gemini copy, a legitimately smaller cap
 * we do not touch).
 */

/** A model's window sizing: the starting denominator and its snap-up ceiling. */
export interface ModelWindow {
  /** Starting denominator for the usage estimate. */
  default: number;
  /** Ceiling the estimate snaps up to once observed usage exceeds `default`. */
  max: number;
}

/** A curated override entry; `max` defaults to `default` (no upward gating). */
interface WindowOverride {
  default: number;
  max?: number;
}

/**
 * Per-model window overrides, keyed by pi-ai provider id then model id. Present
 * ONLY where Houston's real window differs from pi-ai's raw registry value:
 *
 * - `anthropic` — pi reports 1,000,000 for the flagships, but standard (Pro,
 *   non-credit) plans get 200k; the 1M window is credit/plan-gated, so the
 *   estimate starts at 200k and snaps to 1M once observed usage proves it.
 *   `claude-opus-5` follows the rest of the Opus line (same subscription
 *   gating). `claude-fable-5` and `claude-sonnet-5` are intentionally omitted
 *   (no evidence either is plan-gated — pi's flat 1M stands for both).
 * - `openai-codex` — Codex's `/status` reports a 95%-EFFECTIVE window (the number
 *   the user sees), and gpt-5.5/5.4 expose an opt-in 1M variant (× 95%).
 */
export const MODEL_WINDOW_OVERRIDES: Readonly<
  Record<string, Readonly<Record<string, WindowOverride>>>
> = {
  anthropic: {
    "claude-sonnet-4-6": { default: 200_000, max: 1_000_000 },
    "claude-opus-4-7": { default: 200_000, max: 1_000_000 },
    "claude-opus-4-8": { default: 200_000, max: 1_000_000 },
    "claude-opus-5": { default: 200_000, max: 1_000_000 },
  },
  "openai-codex": {
    "gpt-5.5": { default: 258_400, max: 950_000 },
    "gpt-5.4": { default: 258_400, max: 950_000 },
    "gpt-5.4-mini": { default: 258_400 },
    "gpt-5.3-codex-spark": { default: 121_600 },
  },
};

/**
 * The window sizing for a provider+model: the curated override when one exists,
 * else pi-ai's raw registry window as both default and ceiling (no snapping).
 * `piRawWindow` is what pi reports for THIS provider's copy of the model.
 */
export function resolveModelWindow(
  providerId: string,
  modelId: string,
  piRawWindow: number,
): ModelWindow {
  const override = MODEL_WINDOW_OVERRIDES[providerId]?.[modelId];
  const def = override?.default ?? piRawWindow;
  return { default: def, max: override?.max ?? def };
}

/**
 * The window to divide by (tokens), given observed usage. Self-correcting:
 * starts at the model's default and snaps UP to the ceiling once observed usage
 * exceeds the default, which proves the larger (plan/credit-gated) window is
 * active — the provider auto-compacts before its limit, so observed usage can
 * never exceed the true window. Floored at the observed count so a mis-catalogued
 * ceiling can never read as over 100%.
 *
 * This MUST match the frontend's `effectiveContextWindow` (app/src/lib/
 * context-usage.ts) exactly — that one takes a pre-resolved `{default,max}` and
 * applies the identical rule, so both surfaces agree on the denominator.
 */
export function effectiveModelWindow(
  providerId: string,
  modelId: string,
  piRawWindow: number,
  observedTokens: number,
): number {
  const { default: def, max } = resolveModelWindow(
    providerId,
    modelId,
    piRawWindow,
  );
  const estimate = observedTokens > def ? max : def;
  return Math.max(estimate, observedTokens);
}
