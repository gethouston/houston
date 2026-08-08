/**
 * The tags a mission card wears. The ONE rule both mission boards read (the
 * active board and the archive), so a mission can never be labelled one way in
 * one and another way in the other.
 *
 * Only routine-born missions are tagged today: a routine's own runs say so on
 * the card, everything else stays clean.
 */
export function missionCardTags({
  routineId,
  routineLabel,
}: {
  routineId?: string | null;
  routineLabel: string;
}): string[] | undefined {
  if (routineId) return [routineLabel];
  return undefined;
}
