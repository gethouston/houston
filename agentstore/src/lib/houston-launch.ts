/**
 * Pure URL builders for launching an Agent Store agent into Houston.
 *
 * The website never installs an agent itself. The desktop deep link only seeds
 * Houston's import wizard (threat scan + name + pickers all stay in the app),
 * and the web fallback seeds the same import in Houston Web. Both builders
 * validate the slug against the shared contract SLUG_REGEX, so a malformed slug
 * can never be forged into a launch URL.
 */

import { SLUG_REGEX } from "@houston/agentstore-contract";

/** Houston Web app, where visitors without the desktop app can install. */
const DEFAULT_WEB_APP_URL = "https://app.gethouston.ai";

/** True when `slug` is a well-formed Agent Store slug. */
export function isValidSlug(slug: string): boolean {
  return SLUG_REGEX.test(slug);
}

/**
 * Desktop deep link that seeds Houston's import wizard for `slug`, or `null`
 * when the slug is malformed (never emit a launch URL for an invalid slug).
 */
export function buildStoreInstallDeepLink(slug: string): string | null {
  return isValidSlug(slug) ? `houston://store/install?slug=${slug}` : null;
}

/**
 * Houston Web URL that seeds the same import for a visitor without the desktop
 * app, or `null` when the slug is malformed. The base is overridable via
 * `NEXT_PUBLIC_WEB_APP_URL` for preview deploys.
 */
export function buildWebAppInstallUrl(slug: string): string | null {
  if (!isValidSlug(slug)) return null;
  const base = process.env.NEXT_PUBLIC_WEB_APP_URL ?? DEFAULT_WEB_APP_URL;
  return `${base}/?install=${encodeURIComponent(slug)}`;
}
