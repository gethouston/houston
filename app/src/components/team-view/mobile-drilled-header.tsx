import { ChevronLeft } from "lucide-react";
import type { ReactNode } from "react";

/**
 * The phone's header for a DRILLED screen — a team's section, the team's
 * settings level, a focused agent.
 *
 * A different grammar from the desktop strip on purpose, and it is the tree,
 * not this header, that carries the difference. On the phone the sections were
 * already chosen one level up (the Teams tree / the Agents list), so a
 * switcher here would offer the same list twice and leave the screen without a
 * title. What a drilled phone screen owes instead is the two things a lozenge
 * cluster cannot say at 375px: where you ARE (a real `<h1>`, the subject and
 * its section) and how to get BACK.
 *
 * The back control is a floating round chip rather than a labelled lozenge:
 * the destination is named by the tab the user is standing in, and a chip
 * leaves the whole row to the title. Its `aria-label` names the destination, so
 * the affordance is never just an arrow to a screen reader.
 *
 * Presentational only — every caller passes its own words and its own retreat.
 */
export function MobileDrilledHeader({
  backLabel,
  onBack,
  glyph,
  title,
  subtitle,
  testId,
}: {
  /** The destination, spoken: the screen this chip retreats to. */
  backLabel: string;
  onBack: () => void;
  /** The subject's mark (team glyph, agent helmet), beside its name. */
  glyph?: ReactNode;
  title: string;
  /** The section on screen, under the subject. */
  subtitle: string;
  testId: string;
}) {
  return (
    <div className="flex shrink-0 items-start gap-3 px-4 pt-4 pb-2">
      <button
        type="button"
        aria-label={backLabel}
        data-testid={testId}
        onClick={onBack}
        className="ht-hairline flex size-10 shrink-0 items-center justify-center rounded-full bg-chip text-ink transition-colors hover:bg-hover active:scale-[0.96] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
      >
        <ChevronLeft aria-hidden className="size-5" />
      </button>
      <div className="min-w-0 flex-1">
        <h1 className="flex min-w-0 items-center gap-2 text-2xl font-normal text-ink">
          {glyph}
          <span className="min-w-0 truncate">{title}</span>
        </h1>
        <p className="mt-0.5 truncate text-sm text-ink-muted">{subtitle}</p>
      </div>
    </div>
  );
}
