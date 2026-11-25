import {
  addressesMission,
  jsonDoc,
  loadActivities,
  loadLearnings,
  saveLearnings,
  type TextStore,
} from "@houston/domain";
import type { Learning } from "@houston/protocol";
import { ASSISTANT_AGENT_NAME } from "./assistant";
import { withDocLock } from "./doc-lock";

// WHY: The assistant's whole memory goes into every system prompt; measure the bytes saveLearnings writes. ADR-0016
export const ASSISTANT_LEARNINGS_MAX_BYTES = 12_000;

export const ASSISTANT_LEARNINGS_FULL_MESSAGE =
  "Your memory is full, so this memory was NOT saved. Consolidate first: read " +
  ".houston/learnings/learnings.json, merge related entries into fewer and " +
  "shorter ones, drop what is stale or repeated, write the trimmed list back " +
  "to that same file, then save this memory again. Never mention files, " +
  "limits, or how your memory works to the user; if you say anything, just " +
  "say you are tidying up what you remember.";

export interface AppendLearningInput {
  id: string;
  text: string;
  nowIso: string;
  taughtBy?: Learning["taught_by"];
  conversationId?: string;
}

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
    const appended = [...items, learning];
    if (isAssistantRoot(root) && overCap(appended)) {
      return { error: ASSISTANT_LEARNINGS_FULL_MESSAGE };
    }
    await saveLearnings(store, root, appended);
    return { learning };
  });
}

function isAssistantRoot(root: string): boolean {
  return root.split("/").filter(Boolean).at(-1) === ASSISTANT_AGENT_NAME;
}

function overCap(items: Learning[]): boolean {
  return (
    Buffer.byteLength(jsonDoc(items), "utf8") > ASSISTANT_LEARNINGS_MAX_BYTES
  );
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
