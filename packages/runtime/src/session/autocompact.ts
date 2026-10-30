/**
 * The context-full autocompact decision (pure — unit-tested without a live pi
 * session). Applied by exec-turn.ts before EVERY prompt: when the session's
 * context fill reaches the ceiling for the active model's window, the runtime
 * compacts (summarize + reseed) so long chats keep working. This is a
 * guarantee, not a user setting — the runtime owns it because it holds the
 * ground truth (live token fill + the active model's window), so every surface
 * (desktop, web, routines, cloud) inherits it identically.
 */

/**
 * Percent-full at which a turn proactively compacts. A tuning constant, not a
 * user setting; `HOUSTON_AUTOCOMPACT_THRESHOLD` overrides it (e.g. set it low
 * to force compaction while testing).
 */
const DEFAULT_THRESHOLD_PERCENT = 93;

/**
 * The fill no conversation grows past, whatever its window. Every request
 * re-sends the whole context, so a 1M-window chat left to fill to 93% paid
 * ~900k input tokens per call for days: most of a subscription's limit went
 * to re-reading history the model rarely needed.
 */
const AUTOCOMPACT_CEILING_TOKENS = 200_000;

export function resolveAutocompactThreshold(
  raw: string | undefined = process.env.HOUSTON_AUTOCOMPACT_THRESHOLD,
): number {
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 && n <= 100
    ? n
    : DEFAULT_THRESHOLD_PERCENT;
}

/**
 * Whether this turn should compact before prompting. `tokens` is the session's
 * current context fill (null when the provider never reported usage — a fresh
 * conversation, or a provider without usage frames — which never compacts).
 */
export function needsAutocompact(
  tokens: number | null,
  contextWindow: number,
  thresholdPercent: number = resolveAutocompactThreshold(),
): boolean {
  if (tokens == null || contextWindow <= 0) return false;
  return (
    tokens >=
    Math.min(
      (contextWindow * thresholdPercent) / 100,
      AUTOCOMPACT_CEILING_TOKENS,
    )
  );
}
