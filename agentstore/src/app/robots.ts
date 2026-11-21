import type { MetadataRoute } from "next";
import { siteBase } from "@/lib/site-config";

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
