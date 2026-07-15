import { cn } from "@houston-ai/core";
import { useState } from "react";

const SIZES = {
  sm: "size-6",
  md: "size-8",
  lg: "size-10",
} as const;

export interface SkillOwnerAvatarProps {
  owner: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}

/**
 * A GitHub owner's avatar (from `github.com/<owner>.png`), with an
 * initial-letter fallback when the image is missing or fails to load. The box
 * is a fixed size in every state, so swapping the img for the letter never
 * shifts surrounding layout. Rendered full-color (the deliberate "candy store"
 * exception): real logos are the point here, not tinted chrome.
 */
export function SkillOwnerAvatar({
  owner,
  size = "md",
  className,
}: SkillOwnerAvatarProps) {
  const [imgError, setImgError] = useState(false);
  const box = cn(SIZES[size], "shrink-0 rounded-lg bg-chip", className);

  if (imgError || !owner) {
    return (
      <div className={cn(box, "flex items-center justify-center")}>
        <span className="text-xs font-semibold text-ink-muted">
          {owner.charAt(0).toUpperCase()}
        </span>
      </div>
    );
  }
  return (
    <img
      src={`https://github.com/${owner}.png?size=80`}
      alt={owner}
      className={cn(box, "object-cover")}
      onError={() => setImgError(true)}
    />
  );
}
