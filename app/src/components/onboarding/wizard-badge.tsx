import { cn } from "@houston-ai/core";
import type { ReactNode } from "react";

/**
 * A non-interactive status / info badge for the onboarding + cloud-migration
 * wizard: a hairline-outlined chip (`ht-hairline`, the same Linear-style
 * outline as the AI Hub's `SpecChip`) with a TRANSPARENT fill and muted ink,
 * deliberately distinct from the filled pill BUTTONS around it. It has no
 * `onClick`, no fill, and no hover state, so it never reads or behaves like
 * something to click — it only labels state ("Step 1 of 2", "Beta", a count).
 * Optional leading icon. App-local wizard chrome, not a reusable `ui/` widget.
 * Reads fine on the wizard's white cards and grey background alike.
 */
export function WizardBadge({
  icon,
  children,
  className,
}: {
  /** Optional leading glyph (a lucide icon); sized to match the label. */
  icon?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "ht-hairline inline-flex items-center gap-1.5 rounded-full bg-transparent px-3 py-1 text-xs font-medium text-ink-muted",
        className,
      )}
    >
      {icon && (
        <span className="shrink-0 [&>svg]:size-3.5" aria-hidden>
          {icon}
        </span>
      )}
      {children}
    </span>
  );
}
