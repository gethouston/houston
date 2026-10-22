import { estimateTokens } from "../../session/token-estimate";

/**
 * How far a Claude turn's context may grow while it runs: tool results and
 * the model's own replies. The CLI takes one first-byte deadline for every
 * request of the turn, so it is sized for the turn's last request.
 */
export const TURN_GROWTH_TOKENS = 100_000;

/**
 * The largest prompt a Claude turn sends: the history it resumes (none for a
 * fresh session, 0 when unmeasured), its own prompt, and the turn's growth.
 */
export function claudeTurnPromptTokens(
  resumedFill: number | undefined,
  prompt: string,
): number {
  return (resumedFill ?? 0) + estimateTokens(prompt) + TURN_GROWTH_TOKENS;
}
