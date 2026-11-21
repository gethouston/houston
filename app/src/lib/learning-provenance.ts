import type { UserProfile } from "../hooks/queries/use-user-profiles";

export interface LearningProvenanceSource {
  taughtBy?: { user_id: string; name?: string };
  missionId?: string;
  missionTitle?: string;
}

export interface LearningSourceRow extends LearningProvenanceSource {
  index: number;
  text: string;
  id: string;
}

export interface LearningProvenanceView {
  name?: string;
  personId?: string;
  photoUrl?: string;
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
  return {
    ...(name ? { name } : {}),
    ...(name && learning.taughtBy
      ? { personId: learning.taughtBy.user_id }
      : {}),
    ...(photoUrl ? { photoUrl } : {}),
    ...(mission ? { mission } : {}),
  };
}

export function collectTaughtByIds(rows: LearningProvenanceSource[]): string[] {
  const ids = new Set<string>();
  for (const row of rows) if (row.taughtBy) ids.add(row.taughtBy.user_id);
  return Array.from(ids);
}
