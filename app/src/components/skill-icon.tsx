import { useEffect, useState } from "react";
import { fluentEmojiUrl, resolveSkillImageUrl } from "../lib/skill-image";

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
  bubbleClassName = "size-12 rounded-full bg-line-input flex items-center justify-center shrink-0 overflow-hidden",
}: Props) {
  const [broken, setBroken] = useState(false);
  // biome-ignore lint/correctness/useExhaustiveDependencies: image is a prop and is a valid dependency; the effect must reset `broken` whenever the image source changes
  useEffect(() => setBroken(false), [image]);

  const fallback = fluentEmojiUrl(FALLBACK_SLUG);
  const url =
    broken || !image ? fallback : (resolveSkillImageUrl(image) ?? fallback);

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
