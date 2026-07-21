import type { CreatorLinks } from "@houston-ai/engine-client";
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
import { useTranslation } from "react-i18next";

/** The link slots, in display order, each mapped to its glyph and i18n label key. */
const SOCIALS: { key: keyof CreatorLinks; icon: LucideIcon }[] = [
  { key: "x", icon: Twitter },
  { key: "youtube", icon: Youtube },
  { key: "tiktok", icon: Music2 },
  { key: "instagram", icon: Instagram },
  { key: "github", icon: Github },
  { key: "linkedin", icon: Linkedin },
  { key: "website", icon: Globe },
];

/**
 * A creator's social/web links as a row of icon buttons. Each present link opens
 * in a new tab; absent links render nothing. Renders null when there are no
 * links, so the header collapses cleanly.
 */
export function CreatorSocials({ links }: { links: CreatorLinks }) {
  const { t } = useTranslation("store");
  const present = SOCIALS.filter(({ key }) => Boolean(links[key]));
  if (present.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-1">
      {present.map(({ key, icon: Icon }) => {
        const label = t(`profile.socials.${key}`);
        return (
          <a
            key={key}
            href={links[key]}
            target="_blank"
            rel="noopener noreferrer nofollow"
            aria-label={label}
            title={label}
            className="flex size-8 items-center justify-center rounded-full text-ink-muted transition-colors hover:bg-hover hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/40"
          >
            <Icon className="size-4" aria-hidden />
          </a>
        );
      })}
    </div>
  );
}
