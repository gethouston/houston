/**
 * Normalize a pasted sign-in value into a callback URL that
 * `completeAuthCallback` (in `auth.ts`) can parse. Used by the dev-only manual
 * sign-in fallback: the `houston://auth-callback` deep link opens the installed
 * production app, so a dev build never receives the callback and the user pastes
 * it by hand instead.
 *
 * Accepts:
 *   - the full callback URL the browser landed on (`https://…/auth/callback?code=…`
 *     or a `houston://…` deep link) — returned unchanged;
 *   - a `code=…[&…]` query fragment the user copied — the `code` is extracted;
 *   - a bare PKCE `code`.
 *
 * Returns null when there is nothing usable (empty input, or a query fragment
 * with no `code`).
 */
export function toCallbackUrl(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  // A full callback URL (any scheme) — hand it through verbatim.
  if (/^[a-z][\w+.-]*:\/\//i.test(trimmed)) return trimmed;

  // Otherwise a bare code, or a `code=…` query fragment that was copied.
  const code = trimmed.includes("=")
    ? (new URLSearchParams(trimmed).get("code") ?? "")
    : trimmed;
  if (!code) return null;

  return `houston://auth-callback?code=${encodeURIComponent(code)}`;
}
