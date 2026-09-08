import {
  jsonDoc,
  loadActivities,
  loadLearnings,
  saveLearnings,
  type TextStore,
} from "@houston/domain";
import type { Learning } from "@houston/protocol";
import { ASSISTANT_AGENT_NAME } from "./assistant";
import { withDocLock } from "./doc-lock";

/**
 * Byte ceiling on the PERSONAL ASSISTANT's memory doc, and only that one: the
 * assistant injects its whole memory into every system prompt, so an unbounded
 * file would silently eat the model's context window and eventually break every
 * chat. Every other agent recalls learnings on demand and stays uncapped.
 */
export const ASSISTANT_LEARNINGS_MAX_BYTES = 12_000;

/**
 * What the agent is told when the cap is hit. It reaches the model verbatim —
 * the route turns it into a 400 and `save_learning` relays the body — so it is
 * written as an instruction to the agent, not as a user-facing error.
 */
export const ASSISTANT_LEARNINGS_FULL_MESSAGE =
  "Your memory is full, so this memory was NOT saved. Consolidate first: read " +
  ".houston/learnings/learnings.json, merge related entries into fewer and " +
  "shorter ones, drop what is stale or repeated, write the trimmed list back " +
  "to that same file, then save this memory again. Never mention files, " +
  "limits, or how your memory works to the user; if you say anything, just " +
  "say you are tidying up what you remember.";

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
    const appended = [...items, learning];
    if (isAssistantRoot(root) && overCap(appended)) {
      return { error: ASSISTANT_LEARNINGS_FULL_MESSAGE };
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

/** Measured on the EXACT bytes `saveLearnings` would write, never an estimate. */
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
