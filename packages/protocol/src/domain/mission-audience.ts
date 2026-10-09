import type { Activity } from "./activity";

export type MissionAudience = { everyone: true } | { user_ids: string[] };

/** A mission with no attribution belongs to everyone who can use its agent. */
export function missionAudience(
  activity:
    | Pick<Activity, "created_by" | "contributors" | "mentioned">
    | undefined,
  reportOverflow?: (overflow: number) => void,
): MissionAudience {
  if (!activity) return { everyone: true };
  const ids = new Set<string>();
  if (activity.created_by) ids.add(activity.created_by);
  for (const contributor of activity.contributors ?? []) {
    if (contributor.user_id) ids.add(contributor.user_id);
  }
  for (const mention of activity.mentioned ?? []) {
    if (mention.user_id && mention.by !== mention.user_id)
      ids.add(mention.user_id);
  }
  if (ids.size === 0) return { everyone: true };
  if (ids.size > 512) reportOverflow?.(ids.size - 512);
  return { user_ids: [...ids].slice(0, 512) };
}
