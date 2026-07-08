/**
 * Cache-scope identity for the local conversation cache (HOU-712): entries
 * are keyed per gateway + signed-in user so cached transcripts never leak
 * across accounts on a shared machine.
 */

/**
 * The `sub` claim of a Supabase access token, or null when the token isn't a
 * readable JWT.
 */
export function jwtSub(token: string): string | null {
  try {
    const payload = token.split(".")[1];
    if (!payload) return null;
    const b64 = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
    const { sub } = JSON.parse(atob(padded)) as { sub?: unknown };
    return typeof sub === "string" && sub ? sub : null;
  } catch {
    return null;
  }
}

/**
 * The cache scope for a gateway + bearer, or null when the bearer carries no
 * user (static tokens, tests) — null disables caching rather than risking a
 * cross-account key.
 */
export function conversationCacheScope(
  baseUrl: string,
  token: string,
): string | null {
  const sub = jwtSub(token);
  return sub ? `${baseUrl}|${sub}` : null;
}
