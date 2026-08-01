import { cn } from "@houston-ai/core";

/** The social/link keys a creator profile may carry. */
export type CreatorLinkKey =
  | "x"
  | "youtube"
  | "tiktok"
  | "instagram"
  | "github"
  | "linkedin"
  | "website";

export type CreatorLinkMap = Partial<Record<CreatorLinkKey, string>>;

/** The fixed, ordered set of social keys with their brand domain + label. */
const LINKS: ReadonlyArray<{
  key: CreatorLinkKey;
  domain: string;
  label: string;
}> = [
  { key: "x", domain: "x.com", label: "X" },
  { key: "youtube", domain: "youtube.com", label: "YouTube" },
  { key: "tiktok", domain: "tiktok.com", label: "TikTok" },
  { key: "instagram", domain: "instagram.com", label: "Instagram" },
  { key: "github", domain: "github.com", label: "GitHub" },
  { key: "linkedin", domain: "linkedin.com", label: "LinkedIn" },
  { key: "website", domain: "", label: "Website" },
];

/** Favicon URL for a link: the brand's domain, or the site's own host for the
 *  personal website entry — the same recipe as the integration logos. */
function logoUrl(domain: string, href: string): string {
  let resolved = domain;
  if (!resolved) {
    try {
      resolved = new URL(href).hostname;
    } catch {
      resolved = "";
    }
  }
  return `https://www.google.com/s2/favicons?domain=${resolved}&sz=64`;
}

export interface SocialLinksProps {
  links: CreatorLinkMap;
  className?: string;
}

/**
 * A creator's social/web links as a row of real brand logos (favicon service,
 * matching the integration logos), in a fixed order. Every link opens in a new
 * tab with `rel="noopener"`; each has a visible focus ring and an accessible
 * name. Renders nothing when the creator has no links.
 */
export function SocialLinks({ links, className }: SocialLinksProps) {
  const present = LINKS.filter((entry) => links[entry.key]);
  if (present.length === 0) return null;
  return (
    <ul className={cn("flex flex-wrap items-center gap-1", className)}>
      {present.map(({ key, domain, label }) => {
        const href = links[key];
        if (!href) return null;
        return (
          <li key={key}>
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={label}
              title={label}
              className="inline-flex size-9 items-center justify-center rounded-full transition-colors duration-150 hover:bg-chip focus-visible:ring-2 focus-visible:ring-focus/50 focus-visible:outline-none"
            >
              <img src={logoUrl(domain, href)} alt="" className="size-4" />
            </a>
          </li>
        );
      })}
    </ul>
  );
}
