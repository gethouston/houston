import { SLUG_REGEX } from "@houston/agentstore-contract/ir";

/**
 * Parse and validate a store-install target into a canonical agent slug, or
 * `null` when the input is not a safe install request.
 *
 * Two accepted shapes, one validator:
 *  - The desktop deep link `houston://store/install?slug=<slug>` (the raw URL
 *    the Rust shell stashes + emits on `store://deep-link`, and the cold-start
 *    `take_pending_store_deep_link` drain returns).
 *  - A bare slug (the web `?install=<slug>` query param, already decoded by
 *    `URLSearchParams`).
 *
 * The slug is ALWAYS validated against the canonical `SLUG_REGEX` from
 * `@houston/agentstore-contract` — the same regex the website validates with,
 * so both sides agree byte-for-byte and nothing but `^[a-z0-9][a-z0-9-]{0,63}$`
 * ever reaches the seed flow. Path traversal (`../evil`), injected query
 * (`a&b=c`), uppercase, and empty all fail the regex and return `null`.
 *
 * Imported from the `/ir` subpath (not the package barrel) so this stays a pure,
 * dependency-light module the frontend test can load under `node --test`.
 */
export function parseStoreInstallSlug(input: string): string | null {
  const candidate = input.startsWith("houston://")
    ? slugFromDeepLink(input)
    : input;
  if (candidate === null) return null;
  return SLUG_REGEX.test(candidate) ? candidate : null;
}

/**
 * Pull the `slug` query param out of a `houston://store/install` deep link.
 * Guards against look-alikes (`houston://store/installEVIL`, other hosts/paths,
 * other schemes) by matching the exact protocol + host + `/install` path, so a
 * crafted URL can never smuggle a different action past the install branch.
 */
function slugFromDeepLink(url: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== "houston:" || parsed.host !== "store") return null;
  const path = parsed.pathname.replace(/\/$/, "");
  if (path !== "/install") return null;
  return parsed.searchParams.get("slug");
}
