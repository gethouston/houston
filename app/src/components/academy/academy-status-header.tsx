import {
  Skeleton,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@houston-ai/core";
import { Flame } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { AcademyRank } from "../../lib/academy/academy-ranks";
import { SpecChip } from "../spec-chip";
import { AcademyRankAvatar } from "./academy-rank-avatar";
import {
  ACADEMY_RANK_LABELS,
  academyRankReading,
} from "./academy-rank-progress";

/**
 * Where the user stands: their own face inside the rank ring, the rank they
 * wear, and how much of the climb to the next one is done.
 *
 * It sits DIRECTLY on the page, with no card around it. A card would frame the
 * user's own face as one more panel of statistics; the plane language is what
 * lets the ring be the thing you look at.
 *
 * The meter is the house meter, the same one the AI Models hub spends on a
 * provider's rate-limit windows (`ai-hub/provider-usage-meters.tsx`): label
 * left, the two numbers right, a 6px track under them. Usage points ride the
 * house chip beside the rank rather than a badge of their own, because they are
 * a second currency, not a second headline. The streak joins them as a second
 * quiet chip, present only while a run is actually alive.
 *
 * Props-only over the values `useAcademyProgress()` resolves, so the arithmetic
 * (`academy-rank-progress.ts`) and the reading of it stay separable, and the
 * header can be put on screen with any pair of numbers. The one thing it does
 * not take as a prop is the face: {@link AcademyRankAvatar} reads the app's ONE
 * self-identity itself, exactly as every other self-face does.
 */
export function AcademyStatusHeader(props: {
  rank: AcademyRank;
  experience: number;
  usagePoints: number;
  streak: { current: number; best: number };
  loading: boolean;
}) {
  const { t } = useTranslation("academy");

  if (props.loading) return <AcademyStatusSkeleton />;

  const { next, percent, remaining } = academyRankReading(
    props.experience,
    props.rank,
  );

  return (
    <section className="flex items-center gap-5">
      <AcademyRankAvatar percent={percent} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-base font-medium text-ink">
            {t(ACADEMY_RANK_LABELS[props.rank.id])}
          </p>
          <SpecChip>
            {t("status.usageChip", { points: props.usagePoints })}
          </SpecChip>
          {/* A run only exists while it is alive (`liveStreak`), so a broken
              one leaves nothing behind rather than a chip reading zero. The
              best run is history, not a headline, so it rides the house
              tooltip on a real focusable trigger — the keyboard reaches it
              exactly as the pointer does. */}
          {props.streak.current > 0 && (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  // `inline-flex` so the trigger is exactly the chip's box:
                  // an inline button would add the line-box descender under
                  // it and lift the chip off the row's centre line.
                  className="inline-flex rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
                >
                  <SpecChip>
                    <Flame className="size-3" aria-hidden="true" />
                    {t("status.streakChip", { count: props.streak.current })}
                  </SpecChip>
                </button>
              </TooltipTrigger>
              <TooltipContent>
                {t("status.streakBest", { count: props.streak.best })}
              </TooltipContent>
            </Tooltip>
          )}
        </div>
        <div className="mt-3">
          <div className="flex items-baseline justify-between gap-3 text-xs">
            <span className="truncate text-ink">{t("status.experience")}</span>
            <span className="shrink-0 text-ink-muted tabular-nums">
              {next === null
                ? t("status.experienceTotal", { value: props.experience })
                : t("status.experienceOf", {
                    value: props.experience,
                    goal: next.minExperience,
                  })}
            </span>
          </div>
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-chip">
            {/* A floor of 2% so a rank just started still shows a mark: a
                completely empty track reads as a broken meter. */}
            <div
              className="h-full rounded-full bg-action"
              style={{ width: `${Math.max(2, percent)}%` }}
            />
          </div>
          <p className="mt-1.5 text-xs text-ink-muted">
            {next === null
              ? t("status.topRank")
              : t("status.toNextRank", {
                  points: remaining,
                  rank: t(ACADEMY_RANK_LABELS[next.id]),
                })}
          </p>
        </div>
      </div>
    </section>
  );
}

/** The header's exact shape while the record is in flight, so nothing shifts. */
function AcademyStatusSkeleton() {
  return (
    <section aria-hidden className="flex items-center gap-5">
      <Skeleton className="size-16 shrink-0 rounded-full" />
      <div className="min-w-0 flex-1">
        {/* h-6 is the rank line's own height (`text-base`), not the chip's. */}
        <div className="flex h-6 items-center">
          <Skeleton className="h-4 w-28" />
        </div>
        <div className="mt-3">
          <div className="flex h-4 items-center justify-between gap-3">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-3 w-16" />
          </div>
          <Skeleton className="mt-1.5 h-1.5 w-full rounded-full" />
          <div className="mt-1.5 flex h-4 items-center">
            <Skeleton className="h-3 w-40" />
          </div>
        </div>
      </div>
    </section>
  );
}
