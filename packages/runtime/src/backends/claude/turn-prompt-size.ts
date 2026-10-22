import { estimateTokens } from "../../session/token-estimate";

/**
 * How far a Claude turn's context may grow while it runs: tool results and
 * the model's own replies. The CLI takes one first-byte deadline for every
 * request of the turn, so it is sized for the turn's last request. Added
 * whatever the resumed size, it sets a 20 s floor on every Claude turn: a
 * resumed session whose size is unknown still gets room to be read.
 */
export const TURN_GROWTH_TOKENS = 100_000;

/**
 * The largest prompt a Claude turn sends: the history it resumes (none for a
 * fresh session, counted as 0 when unmeasured), its own prompt, and the
 * turn's growth.
 */
export function claudeTurnPromptTokens(
  resumedFill: number | undefined,
  prompt: string,
): number {
  return (resumedFill ?? 0) + estimateTokens(prompt) + TURN_GROWTH_TOKENS;
}
