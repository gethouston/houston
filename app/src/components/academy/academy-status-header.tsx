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
          {props.streak.current > 0 && (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
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

function AcademyStatusSkeleton() {
  return (
    <section aria-hidden className="flex items-center gap-5">
      <Skeleton className="size-16 shrink-0 rounded-full" />
      <div className="min-w-0 flex-1">
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
