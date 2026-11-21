function normalizeOrigin(value) {
  return value.replace(/\/+$/, "");
}

export const SITE_ORIGIN = normalizeOrigin(
  process.env.SITE_ORIGIN || "https://gethouston.ai",
);

export const GATEWAY_URL = normalizeOrigin(
  process.env.CERTS_GATEWAY_URL || "https://gateway.gethouston.ai",
);

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
