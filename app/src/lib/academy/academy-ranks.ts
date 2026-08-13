// The Academy's rank ladder. Two currencies, deliberately: EXPERIENCE is earned
// by learning (finishing chapters) and USAGE POINTS by actually running Houston,
// so the top ranks cannot be read into existence — someone has to fly.
//
// v1 placeholder configuration: the thresholds are expected to move once real
// usage data exists. Everything reads them from here, nothing hardcodes a number.

export interface AcademyRank {
  id: "cadet" | "pilot" | "specialist" | "commander" | "mission-director";
  minExperience: number;
  minUsagePoints: number;
}

/** Cadet is the floor: everyone holds a rank from the first launch. */
const CADET: AcademyRank = { id: "cadet", minExperience: 0, minUsagePoints: 0 };

/** Ascending. Index order IS the ladder — {@link nextRank} walks it. */
export const ACADEMY_RANKS: AcademyRank[] = [
  CADET,
  { id: "pilot", minExperience: 50, minUsagePoints: 0 },
  { id: "specialist", minExperience: 150, minUsagePoints: 0 },
  { id: "commander", minExperience: 300, minUsagePoints: 200 },
  { id: "mission-director", minExperience: 500, minUsagePoints: 1000 },
];

/**
 * The highest rank whose BOTH thresholds are met. The scan does not stop at the
 * first unmet rank on purpose — the two currencies are independent, so a reader
 * with 300 experience and no usage stays a specialist while a heavy user who
 * later finishes the chapters jumps straight past it.
 */
export function currentRank(
  experience: number,
  usagePoints: number,
): AcademyRank {
  let held = CADET;
  for (const rank of ACADEMY_RANKS) {
    if (experience >= rank.minExperience && usagePoints >= rank.minUsagePoints)
      held = rank;
  }
  return held;
}

/** The rung above, or null at the top of the ladder. */
export function nextRank(rank: AcademyRank): AcademyRank | null {
  const index = ACADEMY_RANKS.findIndex((r) => r.id === rank.id);
  if (index < 0 || index + 1 >= ACADEMY_RANKS.length) return null;
  return ACADEMY_RANKS[index + 1];
}

/** The first chapter every user meets: Houston's own setup, finished by the
 *  onboarding flow itself, so nobody lands in the Academy at zero. */
export const SETUP_CHAPTER_ID = "setup";
export const SETUP_CHAPTER_EXPERIENCE = 50;
