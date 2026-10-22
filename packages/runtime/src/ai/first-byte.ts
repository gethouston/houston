import { OPENAI_COMPATIBLE } from "./openai-compatible-model";

/**
 * How long a model request may wait for its response to open before the
 * runtime sends it again (ai/hedged-runtime.ts, and the Claude Code CLI's own
 * request timeout, backends/claude/claude-env.ts), and when the turn finally
 * gives up (session/stall-watchdog.ts, `unanswered`).
 *
 * The first byte is pi's `start` event: the response headers, or the first
 * WebSocket event. Hosted APIs send it before any thinking, so a model that
 * thinks silently has already answered by this measure. They send it only
 * after reading the prompt, though, so the wait grows with the prompt.
 * Measured:
 * - Codex (gpt-5.6-luna, gpt-5.6-sol, gpt-6-astra, gpt-6-luna), 44 requests
 *   through this runtime's own model runtime, small and 20k-token prompts,
 *   2026-10-03: p50 0.94 s, p90 1.1 s, max 4.6 s.
 * - Claude (the Claude Code backend), 297 staging turns, 2026-10-03: the
 *   first model event, which comes after the first byte, p50 1.1 s, p99
 *   5.0 s, max 9.7 s.
 * - Claude, one production session's requests by prompt size (request to
 *   first content block, an upper bound on the first byte), 2026-10-22:
 *   under 400k tokens p90 5.2 s or less; 400k-600k p90 11.0 s, max 13.7 s;
 *   over 600k p90 15.9 s, max 26.6 s (an 800k prompt with a cold cache).
 * - The staging load test's stalled provider: 47 requests got no response
 *   at all for 300 s, while pi's retry of each answered in about 40 s.
 *
 * The deadline is `config.turnFirstByteDeadlineMs` (15 s, 3x the small
 * prompts' p99) plus 50 ms per thousand prompt tokens: 35 s at 400k, 55 s at
 * 800k (about twice the slowest first byte seen there), 65 s at 1M, still far
 * short of the stalled provider's 300 s. The Claude Code CLI takes one
 * deadline for a whole turn, sized with 100k tokens of growth on top
 * (backends/claude/turn-prompt-size.ts): a Claude turn waits at least 20 s,
 * its size known or not. A custom endpoint is the user's own
 * server (Ollama, LM Studio, vLLM), where loading a model on a laptop can
 * take minutes before the first byte: it is never hedged and never cut.
 */

/** Requests sent beyond the first, at most, before the turn gives up. */
export const FIRST_BYTE_EXTRA_ATTEMPTS = 2;

const MS_PER_PROMPT_TOKEN = 50 / 1000;

/**
 * The hedge deadline for a request to `provider` carrying `promptTokens`
 * (undefined counts as 0 tokens). 0 = never hedged.
 */
export function firstByteDeadlineMs(
  provider: string,
  configuredMs: number,
  promptTokens?: number,
): number {
  if (provider === OPENAI_COMPATIBLE) return 0;
  if (!(Number.isFinite(configuredMs) && configuredMs > 0)) return 0;
  const tokens =
    promptTokens !== undefined && Number.isFinite(promptTokens)
      ? Math.max(0, promptTokens)
      : 0;
  return configuredMs + Math.round(tokens * MS_PER_PROMPT_TOKEN);
}

/**
 * How long a request may go unanswered before the turn ends with the
 * provider_internal card: every attempt has had its full deadline. 0 = never.
 */
export function unansweredWindowMs(
  provider: string,
  configuredMs: number,
  promptTokens?: number,
): number {
  const deadline = firstByteDeadlineMs(provider, configuredMs, promptTokens);
  if (deadline === 0) return 0;
  // A third of a deadline more (5 s at 15 s) leaves request setup room, so
  // the last attempt still gets its full deadline.
  return Math.round(deadline * (FIRST_BYTE_EXTRA_ATTEMPTS + 1 + 1 / 3));
}

/**
 * `unansweredWindowMs` at one configured deadline, in the shape the stall
 * watchdog asks for a request's window (session/stall-watchdog.ts).
 */
export function unansweredWindows(
  configuredMs: number,
): (provider: string, promptTokens?: number) => number {
  return (provider, promptTokens) =>
    unansweredWindowMs(provider, configuredMs, promptTokens);
}
