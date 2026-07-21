/**
 * VerifiedBadge — the verified-creator indicator glyph (a scalloped badge check).
 *
 * Props-only and i18n-agnostic per the ui/ library boundary: the consumer passes
 * a translated `label` (used as the accessible name and tooltip); it defaults to
 * English "Verified". Color comes from design tokens only.
 */
import { BadgeCheck } from "lucide-react";

import { cn } from "../utils";

interface Props {
  size?: "sm" | "md";
  label?: string;
  className?: string;
}

const SIZES = {
  sm: "size-3.5",
  md: "size-4",
} as const;

export function VerifiedBadge({
  size = "md",
  label = "Verified",
  className,
}: Props) {
  return (
    <BadgeCheck
      role="img"
      aria-label={label}
      className={cn("shrink-0 text-action", SIZES[size], className)}
    />
  );
}
