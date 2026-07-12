import type { MetadataRoute } from "next";
import { siteBase } from "@/lib/site-config";
import { listAllPublicSlugs } from "@/lib/store-api";

// Rendered dynamically so `next build` never calls the gateway; the underlying
// catalog fetches carry their own 60s revalidate for runtime caching.
export const dynamic = "force-dynamic";

/**
 * The public sitemap: the two static routes plus every public agent page,
 * enumerated by walking the gateway catalog. A gateway failure surfaces as a real
 * error rather than a silently truncated sitemap.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = siteBase();
  const now = new Date();
  const staticEntries: MetadataRoute.Sitemap = [
    {
      url: `${base}/`,
      lastModified: now,
      changeFrequency: "daily",
      priority: 1,
    },
    {
      url: `${base}/explore`,
      lastModified: now,
      changeFrequency: "daily",
      priority: 0.9,
    },
  ];

  const slugs = await listAllPublicSlugs();
  const agentEntries: MetadataRoute.Sitemap = slugs.map((slug) => ({
    url: `${base}/a/${encodeURIComponent(slug)}`,
    lastModified: now,
    changeFrequency: "weekly",
    priority: 0.7,
  }));
  return [...staticEntries, ...agentEntries];
}
