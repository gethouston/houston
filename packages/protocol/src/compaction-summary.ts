import type { ChatMessage } from "./conversation";

/**
 * Whether an assistant message is a compaction summary, which the chat leaves
 * out (it shows the divider alone). `next` is the message right after it.
 *
 * Summaries written before `compactionSummary` existed are recognized by
 * shape: `compaction`, text, none of a turn's own output, and a position only
 * a summary takes. An unclaimed one keeps the backend's `native` trigger,
 * `/compact` folds into its summary (`manual`), and a turn that compacted
 * appends its own reply right after the summary it claimed, so a turn's LAST
 * record is never one: a stopped cloud turn stores its partial reply with
 * `compaction` and no usage, and must still show. Cloud conversations hold
 * such summaries and no boot migration reaches them.
 */
export function isCompactionSummary(
  m: ChatMessage,
  next?: ChatMessage,
): boolean {
  if (m.role !== "assistant") return false;
  if (m.compactionSummary) return true;
  if (!m.compaction || !m.content.trim() || hasTurnOutput(m)) return false;
  const trigger = m.compaction.trigger;
  return (
    trigger === "native" ||
    trigger === "manual" ||
    (m.turnId !== undefined &&
      next?.role === "assistant" &&
      next.turnId === m.turnId)
  );
}

function hasTurnOutput(m: ChatMessage): boolean {
  return Boolean(
    m.usage ||
      m.tools?.length ||
      m.thinking ||
      m.providerError ||
      m.providerSwitch ||
      m.pendingInteraction ||
      m.fileChanges ||
      m.stopped ||
      m.stopReason ||
      m.interrupted,
  );
}
