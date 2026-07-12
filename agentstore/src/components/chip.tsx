import { cn } from "@houston-ai/core";
import Link from "next/link";
import type { ReactNode } from "react";

/**
 * A pill filter/navigation chip rendered as a link (crawlable, no JS). `active`
 * paints the selected state and sets `aria-current` for assistive tech. Chips are
 * always fully visible; selection is never hover-gated.
 */
export function ChipLink({
  href,
  active = false,
  className,
  children,
}: {
  href: string;
  active?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "true" : undefined}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
        active
          ? "border-transparent bg-primary text-primary-foreground"
          : "border-border bg-secondary text-secondary-foreground hover:bg-accent hover:text-accent-foreground",
        className,
      )}
    >
      {children}
    </Link>
  );
}
