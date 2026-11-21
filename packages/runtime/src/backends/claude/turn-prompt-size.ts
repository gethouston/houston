import { estimateTokens } from "../../session/token-estimate";

export const TURN_GROWTH_TOKENS = 100_000;

export function claudeTurnPromptTokens(
  resumedFill: number | undefined,
  prompt: string,
): number {
  return (resumedFill ?? 0) + estimateTokens(prompt) + TURN_GROWTH_TOKENS;
}
