import { ChevronLeft } from "lucide-react";
import type { ReactNode } from "react";

/**
 * The shared drill-in scaffold: a back affordance over a full-height scroll
 * region. ONE frame for every screen that sits one level below something else
 * — the Settings sections, the Team Settings agent drill-in — so the chevron,
 * its spacing and the scroll behaviour can never drift between them. It also
 * keeps each level to exactly one back affordance: a screen nested inside
 * another renders its own bar only for its own depth. (Admin has no drill-in
 * anymore: its sections are header-cluster siblings, and drilled inner levels
 * use the header's own `PageHeaderBackChip`, not this bar.)
 *
 * Two shapes, one element. The phone wears a floating round chip: a thumb-sized
 * target that reads against a full-bleed screen, where a small text link at the
 * top edge does not. The desktop keeps the labelled chevron, which has the room
 * to name where back goes.
 *
 * `onBack` returns to the level above (the Settings index, the team's agent
 * list); `backLabel` names it.
 */
export function BackBarScreen({
  backLabel,
  onBack,
  children,
}: {
  backLabel: string;
  onBack: () => void;
  children: ReactNode;
}) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 px-4 pt-4 pb-2 md:px-8 md:pt-8">
        <button
          type="button"
          onClick={onBack}
          aria-label={backLabel}
          /* The chip's ring is a `border` rather than `.ht-hairline`: that
             utility is a plain class, so it cannot be scoped to the phone
             layer and would outlive the chip on the desktop. */
          className="inline-flex size-10 cursor-pointer items-center justify-center rounded-full border border-line bg-chip text-ink transition-colors active:scale-[0.96] focus-visible:ring-2 focus-visible:ring-focus md:size-auto md:gap-1 md:rounded-none md:border-0 md:bg-transparent md:text-ink-muted md:text-sm md:hover:text-ink md:focus-visible:ring-0"
        >
          <ChevronLeft className="size-4" />
          <span className="sr-only md:not-sr-only">{backLabel}</span>
        </button>
      </div>
      <div className="flex-1 overflow-y-auto [scrollbar-gutter:stable]">
        {children}
      </div>
    </div>
  );
}
