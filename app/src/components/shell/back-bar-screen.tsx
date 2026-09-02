import { ChevronLeft } from "lucide-react";
import type { ReactNode } from "react";

/**
 * The shared drill-in scaffold: a back-bar with a labelled chevron over a
 * full-height scroll region. ONE frame for every screen that sits one level
 * below something else — the Settings sections, the Team Settings agent
 * drill-in — so the chevron, its label spacing and the scroll behaviour can
 * never drift between them. It also keeps each level to exactly one back
 * affordance: a screen nested inside another renders its own bar only for its
 * own depth. (Admin has no drill-in anymore: its sections are header-cluster
 * siblings, and drilled inner levels use the header's own
 * `PageHeaderBackChip`, not this bar.)
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
      <div className="shrink-0 px-4 pt-8 pb-2 md:px-8">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex cursor-pointer items-center gap-1 text-sm text-ink-muted transition-colors hover:text-ink"
        >
          <ChevronLeft className="size-4" />
          {backLabel}
        </button>
      </div>
      <div className="flex-1 overflow-y-auto [scrollbar-gutter:stable]">
        {children}
      </div>
    </div>
  );
}
