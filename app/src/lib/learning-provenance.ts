import type { UserProfile } from "../hooks/queries/use-user-profiles";

/**
 * Pure, DOM-free resolution of a learning's PROVENANCE — the person who taught
 * it and the mission it came from — into the two display values the Memory row
 * renders. Kept out of the component so the fallback ladder (which title wins,
 * what happens with no roster) is unit-tested in isolation.
 *
 * Two fallbacks carry the whole design:
 *  - PERSON: the live profile name (multiplayer roster) wins, then the name
 *    STORED on the learning. Single player / desktop resolves no profiles at
 *    all, so a learning taught in the cloud still reads "From Felipe" there.
 *  - MISSION: the live title looked up by `mission_id` wins, so a renamed
 *    mission reads correctly; the title stored at save time is the fallback for
 *    a mission that was since deleted.
 *
 * A learning with neither resolves to `null` — the row renders no provenance
 * line at all rather than an empty or "Unknown" one.
 */

/** The provenance fields a Memory row carries (from `useLearnings`). */
export interface LearningProvenanceSource {
  taughtBy?: { user_id: string; name?: string };
  missionId?: string;
  missionTitle?: string;
}

/**
 * A Memory row exactly as `useLearnings` yields it: the learning plus its RAW
 * provenance. The screen resolves the raw half into a `LearningProvenanceView`
 * and hands the card only that — the row component never reads these fields.
 */
export interface LearningSourceRow extends LearningProvenanceSource {
  index: number;
  text: string;
  id: string;
}

/** What the provenance line renders. */
export interface LearningProvenanceView {
  /** The person's display name, when one is known. */
  name?: string;
  /** The person's stable id, so their face wears the one tone that person
   *  wears everywhere else (board stacks, chat sender line). */
  personId?: string;
  /** The person's photo, when the roster resolved one. */
  photoUrl?: string;
  /** The mission's title, live one preferred. */
  mission?: string;
}

export function resolveLearningProvenance(
  learning: LearningProvenanceSource,
  profiles: ReadonlyMap<string, UserProfile>,
  missionTitles: ReadonlyMap<string, string>,
): LearningProvenanceView | null {
  const profile = learning.taughtBy
    ? profiles.get(learning.taughtBy.user_id)
    : undefined;
  const name = profile?.name || learning.taughtBy?.name || undefined;
  const photoUrl = profile?.avatarUrl || undefined;
  const mission = learning.missionId
    ? (missionTitles.get(learning.missionId) ?? learning.missionTitle)
    : learning.missionTitle;

  if (!name && !mission) return null;
  // The id rides along only WITH a name: it is the face's tone key, and a face
  // is drawn only for a person we can name (an id slice is not a person).
  return {
    ...(name ? { name } : {}),
    ...(name && learning.taughtBy
      ? { personId: learning.taughtBy.user_id }
      : {}),
    ...(photoUrl ? { photoUrl } : {}),
    ...(mission ? { mission } : {}),
  };
}

/** The distinct `taught_by` ids across a set of rows — the argument for the
 *  batched `useUserProfiles` lookup. */
export function collectTaughtByIds(rows: LearningProvenanceSource[]): string[] {
  const ids = new Set<string>();
  for (const row of rows) if (row.taughtBy) ids.add(row.taughtBy.user_id);
  return Array.from(ids);
}
