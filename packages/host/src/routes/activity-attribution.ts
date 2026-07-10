import {
  loadActivities,
  saveActivities,
  type TextStore,
  upsertById,
  upsertContributor,
} from "@houston/domain";
import type { ActivityContributor, HoustonEvent } from "@houston/protocol";

/**
 * Teams attribution: stamp the acting human as a contributor on the mission a
 * turn is driving. Called only when a gateway-injected acting-as identity is
 * present (hosted Teams) — off the gateway `author` is null and nothing runs,
 * so single-player activity.json stays byte-identical.
 *
 * The mission is matched by the conversation id: a mission's `session_key` (the
 * turn's conversation), with `activity-<id>` as the fallback for missions whose
 * key was never persisted separately. `upsertContributor` returns the SAME
 * reference when the actor is already recorded, so an unchanged mission skips
 * the disk write.
 *
 * INVARIANT: attribution is metadata — a stamping failure must NEVER block or
 * fail the turn. Everything here is best-effort and swallowed with a log; the
 * turn's own dispatch owns the user-visible outcome.
 */
export async function stampTurnContributor(
  store: TextStore,
  root: string,
  agentId: string,
  cid: string,
  author: ActivityContributor,
  emit?: (event: HoustonEvent) => void,
): Promise<void> {
  try {
    const { items } = await loadActivities(store, root);
    const activity = items.find(
      (a) => a.session_key === cid || `activity-${a.id}` === cid,
    );
    if (!activity) return;
    const next = upsertContributor(activity, author);
    if (next === activity) return; // already recorded — no write, no event.
    await saveActivities(store, root, upsertById(items, next));
    emit?.({ type: "ActivityChanged", agentPath: agentId });
  } catch (err) {
    // Attribution is metadata; a stamping failure must not break the turn.
    console.error(`[attribution] stamp failed for ${agentId}/${cid}:`, err);
  }
}
