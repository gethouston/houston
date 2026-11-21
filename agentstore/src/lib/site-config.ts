export const siteConfig = {
  name: "Houston Agent Store",
  url:
    process.env.NEXT_PUBLIC_SITE_URL?.trim() || "https://agents.gethouston.ai",
  description:
    "Discover, publish, and one-click install AI agents for Houston. No code, no terminal.",
} as const;

export type SiteConfig = typeof siteConfig;

export function siteBase(): string {
  return siteConfig.url.replace(/\/+$/, "");
}

export function shareUrlForSlug(slug: string): string {
  return `${siteBase()}/a/${encodeURIComponent(slug)}`;
}
