import type { ReactNode } from "react";
import { BackControl } from "./back-control";

/**
 * The shared drill-in scaffold: a back affordance over a full-height scroll
 * region. ONE frame for every screen that sits one level below something else
 * and has NO header strip of its own, including plain Settings sections, so
 * the chevron, spacing and scroll behaviour stay consistent. It keeps each level
 * to exactly one back affordance: a screen nested inside another renders its
 * own bar only for its own depth.
 *
 * A screen that DOES frame itself with a header strip takes the same
 * {@link BackControl} into that strip instead (`PageHeader`'s `back` slot), so
 * the level reads as one row rather than two.
 *
 * `onBack` returns to the level above (the Settings index); `backLabel` names
 * it.
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
        <BackControl label={backLabel} onClick={onBack} />
      </div>
      <div className="flex-1 overflow-y-auto [scrollbar-gutter:stable]">
        {children}
      </div>
    </div>
  );
}
