import { cn } from "@houston-ai/core";
import { ChevronLeft } from "lucide-react";

/** Where a back affordance returns to, named as the user reads that level. */
export interface BackTarget {
  label: string;
  onClick: () => void;
}

/**
 * How much room the control is given. `default` is the two-shape control below;
 * `compact` is the icon-only 32px chip for a header that already carries a
 * dense cluster beside it (the skill editor's strip), where a labelled chevron
 * would crowd the skill's own name off the row.
 */
export type BackControlSize = "default" | "compact";

/* The chip's ring is a `border` rather than `.ht-hairline`: that utility is a
   plain class, so it cannot be scoped to the phone layer and would outlive the
   chip on the desktop. `shrink-0` keeps the way back on screen when the cluster
   beside it runs out of room. The focus ring is NEVER dropped at a breakpoint:
   keyboard focus has to be visible at every width (DESIGN.md), and the desktop
   shape — a plain labelled chevron — is the one with nothing else to show it.
   `md:rounded-sm` keeps that ring tight around the label instead of ringing a
   pill the desktop no longer draws. */
const SIZE_CLASS: Record<BackControlSize, string> = {
  default:
    "size-10 border border-line bg-chip text-ink md:size-auto md:gap-1 md:rounded-sm md:border-0 md:bg-transparent md:text-ink-muted md:text-sm md:hover:text-ink",
  compact: "size-8 text-ink-muted hover:bg-hover hover:text-ink",
};

/**
 * The way back for a drilled level whose chrome is a plain back bar or the
 * standard header strip: `BackBarScreen` (the Settings sections and the other
 * screens with no header of their own), `PageHeader`'s `back` slot, and the
 * skill editor's compact strip all render this same element, so the chevron,
 * its label and its shapes cannot drift apart between them.
 *
 * Two headers speak a different grammar and carry their own back affordance,
 * so a level standing in one of them uses that one, never this control and
 * never a fourth shape:
 *
 * - `page-header/page-header-back-chip.tsx` — the lozenge-cluster header
 *   (`DrilledHeader`), where back is a lozenge on the cluster's own track,
 *   wearing the destination's glyph.
 * - `shell/mobile-drilled-header.tsx` — the phone's drilled `<h1>` row (a
 *   team's section, a focused agent), whose round chip is sized against the
 *   title beside it.
 *
 * The three shapes have drifted apart and consolidating them is open work.
 *
 * Two shapes, one control. The phone wears a floating round chip: a thumb-sized
 * target that reads against a full-bleed screen, where a small text link at the
 * top edge does not. The desktop keeps the labelled chevron, which has the room
 * to name where back goes. The chip is 40px, so it stands inside the header
 * strip's 48px without changing its height.
 */
export function BackControl({
  label,
  onClick,
  size = "default",
}: BackTarget & { size?: BackControlSize }) {
  const compact = size === "compact";
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={cn(
        "inline-flex shrink-0 cursor-pointer items-center justify-center rounded-full transition-colors active:scale-[0.96] focus-visible:ring-2 focus-visible:ring-focus",
        SIZE_CLASS[size],
      )}
    >
      <ChevronLeft className="size-4" />
      <span className={compact ? "sr-only" : "sr-only md:not-sr-only"}>
        {label}
      </span>
    </button>
  );
}
