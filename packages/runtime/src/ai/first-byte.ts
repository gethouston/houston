import { OPENAI_COMPATIBLE } from "./openai-compatible-model";

/**
 * How long a model request may wait for its response to open before the
 * runtime sends it again (ai/hedged-runtime.ts), and when the turn finally
 * gives up (session/stall-watchdog.ts, `unanswered`).
 *
 * The first byte is pi's `start` event: the response headers, or the first
 * WebSocket event. Every hosted API sends it before any thinking, so a model
 * that thinks silently has already answered by this measure. Measured on
 * 2026-10-03:
 * - Codex (gpt-5.6-luna, gpt-5.6-sol, gpt-6-astra, gpt-6-luna), 44 requests
 *   through this runtime's own model runtime, small and 20k-token prompts:
 *   p50 0.94 s, p90 1.1 s, max 4.6 s.
 * - Claude (the Claude Code backend), 297 staging turns: the first model
 *   event, which comes after the first byte, p50 1.1 s, p99 5.0 s, max 9.7 s.
 * - The staging load test's stalled provider: 47 requests got no response
 *   at all for 300 s, while pi's retry of each answered in about 40 s.
 *
 * The deadline (`config.turnFirstByteDeadlineMs`, 15 s) is 3x the p99 of
 * both. A custom endpoint is the user's own server (Ollama, LM Studio,
 * vLLM), where loading a model on a laptop can take minutes before the first
 * byte: it is never hedged and never cut.
 */

/** Requests sent beyond the first, at most, before the turn gives up. */
export const FIRST_BYTE_EXTRA_ATTEMPTS = 2;

/** The hedge deadline for a request to `provider`; 0 = never hedged. */
export function firstByteDeadlineMs(
  provider: string,
  configuredMs: number,
): number {
  if (provider === OPENAI_COMPATIBLE) return 0;
  return Number.isFinite(configuredMs) && configuredMs > 0 ? configuredMs : 0;
}

/**
 * How long a request may go unanswered before the turn ends with the
 * provider_internal card: every attempt has had its full deadline. 0 = never.
 */
export function unansweredWindowMs(
  provider: string,
  configuredMs: number,
): number {
  const deadline = firstByteDeadlineMs(provider, configuredMs);
  if (deadline === 0) return 0;
  // A third of a deadline more (5 s at 15 s) leaves request setup room, so
  // the last attempt still gets its full deadline.
  return Math.round(deadline * (FIRST_BYTE_EXTRA_ATTEMPTS + 1 + 1 / 3));
}
