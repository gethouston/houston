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
 *
 * `onPhoto` switches to the space-foreground family for badges that sit DIRECTLY
 * on the dark space photo (the wizard's card-less hero, `WizardFrame`), where
 * the default `--ht-line` outline + `text-ink-muted` would resolve near-invisible
 * under the pinned light palette. It keeps the SAME `ht-hairline` geometry (no
 * layout shift) but overrides the outline to a translucent white derived from
 * `--ht-space-foreground` and paints the label in slightly-muted space-foreground
 * ink, so both stay clearly legible on `--ht-space-canvas` (#07080f) AND over the
 * bright galactic core (the hero's radial veil helps).
 */
export function WizardBadge({
  icon,
  children,
  className,
  onPhoto = false,
}: {
  /** Optional leading glyph (a lucide icon); sized to match the label. */
  icon?: ReactNode;
  children: ReactNode;
  className?: string;
  /** Style for a card-less badge sitting directly on the dark space photo. */
  onPhoto?: boolean;
}) {
  return (
    <span
      // Overriding just `outlineColor` keeps `.ht-hairline`'s 1px inset outline
      // geometry identical to the on-card variant — no border, no size change.
      style={
        onPhoto
          ? {
              outlineColor:
                "color-mix(in srgb, var(--ht-space-foreground) 24%, transparent)",
            }
          : undefined
      }
      className={cn(
        "ht-hairline inline-flex items-center gap-1.5 rounded-full bg-transparent px-3 py-1 text-xs font-medium",
        onPhoto
          ? "text-[color-mix(in_srgb,var(--ht-space-foreground)_88%,transparent)]"
          : "text-ink-muted",
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
