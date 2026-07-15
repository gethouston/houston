import { cn } from "@houston-ai/core";

export interface PoweredByVercelBadgeProps {
  label?: string;
  className?: string;
}

/**
 * A small, subtle attribution mark: the Vercel triangle logomark followed by a
 * label. Understated chrome (monochrome `currentColor`/muted), not a
 * marketplace card.
 */
export function PoweredByVercelBadge({
  label = "Powered by Vercel",
  className,
}: PoweredByVercelBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 text-xs text-ink-muted",
        className,
      )}
    >
      <svg
        viewBox="0 0 76 65"
        className="h-2.5 w-2.5"
        fill="currentColor"
        aria-hidden="true"
      >
        <path d="M37.5274 0L75.0548 65H0L37.5274 0Z" />
      </svg>
      {label}
    </span>
  );
}
