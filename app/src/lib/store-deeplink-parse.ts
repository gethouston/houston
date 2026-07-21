/**
 * Shared boundary guard for `houston://store/<action>` deep links, used by the
 * install (`store-install-slug.ts`) and creator (`store-creator-handle.ts`)
 * parsers so both validate the scheme, host, and path the exact same way.
 *
 * Returns the named query param ONLY when the URL matches `houston://store/<action>`
 * precisely. Every look-alike returns `null`: a different scheme
 * (`https://…/store/install`), a different host (`houston://evil/install`), a
 * path that merely starts with the action (`houston://store/installEVIL`), an
 * unparseable URL, or a missing param. A crafted URL can therefore never smuggle
 * a different action past the branch it targets.
 *
 * Kept dependency-light (no package imports) so the parsers that build on it stay
 * loadable under `node --test` for the frontend deep-link suite.
 */
export function paramFromStoreDeepLink(
  url: string,
  action: string,
  param: string,
): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== "houston:" || parsed.host !== "store") return null;
  const path = parsed.pathname.replace(/\/$/, "");
  if (path !== `/${action}`) return null;
  return parsed.searchParams.get(param);
}
