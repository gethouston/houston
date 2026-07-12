import type { MetadataRoute } from "next";
import { siteBase } from "@/lib/site-config";

/**
 * Crawling policy: the catalog is fully public, but the claim flow (code in the
 * URL fragment), the owner dashboard, the API surface, and admin tooling must
 * never be indexed.
 */
export default function robots(): MetadataRoute.Robots {
  const base = siteBase();
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/claim", "/me", "/api/", "/admin"],
    },
    sitemap: `${base}/sitemap.xml`,
    host: base,
  };
}
