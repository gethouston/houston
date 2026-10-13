import {
  ASSISTANT_LEARNINGS_MAX_BYTES,
  activeLearnings,
  addressesMission,
  learningsDocBytes,
  loadActivities,
  loadLearnings,
  saveLearnings,
  type TextStore,
} from "@houston/domain";
import type { Learning, LearningRefusalCode } from "@houston/protocol";
import { ASSISTANT_AGENT_NAME } from "./assistant";
import { withDocLock } from "./doc-lock";
import {
  archiveReplaced,
  memoryFullError,
  priorConsolidation,
  resolveReplaces,
} from "./learning-replace";

export { ASSISTANT_LEARNINGS_MAX_BYTES } from "@houston/domain";
export { ASSISTANT_LEARNINGS_FULL_MESSAGE } from "./learning-replace";

/** Stable inputs for an idempotent learning append. */
export interface AppendLearningInput {
  id: string;
  text: string;
  nowIso: string;
  taughtBy?: Learning["taught_by"];
  conversationId?: string;
  /**
   * Ids (or unique short-id prefixes) of ACTIVE learnings this one supersedes.
   * They are archived, never deleted (see `Learning.archived_at`).
   */
  replaces?: string[];
  /**
   * True when the caller KNOWS this agent is the coordinator (its role, not
   * its path): a managed pod or a pooled turn names the assistant like any
   * other agent, so the `.assistant` folder name only covers desktop.
   */
  assistant?: boolean;
}

/** Append one validated learning without replacing existing memory. */
export async function appendLearningChecked(
  store: TextStore,
  root: string,
  input: AppendLearningInput,
): Promise<
  { learning: Learning } | { error: string; code?: LearningRefusalCode }
> {
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
    const prior = priorConsolidation(items, input.replaces ?? [], text);
    if (prior) return { learning: prior };
    const replaced = resolveReplaces(items, input.replaces ?? []);
    if ("error" in replaced) return replaced;
    const appended = [
      ...archiveReplaced(items, replaced.ids, learning.id, input.nowIso),
      learning,
    ];
    const capped = input.assistant || isAssistantRoot(root);
    if (capped && overCap(items, appended)) {
      return memoryFullError(items);
    }
    await saveLearnings(store, root, appended);
    return { learning };
  });
}

/**
 * `root` is a vfs KEY (always "/"-separated, both layouts), so the assistant is
 * identified by its last segment — the same synthetic agent name discovery
 * hands out (routes/assistant.ts).
 */
function isAssistantRoot(root: string): boolean {
  return root.split("/").filter(Boolean).at(-1) === ASSISTANT_AGENT_NAME;
}

/**
 * Only ACTIVE memories count (archived ones are never injected), measured on
 * the exact bytes their doc would serialize to. A save that shrinks the active
 * set, a consolidation, is never refused: it is how a full memory makes room,
 * even when someone else's write has pushed it past the cap.
 */
function overCap(before: Learning[], after: Learning[]): boolean {
  const next = learningsDocBytes(activeLearnings(after));
  if (next <= ASSISTANT_LEARNINGS_MAX_BYTES) return false;
  return next >= learningsDocBytes(activeLearnings(before));
}

async function learningMission(
  store: TextStore,
  root: string,
  conversationId: string | undefined,
): Promise<{ mission_id?: string; mission_title?: string }> {
  if (!conversationId) return {};
  try {
    const { items } = await loadActivities(store, root);
    const activity = items.find((item) =>
      addressesMission(item, conversationId),
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
