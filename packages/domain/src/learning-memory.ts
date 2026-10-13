import { isArchivedLearning, type Learning } from "@houston/protocol";
import { jsonDoc } from "./store";

/**
 * Byte ceiling on the PERSONAL ASSISTANT's active memory, and only that one:
 * the assistant injects its whole active memory into every system prompt, so
 * an unbounded list would silently eat the model's context window and
 * eventually break every chat. Archived memories are never injected, so they
 * do not count. Every other agent recalls learnings on demand and stays
 * uncapped.
 */
export const ASSISTANT_LEARNINGS_MAX_BYTES = 12_000;

/** The shortest prefix a memory's short id is ever cut to. */
export const SHORT_LEARNING_ID_MIN = 8;

/** The memories still in force: everything consolidation has not archived. */
export function activeLearnings<T extends Learning>(items: readonly T[]): T[] {
  return items.filter((item) => !isArchivedLearning(item));
}

/** The EXACT byte size `saveLearnings` would write for `items`. */
export function learningsDocBytes(items: readonly Learning[]): number {
  return new TextEncoder().encode(jsonDoc(items)).length;
}

/**
 * Each memory's short id: the shortest prefix (at least
 * {@link SHORT_LEARNING_ID_MIN} characters) no other memory in `items` starts
 * with, else the full id. Pass the ACTIVE memories: these are the codes the
 * agent hands back in `save_learning`'s `replaces`, which resolve among active
 * memories only, so the host and the prompt must cut them identically.
 */
export function shortLearningIds(
  items: readonly Learning[],
): Map<string, string> {
  const ids = items.map((item) => item.id);
  const short = new Map<string, string>();
  for (const id of ids) {
    let chosen = id;
    for (let len = SHORT_LEARNING_ID_MIN; len < id.length; len++) {
      const prefix = id.slice(0, len);
      if (!ids.some((other) => other !== id && other.startsWith(prefix))) {
        chosen = prefix;
        break;
      }
    }
    short.set(id, chosen);
  }
  return short;
}

/**
 * `- [<short id>] <text>` per memory with text, in file order. Whitespace runs
 * (newlines included) collapse to one space, so a memory always renders as ONE
 * line and can never forge another `- [id]` entry or a system line after it.
 */
export function learningListLines(items: readonly Learning[]): string[] {
  const short = shortLearningIds(items);
  return items
    .map((item) => ({
      id: item.id,
      text: item.text.replace(/\s+/g, " ").trim(),
    }))
    .filter((item) => item.text.length > 0)
    .map((item) => `- [${short.get(item.id) ?? item.id}] ${item.text}`);
}
