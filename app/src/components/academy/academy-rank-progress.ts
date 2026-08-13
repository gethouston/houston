// The `.ts` extension is load-bearing: `app/tests` runs under node's
// `--experimental-strip-types`, whose ESM resolver does not guess extensions.
import { type AcademyRank, nextRank } from "../../lib/academy/academy-ranks.ts";

/**
 * Reading a rank: how far the climb to the next rung has travelled, and which
 * string names the rank.
 *
 * The ladder itself (the thresholds, which rank an amount of experience earns,
 * and the rung above one) is `lib/academy/academy-ranks.ts`. This is only the
 * presentation arithmetic, kept beside the surfaces that spend it so the rules
 * that DECIDE a rank stay in one unit-tested module.
 *
 * The reading is EXPERIENCE only. A rank also asks for usage points, but two
 * meters racing to one rank reads as two goals, and experience is the one the
 * path below the status header actually moves.
 */

/** Experience still owed to the next rank. Zero once it is reached. */
export function experienceToNextRank(
  experience: number,
  next: AcademyRank | null,
): number {
  if (next === null) return 0;
  return Math.max(0, next.minExperience - experience);
}

/**
 * How full the bar toward `next` is, 0 to 100. The top of the ladder is a full
 * bar rather than an empty one: there is nothing left to earn, and an empty bar
 * would read as no progress at all.
 */
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

/** One reading of a rank, the shape every surface that draws it consumes. */
export interface AcademyRankReading {
  /** The rung above, or `null` at the top of the ladder. */
  next: AcademyRank | null;
  /** How full the climb to `next` is, 0 to 100. */
  percent: number;
  /** Experience still owed to `next`. Zero at the top. */
  remaining: number;
}

/**
 * One reading of a rank, resolved in a single call: the ring around the user's
 * face and the meter beside it come out of the same three numbers, so the arc
 * and the bar can never claim different fractions of one climb
 * (`academy-status-header.tsx`).
 */
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

/**
 * The `academy` string that names each rank. A literal map rather than a
 * template key, so a rank added to the ladder without its name fails typecheck
 * instead of rendering its raw id to the user.
 */
export const ACADEMY_RANK_LABELS = {
  cadet: "ranks.cadet",
  pilot: "ranks.pilot",
  specialist: "ranks.specialist",
  commander: "ranks.commander",
  "mission-director": "ranks.missionDirector",
} as const satisfies Record<AcademyRank["id"], string>;
