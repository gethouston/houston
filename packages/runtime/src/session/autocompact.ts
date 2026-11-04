/**
 * The context-full autocompact decision (pure — unit-tested without a live pi
 * session). Applied by exec-turn.ts before EVERY prompt: when the session's
 * context fill reaches the compaction point for the active model's window, the runtime
 * compacts (summarize + reseed) so long chats keep working. This is a
 * guarantee, not a user setting — the runtime owns it because it holds the
 * ground truth (live token fill + the active model's window), so every surface
 * (desktop, web, routines, cloud) inherits it identically.
 */

import { autocompactPoint } from "@houston/protocol/model-windows";

/*
 * The compaction point lives with the window table in `@houston/protocol`,
 * where the context bar reads it too. It is a tuning rule, not a user
 * setting; `HOUSTON_AUTOCOMPACT_THRESHOLD` replaces it with a plain
 * percent-full of the window (e.g. set it low to force compaction while
 * testing).
 */

export function resolveAutocompactOverride(
  raw: string | undefined = process.env.HOUSTON_AUTOCOMPACT_THRESHOLD,
): number | undefined {
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 && n <= 100 ? n : undefined;
}

/**
 * Whether this turn should compact before prompting. `tokens` is the session's
 * current context fill (null when the provider never reported usage — a fresh
 * conversation, or a provider without usage frames — which never compacts).
 */
export function needsAutocompact(
  tokens: number | null,
  contextWindow: number,
  overridePercent: number | undefined = resolveAutocompactOverride(),
): boolean {
  if (tokens == null || contextWindow <= 0) return false;
  const point =
    overridePercent === undefined
      ? autocompactPoint(contextWindow)
      : (contextWindow * overridePercent) / 100;
  return tokens >= point;
}
