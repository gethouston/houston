import {
  loadActivities,
  loadLearnings,
  saveLearnings,
  type TextStore,
} from "@houston/domain";
import type { Learning } from "@houston/protocol";
import { withDocLock } from "./doc-lock";

/** Stable inputs for an idempotent learning append. */
export interface AppendLearningInput {
  id: string;
  text: string;
  nowIso: string;
  taughtBy?: Learning["taught_by"];
  conversationId?: string;
}

/** Append one validated learning without replacing existing memory. */
export async function appendLearningChecked(
  store: TextStore,
  root: string,
  input: AppendLearningInput,
): Promise<{ learning: Learning } | { error: string }> {
  const text = input.text.trim();
  if (!text) return { error: "missing 'text'" };

  const mission = await learningMission(store, root, input.conversationId);
  const learning: Learning = {
    id: input.id,
    text,
    created_at: input.nowIso,
    ...(input.taughtBy ? { taught_by: input.taughtBy } : {}),
    ...mission,
  };
  return withDocLock(`${root}#learnings`, async () => {
    const { items } = await loadLearnings(store, root);
    const existing = items.find((item) => item.id === learning.id);
    if (existing) return { learning: existing };
    await saveLearnings(store, root, [...items, learning]);
    return { learning };
  });
}

async function learningMission(
  store: TextStore,
  root: string,
  conversationId: string | undefined,
): Promise<{ mission_id?: string; mission_title?: string }> {
  if (!conversationId) return {};
  try {
    const { items } = await loadActivities(store, root);
    const activity = items.find(
      (item) =>
        item.session_key === conversationId ||
        `activity-${item.id}` === conversationId,
    );
    if (!activity) return {};
    return {
      mission_id: activity.id,
      ...(activity.title ? { mission_title: activity.title } : {}),
    };
  } catch (error) {
    console.error(`[learnings] mission lookup failed for ${root}:`, error);
    return {};
  }
}
