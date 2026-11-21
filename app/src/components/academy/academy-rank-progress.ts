import { type AcademyRank, nextRank } from "../../lib/academy/academy-ranks.ts";

export function experienceToNextRank(
  experience: number,
  next: AcademyRank | null,
): number {
  if (next === null) return 0;
  return Math.max(0, next.minExperience - experience);
}

export function academyRankPercent(
  experience: number,
  rank: AcademyRank,
  next: AcademyRank | null,
): number {
  if (next === null) return 100;
  const span = next.minExperience - rank.minExperience;
  if (span <= 0) return 100;
  const travelled = experience - rank.minExperience;
  return Math.min(100, Math.max(0, Math.round((travelled / span) * 100)));
}

export interface AcademyRankReading {
  next: AcademyRank | null;
  percent: number;
  remaining: number;
}

export function academyRankReading(
  experience: number,
  rank: AcademyRank,
): AcademyRankReading {
  const next = nextRank(rank);
  return {
    next,
    percent: academyRankPercent(experience, rank, next),
    remaining: experienceToNextRank(experience, next),
  };
}

export const ACADEMY_RANK_LABELS = {
  cadet: "ranks.cadet",
  pilot: "ranks.pilot",
  specialist: "ranks.specialist",
  commander: "ranks.commander",
  "mission-director": "ranks.missionDirector",
} as const satisfies Record<AcademyRank["id"], string>;
