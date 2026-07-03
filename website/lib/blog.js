// Pure helpers for the blog section. Kept dependency-free so they can be
// unit-tested with `node --test` and reused by the Eleventy config filters.

/**
 * Estimated reading time in whole minutes for a piece of content.
 * Strips HTML tags first so rendered post content can be passed directly.
 * Uses the common 220 words-per-minute baseline and never returns 0.
 */
export function readingTimeMinutes(content) {
  if (!content) return 1;
  const text = String(content)
    .replace(/<[^>]*>/g, " ")
    .trim();
  if (!text) return 1;
  const words = text.split(/\s+/).length;
  return Math.max(1, Math.round(words / 220));
}

/**
 * Human-readable date, e.g. "July 2, 2026". Always formats in UTC so the
 * build output does not depend on the build machine's timezone (Eleventy
 * parses front-matter dates as UTC midnight).
 */
export function readableDate(date) {
  const d = toValidDate(date);
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}

/**
 * ISO 8601 date-time string, e.g. "2026-07-02T00:00:00.000Z".
 * Used by JSON-LD, the Atom feed, and the sitemap.
 */
export function isoDate(date) {
  return toValidDate(date).toISOString();
}

/** ISO calendar date only, e.g. "2026-07-02". Used by sitemap lastmod. */
export function isoDateOnly(date) {
  return isoDate(date).slice(0, 10);
}

function toValidDate(date) {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) {
    // Fail loudly at build time rather than emitting "Invalid Date" into
    // meta tags, feeds, or the sitemap.
    throw new Error(`blog helpers received an invalid date: ${date}`);
  }
  return d;
}
