export interface AcademyRank {
  id: "cadet" | "pilot" | "specialist" | "commander" | "mission-director";
  minExperience: number;
  minUsagePoints: number;
}

const CADET: AcademyRank = { id: "cadet", minExperience: 0, minUsagePoints: 0 };

export const ACADEMY_RANKS: AcademyRank[] = [
  CADET,
  { id: "pilot", minExperience: 50, minUsagePoints: 0 },
  { id: "specialist", minExperience: 150, minUsagePoints: 0 },
  { id: "commander", minExperience: 300, minUsagePoints: 200 },
  { id: "mission-director", minExperience: 500, minUsagePoints: 1000 },
];

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

export function nextRank(rank: AcademyRank): AcademyRank | null {
  const index = ACADEMY_RANKS.findIndex((r) => r.id === rank.id);
  if (index < 0 || index + 1 >= ACADEMY_RANKS.length) return null;
  return ACADEMY_RANKS[index + 1];
}
