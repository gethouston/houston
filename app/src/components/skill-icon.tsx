import { useEffect, useState } from "react";

interface Props {
  /** Image URL or Microsoft Fluent 3D Emoji slug. Bare slugs auto-resolve to the jsDelivr CDN. */
  image?: string | null;
  /** Outer bubble class. Default: 48px round, muted-gray background. */
  bubbleClassName?: string;
}

const FALLBACK_SLUG = "sparkles";

/**
 * Circular avatar bubble for skill cards. Renders the image desaturated
 * (grayscale) so cards stay sober against the secondary background.
 *
 * Accepts either a full URL or a Microsoft Fluent 3D Emoji slug
 * (e.g. `rocket`, `magnifying-glass-tilted-left`). Falls back to the
 * `sparkles` slug if the value is missing or fails to load.
 *
 * Browse Fluent slugs: https://github.com/microsoft/fluentui-emoji/tree/main/assets
 * (folder name lowercased, spaces -> dashes).
 */
export function SkillIcon({
  image,
  bubbleClassName = "size-12 rounded-full bg-input flex items-center justify-center shrink-0 overflow-hidden",
}: Props) {
  const [broken, setBroken] = useState(false);
  // biome-ignore lint/correctness/useExhaustiveDependencies: image is a prop and is a valid dependency; the effect must reset `broken` whenever the image source changes
  useEffect(() => setBroken(false), [image]);

  const url = broken ? fluentEmojiUrl(FALLBACK_SLUG) : resolveImageValue(image);

  return (
    <span className={bubbleClassName}>
      <img
        src={url}
        alt=""
        loading="lazy"
        onError={() => setBroken(true)}
        className="w-full h-full object-contain p-2 grayscale"
      />
    </span>
  );
}

function resolveImageValue(value: string | null | undefined): string {
  const trimmed = value?.trim();
  if (!trimmed) return fluentEmojiUrl(FALLBACK_SLUG);
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return fluentEmojiUrl(trimmed);
}

function fluentEmojiUrl(slug: string): string {
  const parts = slug
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((p) => p.toLowerCase());
  const folder =
    parts[0].charAt(0).toUpperCase() +
    parts[0].slice(1) +
    (parts.length > 1 ? ` ${parts.slice(1).join(" ")}` : "");
  const file = `${parts.join("_")}_3d.png`;
  return `https://cdn.jsdelivr.net/gh/microsoft/fluentui-emoji@main/assets/${encodeURIComponent(folder)}/3D/${file}`;
}
