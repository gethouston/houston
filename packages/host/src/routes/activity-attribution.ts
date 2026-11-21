import {
  addressesMission,
  loadActivities,
  saveActivities,
  type TextStore,
  upsertById,
  upsertContributor,
  upsertMentions,
} from "@houston/domain";
import type {
  Activity,
  ActivityContributor,
  HoustonEvent,
} from "@houston/protocol";

export async function stampTurnAttribution(
  store: TextStore,
  root: string,
  agentId: string,
  cid: string,
  author: ActivityContributor,
  mentionedIds: string[],
  emit?: (event: HoustonEvent) => void,
): Promise<Activity | undefined> {
  try {
    const { items } = await loadActivities(store, root);
    const activity = items.find((a) => addressesMission(a, cid));
    if (!activity) return;
    const next = upsertMentions(
      upsertContributor(activity, author),
      mentionedIds,
      new Date().toISOString(),
      author.user_id,
    );
    if (next === activity) return activity;
    await saveActivities(store, root, upsertById(items, next));
    emit?.({ type: "ActivityChanged", agentPath: agentId });
    return next;
  } catch (err) {
    console.error(`[attribution] stamp failed for ${agentId}/${cid}:`, err);
  }
}
