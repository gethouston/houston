/**
 * The mid-session provider-switch compaction decision (pure — the threshold is
 * unit-tested without a live pi session). Applied by exec-turn.ts when a turn
 * crosses a provider boundary.
 */

/**
 * Headroom kept free when deciding whether the prior conversation can be carried
 * VERBATIM into the new provider on a mid-session switch. If the leaving
 * provider's last context fill is under this fraction of the new model's window,
 * replay it as-is; at/above, compact it to fit first. Mirrors the frontend's
 * REPLAY_FIT_FRACTION in `app/src/lib/provider-switch.ts`.
 */
const REPLAY_FIT_FRACTION = 0.8;

/**
 * Whether a mid-session PROVIDER switch must compact prior context to fit the
 * new model's window before continuing. `preTokens` is the leaving provider's
 * last context fill; `null` (never reported) is treated as "no proof it won't
 * fit", so we replay rather than spend a summarizer call. At/under the fit
 * fraction -> replay; over it -> compact.
 */
export function switchNeedsCompaction(
  preTokens: number | null,
  targetWindow: number,
): boolean {
  return preTokens != null && preTokens > targetWindow * REPLAY_FIT_FRACTION;
}
