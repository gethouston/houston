import { cn } from "@houston-ai/core";
import type { CSSProperties } from "react";

/** The `org` token family's tones, each a gradient to its `-deep` stop. */
const ORG_TONES = [
  "teal",
  "purple",
  "orange",
  "navy",
  "rose",
  "forest",
  "crimson",
] as const;

export type OrgTone = (typeof ORG_TONES)[number];

/** FNV-1a over the slug, so an org wears one tone on every screen. */
export function orgTone(slug: string): OrgTone {
  let hash = 0x811c9dc5;
  for (let i = 0; i < slug.length; i++) {
    hash ^= slug.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return ORG_TONES[hash % ORG_TONES.length];
}

/** Split by code point, so an emoji is never cut in half. */
function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const letters =
    words.length > 1
      ? `${Array.from(words[0])[0]}${Array.from(words[1])[0]}`
      : Array.from(name.trim()).slice(0, 2).join("");
  return letters.toUpperCase() || "?";
}

const SIZE = {
  md: "size-10 rounded-xl text-[13px]",
  sm: "size-8 rounded-lg text-[11px]",
} as const;

export function OrgAvatar({
  slug,
  name,
  size = "md",
  className,
}: {
  slug: string;
  name: string;
  size?: keyof typeof SIZE;
  className?: string;
}) {
  const tone = orgTone(slug);
  return (
    <span
      aria-hidden
      data-tone={tone}
      style={
        {
          "--org-tone": `var(--ht-org-${tone})`,
          "--org-tone-deep": `var(--ht-org-${tone}-deep)`,
        } as CSSProperties
      }
      className={cn(
        "plan-briefing-avatar grid shrink-0 place-items-center font-semibold",
        SIZE[size],
        className,
      )}
    >
      {initials(name)}
    </span>
  );
}
