import type { ChatMessage } from "./conversation";

/**
 * Whether an assistant message is a compaction summary, which the chat leaves
 * out (it shows the divider alone).
 *
 * Summaries written before `compactionSummary` existed are recognized by
 * shape: a message carrying `compaction` with none of a turn's own output.
 * The turn that compacts appends its reply, failure, stop or question as a
 * separate message, so the summary is left with its text alone. A reply that
 * compacted first (pi) always carries the turn's usage. Cloud conversations
 * hold such summaries and no boot migration reaches them.
 */
export function isCompactionSummary(m: ChatMessage): boolean {
  if (m.role !== "assistant") return false;
  if (m.compactionSummary) return true;
  return (
    m.compaction !== undefined &&
    m.content.trim() !== "" &&
    !m.usage &&
    !m.tools?.length &&
    !m.thinking &&
    !m.providerError &&
    !m.providerSwitch &&
    !m.pendingInteraction &&
    !m.fileChanges &&
    !m.stopped &&
    !m.interrupted
  );
}
