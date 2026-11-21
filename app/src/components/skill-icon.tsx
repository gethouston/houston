import { useEffect, useState } from "react";
import { fluentEmojiUrl, resolveSkillImageUrl } from "../lib/skill-image";

interface Props {
  image?: string | null;
  bubbleClassName?: string;
}

const FALLBACK_SLUG = "sparkles";

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
