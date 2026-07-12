/**
 * The single source of truth for the Agent Store's brand identity. Every place
 * that renders the product name, canonical URL, or description reads from here.
 *
 * Do NOT hardcode "Houston Agent Store" elsewhere — import from "@/lib/site-config".
 */

export const siteConfig = {
  /** Display brand name. */
  name: "Houston Agent Store",
  /** Canonical site URL (used in OG tags, share links, schema URLs).
   *  Use `||` (not `??`) and trim: an EMPTY env value must still fall back to a
   *  valid absolute URL, or `new URL(siteConfig.url)` in metadataBase throws. */
  url:
    process.env.NEXT_PUBLIC_SITE_URL?.trim() || "https://store.gethouston.ai",
  description:
    "Discover, publish, and one-click install AI agents for Houston. No code, no terminal.",
} as const;

export type SiteConfig = typeof siteConfig;

/** `siteConfig.url` with any trailing slashes trimmed, for `new URL(...)` bases. */
export function siteBase(): string {
  return siteConfig.url.replace(/\/+$/, "");
}

/** The public share URL for a published agent slug. */
export function shareUrlForSlug(slug: string): string {
  return `${siteBase()}/a/${encodeURIComponent(slug)}`;
}
