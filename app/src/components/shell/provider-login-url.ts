/**
 * Pure helpers for the provider OAuth login dialog.
 *
 * The fallback OAuth URL the CLI prints is long, query-laden, and
 * meaningless to a non-technical user — dumping it raw made the dialog
 * tall and ugly (issue #297). We hide the URL behind a reveal toggle and
 * instead show a friendly destination hint built from its hostname. Both
 * the hostname parse and the toggle live here as pure functions so the
 * dialog stays a thin render layer and the host parse is unit-testable.
 */

/**
 * Friendly host for the "you'll be taken to …" hint. Returns the bare
 * hostname (no scheme, no `www.`, no port/path/query) or `null` when the
 * string isn't a parseable absolute URL — the caller then omits the hint
 * rather than showing a broken one.
 */
export function providerLoginUrlHost(url: string): string | null {
  const trimmed = url.trim();
  if (!trimmed) return null;
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return null;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return null;
  }
  return parsed.hostname.replace(/^www\./, "");
}
