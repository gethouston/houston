// Single source of truth for the bootcamp-certificates build-time config.
//
// Everything is resolved from the environment ONCE, at module load: the
// Eleventy global data file (`src/_data/certificates.js`) and the
// `eleventy.after` image-render hook run in the same process and share this
// module instance.
//
// The export token is the switch (no `CERTS_ENABLED` boolean): token present =
// certificates are built, token absent = the build renders an empty catalogue
// and says so on stdout. A missing token must never fail the site build.

/** Drop trailing slashes so we can concatenate paths without doubling them. */
function normalizeOrigin(value) {
  return value.replace(/\/+$/, "");
}

/** Public origin the certificate share links point at. */
export const SITE_ORIGIN = normalizeOrigin(
  process.env.SITE_ORIGIN || "https://gethouston.ai",
);

/** Houston Cloud gateway that serves the certificates export + runtime APIs. */
export const GATEWAY_URL = normalizeOrigin(
  process.env.CERTS_GATEWAY_URL || "https://gateway.gethouston.ai",
);

/** Bearer token for GET /v1/certs/export. Empty string = not configured. */
export const EXPORT_TOKEN = process.env.CERTS_EXPORT_TOKEN || "";

/**
 * Canonical public URL of one attendee's certificate share page.
 *
 * The page is emitted as `_site/c/<CODE>.html` (a flat file, NOT the usual
 * `<CODE>/index.html` directory form) because Firebase Hosting `cleanUrls` and
 * Cloudflare both serve `/c/<CODE>.html` at `/c/<CODE>` with zero redirects —
 * a bare, shareable URL that resolves in one hop.
 *
 * @param {string} code Certificate code, e.g. `HOU-4KQ2M-7PXVR`.
 * @returns {string} Absolute URL, e.g. `https://gethouston.ai/c/HOU-4KQ2M-7PXVR`.
 */
export function certPageUrl(code) {
  return `${SITE_ORIGIN}/c/${code}`;
}
