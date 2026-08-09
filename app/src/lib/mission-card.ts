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
  originSessionKey,
  agentStartedLabel,
}: {
  routineId?: string | null;
  routineLabel: string;
  /** Present when the agent started this mission itself (PRODUCT-1244). */
  originSessionKey?: string | null;
  agentStartedLabel?: string;
}): string[] | undefined {
  if (routineId) return [routineLabel];
  if (originSessionKey && agentStartedLabel) return [agentStartedLabel];
  return undefined;
}
