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

export function conversationCacheScope(
  baseUrl: string,
  token: string,
): string | null {
  const sub = jwtSub(token);
  return sub ? `${baseUrl}|${sub}` : null;
}
