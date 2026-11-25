// WHY: Must match REPLAY_FIT_FRACTION in app/src/lib/provider-switch.ts. ADR-0012
const REPLAY_FIT_FRACTION = 0.8;

export function switchNeedsCompaction(
  preTokens: number | null,
  targetWindow: number,
): boolean {
  return preTokens != null && preTokens > targetWindow * REPLAY_FIT_FRACTION;
}
