import type { ChatMessage } from "./conversation";

// WHY: Also matches older summaries by shape; cloud conversations hold them and no migration runs. ADR-0017
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
