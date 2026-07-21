import { SLUG_REGEX } from "@houston/agentstore-contract/ir";
import { paramFromStoreDeepLink } from "./store-deeplink-parse.ts";

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
 * (`a&b=c`), uppercase, and empty all fail the regex and return `null`. The
 * `houston://store/install` boundary guard (which rejects look-alikes such as
 * `houston://store/installEVIL`) lives in the shared `paramFromStoreDeepLink`.
 *
 * Imported from the `/ir` subpath (not the package barrel) so this stays a pure,
 * dependency-light module the frontend test can load under `node --test`.
 */
export function parseStoreInstallSlug(input: string): string | null {
  const candidate = input.startsWith("houston://")
    ? paramFromStoreDeepLink(input, "install", "slug")
    : input;
  if (candidate === null) return null;
  return SLUG_REGEX.test(candidate) ? candidate : null;
}
