/**
 * Whether a session-identity transition must drop the outgoing identity's
 * in-memory world (HOU-903). Compares Firebase UIDs, never tokens.
 *
 * True only when a real, non-null identity is being replaced — by another
 * account, or by sign-out. False for:
 *  - the first sign-in / boot restore (`null → user`): nothing is cached yet;
 *  - a token refresh of the SAME user (`user → same user`): uid unchanged.
 */
export function identityChanged(
  prevUserId: string | null,
  nextUserId: string | null,
): boolean {
  return prevUserId !== null && prevUserId !== nextUserId;
}
