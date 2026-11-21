const REPLAY_FIT_FRACTION = 0.8;

export function switchNeedsCompaction(
  preTokens: number | null,
  targetWindow: number,
): boolean {
  return preTokens != null && preTokens > targetWindow * REPLAY_FIT_FRACTION;
}
