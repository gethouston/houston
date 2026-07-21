import type { CreatorLinks } from "@houston/agentstore-client";
import { cn } from "@houston-ai/core";
import {
  Github,
  Globe,
  Instagram,
  Linkedin,
  type LucideIcon,
  Music2,
  Twitter,
  Youtube,
} from "lucide-react";

/** The fixed, ordered set of social keys, each with its icon and accessible label. */
const LINKS: ReadonlyArray<{
  key: keyof CreatorLinks;
  icon: LucideIcon;
  label: string;
}> = [
  { key: "x", icon: Twitter, label: "X" },
  { key: "youtube", icon: Youtube, label: "YouTube" },
  { key: "tiktok", icon: Music2, label: "TikTok" },
  { key: "instagram", icon: Instagram, label: "Instagram" },
  { key: "github", icon: Github, label: "GitHub" },
  { key: "linkedin", icon: Linkedin, label: "LinkedIn" },
  { key: "website", icon: Globe, label: "Website" },
];

export interface SocialLinksProps {
  links: CreatorLinks;
  className?: string;
}

/**
 * The creator's social/web links as a row of icon buttons, in a fixed order.
 * Every link opens in a new tab with `rel="noopener"`; each has a visible focus
 * ring and an accessible name (no hover-only affordance). Renders nothing when
 * the creator has no links.
 */
export function SocialLinks({ links, className }: SocialLinksProps) {
  const present = LINKS.filter((entry) => links[entry.key]);
  if (present.length === 0) return null;
  return (
    <ul className={cn("flex flex-wrap items-center gap-2", className)}>
      {present.map(({ key, icon: Icon, label }) => (
        <li key={key}>
          <a
            href={links[key]}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={label}
            title={label}
            className="inline-flex size-9 items-center justify-center rounded-full border border-border bg-card text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
          >
            <Icon aria-hidden className="size-4" />
          </a>
        </li>
      ))}
    </ul>
  );
}
