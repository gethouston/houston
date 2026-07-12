import { cn } from "@houston-ai/core";
import { ChevronRight } from "lucide-react";

/**
 * A section label for the browse plane — a small heading with a trailing
 * chevron, the reference's "Installed >" / "Productivity >" motif. The chevron
 * is purely a visual accent, NOT navigation: this renders a plain non
 * interactive `<h2>`, no button, no cursor-pointer, so it stays honest (no fake
 * affordance). Heading level h2 sits directly under the page's h1 (the PageHeader
 * title), so the section headings never skip a level.
 *
 * Lives in `integrations/` (not `integrations-view/`) so BOTH surfaces can share
 * it without crossing the boundary the wrong way: `integrations-view/` imports
 * from `integrations/`, never the reverse.
 */
export function SectionHeader({
  title,
  className,
}: {
  title: string;
  className?: string;
}) {
  return (
    <h2
      className={cn(
        "flex items-center gap-1 text-sm font-medium text-ink",
        className,
      )}
    >
      {title}
      <ChevronRight className="size-4 text-ink-muted" aria-hidden />
    </h2>
  );
}
